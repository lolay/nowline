#!/usr/bin/env node

// Bundle-size gate for `@nowline/embed`. Runs in CI on every PR and
// reports a failure if the gzipped IIFE exceeds the budget.
//
// Also asserts no `node:*` literal survived in the IIFE output —
// belt-and-suspenders for the lazy-import refactor in
// packages/core/src/language/include-resolver.ts.
//
// Budget rationale: the m4 plan started at 150 KB gzipped (vs. Mermaid's
// ~200 KB). At first measurement the IIFE landed at ~163 KB gzipped,
// with Langium + chevrotain + vscode-language-* contributing ~100 KB
// gzipped — well under the 120 KB threshold the m4 handoff named as
// the escalation trigger. Per that handoff's "next moves", the cheap
// fix is a higher budget; we set 175 KB so we still beat Mermaid by a
// comfortable margin while leaving headroom for incremental growth.
// Crossing 200 KB should trigger a serious review: pre-bundled
// grammars or a hand-rolled `.nowline` parser become attractive.
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

const BUDGET_GZIP_BYTES = 175 * 1024;
const ALERT_GZIP_BYTES = 200 * 1024;
const BUNDLE_PATH = resolve(root, 'dist/nowline.min.js');
const META_PATH = resolve(root, 'dist/meta.json');

function fmtKB(bytes) {
    return `${(bytes / 1024).toFixed(2)} KB`;
}

async function loadBundle() {
    try {
        return await readFile(BUNDLE_PATH);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`check-size: ${BUNDLE_PATH} not found. Run 'pnpm bundle' first.`);
            process.exit(2);
        }
        throw err;
    }
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
const bundle = await loadBundle();
const gzipped = gzipSync(bundle);
const raw = bundle.length;
const gz = gzipped.length;

console.log(`raw     : ${fmtKB(raw)}`);
console.log(`gzipped : ${fmtKB(gz)} (budget ${fmtKB(BUDGET_GZIP_BYTES)})`);

if (printAttribution) {
    const meta = await loadMetafile();
    const buckets = attributionFromMeta(meta);
    if (buckets.length > 0) {
        console.log('\nTop contributors (raw bytes in IIFE):');
        for (const [name, bytes] of buckets.slice(0, 10)) {
            const pct = ((bytes / raw) * 100).toFixed(1);
            console.log(`  ${name.padEnd(36)} ${fmtKB(bytes).padStart(10)}  (${pct}%)`);
        }
    }
}

const text = bundle.toString('utf-8');
const nodeImportRe = /node:(fs|path|url|os|crypto)/g;
const leaks = [...text.matchAll(nodeImportRe)].map((m) => m[0]);
if (leaks.length > 0) {
    console.error(
        `check-size: ${leaks.length} node:* import(s) leaked into the IIFE: ${[...new Set(leaks)].join(', ')}`,
    );
    process.exit(1);
}

if (gz > BUDGET_GZIP_BYTES) {
    const overage = gz - BUDGET_GZIP_BYTES;
    console.error(
        `check-size: bundle is ${fmtKB(gz)}, ${fmtKB(overage)} over the ${fmtKB(BUDGET_GZIP_BYTES)} budget.`,
    );
    console.error(
        'check-size: run `pnpm --filter @nowline/embed check-size --print-attribution` to see the largest contributors.',
    );
    process.exit(1);
}

if (gz > ALERT_GZIP_BYTES) {
    console.warn(
        `check-size: WARNING — bundle is ${fmtKB(gz)}, crossing the ${fmtKB(ALERT_GZIP_BYTES)} alert line.`,
    );
    console.warn(
        'check-size: review the m4 handoff before bumping the budget further (pre-bundled grammars or a hand-rolled parser become attractive at this size).',
    );
}

console.log(`check-size: OK (${fmtKB(BUDGET_GZIP_BYTES - gz)} headroom)`);
