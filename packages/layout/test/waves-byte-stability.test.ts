// Byte stability without waves (specs/waves.md §8.9): a positioned model
// built from a roadmap that declares no waves carries none of the wave
// keys, at any depth. Every new field is optional and omitted (never
// `undefined` or `[]`), so a generic key walk over each `examples/` file is
// the check; `'key' in obj` also catches a key set to `undefined`. Examples
// that declare waves (waves.nowline, waves-program.nowline) are skipped: they
// exist to carry the keys.

import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { parseAndResolve } from './helpers.js';

const EXAMPLES_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../examples',
);

/** Every wave key the positioned model may carry (§8.7). */
const WAVE_KEYS = [
    'waves',
    'waveSolve',
    'waveBoundaries',
    'waveCrossings',
    'waveLegend',
    'waveStrip',
    'waveRole',
    'waveTooltip',
    'wavePinOverride',
    'onWaveBoundary',
    'overrunByWave',
    'waveOnly',
];

/** The paths (`a.b[2].c`) of every wave key anywhere in `root`. */
function waveKeyPaths(root: unknown): string[] {
    const found: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (value: unknown, at: string): void => {
        if (value === null || typeof value !== 'object' || value instanceof Date) return;
        if (seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) {
            value.forEach((v, i) => {
                walk(v, `${at}[${i}]`);
            });
            return;
        }
        for (const key of Object.keys(value)) {
            if (WAVE_KEYS.includes(key)) found.push(at ? `${at}.${key}` : key);
            walk((value as Record<string, unknown>)[key], at ? `${at}.${key}` : key);
        }
    };
    walk(root, '');
    return found;
}

// The wave examples are the only ones that declare waves. Named, not
// matched, so a new example can never drop out of this check by accident.
const WAVE_EXAMPLES = new Set(['waves.nowline', 'waves-program.nowline']);

const exampleFiles = readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.nowline'))
    .filter((f) => !WAVE_EXAMPLES.has(f))
    .sort();

async function layExample(name: string) {
    const abs = path.join(EXAMPLES_DIR, name);
    const source = await readFile(abs, 'utf8');
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    return { file, resolved, model: layoutRoadmap(file, resolved) };
}

describe('positioned model without waves (specs/waves.md §8.9)', () => {
    it('finds the examples', () => {
        expect(exampleFiles.length).toBeGreaterThan(5);
    });

    it('skips only examples that declare waves', () => {
        for (const name of WAVE_EXAMPLES) {
            expect(readFileSync(path.join(EXAMPLES_DIR, name), 'utf8')).toMatch(/^wave\s/m);
        }
    });

    it.each(exampleFiles)('%s carries no wave keys', async (name) => {
        const { resolved, model } = await layExample(name);
        expect(resolved.content.waves?.size ?? 0).toBe(0);
        expect(waveKeyPaths(model)).toEqual([]);
    });

    it('the key walk finds wave keys in a roadmap with waves (control)', async () => {
        // A background bar across the w1/w2 boundary, so the model carries
        // boundaries, crossings and a legend as well as the waves.
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane a
  item a1 duration:1w wave:w1
  item a2 duration:1w wave:w2
  group wave:w2
    item a3 duration:1w
swimlane b
  item b1 duration:3w
`);
        const paths = waveKeyPaths(layoutRoadmap(file, resolved));
        expect(paths).toEqual(
            expect.arrayContaining([
                'timeline.waveStrip',
                'waves',
                'waveSolve',
                'waveBoundaries',
                'waveCrossings',
                'waveLegend',
                'swimlanes[0].children[0].waveRole',
                'swimlanes[1].children[0].waveRole',
                'swimlanes[1].children[0].waveTooltip',
                'swimlanes[0].children[2].waveOnly',
            ]),
        );
    });
});
