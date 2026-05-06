// AnchorNode — Renderable for a single anchor + a `buildAnchors` loop
// helper. Each anchor sits in the marker row of the timeline and emits
// a downward cut line through the chart. Marker-row placement (row +
// label box + left/right label side) is decided up-front in
// `roadmap-node.ts` (`packMarkerRow`) so anchors and milestones share
// the same row stack — see `LayoutContext.markerRowPlacements`.

import type { AnchorDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type { PositionedAnchor, Point } from '../types.js';
import type { LayoutContext } from '../layout-context.js';
import { propValue, parseDate } from '../dsl-utils.js';
import {
    MARKER_DIAMOND_RADIUS_PX,
    MARKER_LABEL_GAP_PX,
    MARKER_LABEL_HEIGHT_PX,
} from './marker-geometry.js';

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
    place(ctx: LayoutContext, _milestoneXs: Set<number>): PositionedAnchor | null {
        const dateRaw = propValue(this.anchor.properties, 'date');
        const date = parseDate(dateRaw);
        if (!date) return null;
        const x = ctx.scale.forwardWithinDomain(date);
        if (x === null) return null;
        const style = resolveStyle('anchor', this.anchor.properties, ctx.styleCtx);
        const placement = ctx.markerRowPlacements.get(this.id);
        const y = placement?.centerY ?? ctx.timeline.markerRow.y;
        const center: Point = { x, y };
        const labelBox = placement?.labelBox ?? {
            x: x + MARKER_DIAMOND_RADIUS_PX + MARKER_LABEL_GAP_PX,
            y: y - 4,
            width: 0,
            height: MARKER_LABEL_HEIGHT_PX,
        };
        const labelSide = placement?.labelSide ?? 'right';
        ctx.entityLeftEdges.set(this.id, x);
        ctx.entityRightEdges.set(this.id, x);
        ctx.entityMidpoints.set(this.id, center);
        return {
            id: this.id,
            title: this.anchor.title ?? this.id,
            center,
            radius: MARKER_DIAMOND_RADIUS_PX,
            style,
            predecessorPoints: [],
            cutTopY: ctx.chartTopY,
            cutBottomY: ctx.swimlaneBottomY,
            bumpedUp: (placement?.rowIndex ?? 0) > 0,
            labelBox,
            labelSide,
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
