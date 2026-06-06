#!/usr/bin/env node
// Bundle the MCP Apps in-chat preview entry (src/ui/entry.ts) into a
// self-contained browser IIFE and inline it into src/generated/ui-bundle.ts
// as the UI_BUNDLE string. The server wraps this bundle in a text/html
// resource returned by `render` under the MCP Apps UI capability, so no
// runtime file I/O or external fetch is needed.
//
// Mirrors the webview config in packages/vscode-extension/scripts/bundle.mjs:
// a browser-targeted IIFE with no host API. The difference is that this entry
// renders source → SVG in-browser via @nowline/browser, so the bundle pulls
// in the full parse/layout/render stack — the same browser-safe stack the
// embed CDN bundle ships. Runs as part of prebuild, after bundle-resources.

import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const entry = path.join(packageRoot, 'src', 'ui', 'entry.ts');
const outDir = path.join(packageRoot, 'src', 'generated');

mkdirSync(outDir, { recursive: true });

// Stubs out `@nowline/core/util/node-read-file.js`. The preview always renders
// with the no-op include resolver (renderSource is called without a `readFile`),
// so the Node fallback is never reached — but esbuild still bundles it because of
// the dynamic `await import('node:fs')` site. Replacing it with a throwing stub
// keeps the browser IIFE free of any `node:*` literal. Mirrors the same plugin in
// packages/embed/scripts/bundle.mjs.
const stubNodeReadFile = {
    name: 'stub-node-read-file',
    setup(buildApi) {
        buildApi.onResolve({ filter: /node-read-file(\.js)?$/ }, (args) => {
            if (!args.path.includes('node-read-file')) return undefined;
            return { path: args.path, namespace: 'stub-node-read-file' };
        });
        buildApi.onLoad({ filter: /.*/, namespace: 'stub-node-read-file' }, () => ({
            contents:
                'export async function nodeReadFile() { ' +
                'throw new Error("nowline: filesystem readers are unavailable in the in-chat preview"); }',
            loader: 'js',
        }));
    },
};

const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    sourcemap: false,
    legalComments: 'none',
    minify: true,
    write: false,
    logLevel: 'silent',
    plugins: [stubNodeReadFile],
});

const bundle = result.outputFiles[0].text;

const lines = [
    '// GENERATED — do not edit. Re-run `pnpm --filter @nowline/mcp build` to regenerate.',
    '//',
    '// Source: packages/mcp/src/ui/entry.ts, bundled as a browser IIFE by',
    '//         packages/mcp/scripts/bundle-ui.mjs.',
    '//',
    '// Inlined into the text/html resource that `render` returns under the',
    '// MCP Apps UI capability (specs/mcp.md § Optional MCP Apps UI variant).',
    '',
    '/** Self-contained browser IIFE for the MCP Apps in-chat live preview. */',
    `export const UI_BUNDLE: string = ${JSON.stringify(bundle)};`,
];

writeFileSync(path.join(outDir, 'ui-bundle.ts'), `${lines.join('\n')}\n`);
console.log(
    `bundled mcp preview UI (${(bundle.length / 1024).toFixed(0)} KiB) → src/generated/ui-bundle.ts`,
);
