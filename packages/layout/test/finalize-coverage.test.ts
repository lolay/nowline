// The finalize coverage register (specs/layout-phases.md §6, m5.s4). Every
// sample under `examples/` and `tests/` is laid out with the finalize
// trace installed, which records for each step whether it changed
// something on that sample: the canvas grew (f1, f3), the axis was
// extended (f2), a width differs from the natural canvas's (f4), a
// pre-packed marker moved (f5), a milestone's marker row moved (f6), the
// band grew (f7), or the step built something (f8 to f16; f15 counts the
// beside header, f16 every sample). The result is compared with
// `finalize-coverage.json`. A refactor that silently stops a step from
// firing fails, and so does a sample edit that changes which samples a
// step fires on: update the register, and when a step loses its last
// sample, add a fixture that keeps it covered.
//
// Samples are laid out the way `nowline <file> --now 2026-02-09` lays them
// out in the light theme, as the G1 gate renders them.

import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { FINALIZE_STEPS, setFinalizeTrace } from '../src/phases/finalize.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REGISTER_PATH = path.join(HERE, 'finalize-coverage.json');

/** The `--now` every sample is laid out with (the G1 gate's date). */
const TODAY = new Date(Date.UTC(2026, 1, 9));

interface Register {
    /** Step name → the samples it changes something on (repo-relative, `/`, sorted) and their count. */
    steps: Record<string, { count: number; samples: string[] }>;
}

/** Every `examples/**.nowline` and `tests/*.nowline`, repo-relative, sorted. */
function sampleFiles(): string[] {
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
    return out.sort();
}

/** The steps that changed something when `rel` is laid out. */
async function stepsThatFire(rel: string): Promise<Set<string>> {
    const fired = new Set<string>();
    const abs = path.join(REPO, rel);
    const source = await readFile(abs, 'utf8');
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    setFinalizeTrace((step, changed) => {
        if (changed) fired.add(step);
    });
    try {
        layoutRoadmap(file, resolved, { today: TODAY });
    } finally {
        setFinalizeTrace(undefined);
    }
    return fired;
}

afterEach((): void => {
    setFinalizeTrace(undefined);
});

describe('finalize coverage register (specs/layout-phases.md §6)', () => {
    const samples = sampleFiles();

    it('finds the corpus', (): void => {
        expect(samples.length).toBeGreaterThanOrEqual(60);
    });

    it('names every finalize step, in order', (): void => {
        const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as Register;
        expect(Object.keys(register.steps)).toEqual(FINALIZE_STEPS.map((s) => s.name));
        for (const [step, entry] of Object.entries(register.steps)) {
            expect(entry.count, step).toBe(entry.samples.length);
        }
    });

    it('records which steps change something on each sample', async (): Promise<void> => {
        const actual: Register['steps'] = {};
        for (const step of FINALIZE_STEPS) actual[step.name] = { count: 0, samples: [] };
        for (const sample of samples) {
            for (const step of await stepsThatFire(sample)) {
                actual[step].samples.push(sample);
                actual[step].count++;
            }
        }
        const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as Register;
        expect(actual).toEqual(register.steps);
    }, 120_000);

    it('keeps every step covered by at least one sample', (): void => {
        const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8')) as Register;
        const uncovered = Object.entries(register.steps)
            .filter(([, entry]) => entry.count === 0)
            .map(([step]) => step);
        expect(uncovered).toEqual([]);
    });
});
