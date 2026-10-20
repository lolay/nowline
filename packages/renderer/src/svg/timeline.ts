// The timeline layer: the tick scale across the top, the vertical grid lines
// behind the lanes, and the shaded non-working bands with their labels.

import type { BoundingBox, PositionedTimelineScale, Theme } from '@nowline/layout';
import {
    NON_WORKING_FILL_OPACITY,
    TIMELINE_TICK_LABEL_FONT_SIZE_PX,
    timelineTickLabelBaselineOffsetPx,
} from '@nowline/layout';
import { intersectBox } from './primitives.js';
import type { FontFamilies } from './render.js';
import { num, tag, textTag } from './xml.js';

// Renders the chart-body vertical grid lines (major dotted at every
// labeled tick, plus optional faint minor lines at every tick when
// `minorGrid` is set). Emitted as its own layer drawn AFTER the
// swimlane backgrounds so the lines actually span the chart body
// instead of being occluded — without this layer the lines would only
// be visible inside the timeline header strip. Grid lines stay BEHIND
// items, edges, anchor/milestone cuts, and the now-line so item bars
// sit cleanly on top of the ruled-paper backdrop.
export function renderGridLines(
    t: PositionedTimelineScale,
    swimlaneTopY: number,
    palette: Theme,
): string {
    const gridColor = palette.timeline.gridLine;
    const minorGridColor = palette.timeline.minorGridLine;
    // Major lines thread through the FULL timeline strip — they start
    // at the top of the top date-label panel (when present) and run
    // all the way through the bottom date-label panel (when one is
    // mirrored at the chart bottom via `timeline-position:both` or
    // `timeline-position:bottom`). This ties date labels at both ends
    // to their column boundaries.
    //
    // Minor lines stay quieter: they start at the TOP OF THE TOPMOST
    // SWIMLANE (i.e. below the top date panel AND below the marker
    // row, so they don't streak through anchor/milestone diamonds in
    // the header) and stop ABOVE the bottom date panel.
    //
    // Anchor diamonds, milestone markers, and date label text are
    // rendered later in the orchestrator so they sit on top of any
    // crossing line.
    const bottomTickPanelHeight = t.bottomTickPanelHeight ?? 0;
    const hasBottomTickPanel = t.bottomTickPanelY !== undefined && bottomTickPanelHeight > 0;
    const majorTopY = t.tickPanelY;
    const majorBottomY = hasBottomTickPanel
        ? t.bottomTickPanelY! + bottomTickPanelHeight
        : t.box.y + t.box.height;
    // Use the topmost swimlane's top edge directly — `markerRow.height`
    // alone misses the small gap (`timelineHeightBudget` slack) between
    // the marker row and the swimlane area, which would leave the minor
    // lines short and floating in dead space above the swimlane.
    const minorTopY = swimlaneTopY;
    const minorBottomY = t.box.y + t.box.height;
    const parts: string[] = [];
    for (const tick of t.ticks) {
        if (tick.major) {
            // Solid major line at every labeled tick — the dominant
            // column boundary, drawn in the stronger gridLine color.
            parts.push(
                tag('line', {
                    x1: num(tick.x),
                    y1: num(majorTopY),
                    x2: num(tick.x),
                    y2: num(majorBottomY),
                    stroke: gridColor,
                    'stroke-width': 1,
                }),
            );
        } else if (t.minorGrid) {
            // Solid faint minor line at every non-major tick boundary.
            // Hierarchy is established by color (lighter than the major)
            // rather than by texture. Skip the very last tick since it
            // has no following column — a line at the chart's right edge
            // just doubles up the chart border.
            if (tick.labelX === undefined) continue;
            parts.push(
                tag('line', {
                    x1: num(tick.x),
                    y1: num(minorTopY),
                    x2: num(tick.x),
                    y2: num(minorBottomY),
                    stroke: minorGridColor,
                    'stroke-width': 1,
                }),
            );
        }
    }
    // Seams where hidden non-working days collapse and no grid line
    // already marks the join (specs/working-calendar.md §7.2): faint and
    // dotted, on the minor line's span. Layout marks which runs get one.
    for (const run of t.nonWorking ?? []) {
        if (!run.seam) continue;
        parts.push(
            tag('line', {
                x1: num(run.x),
                y1: num(minorTopY),
                x2: num(run.x),
                y2: num(minorBottomY),
                stroke: palette.timeline.nonWorkingSeam,
                'stroke-width': 1,
                'stroke-dasharray': '1 3',
            }),
        );
    }
    return tag('g', { 'data-layer': 'grid' }, parts.join(''));
}

/**
 * Non-working days under `show` (specs/working-calendar.md §7.3): a faint
 * band over each run layout flagged `band`, on the seam / minor-grid span
 * (from the top of the chart body to the timeline bottom), clipped to
 * `clip` when given (an include region's painted rect). Empty under `hide`,
 * where no run has `band`, so that view emits no bytes.
 */
export function renderNonWorkingBands(
    t: PositionedTimelineScale,
    chartTopY: number,
    palette: Theme,
    clip?: BoundingBox,
): string {
    const bottomY = t.box.y + t.box.height;
    const parts: string[] = [];
    for (const run of t.nonWorking ?? []) {
        if (!run.band) continue;
        const span: BoundingBox = {
            x: run.x,
            y: chartTopY,
            width: run.width,
            height: bottomY - chartTopY,
        };
        const box = clip ? intersectBox(span, clip) : span;
        if (!box || box.width <= 0 || box.height <= 0) continue;
        parts.push(
            tag('rect', {
                x: num(box.x),
                y: num(box.y),
                width: num(box.width),
                height: num(box.height),
                fill: palette.timeline.nonWorkingFill,
                'fill-opacity': NON_WORKING_FILL_OPACITY,
            }),
        );
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'non-working' }, parts.join(''));
}

/**
 * Labels of the titled non-working runs and the working exceptions
 * (specs/working-calendar.md §7.4): each one's text in the marker row,
 * placed by the layout like an anchor label. Under `hide` a titled run
 * also draws a dotted cut line at the seam from the label row's centre to
 * the timeline bottom, since the zero-width seam has no band to name. A
 * working exception is text only in either view: a working day removes no
 * time, so it has no cut. Empty when nothing has a label, so a roadmap
 * without one emits no bytes.
 */
export function renderNonWorkingLabels(
    t: PositionedTimelineScale,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const bottomY = t.box.y + t.box.height;
    const parts: string[] = [];
    for (const run of t.nonWorking ?? []) {
        if (run.label === undefined || !run.labelBox) continue;
        if (run.cut) {
            parts.push(
                tag('line', {
                    x1: num(run.x),
                    y1: num(run.labelBox.y + 4),
                    x2: num(run.x),
                    y2: num(bottomY),
                    stroke: palette.timeline.nonWorkingSeam,
                    'stroke-width': 1,
                    'stroke-dasharray': '1 3',
                }),
            );
        }
        parts.push(calendarLabelText(run.label, run.labelBox, run.labelSide, palette, fonts));
    }
    for (const exception of t.workingExceptions ?? []) {
        if (!exception.labelBox) continue;
        parts.push(
            calendarLabelText(
                exception.label,
                exception.labelBox,
                exception.labelSide,
                palette,
                fonts,
            ),
        );
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'non-working-label' }, parts.join(''));
}

/** One calendar label's text in the marker row. */
function calendarLabelText(
    label: string,
    box: BoundingBox,
    side: 'left' | 'right' | undefined,
    palette: Theme,
    fonts: FontFamilies,
): string {
    // Left-side labels end-anchor at the box's right edge, as anchor
    // labels do: the box width is a pessimistic estimate.
    const isLeft = side === 'left';
    const centerY = box.y + 4;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(isLeft ? box.x + box.width : box.x),
        y: num(centerY + 4),
        'font-family': fonts.sans,
        'font-size': 10,
        fill: palette.timeline.labelText,
    };
    if (isLeft) labelAttrs['text-anchor'] = 'end';
    return textTag(labelAttrs, label);
}

export function renderTimeline(
    t: PositionedTimelineScale,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const panelFill = palette.timeline.panelFill;
    const borderColor = palette.timeline.border;
    const labelColor = palette.timeline.labelText;
    const parts: string[] = [];
    // Header layout from top: now-pill row → tick-label panel → (wave
    // strip) → marker row.
    // The pill row owns its space (no panel rect); the now-line crosses it
    // visually. Marker row is omitted entirely when empty. The top tick
    // panel is also omitted when the roadmap requested
    // `timeline-position:bottom` (height 0). The optional bottom tick
    // panel mirrors the top panel directly above the footnote area.
    const tickPanelY = t.tickPanelY;
    const tickPanelHeight = t.tickPanelHeight;
    const hasTopTickPanel = tickPanelHeight > 0;
    const hasMarkerRow = t.markerRow.height > 0;
    // The wave strip, when there is one, sits between the tick panel and
    // the marker rows (specs/waves.md §8.8); its panel is the wave-strip
    // layer's.
    const markerRowY = t.waveStrip
        ? t.waveStrip.y + t.waveStrip.height
        : tickPanelY + tickPanelHeight;
    const markerRowHeight = t.markerRow.height;
    const bottomTickPanelY = t.bottomTickPanelY;
    const bottomTickPanelHeight = t.bottomTickPanelHeight ?? 0;
    const hasBottomTickPanel = bottomTickPanelY !== undefined && bottomTickPanelHeight > 0;

    if (hasTopTickPanel) {
        parts.push(
            tag('rect', {
                x: num(t.box.x),
                y: num(tickPanelY),
                width: num(t.box.width),
                height: num(tickPanelHeight),
                rx: 4,
                ry: 4,
                fill: panelFill,
                stroke: borderColor,
                'stroke-width': 1,
            }),
        );
    }
    if (hasMarkerRow) {
        parts.push(
            tag('rect', {
                x: num(t.box.x),
                y: num(markerRowY),
                width: num(t.box.width),
                height: num(markerRowHeight),
                rx: 4,
                ry: 4,
                fill: panelFill,
                stroke: borderColor,
                'stroke-width': 1,
            }),
        );
    }
    if (hasBottomTickPanel) {
        parts.push(
            tag('rect', {
                x: num(t.box.x),
                y: num(bottomTickPanelY!),
                width: num(t.box.width),
                height: num(bottomTickPanelHeight),
                rx: 4,
                ry: 4,
                fill: panelFill,
                stroke: borderColor,
                'stroke-width': 1,
            }),
        );
    }
    // Header-only labels — the chart-body grid lines themselves are
    // emitted by `renderGridLines` after the swimlane backgrounds so
    // they actually span the chart body rather than being occluded.
    for (const tick of t.ticks) {
        if (!tick.major) continue;
        if (!tick.label || tick.labelX === undefined) continue;
        // Label sits at the COLUMN CENTER (tick.labelX), not at the
        // tick boundary. The last tick has no following column → no
        // label.
        if (hasTopTickPanel) {
            parts.push(
                textTag(
                    {
                        x: num(tick.labelX),
                        y: num(tickPanelY + timelineTickLabelBaselineOffsetPx(tickPanelHeight)),
                        'font-family': fonts.sans,
                        'font-size': TIMELINE_TICK_LABEL_FONT_SIZE_PX,
                        fill: labelColor,
                        'text-anchor': 'middle',
                    },
                    tick.label,
                ),
            );
        }
        if (hasBottomTickPanel) {
            parts.push(
                textTag(
                    {
                        x: num(tick.labelX),
                        y: num(
                            bottomTickPanelY! +
                                timelineTickLabelBaselineOffsetPx(bottomTickPanelHeight),
                        ),
                        'font-family': fonts.sans,
                        'font-size': TIMELINE_TICK_LABEL_FONT_SIZE_PX,
                        fill: labelColor,
                        'text-anchor': 'middle',
                    },
                    tick.label,
                ),
            );
        }
    }
    return tag('g', { 'data-layer': 'timeline' }, parts.join(''));
}
