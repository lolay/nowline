#!/usr/bin/env node
// Bumps the SemVer version of every workspace package + the VS Code
// extension to the next patch / minor / major. Used by the
// `cut-release` job in .github/workflows/release.yml.
//
// Usage:
//   node scripts/bump-version.mjs <patch|minor|major>
//
// Behaviour:
//   - Reads the current version from packages/cli/package.json (the
//     reference; all packages are kept lock-step).
//   - Computes the new version per SemVer.
//   - Rewrites every packages/<pkg>/package.json with the new version.
//   - Prints the new version (without `v` prefix) to stdout so the
//     calling shell can capture it (e.g. `NEW=$(node ...)`).
//   - Anything else (warnings, etc.) goes to stderr.
//
// Inter-package dependencies use `workspace:*` and are resolved by pnpm
// at publish time, so we deliberately do NOT rewrite dependency
// versions. Only the top-level `version` field is touched.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const packagesDir = join(repoRoot, 'packages');

const VALID_LEVELS = new Set(['patch', 'minor', 'major']);

function bump(version, level) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
    if (!match) {
        throw new Error(`unrecognized SemVer: ${version}`);
    }
    let [, maj, min, pat] = match.map(Number);
    if (level === 'major') {
        maj += 1;
        min = 0;
        pat = 0;
    } else if (level === 'minor') {
        min += 1;
        pat = 0;
    } else {
        pat += 1;
    }
    return `${maj}.${min}.${pat}`;
}

function listPackageJsons() {
    const out = [];
    for (const entry of readdirSync(packagesDir)) {
        const pkgJson = join(packagesDir, entry, 'package.json');
        try {
            if (statSync(pkgJson).isFile()) out.push(pkgJson);
        } catch {
            // not a package dir, skip
        }
    }
    return out;
}

function rewriteVersion(path, newVersion) {
    const original = readFileSync(path, 'utf8');
    // Only touch the top-level `version` field. A regex keeps formatting
    // (indentation, trailing newlines, comment-like JSON quirks) intact;
    // round-tripping through JSON.parse/stringify would normalize and
    // produce a noisy diff.
    const updated = original.replace(
        /("version"\s*:\s*")([^"]+)(")/,
        (_, pre, _old, post) => `${pre}${newVersion}${post}`,
    );
    if (updated === original) {
        throw new Error(`no version field found in ${path}`);
    }
    writeFileSync(path, updated);
}

function main() {
    const level = process.argv[2];
    if (!VALID_LEVELS.has(level)) {
        process.stderr.write(`usage: bump-version.mjs <patch|minor|major>\n`);
        process.exit(2);
    }

    const packages = listPackageJsons();
    if (packages.length === 0) {
        process.stderr.write(`no packages found under ${packagesDir}\n`);
        process.exit(1);
    }

    // Use the CLI as the source of truth — every package is kept
    // lock-step, so any of them would do.
    const cliPkgPath = join(packagesDir, 'cli', 'package.json');
    const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf8'));
    const currentVersion = cliPkg.version;
    const newVersion = bump(currentVersion, level);

    for (const path of packages) {
        rewriteVersion(path, newVersion);
        process.stderr.write(`bumped ${path} ${currentVersion} -> ${newVersion}\n`);
    }

    process.stdout.write(`${newVersion}\n`);
}

main();
