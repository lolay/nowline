#!/usr/bin/env node
// Computes a canary pre-release version and rewrites every workspace
// package to it. Used by the `snapshot-version` Make target and
// `.github/workflows/canary.yml`.
//
// Version format:
//   0.0.0-dev.<UTC YYYYMMDDHHMMSS>.g<shortsha>
//
// This sorts strictly below every real release (0.0.0 < 0.0.1, and
// the pre-release suffix makes 0.0.0-dev.* < 0.0.0), so it can never
// satisfy a ^X.Y range off the `latest` dist-tag — no prod leakage.
// Consumers must opt in with the `next` dist-tag or an exact pin.
//
// Usage:
//   node .github/scripts/snapshot-version.mjs
//
// Env vars (all optional — fall back to git / wall clock):
//   GITHUB_SHA          full commit SHA; sliced to 7 chars for <sha>
//   NOWLINE_SNAPSHOT_SHA short SHA override (takes precedence over GITHUB_SHA)
//   NOWLINE_SNAPSHOT_TS  ISO-8601 or YYYYMMDDHHMMSS timestamp override
//
// Behaviour:
//   - Computes the snapshot version string.
//   - Rewrites every packages/<pkg>/package.json `version` field
//     using the same regex-preserving approach as bump-version.mjs
//     (never round-trips through JSON.parse to avoid noisy diffs).
//   - Prints the version (without trailing newline) to stdout so the
//     calling shell can capture it: `VERSION=$(make snapshot-version)`.
//   - All warnings go to stderr.
//   - Never commits anything — the rewrite is ephemeral and is meant
//     to be discarded after `pnpm pack` has stamped the tarballs.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const packagesDir = join(repoRoot, 'packages');

function resolveSha() {
    const override = process.env.NOWLINE_SNAPSHOT_SHA;
    if (override && override.length >= 7) return override.slice(0, 7);
    const fromEnv = process.env.GITHUB_SHA;
    if (fromEnv && fromEnv.length >= 7) return fromEnv.slice(0, 7);
    try {
        return execSync('git rev-parse --short=7 HEAD', {
            cwd: repoRoot,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    } catch {
        return 'unknown';
    }
}

function resolveTimestamp() {
    const override = process.env.NOWLINE_SNAPSHOT_TS;
    if (override) {
        // Accept YYYYMMDDHHMMSS already, or an ISO-8601 string.
        const normalized = override.replace(/[-:TZ.]/g, '').slice(0, 14);
        if (/^\d{14}$/.test(normalized)) return normalized;
    }
    const now = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return (
        `${now.getUTCFullYear()}` +
        `${pad(now.getUTCMonth() + 1)}` +
        `${pad(now.getUTCDate())}` +
        `${pad(now.getUTCHours())}` +
        `${pad(now.getUTCMinutes())}` +
        `${pad(now.getUTCSeconds())}`
    );
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
    // (indentation, trailing newlines) intact; round-tripping through
    // JSON.parse/stringify would normalise and produce a noisy diff.
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
    const sha = resolveSha();
    const ts = resolveTimestamp();
    const version = `0.0.0-dev.${ts}.g${sha}`;

    const packages = listPackageJsons();
    if (packages.length === 0) {
        process.stderr.write(`no packages found under ${packagesDir}\n`);
        process.exit(1);
    }

    for (const path of packages) {
        rewriteVersion(path, version);
        process.stderr.write(`snapshot ${path} -> ${version}\n`);
    }

    process.stdout.write(version);
}

main();
