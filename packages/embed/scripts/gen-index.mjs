#!/usr/bin/env node

// CDN index and demo-page generator.
//
// Runs after build-cdn-history.mjs has populated the Firebase `public/` tree
// with bundle files. Writes:
//
//   public/index.html               root index listing all hosted versions
//   public/versions.json            machine-readable version manifest
//   public/{version}/index.html     demo page for every dir found in public/
//     where {version} covers X.Y.Z patches, X.Y minor aliases, and `latest`
//
// This script imports from scripts/lib/templates.mjs — the same functions
// used by the dev build (bundle.mjs) — so dev and prod demo pages are
// byte-for-byte identical for a given (version, builtAt) pair.
//
// The root index groups and annotates: latest and each X.Y alias are shown
// with their current resolution (e.g. "latest → 0.4.2", "0.4 → 0.4.2"),
// followed by the concrete X.Y.Z patches, indented under their minor group.
// Alias targets are derived deterministically from the patch set — no registry
// lookup needed — using the same highest-patch-per-minor rule that
// build-cdn-history.mjs uses when writing alias dirs.
//
// CLI
// ---
//   node gen-index.mjs \
//     --public <dir>        (required) Firebase `public/` dir populated by B1
//     --base-url <url>      (optional) CDN origin; default https://embed.nowline.io
//     --sha <sha>           (optional) git SHA for footer; default 'unknown'
//     --built-at <iso>      (optional) build timestamp; default new Date().toISOString()
//     --dry-run             (optional flag) log intended writes; skip actual I/O
//
// No new dependencies — semver ordering mirrors the tiny comparator already
// used in build-cdn-history.mjs.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderDemo, renderRootIndex } from './lib/templates.mjs';

const DEFAULT_BASE_URL = 'https://embed.nowline.io';
const BUNDLE = 'nowline.min.js';

const PATCH_RE = /^\d+\.\d+\.\d+$/;
const MINOR_RE = /^\d+\.\d+$/;

// ---- argument parsing -------------------------------------------------------

// Boolean flags that take no value.
const BOOL_FLAGS = new Set(['dry-run']);

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const tok = argv[i];
        if (!tok.startsWith('--')) {
            throw new Error(`unexpected argument "${tok}" (expected --key value)`);
        }
        const eq = tok.indexOf('=');
        if (eq !== -1) {
            args[tok.slice(2, eq)] = tok.slice(eq + 1);
            continue;
        }
        const key = tok.slice(2);
        if (BOOL_FLAGS.has(key)) {
            args[key] = true;
            continue;
        }
        const val = argv[i + 1];
        if (val === undefined || val.startsWith('--')) {
            throw new Error(`flag "${tok}" expects a value`);
        }
        args[key] = val;
        i++;
    }
    return args;
}

// ---- semver ordering --------------------------------------------------------

// Numeric tuple comparison — supports both X.Y.Z patch versions and X.Y
// minor keys (pads to three parts for a uniform comparator).
function semverTuple(v) {
    return v.split('.').map(Number);
}

// Returns -1 / 0 / 1. Suitable as an Array#sort comparator.
function compareVersions(a, b) {
    const pa = semverTuple(a);
    const pb = semverTuple(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db) return da < db ? -1 : 1;
    }
    return 0;
}

// ---- public/ tree scanning --------------------------------------------------

// Returns the dirs inside `publicDir` that have a bundle file, classified into
// { patches: string[], minorAliases: string[], hasLatest: boolean }.
// Unknown dirs (no bundle, or unrecognised name) are silently skipped — this
// ensures the generator is forward-compatible with any extra files/dirs.
function scanPublicDirs(publicDir) {
    const entries = readdirSync(publicDir, { withFileTypes: true });
    const patches = [];
    const minorAliases = [];
    let hasLatest = false;

    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const name = ent.name;
        if (!existsSync(join(publicDir, name, BUNDLE))) continue;

        if (name === 'latest') {
            hasLatest = true;
        } else if (PATCH_RE.test(name)) {
            patches.push(name);
        } else if (MINOR_RE.test(name)) {
            minorAliases.push(name);
        }
        // else: unrecognised dir — skip gracefully
    }

    return { patches, minorAliases, hasLatest };
}

// ---- alias target computation -----------------------------------------------

// Derives the canonical alias → target Map from the set of concrete patch
// versions. Each X.Y minor key maps to its highest patch; `latest` maps to
// the overall highest patch. Mirrors build-cdn-history.mjs's computeAliasTargets
// so gen-index produces annotations consistent with what B1 wrote to disk.
function computeAliasTargets(patches) {
    const minorBest = new Map();
    let latest = null;
    for (const v of patches) {
        const [maj, min] = v.split('.');
        const minor = `${maj}.${min}`;
        const cur = minorBest.get(minor);
        if (!cur || compareVersions(v, cur) > 0) minorBest.set(minor, v);
        if (!latest || compareVersions(v, latest) > 0) latest = v;
    }
    const targets = new Map(minorBest);
    if (latest) targets.set('latest', latest);
    return targets;
}

// ---- main -------------------------------------------------------------------

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const publicArg = args.public;
    if (!publicArg) throw new Error('missing required flag --public');
    const publicDir = resolve(publicArg);

    const baseUrl = (args['base-url'] ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const sha = args.sha ?? 'unknown';
    const builtAt = args['built-at'] ?? new Date().toISOString();
    const dryRun = Boolean(args['dry-run']);

    if (!existsSync(publicDir)) {
        throw new Error(`--public dir not found: ${publicDir}`);
    }

    // 1. Discover version dirs.
    const { patches, minorAliases: existingMinors, hasLatest } = scanPublicDirs(publicDir);
    if (patches.length === 0) {
        throw new Error(
            `no X.Y.Z dirs with ${BUNDLE} found under ${publicDir} — ` +
                'run build-cdn-history.mjs first',
        );
    }

    // Sort patches descending (newest first) — controls display order inside
    // each minor group in the root index.
    patches.sort((a, b) => -compareVersions(a, b));

    // 2. Compute canonical alias targets from the patch set.
    const aliases = computeAliasTargets(patches);

    // Emit helper — logs in both modes; skips I/O in dry-run.
    function emit(filePath, content) {
        const lines = content.split('\n').length;
        if (dryRun) {
            console.log(`[dry-run] ${filePath}  (${lines} lines, ${content.length} bytes)`);
        } else {
            mkdirSync(resolve(filePath, '..'), { recursive: true });
            writeFileSync(filePath, content, 'utf-8');
        }
    }

    // 3. Emit a demo index.html for every dir that has a bundle.
    //    Patches, minor aliases, and latest each get their own demo page.
    const allDirs = [
        ...(hasLatest ? ['latest'] : []),
        ...existingMinors.sort((a, b) => -compareVersions(a, b)),
        ...patches,
    ];

    for (const ver of allDirs) {
        const html = renderDemo({ version: ver, builtAt });
        emit(join(publicDir, ver, 'index.html'), html);
    }
    console.log(
        `${dryRun ? '[dry-run] would write' : 'wrote'} ${allDirs.length} demo index.html file(s)`,
    );

    // 4. Emit root index.html — grouped by minor, alias-annotated.
    //    `versions` is the patches-only array; renderRootIndex builds minor
    //    alias rows itself from the aliases Map.
    const rootHtml = renderRootIndex({ versions: patches, aliases, builtAt, sha, baseUrl });
    emit(join(publicDir, 'index.html'), rootHtml);
    console.log(`${dryRun ? '[dry-run] would write' : 'wrote'} public/index.html`);

    // 5. Emit versions.json — machine-readable manifest for downstream tooling.
    const manifest = {
        builtAt,
        sha,
        baseUrl,
        aliases: Object.fromEntries(aliases),
        // Concrete patch versions, newest first.
        versions: patches,
        // Every dir that received an index.html (in display order: latest, minors, patches).
        dirs: allDirs,
    };
    emit(join(publicDir, 'versions.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${dryRun ? '[dry-run] would write' : 'wrote'} public/versions.json`);

    // Summary for deploy logs.
    const aliasList = [...aliases.entries()].map(([k, v]) => `${k}\u2192${v}`).join(', ');
    console.log(
        `done: ${patches.length} patch(es), ${existingMinors.length} minor alias(es), ` +
            `latest=${hasLatest}, aliases=[${aliasList}]`,
    );
}

main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
});
