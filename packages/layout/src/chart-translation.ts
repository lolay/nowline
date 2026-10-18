// The chart's one vertical translation.
//
// Placement lays the chart out in local coordinates, with its top at y 0
// (`phases/place.ts`). Its top on the canvas is known only once the header
// rows above it stop growing (a now-pill row reserved on an extended axis,
// a marker band the final pack grew), so finalize translates the whole
// chart there, once, on every layout (`growHeaderRows`, f7). An isolated
// region also moves its own lanes down below its marker band, once, while
// it is placed (`include-node.ts`).
//
// Every y the chart's positioned model carries is listed exactly once,
// here. A new y-bearing field on `PositionedItem` / `PositionedGroup` /
// `PositionedParallel` has to join it or it stays at its local y, a chart
// top above where it belongs on every render.
//
// Arrow attach ports are deliberately NOT stored anywhere that needs
// translating: they are derived from each item's final box when the
// arrows are built (see `item-port-geometry.ts`).

import type {
    PositionedIncludeRegion,
    PositionedMilestone,
    PositionedSwimlane,
    PositionedTrackChild,
} from './types.js';

/**
 * Move a positioned item, group or parallel (and everything inside it)
 * down by `dy`: its box, its inline-date glyphs, and for an item its
 * label chips and `before:` overflow box.
 */
export function translateTrackChildY(child: PositionedTrackChild, dy: number): void {
    child.box.y += dy;
    for (const pin of child.inlineDatePins ?? []) pin.glyphTopLeft.y += dy;
    if (child.kind === 'item') {
        for (const chip of child.labelChips) chip.box.y += dy;
        if (child.overflowBox) child.overflowBox.y += dy;
        return;
    }
    for (const c of child.children) translateTrackChildY(c, dy);
}

/** Move a swimlane band, its children and its nested lanes down by `dy`. */
export function translateSwimlaneY(lane: PositionedSwimlane, dy: number): void {
    lane.box.y += dy;
    for (const child of lane.children) translateTrackChildY(child, dy);
    for (const nested of lane.nested) translateSwimlaneY(nested, dy);
}

/** Move an include region, its nested lanes and its own markers down by `dy`. */
export function translateIncludeY(region: PositionedIncludeRegion, dy: number): void {
    region.box.y += dy;
    for (const lane of region.nestedSwimlanes) translateSwimlaneY(lane, dy);
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

/**
 * Move the chart part of a host milestone down by `dy`: its cut line and
 * its slack arrows. Its diamond and label sit in the header's marker band,
 * outside the chart, and stay.
 */
export function translateMilestoneChartY(milestone: PositionedMilestone, dy: number): void {
    milestone.cutTopY += dy;
    milestone.cutBottomY += dy;
    for (const arrow of milestone.slackArrows ?? []) arrow.y += dy;
}
