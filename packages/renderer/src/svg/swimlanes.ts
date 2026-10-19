// The swimlane layers: the lane background tint and tri-state utilization
// underline, the lane frame tab and badges, and the group and parallel
// containers that wrap a lane's items.

import type {
    PositionedGroup,
    PositionedParallel,
    PositionedSwimlane,
    PositionedTrackChild,
    Theme,
} from '@nowline/layout';
import {
    CONTAINER_BODY_FILL_OPACITY,
    CONTAINER_BRACKET_LINE_OFFSET_PX,
    CONTAINER_HEADER_TITLE_BASELINE_PX,
    CONTAINER_HEADER_TITLE_FONT_SIZE_PX,
    CONTAINER_MAX_FILLED_DEPTH,
    CONTAINER_NESTED_BODY_FILL_OPACITY,
    containerHeaderTitleX,
    estimateCapacitySuffixWidth,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    frameTabGeometry,
} from '@nowline/layout';
import { hasAfterPin, renderCapacitySuffix, renderInlineDatePins, renderItem } from './item.js';
import { estimateCaptionWidthPx, fontAttrs } from './primitives.js';
import type { FontFamilies, RenderOptions } from './render.js';
import { num, tag, textTag } from './xml.js';

/**
 * A group or parallel, drawn above and around its content
 * (specs/true-width-layout.md §3.3): a body shaded with the container's `bg`
 * spanning exactly its dates, a header bracket over those dates (solid for
 * a group, dashed for a parallel by default; `bracket:` styles it), the
 * title at the container's start with any inline-date glyphs beside it,
 * then the children. A wave-only group draws only its children.
 *
 * `depth` is the container's nesting depth inside its lane, 1 for a
 * top-level container. A nested body takes a lighter tint, and bodies deeper
 * than `CONTAINER_MAX_FILLED_DEPTH` are outlined instead of filled, so tints
 * never compound three deep (§8 O4).
 */
function renderContainer(
    c: PositionedGroup | PositionedParallel,
    depth: number,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    const isDrawn = !(c.kind === 'group' && c.waveOnly);
    if (isDrawn) {
        const bodyY = c.box.y + c.headerHeight;
        const bodyHeight = c.box.height - c.headerHeight;
        if (c.style.bg !== 'none') {
            const isFilled = depth <= CONTAINER_MAX_FILLED_DEPTH;
            parts.push(
                tag('rect', {
                    x: num(c.box.x),
                    y: num(bodyY),
                    width: num(c.box.width),
                    height: num(bodyHeight),
                    fill: isFilled ? c.style.bg : 'none',
                    'fill-opacity': isFilled
                        ? depth === 1
                            ? CONTAINER_BODY_FILL_OPACITY
                            : CONTAINER_NESTED_BODY_FILL_OPACITY
                        : null,
                    stroke: isFilled ? null : c.style.bg,
                    'stroke-opacity': isFilled ? null : 0.6,
                    'stroke-width': isFilled ? null : 1,
                }),
            );
        }
        // The title and the bracket share one ink, the header's: a group's
        // `fg`, a parallel's bracket stroke. The title sits on the lane band,
        // never on the body, so a `text:` colour chosen to read on `bg`
        // (white on a filled chiclet, before the header) would vanish.
        const ink = c.kind === 'group' ? c.style.fg : palette.parallel.bracketStroke;
        if (c.headerHeight > 0 && c.style.bracket !== 'none') {
            const lineY = c.box.y + CONTAINER_BRACKET_LINE_OFFSET_PX;
            const x0 = c.box.x;
            const x1 = c.box.x + c.box.width;
            parts.push(
                tag('path', {
                    d: `M${num(x0)} ${num(bodyY)} V${num(lineY)} H${num(x1)} V${num(bodyY)}`,
                    fill: 'none',
                    stroke: ink,
                    'stroke-width': 1.2,
                    'stroke-dasharray': c.style.bracket === 'dashed' ? '3 2' : null,
                }),
            );
        }
        if (c.title && c.headerHeight > 0) {
            parts.push(
                textTag(
                    {
                        // Past the `after:` glyph when there is one; layout
                        // clamps the `before:` glyph past this text.
                        x: num(containerHeaderTitleX(c.box.x, hasAfterPin(c.inlineDatePins))),
                        y: num(c.box.y + CONTAINER_HEADER_TITLE_BASELINE_PX),
                        ...fontAttrs(c.style, fonts, CONTAINER_HEADER_TITLE_FONT_SIZE_PX),
                        'font-weight': 600,
                        fill: ink,
                    },
                    c.title,
                ),
            );
        }
        // The glyphs sit in the header's title row, never on a child, so
        // painting them before the children is safe.
        parts.push(renderInlineDatePins(c.inlineDatePins, c.style.fg));
    }
    for (const child of c.children) {
        parts.push(renderTrackChild(child, options, idPrefix, palette, fonts, depth));
    }
    return tag('g', { 'data-layer': c.kind, 'data-id': c.id ?? null }, parts.join(''));
}

function renderTrackChild(
    c: PositionedTrackChild,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
    parentDepth = 0,
): string {
    if (c.kind === 'item') return renderItem(c, options, idPrefix, palette, fonts);
    return renderContainer(c, parentDepth + 1, options, idPrefix, palette, fonts);
}

// Renders only the swimlane's background tint rect. Emitted before the
// chart-body grid lines so those lines visibly span the full chart width.
// The frame tab (chiclet at top-left) and item content are emitted later,
// in renderSwimlaneContent, so they appear on top of the grid.
// Tri-state lane utilization underline. Painted along the bottom edge of
// the band when the lane has `capacity:` AND at least one item contributing
// load AND has not opted out of every color band via `utilization-*-at:none`.
// Geometry per specs/rendering.md § Lane utilization underline:
//   - height: 2px (matches the milestone-line stroke weight)
//   - y: flush with the bottom edge of the band, fully inside it
//   - x: aligned to the segment boundaries the layout already pre-coalesced
// One <rect> per coalesced segment; classification → palette token mapping
// is the only renderer-side decision.
const LANE_UTILIZATION_HEIGHT_PX = 2;

function utilizationColor(classification: 'green' | 'yellow' | 'red', palette: Theme): string {
    switch (classification) {
        case 'green':
            return palette.swimlane.utilizationOk;
        case 'yellow':
            return palette.swimlane.utilizationWarn;
        case 'red':
            return palette.swimlane.utilizationOver;
    }
}

function renderLaneUtilization(s: PositionedSwimlane, palette: Theme): string {
    if (!s.utilization || s.utilization.segments.length === 0) return '';
    const y = s.box.y + s.box.height - LANE_UTILIZATION_HEIGHT_PX;
    const rects = s.utilization.segments.map((seg) => {
        const width = seg.endX - seg.startX;
        if (width <= 0) return '';
        return tag('rect', {
            x: num(seg.startX),
            y: num(y),
            width: num(width),
            height: LANE_UTILIZATION_HEIGHT_PX,
            fill: utilizationColor(seg.classification, palette),
            'data-utilization': seg.classification,
            'data-load': num(seg.load),
        });
    });
    return tag(
        'g',
        {
            'data-layer': 'lane-utilization',
            'data-id': s.id ?? null,
        },
        rects.join(''),
    );
}

export function renderSwimlaneBg(s: PositionedSwimlane, palette: Theme): string {
    const tint = s.bandIndex % 2 === 0 ? palette.swimlane.rowTintEven : palette.swimlane.rowTintOdd;
    const borderColor = palette.swimlane.border;
    return tag(
        'g',
        { 'data-layer': 'swimlane-bg', 'data-id': s.id ?? null },
        tag('rect', {
            x: num(s.box.x),
            y: num(s.box.y),
            width: num(s.box.width),
            height: num(s.box.height),
            fill: tint,
            stroke: borderColor,
            'stroke-width': 1,
        }),
    );
}

export function renderSwimlane(
    s: PositionedSwimlane,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const tabFill = palette.swimlane.tabFill;
    const tabStroke = palette.swimlane.tabStroke;
    const tabText = palette.swimlane.tabText;
    const ownerText = palette.swimlane.ownerText;
    const footnoteColor = palette.swimlane.footnoteIndicator;
    const parts: string[] = [];
    // Frame-tab chiclet at the top-left of the band — auto-sized to fit
    // title + owner. Geometry comes from the shared `frameTabGeometry`
    // helper that the layout's row-packer also calls, so the chiclet's
    // visible footprint matches the collision box layout reserved for it.
    if (s.title) {
        // Lane capacity badge + footnote indicator sit inside the frame
        // tab after the owner (or after the title if no owner). Compute
        // both widths up-front so `frameTabGeometry` can size the chiclet
        // to fit them, then read the placement positions back out — no
        // second placement pass in the renderer.
        const LANE_BADGE_FONT_SIZE_PX = 10;
        const capacityBadgeBareWidthPx = s.capacity
            ? estimateCapacitySuffixWidth(s.capacity.text, s.capacity.icon, LANE_BADGE_FONT_SIZE_PX)
            : 0;
        // Footnote indicator is a comma-joined number list painted at
        // 10 pt 700-weight; estimate via the shared caption helper.
        const footnoteIndicatorText =
            s.footnoteIndicators.length > 0 ? s.footnoteIndicators.join(',') : '';
        const footnoteIndicatorWidthPx = footnoteIndicatorText
            ? estimateCaptionWidthPx(footnoteIndicatorText, LANE_BADGE_FONT_SIZE_PX)
            : 0;
        const tab = frameTabGeometry(
            s.box.x,
            s.title,
            s.owner,
            capacityBadgeBareWidthPx,
            footnoteIndicatorWidthPx,
        );
        const tabH = FRAME_TAB_HEIGHT_PX;
        const tabY = s.box.y + 10;
        const labelY = tabY + FRAME_TAB_LABEL_BASELINE_OFFSET_PX;
        parts.push(
            tag('rect', {
                x: num(tab.tabX),
                y: num(tabY),
                width: num(tab.tabW),
                height: num(tabH),
                rx: 4,
                ry: 4,
                fill: tabFill,
                stroke: tabStroke,
                'stroke-width': 1,
            }),
        );
        parts.push(
            textTag(
                {
                    x: num(tab.titleX),
                    y: num(labelY),
                    'font-family': fonts[s.style.font],
                    'font-size': 12,
                    'font-weight': 600,
                    fill: tabText,
                },
                s.title,
            ),
        );
        if (s.owner) {
            parts.push(
                textTag(
                    {
                        x: num(tab.ownerX),
                        y: num(labelY),
                        'font-family': fonts[s.style.font],
                        'font-size': 10,
                        fill: ownerText,
                    },
                    `owner: ${s.owner}`,
                ),
            );
        }
        if (s.capacity) {
            // Re-uses the same `renderCapacitySuffix` helper that paints
            // item-level suffixes (m6) so multiplier / built-in SVG /
            // inline literal / dereferenced-custom-glyph paths stay
            // consistent across both contexts.
            parts.push(
                renderCapacitySuffix(
                    s.capacity,
                    undefined,
                    tab.badgeX,
                    labelY,
                    LANE_BADGE_FONT_SIZE_PX,
                    fonts[s.style.font],
                    ownerText,
                ),
            );
        }
        if (footnoteIndicatorText) {
            parts.push(
                textTag(
                    {
                        x: num(tab.footnoteRightX),
                        y: num(tabY + 14),
                        'font-family': fonts.sans,
                        'font-size': LANE_BADGE_FONT_SIZE_PX,
                        'font-weight': 700,
                        fill: footnoteColor,
                        'text-anchor': 'end',
                    },
                    footnoteIndicatorText,
                ),
            );
        }
    }
    for (const c of s.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette, fonts));
    }
    // m13: tri-state utilization underline along the band's bottom edge.
    // Painted after items so it overlays any item that happens to extend
    // to the band's bottom; under cut-lines / now-line which run as
    // separate top-level passes.
    parts.push(renderLaneUtilization(s, palette));
    return tag('g', { 'data-layer': 'swimlane', 'data-id': s.id ?? null }, parts.join(''));
}
