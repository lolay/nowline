// Wave barriers (specs/waves.md §5.1, §8.2-§8.5).
//
// One unit-agnostic driver serves the three schedulers: engine A (pixel
// layout), engine B (`computeContentEndDay`, days) and engine C
// (`scheduleRoadmap`, days). Each engine wraps its existing lane walk in a
// `runPass(S, E)` callback that floors starts by the barrier and reports the
// latest member end per wave; the driver iterates to the least fixpoint.
//
// Arrays are **0-based** throughout this module: wave k (1-based, as in
// `WavePlan` and the spec's `w_1 … w_n`) lives at index `k - 1` of `S`, `E`,
// `floors` and `memberEnd`.

import type { GroupBlock, ItemDeclaration, ParallelBlock, WavePlan } from '@nowline/core';
import { parseDate } from './dsl-utils.js';
import type { WorkingCalendar } from './working-calendar.js';

/** A node the walkers floor: a leaf item or a container. */
export type WaveNode = ItemDeclaration | GroupBlock | ParallelBlock;

/** What one pass reports back to the driver. */
export interface WavePassResult {
    /** Latest member end per wave (0-based); `-Infinity` when the wave has no member. */
    memberEnd: readonly number[];
}

export interface WaveBarrierResult {
    /** Wave starts `S_k` at index `k - 1`. */
    S: number[];
    /** Wave ends `E_k` at index `k - 1`. */
    E: number[];
    /** Passes the solve ran (at most `n + 1`). */
    passes: number;
    /** True when the solve hit the `n + 1` cap without settling (invalid input). */
    capped: boolean;
}

/**
 * Solve the barrier recurrence (§8.2). `floors[k - 1]` is `A_k` in the
 * caller's units, or null for no floor; `origin` is the axis origin (0 days,
 * or the timeline's origin x).
 *
 * `runPass` must be pure in `(S, E)`: the caller resets its entity maps every
 * pass. On convergence the last `runPass` call ran with the returned `S`/`E`,
 * so the caller can keep that pass's placements. When the cap is hit, the
 * driver calls `runPass` once more with the returned `S`/`E` for the same
 * reason; that extra call is not counted in `passes`.
 *
 * `tolerance` is how far a floor must pass the prior edge (`E_{k-1}`, or
 * the origin for `S_1`) to set `S_k`; a floor within it is a tie and the
 * prior edge wins. The day engines use 0 (exact `max`). Engine A passes its
 * sub-pixel edge tolerance: its floors are `origin + days * ppd` while
 * `E_{k-1}` is a sum of item widths, so a same-day floor can exceed the
 * prior end by an ulp and would otherwise open a phantom gap.
 */
export function solveWaveBarriers(
    n: number,
    origin: number,
    floors: ReadonlyArray<number | null>,
    runPass: (S: readonly number[], E: readonly number[]) => WavePassResult,
    tolerance = 0,
): WaveBarrierResult {
    const A = floors.map((f) => f ?? -Infinity);
    let S: number[] = [];
    for (let i = 0; i < n; i++) {
        S.push(floorPast(i === 0 ? origin : S[i - 1], A[i], tolerance));
    }
    let E = [...S];
    for (let pass = 1; pass <= n + 1; pass++) {
        const m = runPass(S, E).memberEnd;
        const S2: number[] = [];
        const E2: number[] = [];
        for (let i = 0; i < n; i++) {
            S2.push(i === 0 ? S[0] : floorPast(E2[i - 1], A[i], tolerance));
            E2.push(Math.max(S2[i], m[i] ?? -Infinity));
        }
        if (sameArray(S, S2) && sameArray(E, E2)) {
            return { S, E, passes: pass, capped: false };
        }
        S = S2;
        E = E2;
    }
    runPass(S, E);
    return { S, E, passes: n + 1, capped: true };
}

/** `max(prior, floor)`, except a floor within `tolerance` of `prior` is a tie: `prior`. */
function floorPast(prior: number, floor: number, tolerance: number): number {
    return floor - prior > tolerance ? floor : prior;
}

function sameArray(a: readonly number[], b: readonly number[]): boolean {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Floor offsets `A_k` in working days from `startDate`, from the plan's
 * unclamped declaration dates (§5.1). A floor on a non-working day counts
 * as the next working day. A floor before the start yields a negative
 * offset; `S_1 = max(0, A_1)` absorbs it.
 */
export function waveFloorDays(
    plan: WavePlan,
    startDate: Date,
    calendar: WorkingCalendar,
): Array<number | null> {
    return plan.floors.map((f) => {
        const d = f ? parseDate(f.date) : null;
        return d ? calendar.workingIndexOf(startDate, d) : null;
    });
}

/**
 * Per-pass wave state for the day engines (B and C): the floor of a node and
 * the member-end accumulator. One instance per pass.
 */
export class WavePass {
    /** Latest member end per wave (0-based); `-Infinity` when the wave has no member. */
    readonly memberEnd: number[];
    /** The member that set `memberEnd` (latest end; ties keep the first placed). */
    readonly binding: Array<ItemDeclaration | undefined>;
    /** Members placed per wave. */
    readonly memberCount: number[];

    constructor(
        readonly plan: WavePlan,
        readonly S: readonly number[],
    ) {
        const n = plan.waves.length;
        this.memberEnd = new Array<number>(n).fill(-Infinity);
        this.binding = new Array<ItemDeclaration | undefined>(n).fill(undefined);
        this.memberCount = new Array<number>(n).fill(0);
    }

    /**
     * The barrier floor of `node`: `S[ew]` for an item, and
     * `max(S[ew(C)], S[lw(C)])` for a container (§5.1 start rule). Undefined
     * for background work with no lead wave.
     */
    floor(node: WaveNode): number | undefined {
        const ew = this.plan.waveOf.get(node);
        const lw = node.$type === 'ItemDeclaration' ? undefined : this.plan.leadOf.get(node);
        let f: number | undefined;
        if (ew !== undefined) f = this.S[ew - 1];
        if (lw !== undefined) f = Math.max(f ?? -Infinity, this.S[lw - 1]);
        return f;
    }

    /** `max(start, floor(node))`, or `start` unchanged when there is no floor. */
    apply(node: WaveNode, start: number): number {
        const f = this.floor(node);
        return f === undefined ? start : Math.max(start, f);
    }

    /** Record a placed item's end; a no-op for background work. */
    accumulate(item: ItemDeclaration, end: number): void {
        const k = this.plan.memberWave(item);
        if (k === undefined) return;
        this.memberCount[k - 1]++;
        if (end > this.memberEnd[k - 1]) {
            this.memberEnd[k - 1] = end;
            this.binding[k - 1] = item;
        }
    }
}

/** One wave's solved span, in the caller's units. */
export interface WaveSpan {
    id: string;
    /** 1-based declaration order. */
    index: number;
    start: number;
    end: number;
    memberCount: number;
    /** The binding member's id ?? title; omitted when no member sets `E_k > S_k`. */
    heldBy?: string;
    /** The `after:` element that set `S_k`, when it beat `E_{k-1}` (or the origin). */
    floorRef?: string;
}

/**
 * Summarise the solved waves from the driver's result and the final pass
 * (the pass that ran with `result.S` / `result.E`). `tolerance` must be
 * the one the solve ran with, so `floorRef` is set exactly when the floor
 * set `S_k`.
 */
export function summarizeWaves(
    plan: WavePlan,
    result: WaveBarrierResult,
    finalPass: WavePass,
    origin: number,
    floors: ReadonlyArray<number | null>,
    tolerance = 0,
): WaveSpan[] {
    return plan.waves.map((w, i) => {
        const span: WaveSpan = {
            id: w.name as string,
            index: i + 1,
            start: result.S[i],
            end: result.E[i],
            memberCount: finalPass.memberCount[i],
        };
        const binding = finalPass.binding[i];
        if (
            binding !== undefined &&
            finalPass.memberEnd[i] === result.E[i] &&
            result.E[i] > result.S[i]
        ) {
            const label = binding.name ?? binding.title;
            if (label !== undefined) span.heldBy = label;
        }
        const floor = floors[i];
        const floorRef = plan.floors[i]?.ref;
        const prior = i === 0 ? origin : result.E[i - 1];
        if (
            floor !== null &&
            floor !== undefined &&
            floorRef !== undefined &&
            floor - prior > tolerance
        ) {
            span.floorRef = floorRef;
        }
        return span;
    });
}
