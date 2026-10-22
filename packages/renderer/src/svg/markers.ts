// The marker layer: anchors, milestones and the cut lines they drop through the
// chart body, with the diamonds and labels that sit in the marker row.

import type { PositionedAnchor, PositionedMilestone, Theme } from '@nowline/layout';
import { ACCENT_DASH_PATTERN } from '@nowline/layout';
import type { FontFamilies } from './render.js';
import { escText, num, tag, textTag } from './xml.js';

export function renderAnchor(a: PositionedAnchor, palette: Theme, fonts: FontFamilies): string {
    const size = a.radius;
    const cx = a.center.x;
    const cy = a.center.y;
    const fill = palette.anchorDiamond.fill;
    const stroke = palette.anchorDiamond.stroke;
    const diamond = tag('path', {
        d: `M${num(cx)} ${num(cy - size)} L${num(cx + size)} ${num(cy)} L${num(cx)} ${num(cy + size)} L${num(cx - size)} ${num(cy)} Z`,
        fill,
        stroke,
        'stroke-width': 1.25,
    });
    const labelColor = palette.anchorDiamond.label;
    // For left-flipped labels, anchor the text at its RIGHT edge using
    // `text-anchor: end`. The layout's `labelBox.width` is intentionally
    // pessimistic (0.58 em/char) so positioning by the box's left edge
    // would leave a visible gap between the actual text right edge and
    // the diamond. End-anchoring lets the browser size the glyph run
    // exactly and put the rightmost glyph 6 px from the diamond — same
    // rhythm the right-side labels already get from start-anchoring at
    // `diamondRight + 6`.
    const labelX = a.labelSide === 'left' ? a.labelBox.x + a.labelBox.width : a.labelBox.x;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(labelX),
        y: num(cy + 4),
        'font-family': fonts.sans,
        'font-size': 10,
        fill: labelColor,
    };
    if (a.labelSide === 'left') labelAttrs['text-anchor'] = 'end';
    const label = a.title ? textTag(labelAttrs, a.title) : '';
    return tag(
        'g',
        { 'data-layer': 'anchor', 'data-id': a.id ?? null },
        hiddenDateTitle(a.hiddenDate) + diamond + label,
    );
}

export function renderAnchorCutLine(a: PositionedAnchor, palette: Theme): string {
    const stroke = palette.anchorDiamond.cutLine;
    return tag('line', {
        x1: num(a.center.x),
        y1: num(a.center.y + a.radius + 1),
        x2: num(a.center.x),
        y2: num(a.cutBottomY),
        stroke,
        'stroke-width': 1,
        'stroke-dasharray': '1 3',
    });
}

export function renderMilestone(
    m: PositionedMilestone,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const cx = m.center.x;
    const cy = m.center.y;
    const r = m.radius;
    const overrun = palette.milestoneDiamond.cutLineOverrun;
    const diamond = (x: number, fill: string): string =>
        tag('path', {
            d: `M${num(x)} ${num(cy - r)} L${num(x + r)} ${num(cy)} L${num(x)} ${num(cy + r)} L${num(x - r)} ${num(cy)} Z`,
            fill,
            stroke: fill,
            'stroke-width': 1,
        });
    // An overrun dated milestone paints its diamond in the overrun colour
    // (specs/rendering.md, Milestones). When it slipped, that diamond marks
    // the missed date and a dotted span runs on to a second diamond, in the
    // normal colour, where it lands; the label sits there. When it did not
    // slip (the two diamonds would meet), the label is red too.
    const slipX = m.slip?.x;
    let flag: string;
    if (slipX !== undefined) {
        flag =
            diamond(cx, overrun) +
            tag('path', {
                d: `M${num(cx + r)} ${num(cy)} H${num(slipX - r)}`,
                fill: 'none',
                stroke: overrun,
                'stroke-width': 1.1,
                'stroke-dasharray': '3 3',
                'stroke-linecap': 'round',
            }) +
            diamond(slipX, palette.milestoneDiamond.fill);
    } else {
        flag = diamond(cx, m.isOverrun ? overrun : palette.milestoneDiamond.fill);
    }
    const labelColor =
        m.isOverrun && slipX === undefined ? overrun : palette.milestoneDiamond.label;
    // See renderAnchor — left-flipped labels use `text-anchor: end` so
    // the visual right edge sits at `diamondLeft - 6`, matching the
    // 6 px rhythm of right-side labels.
    const labelX = m.labelSide === 'left' ? m.labelBox.x + m.labelBox.width : m.labelBox.x;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(labelX),
        y: num(cy + 4),
        'font-family': fonts.sans,
        'font-size': 10,
        'font-weight': 600,
        fill: labelColor,
    };
    if (m.labelSide === 'left') labelAttrs['text-anchor'] = 'end';
    const label = m.title ? textTag(labelAttrs, m.title) : '';
    return tag(
        'g',
        { 'data-layer': 'milestone', 'data-id': m.id ?? null },
        hiddenDateTitle(m.hiddenDate) + flag + label,
    );
}

/**
 * A marker dated on a day the axis hides sits at the next working day's
 * x, so its own date rides along as a native tooltip, the way
 * `renderInlineDatePin` titles its glyph (specs/working-calendar.md
 * §7.4). Empty for a working-day date.
 */
function hiddenDateTitle(hiddenDate: string | undefined): string {
    return hiddenDate === undefined ? '' : `<title>${escText(hiddenDate)}</title>`;
}

export function renderMilestoneCutLine(
    m: PositionedMilestone,
    idPrefix: string,
    palette: Theme,
): string {
    // A slipped milestone's cut line drops from where it lands, in the
    // normal colour; one that overran without slipping keeps the red line.
    const cutX = m.slip?.x ?? m.center.x;
    const stroke =
        m.isOverrun && m.slip === undefined
            ? palette.milestoneDiamond.cutLineOverrun
            : palette.milestoneDiamond.cutLineNormal;
    const parts: string[] = [];
    // A milestone on a wave boundary draws no cut line: the boundary
    // already marks that instant (specs/waves.md §9.2).
    if (!m.onWaveBoundary) {
        parts.push(
            tag('line', {
                x1: num(cutX),
                y1: num(m.center.y + m.radius + 1),
                x2: num(cutX),
                y2: num(m.cutBottomY),
                stroke,
                'stroke-width': 2,
                'stroke-dasharray': ACCENT_DASH_PATTERN,
                'stroke-linecap': 'round',
            }),
        );
    }
    if (m.slackArrows && m.slackArrows.length > 0) {
        // Only a floating milestone draws slack arrows, in ink; a dated one
        // slips instead.
        for (const arrow of m.slackArrows) {
            parts.push(
                tag('path', {
                    d: `M${num(arrow.x)} ${num(arrow.y)} H${num(m.center.x - 6)}`,
                    fill: 'none',
                    stroke: palette.milestoneDiamond.slack,
                    'stroke-width': 1.1,
                    'stroke-dasharray': '3 3',
                    'stroke-linecap': 'round',
                    'marker-end': `url(#${idPrefix}-arrow-dark)`,
                }),
            );
        }
    }
    return parts.join('');
}
