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
} from '../types.js';
import type { LayoutContext, TrackCursor, LayoutHelpers } from '../layout-context.js';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import type { ViewPreset } from '../view-preset.js';
import type { CalendarConfig } from '../calendar.js';
import { themes, type Theme, type ThemeName } from '../themes/index.js';
import { resolveStyle, type StyleContext } from '../style-resolution.js';
import { resolveCalendar, daysBetween } from '../calendar.js';
import { resolveScale, buildHeaderTicks } from '../view-preset.js';
import { TimeScale } from '../time-scale.js';
import { fromCalendarConfig } from '../working-calendar.js';
import { defaultRowBand } from '../band-scale.js';
import {
    HEADER_ABOVE_HEIGHT_PX,
    SPACING_PX,
    GUTTER_PX,
    ATTRIBUTION_GLYPH_WIDTH,
    ATTRIBUTION_GLYPH_HEIGHT,
} from '../themes/shared.js';
import { propValue, parseDate } from '../dsl-utils.js';
import { SwimlaneNode } from './swimlane-node.js';
import { buildAnchors } from './anchor-node.js';
import { buildMilestones } from './milestone-node.js';
import { buildFootnotes } from './footnote-node.js';
import { buildIncludeRegions } from './include-node.js';

const MIN_CANVAS_WIDTH = 480;
const HEADER_CARD_TOP_INSET = 4;

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
        ctx: { cal: CalendarConfig; durations: Map<string, import('@nowline/core').DurationDeclaration> },
        resolved: ResolveResult,
        today: Date | undefined,
        scale: ViewPreset,
    ) => { startDate: Date; endDate: Date };
    sizeBesideHeader: (title: string, author: string | undefined) => SizedHeader;
    collectItems: (swimlanes: SwimlaneDeclaration[]) => Map<string, ItemDeclaration>;
    buildDependencies: (
        items: Map<string, ItemDeclaration>,
        ctx: LayoutContext,
    ) => PositionedDependencyEdge[];
    buildNowline: (today: Date | undefined, ctx: LayoutContext) => PositionedNowline | null;
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

        const cal = resolveCalendar(file, resolved.config.calendar);
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
        // now-line) instead of defaulting to a 180-day desert.
        const { startDate, endDate } = deps.computeDateWindow(
            file,
            { cal, durations: resolved.content.durations },
            resolved,
            options.today,
            scale,
        );

        // Determine header position via `default roadmap` / theme.
        const headerStyle = resolveStyle('roadmap', file.roadmapDecl?.properties ?? [], styleCtx);
        const isBeside = headerStyle.headerPosition === 'beside';

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
        // chrome padding, capped at the max. A small minimum keeps the
        // header / attribution wordmark legible when content is very
        // short.
        const calendar = fromCalendarConfig(cal);
        const ppd = scale.pixelsPerUnit / calendar.daysPerUnit(scale.unit);
        const spanDays = Math.max(1, daysBetween(startDate, endDate));
        const naturalWidth = spanDays * ppd;
        const originX = chartLeftX + GUTTER_PX;
        const totalChartWidth = naturalWidth;
        const desiredCanvas = chartLeftX + GUTTER_PX + totalChartWidth + GUTTER_PX;
        const chartRightX = Math.max(MIN_CANVAS_WIDTH, Math.min(width, desiredCanvas));

        // Header layout (top → bottom):
        //   1. Now-pill row    (16 px) — only when there's a now-line
        //   2. Tick-label panel (24 px) — always
        //   3. Marker row       (26 px) — only with anchors/milestones
        //   4. 8 px gap, then the chart begins
        const willHaveNowline =
            options.today !== undefined && options.today >= startDate && options.today <= endDate;
        const hasMarkerEntities =
            resolved.content.anchors.size + resolved.content.milestones.size > 0;
        const pillRowHeight = willHaveNowline ? 16 : 0;
        const tickPanelHeight = 24;
        const markerRowHeight = hasMarkerEntities ? 26 : 0;
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

        const timeScale = new TimeScale({
            domain: [startDate, endDate],
            range: [originX, originX + naturalWidth],
            calendar,
        });
        const ticks = buildHeaderTicks(timeScale, scale, calendar);
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
                y: markerRowY + 13,
                height: markerRowHeight,
                collisionY: markerRowY - 8,
            },
        };

        const ctx: LayoutContext = {
            cal,
            styleCtx,
            durations: resolved.content.durations,
            labels: resolved.content.labels,
            teams: resolved.content.teams,
            persons: resolved.content.persons,
            footnoteIndex: new Map(),
            footnoteHosts: new Map(),
            timeline,
            scale: timeScale,
            calendar,
            bandScale: defaultRowBand(),
            entityLeftEdges: new Map(),
            entityRightEdges: new Map(),
            entityMidpoints: new Map(),
            chartTopY: timelineY + timelineHeightBudget,
            chartBottomY: 0,
            chartRightX: Math.max(chartRightX, originX + totalChartWidth + GUTTER_PX),
        };

        // Footnotes index must be built before sequencing items reference
        // them.
        const pre = buildFootnotes(resolved.content.footnotes, ctx, 0);
        ctx.footnoteIndex = pre.index;
        ctx.footnoteHosts = pre.hosts;

        // Pre-position date-pinned anchors and milestones so items that
        // reference them via `after:` can resolve to the correct x. Without
        // this pass, `buildAnchors`/`buildMilestones` only run AFTER
        // swimlanes are placed, so an item with `after:kickoff` would find
        // an empty entityRightEdges entry and silently fall through to
        // `cursor.x` (= the chart origin). We only pre-position entities
        // that have an explicit `date:` — `after:`-only milestones still
        // resolve later once their predecessors are known.
        for (const [id, anchor] of resolved.content.anchors) {
            const date = parseDate(propValue(anchor.properties, 'date'));
            if (!date) continue;
            const x = ctx.scale.forwardWithinDomain(date);
            if (x === null) continue;
            ctx.entityLeftEdges.set(id, x);
            ctx.entityRightEdges.set(id, x);
        }
        for (const [id, milestone] of resolved.content.milestones) {
            const date = parseDate(propValue(milestone.properties, 'date'));
            if (!date) continue;
            const x = ctx.scale.forwardWithinDomain(date);
            if (x === null) continue;
            ctx.entityLeftEdges.set(id, x);
            ctx.entityRightEdges.set(id, x);
        }

        // Build swimlanes (declared order). Inter-band gap comes from
        // the swimlane default style's `spacing` bucket. Default
        // `spacing: none` keeps existing samples byte-stable; bumping to
        // `md` introduces an 8 px gap.
        const laneEntries = [...resolved.content.swimlanes.values()];
        const swimlaneDefaultStyle = resolveStyle('swimlane', [], styleCtx);
        const interBandGapPx =
            SPACING_PX[swimlaneDefaultStyle.spacing as keyof typeof SPACING_PX] ?? 0;
        const swimlanes: PositionedSwimlane[] = [];
        let y = ctx.chartTopY;
        let bandIndex = 0;
        for (const lane of laneEntries) {
            if (bandIndex > 0) y += interBandGapPx;
            const { positioned, usedHeight } = new SwimlaneNode(
                { lane, bandIndex },
                deps,
            ).place({ x: ctx.timeline.originX, y }, ctx);
            swimlanes.push(positioned);
            y += usedHeight;
            bandIndex++;
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
        timeline.box.height = ctx.chartBottomY - timeline.box.y;

        // Milestones first so anchors know which xs are occupied (for
        // collision bumps).
        const milestones = buildMilestones(resolved.content.milestones, ctx);
        const milestoneXs = new Set<number>(milestones.map((m) => m.center.x));
        const anchors = buildAnchors(resolved.content.anchors, ctx, milestoneXs);
        const itemsMap = deps.collectItems(laneEntries);
        const edges = deps.buildDependencies(itemsMap, ctx);

        // Now-line (if today is within the window). Initially drops to
        // the bottom of the chart area; if a footnote panel exists below
        // we extend it through the panel so the line still reads as a
        // single sweep.
        const nowline = deps.buildNowline(options.today, ctx);

        // Finalize footnotes at the bottom.
        const foot = buildFootnotes(resolved.content.footnotes, ctx, ctx.chartBottomY);
        ctx.footnoteIndex = foot.index;
        ctx.footnoteHosts = foot.hosts;
        if (nowline && foot.area.box.height > 0) {
            nowline.bottomY = foot.area.box.y + foot.area.box.height;
        }

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
