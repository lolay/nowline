// Dependency edges (finalize step f11): every `after:` reference of a
// placed item becomes an arrow routed through the channel grid, its ports
// read off the final boxes.

import type {
    GroupBlock,
    ItemDeclaration,
    ParallelBlock,
    SwimlaneDeclaration,
} from '@nowline/core';
import { isGroupBlock, isItemDeclaration, isParallelBlock } from '@nowline/core';
import { propValues } from '../dsl-utils.js';
import {
    ChannelGrid,
    collectRoutingObstacles,
    type EdgeRouteRequest,
    routeChannelEdges,
} from '../edge-routing.js';
import { itemArrowSourcePort, itemArrowTargetPort } from '../item-port-geometry.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type {
    Point,
    PositionedDependencyEdge,
    PositionedIncludeRegion,
    PositionedSwimlane,
} from '../types.js';

import { syntheticItemKey } from './sequence-item.js';

// Traverse the full content tree to build an `items` map keyed by id.
export function collectItems(swimlanes: SwimlaneDeclaration[]): Map<string, ItemDeclaration> {
    const out = new Map<string, ItemDeclaration>();
    const walk = (node: ItemDeclaration | GroupBlock | ParallelBlock): void => {
        if (isItemDeclaration(node)) {
            // Title-only items register under a synthetic, non-referenceable
            // handle so they still appear as dependency-edge targets.
            out.set(node.name ?? syntheticItemKey(node), node);
            return;
        }
        if (isParallelBlock(node)) {
            for (const child of node.content) {
                if (child.$type === 'DescriptionDirective') continue;
                walk(child as ItemDeclaration | GroupBlock);
            }
            return;
        }
        if (isGroupBlock(node)) {
            for (const child of node.content) {
                if (child.$type === 'DescriptionDirective') continue;
                walk(child as ItemDeclaration | GroupBlock | ParallelBlock);
            }
            return;
        }
    };
    for (const lane of swimlanes) {
        for (const child of lane.content) {
            if (child.$type === 'DescriptionDirective') continue;
            walk(child as ItemDeclaration | GroupBlock | ParallelBlock);
        }
    }
    return out;
}

export function buildDependencies(
    items: Map<string, ItemDeclaration>,
    swimlanes: PositionedSwimlane[],
    includes: PositionedIncludeRegion[],
    ctx: LayoutContext,
): PositionedDependencyEdge[] {
    // m2g+: collect every painted item bar + every visible parallel /
    // group bracket once, hand to the channel router so it can drop
    // vertical legs in clean inter-column gutters and nudge away from
    // bracket strokes that would otherwise be hugged.
    const grid = new ChannelGrid(collectRoutingObstacles(swimlanes, includes));

    interface Pending {
        fromId: string;
        toId: string;
    }
    const requests: EdgeRouteRequest[] = [];
    const pending: Pending[] = [];

    // Ports are read off each item's FINAL box here, after every row and
    // marker-band shift has run, never captured while the item was placed.
    const bandwidth = ctx.bandScale.bandwidth();
    for (const [id, item] of items) {
        const afters = propValues(item.properties, 'after');
        const target = ctx.placedItems.get(id);
        if (!target) continue;
        // The arrow always TERMINATES at the target item's left
        // visual edge, on its attach line (see `itemArrowTargetPort`).
        const targetPoint = itemArrowTargetPort(target, bandwidth);
        for (const pred of afters) {
            // Source point depends on what kind of predecessor `pred`
            // is. For ITEMS we use the per-item arrow source port
            // — (visualRight, nominal midline) by default, dropping to
            // (visualRight, bar.bottom - PROGRESS_STRIP_HEIGHT/2) when
            // the caption spilled past the right edge so the arrow
            // exits below the spilled title / meta text. For ANCHORS
            // / MILESTONES we attach to the marker's vertical CUT
            // LINE at the TARGET item's attach Y — the dashed/solid
            // cut line already drops through the chart and reads as
            // the arrow's stem, so a short horizontal stub from the
            // line into the bar's left edge is the cleanest
            // connection.
            const predItem = ctx.placedItems.get(pred);
            let from: Point;
            const isMarkerPred = predItem === undefined;
            if (predItem) {
                from = itemArrowSourcePort(predItem, bandwidth);
            } else {
                const markerMid = ctx.entityMidpoints.get(pred);
                if (!markerMid) continue;
                from = { x: markerMid.x, y: targetPoint.y };
            }
            // Skip same-row contiguous chains for ITEM → ITEM only:
            // when the target sits immediately to the right of the
            // source on the same row, the spatial flow already
            // conveys ordering and an arrow is redundant noise.
            // MARKER → ITEM stubs always draw (the cut line is the
            // stem; the short stub completes the visual connection
            // even when the bar is right next to the cut line).
            if (
                !isMarkerPred &&
                Math.abs(from.y - targetPoint.y) < 0.5 &&
                targetPoint.x - from.x < 20
            ) {
                continue;
            }
            requests.push({
                fromId: pred,
                toId: id,
                from,
                to: targetPoint,
                isMarkerSource: isMarkerPred,
            });
            pending.push({ fromId: pred, toId: id });
        }
    }

    const routed = routeChannelEdges(requests, grid);
    const out: PositionedDependencyEdge[] = [];
    for (let i = 0; i < routed.length; i++) {
        const r = routed[i];
        out.push({
            fromId: pending[i].fromId,
            toId: pending[i].toId,
            waypoints: r.waypoints,
            kind: r.underBar ? 'underBar' : 'normal',
            style: resolveStyle('item', [], ctx.styleCtx),
        });
    }
    return out;
}
