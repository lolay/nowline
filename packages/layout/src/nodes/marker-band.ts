// MarkerBand — the marker row's entries, packer and placements. Anchors,
// milestones, the titled non-working runs and the working exceptions all
// pack into one band of rows above the chart. The measure phase packs an
// estimate to size the band before any lane is placed; finalize packs
// every marker once the canvas is final (specs/layout-phases.md §3.3).
// Both build their entries and turn the packed rows into y positions
// with the helpers here; `markerLabelsRightX` sizes the canvas for the
// labels that fit on neither side.

import type { AnchorDeclaration, MilestoneDeclaration } from '@nowline/core';
import { parseIsoDate, propValue } from '../dsl-utils.js';
import { GUTTER_PX } from '../themes/shared.js';
import type { TimeScale } from '../time-scale.js';
import type {
    BoundingBox,
    MarkerRowPlacement,
    PositionedNonWorkingRun,
    PositionedWorkingException,
} from '../types.js';
import {
    MARKER_BOLD_WIDTH_FACTOR,
    MARKER_DIAMOND_RADIUS_PX,
    MARKER_LABEL_GAP_PX,
    MARKER_LABEL_HEIGHT_PX,
    MARKER_ROW_CENTER_OFFSET_PX,
    MARKER_ROW_PITCH_PX,
} from './marker-geometry.js';
import type { MilestonePlacement } from './milestone-node.js';

/** A packed marker band: its rows and each marker's placement at the band's y. */
export interface MarkerBand {
    /** Rows the band holds: at least 1 when it has any marker, else 0. */
    rowCount: number;
    placements: Map<string, MarkerRowPlacement>;
}

/** A marker pinned by its `date:`: a dated anchor or milestone inside the window. */
export type DatePinnedMarker = MarkerEntity & { date: Date; isMilestone: boolean };

/**
 * The date-pinned anchors, then the date-pinned milestones, each at the x
 * of its `date:`. A marker with no date, or a date outside the window,
 * is left out; after-only milestones are placed with the lanes.
 */
export function datePinnedMarkerEntries(
    anchors: ReadonlyMap<string, AnchorDeclaration>,
    milestones: ReadonlyMap<string, MilestoneDeclaration>,
    scale: TimeScale,
): DatePinnedMarker[] {
    const entries: DatePinnedMarker[] = [];
    const add = (
        id: string,
        decl: AnchorDeclaration | MilestoneDeclaration,
        isMilestone: boolean,
    ): void => {
        const date = parseIsoDate(propValue(decl.properties, 'date'));
        if (!date) return;
        const x = scale.forwardWithinDomain(date);
        if (x === null) return;
        entries.push({
            id,
            centerX: x,
            radius: MARKER_DIAMOND_RADIUS_PX,
            title: decl.title ?? id,
            fontSize: 10,
            bold: isMilestone,
            date,
            isMilestone,
        });
    };
    for (const [id, anchor] of anchors) add(id, anchor, false);
    for (const [id, milestone] of milestones) add(id, milestone, true);
    return entries;
}

/**
 * The calendar's marker-row entries: the titled non-working runs, then the
 * working exceptions. Callers append them after the anchors and
 * milestones.
 */
export function calendarMarkerEntries(
    runs: ReadonlyArray<PositionedNonWorkingRun> | undefined,
    exceptions: ReadonlyArray<PositionedWorkingException> | undefined,
): MarkerEntity[] {
    return [...nonWorkingRunEntries(runs), ...workingExceptionEntries(exceptions)];
}

/**
 * Each packed placement at the band's y: row `r`'s centre sits
 * `MARKER_ROW_CENTER_OFFSET_PX + r * MARKER_ROW_PITCH_PX` below
 * `markerRowY`, and its label box 4 px above the centre.
 */
export function markerRowPlacements(
    packed: ReadonlyMap<string, PackedPlacement>,
    markerRowY: number,
): Map<string, MarkerRowPlacement> {
    const out = new Map<string, MarkerRowPlacement>();
    for (const [id, p] of packed) {
        const centerY = markerRowY + MARKER_ROW_CENTER_OFFSET_PX + p.rowIndex * MARKER_ROW_PITCH_PX;
        out.set(id, {
            rowIndex: p.rowIndex,
            centerY,
            labelBox: { ...p.labelBox, y: centerY - 4 },
            labelSide: p.labelSide,
        });
    }
    return out;
}

/** The marker-row id of a titled non-working run: `nonworking:<ISO from>`. */
export function nonWorkingRunMarkerId(run: PositionedNonWorkingRun): string {
    return `nonworking:${run.from.toISOString().slice(0, 10)}`;
}

/** The marker-row id of a working exception: `working:<ISO from>`. */
export function workingExceptionMarkerId(exception: PositionedWorkingException): string {
    return `working:${exception.from.toISOString().slice(0, 10)}`;
}

/** A zero-radius marker-row entry for a calendar label at `x`. */
function calendarLabelEntry(id: string, x: number, label: string): MarkerEntity {
    return { id, centerX: x, radius: 0, title: label, fontSize: 10, bold: false };
}

/**
 * Marker-row entries for the titled runs (specs/working-calendar.md
 * §7.4): a zero-radius marker at the run's x (the seam under `hide`, the
 * band's left edge under `show`) whose title is the run's label. Callers
 * append them after the anchors and milestones, so the stable sort in
 * `packMarkerRow` places a marker that ties a run on x first.
 */
function nonWorkingRunEntries(
    runs: ReadonlyArray<PositionedNonWorkingRun> | undefined,
): MarkerEntity[] {
    const entries: MarkerEntity[] = [];
    for (const run of runs ?? []) {
        if (run.label === undefined) continue;
        entries.push(calendarLabelEntry(nonWorkingRunMarkerId(run), run.x, run.label));
    }
    return entries;
}

/**
 * Marker-row entries for the working exceptions (specs/working-calendar.md
 * §7.4), packed beside the titled runs' and on the same terms: a zero-radius
 * marker at the first turned day's x.
 */
function workingExceptionEntries(
    exceptions: ReadonlyArray<PositionedWorkingException> | undefined,
): MarkerEntity[] {
    return (exceptions ?? []).map((exception) =>
        calendarLabelEntry(workingExceptionMarkerId(exception), exception.x, exception.label),
    );
}

/**
 * The canvas right edge the marker-row labels need. A label (anchor,
 * milestone, titled run or working exception) that fits neither right of
 * its x (against `chartRightX`) nor left of it (against `chartLeftX`)
 * would fall back to the left and draw over a beside header card, so the
 * canvas grows to hold it on the right instead.
 */
export function markerLabelsRightX(
    entries: ReadonlyArray<MarkerEntity>,
    chartLeftX: number,
    chartRightX: number,
    estimateTextWidth: (text: string, fontSize: number) => number,
): number {
    let rightX = chartRightX;
    for (const e of entries) {
        const labelWidth = markerLabelWidth(e, estimateTextWidth);
        const rightEnd = e.centerX + e.radius + MARKER_LABEL_GAP_PX + labelWidth;
        const leftStart = e.centerX - e.radius - MARKER_LABEL_GAP_PX - labelWidth;
        if (rightEnd > chartRightX && leftStart < chartLeftX) {
            rightX = Math.max(rightX, rightEnd + GUTTER_PX);
        }
    }
    return rightX;
}

export interface MarkerEntity {
    id: string;
    centerX: number;
    radius: number;
    title: string;
    fontSize: number;
    bold: boolean;
}

/** A marker label's width: bold labels widen by `MARKER_BOLD_WIDTH_FACTOR`. */
function markerLabelWidth(
    e: MarkerEntity,
    estimateTextWidth: (text: string, fontSize: number) => number,
): number {
    return estimateTextWidth(e.title, e.fontSize) * (e.bold ? MARKER_BOLD_WIDTH_FACTOR : 1);
}

export interface PackedPlacement {
    rowIndex: number;
    labelBox: BoundingBox;
    labelSide: 'left' | 'right';
}

/**
 * A slack or overrun arrow between two markers, drawn on `from`'s row
 * between the two diamonds (specs/rendering.md, Milestones, "Marker
 * predecessors"). A milestone's arrow from a group or parallel starts on
 * the milestone's own row and is not one.
 */
export interface MarkerArrow {
    from: string;
    to: string;
}

/** The arrows between markers that `placements` draw, source to target. */
export function markerArrows(placements: readonly MilestonePlacement[]): MarkerArrow[] {
    const out: MarkerArrow[] = [];
    for (const p of placements) {
        for (const a of p.slackArrows ?? []) {
            if ('marker' in a && a.marker !== p.id) out.push({ from: a.marker, to: p.id });
        }
    }
    return out;
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
 * `arrows` (the marker-to-marker arrows, `markerArrows`) add three rules,
 * so an arrow crosses no other marker and ends on its target's line:
 *   - An arrow's run, on its source's row between the two diamonds, is
 *     reserved on that row like a label: no other diamond, label or run
 *     may overlap it.
 *   - A target sits at or above each source's row (cut lines run down
 *     from a diamond). A source whose target is placed and that fits no
 *     allowed row grows a fresh row right below the target instead of
 *     at the top; when the rules contradict (a marker both a source and
 *     a target on one row), it grows at the top.
 *   - A label takes a side its own arrows do not run along, when that
 *     side fits; otherwise it keeps the usual right-then-left order.
 * With no arrows the pack is unchanged.
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
    arrows: readonly MarkerArrow[] = [],
): { placements: Map<string, PackedPlacement>; rowCount: number } {
    const sorted = [...entries].sort((a, b) => a.centerX - b.centerX);
    const placements = new Map<string, PackedPlacement>();
    type Span = { left: number; right: number };
    let rowSpans: Span[][] = [];
    const byId = new Map(entries.map((e) => [e.id, e]));
    const knownArrows = arrows.filter((a) => byId.has(a.from) && byId.has(a.to));

    type Side = 'left' | 'right';
    for (const e of sorted) {
        const labelWidth = markerLabelWidth(e, estimateTextWidth);
        const naturalRightX = e.centerX + e.radius + MARKER_LABEL_GAP_PX;
        const naturalLeftX = e.centerX - e.radius - MARKER_LABEL_GAP_PX - labelWidth;
        const fitsRightCanvas = naturalRightX + labelWidth <= chartRightX;
        const fitsLeftCanvas = naturalLeftX >= chartLeftX;
        const diamondLeft = e.centerX - e.radius;
        const diamondRight = e.centerX + e.radius;

        const sideXLeft = (s: Side): number => (s === 'right' ? naturalRightX : naturalLeftX);
        const sideFitsCanvas = (s: Side): boolean =>
            s === 'right' ? fitsRightCanvas : fitsLeftCanvas;
        // The runs of e's own arrows, on e's row between the two diamonds.
        const runs: Span[] = knownArrows
            .filter((a) => a.from === e.id)
            .map((a) => {
                const to = byId.get(a.to) as MarkerEntity;
                return {
                    left: Math.min(e.centerX, to.centerX) + e.radius,
                    right: Math.max(e.centerX, to.centerX) - to.radius,
                };
            })
            .filter((r) => r.right > r.left);
        // An arrow meets its target's line only when the target sits at or
        // above the source's row (cut lines run down from a diamond).
        let minRow = -1;
        let maxRow = Number.POSITIVE_INFINITY;
        for (const a of knownArrows) {
            if (a.to === e.id) {
                const from = placements.get(a.from);
                if (from) maxRow = Math.min(maxRow, from.rowIndex);
            }
            if (a.from === e.id) {
                const to = placements.get(a.to);
                if (to) minRow = Math.max(minRow, to.rowIndex);
            }
        }
        // A label on the side its own arrow leaves would sit on the arrow.
        const crossesOwnRun = (s: Side): boolean => {
            const xLeft = sideXLeft(s);
            return runs.some((r) => r.left < xLeft + labelWidth && r.right > xLeft);
        };
        const freeSide = (s: Side): boolean => sideFitsCanvas(s) && !crossesOwnRun(s);
        const growSide: Side = freeSide('right')
            ? 'right'
            : freeSide('left')
              ? 'left'
              : fitsRightCanvas
                ? 'right'
                : 'left';
        const collidesAt = (xLeft: number, row: number): boolean => {
            const extLeft = Math.min(diamondLeft, xLeft);
            const extRight = Math.max(diamondRight, xLeft + labelWidth);
            const own = [{ left: extLeft, right: extRight }, ...runs];
            return rowSpans[row].some((s) => own.some((o) => s.left < o.right && s.right > o.left));
        };

        let placedRow = -1;
        let placedSide: Side = 'right';
        let placedXLeft = naturalRightX;

        // Bottom-first: try the highest existing row first, working up
        // toward row 0 (closest to the ticks).
        outer: for (let row = rowSpans.length - 1; row >= 0; row--) {
            if (row < minRow || row > maxRow) continue;
            for (const side of ['right', 'left'] as const) {
                if (!freeSide(side)) continue;
                const xLeft = sideXLeft(side);
                if (collidesAt(xLeft, row)) continue;
                placedRow = row;
                placedSide = side;
                placedXLeft = xLeft;
                break outer;
            }
        }

        if (placedRow === -1 && minRow >= 0 && minRow < maxRow) {
            // An arrow source that must stay at or below its target and fits
            // no row there: a fresh row right below the target, which keeps
            // every placed arrow's source at or below its target.
            const at = minRow + 1;
            for (const [id, p] of placements) {
                if (p.rowIndex >= at) placements.set(id, { ...p, rowIndex: p.rowIndex + 1 });
            }
            rowSpans.splice(at, 0, []);
            placedRow = at;
            placedSide = growSide;
            placedXLeft = sideXLeft(placedSide);
        } else if (placedRow === -1) {
            // No existing row fits — prepend a fresh top row and shift
            // every previous placement DOWN by one slot (rowIndex += 1)
            // so the bottom corridor stays stable.
            for (const [id, p] of placements) {
                placements.set(id, { ...p, rowIndex: p.rowIndex + 1 });
            }
            rowSpans = [[], ...rowSpans];
            placedRow = 0;
            placedSide = growSide;
            placedXLeft = sideXLeft(placedSide);
        }

        const extLeft = Math.min(diamondLeft, placedXLeft);
        const extRight = Math.max(diamondRight, placedXLeft + labelWidth);
        rowSpans[placedRow].push({ left: extLeft, right: extRight }, ...runs);
        placements.set(e.id, {
            rowIndex: placedRow,
            labelBox: { x: placedXLeft, y: 0, width: labelWidth, height: MARKER_LABEL_HEIGHT_PX },
            labelSide: placedSide,
        });
    }

    return { placements, rowCount: rowSpans.length };
}
