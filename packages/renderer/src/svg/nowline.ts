// The now-line layer: the vertical line marking the current date and the pill
// at its top that carries the date label.

import type { PositionedNowline, Theme } from '@nowline/layout';
import {
    NOW_PILL_CORNER_RADIUS_PX,
    NOW_PILL_HEIGHT_PX,
    NOW_PILL_LABEL_BASELINE_OFFSET_PX,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOWLINE_STROKE_WIDTH_PX,
} from '@nowline/layout';
import type { FontFamilies } from './render.js';
import { num, tag, textTag } from './xml.js';

export function renderNowline(
    n: PositionedNowline | null,
    palette: Theme,
    fonts: FontFamilies,
): string {
    if (!n) return '';
    const color = palette.nowline.stroke;
    const labelTextColor = palette.nowline.labelText;
    // Line drops from `topY` (just below the pill / top of date headers)
    // through the headers into the chart, ending at `bottomY`.
    const line = tag('line', {
        x1: num(n.x),
        y1: num(n.topY),
        x2: num(n.x),
        y2: num(n.bottomY),
        stroke: color,
        'stroke-width': NOWLINE_STROKE_WIDTH_PX,
    });
    // Pill — sits above the date headers at `pillTopY`. Three modes
    // (decided by layout in `buildNowline`):
    //   - center      → rounded rect centered on the line, label `middle`
    //   - flag-right  → squared LEFT, rounded RIGHT, line at left edge,
    //                   label `start` past the line
    //   - flag-left   → rounded LEFT, squared RIGHT, line at right edge,
    //                   label `end` before the line
    // The squared edge IS the line; the rounded edge points into the
    // chart, so the pill always hugs the line and never overflows.
    const pillBg = renderNowPillBg(n, color);
    const label = renderNowPillLabel(n, labelTextColor, fonts);
    return tag('g', { 'data-layer': 'nowline' }, line + pillBg + label);
}

/**
 * X coordinate of the pill's squared edge in flag modes. SVG strokes
 * are centered on their geometry, so a 2.25 px line at `n.x` actually
 * paints from `n.x - 1.125` to `n.x + 1.125`. To make the pill's
 * squared edge line up with the OUTER edge of the line stroke (so
 * the line and the pill share a single continuous edge instead of
 * the line peeking past the pill by half-stroke), we offset by
 * `NOWLINE_STROKE_WIDTH_PX / 2` on the side the line is on.
 *
 *   flag-right: line on the LEFT  → squared edge at n.x - half-stroke
 *   flag-left:  line on the RIGHT → squared edge at n.x + half-stroke
 *
 * Center mode doesn't apply — the line passes through the pill's
 * vertical center, so a half-stroke offset would make things worse.
 */
function squaredEdgeX(n: PositionedNowline): number {
    const halfStroke = NOWLINE_STROKE_WIDTH_PX / 2;
    if (n.pillMode === 'flag-right') return n.x - halfStroke;
    if (n.pillMode === 'flag-left') return n.x + halfStroke;
    return n.x;
}

function renderNowPillBg(n: PositionedNowline, color: string): string {
    const top = n.pillTopY;
    const bottom = n.pillTopY + NOW_PILL_HEIGHT_PX;
    const r = NOW_PILL_CORNER_RADIUS_PX;
    // Pill width comes from the layout (`n.pillWidth`) — locale-aware,
    // floored at `NOW_PILL_WIDTH_PX` so en-US output stays byte-stable
    // and longer locale strings (e.g. fr `'maint.'`) grow the pill
    // instead of clipping. See `buildNowline` in `@nowline/layout`.
    const width = n.pillWidth;
    if (n.pillMode === 'center') {
        return tag('rect', {
            x: num(n.x - width / 2),
            y: num(top),
            width: num(width),
            height: num(NOW_PILL_HEIGHT_PX),
            rx: r,
            ry: r,
            fill: color,
        });
    }
    const edgeX = squaredEdgeX(n);
    if (n.pillMode === 'flag-right') {
        // Squared LEFT edge aligns with line's left outer stroke edge,
        // rounded corners on the RIGHT.
        const right = edgeX + width;
        const d = [
            `M ${num(edgeX)} ${num(top)}`,
            `L ${num(right - r)} ${num(top)}`,
            `A ${r} ${r} 0 0 1 ${num(right)} ${num(top + r)}`,
            `L ${num(right)} ${num(bottom - r)}`,
            `A ${r} ${r} 0 0 1 ${num(right - r)} ${num(bottom)}`,
            `L ${num(edgeX)} ${num(bottom)}`,
            'Z',
        ].join(' ');
        return tag('path', { d, fill: color });
    }
    // flag-left: squared RIGHT edge aligns with line's right outer
    // stroke edge, rounded corners on the LEFT.
    const left = edgeX - width;
    const d = [
        `M ${num(edgeX)} ${num(top)}`,
        `L ${num(left + r)} ${num(top)}`,
        `A ${r} ${r} 0 0 0 ${num(left)} ${num(top + r)}`,
        `L ${num(left)} ${num(bottom - r)}`,
        `A ${r} ${r} 0 0 0 ${num(left + r)} ${num(bottom)}`,
        `L ${num(edgeX)} ${num(bottom)}`,
        'Z',
    ].join(' ');
    return tag('path', { d, fill: color });
}

function renderNowPillLabel(
    n: PositionedNowline,
    labelTextColor: string,
    fonts: FontFamilies,
): string {
    const baselineY = n.pillTopY + NOW_PILL_LABEL_BASELINE_OFFSET_PX;
    const edgeX = squaredEdgeX(n);
    let labelX: number;
    let textAnchor: 'start' | 'middle' | 'end';
    if (n.pillMode === 'center') {
        labelX = n.x;
        textAnchor = 'middle';
    } else if (n.pillMode === 'flag-right') {
        labelX = edgeX + NOW_PILL_LABEL_INSET_X_PX;
        textAnchor = 'start';
    } else {
        labelX = edgeX - NOW_PILL_LABEL_INSET_X_PX;
        textAnchor = 'end';
    }
    return textTag(
        {
            x: num(labelX),
            y: num(baselineY),
            'font-family': fonts.sans,
            'font-size': NOW_PILL_LABEL_FONT_SIZE_PX,
            'font-weight': 700,
            fill: labelTextColor,
            'text-anchor': textAnchor,
        },
        n.label,
    );
}
