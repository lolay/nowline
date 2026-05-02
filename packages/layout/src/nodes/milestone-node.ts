// MilestoneNode — Renderable for a single milestone + a
// `buildMilestones` loop helper. Each milestone sits in the marker row
// and either pins to a fixed `date:` or floats to the rightmost `after:`
// predecessor. A non-binding (second-latest) predecessor drives the
// "slack" arrow when present. Date-pinned milestones whose predecessors
// would push past the date are flagged `isOverrun`.

import type { MilestoneDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type { PositionedMilestone, Point } from '../types.js';
import type { LayoutContext } from '../layout-context.js';
import { propValue, propValues, parseDate } from '../dsl-utils.js';

export class MilestoneNode {
    constructor(
        public readonly id: string,
        public readonly milestone: MilestoneDeclaration,
    ) {}

    /**
     * Returns null when the milestone is neither date-pinned nor has a
     * resolvable `after:` predecessor (skipped silently — matches the
     * legacy `buildMilestones` continue-paths).
     */
    place(ctx: LayoutContext): PositionedMilestone | null {
        const m = this.milestone;
        const style = resolveStyle('milestone', m.properties, ctx.styleCtx);
        const dateRaw = propValue(m.properties, 'date');
        const afterRaw = propValues(m.properties, 'after');
        const date = parseDate(dateRaw);
        const inRowY = ctx.timeline.markerRow.y;

        let center: Point | null = null;
        let fixed = false;
        let slackX: number | undefined;
        let slackY: number | undefined;
        let isOverrun = false;

        if (date) {
            const x = ctx.scale.forwardWithinDomain(date);
            if (x !== null) {
                center = { x, y: inRowY };
                fixed = true;
                let maxEnd = 0;
                for (const ref of afterRaw) {
                    const end = ctx.entityRightEdges.get(ref);
                    if (end !== undefined) maxEnd = Math.max(maxEnd, end);
                }
                if (maxEnd > x) {
                    isOverrun = true;
                    slackX = maxEnd;
                }
            }
        } else if (afterRaw.length > 0) {
            // Track the binding (rightmost) and the next-latest non-binding
            // predecessor — the latter drives the slack arrow.
            type Pred = { ref: string; x: number; y: number };
            const preds: Pred[] = [];
            for (const ref of afterRaw) {
                const end = ctx.entityRightEdges.get(ref);
                if (end === undefined) continue;
                const mid = ctx.entityMidpoints.get(ref);
                preds.push({ ref, x: end, y: mid?.y ?? 0 });
            }
            preds.sort((a, b) => b.x - a.x);
            const maxEnd = preds[0]?.x ?? ctx.timeline.originX;
            center = { x: maxEnd, y: inRowY };
            fixed = false;
            const second = preds[1];
            if (second && second.x < maxEnd && second.y > 0) {
                slackX = second.x;
                slackY = second.y;
            }
        }
        if (!center) return null;

        ctx.entityLeftEdges.set(this.id, center.x);
        ctx.entityRightEdges.set(this.id, center.x);
        ctx.entityMidpoints.set(this.id, center);
        return {
            id: this.id,
            title: m.title ?? this.id,
            center,
            radius: 6,
            fixed,
            slackX,
            slackY,
            isOverrun,
            style,
            cutTopY: ctx.chartTopY,
            cutBottomY: ctx.chartBottomY,
        };
    }
}

export function buildMilestones(
    milestones: Map<string, MilestoneDeclaration>,
    ctx: LayoutContext,
): PositionedMilestone[] {
    const out: PositionedMilestone[] = [];
    for (const [id, m] of milestones) {
        const positioned = new MilestoneNode(id, m).place(ctx);
        if (positioned) out.push(positioned);
    }
    return out;
}
