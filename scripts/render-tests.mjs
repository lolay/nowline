#!/usr/bin/env node
// Render every renderer-validation fixture under tests/ to a sibling SVG.
// Mirrors scripts/render-samples.mjs but scoped to the tests/ harness — the
// fixtures here exist to make a single layout / rendering axis visible at a
// glance, not to mirror a hand-built reference.
//
// Usage: node scripts/render-tests.mjs [slug ...]
//
// With no positional arguments, renders every entry in MANIFEST. With one or
// more slug arguments, renders only matching entries (useful while iterating
// on a single fixture).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { assertDistFresh } from './lib/check-dist-fresh.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cliPath = resolve(repoRoot, 'packages/cli/dist/index.js');

// `now` is pinned per-fixture so the now-line lands at a stable, useful spot
// regardless of when the script runs. All starter fixtures share the same
// canonical window as the demos in `scripts/render-samples.mjs`
// (`start: 2026-01-05`, `now: 2026-02-09`) so a side-by-side compare lines
// up date columns across the harness and the demos.
//
// `defaults-no-start-no-now` is the deliberate exception: it omits both
// `start:` (in the source) and `now` (here) so the rendered output exercises
// the layout's "no start \u2192 today" + renderer's "no --now \u2192 today"
// defaults. Its rendered SVG drifts every day, so it's intentionally NOT a
// snapshot fixture.
const NOW = '2026-02-09';
const MANIFEST = [
    { slug: 'large-roadmap-title',     theme: 'light', now: NOW },
    { slug: 'large-swimlane-title',    theme: 'light', now: NOW },
    { slug: 'text-fits-inside-bars',   theme: 'light', now: NOW },
    { slug: 'text-spills-right',       theme: 'light', now: NOW },
    { slug: 'item-bumps-up',           theme: 'light', now: NOW },
    { slug: 'isolate-include-multi',   theme: 'light', now: NOW },
    { slug: 'defaults-no-start-no-now', theme: 'light' },
    { slug: 'capacity-items',          theme: 'light', now: NOW },
    { slug: 'capacity-lanes',          theme: 'light', now: NOW },
    { slug: 'size-and-capacity',       theme: 'light', now: NOW },
    { slug: 'utilization-states',      theme: 'light', now: NOW },
    { slug: 'nested-both-headers',     theme: 'light', now: NOW },
];

function run(cmd, args, opts = {}) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
        child.on('error', rejectRun);
        child.on('exit', (code) => {
            if (code === 0) resolveRun();
            else rejectRun(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
        });
    });
}

async function renderOne(entry) {
    const sourceRel = `tests/${entry.slug}.nowline`;
    const sourceAbs = resolve(repoRoot, sourceRel);
    if (!existsSync(sourceAbs)) {
        console.warn(`skip ${entry.slug}: missing source ${sourceRel}`);
        return;
    }
    const outRel = `tests/${entry.slug}.svg`;
    const args = [
        cliPath,
        sourceRel,
        '-o', outRel,
        '--theme', entry.theme,
    ];
    if (entry.now) args.push('--now', entry.now);
    console.log(`render ${entry.slug} (${entry.theme}) -> ${outRel}`);
    await run(process.execPath, args);
}

async function main() {
    if (!existsSync(cliPath)) {
        console.error(`error: CLI not built. Run \`pnpm -r --workspace-concurrency=1 run build\` first.`);
        console.error(`       expected ${relative(repoRoot, cliPath)}`);
        process.exit(2);
    }
    assertDistFresh({ repoRoot, cliPath });
    const wanted = process.argv.slice(2);
    const entries = wanted.length === 0
        ? MANIFEST
        : MANIFEST.filter((e) => wanted.includes(e.slug));
    if (entries.length === 0) {
        console.error(`error: no matching entries for ${wanted.join(', ')}`);
        console.error(`       available slugs: ${MANIFEST.map((e) => e.slug).join(', ')}`);
        process.exit(2);
    }
    for (const entry of entries) {
        await renderOne(entry);
    }
}

main().catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
});
