// RoadmapNode — the m2.5c composition root. Walks the per-entity
// Renderable nodes (ItemNode via sequenceItem, SwimlaneNode, ParallelNode
// via sequenceOne, AnchorNode/MilestoneNode via build*, footnote/include
// helpers) to produce the final `PositionedRoadmap` model.
//
// RoadmapNode does NOT import the sequencer helpers or the orchestration
// helpers (`computeDateWindow`, `sizeBesideHeader`, `collectItems`,
// `buildDependencies`, `buildNowline`) at module-init time. They live in
// `layout.ts` and are passed in via the `deps` argument. This avoids a
// runtime cycle while keeping the composition logic in a dedicated file.

import type {
    NowlineFile,
    ResolveResult,
    ItemDeclaration,
    GroupBlock,
    ParallelBlock,
    SwimlaneDeclaration,
    EntityProperty,
} from '@nowline/core';
import type {
    PositionedRoadmap,
    PositionedHeader,
    PositionedSwimlane,
    PositionedIncludeRegion,
    PositionedDependencyEdge,
    PositionedNowline,
    PositionedTimelineScale,
    BoundingBox,
    SlackCorridor,
    MarkerRowPlacement,
} from '../types.js';
import type { LayoutContext, TrackCursor, LayoutHelpers } from '../layout-context.js';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import type { ViewPreset } from '../view-preset.js';
import type { CalendarConfig } from '../calendar.js';
import { themes, type Theme, type ThemeName } from '../themes/index.js';
import { resolveStyle, type StyleContext } from '../style-resolution.js';
import { resolveCalendar, daysBetween, resolveSizes } from '../calendar.js';
import { resolveScale, buildHeaderTicks } from '../view-preset.js';
import { resolveLocale } from '../i18n.js';
import { TimeScale } from '../time-scale.js';
import { fromCalendarConfig } from '../working-calendar.js';
import { defaultRowBand } from '../band-scale.js';
import {
    HEADER_ABOVE_HEIGHT_PX,
    SPACING_PX,
    GUTTER_PX,
    ATTRIBUTION_GLYPH_WIDTH,
    ATTRIBUTION_GLYPH_HEIGHT,
    TIMELINE_TICK_PANEL_HEIGHT_PX,
    NOW_PILL_HEIGHT_PX,
} from '../themes/shared.js';
import {
    MARKER_LABEL_GAP_PX,
    MARKER_LABEL_HEIGHT_PX,
    MARKER_BOLD_WIDTH_FACTOR,
    MARKER_DIAMOND_RADIUS_PX,
    MARKER_ROW_PITCH_PX,
    MARKER_ROW_CENTER_OFFSET_PX,
} from './marker-geometry.js';
import { propValue, propValues, parseDate } from '../dsl-utils.js';
import { SwimlaneNode } from './swimlane-node.js';
import { buildAnchors } from './anchor-node.js';
import {
    buildMilestones,
    collectMilestonePredecessors,
    lastPredecessorPerFlow,
} from './milestone-node.js';
import { buildFootnotes } from './footnote-node.js';
import { buildIncludeRegions } from './include-node.js';

const HEADER_CARD_TOP_INSET = 4;

/**
 * Single mutator for the chart's right-edge extent. Every layout
 * artifact that wants to push the canvas wider passes the absolute X
 * it wants the canvas to contain, with any breathing-room margin
 * (typically `GUTTER_PX`) baked in. Concentrating growth here makes
 * it trivial to grep for every contributor — today: item caption
 * spills; future: anchor/milestone label spills, footnote panels
 * wider than the chart, etc.
 *
 * Initial seed lives at the start of `place(...)` (the natural date
 * window with `GUTTER_PX` insets on each side); everything that
 * becomes known after the swimlane pass calls through here.
 *
 * The now-pill is intentionally NOT a contributor — when the line
 * lands close to either edge, `buildNowline` switches the pill to
 * "flag" mode (squared edge against the line, rounded edge into the
 * chart), so the pill always fits inside the natural canvas.
 */
function growChartRightX(ctx: LayoutContext, rightX: number): void {
    if (rightX > ctx.chartRightX) ctx.chartRightX = rightX;
}

/** Sized output from the beside-mode header word-wrap pass. */
export interface SizedHeader {
    titleLines: string[];
    authorLines: string[];
    cardWidth: number;
    cardHeight: number;
    boxWidth: number;
}

/**
 * Bundle of orchestration + sequencer helpers RoadmapNode delegates to.
 * `layout.ts` builds this struct from its private helpers and passes it
 * once when calling `RoadmapNode.place(...)`.
 */
export interface RoadmapNodeDeps extends LayoutHelpers {
    computeDateWindow: (
        file: NowlineFile,
        ctx: { cal: CalendarConfig; sizes: Map<string, import('../types.js').ResolvedSize> },
        resolved: ResolveResult,
        today: Date | undefined,
        scale: ViewPreset,
    ) => { startDate: Date; endDate: Date };
    sizeBesideHeader: (title: string, author: string | undefined) => SizedHeader;
    collectItems: (swimlanes: SwimlaneDeclaration[]) => Map<string, ItemDeclaration>;
    buildDependencies: (
        items: Map<string, ItemDeclaration>,
        swimlanes: PositionedSwimlane[],
        includes: PositionedIncludeRegion[],
        ctx: LayoutContext,
    ) => PositionedDependencyEdge[];
    buildNowline: (today: Date | undefined, ctx: LayoutContext, locale: string) => PositionedNowline | null;
}

export class RoadmapNode {
    place(
        file: NowlineFile,
        resolved: ResolveResult,
        options: LayoutOptions,
        deps: RoadmapNodeDeps,
    ): LayoutResult {
        const themeName: ThemeName = options.theme ?? 'light';
        const theme: Theme = themes[themeName];
        const width = options.width ?? 1280;
        const locale = resolveLocale(options.locale, directiveLocale(file));

        const cal = resolveCalendar(file, resolved.config.calendar);
        const scale = resolveScale(file, resolved.config.scale);
        // Build the resolved-size map once per layout. Sized items look up
        // through this map (instead of the raw `SizeDeclaration`s the
        // include-resolver collected) so item sequencing doesn't pay the
        // literal-to-days conversion every time.
        const sizes = resolveSizes(resolved.content.sizes, cal);

        const styleCtx: StyleContext = {
            theme,
            styles: resolved.config.styles,
            defaults: resolved.config.defaults,
            labels: resolved.content.labels,
        };

        // Date window + header geometry. Window is content-aware: when
        // `length:` is omitted we derive the end day from the latest
        // dated/sequenced entity (item, anchor, milestone, today's
        // now-line) instead of defaulting to a 180-day desert.
        const { startDate, endDate } = deps.computeDateWindow(
            file,
            { cal, sizes },
            resolved,
            options.today,
            scale,
        );

        // Determine header position + timeline placement via `default roadmap`
        // / theme. Raw style props (including `timeline-position` and
        // `minor-grid`) are banned on the roadmap declaration itself, so the
        // values come from the level-2 `default roadmap` line in config.
        const headerStyle = resolveStyle('roadmap', file.roadmapDecl?.properties ?? [], styleCtx);
        const isBeside = headerStyle.headerPosition === 'beside';
        // `top` (default) keeps the legacy single-strip header; `bottom`
        // suppresses the top tick panel (now-pill and marker row stay
        // at the top because anchors / milestones live there); `both`
        // mirrors the strip at the chart bottom too. See specs/dsl.md
        // and specs/rendering.md § Timeline Scale.
        const showTopTickPanel = headerStyle.timelinePosition !== 'bottom';
        const showBottomTickPanel =
            headerStyle.timelinePosition === 'bottom'
            || headerStyle.timelinePosition === 'both';

        // Pre-size the beside-mode header card. Width = max line width +
        // padding, clamped to MIN..MAX with word-wrap once the title
        // exceeds MAX. Above-mode keeps the existing fixed-strip
        // geometry (full canvas width, fixed height).
        const titleStr = file.roadmapDecl?.title ?? file.roadmapDecl?.name ?? '';
        const authorStr = propValue(file.roadmapDecl?.properties ?? [], 'author');
        const sizedHeader = deps.sizeBesideHeader(titleStr, authorStr);

        const headerBox = isBeside
            ? { x: 0, y: 0, width: sizedHeader.boxWidth, height: 0 }
            : { x: 0, y: 0, width: 0, height: HEADER_ABOVE_HEIGHT_PX };

        const chartLeftX = isBeside ? sizedHeader.boxWidth : 0;
        const chartTopY = isBeside ? 8 : HEADER_ABOVE_HEIGHT_PX + 8;

        // `options.width` is treated as a *maximum* canvas width. The
        // chart sizes to natural content width (date window × ppd) plus
        // chrome padding, capped at the max — no floor. The two
        // `GUTTER_PX` insets keep the header card and attribution
        // wordmark from butting against the canvas edges.
        const calendar = fromCalendarConfig(cal);
        const ppd = scale.pixelsPerUnit / calendar.daysPerUnit(scale.unit);
        const spanDays = Math.max(1, daysBetween(startDate, endDate));
        const naturalWidth = spanDays * ppd;
        const originX = chartLeftX + GUTTER_PX;
        const totalChartWidth = naturalWidth;
        const desiredCanvas = chartLeftX + GUTTER_PX + totalChartWidth + GUTTER_PX;
        const chartRightX = Math.min(width, desiredCanvas);

        // Header layout (top → bottom):
        //   1. Now-pill row    (16 px) — only when there's a now-line
        //   2. Tick-label panel (24 px) — always
        //   3. Marker row       (≥26 px) — sized to the packed row count
        //   4. 8 px gap, then the chart begins
        const willHaveNowline =
            options.today !== undefined && options.today >= startDate && options.today <= endDate;
        const hasMarkerEntities =
            resolved.content.anchors.size + resolved.content.milestones.size > 0;
        const pillRowHeight = willHaveNowline ? NOW_PILL_HEIGHT_PX : 0;
        // When `timeline-position:bottom` is set, the top tick panel
        // collapses to height 0 — the now-pill and marker row stack
        // directly without the date strip between them.
        const tickPanelHeight = showTopTickPanel ? TIMELINE_TICK_PANEL_HEIGHT_PX : 0;

        // Build the time scale up front — packMarkerRow needs it to
        // resolve date-pinned entity x positions before we can size the
        // marker row band.
        const timeScale = new TimeScale({
            domain: [startDate, endDate],
            range: [originX, originX + naturalWidth],
            calendar,
        });
        // Initial canvas extent = natural date window + canonical
        // gutters. Item caption spills are unknown until the swimlane
        // pass runs and grow the canvas via `growChartRightX`. The
        // now-pill doesn't contribute here — `buildNowline` flips it to
        // flag mode whenever a centered pill would clip an edge.
        const finalChartRightX = Math.max(chartRightX, originX + totalChartWidth + GUTTER_PX);

        // Resolve each date-pinned anchor and milestone's x. Used both for
        // the marker-row pack and for `after:` resolution downstream — an
        // item with `after:kickoff` would otherwise see an empty
        // entityRightEdges entry and silently fall through to `cursor.x`
        // (= the chart origin). After-only milestones still resolve later
        // once their predecessors are known.
        const datePinnedEntries: Array<MarkerEntity & { date: Date; isMilestone: boolean }> = [];
        for (const [id, anchor] of resolved.content.anchors) {
            const date = parseDate(propValue(anchor.properties, 'date'));
            if (!date) continue;
            const x = timeScale.forwardWithinDomain(date);
            if (x === null) continue;
            datePinnedEntries.push({
                id,
                centerX: x,
                radius: MARKER_DIAMOND_RADIUS_PX,
                title: anchor.title ?? id,
                fontSize: 10,
                bold: false,
                date,
                isMilestone: false,
            });
        }
        for (const [id, milestone] of resolved.content.milestones) {
            const date = parseDate(propValue(milestone.properties, 'date'));
            if (!date) continue;
            const x = timeScale.forwardWithinDomain(date);
            if (x === null) continue;
            datePinnedEntries.push({
                id,
                centerX: x,
                radius: MARKER_DIAMOND_RADIUS_PX,
                title: milestone.title ?? id,
                fontSize: 10,
                bold: true,
                date,
                isMilestone: true,
            });
        }

        // Pack the date-pinned markers. Each entity gets a row index
        // (0 = in-row baseline, 1 = bumped down by one step, …) and a
        // label box that may be flipped to the LEFT side when the natural
        // right-side label would overflow `finalChartRightX`. Earlier
        // entries claim row 0; later ones drop to row 1+ when their
        // bounding box (diamond + label) overlaps an already-placed
        // entry. The renderer reads `labelBox.x/y` directly.
        const packed = packMarkerRow(datePinnedEntries, chartLeftX, finalChartRightX, deps.estimateTextWidth);
        const markerRowsCount = hasMarkerEntities ? Math.max(1, packed.rowCount) : 0;
        const markerRowHeight = markerRowsCount * MARKER_ROW_PITCH_PX;
        const headerRowsHeight = pillRowHeight + tickPanelHeight + markerRowHeight;
        const timelineHeightBudget = headerRowsHeight + 8;
        // In beside-mode the header card's BOTTOM aligns with the bottom
        // of the header rows so it visually anchors to the chart's top.
        // When the card is taller than the natural rows + a 4 px top
        // inset, push the timeline down so the card has room without
        // clipping above the canvas.
        const minHeaderRowsBottomForCard = isBeside
            ? sizedHeader.cardHeight + HEADER_CARD_TOP_INSET
            : 0;
        const timelineY = Math.max(chartTopY, minHeaderRowsBottomForCard - headerRowsHeight);
        const tickPanelY = timelineY + pillRowHeight;
        const markerRowY = tickPanelY + tickPanelHeight;
        const headerRowsBottomY = markerRowY + markerRowHeight;

        const ticks = buildHeaderTicks(timeScale, scale, calendar, locale);
        const timeline: PositionedTimelineScale = {
            box: { x: originX, y: timelineY, width: naturalWidth, height: 0 },
            ticks,
            pixelsPerDay: ppd,
            originX,
            startDate,
            endDate,
            labelStyle: resolveStyle('roadmap', [], styleCtx),
            pillRowHeight,
            tickPanelY,
            tickPanelHeight,
            markerRow: {
                y: markerRowY + MARKER_ROW_CENTER_OFFSET_PX,
                height: markerRowHeight,
                collisionY: markerRowY - 8,
            },
            // `bottomTickPanelY` / `bottomTickPanelHeight` are filled in
            // AFTER swimlanes + includes are placed (and after the marker
            // re-pack potentially grows the chart), so the panel sits
            // directly above the footnote area.
            minorGrid: headerStyle.minorGrid,
        };

        // Stitch packed placements together with their final centerY now
        // that markerRowY is known. AnchorNode + MilestoneNode read this
        // map to recover both Y and the resolved label box; after-only
        // milestones (not pre-positioned here) pack against this map at
        // build time so they slot into the same rows where there's room.
        const markerRowPlacements = new Map<string, MarkerRowPlacement>();
        for (const [id, p] of packed.placements) {
            const centerY = markerRowY + MARKER_ROW_CENTER_OFFSET_PX + p.rowIndex * MARKER_ROW_PITCH_PX;
            markerRowPlacements.set(id, {
                rowIndex: p.rowIndex,
                centerY,
                labelBox: { ...p.labelBox, y: centerY - 4 },
                labelSide: p.labelSide,
            });
        }

        const ctx: LayoutContext = {
            cal,
            styleCtx,
            sizes,
            labels: resolved.content.labels,
            teams: resolved.content.teams,
            persons: resolved.content.persons,
            glyphs: resolved.config.glyphs,
            footnoteIndex: new Map(),
            footnoteHosts: new Map(),
            timeline,
            scale: timeScale,
            calendar,
            bandScale: defaultRowBand(),
            entityLeftEdges: new Map(),
            entityRightEdges: new Map(),
            entityMidpoints: new Map(),
            entityVisualLeftX: new Map(),
            entityVisualRightX: new Map(),
            itemArrowSource: new Map(),
            itemFlowKey: new Map(),
            currentFlowKey: '',
            itemSlackAttachY: new Map(),
            slackCorridors: [],
            markerRowPlacements,
            chartTopY: timelineY + timelineHeightBudget,
            chartBottomY: 0,
            swimlaneBottomY: 0,
            chartRightX: finalChartRightX,
        };

        // Seed the entity-edge maps from the date-pinned pack so item
        // `after:kickoff` references resolve before swimlanes run. Mid
        // points use the row-aware centerY so dependency arrows from the
        // anchor land on the diamond's actual row.
        for (const e of datePinnedEntries) {
            const placement = markerRowPlacements.get(e.id);
            if (!placement) continue;
            ctx.entityLeftEdges.set(e.id, e.centerX);
            ctx.entityRightEdges.set(e.id, e.centerX);
            ctx.entityMidpoints.set(e.id, { x: e.centerX, y: placement.centerY });
        }

        // Footnotes index must be built before sequencing items reference
        // them.
        const pre = buildFootnotes(resolved.content.footnotes, ctx, 0);
        ctx.footnoteIndex = pre.index;
        ctx.footnoteHosts = pre.hosts;

        // Snapshot the entity maps after pre-positioning so we can reset
        // them between the two swimlane passes. Date-pinned anchors and
        // milestones live in this baseline; item-derived entries get
        // re-added on each pass.
        const baselineEntityLeft = new Map(ctx.entityLeftEdges);
        const baselineEntityRight = new Map(ctx.entityRightEdges);
        const baselineEntityMid = new Map(ctx.entityMidpoints);
        // Item-only maps don't carry baseline entries (date-pinned
        // markers don't populate visual edges or arrow sources), so
        // pass-2 reruns reset them to fresh empties.

        // Build swimlanes (declared order). Inter-band gap comes from
        // the swimlane default style's `spacing` bucket. Default
        // `spacing: none` keeps existing samples byte-stable; bumping to
        // `md` introduces an 8 px gap.
        const laneEntries = [...resolved.content.swimlanes.values()];
        const swimlaneDefaultStyle = resolveStyle('swimlane', [], styleCtx);
        const interBandGapPx =
            SPACING_PX[swimlaneDefaultStyle.spacing as keyof typeof SPACING_PX] ?? 0;

        const runSwimlaneLoop = (): { swimlanes: PositionedSwimlane[]; nextY: number; maxRightX: number } => {
            const out: PositionedSwimlane[] = [];
            let cursorY = ctx.chartTopY;
            let bIndex = 0;
            let maxRightX = ctx.timeline.originX;
            for (const lane of laneEntries) {
                if (bIndex > 0) cursorY += interBandGapPx;
                const { positioned, usedHeight, usedRightX } = new SwimlaneNode(
                    { lane, bandIndex: bIndex },
                    deps,
                ).place({ x: ctx.timeline.originX, y: cursorY }, ctx);
                out.push(positioned);
                cursorY += usedHeight;
                if (usedRightX > maxRightX) maxRightX = usedRightX;
                bIndex++;
            }
            return { swimlanes: out, nextY: cursorY, maxRightX };
        };

        // Pass 1 — place items without corridor knowledge.
        let pass = runSwimlaneLoop();
        let swimlanes = pass.swimlanes;
        let y = pass.nextY;

        // Collect slack-arrow corridors from the milestones (mirrors
        // MilestoneNode.place's pred resolution). When the result is
        // non-empty, an item sat inside an arrow's path on pass 1 — rerun
        // the swimlane loop with corridors known so the row-packer can
        // bump the offending items down to a clear row. Bumping never
        // changes an item's x, so corridors stay valid across the rerun;
        // no fixed-point iteration needed.
        const corridors = collectSlackCorridors(resolved.content.milestones, ctx);
        if (corridors.length > 0) {
            ctx.entityLeftEdges = new Map(baselineEntityLeft);
            ctx.entityRightEdges = new Map(baselineEntityRight);
            ctx.entityMidpoints = new Map(baselineEntityMid);
            // itemSlackAttachY only ever holds item entries (markers
            // never write to it), so a fresh map is the right reset —
            // pass 2's items will repopulate. Same applies to the
            // visual-edge / arrow-source / flow-key maps below.
            ctx.itemSlackAttachY = new Map();
            ctx.entityVisualLeftX = new Map();
            ctx.entityVisualRightX = new Map();
            ctx.itemArrowSource = new Map();
            ctx.itemFlowKey = new Map();
            ctx.currentFlowKey = '';
            ctx.slackCorridors = corridors;
            pass = runSwimlaneLoop();
            swimlanes = pass.swimlanes;
            y = pass.nextY;
        }

        // Expand the canvas to fit any caption that spilled past its bar
        // (`textSpills`). Otherwise the long captions on narrow charts —
        // e.g. `examples/minimal.svg` and `tests/text-spills-right.svg`
        // — would land outside the SVG's viewBox and clip in browsers.
        // Markers/anchors built below see the expanded width and pick a
        // less aggressive label side. Routed through `growChartRightX`
        // so this contribution sits beside the now-pill reservation
        // (made at init) in the canvas-extent ledger.
        growChartRightX(ctx, pass.maxRightX + GUTTER_PX);

        // Each swimlane band reads the canvas width once during its
        // place pass, before the spill expansion above. Re-stretch every
        // band so the lane background contains its own spilled captions
        // (text-spills-right's "1w — 50% remaining" extends 22 px past
        // the unstretched lane edge otherwise).
        for (const lane of swimlanes) {
            lane.box.width = ctx.chartRightX;
        }

        // Include regions under the swimlanes. Reserve the 8 px gap +
        // tab-reserve only when there's at least one isolated region —
        // otherwise the now-line and chart bottom would extend past the
        // last swimlane into empty space.
        const isolated = resolved.content.isolatedRegions;
        let includes: PositionedIncludeRegion[] = [];
        if (isolated.length > 0) {
            const r = buildIncludeRegions(isolated, ctx, y + 8, deps);
            includes = r.regions;
            y = r.endY;
        }

        ctx.chartBottomY = y;
        ctx.swimlaneBottomY = y;
        timeline.box.height = ctx.chartBottomY - timeline.box.y;

        // Milestones first so anchors know which xs are occupied (for
        // collision bumps). Date-pinned milestones consult the
        // pre-pack; after-only milestones get a provisional row=0
        // placement which the re-pack below overwrites once their
        // centerX is known.
        const milestones = buildMilestones(resolved.content.milestones, ctx);

        // Unified marker re-pack. Every marker (date-pinned anchor,
        // date-pinned milestone, after-only milestone) participates
        // with its final centerX — so packMarkerRow can sort by tick
        // and assign rows + label sides bottom-first. This is the
        // single source of truth for `ctx.markerRowPlacements`; the
        // pre-pack only existed to size the marker band before
        // swimlanes ran.
        const allMarkerEntries: MarkerEntity[] = datePinnedEntries.map((e) => ({
            id: e.id,
            centerX: e.centerX,
            radius: e.radius,
            title: e.title,
            fontSize: e.fontSize,
            bold: e.bold,
        }));
        for (const m of milestones) {
            if (m.fixed) continue;
            allMarkerEntries.push({
                id: m.id ?? '',
                centerX: m.center.x,
                radius: m.radius,
                title: m.title,
                fontSize: 10,
                bold: true,
            });
        }
        const repacked = packMarkerRow(
            allMarkerEntries,
            chartLeftX,
            ctx.chartRightX,
            deps.estimateTextWidth,
        );

        ctx.markerRowPlacements.clear();
        for (const [id, p] of repacked.placements) {
            const centerY = markerRowY + MARKER_ROW_CENTER_OFFSET_PX + p.rowIndex * MARKER_ROW_PITCH_PX;
            ctx.markerRowPlacements.set(id, {
                rowIndex: p.rowIndex,
                centerY,
                labelBox: { ...p.labelBox, y: centerY - 4 },
                labelSide: p.labelSide,
            });
        }

        // Push final placements back onto already-built milestones and
        // every marker's entityMidpoints entry (used by edge routing
        // and slack-arrow geometry).
        for (const m of milestones) {
            const placement = ctx.markerRowPlacements.get(m.id ?? '');
            if (!placement) continue;
            m.center = { x: m.center.x, y: placement.centerY };
            m.labelBox = placement.labelBox;
            m.labelSide = placement.labelSide;
        }
        for (const e of datePinnedEntries) {
            const p = ctx.markerRowPlacements.get(e.id);
            if (!p) continue;
            ctx.entityMidpoints.set(e.id, { x: e.centerX, y: p.centerY });
        }
        for (const m of milestones) {
            if (m.fixed) continue;
            ctx.entityMidpoints.set(m.id ?? '', { x: m.center.x, y: m.center.y });
        }

        // If the unified pack needs more rows than we sized for, grow
        // the marker band and translate every chart coordinate below
        // it. Anchors, edges, nowline, footnotes, and the attribution
        // mark are built AFTER this block so they pick up the new ctx
        // values without further work.
        const actualRowCount = hasMarkerEntities ? Math.max(1, repacked.rowCount) : 0;
        if (actualRowCount > markerRowsCount) {
            const deltaY = (actualRowCount - markerRowsCount) * MARKER_ROW_PITCH_PX;
            ctx.timeline.markerRow.height = actualRowCount * MARKER_ROW_PITCH_PX;
            ctx.timeline.box.height += deltaY;
            ctx.chartTopY += deltaY;
            ctx.chartBottomY += deltaY;
            ctx.swimlaneBottomY += deltaY;
            for (const lane of swimlanes) shiftSwimlaneY(lane, deltaY);
            for (const inc of includes) shiftIncludeY(inc, deltaY);
            // Item entityMidpoints were captured during swimlane
            // place; markers live in markerRowPlacements with their
            // own centerY that's already final.
            for (const [id, m] of ctx.entityMidpoints) {
                if (ctx.markerRowPlacements.has(id)) continue;
                ctx.entityMidpoints.set(id, { x: m.x, y: m.y + deltaY });
            }
            // itemSlackAttachY was sampled at the same pre-shift Y as
            // the entity midpoints — keep the two in sync.
            for (const [id, y] of ctx.itemSlackAttachY) {
                ctx.itemSlackAttachY.set(id, y + deltaY);
            }
            for (const m of milestones) {
                m.cutTopY = ctx.chartTopY;
                m.cutBottomY = ctx.swimlaneBottomY;
                // Slack arrows were baked with the pre-shift attach Y
                // when buildMilestones ran above. Shift them now so
                // they land on the same row band as the (now-shifted)
                // predecessor bar.
                if (m.slackArrows) {
                    for (const arrow of m.slackArrows) arrow.y += deltaY;
                }
            }
        }

        // Insert the mirrored bottom tick panel directly above the
        // footnote area, BELOW the chart's last swimlane / include
        // region. Done AFTER any marker-row-growth shift so the panel
        // y honors the final chartBottomY. `timeline.box.height` stays
        // anchored to the chart's bottom edge — grid lines therefore
        // stop at the panel's TOP, not at its bottom — while the panel
        // gets its own fill / border / labels in the renderer. Milestone
        // and anchor cut-lines stay anchored to `swimlaneBottomY` so
        // they never invade the bottom date strip; only the now-line
        // (and full-height major grid lines) thread through this panel.
        if (showBottomTickPanel) {
            const gapAbovePanel = 8;
            ctx.timeline.bottomTickPanelY = ctx.chartBottomY + gapAbovePanel;
            ctx.timeline.bottomTickPanelHeight = TIMELINE_TICK_PANEL_HEIGHT_PX;
            ctx.chartBottomY += gapAbovePanel + TIMELINE_TICK_PANEL_HEIGHT_PX;
        }

        const milestoneXs = new Set<number>(milestones.map((m) => m.center.x));
        const anchors = buildAnchors(resolved.content.anchors, ctx, milestoneXs);
        const itemsMap = deps.collectItems(laneEntries);
        const edges = deps.buildDependencies(itemsMap, swimlanes, includes, ctx);

        // Now-line (if today is within the window). Stops at the bottom
        // timeline panel when present, otherwise at the last swimlane —
        // see `buildNowline`. Footnote panels below do not extend it.
        const nowline = deps.buildNowline(options.today, ctx, locale);

        // Finalize footnotes at the bottom.
        const foot = buildFootnotes(resolved.content.footnotes, ctx, ctx.chartBottomY);
        ctx.footnoteIndex = foot.index;
        ctx.footnoteHosts = foot.hosts;

        // Header (depends on chart height in beside-mode and on the
        // final canvas width in above-mode).
        headerBox.height = headerBox.height || ctx.chartBottomY;
        if (!isBeside) headerBox.width = ctx.chartRightX;
        // Card sub-box for beside-mode (the visible white panel inside
        // headerBox). Card BOTTOM hugs the bottom of the header rows so
        // the title block visually anchors to the chart's top edge
        // regardless of which header rows are present. timelineY was
        // already nudged down above to guarantee the card has at least
        // HEADER_CARD_TOP_INSET clearance from the canvas top.
        const cardBox: BoundingBox = isBeside
            ? {
                x: 6,
                y: headerRowsBottomY - sizedHeader.cardHeight,
                width: sizedHeader.cardWidth,
                height: sizedHeader.cardHeight,
            }
            : { x: 0, y: 0, width: ctx.chartRightX, height: HEADER_ABOVE_HEIGHT_PX };

        // Attribution wordmark placement. Canvas grows by GUTTER_PX +
        // glyph height + GUTTER_PX so the wordmark sits in a clean bottom
        // margin below all content (last swimlane / footnote panel /
        // include region). Today only the bottom-right slot fires, but
        // the priority order is bottom-right → upper-right → bottom-left
        // — when content density makes bottom-right disruptive in some
        // future case, fall back to upper-right (above the timeline) and
        // then bottom-left (under the header card in beside-mode).
        //
        // When there are no footnotes, `foot.area.box` still carries a 16 px
        // top-of-panel offset; that's a placeholder for the footnote
        // header gap and shouldn't push the attribution down. Use the
        // bare `chartBottomY` in that case so the bottom margin is
        // exactly `GUTTER_PX + glyphHeight + GUTTER_PX`.
        const contentBottomY = foot.area.entries.length > 0
            ? foot.area.box.y + foot.area.box.height
            : ctx.chartBottomY;
        const attributionBox: BoundingBox = {
            x: ctx.chartRightX - GUTTER_PX - ATTRIBUTION_GLYPH_WIDTH,
            y: contentBottomY + GUTTER_PX,
            width: ATTRIBUTION_GLYPH_WIDTH,
            height: ATTRIBUTION_GLYPH_HEIGHT,
        };
        const height = attributionBox.y + attributionBox.height + GUTTER_PX;

        const header: PositionedHeader = {
            box: headerBox,
            position: headerStyle.headerPosition,
            title: titleStr,
            author: authorStr,
            titleLines: sizedHeader.titleLines,
            authorLines: sizedHeader.authorLines,
            cardBox,
            logo: undefined,
            style: headerStyle,
            attributionBox,
        };

        const model: PositionedRoadmap = {
            width: ctx.chartRightX,
            height,
            theme: themeName,
            palette: theme,
            backgroundColor: theme.surface.page,
            header,
            timeline,
            nowline,
            swimlanes,
            anchors,
            milestones,
            edges,
            footnotes: foot.area,
            includes,
            chartBox: {
                x: chartLeftX,
                y: ctx.chartTopY,
                width: ctx.chartRightX - chartLeftX,
                height: ctx.chartBottomY - ctx.chartTopY,
            },
        };
        return model;
    }
}

/**
 * Collect slack-arrow corridors from the resolved milestones using the
 * current entity-edge maps. The result mirrors what
 * `MilestoneNode.place` would emit on `slackArrows`, so the row-packer
 * and the renderer agree on every arrow's geometry.
 *
 * Each non-binding predecessor (`x < maxEnd`, `y > 0`) becomes one
 * corridor; date-pinned milestones whose latest predecessor overruns
 * the date contribute a single back-pointing corridor between the
 * pinned column and the predecessor's right edge.
 */
function collectSlackCorridors(
    milestones: Map<string, import('@nowline/core').MilestoneDeclaration>,
    ctx: LayoutContext,
): SlackCorridor[] {
    const out: SlackCorridor[] = [];
    for (const [id, m] of milestones) {
        const dateRaw = propValue(m.properties, 'date');
        const afterRaw = propValues(m.properties, 'after');
        const date = parseDate(dateRaw);
        // Reuse MilestoneNode's helpers so the corridor set agrees
        // exactly with the rendered slack-arrow set: same source x
        // (visual edge for items / cut-line for markers), same
        // attach y, and the same flow-dedupe rule that collapses
        // chained predecessors to one arrow per flow.
        const preds = collectMilestonePredecessors(afterRaw, ctx);
        const dedupedPreds = lastPredecessorPerFlow(preds);

        if (date) {
            const milestoneX = ctx.scale.forwardWithinDomain(date);
            if (milestoneX === null) continue;
            let maxPred = null as ReturnType<typeof collectMilestonePredecessors>[number] | null;
            for (const p of dedupedPreds) {
                if (!maxPred || p.x > maxPred.x) maxPred = p;
            }
            if (maxPred && maxPred.x > milestoneX && maxPred.y > 0) {
                out.push({
                    xStart: Math.min(maxPred.x, milestoneX),
                    xEnd: Math.max(maxPred.x, milestoneX),
                    y: maxPred.y,
                    slackPredId: maxPred.ref,
                    milestoneId: id,
                });
            }
            continue;
        }
        if (dedupedPreds.length === 0) continue;
        dedupedPreds.sort((a, b) => b.x - a.x);
        const maxEnd = dedupedPreds[0].x;
        for (let i = 1; i < dedupedPreds.length; i++) {
            const p = dedupedPreds[i];
            if (p.x < maxEnd && p.y > 0) {
                out.push({
                    xStart: p.x,
                    xEnd: maxEnd,
                    y: p.y,
                    slackPredId: p.ref,
                    milestoneId: id,
                });
            }
        }
    }
    return out;
}

interface MarkerEntity {
    id: string;
    centerX: number;
    radius: number;
    title: string;
    fontSize: number;
    bold: boolean;
}

interface PackedPlacement {
    rowIndex: number;
    labelBox: BoundingBox;
    labelSide: 'left' | 'right';
}

/**
 * Translate every Y coordinate inside a swimlane subtree by `dy`. Used
 * when the marker band has to grow after items are already placed —
 * the shift cascades from the swimlane box through every track child,
 * including parallels and groups (which are recursive `children`).
 */
function shiftSwimlaneY(lane: import('../types.js').PositionedSwimlane, dy: number): void {
    lane.box.y += dy;
    for (const child of lane.children) shiftTrackChildY(child, dy);
    for (const nested of lane.nested) shiftSwimlaneY(nested, dy);
}

function shiftTrackChildY(child: import('../types.js').PositionedTrackChild, dy: number): void {
    child.box.y += dy;
    if (child.kind === 'item') {
        if (child.overflowBox) child.overflowBox.y += dy;
        for (const chip of child.labelChips) chip.box.y += dy;
        return;
    }
    for (const c of child.children) shiftTrackChildY(c, dy);
}

function shiftIncludeY(region: import('../types.js').PositionedIncludeRegion, dy: number): void {
    region.box.y += dy;
    for (const lane of region.nestedSwimlanes) shiftSwimlaneY(lane, dy);
}

/**
 * Pack anchors + milestones into marker rows using a bottom-first
 * tick-order strategy. Markers default to the row CLOSEST to the
 * chart; conflicts push them UP toward the date ticks (the inverse of
 * swimlane items which default to the top and push down).
 *
 * Walk order is left-to-right by `centerX` (tick order, not file
 * declaration). For each marker:
 *   1. Try the bottommost existing row (highest `rowIndex`), right
 *      side first then left, working UP through the rows.
 *   2. If neither side fits at any existing row, GROW: prepend a new
 *      row at `rowIndex = 0`. Every previously-placed marker has its
 *      `rowIndex` incremented by 1 so the bottom corridor stays
 *      stable as the band expands upward toward the ticks.
 *
 * Returns row-relative placements (no centerY yet — caller fills that
 * in once `markerRowY` is known). Row indices follow the existing
 * convention: 0 = top of band (closest to ticks), `rowCount - 1` =
 * bottom of band (closest to chart). The "bottom-first" preference
 * lives entirely in the search order and grow direction; geometry
 * stays anchored to `markerRowY` at the top.
 */
export function packMarkerRow(
    entries: MarkerEntity[],
    chartLeftX: number,
    chartRightX: number,
    estimateTextWidth: (text: string, fontSize: number) => number,
): { placements: Map<string, PackedPlacement>; rowCount: number } {
    const sorted = [...entries].sort((a, b) => a.centerX - b.centerX);
    const placements = new Map<string, PackedPlacement>();
    type Span = { left: number; right: number };
    let rowSpans: Span[][] = [];

    type Side = 'left' | 'right';
    for (const e of sorted) {
        const labelWidth =
            estimateTextWidth(e.title, e.fontSize) * (e.bold ? MARKER_BOLD_WIDTH_FACTOR : 1);
        const naturalRightX = e.centerX + e.radius + MARKER_LABEL_GAP_PX;
        const naturalLeftX = e.centerX - e.radius - MARKER_LABEL_GAP_PX - labelWidth;
        const fitsRightCanvas = naturalRightX + labelWidth <= chartRightX;
        const fitsLeftCanvas = naturalLeftX >= chartLeftX;
        const diamondLeft = e.centerX - e.radius;
        const diamondRight = e.centerX + e.radius;

        const sideXLeft = (s: Side): number => (s === 'right' ? naturalRightX : naturalLeftX);
        const sideFitsCanvas = (s: Side): boolean =>
            s === 'right' ? fitsRightCanvas : fitsLeftCanvas;
        const collidesAt = (xLeft: number, row: number): boolean => {
            const extLeft = Math.min(diamondLeft, xLeft);
            const extRight = Math.max(diamondRight, xLeft + labelWidth);
            return rowSpans[row].some((s) => s.left < extRight && s.right > extLeft);
        };

        let placedRow = -1;
        let placedSide: Side = 'right';
        let placedXLeft = naturalRightX;

        // Bottom-first: try the highest existing row first, working up
        // toward row 0 (closest to the ticks).
        outer: for (let row = rowSpans.length - 1; row >= 0; row--) {
            for (const side of ['right', 'left'] as const) {
                if (!sideFitsCanvas(side)) continue;
                const xLeft = sideXLeft(side);
                if (collidesAt(xLeft, row)) continue;
                placedRow = row;
                placedSide = side;
                placedXLeft = xLeft;
                break outer;
            }
        }

        if (placedRow === -1) {
            // No existing row fits — prepend a fresh top row and shift
            // every previous placement DOWN by one slot (rowIndex += 1)
            // so the bottom corridor stays stable.
            for (const [id, p] of placements) {
                placements.set(id, { ...p, rowIndex: p.rowIndex + 1 });
            }
            rowSpans = [[], ...rowSpans];
            placedRow = 0;
            placedSide = fitsRightCanvas ? 'right' : 'left';
            placedXLeft = sideXLeft(placedSide);
        }

        const extLeft = Math.min(diamondLeft, placedXLeft);
        const extRight = Math.max(diamondRight, placedXLeft + labelWidth);
        rowSpans[placedRow].push({ left: extLeft, right: extRight });
        placements.set(e.id, {
            rowIndex: placedRow,
            labelBox: { x: placedXLeft, y: 0, width: labelWidth, height: MARKER_LABEL_HEIGHT_PX },
            labelSide: placedSide,
        });
    }

    return { placements, rowCount: rowSpans.length };
}

// Read the optional `locale:` property from the file's `nowline` directive.
// Layout receives an already-parsed AST, so this is a cheap lookup with no
// validation work — that's the validator's job in `@nowline/core`.
function directiveLocale(file: NowlineFile): string | undefined {
    const prop = file.directive?.properties.find((p) => stripColon(p.key) === 'locale');
    return prop?.value;
}

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}
