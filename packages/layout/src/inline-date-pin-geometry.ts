// Inline-date pin glyph placement.
//
// `after:DATE` paints a calendar glyph in the entity's top-LEFT decoration
// slot; `before:DATE` paints it in the top-RIGHT slot. The two helpers
// below produce `Point` coordinates for the glyph's top-left corner, plus
// a `spilled` flag indicating whether the bar was too narrow to host the
// glyph inside (item case only — containers always have room).
//
// Slot interleaving rules (per specs/rendering.md "Inline-date glyph"):
//
//   Item top-LEFT: glyph sits at the bar's leftmost slot when no link icon
//   is present, otherwise one decoration step right of the link icon's
//   right edge.
//
//   Item top-RIGHT: glyph sits at the bar's rightmost slot when no status
//   dot or footnotes are present, one step LEFT of the status dot when no
//   footnotes, and one step LEFT of the LEFTMOST footnote indicator when
//   footnotes are present (so the inline-date glyph inserts at the LEFT
//   end of the existing badge cluster rather than reordering it).
//
//   Container (group, parallel): glyph sits at the bounding box's top
//   corners with the standard inset. Containers don't carry status dots
//   or footnote indicators in their own decoration row, so no
//   interleaving math is needed.

import {
    INLINE_DATE_GLYPH_GAP_PX,
    INLINE_DATE_GLYPH_INSET_LEFT_PX,
    INLINE_DATE_GLYPH_INSET_RIGHT_PX,
    INLINE_DATE_GLYPH_INSET_TOP_PX,
    INLINE_DATE_GLYPH_TILE_SIZE_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_INSET_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_STATUS_DOT_INSET_RIGHT_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    MIN_BAR_WIDTH_FOR_INLINE_DATE_PX,
} from './item-bar-geometry.js';
import type { BoundingBox, InlineDatePin, Point } from './types.js';

export interface ItemInlineDatePinInputs {
    box: BoundingBox;
    /** ISO date string from `after:DATE`, or undefined when no inline `after`. */
    afterDate: string | undefined;
    /** ISO date string from `before:DATE`, or undefined when no inline `before`. */
    beforeDate: string | undefined;
    hasLinkIcon: boolean;
    /** Number of footnote indicators rendered in the bar's top-RIGHT cluster. */
    footnoteCount: number;
}

/**
 * Compute inline-date pin glyph placements for an item bar. Returns an
 * empty array when neither `afterDate` nor `beforeDate` is set.
 *
 * Item bars participate in the narrow-bar spill family — when the bar is
 * narrower than `MIN_BAR_WIDTH_FOR_INLINE_DATE_PX`, the `before:` glyph
 * spills RIGHT of the bar (joining the status-dot / footnote spill
 * column) and the `after:` glyph spills LEFT of the bar's leading edge
 * so the side semantics stay readable.
 */
export function computeItemInlineDatePins(opts: ItemInlineDatePinInputs): InlineDatePin[] {
    const { box, afterDate, beforeDate, hasLinkIcon, footnoteCount } = opts;
    if (!afterDate && !beforeDate) return [];

    const pins: InlineDatePin[] = [];
    const tileSize = INLINE_DATE_GLYPH_TILE_SIZE_PX;
    const topY = box.y + INLINE_DATE_GLYPH_INSET_TOP_PX;
    const spilled = box.width < MIN_BAR_WIDTH_FOR_INLINE_DATE_PX;

    if (afterDate) {
        const insideLeftX = hasLinkIcon
            ? box.x +
              ITEM_LINK_ICON_INSET_PX +
              ITEM_LINK_ICON_TILE_SIZE_PX +
              INLINE_DATE_GLYPH_GAP_PX
            : box.x + INLINE_DATE_GLYPH_INSET_LEFT_PX;
        const glyphLeft: Point = spilled
            ? {
                  x: box.x - ITEM_CAPTION_SPILL_GAP_PX - tileSize,
                  y: topY,
              }
            : { x: insideLeftX, y: topY };
        pins.push({
            side: 'after',
            isoDate: afterDate,
            glyphTopLeft: glyphLeft,
            glyphSize: tileSize,
            spilled,
        });
    }

    if (beforeDate) {
        // Walk LEFT from the rightmost top-decoration slot:
        //   - rightmost footnote anchors at (box.right - INSET_RIGHT_PX)
        //   - leftmost footnote sits one step further left per extra digit
        //   - status dot left edge sits at (box.right - INSET_RIGHT - DOT_RADIUS)
        //   - inline-date glyph sits one INLINE_DATE_GLYPH_GAP_PX further left
        const rightEdge = box.x + box.width;
        let anchorRightX: number;
        if (footnoteCount > 0) {
            const leftmostFootnoteCenter =
                rightEdge -
                ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX -
                (footnoteCount - 1) * ITEM_FOOTNOTE_INDICATOR_STEP_PX;
            anchorRightX = leftmostFootnoteCenter - INLINE_DATE_GLYPH_GAP_PX;
        } else {
            const dotLeftEdge =
                rightEdge - ITEM_STATUS_DOT_INSET_RIGHT_PX - ITEM_STATUS_DOT_RADIUS_PX;
            anchorRightX = dotLeftEdge - INLINE_DATE_GLYPH_GAP_PX;
        }
        const insideRightX = anchorRightX - tileSize;
        const glyphLeft: Point = spilled
            ? {
                  x: rightEdge + ITEM_CAPTION_SPILL_GAP_PX,
                  y: topY,
              }
            : { x: insideRightX, y: topY };
        pins.push({
            side: 'before',
            isoDate: beforeDate,
            glyphTopLeft: glyphLeft,
            glyphSize: tileSize,
            spilled,
        });
    }

    return pins;
}

export interface ContainerInlineDatePinInputs {
    /** Bounding box that anchors the glyph corners. For styled groups and
     *  bracketed parallels this is the visible box; for unstyled groups
     *  and bare parallels it is the logical bounding box (leftmost child
     *  start, rightmost child end, top of the highest child row). */
    box: BoundingBox;
    afterDate: string | undefined;
    beforeDate: string | undefined;
}

/**
 * Compute inline-date pin glyph placements for a container (group or
 * parallel). The glyphs sit flush to the box's top-LEFT (`after`) and
 * top-RIGHT (`before`) corners with the standard inset; containers
 * never spill (they always have room for a 12 px tile in their own
 * top-decoration row).
 */
export function computeContainerInlineDatePins(
    opts: ContainerInlineDatePinInputs,
): InlineDatePin[] {
    const { box, afterDate, beforeDate } = opts;
    if (!afterDate && !beforeDate) return [];

    const pins: InlineDatePin[] = [];
    const tileSize = INLINE_DATE_GLYPH_TILE_SIZE_PX;
    const topY = box.y + INLINE_DATE_GLYPH_INSET_TOP_PX;

    if (afterDate) {
        pins.push({
            side: 'after',
            isoDate: afterDate,
            glyphTopLeft: { x: box.x + INLINE_DATE_GLYPH_INSET_LEFT_PX, y: topY },
            glyphSize: tileSize,
            spilled: false,
        });
    }

    if (beforeDate) {
        pins.push({
            side: 'before',
            isoDate: beforeDate,
            glyphTopLeft: {
                x: box.x + box.width - INLINE_DATE_GLYPH_INSET_RIGHT_PX - tileSize,
                y: topY,
            },
            glyphSize: tileSize,
            spilled: false,
        });
    }

    return pins;
}

/**
 * Returns the first ISO date literal in `values`, or undefined when none
 * is present. The validator enforces "at most one inline date per
 * direction" so this lookup is unambiguous.
 */
export function pickInlineDate(values: readonly string[]): string | undefined {
    for (const v of values) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    }
    return undefined;
}
