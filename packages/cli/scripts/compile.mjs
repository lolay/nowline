#!/usr/bin/env node
// Compile the CLI into standalone binaries for the six supported targets.
// Uses `bun build --compile`. Requires bun to be installed; delegates errors
// from bun rather than attempting a polyfill.
//
// One binary per platform: `nowline-<suffix>`. Bundles every `@nowline/export-*`
// package — see `specs/cli-distribution.md` for the rationale (the bun runtime
// dominates compiled binary size; a tiny/full split paid only ~5% size dividend
// for the cost of doubled CI/release/distribution channels).

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

// Per-target size ceilings (MB). Bun's standalone runtime varies by ~50 MB
// across targets — darwin-arm64 ships ~60 MB, linux-x64 with glibc compat
// shims is ~95 MB, and windows-x64 is ~110 MB. A single global ceiling would
// either let darwin regressions slide or fail every Linux/Windows build, so
// each target carries its own budget = (currently measured size) + ~6–10 MB
// headroom for future bun-runtime growth and modest exporter additions.
// Tight by design: a breach should trigger the conversation called out in
// `specs/cli-distribution.md` "Size budget", not be silently absorbed.
//
// Last measured (bun 1.3.13) using --target on macOS-arm64:
//   darwin-arm64=70  darwin-x64=75  linux-arm64=107  linux-x64=107
//   windows-arm64=119  windows-x64=122
const ALL_TARGETS = [
    { id: 'bun-darwin-arm64', suffix: 'macos-arm64', maxMb: 80 },
    { id: 'bun-darwin-x64', suffix: 'macos-x64', maxMb: 85 },
    { id: 'bun-linux-x64', suffix: 'linux-x64', maxMb: 115 },
    { id: 'bun-linux-arm64', suffix: 'linux-arm64', maxMb: 115 },
    { id: 'bun-windows-x64', suffix: 'windows-x64.exe', maxMb: 130 },
    { id: 'bun-windows-arm64', suffix: 'windows-arm64.exe', maxMb: 125 },
];

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
    if (!safeStat(outDir)) {
        mkdirSync(outDir, { recursive: true });
    } else {
        for (const name of readdirSync(outDir)) {
            if (name.startsWith('nowline-')) {
                rmSync(path.join(outDir, name), { force: true });
            }
        }
    }

    const entry = path.join(packageRoot, 'dist', 'index.js');
    if (!safeStat(entry)) {
        console.error(
            `error: expected ${path.relative(packageRoot, entry)} to exist; run \`pnpm build\` first.`,
        );
        process.exit(1);
    }

    let failed = 0;
    for (const tgt of targets) {
        const outName = `nowline-${tgt.suffix}`;
        const outPath = path.join(outDir, outName);
        console.log(`compiling ${tgt.id} -> ${path.relative(packageRoot, outPath)}`);
        const args = ['build', entry, '--compile', '--target', tgt.id, '--outfile', outPath];
        const result = spawnSync('bun', args, { stdio: 'inherit', cwd: packageRoot });
        if (result.status !== 0) {
            console.error(`  FAILED ${tgt.id}`);
            failed += 1;
        }
    }

    const targetBySuffix = new Map(ALL_TARGETS.map((t) => [`nowline-${t.suffix}`, t]));
    for (const entryName of readdirSync(outDir)) {
        if (!entryName.startsWith('nowline-')) continue;
        const tgt = targetBySuffix.get(entryName);
        if (!tgt) continue; // unknown artifact; size budget is per known target
        const p = path.join(outDir, entryName);
        const size = statSync(p).size;
        const mb = (size / 1024 / 1024).toFixed(1);
        const maxBytes = tgt.maxMb * 1024 * 1024;
        console.log(`  ${entryName}: ${mb} MB (max ${tgt.maxMb} MB)`);
        if (size > maxBytes) {
            console.error(`    ERROR: ${entryName} is larger than ${tgt.maxMb} MB (${mb} MB).`);
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
