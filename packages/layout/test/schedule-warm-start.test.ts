// Engine A's warm start from the day schedule (specs/scheduler-unification.md
// §5, F4): every item start is floored by engine C's start, and the wave
// barrier driver starts from C's `S_k`, both projected to px. C is a lower
// bound of A (`schedule-lower-bound.test.ts`), so the passes reach the same
// least fixpoint: the positioned model is identical to a cold start's, and
// the driver needs no more passes, and fewer on every wave sample whose
// cold solve takes more than one.

import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NowlineFile, ResolveResult } from '@nowline/core';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { setScheduleWarmStart } from '../src/start-rules.js';
import type { PositionedRoadmap } from '../src/types.js';
import { generateRoadmap, mulberry32 } from './generated-roadmaps.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The `--now` the G1 gate renders every sample with. */
const TODAY = new Date(Date.UTC(2026, 1, 9));

/** Every `examples/**.nowline` and `tests/*.nowline` that declares a wave, sorted. */
function waveSamples(): string[] {
    const out: string[] = [];
    const walk = (rel: string, recurse: boolean): void => {
        for (const entry of readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
            const child = `${rel}/${entry.name}`;
            if (entry.isDirectory() && recurse) walk(child, true);
            else if (entry.isFile() && entry.name.endsWith('.nowline')) out.push(child);
        }
    };
    walk('examples', true);
    walk('tests', false);
    return out
        .sort()
        .filter((rel) => /^\s*wave\s/m.test(readFileSync(path.join(REPO, rel), 'utf8')));
}

/** The model without the solve record, which is the only field allowed to differ. */
function placement(model: PositionedRoadmap): string {
    const { waveSolve: _solve, ...rest } = model;
    return JSON.stringify(rest);
}

/** Lay out cold (no floor, no seed) and warm (the default). */
function layBoth(
    file: NowlineFile,
    resolved: ResolveResult,
    today?: Date,
): { cold: PositionedRoadmap; warm: PositionedRoadmap } {
    const options = today ? { today } : {};
    setScheduleWarmStart(false);
    let cold: PositionedRoadmap;
    try {
        cold = layoutRoadmap(file, resolved, options);
    } finally {
        setScheduleWarmStart(true);
    }
    return { cold, warm: layoutRoadmap(file, resolved, options) };
}

afterEach(() => setScheduleWarmStart(true));

describe('warm start from the day schedule (scheduler-unification F4)', () => {
    const samples = waveSamples();

    it('finds the wave samples', () => {
        expect(samples).toContain('examples/waves.nowline');
        expect(samples).toContain('tests/waves-isolate.nowline');
    });

    it.each(samples)('%s: same layout in fewer barrier passes', async (rel) => {
        const abs = path.join(REPO, rel);
        const source = await readFile(abs, 'utf8');
        const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
        const { cold, warm } = layBoth(file, resolved, TODAY);
        expect(placement(warm)).toBe(placement(cold));
        expect(cold.waveSolve?.capped).toBe(false);
        expect(warm.waveSolve?.capped).toBe(false);
        // A cold solve that converges in one pass (no item in any wave, as in
        // tests/waves-all-empty) leaves the warm start nothing to save.
        const coldPasses = cold.waveSolve?.passes ?? 0;
        if (coldPasses > 1) expect(warm.waveSolve?.passes ?? 0).toBeLessThan(coldPasses);
        else expect(warm.waveSolve?.passes ?? 0).toBe(coldPasses);
    });

    it('same layout in no more barrier passes on the 60 generated roadmaps', async () => {
        const rand = mulberry32(0x5eed);
        let saved = 0;
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            const { cold, warm } = layBoth(file, resolved);
            expect(placement(warm), gen.source).toBe(placement(cold));
            expect(warm.waveSolve?.capped, gen.source).toBe(false);
            expect(warm.waveSolve?.passes ?? 0, gen.source).toBeLessThanOrEqual(
                cold.waveSolve?.passes ?? 0,
            );
            saved += (cold.waveSolve?.passes ?? 0) - (warm.waveSolve?.passes ?? 0);
        }
        expect(saved).toBeGreaterThan(0);
    });
});
