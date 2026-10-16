// Arrow ends: where dependency arrows and milestone slack lines meet an
// item bar or a container.
//
// Every end is a pure function of the entity's FINAL geometry (its box,
// plus an item's `dateSpan` and the row bandwidth), read when the arrows
// are built, never captured while the entity is placed. Layout moves
// placed content down afterwards (a marker band that outgrows its sizing
// pushes the whole chart down), and a port captured at placement time
// would stay behind at the old y. Nothing moves horizontally, so the
// dates in x an item records at placement stay true.
//
// Rules (specs/true-width-layout.md §3.4, §3.5):
//
//   - x comes from the dates: the router puts the port in the middle of
//     the source's last day and the target's first day (`edge-routing.ts`).
//   - y comes from the painted edges: top and bottom of the bar, or of the
//     container (its header's top to its body's bottom).
//   - On its own row an arrow runs at the row's NOMINAL midline,
//     `box.y + bandwidth / 2`, so a bar grown by a wrapped title or a chip
//     column shares the line with its un-grown row neighbours. A source
//     whose caption spills right leaves at the centre of its bottom
//     progress strip instead, so the leg runs under the caption; milestone
//     slack lines leave on the same y.

import type { ArrowEnd } from './edge-routing.js';
import { PROGRESS_STRIP_HEIGHT_PX } from './themes/shared.js';
import type { PositionedGroup, PositionedItem, PositionedParallel } from './types.js';

/** Y of the bottom progress strip's vertical center. */
function progressStripMidY(item: PositionedItem): number {
    return item.box.y + item.box.height - PROGRESS_STRIP_HEIGHT_PX / 2;
}

/** An item as an arrow end. */
export function itemArrowEnd(item: PositionedItem, bandwidth: number): ArrowEnd {
    const { box } = item;
    return {
        startX: item.dateSpan.startX,
        endX: item.dateSpan.endX,
        paintedX: box.x,
        paintedWidth: box.width,
        top: box.y,
        bottom: box.y + box.height,
        rowY: box.y + bandwidth / 2,
        exitY: itemSlackAttachY(item, bandwidth),
    };
}

/** A group or parallel as an arrow source: its box spans exactly its dates. */
export function containerArrowEnd(container: PositionedGroup | PositionedParallel): ArrowEnd {
    const { box } = container;
    return {
        startX: box.x,
        endX: box.x + box.width,
        paintedX: box.x,
        paintedWidth: box.width,
        top: box.y,
        bottom: box.y + box.height,
    };
}

/**
 * Y where a milestone slack line leaves `item`: the row's nominal midline,
 * or the progress strip's center when the caption spilled (so the line
 * runs under the spilled title / meta text). Its x is the item's end date.
 */
export function itemSlackAttachY(item: PositionedItem, bandwidth: number): number {
    return item.textSpills ? progressStripMidY(item) : item.box.y + bandwidth / 2;
}
