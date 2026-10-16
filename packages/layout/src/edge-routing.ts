// Date-port dependency router (specs/true-width-layout.md §3.4).
//
// An arrow runs on the dates. It leaves the middle of its source's last
// day through the source's bottom edge (top edge when the target is
// above), drops into a gap between rows, runs horizontally in that gap to
// the middle of the target's first day, and turns into the target's top
// edge (bottom edge when the source is below), arrowhead first. Day
// centres, never date lines: in a chain the successor starts exactly on
// its predecessor's end date, so a leg on the date line would run down the
// successor's edge.
//
// Legs pass behind bars and cross them at right angles. The horizontal leg
// sits in a gap no bar, spilled caption or container header reaches into
// (between the source and the target, over the leg's x-range); among the
// gaps, the router takes the one whose vertical legs keep clear of every
// bar edge, then the one whose vertical legs cross the fewest bars, then
// the one nearest the source. Arrows sharing a gap take offset lanes
// `CHANNEL_LANE_PX` apart; arrows landing in the same day column share one
// lane, so they merge into one trunk over their target (§8 O1).
//
// Two shapes need no gap: a target on its source's row (a dotted leg at
// the row's midline, or no arrow when it starts where the source ends),
// and a marker source (`dependency-edges.ts`). Everything here is pure
// geometry on numbers the caller reads off the final model.

import type { BoundingBox, Point } from './types.js';

/** Spacing between the lanes of one gap (§3.4 "Channels"). */
export const CHANNEL_LANE_PX = 2.5;

/** A vertical leg keeps more than this from a bar's left or right edge over its height (§6). */
export const EDGE_CLEARANCE_PX = 1;

/** Full arrowhead width (and the length along the leg is `ARROW_HEAD_LENGTH_PX`). */
export const ARROW_HEAD_WIDTH_PX = 7;

/** Length of a full arrowhead along its leg. */
export const ARROW_HEAD_LENGTH_PX = 5;

/** The narrowest arrowhead; a target narrower than this gets a dot of this diameter (§8 O6). */
export const ARROW_HEAD_MIN_PX = 3;

/** Two x's (or y's) closer than this are the same date line. */
const SAME_PX = 0.01;

/** A gap must be at least this tall to carry a leg. */
const MIN_GAP_PX = 2;

/** Clearance kept between a horizontal leg and anything it must not touch. */
const BLOCK_MARGIN_PX = 1;

/** One end of a dependency arrow: an item bar or a group / parallel. */
export interface ArrowEnd {
    /** The entity's dates in x (an item's bar is drawn inside them, a seam in from each). */
    startX: number;
    endX: number;
    /** Painted left edge and width (the bar, or the container's box). */
    paintedX: number;
    paintedWidth: number;
    /** Painted top and bottom (a container's box runs from its header to its body's bottom). */
    top: number;
    bottom: number;
    /** An item's row midline (`box.y + bandwidth / 2`); undefined for a container. */
    rowY?: number;
    /**
     * Where a horizontal leg leaves this item on its own row: the row
     * midline, or the progress strip's centre when its caption spills, so
     * the leg runs under the caption. Undefined for a container.
     */
    exitY?: number;
}

export interface DependencyRouteRequest {
    fromId: string;
    toId: string;
    source: ArrowEnd;
    target: ArrowEnd;
}

/** A vertical stroke a vertical leg must keep clear of. */
export interface VerticalEdge {
    x: number;
    top: number;
    bottom: number;
}

export interface RouteObstacles {
    /**
     * What a horizontal leg must stay out of: every bar with its spilled
     * caption and decorations, every container header band, and every lane
     * or region edge (zero-height boxes).
     */
    blocks: BoundingBox[];
    /** The left and right edges of every bar and drawn container, over its height. */
    edges: VerticalEdge[];
}

export interface RoutedDependency {
    fromId: string;
    toId: string;
    /** First = source port, last = target port (the arrowhead's tip). */
    waypoints: Point[];
    /** The target waits: its horizontal leg is dotted, its length the slack. */
    slack: boolean;
    headWidth: number;
    head: 'arrow' | 'dot';
}

/** Where an arrow leaves `end`: the middle of its last day, or its middle when shorter than a day. */
export function sourcePortX(end: ArrowEnd, pixelsPerDay: number): number {
    return end.endX - Math.min(pixelsPerDay / 2, (end.endX - end.startX) / 2);
}

/** Where an arrow lands on `end`: the middle of its first day, or its middle when shorter than a day. */
export function targetPortX(end: ArrowEnd, pixelsPerDay: number): number {
    return end.startX + Math.min(pixelsPerDay / 2, (end.endX - end.startX) / 2);
}

/** Arrowhead for a leg landing across a target `width` wide (§8 O6). */
export function arrowHead(width: number): { headWidth: number; head: 'arrow' | 'dot' } {
    if (width < ARROW_HEAD_MIN_PX) return { headWidth: ARROW_HEAD_MIN_PX, head: 'dot' };
    return { headWidth: Math.min(ARROW_HEAD_WIDTH_PX, width), head: 'arrow' };
}

const within = (y: number, lo: number, hi: number): boolean =>
    y >= lo - SAME_PX && y <= hi + SAME_PX;

/**
 * True when the target sits on its source's row: each one's row midline
 * crosses the other (a container source, which has no row, only needs the
 * target's midline to cross it).
 */
function onSameRow(s: ArrowEnd, t: ArrowEnd): boolean {
    if (t.rowY === undefined || !within(t.rowY, s.top, s.bottom)) return false;
    return s.rowY === undefined || within(s.rowY, t.top, t.bottom);
}

/** The free stretches of `(lo, hi)` no block over `[xLo, xHi]` reaches into. */
function freeGaps(
    blocks: BoundingBox[],
    xLo: number,
    xHi: number,
    lo: number,
    hi: number,
): Array<[number, number]> {
    const covered: Array<[number, number]> = [];
    for (const b of blocks) {
        if (b.x >= xHi + BLOCK_MARGIN_PX || b.x + b.width <= xLo - BLOCK_MARGIN_PX) continue;
        const top = b.y - BLOCK_MARGIN_PX;
        const bottom = b.y + b.height + BLOCK_MARGIN_PX;
        if (bottom <= lo || top >= hi) continue;
        covered.push([Math.max(lo, top), Math.min(hi, bottom)]);
    }
    covered.sort((a, b) => a[0] - b[0]);
    const gaps: Array<[number, number]> = [];
    let y = lo;
    for (const [top, bottom] of covered) {
        if (top - y >= MIN_GAP_PX) gaps.push([y, top]);
        y = Math.max(y, bottom);
    }
    if (hi - y >= MIN_GAP_PX) gaps.push([y, hi]);
    return gaps;
}

/** Bar or container edges a vertical leg at `x` over `(y0, y1)` runs within the clearance of. */
function grazes(edges: VerticalEdge[], x: number, y0: number, y1: number): number {
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    let n = 0;
    for (const e of edges) {
        if (Math.abs(e.x - x) > EDGE_CLEARANCE_PX) continue;
        if (e.bottom <= lo || e.top >= hi) continue;
        n++;
    }
    return n;
}

/** Blocks a vertical leg at `x` over `(y0, y1)` passes behind. */
function crossings(blocks: BoundingBox[], x: number, y0: number, y1: number): number {
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    let n = 0;
    for (const b of blocks) {
        if (b.height <= 0 || x <= b.x || x >= b.x + b.width) continue;
        if (b.y + b.height <= lo || b.y >= hi) continue;
        n++;
    }
    return n;
}

/** An arrow that needs a gap, before its lane is chosen. */
interface Pending {
    index: number;
    req: DependencyRouteRequest;
    from: Point;
    to: Point;
    /** +1 when the leg runs down from the source, -1 when up. */
    dir: 1 | -1;
    gap: [number, number];
    centre: number;
    xLo: number;
    xHi: number;
    /** Arrows landing in one day column share a lane (O1). */
    bundle: string;
}

/**
 * Pick the gap for an arrow from `from` (on the source's edge) to `to` (on
 * the target's edge): clear of every bar edge first, then fewest bars
 * crossed, then nearest the source. With no free gap at all, the leg runs
 * just past the source and passes behind whatever is there.
 */
function pickGap(
    from: Point,
    to: Point,
    dir: 1 | -1,
    obstacles: RouteObstacles,
): { gap: [number, number]; centre: number } {
    const xLo = Math.min(from.x, to.x);
    const xHi = Math.max(from.x, to.x);
    const lo = Math.min(from.y, to.y);
    const hi = Math.max(from.y, to.y);
    let best: { gap: [number, number]; centre: number; key: number[] } | null = null;
    for (const gap of freeGaps(obstacles.blocks, xLo, xHi, lo, hi)) {
        const centre = (gap[0] + gap[1]) / 2;
        const key = [
            grazes(obstacles.edges, from.x, from.y, centre) +
                grazes(obstacles.edges, to.x, centre, to.y),
            crossings(obstacles.blocks, from.x, from.y, centre) +
                crossings(obstacles.blocks, to.x, centre, to.y),
            Math.abs(centre - from.y),
        ];
        if (!best || lessThan(key, best.key)) best = { gap, centre, key };
    }
    if (best) return { gap: best.gap, centre: best.centre };
    const reach = Math.min(4, (hi - lo) / 2);
    const centre = from.y + dir * reach;
    return { gap: [lo, hi], centre };
}

function lessThan(a: number[], b: number[]): boolean {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
}

/** Lane offsets to try, the first one toward the source (so the arrowhead keeps its leg). */
function laneOffsets(dir: 1 | -1, halfHeight: number): number[] {
    const out = [0];
    for (let k = 1; k * CHANNEL_LANE_PX <= halfHeight + SAME_PX; k++) {
        out.push(-dir * k * CHANNEL_LANE_PX, dir * k * CHANNEL_LANE_PX);
    }
    return out;
}

/**
 * Give each gap-routed arrow its lane: an arrow whose day column already
 * has a lane in this gap joins it; otherwise the first offset no other
 * horizontal leg over the same x's sits on, or, when the gap is full, the
 * least crowded one.
 */
function assignLanes(pending: Pending[]): Map<number, number> {
    const placed: Array<{ y: number; xLo: number; xHi: number; bundle: string }> = [];
    const out = new Map<number, number>();
    const order = [...pending].sort(
        (a, b) => a.centre - b.centre || a.xLo - b.xLo || a.index - b.index,
    );
    for (const p of order) {
        const [lo, hi] = p.gap;
        const mate = placed.find(
            (q) => q.bundle === p.bundle && q.y >= lo - SAME_PX && q.y <= hi + SAME_PX,
        );
        let y = p.centre;
        if (mate) {
            y = mate.y;
        } else {
            // The gap already keeps `BLOCK_MARGIN_PX` from its neighbours.
            const offsets = laneOffsets(p.dir, (hi - lo) / 2);
            let bestConflicts = Number.POSITIVE_INFINITY;
            for (const off of offsets) {
                const cy = p.centre + off;
                const conflicts = placed.filter(
                    (q) =>
                        q.bundle !== p.bundle &&
                        Math.abs(q.y - cy) < CHANNEL_LANE_PX - SAME_PX &&
                        q.xLo < p.xHi + BLOCK_MARGIN_PX &&
                        q.xHi > p.xLo - BLOCK_MARGIN_PX,
                ).length;
                if (conflicts < bestConflicts) {
                    bestConflicts = conflicts;
                    y = cy;
                }
                if (conflicts === 0) break;
            }
        }
        placed.push({ y, xLo: p.xLo, xHi: p.xHi, bundle: p.bundle });
        out.set(p.index, y);
    }
    return out;
}

/**
 * Route every item dependency of one chart (the host, or one isolated
 * region) in a batch, so arrows sharing a gap can take lanes. Returns one
 * entry per request; `null` where position already says it (a target on
 * its source's row that starts where the source ends).
 */
export function routeDependencies(
    requests: DependencyRouteRequest[],
    obstacles: RouteObstacles,
    pixelsPerDay: number,
): Array<RoutedDependency | null> {
    const out: Array<RoutedDependency | null> = new Array(requests.length).fill(null);
    const pending: Pending[] = [];
    requests.forEach((req, index) => {
        const { source: s, target: t } = req;
        const slack = t.startX - s.endX > SAME_PX;
        if (onSameRow(s, t) && t.startX >= s.endX - SAME_PX) {
            if (!slack) return;
            // A dotted leg along the row, from the source's end date to the
            // target's painted start.
            const y =
                s.exitY !== undefined && within(s.exitY, t.top, t.bottom) ? s.exitY : (t.rowY ?? 0);
            out[index] = {
                fromId: req.fromId,
                toId: req.toId,
                waypoints: [
                    { x: s.endX, y },
                    { x: t.paintedX, y },
                ],
                slack: true,
                ...arrowHead(t.bottom - t.top),
            };
            return;
        }
        const px = sourcePortX(s, pixelsPerDay);
        const tx = targetPortX(t, pixelsPerDay);
        let from: Point;
        let to: Point;
        let dir: 1 | -1;
        if (t.top >= s.bottom - SAME_PX) {
            dir = 1;
            from = { x: px, y: s.bottom };
            to = { x: tx, y: t.top };
        } else if (t.bottom <= s.top + SAME_PX) {
            dir = -1;
            from = { x: px, y: s.top };
            to = { x: tx, y: t.bottom };
        } else {
            // Overlapping but not on one row (a target that starts before
            // its source ends): leave the source's bottom, run below both,
            // come up into the target's bottom.
            const below = Math.max(s.bottom, t.bottom) + 4;
            out[index] = {
                fromId: req.fromId,
                toId: req.toId,
                waypoints: [
                    { x: px, y: s.bottom },
                    { x: px, y: below },
                    { x: tx, y: below },
                    { x: tx, y: t.bottom },
                ],
                slack,
                ...arrowHead(t.paintedWidth),
            };
            return;
        }
        if (Math.abs(px - tx) < SAME_PX) {
            out[index] = {
                fromId: req.fromId,
                toId: req.toId,
                waypoints: [from, to],
                slack,
                ...arrowHead(t.paintedWidth),
            };
            return;
        }
        const { gap, centre } = pickGap(from, to, dir, obstacles);
        pending.push({
            index,
            req,
            from,
            to,
            dir,
            gap,
            centre,
            xLo: Math.min(px, tx),
            xHi: Math.max(px, tx),
            bundle: `${Math.round(tx * 100)}:${dir}`,
        });
    });
    const lanes = assignLanes(pending);
    for (const p of pending) {
        const y = lanes.get(p.index) ?? p.centre;
        const slack = p.req.target.startX - p.req.source.endX > SAME_PX;
        out[p.index] = {
            fromId: p.req.fromId,
            toId: p.req.toId,
            waypoints: [p.from, { x: p.from.x, y }, { x: p.to.x, y }, p.to],
            slack,
            ...arrowHead(p.req.target.paintedWidth),
        };
    }
    return out;
}
