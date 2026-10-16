// Vertical translation of already-positioned layout subtrees.
//
// Layout moves placed content down in finalize (`growHeaderRows`, f7):
// when the final marker pack needs more rows than the marker band was
// sized for, it pushes every swimlane and include region (with the
// region's own markers) down by the extra band height. (`RowPacker` used
// to shift later rows when an earlier row grew; since rows never move up
// it only ever grows its last row, specs/true-width-layout.md §3.2.)
//
// The shift goes through `shiftTrackChildY`, so every absolute y the
// positioned model carries is listed exactly once, here. A new y-bearing
// field on `PositionedItem` / `PositionedGroup` / `PositionedParallel` has
// to move here or it is left behind.
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

/** Move an include region, its nested lanes and its own markers down by `dy`. */
export function shiftIncludeY(region: PositionedIncludeRegion, dy: number): void {
    region.box.y += dy;
    for (const lane of region.nestedSwimlanes) shiftSwimlaneY(lane, dy);
    for (const marker of [...(region.anchors ?? []), ...(region.milestones ?? [])]) {
        marker.center.y += dy;
        marker.labelBox.y += dy;
        marker.cutTopY += dy;
        marker.cutBottomY += dy;
    }
    for (const milestone of region.milestones ?? []) {
        for (const arrow of milestone.slackArrows ?? []) arrow.y += dy;
    }
    for (const edge of region.edges ?? []) {
        for (const point of edge.waypoints) point.y += dy;
    }
}
