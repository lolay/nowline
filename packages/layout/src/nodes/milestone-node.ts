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
import { formatIsoDate, parseDate, propValue, propValues } from '../dsl-utils.js';
import { itemSlackAttachY } from '../item-port-geometry.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type { BoundingBox, Point, PositionedMilestone } from '../types.js';
import { isOnWaveBoundary, WAVE_EDGE_TOLERANCE_PX } from '../wave-layout.js';
import {
    MARKER_BOLD_WIDTH_FACTOR,
    MARKER_DIAMOND_RADIUS_PX,
    MARKER_LABEL_GAP_PX,
    MARKER_LABEL_HEIGHT_PX,
} from './marker-geometry.js';

/**
 * One predecessor of a milestone with everything the slack-arrow
 * pipeline needs: its source x (visual right edge for items, marker
 * centerX for anchors / other milestones), its attach y (bar bottom
 * strip when text spills, nominal row midline otherwise), and its flow
 * key (used to dedupe so a chained-flow's siblings collapse to the last
 * entry).
 */
export interface MilestonePredecessor {
    ref: string;
    x: number;
    y: number;
    flowKey: string;
    /**
     * Set when `ref` names a wave: `x` is the seeded wave end `E_k`.
     * Wave references draw no slack arrows (specs/waves.md §5.3).
     */
    wave?: string;
}

/**
 * Resolve each `after:` reference into a `MilestonePredecessor`.
 * Items use their VISUAL right edge as the slack source so the
 * arrow leaves the painted bar instead of landing in the inter-
 * column gutter; markers (anchors / other milestones) fall back
 * to their cut-line centerX. Refs whose target is unknown drop
 * silently — matches the legacy continue path.
 */
export function collectMilestonePredecessors(
    refs: string[],
    ctx: LayoutContext,
): MilestonePredecessor[] {
    const out: MilestonePredecessor[] = [];
    for (const ref of refs) {
        // Items attach off their FINAL box (see `item-port-geometry.ts`),
        // so a bar that a row growth moved down still sources its arrow.
        const item = ctx.placedItems.get(ref);
        const x = item ? item.box.x + item.box.width : ctx.entityRightEdges.get(ref);
        if (x === undefined) continue;
        const y = item
            ? itemSlackAttachY(item, ctx.bandScale.bandwidth())
            : (ctx.entityMidpoints.get(ref)?.y ?? 0);
        // A wave reads its seeded end `E_k` (logical, not inset), so a
        // milestone bound by it sits exactly on the boundary.
        if (!item && ctx.waves?.plan.index.has(ref)) {
            out.push({ ref, x, y, flowKey: `wave:${ref}`, wave: ref });
            continue;
        }
        // Markers don't share a flow with anything, so use their id
        // as a unique flow key — every marker stands on its own.
        const flowKey = ctx.itemFlowKey.get(ref) ?? `marker:${ref}`;
        out.push({ ref, x, y, flowKey });
    }
    return out;
}

/**
 * Keep only the rightmost predecessor per flow key. Two
 * predecessors share a flow when they sit in the same deepest
 * single-track container (swimlane root, sequential group, or one
 * sub-track of a parallel) — file order already encodes their
 * ordering, so only the latest entry contributes a slack arrow.
 * Predecessors in different flows (e.g. two parallel sub-tracks)
 * each survive as their flow's last entry.
 */
export function lastPredecessorPerFlow(preds: MilestonePredecessor[]): MilestonePredecessor[] {
    const m = new Map<string, MilestonePredecessor>();
    for (const p of preds) {
        const existing = m.get(p.flowKey);
        if (!existing || p.x > existing.x) m.set(p.flowKey, p);
    }
    return Array.from(m.values());
}

/**
 * The predecessor a dated milestone's overrun arrow starts from: the
 * rightmost one that is not a wave (wave references draw no slack
 * arrows). `collectSlackCorridors` uses the same choice.
 */
export function latestArrowPredecessor(preds: MilestonePredecessor[]): MilestonePredecessor | null {
    let maxPred: MilestonePredecessor | null = null;
    for (const p of preds) {
        if (p.wave !== undefined) continue;
        if (!maxPred || p.x > maxPred.x) maxPred = p;
    }
    return maxPred;
}

/**
 * The wave that overruns a dated milestone at `x`: the latest-ending
 * wave predecessor whose end lies past `x` (by more than the boundary
 * tolerance, so a wave ending on the date does not count). Ties keep the
 * first listed.
 */
function overrunningWave(preds: MilestonePredecessor[], x: number): string | undefined {
    let latest: MilestonePredecessor | undefined;
    for (const p of preds) {
        if (p.wave === undefined || p.x - x < WAVE_EDGE_TOLERANCE_PX) continue;
        if (!latest || p.x > latest.x) latest = p;
    }
    return latest?.wave;
}

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
    const side: 'left' | 'right' = fitsRight ? 'right' : fitsLeft ? 'left' : 'right';
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
        const radius = MARKER_DIAMOND_RADIUS_PX;
        const title = m.title ?? this.id;

        let centerX: number | null = null;
        let centerY: number = inRowY;
        let labelBox: BoundingBox | null = null;
        let labelSide: 'left' | 'right' = 'right';
        let fixed = false;
        let slackArrows: Array<{ x: number; y: number }> | undefined;
        let isOverrun = false;
        let overrunByWave: string | undefined;

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
            // Date-pinned milestones whose `after:` predecessors finish
            // past the pinned date are flagged `isOverrun`; the latest
            // last-of-flow predecessor draws a single overrun arrow
            // pointing back from its visual right edge to the
            // milestone's column. Flow-dedupe avoids stacking redundant
            // arrows from sibling items in one chained flow.
            const preds = collectMilestonePredecessors(afterRaw, ctx);
            const dedupedPreds = lastPredecessorPerFlow(preds);
            const maxPred = latestArrowPredecessor(dedupedPreds);
            if (maxPred && maxPred.x > x) {
                isOverrun = true;
                slackArrows = [
                    {
                        x: maxPred.x,
                        y: maxPred.y > 0 ? maxPred.y : centerY,
                    },
                ];
            }
            // The wave-deadline idiom (specs/waves.md §5.3, Example 11): a
            // wave listed in `after:` that ends past the date overruns the
            // milestone. It gets the red cut line, but no arrow.
            overrunByWave = overrunningWave(dedupedPreds, x);
            if (overrunByWave !== undefined) isOverrun = true;
        } else if (afterRaw.length > 0) {
            // Float to the rightmost (binding) predecessor; every
            // last-of-flow predecessor that finishes EARLIER than the
            // binding contributes one slack arrow. Predecessors in the
            // same single-track flow (sequential group, swimlane root,
            // one parallel sub-track) collapse to just their last
            // entry — file order encodes the dependency chain, so only
            // the rightmost matters. Predecessors in different flows
            // (e.g. two parallel sub-tracks) each contribute their own
            // last-of-flow arrow.
            const preds = collectMilestonePredecessors(afterRaw, ctx);
            const dedupedPreds = lastPredecessorPerFlow(preds);
            dedupedPreds.sort((a, b) => b.x - a.x);
            const maxEnd = dedupedPreds[0]?.x ?? ctx.timeline.originX;
            centerX = maxEnd;
            fixed = false;
            // Provisional placement — RoadmapNode runs a unified
            // tick-order pack across all markers (date-pinned anchors,
            // date-pinned milestones, after-only milestones) once
            // everyone's centerX is known. That pass overwrites the
            // rowIndex / centerY / labelBox / labelSide we set here.
            const provisional = decideLabelBoxForCanvas(
                centerX,
                inRowY,
                radius,
                title,
                10,
                true,
                ctx.timeline.box.x,
                ctx.chartRightX,
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
            for (let i = 1; i < dedupedPreds.length; i++) {
                const p = dedupedPreds[i];
                if (p.x < maxEnd && p.y > 0 && p.wave === undefined) {
                    arrows.push({ x: p.x, y: p.y });
                }
            }
            if (arrows.length > 0) slackArrows = arrows;
        }
        if (centerX === null) return null;
        if (!labelBox) {
            const fallback = decideLabelBoxForCanvas(
                centerX,
                centerY,
                radius,
                title,
                10,
                true,
                ctx.timeline.box.x,
                ctx.chartRightX,
            );
            labelBox = fallback.box;
            labelSide = fallback.side;
        }

        const center: Point = { x: centerX, y: centerY };
        ctx.entityLeftEdges.set(this.id, center.x);
        ctx.entityRightEdges.set(this.id, center.x);
        ctx.entityMidpoints.set(this.id, center);
        const positioned: PositionedMilestone = {
            id: this.id,
            title,
            center,
            radius,
            fixed,
            slackArrows,
            isOverrun,
            style,
            cutTopY: ctx.chartTopY,
            cutBottomY: ctx.swimlaneBottomY,
            labelBox,
            labelSide,
        };
        // On a wave boundary the boundary line carries the vertical. An
        // overrun milestone keeps its red cut line, so it never counts as
        // on a boundary.
        if (ctx.waves && !isOverrun && isOnWaveBoundary(ctx.waves, center.x)) {
            positioned.onWaveBoundary = true;
        }
        if (overrunByWave !== undefined && date) {
            positioned.overrunByWave = overrunByWave;
            positioned.overrunDate = formatIsoDate(date);
        }
        // A date the axis hides keeps its own day as a tooltip
        // (specs/working-calendar.md §7.4).
        if (date && !ctx.calendar.isWorkingDay(date)) positioned.hiddenDate = formatIsoDate(date);
        return positioned;
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
