#!/usr/bin/env node
// Aggregator: render every example under examples/ and every fixture under
// tests/ to sibling SVG files. Wired into the root `pnpm build` so a fresh
// build always emits a fresh set of inspectable SVGs. Set
// NOWLINE_SKIP_RENDER=1 to short-circuit (handy while iterating on a broken
// renderer).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const STEPS = ['scripts/render-samples.mjs', 'scripts/render-tests.mjs'];

function run(scriptRel) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(process.execPath, [resolve(repoRoot, scriptRel)], {
            stdio: 'inherit',
            cwd: repoRoot,
        });
        child.on('error', rejectRun);
        child.on('exit', (code) => {
            if (code === 0) resolveRun();
            else rejectRun(new Error(`${scriptRel} exited with code ${code}`));
        });
    });
}

async function main() {
    if (process.env.NOWLINE_SKIP_RENDER === '1') {
        console.log('NOWLINE_SKIP_RENDER set — skipping render of examples/ and tests/');
        return;
    }
    for (const step of STEPS) {
        await run(step);
    }
}

main().catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
});
