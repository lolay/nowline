#!/usr/bin/env node

// Bundle-size gate for `@nowline/embed`. Runs in CI on every PR and
// reports a failure if the gzipped IIFE exceeds the budget.
//
//   prod IIFE (dist/nowline.min.js)  ≤ 175 KB gzipped
//
// Also asserts:
//   - no `node:*` literal survived in the IIFE (the
//     `include-resolver.ts` browser-safety refactor in
//     packages/core/src/util/node-read-file.ts must keep holding).
//
// Budget rationale: the m4 plan started at 150 KB gzipped (vs.
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

const PROD_BUNDLE = resolve(root, 'dist/nowline.min.js');
const META_PATH = resolve(root, 'dist/meta.json');

function fmtKB(bytes) {
    return `${(bytes / 1024).toFixed(2)} KB`;
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

const prodBuf = await readFile(PROD_BUNDLE).catch(() => {
    console.error(`check-size: ${PROD_BUNDLE} not found. Run 'pnpm build' first.`);
    process.exit(2);
});

const raw = prodBuf.length;
const gz = gzipSync(prodBuf).length;
console.log(`[prod (dist/nowline.min.js)]`);
console.log(`  raw     : ${fmtKB(raw)}`);
console.log(`  gzipped : ${fmtKB(gz)} (budget ${fmtKB(PROD_BUDGET)})`);

const text = prodBuf.toString('utf-8');

const nodeImportRe = /node:(fs|path|url|os|crypto)/g;
const nodeLeaks = [...text.matchAll(nodeImportRe)].map((m) => m[0]);
if (nodeLeaks.length > 0) {
    console.error(
        `  check-size: ${nodeLeaks.length} node:* import(s) leaked: ${[...new Set(nodeLeaks)].join(', ')}`,
    );
    process.exit(1);
}

let ok = true;

if (gz > PROD_BUDGET) {
    const overage = gz - PROD_BUDGET;
    console.error(
        `  check-size: bundle is ${fmtKB(gz)}, ${fmtKB(overage)} over the ${fmtKB(PROD_BUDGET)} budget.`,
    );
    console.error(
        '  check-size: run `pnpm --filter @nowline/embed check-size --print-attribution` to see the largest contributors.',
    );
    ok = false;
} else {
    if (gz > PROD_ALERT) {
        console.warn(
            `  check-size: WARNING — bundle is ${fmtKB(gz)}, crossing the ${fmtKB(PROD_ALERT)} alert line.`,
        );
        console.warn(
            '  check-size: review the m4 handoff before bumping the budget further (pre-bundled grammars or a hand-rolled parser become attractive at this size).',
        );
    }
    console.log(`  check-size: OK (${fmtKB(PROD_BUDGET - gz)} headroom)`);
}

if (printAttribution) {
    const meta = await loadMetafile();
    const buckets = attributionFromMeta(meta);
    if (buckets.length > 0) {
        console.log('\nTop contributors to prod IIFE (raw bytes):');
        for (const [name, bytes] of buckets.slice(0, 10)) {
            const pct = ((bytes / prodBuf.length) * 100).toFixed(1);
            console.log(`  ${name.padEnd(36)} ${fmtKB(bytes).padStart(10)}  (${pct}%)`);
        }
    }
}

if (!ok) process.exit(1);
