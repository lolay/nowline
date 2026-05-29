#!/usr/bin/env node

// Bundle-size gate for `@nowline/embed`. Runs in CI on every PR and
// reports a failure if the gzipped IIFE exceeds the budget.
//
// Two budgets, one per environment:
//
//   prod IIFE (dist/nowline.min.js)                   ≤ 175 KB gzipped
//   dev IIFE  (dist-cdn-dev/latest/nowline.min.js)    ≤ 220 KB gzipped
//
// The dev bundle additionally carries `firebase/app` + `firebase/auth`
// (tree-shaken to the popup sign-in path) so the allowlist gate can
// fire before the embed pings out to render — see specs/embed.md
// § Bootstrap status (dev auth gate). That payload adds ~25–30 KB
// gzipped on top of the prod payload; the 220 KB ceiling leaves
// headroom while still flagging unexpected growth.
//
// Also asserts:
//   - no `node:*` literal survived in either IIFE (the
//     `include-resolver.ts` browser-safety refactor in
//     packages/core/src/util/node-read-file.ts must keep holding),
//   - no `firebase` literal leaked into the *prod* IIFE (dead-code
//     elimination of the dev auth gate must keep holding).
//
// Budget rationale (prod): the m4 plan started at 150 KB gzipped (vs.
// Mermaid's ~200 KB). At first measurement the IIFE landed at ~163 KB
// gzipped, with Langium + chevrotain + vscode-language-* contributing
// ~100 KB gzipped — well under the 120 KB threshold the m4 handoff
// named as the escalation trigger. Per that handoff's "next moves",
// the cheap fix is a higher budget; we set 175 KB so we still beat
// Mermaid by a comfortable margin while leaving headroom for
// incremental growth. Crossing 200 KB should trigger a serious
// review: pre-bundled grammars or a hand-rolled `.nowline` parser
// become attractive.
//
// The `--print-attribution` flag walks the esbuild metafile and prints
// the top contributors so a Langium runtime regression surfaces with
// a directional fix.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const PROD_BUDGET = 175 * 1024;
const PROD_ALERT = 200 * 1024;
const DEV_BUDGET = 220 * 1024;
const DEV_ALERT = 240 * 1024;

const PROD_BUNDLE = resolve(root, 'dist/nowline.min.js');
const DEV_BUNDLE = resolve(root, 'dist-cdn-dev/latest/nowline.min.js');
const META_PATH = resolve(root, 'dist/meta.json');

function fmtKB(bytes) {
    return `${(bytes / 1024).toFixed(2)} KB`;
}

async function loadIfPresent(path) {
    try {
        return await readFile(path);
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

async function loadRequired(path, kind) {
    const buf = await loadIfPresent(path);
    if (!buf) {
        console.error(
            `check-size: ${path} not found. Run 'pnpm bundle${kind === 'dev' ? ':dev' : ''}' first.`,
        );
        process.exit(2);
    }
    return buf;
}

async function loadMetafile() {
    try {
        const raw = await readFile(META_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function attributionFromMeta(meta) {
    if (!meta?.outputs) return [];
    const out = meta.outputs[Object.keys(meta.outputs).find((k) => k.endsWith('nowline.min.js'))];
    if (!out?.inputs) return [];
    const buckets = new Map();
    for (const [path, info] of Object.entries(out.inputs)) {
        const bytes = info.bytesInOutput ?? 0;
        const bucket = bucketize(path);
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + bytes);
    }
    return [...buckets.entries()].sort((a, b) => b[1] - a[1]);
}

function bucketize(path) {
    if (path.includes('node_modules/langium/')) return 'langium runtime';
    if (path.includes('node_modules/chevrotain/')) return 'chevrotain';
    if (path.includes('node_modules/d3-')) return 'd3';
    if (path.includes('node_modules/vscode-')) return 'vscode-language-* (langium dep)';
    if (path.includes('node_modules/@firebase/')) return '@firebase/* (dev gate only)';
    if (path.includes('node_modules/firebase/')) return 'firebase (dev gate only)';
    if (path.includes('packages/core/')) return '@nowline/core';
    if (path.includes('packages/layout/')) return '@nowline/layout';
    if (path.includes('packages/renderer/')) return '@nowline/renderer';
    if (path.includes('packages/embed/')) return '@nowline/embed';
    if (path.includes('node_modules/')) {
        const m = /node_modules\/(@?[^/]+(?:\/[^/]+)?)\//.exec(path);
        return m ? m[1] : 'other (node_modules)';
    }
    return 'other';
}

const printAttribution = process.argv.includes('--print-attribution');

async function checkBundle({ name, bundle, budget, alert, forbidFirebase }) {
    const raw = bundle.length;
    const gz = gzipSync(bundle).length;
    console.log(`\n[${name}]`);
    console.log(`  raw     : ${fmtKB(raw)}`);
    console.log(`  gzipped : ${fmtKB(gz)} (budget ${fmtKB(budget)})`);

    const text = bundle.toString('utf-8');

    const nodeImportRe = /node:(fs|path|url|os|crypto)/g;
    const nodeLeaks = [...text.matchAll(nodeImportRe)].map((m) => m[0]);
    if (nodeLeaks.length > 0) {
        console.error(
            `  check-size: ${nodeLeaks.length} node:* import(s) leaked: ${[...new Set(nodeLeaks)].join(', ')}`,
        );
        return { ok: false, gz, budget };
    }

    if (forbidFirebase) {
        // The prod IIFE must not import firebase. The dev auth gate lives
        // behind a `if (IS_DEV)` dynamic-import that bundle.mjs's esbuild
        // `define` folds to `if (false)` in prod, and the minifier strips
        // the whole branch. If anything regresses that elimination, the
        // word `firebase` re-appears in the IIFE — fail loudly so we
        // don't ship a 195 KB prod bundle by accident.
        if (text.includes('firebase')) {
            console.error(
                "  check-size: prod IIFE contains the literal 'firebase' — dev auth gate dead-code elimination regressed. Inspect dist/nowline.min.js and confirm `IS_DEV` from src/auth/env.ts folds to a literal `false` at minify time.",
            );
            return { ok: false, gz, budget };
        }
    }

    if (gz > budget) {
        const overage = gz - budget;
        console.error(
            `  check-size: bundle is ${fmtKB(gz)}, ${fmtKB(overage)} over the ${fmtKB(budget)} budget.`,
        );
        console.error(
            '  check-size: run `pnpm --filter @nowline/embed check-size --print-attribution` to see the largest contributors.',
        );
        return { ok: false, gz, budget };
    }

    if (gz > alert) {
        console.warn(
            `  check-size: WARNING — bundle is ${fmtKB(gz)}, crossing the ${fmtKB(alert)} alert line.`,
        );
        console.warn(
            '  check-size: review the m4 handoff before bumping the budget further (pre-bundled grammars or a hand-rolled parser become attractive at this size).',
        );
    }

    console.log(`  check-size: OK (${fmtKB(budget - gz)} headroom)`);
    return { ok: true, gz, budget };
}

const prodBundle = await loadRequired(PROD_BUNDLE, 'prod');
const prodResult = await checkBundle({
    name: 'prod (dist/nowline.min.js)',
    bundle: prodBundle,
    budget: PROD_BUDGET,
    alert: PROD_ALERT,
    forbidFirebase: true,
});

if (printAttribution) {
    const meta = await loadMetafile();
    const buckets = attributionFromMeta(meta);
    if (buckets.length > 0) {
        console.log('\nTop contributors to prod IIFE (raw bytes):');
        for (const [name, bytes] of buckets.slice(0, 10)) {
            const pct = ((bytes / prodBundle.length) * 100).toFixed(1);
            console.log(`  ${name.padEnd(36)} ${fmtKB(bytes).padStart(10)}  (${pct}%)`);
        }
    }
}

// Dev bundle is optional in CI runs that only build prod (e.g. the npm
// publish phase in release.yml needs only the prod artifact). When the
// dev artifact is present, gate it; when absent, note and continue.
const devBundle = await loadIfPresent(DEV_BUNDLE);
let devResult = { ok: true, gz: 0, budget: DEV_BUDGET };
if (devBundle) {
    devResult = await checkBundle({
        name: 'dev (dist-cdn-dev/latest/nowline.min.js)',
        bundle: devBundle,
        budget: DEV_BUDGET,
        alert: DEV_ALERT,
        forbidFirebase: false,
    });
} else {
    console.log(
        '\n[dev] dist-cdn-dev/latest/nowline.min.js not present; skipping (run `pnpm bundle:dev` to build).',
    );
}

if (!prodResult.ok || !devResult.ok) {
    process.exit(1);
}
