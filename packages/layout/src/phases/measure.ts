// Phase 2, measure (specs/layout-phases.md §3.3): everything the chart is
// laid out around, sized before any lane is placed. The header (its card
// fixes the chart's left edge and top), pixels per day and the natural
// time scale, the header rows above the chart (now-pill row, tick panel,
// wave strip, marker band) and the timeline of the natural window.
//
// The marker band is an estimate: floating milestones get their x only
// from placement, and an extended axis can add calendar runs, so finalize
// packs every marker again (f5) and grows the band when it needs more
// rows (f7). Nothing here reads placement state.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { cappedPixelsPerDay } from '../canvas-width.js';
import { propValue } from '../dsl-utils.js';
import { resolveHeaderLogo } from '../header-logo.js';
import type { LayoutOptions } from '../layout.js';
import { HeaderNode, type MeasuredHeader } from '../nodes/header-node.js';
import {
    calendarMarkerEntries,
    type DatePinnedMarker,
    datePinnedMarkerEntries,
    markerLabelsRightX,
    markerRowPlacements,
    packMarkerRow,
} from '../nodes/marker-band.js';
import { MARKER_ROW_CENTER_OFFSET_PX, MARKER_ROW_PITCH_PX } from '../nodes/marker-geometry.js';
import { resolveStyle } from '../style-resolution.js';
import { estimateTextWidth } from '../text-measure.js';
import {
    GUTTER_PX,
    HEADER_HEIGHT_PX,
    NOW_PILL_HEIGHT_PX,
    WAVE_STRIP_HEIGHT_PX,
} from '../themes/shared.js';
import { TimeScale } from '../time-scale.js';
import type { MarkerRowPlacement, PositionedTimelineScale } from '../types.js';
import {
    buildHeaderTicks,
    buildNonWorkingRuns,
    buildWorkingExceptions,
    type ViewPreset,
} from '../view-preset.js';
import type { DateWindow, RoadmapScope } from './date-window.js';

/** Gap (px) between the header rows and the chart top. */
const HEADER_ROWS_TO_CHART_GAP_PX = 8;

export interface MeasuredRoadmap {
    header: MeasuredHeader;
    /** The node that measured the header; finalize places it (f15). */
    headerNode: HeaderNode;
    /** The natural axis. f2 keeps `originX` and `ppd` when it extends the scale. */
    axis: { originX: number; ppd: number; naturalWidth: number; scale: TimeScale };
    /** The canvas right edge before anything grows it: the natural axis plus a gutter. */
    naturalChartRightX: number;
    bands: HeaderBands;
    /** Ticks and calendar runs for the natural window; f2 refreshes them. */
    timeline: PositionedTimelineScale;
    markers: MarkerEstimate;
}

/** The rows above the chart, top to bottom, and where the chart starts. */
export interface HeaderBands {
    timelineY: number;
    /**
     * The now-pill row, reserved here when `today` falls inside the natural
     * window. When the axis extension (f2) brings `today` in, f7 reserves it.
     */
    pillRowHeight: number;
    tickPanelY: number;
    tickPanelHeight: number;
    waveStripY: number;
    markerRowY: number;
    /** Rows the pre-pack needed. f7 grows the band when the final pack needs more. */
    estimatedMarkerRows: number;
    /** Height of the rows above: pill row, tick panel, wave strip, estimated marker band. */
    rowsHeight: number;
    chartTopY: number;
    /** Height of the mirrored bottom tick panel (f8); 0 when there is none. */
    bottomTickPanelHeight: number;
}

export interface MarkerEstimate {
    /** Date-pinned anchors and milestones with their x; they seed the entity edges. */
    datePinned: ReadonlyArray<DatePinnedMarker>;
    /** Pre-pack placements, already at the band's y. */
    placements: ReadonlyMap<string, MarkerRowPlacement>;
    /**
     * Whether the band is drawn at all: the roadmap declares an anchor or a
     * milestone, or the natural window holds a titled run or a working
     * exception.
     */
    hasEntities: boolean;
}

export function measureRoadmap(
    file: NowlineFile,
    resolved: ResolveResult,
    options: LayoutOptions,
    scope: RoadmapScope,
    window: DateWindow,
): MeasuredRoadmap {
    const { locale, styleCtx } = scope;
    const { calendar, preset: scale, startDate, timelineDays, nonWorking } = window;
    const endDate = window.naturalEndDate;
    const plan = window.schedule.plan;
    const headerStyle = scope.roadmapStyle;

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
    const showTopTickPanel = tickPanelBucketHeight > 0 && headerStyle.timelinePosition !== 'bottom';
    const showBottomTickPanel =
        tickPanelBucketHeight > 0 &&
        (headerStyle.timelinePosition === 'bottom' || headerStyle.timelinePosition === 'both');

    // Measure the header: the beside card's size or the above band's
    // height, which fix the chart's left edge and top. The company logo
    // (when the caller loaded one) widens the card by its slot and can
    // make it taller; see header-logo.ts.
    const titleStr = file.roadmapDecl?.title ?? file.roadmapDecl?.name ?? '';
    const authorStr = propValue(file.roadmapDecl?.properties ?? [], 'author');
    const headerNode = new HeaderNode({
        title: titleStr,
        author: authorStr,
        style: headerStyle,
        logo: resolveHeaderLogo(file, options.logo),
    });
    const measuredHeader = headerNode.measure();
    const { chartLeftX } = measuredHeader;

    // The chart sizes to natural content width (date window × ppd) plus
    // chrome padding. `options.width`, when set, is a best-effort
    // maximum canvas width: it shrinks ppd (never below
    // `MIN_PIXELS_PER_DAY`) so header card + gutters + timeline fit,
    // but caption spills and run labels can still grow the canvas
    // past it in finalize. The two `GUTTER_PX` insets keep the header
    // card and attribution wordmark from butting against the canvas edges.
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
    // labels never read. Finalize re-packs with the final ones.
    const provisionalRunEntries = calendarMarkerEntries(
        buildNonWorkingRuns(timeScale, [], scale.unit, false),
        buildWorkingExceptions(timeScale),
    );
    const hasMarkerEntities =
        resolved.content.anchors.size + resolved.content.milestones.size > 0 ||
        provisionalRunEntries.length > 0;
    // Initial canvas extent = natural date window + canonical
    // gutters. Item caption spills are unknown until the swimlane
    // pass runs and grow the canvas in finalize. The now-pill doesn't
    // contribute here — `buildNowline` flips it to flag mode whenever a
    // centered pill would clip an edge.
    const naturalChartRightX = originX + totalChartWidth + GUTTER_PX;

    // Resolve each date-pinned anchor and milestone's x. Used both for
    // the marker-row pack and for `after:` resolution downstream — an
    // item with `after:kickoff` would otherwise see an empty
    // entityRightEdges entry and silently fall through to `cursor.x`
    // (= the chart origin). After-only milestones still resolve later
    // once their predecessors are known.
    const datePinnedEntries = datePinnedMarkerEntries(
        resolved.content.anchors,
        resolved.content.milestones,
        timeScale,
    );

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
        markerLabelsRightX(preliminaryEntries, chartLeftX, naturalChartRightX, estimateTextWidth),
        estimateTextWidth,
    );
    const markerRowsCount = hasMarkerEntities ? Math.max(1, packed.rowCount) : 0;
    const markerRowHeight = markerRowsCount * MARKER_ROW_PITCH_PX;
    const headerRowsHeight = pillRowHeight + tickPanelHeight + waveStripHeight + markerRowHeight;
    const timelineHeightBudget = headerRowsHeight + HEADER_ROWS_TO_CHART_GAP_PX;
    const timelineY = headerRowsTimelineY(measuredHeader, headerRowsHeight);
    const tickPanelY = timelineY + pillRowHeight;
    const waveStripY = tickPanelY + tickPanelHeight;
    const markerRowY = waveStripY + waveStripHeight;

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
        // `bottomTickPanelY` / `bottomTickPanelHeight` are filled in by
        // finalize, AFTER swimlanes + includes are placed (and after the
        // marker re-pack potentially grows the chart), so the panel sits
        // directly above the footnote area.
        minorGrid: headerStyle.minorGrid,
        ...(plan ? { waveStrip: { y: waveStripY, height: waveStripHeight } } : {}),
    };
    setCalendarRuns(timeline, timeScale, scale.unit);

    return {
        header: measuredHeader,
        headerNode,
        axis: { originX, ppd, naturalWidth, scale: timeScale },
        naturalChartRightX,
        bands: {
            timelineY,
            pillRowHeight,
            tickPanelY,
            tickPanelHeight,
            waveStripY,
            markerRowY,
            estimatedMarkerRows: markerRowsCount,
            rowsHeight: headerRowsHeight,
            chartTopY: timelineY + timelineHeightBudget,
            bottomTickPanelHeight: showBottomTickPanel ? tickPanelBucketHeight : 0,
        },
        timeline,
        markers: {
            datePinned: datePinnedEntries,
            // AnchorNode and MilestoneNode read these to recover both the y
            // and the resolved label box; after-only milestones (not
            // pre-positioned here) take the band's first row until the
            // final pack.
            placements: markerRowPlacements(packed.placements, markerRowY),
            hasEntities: hasMarkerEntities,
        },
    };
}

/**
 * Where header rows `rowsHeight` tall start (the timeline y). In beside
 * mode the header card's BOTTOM aligns with the bottom of the header rows
 * so it visually anchors to the chart's top. When the card is taller than
 * the rows + a 4 px top inset, push the timeline down so the card has room
 * without clipping above the canvas.
 */
export function headerRowsTimelineY(header: MeasuredHeader, rowsHeight: number): number {
    return Math.max(header.chartTopY, header.minRowsBottomY - rowsHeight);
}

/**
 * Set (or refresh) the timeline's non-working runs from its current ticks,
 * and its working exceptions. `nonWorkingDisplay` and `nonWorking` stay
 * omitted when the window holds no non-working day, and `workingExceptions`
 * when it holds no exception, so a calendar without either keeps its exact
 * model shape. The extension pass only grows the window, so a refresh never
 * loses an entry.
 */
export function setCalendarRuns(
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
