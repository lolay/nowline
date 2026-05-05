#!/usr/bin/env node
// Render every example listed below to a sibling SVG file, then to a sibling
// PNG when @nowline/cli supports it. Written for the m2d..m2h sample-fidelity
// iteration loop: pair `examples/<slug>.{nowline,svg}` with the hand-built
// reference at `specs/samples/<slug>.svg` and eyeball the diff via
// `scripts/compare-samples.html`.
//
// Usage: node scripts/render-samples.mjs [slug ...]
//
// With no positional arguments, renders every entry in MANIFEST. With one or
// more slug arguments, renders only matching entries (useful while iterating
// on a single milestone).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cliPath = resolve(repoRoot, 'packages/cli/dist/index.js');

// One entry per render. `now` seeds the now-line so the output matches the
// vertical line position in the corresponding `specs/samples/<slug>.svg`
// (where one exists). All examples share `start: 2026-01-05` (Monday, week
// 2) and `now: 2026-02-09` (Monday, ~5 weeks in) so the now-line lands at
// the same column across every diagram and `status:done` / `in-progress` /
// `at-risk` items are visibly distinguishable.
const NOW = '2026-02-09';
const MANIFEST = [
    { slug: 'minimal',             source: 'examples/minimal.nowline',         theme: 'light', now: NOW },
    { slug: 'platform-2026',       source: 'examples/platform-2026.nowline',   theme: 'light', now: NOW },
    { slug: 'platform-2026-dark',  source: 'examples/platform-2026.nowline',   theme: 'dark',  now: NOW },
    { slug: 'dependencies',        source: 'examples/dependencies.nowline',    theme: 'light', now: NOW },
    { slug: 'isolate-include',     source: 'examples/isolate-include.nowline', theme: 'light', now: NOW },
    { slug: 'long',                source: 'examples/long.nowline',            theme: 'light', now: NOW },
    { slug: 'nested',              source: 'examples/nested.nowline',          theme: 'light', now: NOW },
    { slug: 'nested-both-headers', source: 'examples/nested-both-headers.nowline', theme: 'light', now: NOW },
    { slug: 'partner',             source: 'examples/partner.nowline',         theme: 'light', now: NOW },
    { slug: 'product',             source: 'examples/product.nowline',         theme: 'light', now: NOW },
    { slug: 'teams',               source: 'examples/teams.nowline',           theme: 'light', now: NOW },
    { slug: 'capacity-items',      source: 'examples/capacity-items.nowline',  theme: 'light', now: NOW },
    { slug: 'capacity-lanes',      source: 'examples/capacity-lanes.nowline',  theme: 'light', now: NOW },
    { slug: 'size-and-capacity',   source: 'examples/size-and-capacity.nowline', theme: 'light', now: NOW },
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
    const sourceAbs = resolve(repoRoot, entry.source);
    if (!existsSync(sourceAbs)) {
        console.warn(`skip ${entry.slug}: missing source ${entry.source}`);
        return;
    }
    const outRel = `examples/${entry.slug}.svg`;
    const args = [
        cliPath,
        entry.source,
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
