// Dependency edges (finalize step f11): every `after:` reference of a
// placed item becomes an arrow on the dates (specs/true-width-layout.md
// §3.4), its ends read off the final model. The host chart and each
// isolated region route their own, among their own lanes.

import type { ItemDeclaration, SwimlaneDeclaration } from '@nowline/core';
import { isItemDeclaration } from '@nowline/core';
import { trackNodes } from '@nowline/core/internal';
import { containerHeaderRightX } from '../container-header-geometry.js';
import { propValues } from '../dsl-utils.js';
import {
    type ArrowEnd,
    arrowHead,
    type DependencyRouteRequest,
    type RouteObstacles,
    routeDependencies,
} from '../edge-routing.js';
import { containerArrowEnd, itemArrowEnd } from '../item-port-geometry.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type {
    PositionedDependencyEdge,
    PositionedGroup,
    PositionedIncludeRegion,
    PositionedParallel,
    PositionedSwimlane,
    PositionedTrackChild,
} from '../types.js';
import { trackChildPaintedRightX } from './content-extent.js';
import { syntheticItemKey } from './sequence-item.js';

// Every item under the lanes, keyed by id. Title-only items register under a
// synthetic, non-referenceable handle so they still appear as dependency-edge
// targets.
export function collectItems(swimlanes: SwimlaneDeclaration[]): Map<string, ItemDeclaration> {
    const out = new Map<string, ItemDeclaration>();
    for (const node of trackNodes(swimlanes)) {
        if (isItemDeclaration(node)) out.set(node.name ?? syntheticItemKey(node), node);
    }
    return out;
}

/** A target that starts within this of a marker's date touches its line. */
const ON_LINE_PX = 0.01;

/**
 * What the router must route around, and every group and parallel by id
 * (the containers an `after:` may name), from the lanes it routes among.
 * Include regions in `includes` count as obstacles only: their own arrows
 * are routed separately.
 */
function collectRouting(
    swimlanes: PositionedSwimlane[],
    includes: PositionedIncludeRegion[],
): { obstacles: RouteObstacles; containers: Map<string, PositionedGroup | PositionedParallel> } {
    const obstacles: RouteObstacles = { blocks: [], edges: [] };
    const containers = new Map<string, PositionedGroup | PositionedParallel>();
    const line = (x: number, width: number, y: number): void => {
        obstacles.blocks.push({ x, y, width, height: 0 });
    };
    const visitChild = (child: PositionedTrackChild, register: boolean): void => {
        const { box } = child;
        if (child.kind === 'item') {
            // The bar with whatever it spills right of itself (caption,
            // decorations, chips), so a horizontal leg stays out of the text.
            obstacles.blocks.push({ ...box, width: trackChildPaintedRightX(child) - box.x });
            obstacles.edges.push(
                { x: box.x, top: box.y, bottom: box.y + box.height },
                { x: box.x + box.width, top: box.y, bottom: box.y + box.height },
            );
            return;
        }
        if (register && child.id) containers.set(child.id, child);
        if (!(child.kind === 'group' && child.waveOnly)) {
            if (child.headerHeight > 0) {
                obstacles.blocks.push({
                    x: box.x,
                    y: box.y,
                    width: Math.max(box.width, containerHeaderRightX(child) - box.x),
                    height: child.headerHeight,
                });
            }
            // Nor along the body's bottom edge.
            line(box.x, box.width, box.y + box.height);
            obstacles.edges.push(
                { x: box.x, top: box.y, bottom: box.y + box.height },
                { x: box.x + box.width, top: box.y, bottom: box.y + box.height },
            );
        }
        for (const sub of child.children) visitChild(sub, register);
    };
    const visitLane = (lane: PositionedSwimlane, register: boolean): void => {
        // A leg never runs along a lane's edge.
        line(lane.box.x, lane.box.width, lane.box.y);
        line(lane.box.x, lane.box.width, lane.box.y + lane.box.height);
        for (const child of lane.children) visitChild(child, register);
        for (const nested of lane.nested) visitLane(nested, register);
    };
    for (const lane of swimlanes) visitLane(lane, true);
    // A region's containers are not referenceable from the host.
    for (const region of includes) {
        line(region.box.x, region.box.width, region.box.y);
        line(region.box.x, region.box.width, region.box.y + region.box.height);
        for (const lane of region.nestedSwimlanes) visitLane(lane, false);
    }
    return { obstacles, containers };
}

export function buildDependencies(
    items: Map<string, ItemDeclaration>,
    swimlanes: PositionedSwimlane[],
    includes: PositionedIncludeRegion[],
    ctx: LayoutContext,
): PositionedDependencyEdge[] {
    const { obstacles, containers } = collectRouting(swimlanes, includes);
    const bandwidth = ctx.bandScale.bandwidth();
    const style = resolveStyle('item', [], ctx.styleCtx);
    // Each slot keeps the arrow's place in `after:` order, whichever way it
    // is built, so the model lists arrows as the file declares them.
    const slots: Array<PositionedDependencyEdge | DependencyRouteRequest | null> = [];

    for (const [id, item] of items) {
        const placed = ctx.placedItems.get(id);
        if (!placed) continue;
        const target = itemArrowEnd(placed, bandwidth);
        for (const pred of propValues(item.properties, 'after')) {
            const predItem = ctx.placedItems.get(pred);
            const predContainer = predItem ? undefined : containers.get(pred);
            let source: ArrowEnd | undefined;
            if (predItem) source = itemArrowEnd(predItem, bandwidth);
            else if (predContainer) source = containerArrowEnd(predContainer);
            if (source) {
                slots.push({ fromId: pred, toId: id, source, target });
                continue;
            }
            // An anchor or milestone: its cut line is the stem. An item that
            // starts on it touches the line and needs no arrow; one that
            // starts later gets a dotted stub from the line to its start
            // (specs/true-width-layout.md §3.5).
            const marker = ctx.entityMidpoints.get(pred);
            if (!marker || target.startX - marker.x <= ON_LINE_PX) continue;
            const y = target.rowY ?? target.top;
            slots.push({
                fromId: pred,
                toId: id,
                waypoints: [
                    { x: marker.x, y },
                    { x: target.paintedX, y },
                ],
                slack: true,
                ...arrowHead(target.bottom - target.top),
                style,
            });
        }
    }

    const requests = slots.filter((s): s is DependencyRouteRequest => s !== null && 'source' in s);
    const routed = routeDependencies(requests, obstacles, ctx.scale.pixelsPerDay);
    const byRequest = new Map(requests.map((r, i) => [r, routed[i]]));
    const out: PositionedDependencyEdge[] = [];
    for (const slot of slots) {
        if (!slot) continue;
        if (!('source' in slot)) {
            out.push(slot);
            continue;
        }
        const r = byRequest.get(slot);
        if (r) out.push({ ...r, style });
    }
    return out;
}
