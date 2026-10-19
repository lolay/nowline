// MilestoneNode — Renderable for a single milestone + a
// `buildMilestones` loop helper. Each milestone sits in the marker row
// and either pins to a fixed `date:` or floats to the rightmost `after:`
// predecessor. A non-binding (second-latest) predecessor drives the
// "slack" arrow when present. Date-pinned milestones whose predecessors
// would push past the date are flagged `isOverrun`.
//
// Placement decides x, slack arrows and overrun only (`MilestonePlacement`).
// The marker row and label box come from the final marker pack in
// finalize (`packMarkers`, f5, through `marker-band.ts::packMarkerRow`),
// which runs once every centerX is known and the canvas is final;
// `positionMilestones` then builds each `PositionedMilestone` from its
// placement and its row (`placeMarkers`, f6). An arrow that starts on a
// marker row (from an anchor or milestone predecessor) waits for those
// rows too: placement records the marker, `positionMilestones` reads its
// row.

import type { MilestoneDeclaration } from '@nowline/core';
import { formatIsoDate, parseIsoDate, propValue, propValues } from '../dsl-utils.js';
import { itemSlackAttachY } from '../item-port-geometry.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type {
    MarkerRowPlacement,
    Point,
    PositionedMilestone,
    ResolvedStyle,
    SlackCorridor,
} from '../types.js';
import { isOnWaveBoundary, WAVE_EDGE_TOLERANCE_PX } from '../wave-layout.js';
import { MARKER_DIAMOND_RADIUS_PX } from './marker-geometry.js';

/**
 * One predecessor of a milestone with everything placement and the
 * slack-arrow pipeline need: its end in time (`endX`, also where its slack
 * or overrun line starts, specs/true-width-layout.md §3.5), an item's
 * attach y in the chart's local frame (bar bottom strip when text spills,
 * nominal row midline otherwise), and its flow key (used to dedupe so a
 * chained-flow's siblings collapse to the last entry).
 */
export interface MilestonePredecessor {
    ref: string;
    /**
     * Where the predecessor ends in time: an item's duration end, a
     * marker's x, a wave's `E_k`. The milestone sits on the latest one and
     * overruns a date by it (specs/scheduler-unification.md §8 decision 6);
     * its slack or overrun line starts here.
     */
    endX: number;
    /**
     * An item's attach y. Undefined for every other reference: a marker
     * (its arrow starts on its marker row, known only after the final
     * pack), a wave, a group or a parallel.
     */
    y: number | undefined;
    /** Set when `ref` names an anchor or milestone of this file. */
    marker?: true;
    flowKey: string;
    /**
     * Set when `ref` names a wave: `endX` is the seeded wave end `E_k`.
     * Wave references draw no slack arrows (specs/waves.md §5.3).
     */
    wave?: string;
}

/**
 * Resolve each `after:` reference into a `MilestonePredecessor`. Its
 * `endX` is the reference's right edge in time (`entityRightEdges`, an
 * item's duration end, a marker's cut-line x), where its slack line
 * starts: a bar spans exactly its dates, so its end date is its edge
 * (specs/true-width-layout.md §3.5). Refs whose target is unknown drop
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
        const endX = ctx.entityRightEdges.get(ref);
        if (endX === undefined) continue;
        const y = item ? itemSlackAttachY(item, ctx.bandScale.bandwidth()) : undefined;
        // A wave reads its seeded end `E_k` (logical, not inset), so a
        // milestone bound by it sits exactly on the boundary.
        if (!item && ctx.waves?.plan.index.has(ref)) {
            out.push({ ref, endX, y, flowKey: `wave:${ref}`, wave: ref });
            continue;
        }
        // Markers don't share a flow with anything, so use their id
        // as a unique flow key — every marker stands on its own.
        const flowKey = ctx.itemFlowKey.get(ref) ?? `marker:${ref}`;
        if (!item && ctx.markerIds.has(ref)) {
            out.push({ ref, endX, y, marker: true, flowKey });
            continue;
        }
        out.push({ ref, endX, y, flowKey });
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
        if (!existing || p.endX > existing.endX) m.set(p.flowKey, p);
    }
    return Array.from(m.values());
}

/**
 * Where a milestone's slack or overrun arrow starts: at `x` on a chart y
 * (an item predecessor's attach y, in the chart's local frame), or at `x`
 * on the row of `marker` in the marker band, which `positionMilestones`
 * reads from the final pack.
 */
export type MilestoneArrowStart = { x: number; y: number } | { x: number; marker: string };

/**
 * Whether a marker predecessor sits on top of the milestone at `x`: their
 * diamonds touch or overlap. It draws no arrow then, since the arrow would
 * run between two diamonds that already meet.
 */
function isOnTopOf(p: MilestonePredecessor, x: number): boolean {
    return Math.abs(x - p.endX) <= 2 * MARKER_DIAMOND_RADIUS_PX;
}

/**
 * The slack arrow a non-binding predecessor of an after-only milestone at
 * `maxEnd` draws, or null: it must end before the milestone and be an
 * item or a marker clear of the milestone's diamond. A wave, a group and
 * a parallel draw none.
 */
function slackArrowStart(p: MilestonePredecessor, maxEnd: number): MilestoneArrowStart | null {
    if (p.endX >= maxEnd || p.wave !== undefined) return null;
    if (p.y !== undefined) return { x: p.endX, y: p.y };
    if (p.marker && !isOnTopOf(p, maxEnd)) return { x: p.endX, marker: p.ref };
    return null;
}

/**
 * The predecessor a dated milestone's overrun arrow starts from: the one
 * that ends latest in time and is not a wave (wave references draw no
 * slack arrows). `collectSlackCorridors` uses the same choice.
 */
export function latestArrowPredecessor(preds: MilestonePredecessor[]): MilestonePredecessor | null {
    let maxPred: MilestonePredecessor | null = null;
    for (const p of preds) {
        if (p.wave !== undefined) continue;
        if (!maxPred || p.endX > maxPred.endX) maxPred = p;
    }
    return maxPred;
}

/**
 * The overrun arrow of a dated milestone `id` at `x` from `maxPred`, its
 * latest predecessor, which ends past `x`: from an item's attach y, from a
 * marker's row (none when the two diamonds meet), and from the
 * milestone's own row for a group or parallel, which has no y of its own.
 */
function overrunArrowStart(
    maxPred: MilestonePredecessor,
    x: number,
    id: string,
): MilestoneArrowStart | null {
    if (maxPred.y !== undefined) return { x: maxPred.endX, y: maxPred.y };
    if (!maxPred.marker) return { x: maxPred.endX, marker: id };
    return isOnTopOf(maxPred, x) ? null : { x: maxPred.endX, marker: maxPred.ref };
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
        if (p.wave === undefined || p.endX - x < WAVE_EDGE_TOLERANCE_PX) continue;
        if (!latest || p.endX > latest.endX) latest = p;
    }
    return latest?.wave;
}

/**
 * A milestone as placement leaves it: its x, slack arrows, overrun and cut
 * lines, but no marker row or label box. Those come from the unified
 * marker re-pack, which needs every milestone's x and the final canvas;
 * `positionMilestones` combines the two.
 */
export interface MilestonePlacement {
    id: string;
    title: string;
    x: number;
    radius: number;
    /** True for a `date:` milestone, false for an after-only one. */
    fixed: boolean;
    slackArrows: MilestoneArrowStart[] | undefined;
    isOverrun: boolean;
    style: ResolvedStyle;
    cutTopY: number;
    cutBottomY: number;
    onWaveBoundary?: true;
    overrunByWave?: string;
    overrunDate?: string;
    hiddenDate?: string;
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
     *
     * Writes the milestone's entity edges and midpoint; later milestones'
     * `after:` references read the edges. The midpoint's y is an
     * estimate: the pre-pack row of a dated milestone, the band's first
     * row for an after-only one. Nothing reads it before f6 replaces it
     * with the final pack's row, except f6's coverage trace, which
     * reports a milestone whose row differs from it.
     */
    place(ctx: LayoutContext): MilestonePlacement | null {
        const m = this.milestone;
        const style = resolveStyle('milestone', m.properties, ctx.styleCtx);
        const dateRaw = propValue(m.properties, 'date');
        const afterRaw = propValues(m.properties, 'after');
        const date = parseIsoDate(dateRaw);
        const inRowY = ctx.timeline.markerRow.y;
        const radius = MARKER_DIAMOND_RADIUS_PX;
        const title = m.title ?? this.id;

        let centerX: number | null = null;
        let estimatedCenterY: number = inRowY;
        let fixed = false;
        let slackArrows: MilestoneArrowStart[] | undefined;
        let isOverrun = false;
        let overrunByWave: string | undefined;

        if (date) {
            const x = ctx.scale.forwardWithinDomain(date);
            if (x === null) return null;
            centerX = x;
            fixed = true;
            const prePacked = ctx.markerRowPlacements.get(this.id);
            if (prePacked) estimatedCenterY = prePacked.centerY;
            // Date-pinned milestones whose `after:` predecessors finish
            // past the pinned date are flagged `isOverrun`; the latest
            // last-of-flow predecessor draws a single overrun arrow
            // pointing back from its visual right edge to the
            // milestone's column. Flow-dedupe avoids stacking redundant
            // arrows from sibling items in one chained flow.
            const preds = collectMilestonePredecessors(afterRaw, ctx);
            const dedupedPreds = lastPredecessorPerFlow(preds);
            const maxPred = latestArrowPredecessor(dedupedPreds);
            if (maxPred && maxPred.endX > x) {
                isOverrun = true;
                const arrow = overrunArrowStart(maxPred, x, this.id);
                if (arrow) slackArrows = [arrow];
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
            dedupedPreds.sort((a, b) => b.endX - a.endX);
            const maxEnd = dedupedPreds[0]?.endX ?? ctx.timeline.originX;
            centerX = maxEnd;
            fixed = false;
            const arrows: MilestoneArrowStart[] = [];
            for (let i = 1; i < dedupedPreds.length; i++) {
                const arrow = slackArrowStart(dedupedPreds[i], maxEnd);
                if (arrow) arrows.push(arrow);
            }
            if (arrows.length > 0) slackArrows = arrows;
        }
        if (centerX === null) return null;

        const midpoint: Point = { x: centerX, y: estimatedCenterY };
        ctx.entityLeftEdges.set(this.id, midpoint.x);
        ctx.entityRightEdges.set(this.id, midpoint.x);
        ctx.entityMidpoints.set(this.id, midpoint);
        const placement: MilestonePlacement = {
            id: this.id,
            title,
            x: centerX,
            radius,
            fixed,
            slackArrows,
            isOverrun,
            style,
            cutTopY: ctx.chartTopY,
            cutBottomY: ctx.swimlaneBottomY,
        };
        // On a wave boundary the boundary line carries the vertical. An
        // overrun milestone keeps its red cut line, so it never counts as
        // on a boundary.
        if (ctx.waves && !isOverrun && isOnWaveBoundary(ctx.waves, centerX)) {
            placement.onWaveBoundary = true;
        }
        if (overrunByWave !== undefined && date) {
            placement.overrunByWave = overrunByWave;
            placement.overrunDate = formatIsoDate(date);
        }
        // A date the axis hides keeps its own day as a tooltip
        // (specs/working-calendar.md §7.4). Under `show` the day is drawn,
        // and the milestone sits on it.
        if (date && !ctx.scale.showsNonWorking && !ctx.calendar.isWorkingDay(date)) {
            placement.hiddenDate = formatIsoDate(date);
        }
        return placement;
    }
}

export function buildMilestones(
    milestones: Map<string, MilestoneDeclaration>,
    ctx: LayoutContext,
): MilestonePlacement[] {
    const out: MilestonePlacement[] = [];
    for (const [id, m] of milestones) {
        const placement = new MilestoneNode(id, m).place(ctx);
        if (placement) out.push(placement);
    }
    return out;
}

/**
 * Build the positioned milestones from their placements and the unified
 * marker re-pack (`rows`, keyed by id), in placement order. The re-pack
 * packs every placed milestone and anchor, so a missing row is an
 * invariant violation and throws. An arrow that starts on a marker row
 * takes that row's centre, already final; one from an item keeps its
 * chart y. Optional keys stay omitted when the placement omits them.
 */
export function positionMilestones(
    placements: readonly MilestonePlacement[],
    rows: ReadonlyMap<string, MarkerRowPlacement>,
): PositionedMilestone[] {
    const rowOf = (id: string): MarkerRowPlacement => {
        const row = rows.get(id);
        if (!row) {
            throw new Error(`layout: marker "${id}" has no marker-row placement`);
        }
        return row;
    };
    return placements.map((p) => {
        const row = rowOf(p.id);
        const positioned: PositionedMilestone = {
            id: p.id,
            title: p.title,
            center: { x: p.x, y: row.centerY },
            radius: p.radius,
            fixed: p.fixed,
            slackArrows: p.slackArrows?.map((a) =>
                'y' in a ? { x: a.x, y: a.y } : { x: a.x, y: rowOf(a.marker).centerY },
            ),
            isOverrun: p.isOverrun,
            style: p.style,
            cutTopY: p.cutTopY,
            cutBottomY: p.cutBottomY,
            labelBox: row.labelBox,
            labelSide: row.labelSide,
        };
        if (p.onWaveBoundary) positioned.onWaveBoundary = true;
        if (p.overrunByWave !== undefined) positioned.overrunByWave = p.overrunByWave;
        if (p.overrunDate !== undefined) positioned.overrunDate = p.overrunDate;
        if (p.hiddenDate !== undefined) positioned.hiddenDate = p.hiddenDate;
        return positioned;
    });
}

/**
 * Collect slack-arrow corridors from the resolved milestones using the
 * current entity-edge maps. The result mirrors what
 * `MilestoneNode.place` would emit on `slackArrows`, so the row-packer
 * and the renderer agree on every arrow's geometry.
 *
 * Each non-binding item predecessor (`x < maxEnd`) becomes one
 * corridor; date-pinned milestones whose latest predecessor is an item
 * that overruns the date contribute a single back-pointing corridor
 * between the pinned column and the predecessor's right edge. An arrow
 * from a marker runs in the marker band, above the lanes, so it owns no
 * corridor; nor does a wave predecessor, which draws no slack arrow (a
 * floating milestone bound by a wave still sets `maxEnd`).
 */
export function collectSlackCorridors(
    milestones: Map<string, import('@nowline/core').MilestoneDeclaration>,
    ctx: LayoutContext,
): SlackCorridor[] {
    const out: SlackCorridor[] = [];
    for (const [id, m] of milestones) {
        const dateRaw = propValue(m.properties, 'date');
        const afterRaw = propValues(m.properties, 'after');
        const date = parseIsoDate(dateRaw);
        // Reuse MilestoneNode's helpers so the corridor set agrees
        // exactly with the rendered slack-arrow set: same source x
        // (visual edge for items / cut-line for markers), same
        // attach y, and the same flow-dedupe rule that collapses
        // chained predecessors to one arrow per flow.
        const preds = collectMilestonePredecessors(afterRaw, ctx);
        const dedupedPreds = lastPredecessorPerFlow(preds);

        if (date) {
            const milestoneX = ctx.scale.forwardWithinDomain(date);
            if (milestoneX === null) continue;
            // Wave references draw no arrow, and a marker's arrow runs in
            // the marker band, so neither owns a corridor.
            const maxPred = latestArrowPredecessor(dedupedPreds);
            if (maxPred && maxPred.endX > milestoneX && maxPred.y !== undefined) {
                out.push({
                    xStart: Math.min(maxPred.endX, milestoneX),
                    xEnd: Math.max(maxPred.endX, milestoneX),
                    y: maxPred.y,
                    slackPredId: maxPred.ref,
                    milestoneId: id,
                });
            }
            continue;
        }
        if (dedupedPreds.length === 0) continue;
        dedupedPreds.sort((a, b) => b.endX - a.endX);
        const maxEnd = dedupedPreds[0].endX;
        for (let i = 1; i < dedupedPreds.length; i++) {
            const p = dedupedPreds[i];
            const arrow = slackArrowStart(p, maxEnd);
            if (arrow && 'y' in arrow) {
                out.push({
                    xStart: p.endX,
                    xEnd: maxEnd,
                    y: arrow.y,
                    slackPredId: p.ref,
                    milestoneId: id,
                });
            }
        }
    }
    return out;
}
