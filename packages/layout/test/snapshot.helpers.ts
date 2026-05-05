// Sample-snapshot harness for byte-stable validation across the m2.5
// layout-engine refactor.
//
// `renderSampleSvg` runs the full production pipeline (parse → resolve
// → layoutRoadmap → renderSvg) on an `examples/*.nowline` file with a
// fixed `today` so the output stays deterministic. The accompanying
// `snapshot.test.ts` writes the SVG to `test/__snapshots__/` on first
// run and asserts byte-equality on every subsequent run; refactors that
// preserve behavior pass without touching the snapshot files.
//
// To intentionally update the baselines (e.g. after a deliberate
// visual change), set `UPDATE_LAYOUT_SNAPSHOTS=1` and re-run the suite.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { URI } from 'langium';
import {
    createNowlineServices,
    resolveIncludes,
    type NowlineFile,
    type NowlineServices,
} from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '../src/index.js';
import { renderSvg } from '@nowline/renderer';

let cached: { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices } | undefined;

function getServices() {
    if (!cached) {
        cached = createNowlineServices();
    }
    return cached;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');

export const SNAPSHOT_DIR = path.join(import.meta.dirname, '__snapshots__');

/**
 * Fixed "today" for snapshot rendering. Aligned with the canonical
 * `now: 2026-02-09` used by `scripts/render-samples.mjs` and
 * `scripts/render-tests.mjs` so the snapshot output matches what
 * `pnpm render` produces in `examples/<slug>.svg`.
 */
export const FIXED_TODAY = new Date(Date.UTC(2026, 1, 9));

export interface SampleSpec {
    /** Snapshot file name (without extension). */
    name: string;
    /** `examples/<file>.nowline` to read. */
    sourceFile: string;
    /** Theme to render with. */
    theme: ThemeName;
}

export const SAMPLES: SampleSpec[] = [
    { name: 'minimal', sourceFile: 'minimal.nowline', theme: 'light' },
    { name: 'platform-2026', sourceFile: 'platform-2026.nowline', theme: 'light' },
    { name: 'platform-2026-dark', sourceFile: 'platform-2026.nowline', theme: 'dark' },
    { name: 'dependencies', sourceFile: 'dependencies.nowline', theme: 'light' },
    { name: 'isolate-include', sourceFile: 'isolate-include.nowline', theme: 'light' },
    // m6: pins the rendering of every shape of `capacity:` + `capacity-icon:`
    // combination for items. The companion `capacity-items.nowline` example
    // exercises default multiplier, built-in SVG icons, decimal/percent
    // values, inline Unicode literals, and declared custom glyphs.
    { name: 'capacity-items', sourceFile: 'capacity-items.nowline', theme: 'light' },
    // m7: pins the rendering of lane-level `capacity:N` badges in the frame
    // tab across the same icon matrix, plus owner-with-capacity stacking.
    { name: 'capacity-lanes', sourceFile: 'capacity-lanes.nowline', theme: 'light' },
];

export async function renderSampleSvg(spec: SampleSpec): Promise<string> {
    const { shared, Nowline } = getServices();
    const absSource = path.join(EXAMPLES_DIR, spec.sourceFile);
    const text = await fs.readFile(absSource, 'utf-8');
    const uri = URI.parse(`memory:///snapshot-${spec.name}.nowline`);
    const docFactory = shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, absSource, { services: Nowline });

    const model = layoutRoadmap(file, resolved, {
        theme: spec.theme,
        today: FIXED_TODAY,
    });
    return renderSvg(model);
}

export async function readSnapshot(name: string): Promise<string | null> {
    try {
        return await fs.readFile(path.join(SNAPSHOT_DIR, `${name}.svg`), 'utf-8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
    }
}

export async function writeSnapshot(name: string, svg: string): Promise<void> {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fs.writeFile(path.join(SNAPSHOT_DIR, `${name}.svg`), svg, 'utf-8');
}

export function isUpdateMode(): boolean {
    return process.env.UPDATE_LAYOUT_SNAPSHOTS === '1';
}
