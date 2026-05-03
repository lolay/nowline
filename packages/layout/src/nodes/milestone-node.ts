// MilestoneNode — Renderable for a single milestone + a
// `buildMilestones` loop helper. Each milestone sits in the marker row
// and either pins to a fixed `date:` or floats to the rightmost `after:`
// predecessor. A non-binding (second-latest) predecessor drives the
// "slack" arrow when present. Date-pinned milestones whose predecessors
// would push past the date are flagged `isOverrun`.
//
// Marker-row placement (row + label box + left/right side) is decided
// once by `roadmap-node.ts::packMarkerRow`. Date-pinned entities are
// pre-packed before swimlanes run; after-only milestones get a
// PROVISIONAL row=0 placement here at build time which the unified
// re-pack in `RoadmapNode.place` overwrites with the final tick-order
// bottom-first slot once every centerX is known.

import type { MilestoneDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type { PositionedMilestone, Point, BoundingBox } from '../types.js';
import type { LayoutContext } from '../layout-context.js';
import { propValue, propValues, parseDate } from '../dsl-utils.js';

const MARKER_LABEL_GAP_PX = 6;
const MARKER_LABEL_HEIGHT_PX = 12;
const MARKER_BOLD_WIDTH_FACTOR = 1.05;

function decideLabelBoxForCanvas(
    centerX: number,
    centerY: number,
    radius: number,
    title: string,
    fontSize: number,
    bold: boolean,
    chartLeftX: number,
    chartRightX: number,
): { box: BoundingBox; side: 'left' | 'right' } {
    const labelWidth = title.length * fontSize * 0.58 * (bold ? MARKER_BOLD_WIDTH_FACTOR : 1);
    const naturalRightX = centerX + radius + MARKER_LABEL_GAP_PX;
    const naturalLeftX = centerX - radius - MARKER_LABEL_GAP_PX - labelWidth;
    const fitsRight = naturalRightX + labelWidth <= chartRightX;
    const fitsLeft = naturalLeftX >= chartLeftX;
    const side: 'left' | 'right' = fitsRight ? 'right' : (fitsLeft ? 'left' : 'right');
    const xLeft = side === 'right' ? naturalRightX : naturalLeftX;
    return {
        box: { x: xLeft, y: centerY - 4, width: labelWidth, height: MARKER_LABEL_HEIGHT_PX },
        side,
    };
}

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
        const radius = 6;
        const title = m.title ?? this.id;

        let centerX: number | null = null;
        let centerY: number = inRowY;
        let labelBox: BoundingBox | null = null;
        let labelSide: 'left' | 'right' = 'right';
        let fixed = false;
        let slackArrows: Array<{ x: number; y: number }> | undefined;
        let isOverrun = false;

        if (date) {
            const x = ctx.scale.forwardWithinDomain(date);
            if (x === null) return null;
            centerX = x;
            fixed = true;
            const placement = ctx.markerRowPlacements.get(this.id);
            if (placement) {
                centerY = placement.centerY;
                labelBox = placement.labelBox;
                labelSide = placement.labelSide;
            }
            // Date-pinned milestones with `after:` predecessors that
            // would overrun the date show a single slack arrow from
            // the latest predecessor's right edge.
            let maxEnd = 0;
            let maxY = 0;
            for (const ref of afterRaw) {
                const end = ctx.entityRightEdges.get(ref);
                if (end === undefined) continue;
                if (end > maxEnd) {
                    maxEnd = end;
                    maxY = ctx.entityMidpoints.get(ref)?.y ?? 0;
                }
            }
            if (maxEnd > x) {
                isOverrun = true;
                slackArrows = [{ x: maxEnd, y: maxY > 0 ? maxY : centerY }];
            }
        } else if (afterRaw.length > 0) {
            // Float to the rightmost (binding) predecessor; every
            // earlier-finishing predecessor produces its own slack arrow.
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
            centerX = maxEnd;
            fixed = false;
            // Provisional placement — RoadmapNode runs a unified
            // tick-order pack across all markers (date-pinned anchors,
            // date-pinned milestones, after-only milestones) once
            // everyone's centerX is known. That pass overwrites the
            // rowIndex / centerY / labelBox / labelSide we set here.
            const provisional = decideLabelBoxForCanvas(
                centerX, inRowY, radius, title, 10, true,
                ctx.timeline.box.x, ctx.chartRightX,
            );
            centerY = inRowY;
            labelBox = provisional.box;
            labelSide = provisional.side;
            ctx.markerRowPlacements.set(this.id, {
                rowIndex: 0,
                centerY,
                labelBox,
                labelSide,
            });
            const arrows: Array<{ x: number; y: number }> = [];
            for (let i = 1; i < preds.length; i++) {
                const p = preds[i];
                if (p.x < maxEnd && p.y > 0) arrows.push({ x: p.x, y: p.y });
            }
            if (arrows.length > 0) slackArrows = arrows;
        }
        if (centerX === null) return null;
        if (!labelBox) {
            const fallback = decideLabelBoxForCanvas(
                centerX, centerY, radius, title, 10, true,
                ctx.timeline.box.x, ctx.chartRightX,
            );
            labelBox = fallback.box;
            labelSide = fallback.side;
        }

        const center: Point = { x: centerX, y: centerY };
        ctx.entityLeftEdges.set(this.id, center.x);
        ctx.entityRightEdges.set(this.id, center.x);
        ctx.entityMidpoints.set(this.id, center);
        return {
            id: this.id,
            title,
            center,
            radius,
            fixed,
            slackArrows,
            isOverrun,
            style,
            cutTopY: ctx.chartTopY,
            cutBottomY: ctx.chartBottomY,
            labelBox,
            labelSide,
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
