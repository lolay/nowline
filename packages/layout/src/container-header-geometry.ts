// Container header band geometry — the strip directly ABOVE a bracket /
// unstyled group's or a parallel's box that carries the container's title
// text and its inline-date glyphs. A container's first child row starts
// at `box.y`, flush with its corners, so nothing that is painted before
// the children may sit inside the box's top row: it would be covered.
// The band is space the container reserves for itself, above that row.
//
// Layout (the band reservation, the glyph placement) and the renderer
// (the title text, the group bracket's top foot) both call these
// helpers, so the painted title and the glyph clearance can't drift
// apart. Filled ("chiclet") groups carry their title and glyphs inside
// the box instead; see `group-title-tab-geometry.ts`.

import { groupHasFill, groupTitleTabWidth } from './group-title-tab-geometry.js';
import {
    INLINE_DATE_GLYPH_GAP_PX,
    INLINE_DATE_GLYPH_INSET_LEFT_PX,
    INLINE_DATE_GLYPH_TILE_SIZE_PX,
} from './item-bar-geometry.js';
import { GROUP_BRACKET_LABEL_OVERHANG_PX, ITEM_INSET_PX, TEXT_SIZE_PX } from './themes/shared.js';
import type { PositionedTrackChild } from './types.js';

/** Height (px) of the header band. Same strip a bracket group's title
 *  has always overhung into, and the parallel bracket's top padding. */
export const CONTAINER_HEADER_BAND_PX = GROUP_BRACKET_LABEL_OVERHANG_PX;

/** Font size (px) of a header-band title. */
export const CONTAINER_HEADER_TITLE_FONT_SIZE_PX = TEXT_SIZE_PX.xs;

/** Baseline of a header-band title, measured up from `box.y`. */
export const CONTAINER_HEADER_TITLE_BASELINE_OFFSET_PX = 2;

/** Title inset (px) from `box.x` for a bracket / unstyled group. */
export const GROUP_HEADER_TITLE_INSET_X_PX = 6;

/** Title inset (px) from `box.x` for a parallel. */
export const PARALLEL_HEADER_TITLE_INSET_X_PX = 4;

/**
 * Header band height (px) a group reserves above its box. Bracket and
 * unstyled groups reserve it for a title or inline-date glyphs; filled
 * groups reserve none (their chiclet row sits inside the box).
 */
export function groupHeaderBandPx(hasFill: boolean, hasTitle: boolean, hasPins: boolean): number {
    return !hasFill && (hasTitle || hasPins) ? CONTAINER_HEADER_BAND_PX : 0;
}

/**
 * Header band height (px) a parallel reserves above its box. Only
 * inline-date glyphs reserve it; a title-only parallel keeps painting
 * its title in the inter-row gap above the box, as it always has.
 */
export function parallelHeaderBandPx(hasPins: boolean): number {
    return hasPins ? CONTAINER_HEADER_BAND_PX : 0;
}

/**
 * Left x of the header-band title. An `after:` glyph takes the band's
 * leftmost slot (`INLINE_DATE_GLYPH_INSET_LEFT_PX`, above the first
 * child's left edge), and the title follows one gap past it.
 */
export function containerHeaderTitleX(
    boxX: number,
    titleInsetX: number,
    hasAfterGlyph: boolean,
): number {
    return hasAfterGlyph
        ? boxX +
              INLINE_DATE_GLYPH_INSET_LEFT_PX +
              INLINE_DATE_GLYPH_TILE_SIZE_PX +
              INLINE_DATE_GLYPH_GAP_PX
        : boxX + titleInsetX;
}

/**
 * Estimated width (px) of a header-band title. Same pessimistic
 * ~0.58 em/char heuristic the caption-spill math uses, so a `before:`
 * glyph clamped past it errs toward extra air rather than overlap.
 */
export function containerHeaderTitleWidth(title: string): number {
    return title.length * CONTAINER_HEADER_TITLE_FONT_SIZE_PX * 0.58;
}

/**
 * Rightmost x reached by the title row of every pinned container in
 * `block`'s subtree (the block itself and any nested group / parallel):
 * its inline-date glyphs and its title (chiclet, or header-band text at
 * its estimated width). `-Infinity` when nothing in the subtree is
 * pinned.
 */
function pinnedTitleRowRightX(block: PositionedTrackChild): number {
    if (block.kind === 'item') return Number.NEGATIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    const pins = block.inlineDatePins ?? [];
    for (const pin of pins) right = Math.max(right, pin.glyphTopLeft.x + pin.glyphSize);
    if (pins.length > 0 && block.title) {
        if (block.kind === 'group' && groupHasFill(block.style.bg)) {
            right = Math.max(right, block.box.x + groupTitleTabWidth(block.title));
        } else {
            const insetX =
                block.kind === 'group'
                    ? GROUP_HEADER_TITLE_INSET_X_PX
                    : PARALLEL_HEADER_TITLE_INSET_X_PX;
            const hasAfter = pins.some((pin) => pin.side === 'after');
            right = Math.max(
                right,
                containerHeaderTitleX(block.box.x, insetX, hasAfter) +
                    containerHeaderTitleWidth(block.title),
            );
        }
    }
    for (const child of block.children) right = Math.max(right, pinnedTitleRowRightX(child));
    return right;
}

/**
 * Spill reservation (x) a placed block claims on its row, or null.
 * A pinned container's title row sits level with the top of the row it
 * was placed on, and a `before:` glyph clamped past a long title can run
 * past the block's right edge. A sibling chained onto the same row
 * would then be painted over it. Reserving that extent makes the row
 * packer bump such a sibling to a fresh row, the same way an item's
 * spilled caption does.
 */
export function blockTitleRowSpillReservation(block: PositionedTrackChild): number | null {
    const right = pinnedTitleRowRightX(block);
    return right > block.box.x + block.box.width ? right + ITEM_INSET_PX : null;
}
