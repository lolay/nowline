// Container geometry — a group or parallel is drawn above and around its
// content, never beside it (specs/true-width-layout.md §3.3):
//
//   header  the title over a bracket that spans exactly the container's
//           dates; the title starts at the container's start and may run
//           past the bracket's end, and inline-date glyphs sit beside it.
//   body    a shaded rectangle spanning exactly the container's dates, from
//           the header down to below the last child, padded above and below
//           the content, never left or right.
//
// A container's `box` is the whole of it: `box.y` is the header's top,
// `box.y + headerHeight` the body's top, and `box.x` / `box.width` its dates.
// Layout (the reservation, the glyph placement, the row footprint) and the
// renderer (the bracket, the title, the body) both read these helpers, so the
// painted header and the space layout keeps for it can't drift apart.

import { INLINE_DATE_GLYPH_GAP_PX, INLINE_DATE_GLYPH_TILE_SIZE_PX } from './item-bar-geometry.js';
import { TEXT_SIZE_PX } from './themes/shared.js';
import type { PositionedTrackChild } from './types.js';

/** Height (px) of a container's header band: title row, then the bracket. */
export const CONTAINER_HEADER_BAND_PX = 18;

/** The bracket's horizontal line, measured down from the header's top. Its
 *  end ticks run from here down to the body's top. */
export const CONTAINER_BRACKET_LINE_OFFSET_PX = 13;

/** Font size (px) of a header title. */
export const CONTAINER_HEADER_TITLE_FONT_SIZE_PX = TEXT_SIZE_PX.xs;

/** Baseline of a header title, measured down from the header's top. */
export const CONTAINER_HEADER_TITLE_BASELINE_PX = 10;

/** Padding (px) between a container's body edge and its content, above and
 *  below only. */
export const CONTAINER_BODY_PAD_PX = 6;

/** Clear space (px) the row keeps past a header that runs beyond its
 *  container's end, the same buffer an item's spilled caption keeps. */
export const CONTAINER_HEADER_CLEARANCE_PX = 6;

/** Fill opacity of a container body directly in a lane: its `bg`, as a
 *  light tint over the lane band. */
export const CONTAINER_BODY_FILL_OPACITY = 0.12;

/** Fill opacity of a container body nested one level, inside another
 *  container's body: a lighter tint, so the two stack to a step darker
 *  rather than to a new colour (specs/true-width-layout.md §8 O4). */
export const CONTAINER_NESTED_BODY_FILL_OPACITY = 0.06;

/** Nesting depth (1 for a container directly in a lane) past which a body
 *  is outlined instead of filled, so tints never compound three deep
 *  (specs/true-width-layout.md §8 O4). */
export const CONTAINER_MAX_FILLED_DEPTH = 2;

/** Vertical chrome a container reserves around its content. */
export interface ContainerChrome {
    /** Header band height: 0 when the header would be empty. */
    header: number;
    /** Body padding above the content, and again below it. */
    pad: number;
}

/**
 * The chrome a container reserves. A wave-only group draws nothing and
 * reserves nothing (specs/waves.md §9.7). Any other container pads its body;
 * it keeps a header band when there is a title, an inline-date glyph or a
 * visible bracket to put in it.
 */
export function containerChrome(opts: {
    drawn: boolean;
    hasTitle: boolean;
    hasPins: boolean;
    hasBracket: boolean;
}): ContainerChrome {
    if (!opts.drawn) return { header: 0, pad: 0 };
    const hasHeader = opts.hasTitle || opts.hasPins || opts.hasBracket;
    return { header: hasHeader ? CONTAINER_HEADER_BAND_PX : 0, pad: CONTAINER_BODY_PAD_PX };
}

/**
 * Left x of the header title: the container's start, or one gap past an
 * `after:` glyph, which takes the header's leftmost slot.
 */
export function containerHeaderTitleX(boxX: number, hasAfterGlyph: boolean): number {
    return hasAfterGlyph ? boxX + INLINE_DATE_GLYPH_TILE_SIZE_PX + INLINE_DATE_GLYPH_GAP_PX : boxX;
}

/**
 * Estimated width (px) of a header title. Same pessimistic ~0.58 em/char
 * heuristic the caption-spill math uses, so the row reserves a little more
 * than the text needs rather than less.
 */
export function containerHeaderTitleWidth(title: string): number {
    return title.length * CONTAINER_HEADER_TITLE_FONT_SIZE_PX * 0.58;
}

/**
 * Rightmost x a container's own header paints: its title (at its estimated
 * width) and its inline-date glyphs. `-Infinity` for an item, or a container
 * with neither.
 */
export function containerHeaderRightX(block: PositionedTrackChild): number {
    if (block.kind === 'item') return Number.NEGATIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    const pins = block.inlineDatePins ?? [];
    for (const pin of pins) right = Math.max(right, pin.glyphTopLeft.x + pin.glyphSize);
    if (block.title && block.headerHeight > 0) {
        const hasAfter = pins.some((pin) => pin.side === 'after');
        right = Math.max(
            right,
            containerHeaderTitleX(block.box.x, hasAfter) + containerHeaderTitleWidth(block.title),
        );
    }
    return right;
}
