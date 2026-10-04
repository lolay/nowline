// content-extent — shared helper that measures the rightmost edge
// reached by leaf item bars inside a set of swimlanes, recursing
// through nested swimlanes and group/parallel `children`.
//
// A `PositionedItem.box` is always the bar itself, never a spilled
// caption (see `PositionedItem.textSpills`), so this walk is immune
// to caption spill by construction. That makes it a stricter measure
// than `RowPacker.usedRightX()` / `SwimlaneNode`'s `usedRightX`,
// which both fold in `spillX` (the caption's reserved column).
//
// Used by:
//   - `RoadmapNode`'s post-layout timeline-extension pass, which
//     grows the date window to cover overflowing content boxes
//     without letting overhanging captions drag it out too.
//   - `buildIncludeRegions`, to size the dashed include bracket to
//     its nested content's bars rather than a spilled caption.

import type { PositionedSwimlane, PositionedTrackChild } from '../types.js';

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
