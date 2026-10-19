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
    // An overrun dated milestone paints its diamond and label in the cut
    // line's overrun colour too (specs/rendering.md, Milestones).
    const fill = m.isOverrun
        ? palette.milestoneDiamond.cutLineOverrun
        : palette.milestoneDiamond.fill;
    const flag = tag('path', {
        d: `M${num(cx)} ${num(cy - r)} L${num(cx + r)} ${num(cy)} L${num(cx)} ${num(cy + r)} L${num(cx - r)} ${num(cy)} Z`,
        fill,
        stroke: fill,
        'stroke-width': 1,
    });
    const labelColor = m.isOverrun
        ? palette.milestoneDiamond.cutLineOverrun
        : palette.milestoneDiamond.label;
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
    const stroke = m.isOverrun
        ? palette.milestoneDiamond.cutLineOverrun
        : palette.milestoneDiamond.cutLineNormal;
    const parts: string[] = [];
    // A milestone on a wave boundary draws no cut line: the boundary
    // already marks that instant (specs/waves.md §9.2).
    if (!m.onWaveBoundary) {
        parts.push(
            tag('line', {
                x1: num(m.center.x),
                y1: num(m.center.y + m.radius + 1),
                x2: num(m.center.x),
                y2: num(m.cutBottomY),
                stroke,
                'stroke-width': 2,
                'stroke-dasharray': ACCENT_DASH_PATTERN,
                'stroke-linecap': 'round',
            }),
        );
    }
    if (m.slackArrows && m.slackArrows.length > 0) {
        // A dated milestone's only arrow is its overrun arrow, red like the
        // line; a floating milestone's are slack arrows in ink.
        const slackColor = m.isOverrun
            ? palette.milestoneDiamond.cutLineOverrun
            : palette.milestoneDiamond.slack;
        const marker = m.isOverrun ? 'arrow-overrun' : 'arrow-dark';
        for (const arrow of m.slackArrows) {
            parts.push(
                tag('path', {
                    d: `M${num(arrow.x)} ${num(arrow.y)} H${num(m.center.x - 6)}`,
                    fill: 'none',
                    stroke: slackColor,
                    'stroke-width': 1.1,
                    'stroke-dasharray': '3 3',
                    'stroke-linecap': 'round',
                    'marker-end': `url(#${idPrefix}-${marker})`,
                }),
            );
        }
    }
    return parts.join('');
}
