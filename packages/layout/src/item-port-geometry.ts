// Item attach ports: where dependency arrows and milestone slack arrows
// meet an item bar.
//
// Every port is a pure function of the item's FINAL `box` (plus the row
// bandwidth), read when the arrows are built, never captured while the
// item is being placed. Layout moves bars down after placing them (a row
// that grows retroactively pushes the rows below it down; a marker band
// that outgrows its sizing pushes the whole chart down), and a port
// captured at placement time would stay behind at the old y. Deriving
// from the box makes the ports move with the bar by construction.
//
// Attach rules (specs/rendering.md "Dependency Arrows", and the slack
// arrows under "Milestones"):
//
//   - Arrows and slack arrows attach on the row's NOMINAL midline,
//     `box.y + bandwidth / 2`, not the bar's own mid-height, so a bar
//     grown by a wrapped title or a chip column shares an attach line
//     with its un-grown row neighbours, and a grown bar's slack arrow
//     leaves level with its dependency arrows.
//   - Caption spilled past the right edge (`textSpills`): the arrow
//     target stays on the nominal midline, but the arrow source and the
//     slack arrow drop to the vertical center of the bottom progress
//     strip so they run under the spilled title / meta text instead of
//     through it.

import { PROGRESS_STRIP_HEIGHT_PX } from './themes/shared.js';
import type { Point, PositionedItem } from './types.js';

/** Y of the bottom progress strip's vertical center. */
function progressStripMidY(item: PositionedItem): number {
    return item.box.y + item.box.height - PROGRESS_STRIP_HEIGHT_PX / 2;
}

/** Where a dependency arrow INTO `item` terminates: the bar's left edge. */
export function itemArrowTargetPort(item: PositionedItem, bandwidth: number): Point {
    const { box } = item;
    return {
        x: box.x,
        y: box.y + bandwidth / 2,
    };
}

/** Where a dependency arrow OUT OF `item` starts: the bar's right edge. */
export function itemArrowSourcePort(item: PositionedItem, bandwidth: number): Point {
    const { box } = item;
    return {
        x: box.x + box.width,
        y: item.textSpills ? progressStripMidY(item) : box.y + bandwidth / 2,
    };
}

/**
 * Y where a milestone slack arrow leaves `item`: the row's nominal
 * midline (the line its dependency arrows use), or the progress strip's
 * center when the caption spilled (so the arrow aligns with the strip
 * instead of running through the spilled title / meta text). The
 * arrow's x is the bar's right edge.
 */
export function itemSlackAttachY(item: PositionedItem, bandwidth: number): number {
    return item.textSpills ? progressStripMidY(item) : item.box.y + bandwidth / 2;
}
