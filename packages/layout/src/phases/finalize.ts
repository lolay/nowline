// Phase 4, finalize (specs/layout-phases.md §3.5): every change after
// placement runs here, as one ordered pass of named steps over an explicit
// `FinalizeContext`. The steps grow the canvas, extend the axis, pack the
// marker band, grow the header rows and build the pieces of the model that
// read final geometry; none of them places content again.
//
// The pass is a constant table. Each step declares the slots it reads and
// writes, and `checkFinalizeOrder` checks the table against the slot
// rules: the canvas, the scale and the marker band are final after f3, f2
// and f5, the chart top, the header rows' bottom and the lane bottom after
// f7, and the chart bottom is a cursor that f7, f8 and f13 advance. The
// guards on `CanvasExtent`, `finalScale()`, `markerBand()`,
// `headerRowsTop()` and `headerRowsBottom()` throw when a slot is read
// before its writer ran, so a reordering that slips past the check still
// fails.

import type { NowlineFile, ResolveResult } from '@nowline/core';
import { AxisColumns } from '../axis-columns.js';
import { daysBetween } from '../calendar.js';
import {
    translateIncludeY,
    translateMilestoneChartY,
    translateSwimlaneY,
} from '../chart-translation.js';
import { localeStrings } from '../i18n.js';
import type { LayoutOptions, LayoutResult } from '../layout.js';
import type { LayoutContext } from '../layout-context.js';
import { buildAnchors } from '../nodes/anchor-node.js';
import { maxLeafItemRightX, maxSpilledCaptionRightX } from '../nodes/content-extent.js';
import { buildDependencies, collectItems } from '../nodes/dependency-edges.js';
import { buildFootnotePanel } from '../nodes/footnote-node.js';
import type { PositionedHeaderParts } from '../nodes/header-node.js';
import { fitIncludeRegionWidth, includeRegionWidth } from '../nodes/include-node.js';
import {
    calendarMarkerEntries,
    type MarkerBand,
    type MarkerEntity,
    markerLabelsRightX,
    markerRowPlacements,
    nonWorkingRunMarkerId,
    packMarkerRow,
    workingExceptionMarkerId,
} from '../nodes/marker-band.js';
import { MARKER_ROW_PITCH_PX } from '../nodes/marker-geometry.js';
import { positionMilestones } from '../nodes/milestone-node.js';
import { buildNowline } from '../nodes/nowline-node.js';
import { regionMarkerCanvasRightX } from '../nodes/region-markers.js';
import { type BuiltWaves, buildWaveLegend, buildWaves } from '../nodes/wave-node.js';
import { estimateTextWidth } from '../text-measure.js';
import {
    ATTRIBUTION_GLYPH_HEIGHT,
    ATTRIBUTION_GLYPH_WIDTH,
    GUTTER_PX,
    NOW_PILL_HEIGHT_PX,
    WAVE_LEGEND_GAP_PX,
} from '../themes/shared.js';
import { TimeScale } from '../time-scale.js';
import type {
    BoundingBox,
    MarkerRowPlacement,
    PositionedAnchor,
    PositionedDependencyEdge,
    PositionedFootnoteArea,
    PositionedMilestone,
    PositionedNowline,
    PositionedRoadmap,
    PositionedWaveLegend,
} from '../types.js';
import { buildHeaderTicks, tickBoundaryAtOrAfter } from '../view-preset.js';
import type { DateWindow, RoadmapScope } from './date-window.js';
import { headerRowsTimelineY, type MeasuredRoadmap, setCalendarRuns } from './measure.js';
import type { PlacedChart } from './place.js';

/** Gap (px) between the chart bottom and a mirrored bottom tick panel. */
const BOTTOM_TICK_PANEL_GAP_PX = 8;

/**
 * The canvas right edge. `grow` is the single mutator: every artifact that
 * wants the canvas wider passes the absolute x it must contain, its
 * breathing room (typically `GUTTER_PX`) included. Today: item caption
 * spills (f1), the timeline extension (f2) and marker-row labels (f3).
 * f3 freezes it; `final` reads it only after that.
 *
 * The now-pill is intentionally NOT a contributor — when the line lands
 * close to either edge, `buildNowline` switches the pill to "flag" mode
 * (squared edge against the line, rounded edge into the chart), so the
 * pill always fits inside the canvas.
 */
export class CanvasExtent {
    private frozen = false;

    constructor(private rightX: number) {}

    /** Grow the canvas to contain `x`; returns whether it grew. Throws once frozen. */
    grow(x: number): boolean {
        if (this.frozen) {
            throw new Error('layout: the canvas grew after it was frozen');
        }
        if (x <= this.rightX) return false;
        this.rightX = x;
        return true;
    }

    /** The canvas is final from here on. */
    freeze(): void {
        this.frozen = true;
    }

    /** The right edge so far. Only the step that freezes the canvas (f3) reads it before `final`. */
    get provisional(): number {
        return this.rightX;
    }

    /** The final right edge. Throws before `freeze`. */
    get final(): number {
        if (!this.frozen) {
            throw new Error('layout: the canvas was read before it was final');
        }
        return this.rightX;
    }
}

/** The pieces of the model the steps produce. Each is set once, by its step. */
export interface ModelDraft {
    /** Every marker with its final x, and how many of them are calendar labels (f3). */
    markerEntries?: { all: MarkerEntity[]; calendarCount: number };
    milestones?: PositionedMilestone[];
    waves?: BuiltWaves;
    anchors?: PositionedAnchor[];
    edges?: PositionedDependencyEdge[];
    nowline?: PositionedNowline | null;
    waveLegend?: PositionedWaveLegend;
    footnotes?: PositionedFootnoteArea;
    header?: PositionedHeaderParts;
    attributionBox?: BoundingBox;
    /** The canvas height, below the attribution mark. */
    height?: number;
}

/**
 * The top of the header rows on the final axis. The measure phase reserves
 * the now-pill row only when `today` falls inside the natural window; when
 * the axis extension (f2) brings `today` in, the pill row is reserved here
 * (L2, specs/layout-phases.md §1.3), and the tick panel, wave strip and
 * marker band below it move down by `shift`.
 */
export interface HeaderRowsTop {
    timelineY: number;
    pillRowHeight: number;
    tickPanelY: number;
    /** The marker band's top, where f5 packs it. */
    markerRowY: number;
    /** How far the tick panel, wave strip and marker band move down from the measure. */
    shift: number;
}

/**
 * Reports whether a finalize step changed something and, for a step that
 * says (`FinalizeContext.explain`), why; see `setFinalizeTrace`.
 */
export type FinalizeTrace = (step: string, changed: boolean, why?: readonly string[]) => void;

/**
 * What passed the natural window when f2 grew the axis (specs/layout-phases.md
 * §9, F3): a leaf item bar (a bug: the schedule's extent and the placement
 * disagree), a spilled caption (its one capped column), a date-pinned marker
 * (a dated anchor or milestone on the last day), or an after-only milestone
 * on the window end (decision 14). A diamond sits on its day, so its right
 * half passes a window that ends on that day.
 */
export type TimelineExtensionCause = 'bar' | 'caption' | 'datedMarker' | 'afterMilestone';

let finalizeTrace: FinalizeTrace | undefined;

/**
 * Install (or, with `undefined`, remove) the `FinalizeTrace`. Internal: the
 * coverage register (`finalize-coverage.test.ts`) records with it which
 * steps change something on each sample.
 */
export function setFinalizeTrace(trace: FinalizeTrace | undefined): void {
    finalizeTrace = trace;
}

export class FinalizeContext {
    /** The canvas right edge: `grow` until f3 freezes it, `final` only after. */
    readonly canvas: CanvasExtent;
    /** Chart top, bottom of the lanes, bottom including the panels below them. */
    readonly chartY: { top: number; swimlaneBottom: number; bottom: number };
    /** Pieces of the model the steps produce. */
    readonly draft: ModelDraft = {};
    private scaleIsFinal = false;
    private band: MarkerBand | undefined;
    private rowsTop: HeaderRowsTop | undefined;
    private rowsBottom: number | undefined;
    private why: readonly string[] | undefined;

    constructor(
        readonly file: NowlineFile,
        readonly resolved: ResolveResult,
        readonly options: LayoutOptions,
        readonly scope: RoadmapScope,
        readonly window: DateWindow,
        readonly measured: MeasuredRoadmap,
        readonly chart: PlacedChart,
    ) {
        this.canvas = new CanvasExtent(measured.naturalChartRightX);
        // The chart extent lives on the placement context, which the node
        // builders (anchors, waves, the now-line) read; these accessors are
        // the finalize steps' view of it.
        const ctx = chart.ctx;
        this.chartY = {
            get top(): number {
                return ctx.chartTopY;
            },
            set top(y: number) {
                ctx.chartTopY = y;
            },
            get swimlaneBottom(): number {
                return ctx.swimlaneBottomY;
            },
            set swimlaneBottom(y: number) {
                ctx.swimlaneBottomY = y;
            },
            get bottom(): number {
                return ctx.chartBottomY;
            },
            set bottom(y: number) {
                ctx.chartBottomY = y;
            },
        };
    }

    /** The placement context of the kept pass. */
    get ctx(): LayoutContext {
        return this.chart.ctx;
    }

    /** The axis scale. f2 may replace it; `finalScale()` throws before f2 ran. */
    get scale(): TimeScale {
        return this.chart.ctx.scale;
    }

    finalScale(): TimeScale {
        if (!this.scaleIsFinal) {
            throw new Error('layout: the final scale was read before the timeline extension');
        }
        return this.chart.ctx.scale;
    }

    /** Replace the axis scale with an extended one (f2 only). */
    extendScale(scale: TimeScale): void {
        if (this.scaleIsFinal) {
            throw new Error('layout: the scale was extended after it was final');
        }
        this.chart.ctx.scale = scale;
    }

    /** The scale is final from here on (f2, whether or not it extended it). */
    settleScale(): void {
        this.scaleIsFinal = true;
    }

    /** The final marker pack, set by f5; reading it earlier throws. */
    markerBand(): MarkerBand {
        if (!this.band) {
            throw new Error('layout: the marker band was read before the final pack');
        }
        return this.band;
    }

    /** Set the final marker pack (f5 only); the context's placements become its. */
    setMarkerBand(band: MarkerBand): void {
        if (this.band) {
            throw new Error('layout: the marker band was packed twice');
        }
        this.band = band;
        this.chart.ctx.markerRowPlacements = band.placements;
    }

    /**
     * The header rows' top on the final axis. It reads the final scale, so
     * it throws before f2; f5 packs the marker band at it and f7 moves the
     * rows to it.
     */
    headerRowsTop(): HeaderRowsTop {
        if (!this.rowsTop) {
            this.rowsTop = resolveHeaderRowsTop(
                this.measured,
                this.options.today,
                this.finalScale(),
            );
        }
        return this.rowsTop;
    }

    /** The bottom of the grown header rows, set by f7; reading it earlier throws. */
    headerRowsBottom(): number {
        if (this.rowsBottom === undefined) {
            throw new Error('layout: the header rows bottom was read before the rows grew');
        }
        return this.rowsBottom;
    }

    /** Set the bottom of the grown header rows (f7 only). */
    setHeaderRowsBottom(y: number): void {
        if (this.rowsBottom !== undefined) {
            throw new Error('layout: the header rows grew twice');
        }
        this.rowsBottom = y;
    }

    /** Say why the running step changed something; its report carries it. */
    explain(why: readonly string[]): void {
        this.why = why;
    }

    /** Report a step's effect to the trace, when one is installed. */
    report(step: string, changed: boolean): void {
        finalizeTrace?.(step, changed, this.why);
        this.why = undefined;
    }
}

/**
 * The header rows' top once the axis is final. When the measure phase left
 * the pill row at 0 and `today` lies on the final axis, f2 brought it in:
 * the rows grow by `NOW_PILL_HEIGHT_PX` above the tick panel, and the
 * timeline y follows the beside-card rule (`headerRowsTimelineY`), so a
 * card that already pushed the rows down absorbs some or all of the pill
 * row instead of the rows growing by its full height.
 */
export function resolveHeaderRowsTop(
    measured: MeasuredRoadmap,
    today: Date | undefined,
    scale: TimeScale,
): HeaderRowsTop {
    const { bands, header } = measured;
    const pillRowBroughtIn =
        bands.pillRowHeight === 0 &&
        today !== undefined &&
        scale.forwardWithinDomain(today) !== null;
    if (!pillRowBroughtIn) {
        return {
            timelineY: bands.timelineY,
            pillRowHeight: bands.pillRowHeight,
            tickPanelY: bands.tickPanelY,
            markerRowY: bands.markerRowY,
            shift: 0,
        };
    }
    const timelineY = headerRowsTimelineY(header, NOW_PILL_HEIGHT_PX + bands.rowsHeight);
    const tickPanelY = timelineY + NOW_PILL_HEIGHT_PX;
    const shift = tickPanelY - bands.tickPanelY;
    return {
        timelineY,
        pillRowHeight: NOW_PILL_HEIGHT_PX,
        tickPanelY,
        markerRowY: bands.markerRowY + shift,
        shift,
    };
}

/**
 * What a finalize step reads or writes. `placement` is everything place
 * left (lanes, regions, items, milestone x, the date-pinned markers),
 * `window` the date window and `headerBands` the measured header rows;
 * the rest are the slots finalize produces.
 */
export type FinalizeSlot =
    | 'placement'
    | 'window'
    | 'headerBands'
    | 'canvas'
    | 'scale'
    | 'timeline'
    | 'calendarRuns'
    | 'markerEntries'
    | 'laneWidths'
    | 'markerBand'
    | 'milestones'
    | 'calendarLabels'
    | 'markerMidpoints'
    | 'chartTop'
    | 'rowsBottom'
    | 'laneBottom'
    | 'chartBottom'
    | 'laneY'
    | 'waves'
    | 'anchors'
    | 'edges'
    | 'nowline'
    | 'legend'
    | 'footnotes'
    | 'header'
    | 'attribution';

/**
 * The rule a slot follows:
 * - `input`: nothing in finalize writes it.
 * - `final`: steps up to `finalAfter` may write it, none after; only
 *   `finalAfter` itself may read it before then.
 * - `cursor`: only the `advancers` write it (each reads it as it advances
 *   it); every other reader comes after the last advancer.
 * - `product`: one step writes it; readers come after that step.
 */
export type SlotRule =
    | { kind: 'input' }
    | { kind: 'final'; finalAfter: string }
    | { kind: 'cursor'; advancers: readonly string[] }
    | { kind: 'product' };

export const SLOT_RULES: Readonly<Record<FinalizeSlot, SlotRule>> = {
    placement: { kind: 'input' },
    window: { kind: 'input' },
    headerBands: { kind: 'input' },
    canvas: { kind: 'final', finalAfter: 'growCanvasForMarkerLabels' },
    scale: { kind: 'final', finalAfter: 'extendTimeline' },
    markerBand: { kind: 'final', finalAfter: 'packMarkers' },
    chartTop: { kind: 'final', finalAfter: 'growHeaderRows' },
    rowsBottom: { kind: 'final', finalAfter: 'growHeaderRows' },
    laneBottom: { kind: 'final', finalAfter: 'growHeaderRows' },
    chartBottom: {
        kind: 'cursor',
        advancers: ['growHeaderRows', 'bottomTickPanel', 'waveLegend'],
    },
    timeline: {
        kind: 'cursor',
        advancers: ['extendTimeline', 'growHeaderRows', 'bottomTickPanel', 'waves'],
    },
    milestones: { kind: 'cursor', advancers: ['placeMarkers', 'growHeaderRows'] },
    markerMidpoints: { kind: 'cursor', advancers: ['placeMarkers', 'anchors'] },
    calendarRuns: { kind: 'product' },
    markerEntries: { kind: 'product' },
    laneWidths: { kind: 'product' },
    calendarLabels: { kind: 'product' },
    laneY: { kind: 'product' },
    waves: { kind: 'product' },
    anchors: { kind: 'product' },
    edges: { kind: 'product' },
    nowline: { kind: 'product' },
    legend: { kind: 'product' },
    footnotes: { kind: 'product' },
    header: { kind: 'product' },
    attribution: { kind: 'product' },
};

export interface FinalizeStep {
    readonly name: string;
    readonly reads: readonly FinalizeSlot[];
    readonly writes: readonly FinalizeSlot[];
    /** Run the step; returns whether it changed something (for the coverage trace). */
    run(fx: FinalizeContext): boolean;
}

/**
 * Every way `steps` breaks `rules`, as one message each; empty when the
 * order holds.
 */
export function checkFinalizeOrder(
    steps: readonly FinalizeStep[],
    rules: Readonly<Record<FinalizeSlot, SlotRule>> = SLOT_RULES,
): string[] {
    const problems: string[] = [];
    const indexOf = new Map<string, number>();
    steps.forEach((step, i) => {
        if (indexOf.has(step.name)) problems.push(`step ${step.name} is listed twice`);
        indexOf.set(step.name, i);
    });
    const slots = new Set<FinalizeSlot>();
    for (const step of steps) {
        for (const slot of [...step.reads, ...step.writes]) slots.add(slot);
    }
    for (const slot of slots) {
        const rule = rules[slot];
        const writers = steps.flatMap((s, i) => (s.writes.includes(slot) ? [i] : []));
        const readers = steps.flatMap((s, i) => (s.reads.includes(slot) ? [i] : []));
        const name = (i: number): string => steps[i].name;
        switch (rule.kind) {
            case 'input':
                for (const w of writers) problems.push(`${name(w)} writes the input ${slot}`);
                break;
            case 'final': {
                const f = indexOf.get(rule.finalAfter);
                if (f === undefined || !steps[f].writes.includes(slot)) {
                    problems.push(
                        `${rule.finalAfter} must make ${slot} final but does not write it`,
                    );
                    break;
                }
                for (const w of writers) {
                    if (w > f)
                        problems.push(`${name(w)} writes ${slot} after ${name(f)} made it final`);
                }
                for (const r of readers) {
                    if (r < f)
                        problems.push(`${name(r)} reads ${slot} before ${name(f)} makes it final`);
                }
                break;
            }
            case 'cursor': {
                const advancers = rule.advancers.map((a) => indexOf.get(a));
                if (advancers.some((a) => a === undefined)) {
                    problems.push(`a step that advances ${slot} is missing`);
                    break;
                }
                const last = Math.max(...(advancers as number[]));
                for (const w of writers) {
                    if (!rule.advancers.includes(name(w))) {
                        problems.push(`${name(w)} writes ${slot}, which only its advancers write`);
                    }
                }
                for (const r of readers) {
                    if (!rule.advancers.includes(name(r)) && r < last) {
                        problems.push(`${name(r)} reads ${slot} before ${name(last)} advances it`);
                    }
                }
                break;
            }
            case 'product': {
                if (writers.length !== 1) {
                    problems.push(`${slot} has ${writers.length} writers, not one`);
                    break;
                }
                for (const r of readers) {
                    if (r < writers[0]) {
                        problems.push(
                            `${name(r)} reads ${slot} before ${name(writers[0])} writes it`,
                        );
                    }
                }
                break;
            }
        }
    }
    return problems;
}

/** f1 (was P3): grow the canvas to the rightmost spilled caption. */
function growCanvasForSpill(fx: FinalizeContext): boolean {
    // Otherwise the long captions on narrow charts — e.g.
    // `examples/minimal.svg` and `tests/text-spills-right.svg` — would
    // land outside the SVG's viewBox and clip in browsers. The marker
    // pack (f5) sees the expanded width and picks a less aggressive
    // label side.
    return fx.canvas.grow(fx.chart.maxRightX + GUTTER_PX);
}

/**
 * f2 (was P7): extend the axis when content passes the natural window.
 * The window is engine C's extent, which every bar's dates fall inside;
 * what passes it is a spilled caption and the right half of a diamond on
 * the window's last day (specs/layout-phases.md §9, F3). Measure the
 * rightmost CONTENT BOX edge — leaf item bars (never a spilled caption,
 * see `maxLeafItemRightX`) and marker diamonds — and grow the window to
 * the next tick boundary when content overflows it. A spilled caption past
 * that end grows it by one more full column at most, labelled by the
 * same rules as any other column: the item measure capped the caption to
 * end inside it (`AxisColumns.captionCapX`). This is driven
 * purely by boxes, never by `today`, so the `length:`-as-minimum and
 * now-line boundary behaviour is unaffected. Origin and pixels per day
 * stay, so every placed x stays valid.
 */
function extendTimeline(fx: FinalizeContext): boolean {
    const { swimlanes, includes, milestones } = fx.chart;
    const { calendar, preset: scale, startDate, spanDays, nonWorking } = fx.window;
    const { originX, ppd } = fx.measured.axis;
    const timeline = fx.measured.timeline;
    let barRightX = maxLeafItemRightX(swimlanes);
    for (const inc of includes) {
        barRightX = Math.max(barRightX, maxLeafItemRightX(inc.nestedSwimlanes));
    }
    let datedRightX = 0;
    for (const e of fx.measured.markers.datePinned) {
        datedRightX = Math.max(datedRightX, e.centerX + e.radius);
    }
    let afterRightX = 0;
    for (const m of milestones) {
        if (m.fixed) datedRightX = Math.max(datedRightX, m.x + m.radius);
        else afterRightX = Math.max(afterRightX, m.x + m.radius);
    }
    const maxContentRightX = Math.max(barRightX, datedRightX, afterRightX);
    const tickDays = calendar.daysPerUnit(scale.unit);
    // Working-day counts on both sides of the comparison: under `show` x
    // is linear in calendar days, so the overflow is read back through
    // the scale and the window keeps its working-day span.
    const overflowDays = fx.scale.showsNonWorking
        ? fx.scale.indexAtX(maxContentRightX)
        : (maxContentRightX - originX) / ppd;
    let paddedDays =
        overflowDays > 0
            ? tickBoundaryAtOrAfter(startDate, overflowDays, scale.unit, tickDays, calendar)
            : 0;
    // A spilled caption past the axis end grows it by one column, the one
    // the item measure capped the caption to; `label-every`, the default
    // thinning and the narrow-column rules label it like any other column
    // (specs/scheduler-unification.md §8 decision 12). Under an explicit
    // `length:` that ends mid-column the column is the full one after the
    // partial last column. A caption the cap could not bring inside (its
    // meta line is never truncated) still grows the axis by that one column
    // only.
    let captionRightX = maxSpilledCaptionRightX(swimlanes);
    for (const inc of includes) {
        captionRightX = Math.max(captionRightX, maxSpilledCaptionRightX(inc.nestedSwimlanes));
    }
    const columns = new AxisColumns(fx.window, fx.scale);
    if (captionRightX > 0) {
        const axisDays = Math.max(spanDays, paddedDays);
        if (columns.isPast(captionRightX, axisDays)) {
            paddedDays = Math.max(
                paddedDays,
                Math.min(
                    columns.boundaryAtOrAfterX(captionRightX),
                    columns.captionColumn(axisDays).end,
                ),
            );
        }
    }
    let extended = false;
    if (paddedDays > spanDays) {
        // For the trace: every kind of content past the natural window.
        const rightX: Record<TimelineExtensionCause, number> = {
            bar: barRightX,
            caption: captionRightX,
            datedMarker: datedRightX,
            afterMilestone: afterRightX,
        };
        fx.explain(
            (Object.keys(rightX) as TimelineExtensionCause[]).filter(
                (cause) => rightX[cause] > 0 && columns.isPast(rightX[cause], spanDays),
            ),
        );
        const extendedEndDate = calendar.dateAtWorkingIndex(startDate, paddedDays);
        const extendedWidth = fx.scale.showsNonWorking
            ? daysBetween(startDate, extendedEndDate) * ppd
            : paddedDays * ppd;
        const extendedScale = new TimeScale({
            domain: [startDate, extendedEndDate],
            range: [originX, originX + extendedWidth],
            calendar,
            nonWorking,
        });
        fx.extendScale(extendedScale);
        timeline.endDate = extendedEndDate;
        timeline.box.width = extendedWidth;
        timeline.ticks = buildHeaderTicks(extendedScale, scale, calendar, fx.scope.locale);
        setCalendarRuns(timeline, extendedScale, scale.unit);
        fx.canvas.grow(originX + extendedWidth + GUTTER_PX);
        extended = true;
    }
    fx.settleScale();
    return extended;
}

/**
 * f3 (was P8): every marker (date-pinned anchor, date-pinned milestone,
 * after-only milestone, titled run, working exception) with its final
 * centerX. Calendar labels come from the final runs and exceptions: f2
 * rebuilt them, so never the measure phase's copies. A label that fits
 * neither side grows the canvas so the final pack places it right. The
 * canvas is final after this step.
 */
function growCanvasForMarkerLabels(fx: FinalizeContext): boolean {
    const timeline = fx.measured.timeline;
    const all: MarkerEntity[] = fx.measured.markers.datePinned.map((e) => ({
        id: e.id,
        centerX: e.centerX,
        radius: e.radius,
        title: e.title,
        fontSize: e.fontSize,
        bold: e.bold,
    }));
    for (const m of fx.chart.milestones) {
        if (m.fixed) continue;
        all.push({
            id: m.id,
            centerX: m.x,
            radius: m.radius,
            title: m.title,
            fontSize: 10,
            bold: true,
        });
    }
    const runEntries = calendarMarkerEntries(timeline.nonWorking, timeline.workingExceptions);
    all.push(...runEntries);
    fx.draft.markerEntries = { all, calendarCount: runEntries.length };
    let rightX = markerLabelsRightX(
        all,
        fx.measured.header.chartLeftX,
        fx.canvas.provisional,
        estimateTextWidth,
    );
    // An isolated region's own marker labels grow it the same way, inside
    // the region's insets (placement packed them against the natural canvas).
    for (const inc of fx.chart.includes) {
        rightX = Math.max(rightX, regionMarkerCanvasRightX(inc, fx.canvas.provisional));
    }
    const grew = fx.canvas.grow(rightX);
    fx.canvas.freeze();
    return grew;
}

/**
 * f4 (was P9, N2, N4): placement left every width that spans the canvas
 * unset. Stretch every lane band to the final canvas so the lane
 * background contains its own spilled captions (text-spills-right's
 * "1w — 50% remaining" would otherwise sit outside it) and reaches the
 * extended tick panel, and fit each region so its right-edge clamp reads
 * the final width.
 */
function fitWidths(fx: FinalizeContext): boolean {
    const chartRightX = fx.canvas.final;
    const natural = fx.measured.naturalChartRightX;
    // Changed: a width differs from the one the natural canvas would give.
    let changed = fx.chart.swimlanes.length > 0 && chartRightX !== natural;
    for (const lane of fx.chart.swimlanes) {
        lane.box.width = chartRightX;
    }
    for (const inc of fx.chart.includes) {
        if (includeRegionWidth(inc, chartRightX) !== includeRegionWidth(inc, natural)) {
            changed = true;
        }
        fitIncludeRegionWidth(inc, chartRightX);
    }
    return changed;
}

/**
 * f5 (was P10): pack every marker once, against the final canvas, so
 * `packMarkerRow` can sort by tick and assign rows and label sides
 * bottom-first. This is the single source of the context's marker
 * placements from here on; the measure phase's pre-pack only sized the
 * band before the lanes ran. The band sits at its final top: below a
 * now-pill row that f7 reserves when f2 brought `today` into the axis.
 */
function packMarkers(fx: FinalizeContext): boolean {
    const entries = need(fx.draft.markerEntries, 'the marker entries');
    const repacked = packMarkerRow(
        entries.all,
        fx.measured.header.chartLeftX,
        fx.canvas.final,
        estimateTextWidth,
    );
    const placements = markerRowPlacements(repacked.placements, fx.headerRowsTop().markerRowY);
    const rowCount =
        fx.measured.markers.hasEntities || entries.calendarCount > 0
            ? Math.max(1, repacked.rowCount)
            : 0;
    fx.setMarkerBand({ rowCount, placements });
    // Changed: a pre-packed marker moved.
    let moved = false;
    for (const [id, estimate] of fx.measured.markers.placements) {
        const p = placements.get(id);
        if (!p || !samePlacement(estimate, p)) moved = true;
    }
    return moved;
}

/**
 * f6 (was P11, N7): build the positioned milestones from their placements
 * and the final pack (a slack or overrun arrow from an anchor or milestone
 * starts on that marker's final row), then push the final placements onto
 * the titled runs, the working exceptions and every marker's entity
 * midpoint (used by edge routing).
 */
function placeMarkers(fx: FinalizeContext): boolean {
    const band = fx.markerBand();
    const ctx = fx.ctx;
    const timeline = fx.measured.timeline;
    const milestones = positionMilestones(fx.chart.milestones, band.placements);
    // Changed: a milestone's marker row differs from the estimate its
    // placement wrote into the entity midpoints.
    const moved = milestones.some((m) => ctx.entityMidpoints.get(m.id ?? '')?.y !== m.center.y);
    for (const run of timeline.nonWorking ?? []) {
        if (run.label === undefined) continue;
        const placement = band.placements.get(nonWorkingRunMarkerId(run));
        if (!placement) continue;
        run.labelBox = placement.labelBox;
        run.labelSide = placement.labelSide;
    }
    for (const exception of timeline.workingExceptions ?? []) {
        const placement = band.placements.get(workingExceptionMarkerId(exception));
        if (!placement) continue;
        exception.labelBox = placement.labelBox;
        exception.labelSide = placement.labelSide;
    }
    for (const e of fx.measured.markers.datePinned) {
        const p = band.placements.get(e.id);
        if (!p) continue;
        ctx.entityMidpoints.set(e.id, { x: e.centerX, y: p.centerY });
    }
    for (const m of milestones) {
        if (m.fixed) continue;
        ctx.entityMidpoints.set(m.id ?? '', { x: m.center.x, y: m.center.y });
    }
    fx.draft.milestones = milestones;
    return moved;
}

/**
 * f7 (was P12): grow the header rows to what the final axis and the final
 * marker pack need, then translate the chart, which placement laid out
 * with its top at 0, to its top below them, in one translation on every
 * layout. The rows grow at two places: the now-pill row above the tick
 * panel, when f2 brought `today` into the axis (L2; the tick panel, wave
 * strip and marker band move down with it, and f5 already packed the band
 * there), and the marker band's bottom, when the final pack needs more
 * rows than the estimate. Every later step reads the grown values.
 */
function growHeaderRows(fx: FinalizeContext): boolean {
    const band = fx.markerBand();
    const rowsTop = fx.headerRowsTop();
    const bands = fx.measured.bands;
    const estimatedRows = bands.estimatedMarkerRows;
    const ctx = fx.ctx;
    const timeline = ctx.timeline;
    let changed = false;
    if (rowsTop.pillRowHeight !== bands.pillRowHeight) {
        timeline.box.y = rowsTop.timelineY;
        timeline.pillRowHeight = rowsTop.pillRowHeight;
        timeline.tickPanelY = rowsTop.tickPanelY;
        if (timeline.waveStrip) timeline.waveStrip.y += rowsTop.shift;
        timeline.markerRow.y += rowsTop.shift;
        timeline.markerRow.collisionY += rowsTop.shift;
        changed = true;
    }
    let deltaY = rowsTop.shift;
    if (band.rowCount > estimatedRows) {
        deltaY += (band.rowCount - estimatedRows) * MARKER_ROW_PITCH_PX;
        timeline.markerRow.height = band.rowCount * MARKER_ROW_PITCH_PX;
        changed = true;
    }
    // The beside card hugs this bottom (f15).
    fx.setHeaderRowsBottom(rowsTop.markerRowY + timeline.markerRow.height);
    const topY = bands.chartTopY + deltaY;
    fx.chartY.top = topY;
    fx.chartY.bottom += topY;
    fx.chartY.swimlaneBottom += topY;
    timeline.box.height = fx.chartY.bottom - timeline.box.y;
    // The translation moves every y the chart's positioned model carries
    // (see `chart-translation.ts`). No LayoutContext map needs it: item
    // attach ports are derived from the (now-translated) boxes in
    // `placedItems` when edges are built (f11), the edge maps hold x only,
    // itemFlowKey holds strings, marker midpoints and markerRowPlacements
    // sit in the header, and slackCorridors are pass-2 inputs consumed
    // during placement. A milestone's arrow from a marker sits in the
    // header too, on the row f6 gave it, so only its item arrows move.
    for (const lane of fx.chart.swimlanes) translateSwimlaneY(lane, topY);
    for (const inc of fx.chart.includes) translateIncludeY(inc, topY);
    const placements = fx.chart.milestones;
    const milestones = need(fx.draft.milestones, 'the milestones');
    for (let i = 0; i < milestones.length; i++) {
        translateMilestoneChartY(milestones[i], placements[i], topY);
    }
    return changed;
}

/**
 * f8 (was P13): the mirrored bottom tick panel, directly above the
 * footnote area and below the last lane or region, at the chart bottom
 * after any marker-band growth. `timeline.box.height` stays anchored to
 * the chart's bottom edge — grid lines therefore stop at the panel's TOP,
 * not at its bottom — while the panel gets its own fill, border and
 * labels in the renderer. Milestone and anchor cut lines stay anchored to
 * the lane bottom so they never invade the bottom date strip; only the
 * now-line (and full-height major grid lines) thread through this panel.
 */
function bottomTickPanel(fx: FinalizeContext): boolean {
    const height = fx.measured.bands.bottomTickPanelHeight;
    if (height <= 0) return false;
    fx.ctx.timeline.bottomTickPanelY = fx.chartY.bottom + BOTTOM_TICK_PANEL_GAP_PX;
    fx.ctx.timeline.bottomTickPanelHeight = height;
    fx.chartY.bottom += BOTTOM_TICK_PANEL_GAP_PX + height;
    return true;
}

/**
 * f9 (was P14): the positioned waves (specs/waves.md §8.7), after the
 * axis extension (final scale) and the marker-band shift, so the columns,
 * the boundaries and the crossings read final geometry.
 */
function waves(fx: FinalizeContext): boolean {
    fx.finalScale();
    const ctx = fx.ctx;
    if (!ctx.waves) return false;
    const built = buildWaves(
        ctx.waves,
        ctx,
        localeStrings(fx.scope.locale),
        fx.chart.swimlanes,
        fx.chart.includes,
    );
    built.regionCrossings.forEach((crossings, i) => {
        if (crossings.length > 0) fx.chart.includes[i].waveCrossings = crossings;
    });
    if (built.placeholder !== undefined && ctx.timeline.waveStrip) {
        ctx.timeline.waveStrip.placeholder = built.placeholder;
    }
    fx.draft.waves = built;
    return true;
}

/** f10 (was P15): the anchors from the final pack, scale and chart y. */
function anchors(fx: FinalizeContext): boolean {
    fx.finalScale();
    fx.markerBand();
    const milestoneXs = new Set<number>(
        need(fx.draft.milestones, 'the milestones').map((m) => m.center.x),
    );
    const built = buildAnchors(fx.resolved.content.anchors, fx.ctx, milestoneXs);
    fx.draft.anchors = built;
    return built.length > 0;
}

/**
 * f11 (was P16): dependency edges, their ports read off the final boxes.
 * Each isolated region routes its own, among its own lanes: its `after:`
 * references resolve only inside it.
 */
function dependencyEdges(fx: FinalizeContext): boolean {
    const itemsMap = collectItems(fx.chart.laneEntries);
    const edges = buildDependencies(itemsMap, fx.chart.swimlanes, fx.chart.includes, fx.ctx);
    fx.draft.edges = edges;
    let regionEdgeCount = 0;
    fx.resolved.content.isolatedRegions.forEach((region, i) => {
        const inc = fx.chart.includes[i];
        const regionCtx = fx.chart.regionContexts[i];
        if (!inc || !regionCtx) return;
        const regionEdges = buildDependencies(
            collectItems([...region.content.swimlanes.values()]),
            inc.nestedSwimlanes,
            [],
            regionCtx,
        );
        if (regionEdges.length > 0) inc.edges = regionEdges;
        regionEdgeCount += regionEdges.length;
    });
    return edges.length + regionEdgeCount > 0;
}

/**
 * f12 (was P17): the now-line on the final scale and canvas, when today
 * falls inside the axis. It stops at the bottom tick panel when there is
 * one, otherwise at the last lane; footnote panels below do not extend it.
 */
function nowline(fx: FinalizeContext): boolean {
    fx.finalScale();
    const line = buildNowline(fx.options.today, fx.ctx, fx.scope.locale, fx.canvas.final);
    fx.draft.nowline = line;
    return line !== null;
}

/**
 * f13 (was P18): the wave legend (specs/waves.md §8.8, §9.5) sits below
 * the chart and any bottom tick panel, above the footnotes: grow the chart
 * bottom by its gap and lines before the footnote panel is placed.
 */
function waveLegend(fx: FinalizeContext): boolean {
    const built = fx.draft.waves;
    if (!built) return false;
    const legend = buildWaveLegend(
        built,
        fx.ctx,
        localeStrings(fx.scope.locale),
        fx.chartY.bottom + WAVE_LEGEND_GAP_PX,
        fx.canvas.final,
    );
    if (!legend) return false;
    fx.chartY.bottom += WAVE_LEGEND_GAP_PX + legend.box.height;
    fx.draft.waveLegend = legend;
    return true;
}

/** f14 (was P19): the footnote panel at the bottom: the host's footnotes, then each region's. */
function footnotePanel(fx: FinalizeContext): boolean {
    const regions = fx.resolved.content.isolatedRegions.flatMap((region, i) => {
        const regionCtx = fx.chart.regionContexts[i];
        const inc = fx.chart.includes[i];
        return regionCtx && inc
            ? [{ title: inc.label, footnotes: region.content.footnotes, ctx: regionCtx }]
            : [];
    });
    const panel = buildFootnotePanel(
        fx.resolved.content.footnotes,
        fx.ctx,
        fx.chartY.bottom,
        fx.canvas.final,
        regions,
    );
    fx.draft.footnotes = panel;
    return panel.entries.length > 0;
}

/**
 * f15 (was P20): the header, from the chart height in beside mode and the
 * final canvas width in above mode. The beside card hugs the header rows'
 * bottom after f7 grew them (F1: before, it hugged the measure phase's
 * estimate and missed a grown marker band or a reserved now-pill row).
 */
function header(fx: FinalizeContext): boolean {
    const { header: measuredHeader, headerNode } = fx.measured;
    fx.draft.header = headerNode.place(measuredHeader, {
        rowsBottomY: fx.headerRowsBottom(),
        chartBottomY: fx.chartY.bottom,
        canvasRightX: fx.canvas.final,
    });
    return measuredHeader.position === 'beside';
}

/**
 * f16 (was P20): the attribution wordmark and the canvas height. The
 * canvas grows by GUTTER_PX + glyph height + GUTTER_PX so the wordmark
 * sits in a clean bottom margin below all content (last lane, footnote
 * panel or region). Today only the bottom-right slot fires, but the
 * priority order is bottom-right → upper-right → bottom-left — when
 * content density makes bottom-right disruptive in some future case, fall
 * back to upper-right (above the timeline) and then bottom-left (under
 * the header card in beside mode).
 */
function attribution(fx: FinalizeContext): boolean {
    const footnotes = need(fx.draft.footnotes, 'the footnote panel');
    const chartRightX = fx.canvas.final;
    // When there are no footnotes, the panel box still carries a 16 px
    // top-of-panel offset; that's a placeholder for the footnote header
    // gap and shouldn't push the attribution down. Use the bare chart
    // bottom in that case so the bottom margin is exactly
    // `GUTTER_PX + glyphHeight + GUTTER_PX`.
    const contentBottomY =
        footnotes.entries.length > 0 ? footnotes.box.y + footnotes.box.height : fx.chartY.bottom;
    const attributionBox: BoundingBox = {
        x: chartRightX - GUTTER_PX - ATTRIBUTION_GLYPH_WIDTH,
        y: contentBottomY + GUTTER_PX,
        width: ATTRIBUTION_GLYPH_WIDTH,
        height: ATTRIBUTION_GLYPH_HEIGHT,
    };
    fx.draft.attributionBox = attributionBox;
    fx.draft.height = attributionBox.y + attributionBox.height + GUTTER_PX;
    return true;
}

/** The finalize pass, in order (specs/layout-phases.md §3.5). */
export const FINALIZE_STEPS: readonly FinalizeStep[] = [
    {
        name: 'growCanvasForSpill',
        reads: ['placement'],
        writes: ['canvas'],
        run: growCanvasForSpill,
    },
    {
        name: 'extendTimeline',
        reads: ['placement', 'window', 'scale'],
        writes: ['scale', 'timeline', 'calendarRuns', 'canvas'],
        run: extendTimeline,
    },
    {
        name: 'growCanvasForMarkerLabels',
        reads: ['placement', 'calendarRuns', 'canvas'],
        writes: ['markerEntries', 'canvas'],
        run: growCanvasForMarkerLabels,
    },
    {
        name: 'fitWidths',
        reads: ['placement', 'canvas'],
        writes: ['laneWidths'],
        run: fitWidths,
    },
    {
        name: 'packMarkers',
        reads: ['canvas', 'markerEntries', 'headerBands', 'scale'],
        writes: ['markerBand'],
        run: packMarkers,
    },
    {
        name: 'placeMarkers',
        reads: ['placement', 'markerBand', 'calendarRuns'],
        writes: ['milestones', 'calendarLabels', 'markerMidpoints'],
        run: placeMarkers,
    },
    {
        name: 'growHeaderRows',
        reads: [
            'placement',
            'markerBand',
            'headerBands',
            'scale',
            'milestones',
            'chartTop',
            'laneBottom',
        ],
        writes: [
            'chartTop',
            'rowsBottom',
            'laneBottom',
            'chartBottom',
            'laneY',
            'milestones',
            'timeline',
        ],
        run: growHeaderRows,
    },
    {
        name: 'bottomTickPanel',
        reads: ['headerBands', 'chartBottom'],
        writes: ['chartBottom', 'timeline'],
        run: bottomTickPanel,
    },
    {
        name: 'waves',
        reads: ['scale', 'chartTop', 'laneBottom', 'timeline', 'laneY'],
        writes: ['waves', 'timeline'],
        run: waves,
    },
    {
        name: 'anchors',
        reads: ['scale', 'markerBand', 'chartTop', 'laneBottom', 'milestones'],
        writes: ['anchors', 'markerMidpoints'],
        run: anchors,
    },
    {
        name: 'dependencyEdges',
        reads: ['laneY', 'markerMidpoints'],
        writes: ['edges'],
        run: dependencyEdges,
    },
    {
        name: 'nowline',
        reads: ['scale', 'canvas', 'laneBottom', 'timeline'],
        writes: ['nowline'],
        run: nowline,
    },
    {
        name: 'waveLegend',
        reads: ['waves', 'canvas', 'chartBottom'],
        writes: ['legend', 'chartBottom'],
        run: waveLegend,
    },
    {
        name: 'footnotePanel',
        reads: ['chartBottom', 'canvas'],
        writes: ['footnotes'],
        run: footnotePanel,
    },
    {
        name: 'header',
        reads: ['chartBottom', 'canvas', 'rowsBottom'],
        writes: ['header'],
        run: header,
    },
    {
        name: 'attribution',
        reads: ['footnotes', 'chartBottom', 'canvas'],
        writes: ['attribution'],
        run: attribution,
    },
];

/** Run the finalize pass over `fx` and assemble the positioned model. */
export function finalizeRoadmap(
    fx: FinalizeContext,
    steps: readonly FinalizeStep[] = FINALIZE_STEPS,
): LayoutResult {
    for (const step of steps) {
        fx.report(step.name, step.run(fx));
    }
    return assembleModel(fx);
}

function assembleModel(fx: FinalizeContext): PositionedRoadmap {
    const { draft } = fx;
    const { themeName, theme } = fx.scope;
    const { swimlanes, includes, waveSolve } = fx.chart;
    const chartRightX = fx.canvas.final;
    const chartLeftX = fx.measured.header.chartLeftX;
    const builtWaves = draft.waves;
    const waveLegend = draft.waveLegend;
    return {
        width: chartRightX,
        height: need(draft.height, 'the canvas height'),
        theme: themeName,
        palette: theme,
        backgroundColor: theme.surface.page,
        header: {
            ...need(draft.header, 'the header'),
            attributionBox: need(draft.attributionBox, 'the attribution box'),
        },
        timeline: fx.measured.timeline,
        nowline: need(draft.nowline, 'the now-line'),
        swimlanes,
        anchors: need(draft.anchors, 'the anchors'),
        milestones: need(draft.milestones, 'the milestones'),
        edges: need(draft.edges, 'the edges'),
        footnotes: need(draft.footnotes, 'the footnote panel'),
        includes,
        chartBox: {
            x: chartLeftX,
            y: fx.chartY.top,
            width: chartRightX - chartLeftX,
            height: fx.chartY.bottom - fx.chartY.top,
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
}

/** A step's product, which the step order guarantees is set. */
function need<T>(value: T | undefined, what: string): T {
    if (value === undefined) throw new Error(`layout: ${what} was read before its step ran`);
    return value;
}

function samePlacement(a: MarkerRowPlacement, b: MarkerRowPlacement): boolean {
    return (
        a.rowIndex === b.rowIndex &&
        a.centerY === b.centerY &&
        a.labelSide === b.labelSide &&
        a.labelBox.x === b.labelBox.x &&
        a.labelBox.y === b.labelBox.y &&
        a.labelBox.width === b.labelBox.width &&
        a.labelBox.height === b.labelBox.height
    );
}
