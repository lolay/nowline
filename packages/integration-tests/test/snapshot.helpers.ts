// Sample-snapshot harness for byte-stable validation across the m2.5
// layout-engine refactor.
//
// `renderSampleSvg` runs the full production pipeline (parse → resolve
// → layoutRoadmap → renderSvg) on a `examples/*.nowline` or `tests/*.nowline`
// file with a
// fixed `today` so the output stays deterministic. The accompanying
// `snapshot.test.ts` writes the SVG to `test/__snapshots__/` on first
// run and asserts byte-equality on every subsequent run; refactors that
// preserve behavior pass without touching the snapshot files.
//
// To intentionally update the baselines (e.g. after a deliberate
// visual change), set `UPDATE_LAYOUT_SNAPSHOTS=1` and re-run the suite.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    resolveIncludes,
} from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';

let cached:
    | { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices }
    | undefined;

function getServices() {
    if (!cached) {
        cached = createNowlineServices();
    }
    return cached;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

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
    /** Basename of the `.nowline` source under `dir`. */
    sourceFile: string;
    /** `examples` (default) or `tests` — root for `sourceFile`. */
    dir?: 'examples' | 'tests';
    /** Theme to render with. */
    theme: ThemeName;
    /**
     * Optional locale override. Mirrors the CLI `--locale` flag — slots in
     * above the file's `nowline v1 locale:` directive. Omit to let the
     * directive (or `en-US` default) win.
     */
    locale?: string;
}

function sourceRoot(spec: SampleSpec): string {
    return spec.dir === 'tests' ? TESTS_DIR : EXAMPLES_DIR;
}

export const SAMPLES: SampleSpec[] = [
    { name: 'minimal', sourceFile: 'minimal.nowline', theme: 'light' },
    { name: 'platform-2026', sourceFile: 'platform-2026.nowline', theme: 'light' },
    { name: 'platform-2026-dark', sourceFile: 'platform-2026.nowline', theme: 'dark' },
    { name: 'dependencies', sourceFile: 'dependencies.nowline', theme: 'light' },
    { name: 'isolate-include', sourceFile: 'isolate-include.nowline', theme: 'light' },
    {
        name: 'nested-both-headers',
        sourceFile: 'nested-both-headers.nowline',
        dir: 'tests',
        theme: 'light',
    },
    // m6: pins every shape of `capacity:` + `capacity-icon:` for items (matrix in tests/).
    { name: 'capacity-items', sourceFile: 'capacity-items.nowline', dir: 'tests', theme: 'light' },
    // m7: lane-level `capacity:N` badges across the same icon matrix.
    { name: 'capacity-lanes', sourceFile: 'capacity-lanes.nowline', dir: 'tests', theme: 'light' },
    { name: 'capacity', sourceFile: 'capacity.nowline', theme: 'light' },
    { name: 'sizing', sourceFile: 'sizing.nowline', theme: 'light' },
    // m2m localization: French sample exercises the now-pill, axis labels,
    // and quarter prefix under a non-default locale. Source file already
    // declares `locale:fr-CA` on the directive — no override needed.
    { name: 'minimal-fr', sourceFile: 'minimal.fr.nowline', theme: 'light' },
];

export async function renderSampleSvg(spec: SampleSpec): Promise<string> {
    const { shared, Nowline } = getServices();
    const absSource = path.join(sourceRoot(spec), spec.sourceFile);
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
        locale: spec.locale,
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
