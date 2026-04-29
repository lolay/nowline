#!/usr/bin/env node
// Compile the CLI into standalone binaries for the six supported targets.
// Uses `bun build --compile`. Requires bun to be installed; delegates errors
// from bun rather than attempting a polyfill.
//
// Two variants are produced from the same source tree (m2c § 11):
//   tiny  — bundles only @nowline/export-core + @nowline/export-png; the five
//           optional export packages are passed via `--external` so dynamic
//           imports of them fail at runtime with the "install nowline-full"
//           message. Output: nowline-<suffix>.
//   full  — bundles every @nowline/export-* package. Output:
//           nowline-full-<suffix>.
//
// Defaults to --variant=tiny for backwards-compat with the m2a release flow.

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

// Tiny: 60 MB. Full: 65 MB. m2c § 11 + m2a unchanged ceiling.
const TINY_MAX_BYTES = 60 * 1024 * 1024;
const FULL_MAX_BYTES = 65 * 1024 * 1024;

const TINY_EXTERNALS = [
    '@nowline/export-pdf',
    '@nowline/export-html',
    '@nowline/export-mermaid',
    '@nowline/export-xlsx',
    '@nowline/export-msproj',
];

function parseArgs(argv) {
    const out = { target: 'all', variant: 'tiny' };
    for (const arg of argv.slice(2)) {
        if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length);
        else if (arg.startsWith('--variant=')) out.variant = arg.slice('--variant='.length);
    }
    if (out.variant !== 'tiny' && out.variant !== 'full') {
        throw new Error(`--variant must be 'tiny' or 'full' (got '${out.variant}')`);
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

function binaryName(variant, suffix) {
    return variant === 'full' ? `nowline-full-${suffix}` : `nowline-${suffix}`;
}

function externalsFor(variant) {
    return variant === 'tiny' ? TINY_EXTERNALS : [];
}

function maxBytesFor(variant) {
    return variant === 'tiny' ? TINY_MAX_BYTES : FULL_MAX_BYTES;
}

function main() {
    const { target, variant } = parseArgs(process.argv);
    const targets = pickTargets(target);
    const outDir = path.join(packageRoot, 'dist-bin');
    // We *don't* clear dist-bin between variants — the release flow runs
    // `--variant=tiny` and `--variant=full` back-to-back and expects both to
    // coexist. Instead, only remove existing files matching the current
    // variant's prefix so re-runs are idempotent.
    if (!safeStat(outDir)) {
        mkdirSync(outDir, { recursive: true });
    } else {
        const prefix = variant === 'full' ? 'nowline-full-' : 'nowline-';
        for (const name of readdirSync(outDir)) {
            // Don't accidentally delete `nowline-full-...` when prefix is
            // `nowline-` — startsWith would falsely match.
            if (variant === 'tiny' && name.startsWith('nowline-full-')) continue;
            if (name.startsWith(prefix)) {
                rmSync(path.join(outDir, name), { force: true });
            }
        }
    }

    const entry = path.join(packageRoot, 'dist', 'index.js');
    if (!safeStat(entry)) {
        console.error(`error: expected ${path.relative(packageRoot, entry)} to exist; run \`pnpm build\` first.`);
        process.exit(1);
    }

    const externals = externalsFor(variant);
    const maxBytes = maxBytesFor(variant);

    let failed = 0;
    for (const tgt of targets) {
        const outName = binaryName(variant, tgt.suffix);
        const outPath = path.join(outDir, outName);
        console.log(`compiling ${tgt.id} (${variant}) -> ${path.relative(packageRoot, outPath)}`);
        const args = [
            'build',
            entry,
            '--compile',
            '--target', tgt.id,
            '--outfile', outPath,
        ];
        for (const ext of externals) {
            args.push('--external', ext);
        }
        const result = spawnSync('bun', args, { stdio: 'inherit', cwd: packageRoot });
        if (result.status !== 0) {
            console.error(`  FAILED ${tgt.id}`);
            failed += 1;
            continue;
        }
    }

    // Print sizes for *only this variant's* binaries; verify against ceiling.
    const variantPrefix = variant === 'full' ? 'nowline-full-' : 'nowline-';
    for (const entryName of readdirSync(outDir)) {
        if (variant === 'tiny' && entryName.startsWith('nowline-full-')) continue;
        if (!entryName.startsWith(variantPrefix)) continue;
        const p = path.join(outDir, entryName);
        const size = statSync(p).size;
        const mb = (size / 1024 / 1024).toFixed(1);
        console.log(`  ${entryName}: ${mb} MB`);
        if (size > maxBytes) {
            const ceilingMb = (maxBytes / 1024 / 1024).toFixed(0);
            console.error(`    ERROR: ${entryName} is larger than ${ceilingMb} MB (${mb} MB).`);
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
