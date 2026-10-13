// RoadmapNode — the m2.5c composition root. Walks the per-entity
// Renderable nodes (ItemNode via sequenceItem, SwimlaneNode, ParallelNode
// via sequenceOne, AnchorNode/MilestoneNode via build*, footnote/include
// helpers) to produce the final `PositionedRoadmap` model.
//
// RoadmapNode does NOT import the sequencer helpers or the orchestration
// helpers (`computeDateWindow`, `collectItems`, `buildDependencies`,
// `buildNowline`) at module-init time. They live in
// `layout.ts` and are passed in via the `deps` argument. This avoids a
// runtime cycle while keeping the composition logic in a dedicated file.

import type {
    ItemDeclaration,
    NowlineFile,
    ResolveResult,
    SwimlaneDeclaration,
    WavePlan,
} from '@nowline/core';
import { defaultRowBand } from '../band-scale.js';
import { daysBetween } from '../calendar.js';
import { resolveWorkingCalendar } from '../calendar-resolver.js';
import { cappedPixelsPerDay } from '../canvas-width.js';
import { parseDate, propValue } from '../dsl-utils.js';
import { HEADER_CARD_PADDING_X } from '../header-card-geometry.js';
import { resolveHeaderLogo } from '../header-logo.js';
import { localeStrings, resolveLocale } from '../i18n.js';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import { createLayoutContext, type LayoutContext, type LayoutHelpers } from '../layout-context.js';
import { isNonWorkingDisplay } from '../non-working-display.js';
import { shiftIncludeY, shiftSwimlaneY } from '../positioned-shift.js';
import type { RoadmapSchedule } from '../schedule.js';
import { resolveStyle, type StyleContext } from '../style-resolution.js';
import { type Theme, type ThemeName, themes } from '../themes/index.js';
import {
    ATTRIBUTION_GLYPH_HEIGHT,
    ATTRIBUTION_GLYPH_WIDTH,
    GUTTER_PX,
    HEADER_HEIGHT_PX,
    NOW_PILL_HEIGHT_PX,
    SPACING_PX,
    WAVE_LEGEND_GAP_PX,
    WAVE_STRIP_HEIGHT_PX,
} from '../themes/shared.js';
import { TimeScale } from '../time-scale.js';
import type {
    BoundingBox,
    MarkerRowPlacement,
    PositionedDependencyEdge,
    PositionedHeader,
    PositionedIncludeRegion,
    PositionedNowline,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTimelineScale,
} from '../types.js';
import type { ViewPreset } from '../view-preset.js';
import {
    buildHeaderTicks,
    buildNonWorkingRuns,
    buildWorkingExceptions,
    resolveScale,
    tickBoundaryAtOrAfter,
} from '../view-preset.js';
import { solveWaveBarriers } from '../wave-barrier.js';
import {
    beginWavePass,
    createWaveLayoutState,
    freezeWaves,
    seedWaveEdges,
    WAVE_EDGE_TOLERANCE_PX,
} from '../wave-layout.js';
import { buildAnchors } from './anchor-node.js';
import { maxLeafItemRightX } from './content-extent.js';
import { buildFootnotePanel, indexFootnotes } from './footnote-node.js';
import { HeaderNode } from './header-node.js';
import { buildIncludeRegions, fitIncludeRegionWidth } from './include-node.js';
import {
    type MarkerEntity,
    markerLabelsRightX,
    nonWorkingRunEntries,
    nonWorkingRunMarkerId,
    packMarkerRow,
    workingExceptionEntries,
    workingExceptionMarkerId,
} from './marker-band.js';
import {
    MARKER_DIAMOND_RADIUS_PX,
    MARKER_ROW_CENTER_OFFSET_PX,
    MARKER_ROW_PITCH_PX,
} from './marker-geometry.js';
import { buildMilestones, collectSlackCorridors, positionMilestones } from './milestone-node.js';
import { SwimlaneNode } from './swimlane-node.js';
import { buildWaveLegend, buildWaves } from './wave-node.js';

/**
 * The canvas right edge, owned by `RoadmapNode.place` and never part of
 * a `LayoutContext`: placement does not read it. `grow` is the single
 * mutator. Every layout artifact that wants to push the canvas wider
 * passes the absolute X it wants the canvas to contain, with any
 * breathing-room margin (typically `GUTTER_PX`) baked in. Concentrating
 * growth here makes it trivial to grep for every contributor — today:
 * item caption spills, the timeline extension and marker-row labels.
 *
 * The seed is the natural date window with `GUTTER_PX` insets on each
 * side; everything that becomes known after the swimlane pass grows it.
 * The canvas is final after the marker-label growth (P8).
 *
 * The now-pill is intentionally NOT a contributor — when the line
 * lands close to either edge, `buildNowline` switches the pill to
 * "flag" mode (squared edge against the line, rounded edge into the
 * chart), so the pill always fits inside the natural canvas.
 */
class CanvasExtent {
    constructor(private right: number) {}

    grow(rightX: number): void {
        if (rightX > this.right) this.right = rightX;
    }

    get rightX(): number {
        return this.right;
    }
}

/**
 * Set (or refresh) the timeline's non-working runs from its current ticks,
 * and its working exceptions. `nonWorkingDisplay` and `nonWorking` stay
 * omitted when the window holds no non-working day, and `workingExceptions`
 * when it holds no exception, so a calendar without either keeps its exact
 * model shape. The extension pass only grows the window, so a refresh never
 * loses an entry.
 */
function setCalendarRuns(
    timeline: PositionedTimelineScale,
    scale: TimeScale,
    unit: ViewPreset['unit'],
): void {
    const runs = buildNonWorkingRuns(scale, timeline.ticks, unit, timeline.minorGrid);
    if (runs) {
        timeline.nonWorkingDisplay = scale.showsNonWorking ? 'show' : 'hide';
        timeline.nonWorking = runs;
    }
    const exceptions = buildWorkingExceptions(scale);
    if (exceptions) timeline.workingExceptions = exceptions;
}

/**
 * Bundle of orchestration + sequencer helpers RoadmapNode delegates to.
 * `layout.ts` builds this struct from its private helpers and passes it
 * once when calling `RoadmapNode.place(...)`.
 */
export interface RoadmapNodeDeps extends LayoutHelpers {
    computeDateWindow: (
        file: NowlineFile,
        schedule: RoadmapSchedule,
        today: Date | undefined,
        scale: ViewPreset,
    ) => { startDate: Date; endDate: Date };
    collectItems: (swimlanes: SwimlaneDeclaration[]) => Map<string, ItemDeclaration>;
    buildDependencies: (
        items: Map<string, ItemDeclaration>,
        swimlanes: PositionedSwimlane[],
        includes: PositionedIncludeRegion[],
        ctx: LayoutContext,
    ) => PositionedDependencyEdge[];
    buildNowline: (
        today: Date | undefined,
        ctx: LayoutContext,
        locale: string,
        chartRightX: number,
    ) => PositionedNowline | null;
}

export class RoadmapNode {
    /**
     * `schedule` is the roadmap's day schedule (engine C), built once by
     * `layoutRoadmap` or handed in through `LayoutOptions.schedule`. The date
     * window is a projection of it, and `schedule.plan` (the wave plan,
     * undefined without waves) drives the barrier passes below (engine A).
     */
    place(
        file: NowlineFile,
        resolved: ResolveResult,
        options: LayoutOptions,
        schedule: RoadmapSchedule,
        deps: RoadmapNodeDeps,
    ): LayoutResult {
        const themeName: ThemeName = options.theme ?? 'light';
        const theme: Theme = themes[themeName];
        const locale = resolveLocale(options.locale, directiveLocale(file));

        // The working calendar maps dates to working-day indices for the
        // window, the axis and every placement (specs/working-calendar.md
        // §5, §7.1).
        const { config: cal, working: calendar } = resolveWorkingCalendar(file, resolved);
        const scale = resolveScale(file, resolved.config.scale);
        const styleCtx: StyleContext = {
            theme,
            styles: resolved.config.styles,
            defaults: resolved.config.defaults,
            labels: resolved.content.labels,
        };

        // Date window + header geometry. Window is content-aware: when
        // `length:` is omitted we derive the end day from the latest
        // dated/sequenced entity (item, anchor, milestone, today's
        // now-line) instead of defaulting to a 180-day desert. The window is
        // a projection of the day schedule (specs/scheduler-unification.md
        // §3.3).
        const plan = schedule.plan;
        const { startDate, endDate } = deps.computeDateWindow(file, schedule, options.today, scale);

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
        // `header-height` sizes every tick panel (top and mirrored bottom);
        // `none` drops them all, whatever `timeline-position` asks for.
        const tickPanelBucketHeight =
            HEADER_HEIGHT_PX[headerStyle.headerHeight as keyof typeof HEADER_HEIGHT_PX] ??
            HEADER_HEIGHT_PX.md;
        const showTopTickPanel =
            tickPanelBucketHeight > 0 && headerStyle.timelinePosition !== 'bottom';
        const showBottomTickPanel =
            tickPanelBucketHeight > 0 &&
            (headerStyle.timelinePosition === 'bottom' || headerStyle.timelinePosition === 'both');
        // How non-working days are drawn: the surface option, then the
        // file's `default roadmap non-working:` key (resolved to `hide` when
        // absent). It reaches every placement through the time scale.
        const nonWorking = isNonWorkingDisplay(options.nonWorking)
            ? options.nonWorking
            : headerStyle.nonWorking;
        // `TimeScale.showsNonWorking`, needed here to size the scale's range.
        const showsNonWorking = nonWorking === 'show' && calendar.hasNonWorkingDays;

        // Measure the header: the beside card's size or the above band's
        // height, which fix the chart's left edge and top. The company logo
        // (when the caller loaded one) widens the card by its slot and can
        // make it taller; see header-logo.ts.
        const titleStr = file.roadmapDecl?.title ?? file.roadmapDecl?.name ?? '';
        const authorStr = propValue(file.roadmapDecl?.properties ?? [], 'author');
        const headerLogo = resolveHeaderLogo(file, options.logo);
        const measuredHeader = new HeaderNode({
            title: titleStr,
            author: authorStr,
            style: headerStyle,
            logo: headerLogo,
        }).measure();

        const headerBox = isBeside
            ? { x: 0, y: 0, width: measuredHeader.chartLeftX, height: 0 }
            : { x: 0, y: 0, width: 0, height: measuredHeader.aboveHeight };

        const { chartLeftX, chartTopY } = measuredHeader;

        // The chart sizes to natural content width (date window × ppd) plus
        // chrome padding. `options.width`, when set, is a best-effort
        // maximum canvas width: it shrinks ppd (never below
        // `MIN_PIXELS_PER_DAY`) so header card + gutters + timeline fit,
        // but caption spills and run labels can still grow the canvas
        // past it below. The two `GUTTER_PX` insets keep the header card
        // and attribution wordmark from butting against the canvas edges.
        const spanDays = Math.max(1, calendar.workingIndexOf(startDate, endDate));
        // Under `show` every calendar day takes `ppd`, so the chart widens by
        // the non-working days in the window.
        const timelineDays = showsNonWorking
            ? Math.max(1, daysBetween(startDate, endDate))
            : spanDays;
        const ppd = cappedPixelsPerDay({
            naturalPixelsPerDay: scale.pixelsPerUnit / calendar.daysPerUnit(scale.unit),
            dayCount: timelineDays,
            chromeWidth: chartLeftX + 2 * GUTTER_PX,
            maxWidth: options.width,
        });
        const naturalWidth = timelineDays * ppd;
        const originX = chartLeftX + GUTTER_PX;
        const totalChartWidth = naturalWidth;

        // Header layout (top → bottom):
        //   1. Now-pill row    (16 px) — only when there's a now-line
        //   2. Tick-label panel (`header-height`, 24 px at md) — unless
        //      `timeline-position:bottom` or `header-height:none`
        //   3. Wave strip      (20 px) — only when the roadmap declares waves
        //   4. Marker row       (≥26 px) — sized to the packed row count
        //   5. 8 px gap, then the chart begins
        const willHaveNowline =
            options.today !== undefined && options.today >= startDate && options.today <= endDate;
        const pillRowHeight = willHaveNowline ? NOW_PILL_HEIGHT_PX : 0;
        // When `timeline-position:bottom` or `header-height:none` is set,
        // the top tick panel collapses to height 0 — the now-pill and
        // marker row stack directly without the date strip between them.
        const tickPanelHeight = showTopTickPanel ? tickPanelBucketHeight : 0;
        // The wave strip (specs/waves.md §8.8) has a fixed height, so the
        // chart top is known before the barrier passes run; it sits above
        // the marker rows, so the post-hoc marker re-pack never moves it.
        const waveStripHeight = plan ? WAVE_STRIP_HEIGHT_PX : 0;

        // Build the time scale up front — packMarkerRow needs it to
        // resolve date-pinned entity x positions before we can size the
        // marker row band.
        const timeScale = new TimeScale({
            domain: [startDate, endDate],
            range: [originX, originX + naturalWidth],
            calendar,
            nonWorking,
        });
        // Titled non-working runs and working exceptions join the marker
        // row (5b). These are provisional: they size the band before the
        // timeline exists, and their ticks only decide `seam`, which the
        // labels never read. The re-pack below reads the final ones.
        const provisionalRunEntries = [
            ...nonWorkingRunEntries(buildNonWorkingRuns(timeScale, [], scale.unit, false)),
            ...workingExceptionEntries(buildWorkingExceptions(timeScale)),
        ];
        const hasMarkerEntities =
            resolved.content.anchors.size + resolved.content.milestones.size > 0 ||
            provisionalRunEntries.length > 0;
        // Initial canvas extent = natural date window + canonical
        // gutters. Item caption spills are unknown until the swimlane
        // pass runs and grow the canvas through `canvas.grow`. The
        // now-pill doesn't contribute here — `buildNowline` flips it to
        // flag mode whenever a centered pill would clip an edge.
        const naturalChartRightX = originX + totalChartWidth + GUTTER_PX;

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
        // right-side label would overflow the canvas. Earlier
        // entries claim row 0; later ones drop to row 1+ when their
        // bounding box (diamond + label) overlaps an already-placed
        // entry. The renderer reads `labelBox.x/y` directly.
        // Titled runs and working exceptions pack after the markers. Every
        // entry packs against
        // the right edge the post-layout canvas growth will give its label.
        const preliminaryEntries = [...datePinnedEntries, ...provisionalRunEntries];
        const packed = packMarkerRow(
            preliminaryEntries,
            chartLeftX,
            markerLabelsRightX(
                preliminaryEntries,
                chartLeftX,
                naturalChartRightX,
                deps.estimateTextWidth,
            ),
            deps.estimateTextWidth,
        );
        const markerRowsCount = hasMarkerEntities ? Math.max(1, packed.rowCount) : 0;
        const markerRowHeight = markerRowsCount * MARKER_ROW_PITCH_PX;
        const headerRowsHeight =
            pillRowHeight + tickPanelHeight + waveStripHeight + markerRowHeight;
        const timelineHeightBudget = headerRowsHeight + 8;
        // In beside-mode the header card's BOTTOM aligns with the bottom
        // of the header rows so it visually anchors to the chart's top.
        // When the card is taller than the natural rows + a 4 px top
        // inset, push the timeline down so the card has room without
        // clipping above the canvas.
        const timelineY = Math.max(chartTopY, measuredHeader.minRowsBottomY - headerRowsHeight);
        const tickPanelY = timelineY + pillRowHeight;
        const waveStripY = tickPanelY + tickPanelHeight;
        const markerRowY = waveStripY + waveStripHeight;
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
            ...(plan ? { waveStrip: { y: waveStripY, height: waveStripHeight } } : {}),
        };
        setCalendarRuns(timeline, timeScale, scale.unit);

        // Stitch packed placements together with their final centerY now
        // that markerRowY is known. AnchorNode + MilestoneNode read this
        // map to recover both Y and the resolved label box; after-only
        // milestones (not pre-positioned here) pack against this map at
        // build time so they slot into the same rows where there's room.
        const markerRowPlacements = new Map<string, MarkerRowPlacement>();
        for (const [id, p] of packed.placements) {
            const centerY =
                markerRowY + MARKER_ROW_CENTER_OFFSET_PX + p.rowIndex * MARKER_ROW_PITCH_PX;
            markerRowPlacements.set(id, {
                rowIndex: p.rowIndex,
                centerY,
                labelBox: { ...p.labelBox, y: centerY - 4 },
                labelSide: p.labelSide,
            });
        }

        // Footnotes index must exist before sequencing items reference
        // them.
        const ctx = createLayoutContext(
            resolved,
            {
                theme,
                cal,
                schedule,
                timeline,
                scale: timeScale,
                calendar,
                bandScale: defaultRowBand(),
                waves: plan ? createWaveLayoutState(plan, timeScale, originX) : undefined,
            },
            {
                chartTopY: timelineY + timelineHeightBudget,
                chartBottomY: 0,
                swimlaneBottomY: 0,
            },
            { footnotes: indexFootnotes(resolved.content.footnotes), markerRowPlacements },
        );
        // Placement never reads the canvas; only the post-placement steps
        // below grow and read it.
        const canvas = new CanvasExtent(naturalChartRightX);

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

        // Snapshot the entity maps after pre-positioning so we can reset
        // them between the two swimlane passes. Date-pinned anchors and
        // milestones live in this baseline; item-derived entries get
        // re-added on each pass.
        const baselineEntityLeft = new Map(ctx.entityLeftEdges);
        const baselineEntityRight = new Map(ctx.entityRightEdges);
        const baselineEntityMid = new Map(ctx.entityMidpoints);
        // Item-only maps don't carry baseline entries (date-pinned
        // markers are never placed items), so pass-2 reruns reset them
        // to fresh empties. With waves, every reset re-seeds the wave
        // edges (`entityRightEdges[w_k] = E_k`, `entityLeftEdges[w_k] =
        // S_k`) on top of the baseline, so forward references stay
        // dropped exactly as they are without waves.
        const resetEntityMaps = (): void => {
            ctx.entityLeftEdges = new Map(baselineEntityLeft);
            ctx.entityRightEdges = new Map(baselineEntityRight);
            ctx.entityMidpoints = new Map(baselineEntityMid);
            // placedItems and itemFlowKey only ever hold item entries
            // (markers never write to them), so a fresh map is the right
            // reset: the next pass's items will repopulate.
            ctx.placedItems = new Map();
            ctx.itemFlowKey = new Map();
            ctx.currentFlowKey = '';
            if (ctx.waves) seedWaveEdges(ctx.waves, ctx.entityLeftEdges, ctx.entityRightEdges);
        };

        // Build swimlanes (declared order). Inter-band gap comes from
        // the swimlane default style's `spacing` bucket. Default
        // `spacing: none` keeps existing samples byte-stable; bumping to
        // `md` introduces an 8 px gap.
        const laneEntries = [...resolved.content.swimlanes.values()];
        const swimlaneDefaultStyle = resolveStyle('swimlane', [], styleCtx);
        const interBandGapPx =
            SPACING_PX[swimlaneDefaultStyle.spacing as keyof typeof SPACING_PX] ?? 0;

        const runSwimlaneLoop = (): {
            swimlanes: PositionedSwimlane[];
            nextY: number;
            maxRightX: number;
        } => {
            ctx.nextParallelId = 0;
            ctx.nextGroupId = 0;
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

        const isolated = resolved.content.isolatedRegions;

        // Pass 1 — place items without corridor knowledge. With waves
        // (specs/waves.md §8.3-§8.4) it is the barrier driver's pass
        // loop: each pass resets the maps, re-seeds the wave edges, places
        // the lanes with the pass's floors, then places the isolated
        // regions only to accumulate their members (those region
        // placements are discarded). The driver iterates to the least
        // fixpoint; its last pass ran with the solved S/E, so its lane
        // placements are kept.
        let pass: ReturnType<typeof runSwimlaneLoop>;
        let waveSolve: PositionedRoadmap['waveSolve'];
        const waves = ctx.waves;
        if (waves) {
            let last: ReturnType<typeof runSwimlaneLoop> | undefined;
            const solved = solveWaveBarriers(
                waves.ids.length,
                waves.origin,
                waves.floors,
                (S, E) => {
                    beginWavePass(waves, S, E);
                    resetEntityMaps();
                    last = runSwimlaneLoop();
                    if (isolated.length > 0) {
                        buildIncludeRegions(isolated, ctx, last.nextY + 8, deps);
                    }
                    return waves.pass;
                },
                WAVE_EDGE_TOLERANCE_PX,
            );
            // From here on the barrier is frozen: later placements floor
            // with the solved S/E and accumulate nothing.
            freezeWaves(waves, solved);
            waveSolve = { passes: solved.passes, capped: solved.capped };
            pass = last as ReturnType<typeof runSwimlaneLoop>;
        } else {
            pass = runSwimlaneLoop();
        }
        let swimlanes = pass.swimlanes;
        let y = pass.nextY;

        // Collect slack-arrow corridors from the milestones (mirrors
        // MilestoneNode.place's pred resolution). When the result is
        // non-empty, an item sat inside an arrow's path on pass 1 — rerun
        // the swimlane loop with corridors known so the row-packer can
        // bump the offending items down to a clear row. Bumping never
        // changes an item's x, so corridors stay valid across the rerun;
        // no fixed-point iteration needed. With waves the rerun runs once,
        // after the barrier has settled: it floors with the frozen S/E,
        // and the reset re-seeds the wave edges.
        const corridors = collectSlackCorridors(resolved.content.milestones, ctx);
        if (corridors.length > 0) {
            resetEntityMaps();
            ctx.slackCorridors = corridors;
            pass = runSwimlaneLoop();
            swimlanes = pass.swimlanes;
            y = pass.nextY;
        }

        // Expand the canvas to fit any caption that spilled past its bar
        // (`textSpills`). Otherwise the long captions on narrow charts —
        // e.g. `examples/minimal.svg` and `tests/text-spills-right.svg`
        // — would land outside the SVG's viewBox and clip in browsers.
        // The marker re-pack below sees the expanded width and picks a
        // less aggressive label side.
        canvas.grow(pass.maxRightX + GUTTER_PX);

        // Include regions under the swimlanes. Reserve the 8 px gap +
        // tab-reserve only when there's at least one isolated region —
        // otherwise the now-line and chart bottom would extend past the
        // last swimlane into empty space. With waves this is the one kept
        // region placement, floored with the frozen S/E.
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
        // collision bumps). Placement gives each its x, slack arrows and
        // overrun; its marker row and label box come from the re-pack
        // below, once every centerX is known and the canvas is final.
        const milestonePlacements = buildMilestones(resolved.content.milestones, ctx);

        // Post-layout timeline extension. `computeDateWindow`'s pre-pass
        // only knows about logical bar durations; caption spill,
        // dependency slack, and floating (`after:`) markers can push
        // real content further right once the swimlane + include passes
        // run. Measure the rightmost CONTENT BOX edge — leaf item bars
        // (never a spilled caption, see `maxLeafItemRightX`) and marker
        // diamonds — and grow the window to the next tick boundary when
        // content overflows it. Captions may still overhang past the
        // last column; their boxes may not. This is driven purely by
        // boxes, never by `today`, so the `length:`-as-minimum + now-line
        // boundary behavior is unaffected.
        let maxContentRightX = maxLeafItemRightX(swimlanes);
        for (const inc of includes) {
            maxContentRightX = Math.max(maxContentRightX, maxLeafItemRightX(inc.nestedSwimlanes));
        }
        for (const e of datePinnedEntries) {
            maxContentRightX = Math.max(maxContentRightX, e.centerX + e.radius);
        }
        for (const m of milestonePlacements) {
            maxContentRightX = Math.max(maxContentRightX, m.x + m.radius);
        }
        const tickDays = calendar.daysPerUnit(scale.unit);
        // Working-day counts on both sides of the comparison: under `show` x
        // is linear in calendar days, so the overflow is read back through
        // the scale and the window keeps its working-day span.
        const overflowDays = ctx.scale.showsNonWorking
            ? ctx.scale.indexAtX(maxContentRightX)
            : (maxContentRightX - originX) / ppd;
        const paddedDays =
            overflowDays > 0
                ? tickBoundaryAtOrAfter(startDate, overflowDays, scale.unit, tickDays, calendar)
                : 0;
        if (paddedDays > spanDays) {
            const extendedEndDate = calendar.dateAtWorkingIndex(startDate, paddedDays);
            const extendedWidth = ctx.scale.showsNonWorking
                ? daysBetween(startDate, extendedEndDate) * ppd
                : paddedDays * ppd;
            const extendedScale = new TimeScale({
                domain: [startDate, extendedEndDate],
                range: [originX, originX + extendedWidth],
                calendar,
                nonWorking,
            });
            ctx.scale = extendedScale;
            timeline.endDate = extendedEndDate;
            timeline.box.width = extendedWidth;
            timeline.ticks = buildHeaderTicks(extendedScale, scale, calendar, locale);
            setCalendarRuns(timeline, extendedScale, scale.unit);
            canvas.grow(originX + extendedWidth + GUTTER_PX);
        }

        // Every marker (date-pinned anchor, date-pinned milestone,
        // after-only milestone, titled run, working exception) with its final
        // centerX. Calendar labels come from the final runs and exceptions:
        // the extension pass above rebuilt them, so never the pre-pack's copies. A label that fits
        // neither side grows the canvas so the re-pack places it right.
        const allMarkerEntries: MarkerEntity[] = datePinnedEntries.map((e) => ({
            id: e.id,
            centerX: e.centerX,
            radius: e.radius,
            title: e.title,
            fontSize: e.fontSize,
            bold: e.bold,
        }));
        for (const m of milestonePlacements) {
            if (m.fixed) continue;
            allMarkerEntries.push({
                id: m.id,
                centerX: m.x,
                radius: m.radius,
                title: m.title,
                fontSize: 10,
                bold: true,
            });
        }
        const runEntries = [
            ...nonWorkingRunEntries(timeline.nonWorking),
            ...workingExceptionEntries(timeline.workingExceptions),
        ];
        allMarkerEntries.push(...runEntries);
        canvas.grow(
            markerLabelsRightX(allMarkerEntries, chartLeftX, canvas.rightX, deps.estimateTextWidth),
        );

        // The canvas is final from here on. Placement left every width
        // that spans it unset: stretch every band to the canvas so the
        // lane background contains its own spilled captions
        // (text-spills-right's "1w — 50% remaining" would otherwise sit
        // outside it) and reaches the extended tick panel, and fit each
        // include so its right-edge clamp reads the final width.
        const chartRightX = canvas.rightX;
        for (const lane of swimlanes) {
            lane.box.width = chartRightX;
        }
        for (const inc of includes) {
            fitIncludeRegionWidth(inc, chartRightX);
        }

        // Unified marker re-pack over `allMarkerEntries`, so
        // packMarkerRow can sort by tick and assign rows + label sides
        // bottom-first. This is the single source of truth for
        // `ctx.markerRowPlacements`; the pre-pack only existed to size
        // the marker band before swimlanes ran.
        const repacked = packMarkerRow(
            allMarkerEntries,
            chartLeftX,
            chartRightX,
            deps.estimateTextWidth,
        );

        ctx.markerRowPlacements.clear();
        for (const [id, p] of repacked.placements) {
            const centerY =
                markerRowY + MARKER_ROW_CENTER_OFFSET_PX + p.rowIndex * MARKER_ROW_PITCH_PX;
            ctx.markerRowPlacements.set(id, {
                rowIndex: p.rowIndex,
                centerY,
                labelBox: { ...p.labelBox, y: centerY - 4 },
                labelSide: p.labelSide,
            });
        }

        // Build the positioned milestones from their placements and the
        // re-pack, then push the final placements onto the titled runs,
        // the working exceptions and every marker's entityMidpoints entry
        // (used by edge routing and slack-arrow geometry).
        const milestones = positionMilestones(milestonePlacements, ctx.markerRowPlacements);
        for (const run of timeline.nonWorking ?? []) {
            if (run.label === undefined) continue;
            const placement = ctx.markerRowPlacements.get(nonWorkingRunMarkerId(run));
            if (!placement) continue;
            run.labelBox = placement.labelBox;
            run.labelSide = placement.labelSide;
        }
        for (const exception of timeline.workingExceptions ?? []) {
            const placement = ctx.markerRowPlacements.get(workingExceptionMarkerId(exception));
            if (!placement) continue;
            exception.labelBox = placement.labelBox;
            exception.labelSide = placement.labelSide;
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
        const actualRowCount =
            hasMarkerEntities || runEntries.length > 0 ? Math.max(1, repacked.rowCount) : 0;
        if (actualRowCount > markerRowsCount) {
            const deltaY = (actualRowCount - markerRowsCount) * MARKER_ROW_PITCH_PX;
            ctx.timeline.markerRow.height = actualRowCount * MARKER_ROW_PITCH_PX;
            ctx.timeline.box.height += deltaY;
            ctx.chartTopY += deltaY;
            ctx.chartBottomY += deltaY;
            ctx.swimlaneBottomY += deltaY;
            // `shiftSwimlaneY` moves every absolute y the positioned model
            // carries (see `positioned-shift.ts`). No LayoutContext map needs
            // a shift: item attach ports are derived from the (now-shifted)
            // boxes in `placedItems` when edges are built below, the edge maps
            // hold X only, itemFlowKey holds strings, marker midpoints and
            // markerRowPlacements are already final, and slackCorridors are
            // pass-2 inputs consumed before this block.
            for (const lane of swimlanes) shiftSwimlaneY(lane, deltaY);
            for (const inc of includes) shiftIncludeY(inc, deltaY);
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
            ctx.timeline.bottomTickPanelHeight = tickPanelBucketHeight;
            ctx.chartBottomY += gapAbovePanel + tickPanelBucketHeight;
        }

        // Positioned waves (specs/waves.md §8.7): after the extent growth
        // (final scale) and the marker-row shift, so the columns, the
        // boundaries and the crossings read final geometry.
        const strings = localeStrings(locale);
        const builtWaves = ctx.waves
            ? buildWaves(ctx.waves, ctx, strings, swimlanes, includes)
            : undefined;
        if (builtWaves) {
            builtWaves.regionCrossings.forEach((crossings, i) => {
                if (crossings.length > 0) includes[i].waveCrossings = crossings;
            });
            if (builtWaves.placeholder !== undefined && timeline.waveStrip) {
                timeline.waveStrip.placeholder = builtWaves.placeholder;
            }
        }

        const milestoneXs = new Set<number>(milestones.map((m) => m.center.x));
        const anchors = buildAnchors(resolved.content.anchors, ctx, milestoneXs);
        const itemsMap = deps.collectItems(laneEntries);
        const edges = deps.buildDependencies(itemsMap, swimlanes, includes, ctx);

        // Now-line (if today is within the window). Stops at the bottom
        // timeline panel when present, otherwise at the last swimlane —
        // see `buildNowline`. Footnote panels below do not extend it.
        const nowline = deps.buildNowline(options.today, ctx, locale, chartRightX);

        // The wave legend (specs/waves.md §8.8, §9.5) sits below the chart
        // and any bottom tick panel, above the footnotes: grow the chart
        // bottom by its gap and lines before the footnote panel is placed.
        const waveLegend = builtWaves
            ? buildWaveLegend(
                  builtWaves,
                  ctx,
                  strings,
                  ctx.chartBottomY + WAVE_LEGEND_GAP_PX,
                  chartRightX,
              )
            : undefined;
        if (waveLegend) ctx.chartBottomY += WAVE_LEGEND_GAP_PX + waveLegend.box.height;

        // Finalize footnotes at the bottom.
        const footnotePanel = buildFootnotePanel(
            resolved.content.footnotes,
            ctx,
            ctx.chartBottomY,
            chartRightX,
        );

        // Header (depends on chart height in beside-mode and on the
        // final canvas width in above-mode).
        headerBox.height = headerBox.height || ctx.chartBottomY;
        if (!isBeside) headerBox.width = chartRightX;
        // Card sub-box for beside-mode (the visible white panel inside
        // headerBox). Card BOTTOM hugs the bottom of the header rows so
        // the title block visually anchors to the chart's top edge
        // regardless of which header rows are present. timelineY was
        // already nudged down above to guarantee the card has at least
        // HEADER_CARD_TOP_INSET clearance from the canvas top.
        const cardBox: BoundingBox = isBeside
            ? {
                  x: 6,
                  y: headerRowsBottomY - measuredHeader.cardHeight,
                  width: measuredHeader.cardWidth,
                  height: measuredHeader.cardHeight,
              }
            : { x: 0, y: 0, width: chartRightX, height: measuredHeader.aboveHeight };
        // Logo at the card's left padding, vertically centered; the text
        // shifts right past it and centers in the (possibly taller) card.
        let logo: PositionedHeader['logo'];
        let textInset: PositionedHeader['textInset'];
        if (headerLogo) {
            logo = {
                box: {
                    x: headerBox.x + cardBox.x + HEADER_CARD_PADDING_X,
                    y: headerBox.y + cardBox.y + (cardBox.height - headerLogo.height) / 2,
                    width: headerLogo.width,
                    height: headerLogo.height,
                },
                assetRef: headerLogo.assetRef,
                intrinsic: headerLogo.intrinsic,
            };
            textInset = {
                x: measuredHeader.logoSlot,
                y: Math.max(0, (cardBox.height - measuredHeader.textCardHeight) / 2),
            };
        }

        // Attribution wordmark placement. Canvas grows by GUTTER_PX +
        // glyph height + GUTTER_PX so the wordmark sits in a clean bottom
        // margin below all content (last swimlane / footnote panel /
        // include region). Today only the bottom-right slot fires, but
        // the priority order is bottom-right → upper-right → bottom-left
        // — when content density makes bottom-right disruptive in some
        // future case, fall back to upper-right (above the timeline) and
        // then bottom-left (under the header card in beside-mode).
        //
        // When there are no footnotes, `footnotePanel.box` still carries a 16 px
        // top-of-panel offset; that's a placeholder for the footnote
        // header gap and shouldn't push the attribution down. Use the
        // bare `chartBottomY` in that case so the bottom margin is
        // exactly `GUTTER_PX + glyphHeight + GUTTER_PX`.
        const contentBottomY =
            footnotePanel.entries.length > 0
                ? footnotePanel.box.y + footnotePanel.box.height
                : ctx.chartBottomY;
        const attributionBox: BoundingBox = {
            x: chartRightX - GUTTER_PX - ATTRIBUTION_GLYPH_WIDTH,
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
            titleLines: measuredHeader.titleLines,
            authorLines: measuredHeader.authorLines,
            cardBox,
            logo,
            ...(textInset ? { textInset } : {}),
            style: headerStyle,
            attributionBox,
        };

        const model: PositionedRoadmap = {
            width: chartRightX,
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
            footnotes: footnotePanel,
            includes,
            chartBox: {
                x: chartLeftX,
                y: ctx.chartTopY,
                width: chartRightX - chartLeftX,
                height: ctx.chartBottomY - ctx.chartTopY,
            },
            ...(waveSolve ? { waveSolve } : {}),
            ...(builtWaves ? { waves: builtWaves.waves } : {}),
            ...(builtWaves && builtWaves.boundaries.length > 0
                ? { waveBoundaries: builtWaves.boundaries }
                : {}),
            ...(builtWaves && builtWaves.crossings.length > 0
                ? { waveCrossings: builtWaves.crossings }
                : {}),
            ...(waveLegend ? { waveLegend } : {}),
        };
        return model;
    }
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
