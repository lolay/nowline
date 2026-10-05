// Unit tests for the unit-agnostic barrier driver (specs/waves.md §8.2-§8.3),
// driven by a synthetic scheduler: each lane is a sequence of members, and a
// member starts at max(lane cursor, S[its wave]).

import { describe, expect, it } from 'vitest';
import { solveWaveBarriers, type WavePassResult } from '../src/wave-barrier.js';

/** `[wave (1-based), duration]` per member, lanes in placement order. */
type Lane = Array<[number, number]>;

function lanePass(n: number, lanes: Lane[]) {
    const calls: Array<{ S: number[]; E: number[] }> = [];
    const runPass = (S: readonly number[], E: readonly number[]): WavePassResult => {
        calls.push({ S: [...S], E: [...E] });
        const memberEnd = new Array<number>(n).fill(-Infinity);
        for (const lane of lanes) {
            let cursor = 0;
            for (const [k, dur] of lane) {
                const start = Math.max(cursor, S[k - 1]);
                cursor = start + dur;
                memberEnd[k - 1] = Math.max(memberEnd[k - 1], cursor);
            }
        }
        return { memberEnd };
    };
    return { runPass, calls };
}

describe('solveWaveBarriers', () => {
    it('Example 1: interleaved lanes need n + 1 passes', () => {
        const { runPass, calls } = lanePass(3, [
            [
                [1, 2],
                [2, 3],
                [3, 1],
            ],
            [
                [1, 1],
                [2, 4],
                [3, 1],
            ],
            [
                [1, 3],
                [2, 2],
                [3, 2],
            ],
        ]);
        const r = solveWaveBarriers(3, 0, [null, null, null], runPass);
        expect(r).toEqual({ S: [0, 3, 7], E: [3, 7, 9], passes: 4, capped: false });
        expect(calls).toHaveLength(4);
        // The first pass starts from the lower bound E = S; the last pass ran
        // with the solved S/E, so the caller can keep its placements.
        expect(calls[0]).toEqual({ S: [0, 0, 0], E: [0, 0, 0] });
        expect(calls[3]).toEqual({ S: [0, 3, 7], E: [3, 7, 9] });
    });

    it('a floor past the previous wave end opens a gap', () => {
        // Example 11 in weeks: execute is held back to W4 by its floor.
        const { runPass } = lanePass(2, [
            [
                [1, 2],
                [2, 5],
            ],
            [
                [1, 3],
                [2, 7],
            ],
        ]);
        const r = solveWaveBarriers(2, 0, [null, 4], runPass);
        expect(r).toEqual({ S: [0, 4], E: [3, 11], passes: 2, capped: false });
    });

    it('a floor below the previous wave end does not move the wave', () => {
        const { runPass } = lanePass(2, [
            [
                [1, 5],
                [2, 1],
            ],
        ]);
        const r = solveWaveBarriers(2, 0, [null, 2], runPass);
        expect(r.S).toEqual([0, 5]);
        expect(r.E).toEqual([5, 6]);
    });

    it('a first-wave floor before the origin is absorbed by the origin', () => {
        const { runPass } = lanePass(1, [[[1, 2]]]);
        const r = solveWaveBarriers(1, 0, [-10], runPass);
        expect(r).toEqual({ S: [0], E: [2], passes: 2, capped: false });
    });

    it('a first-wave floor after the origin holds every member back', () => {
        const { runPass } = lanePass(1, [[[1, 2]], [[1, 1]]]);
        const r = solveWaveBarriers(1, 0, [3], runPass);
        expect(r).toEqual({ S: [3], E: [5], passes: 2, capped: false });
    });

    it('an empty wave has zero width and does not delay later waves', () => {
        // Example 12.
        const { runPass } = lanePass(3, [
            [
                [1, 2],
                [3, 1],
            ],
            [
                [1, 1],
                [3, 2],
            ],
        ]);
        const r = solveWaveBarriers(3, 0, [null, null, null], runPass);
        expect(r.S).toEqual([0, 2, 2]);
        expect(r.E).toEqual([2, 2, 4]);
        expect(r.capped).toBe(false);
    });

    it('works in any unit and from a non-zero origin (pixels)', () => {
        const { runPass } = lanePass(2, [
            [
                [1, 40],
                [2, 20],
            ],
        ]);
        const r = solveWaveBarriers(2, 100, [null, 200], runPass);
        expect(r.S).toEqual([100, 200]);
        expect(r.E).toEqual([140, 220]);
    });

    it('no waves: one pass, empty spans', () => {
        let calls = 0;
        const r = solveWaveBarriers(0, 0, [], () => {
            calls++;
            return { memberEnd: [] };
        });
        expect(r).toEqual({ S: [], E: [], passes: 1, capped: false });
        expect(calls).toBe(1);
    });

    it('caps at n + 1 passes on a runPass that never settles', () => {
        const seen: number[][] = [];
        let calls = 0;
        const r = solveWaveBarriers(2, 0, [null, null], (S, E) => {
            calls++;
            seen.push([...S, ...E]);
            // Adversarial: the member end grows on every call.
            return { memberEnd: [calls * 10, -Infinity] };
        });
        expect(r.capped).toBe(true);
        expect(r.passes).toBe(3);
        expect(r.S).toEqual([0, 30]);
        expect(r.E).toEqual([30, 30]);
        // One extra pass runs with the returned S/E so the caller's
        // placements match the reported barriers.
        expect(calls).toBe(4);
        expect(seen[3]).toEqual([0, 30, 30, 30]);
    });
});
