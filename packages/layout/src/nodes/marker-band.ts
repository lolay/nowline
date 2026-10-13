// MarkerBand — the marker row's entries and packer. Anchors, milestones,
// the titled non-working runs and the working exceptions all pack into one
// band of rows above the chart; `RoadmapNode.place` builds the entries and
// calls `packMarkerRow`, then `markerLabelsRightX` sizes the canvas for the
// labels that fit on neither side.

import { GUTTER_PX } from '../themes/shared.js';
import type { BoundingBox, PositionedNonWorkingRun, PositionedWorkingException } from '../types.js';
import {
    MARKER_BOLD_WIDTH_FACTOR,
    MARKER_LABEL_GAP_PX,
    MARKER_LABEL_HEIGHT_PX,
} from './marker-geometry.js';

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
export function nonWorkingRunEntries(
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
export function workingExceptionEntries(
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

interface PackedPlacement {
    rowIndex: number;
    labelBox: BoundingBox;
    labelSide: 'left' | 'right';
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
