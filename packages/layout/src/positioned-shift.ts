// Vertical translation of already-positioned layout subtrees.
//
// Layout moves placed content down in two places:
//
//   - `RowPacker`, when a row grows after the rows below it were placed
//     (a taller item lands on an existing row), pushes every later row's
//     children down by the growth.
//   - `RoadmapNode`, when the unified marker re-pack needs more rows than
//     the marker band was sized for, pushes every swimlane and include
//     region down by the extra band height.
//
// Both paths go through `shiftTrackChildY`, so every absolute y the
// positioned model carries is listed exactly once, here. A new y-bearing
// field on `PositionedItem` / `PositionedGroup` / `PositionedParallel` has
// to move here or it is left behind by both shifts.
//
// Arrow attach ports are deliberately NOT stored anywhere that needs
// shifting: they are derived from each item's final box when the arrows
// are built (see `item-port-geometry.ts`).

import type { PositionedIncludeRegion, PositionedSwimlane, PositionedTrackChild } from './types.js';

/**
 * Move a positioned item, group or parallel (and everything inside it)
 * down by `dy`: its box, its inline-date glyphs, and for an item its
 * label chips and `before:` overflow box.
 */
export function shiftTrackChildY(child: PositionedTrackChild, dy: number): void {
    child.box.y += dy;
    for (const pin of child.inlineDatePins ?? []) pin.glyphTopLeft.y += dy;
    if (child.kind === 'item') {
        for (const chip of child.labelChips) chip.box.y += dy;
        if (child.overflowBox) child.overflowBox.y += dy;
        return;
    }
    for (const c of child.children) shiftTrackChildY(c, dy);
}

/** Move a swimlane band, its children and its nested lanes down by `dy`. */
export function shiftSwimlaneY(lane: PositionedSwimlane, dy: number): void {
    lane.box.y += dy;
    for (const child of lane.children) shiftTrackChildY(child, dy);
    for (const nested of lane.nested) shiftSwimlaneY(nested, dy);
}

/** Move an include region and its nested lanes down by `dy`. */
export function shiftIncludeY(region: PositionedIncludeRegion, dy: number): void {
    region.box.y += dy;
    for (const lane of region.nestedSwimlanes) shiftSwimlaneY(lane, dy);
}
