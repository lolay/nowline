#!/usr/bin/env node
// Compile the CLI into standalone binaries for the six supported targets.
// Uses `bun build --compile`. Requires bun to be installed; delegates errors
// from bun rather than attempting a polyfill.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

const ALL_TARGETS = [
    { id: 'bun-darwin-arm64', suffix: 'macos-arm64' },
    { id: 'bun-darwin-x64', suffix: 'macos-x64' },
    { id: 'bun-linux-x64', suffix: 'linux-x64' },
    { id: 'bun-linux-arm64', suffix: 'linux-arm64' },
    { id: 'bun-windows-x64', suffix: 'windows-x64.exe' },
    { id: 'bun-windows-arm64', suffix: 'windows-arm64.exe' },
];

const MAX_BYTES = 60 * 1024 * 1024;

function parseArgs(argv) {
    const out = { target: 'all' };
    for (const arg of argv.slice(2)) {
        if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length);
    }
    return out;
}

function pickTargets(selector) {
    if (selector === 'all') return ALL_TARGETS;
    if (selector === 'local') {
        const platformMap = {
            'darwin/arm64': 'bun-darwin-arm64',
            'darwin/x64': 'bun-darwin-x64',
            'linux/x64': 'bun-linux-x64',
            'linux/arm64': 'bun-linux-arm64',
            'win32/x64': 'bun-windows-x64',
            'win32/arm64': 'bun-windows-arm64',
        };
        const key = `${process.platform}/${process.arch}`;
        const id = platformMap[key];
        if (!id) throw new Error(`Unsupported local platform: ${key}`);
        return ALL_TARGETS.filter((t) => t.id === id);
    }
    const match = ALL_TARGETS.filter((t) => t.id === selector || t.suffix === selector);
    if (match.length === 0) throw new Error(`Unknown --target: ${selector}`);
    return match;
}

function main() {
    const { target } = parseArgs(process.argv);
    const targets = pickTargets(target);
    const outDir = path.join(packageRoot, 'dist-bin');
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const entry = path.join(packageRoot, 'dist', 'index.js');
    if (!safeStat(entry)) {
        console.error(`error: expected ${path.relative(packageRoot, entry)} to exist; run \`pnpm build\` first.`);
        process.exit(1);
    }

    let failed = 0;
    for (const tgt of targets) {
        const outName = `nowline-${tgt.suffix}`;
        const outPath = path.join(outDir, outName);
        console.log(`compiling ${tgt.id} -> ${path.relative(packageRoot, outPath)}`);
        const result = spawnSync(
            'bun',
            ['build', entry, '--compile', '--target', tgt.id, '--outfile', outPath],
            { stdio: 'inherit', cwd: packageRoot },
        );
        if (result.status !== 0) {
            console.error(`  FAILED ${tgt.id}`);
            failed += 1;
            continue;
        }
    }

    for (const entryName of readdirSync(outDir)) {
        const p = path.join(outDir, entryName);
        const size = statSync(p).size;
        const mb = (size / 1024 / 1024).toFixed(1);
        console.log(`  ${entryName}: ${mb} MB`);
        if (size > MAX_BYTES) {
            console.error(`    ERROR: ${entryName} is larger than 60 MB (${mb} MB).`);
            failed += 1;
        }
    }

    process.exit(failed === 0 ? 0 : 1);
}

function safeStat(p) {
    try {
        return statSync(p);
    } catch {
        return undefined;
    }
}

main();
