// Inline-date pin glyph placement.
//
// `after:DATE` paints a calendar glyph in the entity's top-LEFT decoration
// slot; `before:DATE` paints it in the top-RIGHT slot. The two helpers
// below produce `Point` coordinates for the glyph's top-left corner, plus
// a `spilled` flag indicating whether the bar was too narrow to host the
// glyph inside (item case only — containers never spill).
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
//   Container (group, parallel): the box's top corners belong to the
//   first child row, so the glyphs get a row of their own: a filled
//   group's title chiclet row inside the box, or the header band every
//   other container reserves above it (see `computeContainerInlineDatePins`).
//   Containers don't carry status dots or footnote indicators, so the
//   only neighbor to clear is the container's own title.

import {
    CONTAINER_HEADER_BAND_PX,
    containerHeaderTitleWidth,
    containerHeaderTitleX,
} from './container-header-geometry.js';
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
import { GROUP_TITLE_TAB_HEIGHT_PX } from './themes/shared.js';
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

/**
 * The row a container's inline-date glyphs sit in. A container's first
 * child row starts flush with its box's top corners, so the glyphs never
 * use the corners themselves:
 *
 *   - `title-tab-row`: a filled group's chiclet row, inside the box's
 *     top edge, above the first child (the group's top pad reserves it,
 *     with or without a title). `titleTabWidth` is the chiclet's width
 *     (`groupTitleTabWidth`), or undefined for an untitled group.
 *   - `header-band`: the `CONTAINER_HEADER_BAND_PX` strip above `box.y`
 *     that a bracket / unstyled group or a parallel reserves for its
 *     title and glyphs (`groupHeaderBandPx` / `parallelHeaderBandPx`).
 *     `title` is the title painted in the band, `titleInsetX` its inset
 *     from `box.x` when no `after` glyph precedes it.
 */
export type ContainerGlyphRow =
    | { kind: 'title-tab-row'; titleTabWidth?: number }
    | { kind: 'header-band'; title?: string; titleInsetX: number };

export interface ContainerInlineDatePinInputs {
    /** The container's box: the visible box for a filled group, the
     *  logical extent (leftmost child start, rightmost child end, top of
     *  the first child row) for every other container. */
    box: BoundingBox;
    afterDate: string | undefined;
    beforeDate: string | undefined;
    row: ContainerGlyphRow;
}

/**
 * Compute inline-date pin glyph placements for a container (group or
 * parallel). Containers never spill. Both glyphs sit in the container's
 * glyph `row`, vertically centered on it:
 *
 *   - `after` takes the row's leftmost free slot: one gap past a filled
 *     group's chiclet (so the chiclet stays flush in the corner), else
 *     the standard left inset, ahead of a header-band title (which
 *     `containerHeaderTitleX` shifts past the glyph).
 *   - `before` sits flush right with the standard inset, but never
 *     slides left onto the chiclet, the header-band title (estimated
 *     width), or the `after` glyph: when those run past its slot, it
 *     sits one gap past whichever ends last, even beyond the box.
 */
export function computeContainerInlineDatePins(
    opts: ContainerInlineDatePinInputs,
): InlineDatePin[] {
    const { box, afterDate, beforeDate, row } = opts;
    if (!afterDate && !beforeDate) return [];

    const pins: InlineDatePin[] = [];
    const tileSize = INLINE_DATE_GLYPH_TILE_SIZE_PX;
    let topY: number;
    let afterX: number;
    // Right edge of whatever already occupies the row's left end.
    let leftClearX: number;
    if (row.kind === 'title-tab-row') {
        topY = box.y + (GROUP_TITLE_TAB_HEIGHT_PX - tileSize) / 2;
        const tabRight = row.titleTabWidth !== undefined ? box.x + row.titleTabWidth : undefined;
        afterX =
            tabRight !== undefined
                ? tabRight + INLINE_DATE_GLYPH_GAP_PX
                : box.x + INLINE_DATE_GLYPH_INSET_LEFT_PX;
        leftClearX = tabRight ?? box.x;
    } else {
        topY = box.y - CONTAINER_HEADER_BAND_PX + (CONTAINER_HEADER_BAND_PX - tileSize) / 2;
        afterX = box.x + INLINE_DATE_GLYPH_INSET_LEFT_PX;
        leftClearX = row.title
            ? containerHeaderTitleX(box.x, row.titleInsetX, Boolean(afterDate)) +
              containerHeaderTitleWidth(row.title)
            : box.x;
    }

    if (afterDate) {
        leftClearX = Math.max(leftClearX, afterX + tileSize);
        pins.push({
            side: 'after',
            isoDate: afterDate,
            glyphTopLeft: { x: afterX, y: topY },
            glyphSize: tileSize,
            spilled: false,
        });
    }

    if (beforeDate) {
        const flushRightX = box.x + box.width - INLINE_DATE_GLYPH_INSET_RIGHT_PX - tileSize;
        pins.push({
            side: 'before',
            isoDate: beforeDate,
            glyphTopLeft: {
                x: Math.max(flushRightX, leftClearX + INLINE_DATE_GLYPH_GAP_PX),
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
