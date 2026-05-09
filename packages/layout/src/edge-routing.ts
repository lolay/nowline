// Channel-based dependency-arrow router. Replaces the single-elbow
// `routeEdge` shipped in m2g with one that:
//
//   - Drops the vertical leg in the cleanest inter-column gutter (item
//     bars are obstacles).
//   - Nudges the elbow X away from any visible parallel/group bracket
//     within `BRACKET_NUDGE_PX` so arrows breathe instead of hugging
//     the bracket line.
//   - Assigns distinct slots when multiple edges share a channel so
//     parallel arrows don't stack on top of one another.
//   - Falls back to under-bar routing (rendered behind the bars with a
//     thinner stroke) when no clean channel exists in the source-target
//     gap.
//
// Containers are NOT treated as obstacles. Endpoints inside a parallel
// or group route directly through the items-only obstacle map and use
// the under-bar fallback when needed. Looping around container edges
// to avoid a single intersecting bar produced unsatisfying detours
// (see `specs/handoffs/handoff-channel-routing-design.md`).

import type {
    Point,
    BoundingBox,
    PositionedSwimlane,
    PositionedTrackChild,
    PositionedIncludeRegion,
} from './types.js';

/** A visible parallel or group bracket stroke. Used by the
 *  bracket-clearance nudge: arrows whose chosen elbow X falls within
 *  `BRACKET_NUDGE_PX` of one of these lines are shifted away. Brackets
 *  are NOT obstacles — they're aesthetic preferences, not collisions. */
export interface BracketLine {
    x: number;
    yTop: number;
    yBottom: number;
}

/** Per-edge routing request. `from` and `to` are the (visualEdge, midY)
 *  attach points the rest of the layout already computed; the router
 *  produces the orthogonal polyline that connects them. */
export interface EdgeRouteRequest {
    fromId: string;
    toId: string;
    from: Point;
    to: Point;
    /** Marker → item edges (anchor / milestone source) skip the channel
     *  router entirely — the cut line is the visible stem, the path is
     *  always a short horizontal stub. Set true to bypass routing. */
    isMarkerSource: boolean;
}

export interface EdgeRouteResult {
    fromId: string;
    toId: string;
    waypoints: Point[];
    /** True when the chosen channel intersected an item bar. The
     *  renderer paints these edges BEFORE bar fills with a thinner
     *  stroke so the bar still reads as the foreground. */
    underBar: boolean;
}

/** Distance (px) the elbow X must keep from any visible bracket. Picked
 *  to leave a small visible gap between the arrow's vertical leg and
 *  the bracket stroke without forcing the arrow far from its natural
 *  mid-gutter line. */
export const BRACKET_NUDGE_PX = 4;

/** Minimum horizontal source stub (px) — distance from the source's
 *  exit point to the vertical-leg elbow. Below this, the source-side
 *  arrow body collapses into the bar's right edge with no visible
 *  horizontal segment. Treated as a hard constraint when picking
 *  the channel X for left-to-right edges. */
export const MIN_SOURCE_STUB_PX = 6;

/** Minimum horizontal target stub (px) — distance from the vertical-leg
 *  elbow to the target's left edge. Below this, the arrowhead has no
 *  horizontal lead-in: the leg appears to plunge directly into the bar
 *  without a visible target-side stub. Treated as a hard constraint
 *  when picking the channel X for left-to-right edges; conflicts with
 *  obstacle / bracket clearance trigger the under-bar fallback. */
export const MIN_TARGET_STUB_PX = 6;

/** Spacing between slots inside one channel. With a 12 px gutter and
 *  this spacing, three slots (-1, 0, +1) fit comfortably; more than
 *  three sharing a channel collapses to centerline. */
const SLOT_SPACING_PX = 3;

/** Tolerance (px) when grouping edges by channel X for slot assignment.
 *  Edges within this distance share a channel. */
const SLOT_GROUP_TOLERANCE_PX = 1;

/** Stub length leaving each endpoint before the elbow turn for
 *  right-to-left edges. The router also inserts a quarter-arc at the
 *  elbow corner; the renderer's `roundedOrthogonalPath` rounds the
 *  corners. Left-to-right edges use the per-side `MIN_*_STUB_PX`
 *  constants instead — they provide tighter, asymmetric control over
 *  the source vs target sides. */
const STUB_OUT_PX = 10;

export interface ChannelGridInput {
    /** Every painted item box (visual edges, including chip-spill
     *  growth). Treated as hard obstacles: a vertical leg crossing one
     *  triggers under-bar fallback. */
    itemBars: BoundingBox[];
    /** Every visible bracket stroke (parallel `bracket:solid|dashed`,
     *  filled-style group chiclets are NOT brackets). Used by the
     *  clearance nudge only — not obstacles. */
    brackets: BracketLine[];
}

export class ChannelGrid {
    private readonly items: BoundingBox[];
    private readonly brackets: BracketLine[];

    constructor(input: ChannelGridInput) {
        this.items = input.itemBars;
        this.brackets = input.brackets;
    }

    /** True when a vertical line at `x` intersects any item bar within
     *  the Y span `[yMin, yMax]`. */
    hasObstacle(x: number, yMin: number, yMax: number): boolean {
        const lo = Math.min(yMin, yMax);
        const hi = Math.max(yMin, yMax);
        for (const bar of this.items) {
            if (x <= bar.x || x >= bar.x + bar.width) continue;
            if (bar.y + bar.height <= lo || bar.y >= hi) continue;
            return true;
        }
        return false;
    }

    /** Visible brackets within `radius` px of `x` whose Y span overlaps
     *  `[yMin, yMax]`. The clearance nudge uses these to shift the
     *  elbow X away from the bracket. */
    bracketsNear(x: number, yMin: number, yMax: number, radius: number): BracketLine[] {
        const lo = Math.min(yMin, yMax);
        const hi = Math.max(yMin, yMax);
        const out: BracketLine[] = [];
        for (const b of this.brackets) {
            if (Math.abs(b.x - x) > radius) continue;
            if (b.yBottom <= lo || b.yTop >= hi) continue;
            out.push(b);
        }
        return out;
    }
}

/**
 * Walk a positioned swimlane tree and collect every painted item bar
 * (visual edges) AND every visible bracket stroke. Output feeds
 * `ChannelGrid` so the router knows what to avoid.
 *
 * Swimlanes contained in include regions count too — items inside an
 * isolated region share the parent timeline so cross-region arrows
 * still need the obstacle/bracket data to route cleanly.
 */
export function collectRoutingObstacles(
    swimlanes: PositionedSwimlane[],
    includes: PositionedIncludeRegion[],
): ChannelGridInput {
    const itemBars: BoundingBox[] = [];
    const brackets: BracketLine[] = [];

    const visitChild = (child: PositionedTrackChild): void => {
        if (child.kind === 'item') {
            itemBars.push(child.box);
            return;
        }
        if (child.kind === 'parallel') {
            // Parallel `bracket:solid|dashed` paints `[ ]` strokes at
            // the box's left/right edges with 12 px vertical padding
            // (matches `renderParallel`). The bracket has THREE
            // strokes per side — a vertical bar at the box edge, plus
            // top/bottom horizontal "feet" extending 4 px inward
            // toward the parallel's center. We model the verticals as
            // full-height bracket lines AND emit thin-Y-band entries
            // at the foot tips so the clearance nudge sees the foot
            // extent (otherwise an elbow nudged just past the
            // vertical at +4 px would land squarely on the inward
            // foot tip — see issue #2 in the channel-routing handoff).
            if (child.style.bracket === 'solid' || child.style.bracket === 'dashed') {
                const padding = 12;
                const stub = 4;
                const yTop = child.box.y - padding;
                const yBottom = child.box.y + child.box.height + padding;
                const lx = child.box.x;
                const rx = child.box.x + child.box.width;
                brackets.push({ x: lx, yTop, yBottom });
                brackets.push({ x: rx, yTop, yBottom });
                // Foot tips: tiny Y bands centered on each foot row
                // so the entries only fire when the elbow's Y span
                // actually crosses the foot line.
                brackets.push({ x: lx + stub, yTop: yTop - 1, yBottom: yTop + 1 });
                brackets.push({ x: lx + stub, yTop: yBottom - 1, yBottom: yBottom + 1 });
                brackets.push({ x: rx - stub, yTop: yTop - 1, yBottom: yTop + 1 });
                brackets.push({ x: rx - stub, yTop: yBottom - 1, yBottom: yBottom + 1 });
            }
            for (const sub of child.children) visitChild(sub);
            return;
        }
        if (child.kind === 'group') {
            // Bracket-style groups (no fill) paint a left-side `[`
            // glyph along `box.x`. Filled-style groups have no bracket
            // — the chiclet is the visual instead.
            const isFilled = child.style.bg !== 'none' && child.style.bg !== '#ffffff';
            if (!isFilled && child.style.bracket && child.style.bracket !== 'none') {
                brackets.push({
                    x: child.box.x,
                    yTop: child.box.y,
                    yBottom: child.box.y + child.box.height,
                });
            }
            for (const sub of child.children) visitChild(sub);
            return;
        }
    };

    const visitSwimlane = (lane: PositionedSwimlane): void => {
        for (const child of lane.children) visitChild(child);
        for (const nested of lane.nested) visitSwimlane(nested);
    };

    for (const lane of swimlanes) visitSwimlane(lane);
    for (const region of includes) {
        for (const lane of region.nestedSwimlanes) visitSwimlane(lane);
    }

    return { itemBars, brackets };
}

/** Satisfiable range for a left-to-right edge's elbow X — tightest
 *  band that still leaves `MIN_SOURCE_STUB_PX` of horizontal lead-out
 *  on the source side and `MIN_TARGET_STUB_PX` of horizontal lead-in
 *  on the target side. `null` means the gutter is too narrow to honor
 *  both stubs (router pins to the target-stub line and forces
 *  under-bar). For right-to-left and same-row edges the range is
 *  always `null` — those branches don't apply the stub constraints
 *  because their geometry is fundamentally different. */
type StubRange = { minX: number; maxX: number } | null;

/**
 * Pick a channel X for one edge (no slot offset yet). Returns the
 * provisional X, an `underBar` flag, and the satisfiable stub range
 * so the bracket-clearance nudge can stay inside it. Same-row edges
 * (`from.y ≈ to.y`) get a degenerate "channel" at midX so the
 * renderer emits a straight line.
 */
function pickChannelX(
    req: EdgeRouteRequest,
    grid: ChannelGrid,
): { x: number; underBar: boolean; range: StubRange } {
    const { from, to } = req;
    if (Math.abs(from.y - to.y) < 0.5) {
        return { x: (from.x + to.x) / 2, underBar: false, range: null };
    }

    const yMin = Math.min(from.y, to.y);
    const yMax = Math.max(from.y, to.y);

    if (from.x <= to.x) {
        // Left-to-right edge. The elbow X must satisfy both the
        // min-source-stub and min-target-stub constraints — when the
        // gutter is wider than the sum of the stubs, that's a band;
        // when it's tighter the band collapses or inverts and the
        // arrow drops to under-bar at the target-stub line.
        const minX = from.x + MIN_SOURCE_STUB_PX;
        const maxX = to.x - MIN_TARGET_STUB_PX;
        if (minX > maxX) {
            // Gutter narrower than the combined min stubs — give up
            // and honor the target-stub line so the arrowhead still
            // has its visible lead-in. Source stub absorbs the loss.
            return {
                x: to.x - MIN_TARGET_STUB_PX,
                underBar: true,
                range: null,
            };
        }
        const range: StubRange = { minX, maxX };
        // Try the natural gutter midpoint, clamped into the range.
        const naturalMid = (from.x + to.x) / 2;
        const mid = Math.max(minX, Math.min(maxX, naturalMid));
        if (!grid.hasObstacle(mid, yMin, yMax)) {
            return { x: mid, underBar: false, range };
        }
        // Walk inside the satisfiable range looking for a clear strip.
        const span = maxX - minX;
        for (let step = 1; step <= span; step++) {
            const left = mid - step;
            if (left >= minX && !grid.hasObstacle(left, yMin, yMax)) {
                return { x: left, underBar: false, range };
            }
            const right = mid + step;
            if (right <= maxX && !grid.hasObstacle(right, yMin, yMax)) {
                return { x: right, underBar: false, range };
            }
        }
        return { x: mid, underBar: true, range };
    }

    // Right-to-left edge: source ends past target's left edge. Try a
    // channel just right of source first; then walk leftward across
    // the source/target span looking for any clear vertical strip.
    const probes = [from.x + STUB_OUT_PX, to.x - STUB_OUT_PX];
    for (const probe of probes) {
        if (probe > 0 && !grid.hasObstacle(probe, yMin, yMax)) {
            return { x: probe, underBar: false, range: null };
        }
    }
    // Fallback to under-bar at the source-side stub.
    return { x: from.x + STUB_OUT_PX, underBar: true, range: null };
}

/**
 * Apply the bracket-clearance nudge to a chosen channel X. Shifts `x`
 * away from the nearest visible bracket within `BRACKET_NUDGE_PX`,
 * preferring the direction that stays inside the satisfiable stub
 * range. When neither direction fits — or the candidate position is
 * still within nudge distance of another bracket — returns the input
 * X clamped to the range and signals `forceUnderBar` so the leg paints
 * BEHIND the bars and bracket strokes (z-order: bracket renders after
 * under-bar edges, so the bracket cleanly covers the colliding
 * portion).
 */
function nudgeAwayFromBrackets(
    x: number,
    range: StubRange,
    req: EdgeRouteRequest,
    grid: ChannelGrid,
): { x: number; forceUnderBar: boolean } {
    const yMin = Math.min(req.from.y, req.to.y);
    const yMax = Math.max(req.from.y, req.to.y);
    const near = grid.bracketsNear(x, yMin, yMax, BRACKET_NUDGE_PX);
    if (near.length === 0) return { x, forceUnderBar: false };

    // Find the closest bracket — that's the one driving the nudge.
    let closest = near[0];
    let closestDist = Math.abs(near[0].x - x);
    for (let i = 1; i < near.length; i++) {
        const d = Math.abs(near[i].x - x);
        if (d < closestDist) {
            closest = near[i];
            closestDist = d;
        }
    }

    // Try both sides of the closest bracket. Accept the first
    // candidate that stays within the satisfiable range AND clears
    // every other nearby bracket. The recheck radius is one epsilon
    // tighter than `BRACKET_NUDGE_PX` so the closest bracket itself
    // (now sitting at exactly the nudge distance) doesn't falsely
    // trip the rejection — and so a SECOND bracket exactly at the
    // nudge distance is also accepted as "just clear enough".
    const candidates = [closest.x + BRACKET_NUDGE_PX, closest.x - BRACKET_NUDGE_PX];
    const recheckRadius = BRACKET_NUDGE_PX - 0.01;
    for (const candidate of candidates) {
        if (range && (candidate < range.minX || candidate > range.maxX)) continue;
        // Clamp right-to-left candidates to the natural gap so they
        // don't escape past either endpoint (range is null on that path).
        const clamped = range
            ? candidate
            : Math.max(
                  Math.min(req.from.x, req.to.x) + 1,
                  Math.min(Math.max(req.from.x, req.to.x) - 1, candidate),
              );
        const stillNear = grid.bracketsNear(clamped, yMin, yMax, recheckRadius);
        if (stillNear.length === 0) {
            return { x: clamped, forceUnderBar: false };
        }
    }

    // No nudge fits. Keep the channel at its current X (clamped into
    // the range) and force under-bar so item bars + bracket strokes
    // mask the colliding portion of the leg.
    const fallback = range ? Math.min(Math.max(x, range.minX), range.maxX) : x;
    return { x: fallback, forceUnderBar: true };
}

/**
 * Greedy interval coloring per channel. Edges sharing a channel
 * (within `SLOT_GROUP_TOLERANCE_PX`) get distinct slot indices;
 * overlapping Y spans land on different slots. Slot 0 is the
 * centerline; ±1 sit `SLOT_SPACING_PX` to either side; further slots
 * collapse back to the centerline (rare; visual stacking accepted).
 */
function assignSlots(
    edges: Array<{
        req: EdgeRouteRequest;
        channelX: number;
        underBar: boolean;
        orderIndex: number;
    }>,
): Map<number, number> {
    // Group by channel X (sort first so close-X edges collapse).
    const byX = [...edges].sort((a, b) => {
        if (Math.abs(a.channelX - b.channelX) >= SLOT_GROUP_TOLERANCE_PX) {
            return a.channelX - b.channelX;
        }
        // Within the same channel, deterministic by orderIndex.
        return a.orderIndex - b.orderIndex;
    });

    const slotsByOrderIndex = new Map<number, number>();
    let groupStart = 0;
    while (groupStart < byX.length) {
        let groupEnd = groupStart + 1;
        while (
            groupEnd < byX.length &&
            Math.abs(byX[groupEnd].channelX - byX[groupStart].channelX) < SLOT_GROUP_TOLERANCE_PX
        ) {
            groupEnd++;
        }
        const group = byX.slice(groupStart, groupEnd);
        // Within the group, greedy color by Y span. Sort by min Y then
        // (deterministically) by orderIndex.
        const sortedGroup = [...group].sort((a, b) => {
            const aMin = Math.min(a.req.from.y, a.req.to.y);
            const bMin = Math.min(b.req.from.y, b.req.to.y);
            if (Math.abs(aMin - bMin) > 0.5) return aMin - bMin;
            return a.orderIndex - b.orderIndex;
        });
        // Track per-slot maxY assigned so far.
        const slotMaxY: number[] = [];
        for (const entry of sortedGroup) {
            const eMin = Math.min(entry.req.from.y, entry.req.to.y);
            const eMax = Math.max(entry.req.from.y, entry.req.to.y);
            let assigned = -1;
            for (let s = 0; s < slotMaxY.length; s++) {
                if (slotMaxY[s] <= eMin) {
                    assigned = s;
                    slotMaxY[s] = eMax;
                    break;
                }
            }
            if (assigned === -1) {
                assigned = slotMaxY.length;
                slotMaxY.push(eMax);
            }
            slotsByOrderIndex.set(entry.orderIndex, assigned);
        }
        groupStart = groupEnd;
    }
    return slotsByOrderIndex;
}

/** Convert a slot index to its signed offset around the channel
 *  centerline. Slots 0/1/2/... become 0, +SLOT, -SLOT, +2*SLOT,
 *  -2*SLOT... so the FIRST edge sits on the centerline (no shift)
 *  and additional edges fan out alternately. Past 2 ± slots, slots
 *  collapse back to the centerline (visual stacking accepted). */
function slotOffset(slot: number): number {
    if (slot === 0) return 0;
    if (slot > 4) return 0; // collapse beyond ±2 slots
    const half = Math.ceil(slot / 2);
    const sign = slot % 2 === 1 ? 1 : -1;
    return sign * half * SLOT_SPACING_PX;
}

/**
 * Marker → item stub. Source X sits on the marker's vertical cut
 * line; the stub is a short horizontal segment to the target's left
 * visual edge at the target's row mid-Y. No channel selection, no
 * obstacle check — the cut line is the stem.
 */
function routeMarkerStub(req: EdgeRouteRequest): EdgeRouteResult {
    // When the cut line sits AT or PAST the target's left edge (item
    // hugs the anchor's date column), nudge the source 1 px back so
    // routeEdge produces a non-degenerate path with a visible
    // arrowhead.
    const from = req.from.x >= req.to.x ? { x: req.to.x - 1, y: req.from.y } : req.from;
    return {
        fromId: req.fromId,
        toId: req.toId,
        waypoints: [from, req.to],
        underBar: false,
    };
}

/**
 * Route every dependency edge in one batch so slot assignment can
 * coordinate across edges that share a channel. Marker → item edges
 * route as direct stubs and bypass the channel router.
 */
export function routeChannelEdges(
    requests: EdgeRouteRequest[],
    grid: ChannelGrid,
): EdgeRouteResult[] {
    const results: EdgeRouteResult[] = new Array(requests.length);
    const channelEdges: Array<{
        req: EdgeRouteRequest;
        channelX: number;
        underBar: boolean;
        orderIndex: number;
    }> = [];

    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        if (req.isMarkerSource) {
            results[i] = routeMarkerStub(req);
            continue;
        }
        // Same-row contiguous chains drop entirely. The caller skips
        // them before passing in, but defend against direct calls.
        if (Math.abs(req.from.y - req.to.y) < 0.5 && req.to.x - req.from.x < 20) {
            results[i] = {
                fromId: req.fromId,
                toId: req.toId,
                waypoints: [req.from, req.to],
                underBar: false,
            };
            continue;
        }
        const { x: provisionalX, underBar: provisionalUnderBar, range } = pickChannelX(req, grid);
        const { x: channelX, forceUnderBar } = nudgeAwayFromBrackets(
            provisionalX,
            range,
            req,
            grid,
        );
        const underBar = provisionalUnderBar || forceUnderBar;
        channelEdges.push({ req, channelX, underBar, orderIndex: i });
    }

    const slots = assignSlots(channelEdges);
    for (const entry of channelEdges) {
        const offset = slotOffset(slots.get(entry.orderIndex) ?? 0);
        const slotX = entry.channelX + offset;
        results[entry.orderIndex] = {
            fromId: entry.req.fromId,
            toId: entry.req.toId,
            waypoints: buildOrthogonalPath(entry.req.from, entry.req.to, slotX),
            underBar: entry.underBar,
        };
    }

    return results;
}

/**
 * Build the orthogonal polyline through a chosen vertical channel.
 * Source-out-stub → vertical leg → target-in-stub. Same-row edges
 * collapse to two points (handled by the caller's same-row skip).
 */
function buildOrthogonalPath(from: Point, to: Point, slotX: number): Point[] {
    if (Math.abs(from.y - to.y) < 0.5) {
        return [from, to];
    }
    return [from, { x: slotX, y: from.y }, { x: slotX, y: to.y }, to];
}
