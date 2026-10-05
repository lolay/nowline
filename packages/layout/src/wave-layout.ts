// Engine A (pixel layout) wave state: specs/waves.md §8.4.
//
// `RoadmapNode.place` runs its lane loop (plus a region pass) inside the
// unit-agnostic barrier driver (`solveWaveBarriers`). Every pass floors
// starts with the pass's `S` (in px) and accumulates member ends; this
// module holds that state and the small helpers the sequencers and
// container nodes call. Without waves `LayoutContext.waves` is undefined
// and every helper here is a no-op, so wave-free output is unchanged.

import type { ItemDeclaration, WavePlan } from '@nowline/core';
import { addDays } from './calendar.js';
import { parseDate, propValue } from './dsl-utils.js';
import type { LayoutContext } from './layout-context.js';
import type { TimeScale } from './time-scale.js';
import type { PositionedItem } from './types.js';
import { type WaveBarrierResult, type WaveNode, WavePass } from './wave-barrier.js';

/**
 * Sub-pixel tolerance for wave edges: a milestone whose center is closer
 * than this to a boundary sits on it (specs/waves.md §9.2), and a wave or
 * a floor must move past a date by at least this much to count as an
 * overrun or a pin override. Pixel ends are float sums, so exact
 * comparisons would flip on rounding noise.
 */
export const WAVE_EDGE_TOLERANCE_PX = 0.5;

/** Engine A's barrier state, shared by the main lanes and the regions. */
export interface WaveLayoutState {
    readonly plan: WavePlan;
    /** Wave ids in declaration order (wave k at index `k - 1`). */
    readonly ids: readonly string[];
    /** The axis origin in px (`S_1 >= origin`). */
    readonly origin: number;
    /**
     * `A_k` in px from the unclamped `scale.forward` of each floor date
     * (never `forwardWithinDomain` or the edge maps), or null: no floor.
     */
    readonly floors: ReadonlyArray<number | null>;
    /** `S_k` / `E_k` in px (0-based) that the current pass floors with and seeds. */
    S: readonly number[];
    E: readonly number[];
    /** The current pass: floors from `S`, plus the member-end accumulator. */
    pass: WavePass;
    /**
     * Set once the driver settles: `S`/`E` are the solved values, `pass` is
     * the pass that ran with them, and later placements (the slack rerun,
     * the final region placement) floor without accumulating. The spans
     * then come from `summarizeWaves(plan, solve, pass, origin, floors)`.
     */
    frozen: boolean;
    /** The driver's result, set with `frozen`. */
    solve?: WaveBarrierResult;
}

/** Fresh state for a roadmap with waves; `scale` maps the floor dates. */
export function createWaveLayoutState(
    plan: WavePlan,
    scale: TimeScale,
    origin: number,
): WaveLayoutState {
    const S = plan.waves.map(() => origin);
    return {
        plan,
        ids: plan.waves.map((w) => w.name as string),
        origin,
        floors: plan.floors.map((f) => {
            const d = f ? parseDate(f.date) : null;
            return d ? scale.forward(d) : null;
        }),
        S,
        E: S,
        pass: new WavePass(plan, S),
        frozen: false,
    };
}

/** Start a barrier pass with the driver's `S`/`E`. */
export function beginWavePass(
    state: WaveLayoutState,
    S: readonly number[],
    E: readonly number[],
): void {
    state.S = S;
    state.E = E;
    state.pass = new WavePass(state.plan, S);
}

/**
 * Freeze the state on the driver's result. The last pass the driver ran
 * used exactly `result.S` / `result.E` (on convergence and when capped),
 * so `state.pass` already floors with the solved starts.
 */
export function freezeWaves(state: WaveLayoutState, result: WaveBarrierResult): void {
    state.S = result.S;
    state.E = result.E;
    state.frozen = true;
    state.solve = result;
}

/**
 * Seed the wave edges into a pair of entity-edge maps (specs/waves.md
 * §8.4): `entityRightEdges[w_k] = E_k`, `entityLeftEdges[w_k] = S_k`, so
 * `after:<wave>`, `before:<wave>` and a floating `milestone after:<wave>`
 * resolve through the existing lookups. Wave ids get no midpoint, so a
 * wave reference draws no dependency arrow.
 */
export function seedWaveEdges(
    state: WaveLayoutState,
    left: Map<string, number>,
    right: Map<string, number>,
): void {
    state.ids.forEach((id, i) => {
        left.set(id, state.S[i]);
        right.set(id, state.E[i]);
    });
}

/**
 * The barrier floor applied to a start: `max(x, S[ew(node)], S[lw(node)])`
 * (specs/waves.md §5.1 start rule). `x` unchanged without waves and for
 * background work with no lead wave.
 */
export function waveFloorX(node: WaveNode, x: number, ctx: LayoutContext): number {
    return ctx.waves ? ctx.waves.pass.apply(node, x) : x;
}

/** Record a placed item's logical end (members only; never while frozen). */
export function accumulateWaveMember(
    node: ItemDeclaration,
    logicalEnd: number,
    ctx: LayoutContext,
): void {
    if (ctx.waves && !ctx.waves.frozen) ctx.waves.pass.accumulate(node, logicalEnd);
}

/** `PositionedItem.waveRole`, or undefined when the roadmap has no waves. */
export function waveRoleOf(node: ItemDeclaration, ctx: LayoutContext): PositionedItem['waveRole'] {
    if (!ctx.waves) return undefined;
    return ctx.waves.plan.memberWave(node) !== undefined ? 'member' : 'background';
}

/**
 * The `date:` / `start:` pin a barrier floor moved (NL.W1001), for an item
 * placed at `startX` (its floored logical start). The pin is resolved with
 * `resolveChildStart`'s precedence: `date:` wins whenever it parses, and a
 * pin outside the date window is dropped (the item then never had a
 * pinned start).
 *
 * Two tests, both with the boundary tolerance:
 * - the floor lies past the pin, so the wave could have moved it. This
 *   compares the pin with the floor, not with the final start: engine A
 *   ignores a `start:` pin on a direct parallel track and lets `after:`
 *   refs push a lane item's `start:` pin, and neither of those moves is
 *   the wave's doing;
 * - the item starts at the floor, so the floor is the binding term. An
 *   `after:` that pushed the item past the floor moved it, not the wave,
 *   and NL.W1001's "the item starts at the wave start" would be false.
 */
export function wavePinOverrideOf(
    node: ItemDeclaration,
    startX: number,
    ctx: LayoutContext,
): PositionedItem['wavePinOverride'] {
    const k = ctx.waves?.plan.waveOf.get(node);
    if (!ctx.waves || k === undefined) return undefined;
    const dateRaw = propValue(node.properties, 'date');
    const key = parseDate(dateRaw) ? 'date' : 'start';
    const pin = key === 'date' ? dateRaw : propValue(node.properties, 'start');
    const pinDate = parseDate(pin);
    if (pin === undefined || !pinDate) return undefined;
    const pinX = ctx.scale.forwardWithinDomain(pinDate);
    const floor = ctx.waves.pass.floor(node);
    if (pinX === null || floor === undefined || floor - pinX < WAVE_EDGE_TOLERANCE_PX) {
        return undefined;
    }
    if (startX - floor > WAVE_EDGE_TOLERANCE_PX) return undefined;
    return {
        wave: ctx.waves.ids[k - 1],
        key,
        pin,
        start: dateAtX(floor, ctx).toISOString().slice(0, 10),
    };
}

/** True when `x` sits on a wave boundary: any `S_k` or `E_k` except the origin. */
export function isOnWaveBoundary(state: WaveLayoutState, x: number): boolean {
    for (const b of [...state.S, ...state.E]) {
        if (Math.abs(b - state.origin) < WAVE_EDGE_TOLERANCE_PX) continue;
        if (Math.abs(x - b) < WAVE_EDGE_TOLERANCE_PX) return true;
    }
    return false;
}

/**
 * The whole UTC day nearest to `x` on the timeline. Extent growth never
 * moves the origin or the pixels-per-day, so this is stable across it.
 */
export function dateAtX(x: number, ctx: LayoutContext): Date {
    const days = Math.round((x - ctx.timeline.originX) / ctx.timeline.pixelsPerDay);
    return addDays(ctx.timeline.startDate, days);
}
