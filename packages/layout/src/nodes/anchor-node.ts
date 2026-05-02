// AnchorNode — Renderable for a single anchor + a `buildAnchors` loop
// helper. Each anchor sits in the marker row of the timeline and emits
// a downward cut line through the chart. When an anchor's x collides
// with an existing milestone x it bumps up to `markerRow.collisionY`
// so the diamond stays visible.

import type { AnchorDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type { PositionedAnchor, Point } from '../types.js';
import type { LayoutContext } from '../layout-context.js';
import { propValue, parseDate } from '../dsl-utils.js';

export class AnchorNode {
    constructor(
        public readonly id: string,
        public readonly anchor: AnchorDeclaration,
    ) {}

    /**
     * Returns null when the anchor has no `date:` or its date falls
     * outside the chart's domain (skipped silently — same as the legacy
     * `buildAnchors` continue-paths).
     */
    place(ctx: LayoutContext, milestoneXs: Set<number>): PositionedAnchor | null {
        const dateRaw = propValue(this.anchor.properties, 'date');
        const date = parseDate(dateRaw);
        if (!date) return null;
        const x = ctx.scale.forwardWithinDomain(date);
        if (x === null) return null;
        const style = resolveStyle('anchor', this.anchor.properties, ctx.styleCtx);
        const inRowY = ctx.timeline.markerRow.y;
        const collisionY = ctx.timeline.markerRow.collisionY;
        const bumpedUp = milestoneXs.has(x);
        const y = bumpedUp ? collisionY : inRowY;
        const center: Point = { x, y };
        ctx.entityLeftEdges.set(this.id, x);
        ctx.entityRightEdges.set(this.id, x);
        ctx.entityMidpoints.set(this.id, center);
        return {
            id: this.id,
            title: this.anchor.title ?? this.id,
            center,
            radius: 6,
            style,
            predecessorPoints: [],
            cutTopY: ctx.chartTopY,
            cutBottomY: ctx.chartBottomY,
            bumpedUp,
        };
    }
}

export function buildAnchors(
    anchors: Map<string, AnchorDeclaration>,
    ctx: LayoutContext,
    milestoneXs: Set<number>,
): PositionedAnchor[] {
    const out: PositionedAnchor[] = [];
    for (const [id, a] of anchors) {
        const positioned = new AnchorNode(id, a).place(ctx, milestoneXs);
        if (positioned) out.push(positioned);
    }
    return out;
}
