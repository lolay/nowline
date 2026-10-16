// content-extent — shared helpers that measure how far right placed
// content reaches. `maxLeafItemRightX` measures the rightmost edge
// reached by leaf item bars inside a set of swimlanes, recursing
// through nested swimlanes and group/parallel `children`;
// `trackChildPaintedRightX` measures everything one track child paints,
// spilled captions included.
//
// A `PositionedItem.box` is always the bar itself, never a spilled
// caption (see `PositionedItem.textSpills`), so the leaf walk is immune
// to caption spill by construction. That makes it a stricter measure
// than `RowPacker.usedRightX()` / `SwimlaneNode`'s `usedRightX`,
// which both fold in `spillX` (the caption's reserved column).
//
// Used by:
//   - Finalize's timeline extension (`extendTimeline`, f2), which
//     grows the date window to cover overflowing content boxes
//     without letting overhanging captions drag it out too.
//   - `buildIncludeRegions`, to size the dashed include bracket to
//     its nested content's bars rather than a spilled caption.
//
// `maxSpilledCaptionRightX` is the other half of f2: a spilled caption
// past the axis end grows the axis by the one column it was capped to.

import { containerHeaderRightX } from '../container-header-geometry.js';
import type { PositionedSwimlane, PositionedTrackChild } from '../types.js';

/**
 * Rightmost x anything in a placed track child paints: an item's bar, its
 * spilled caption, decorations and chips; a group's or parallel's box, its
 * header (a title may run past the bracket's end) and, recursively, its
 * children. A container's box spans only its dates, so a caption one of its
 * children spills past that edge shows up here and nowhere else. The row
 * track feeds it to the packer so the canvas grows to it.
 */
export function trackChildPaintedRightX(child: PositionedTrackChild): number {
    if (child.kind === 'item') {
        return Math.max(
            child.box.x + child.box.width,
            child.decorationsRightX,
            child.chipsOutside ? child.chipsRightX : Number.NEGATIVE_INFINITY,
        );
    }
    let right = Math.max(child.box.x + child.box.width, containerHeaderRightX(child));
    for (const sub of child.children) right = Math.max(right, trackChildPaintedRightX(sub));
    return right;
}

/** Rightmost x reached by any leaf item bar across `swimlanes`, recursing
 *  into nested swimlanes and group/parallel children. Returns 0 when the
 *  set contains no items — callers combine this with another baseline
 *  (e.g. `originX` or a chrome-derived minimum) via `Math.max`. */
export function maxLeafItemRightX(swimlanes: PositionedSwimlane[]): number {
    let max = 0;
    for (const lane of swimlanes) {
        max = Math.max(max, maxTrackChildRightX(lane.children));
        if (lane.nested.length > 0) {
            max = Math.max(max, maxLeafItemRightX(lane.nested));
        }
    }
    return max;
}

function maxTrackChildRightX(children: PositionedTrackChild[]): number {
    let max = 0;
    for (const child of children) {
        if (child.kind === 'item') {
            max = Math.max(max, child.box.x + child.box.width);
        } else {
            max = Math.max(max, maxTrackChildRightX(child.children));
        }
    }
    return max;
}

/**
 * Rightmost x a spilled item caption reaches across `swimlanes` (its spill
 * column: icon, caption, footnotes, dot), recursing like
 * `maxLeafItemRightX`; 0 when no caption spills. Finalize f2 grows the
 * axis by one column for a caption that ends past it (specs/rendering.md
 * § "Caption cap at the chart's end").
 */
export function maxSpilledCaptionRightX(swimlanes: PositionedSwimlane[]): number {
    let max = 0;
    for (const lane of swimlanes) {
        max = Math.max(max, maxTrackChildCaptionRightX(lane.children));
        if (lane.nested.length > 0) {
            max = Math.max(max, maxSpilledCaptionRightX(lane.nested));
        }
    }
    return max;
}

function maxTrackChildCaptionRightX(children: PositionedTrackChild[]): number {
    let max = 0;
    for (const child of children) {
        if (child.kind === 'item') {
            if (child.textSpills) max = Math.max(max, child.decorationsRightX);
        } else {
            max = Math.max(max, maxTrackChildCaptionRightX(child.children));
        }
    }
    return max;
}
