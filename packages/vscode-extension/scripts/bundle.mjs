#!/usr/bin/env node

// Bundles the VS Code extension entry, the Nowline LSP server, and the
// preview-shell webview script into self-contained files under dist/.
// The extension marks the `vscode` API as external (provided by the
// host); the server bundles every workspace package so the .vsix is
// fully self-contained. The webview bundle is a browser-targeted IIFE
// imported by `shell-html.ts` via `webview.asWebviewUri`.
//
// Also copies the @resvg/resvg-wasm binary (index_bg.wasm) to dist/resvg.wasm
// so the in-process PNG exporter can load it at runtime without bundling the
// binary inline.

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
const watch = process.argv.includes('--watch');

// Resolve the @resvg/resvg-wasm WASM binary via require() so this script works
// from any working directory and doesn't assume a fixed node_modules path.
// The package exports './index_bg.wasm' in its exports map, so we resolve
// the JS entry and derive the package directory from it.
const require = createRequire(import.meta.url);
const resvgWasmEntry = require.resolve('@resvg/resvg-wasm');
const resvgWasmSrc = resolve(dirname(resvgWasmEntry), 'index_bg.wasm');

const sharedOptions = {
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: true,
    logLevel: 'info',
    legalComments: 'none',
    minify: process.env.NODE_ENV === 'production',
};

const extensionConfig = {
    ...sharedOptions,
    entryPoints: [resolve(root, 'src', 'extension.ts')],
    outfile: resolve(root, 'dist', 'extension.cjs'),
    external: ['vscode'],
};

const serverConfig = {
    ...sharedOptions,
    entryPoints: [resolve(root, 'src', 'server-launcher.ts')],
    outfile: resolve(root, 'dist', 'server.cjs'),
    external: [],
};

// Browser-targeted bundle for the preview webview. Loaded via
// `webview.asWebviewUri` from `shell-html.ts`; runs inside the
// webview's isolated context with `acquireVsCodeApi()` provided by VS
// Code. IIFE so we can drop it into a single `<script>` tag without
// declaring `type="module"` (CSP-friendly).
const webviewConfig = {
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    sourcemap: true,
    logLevel: 'info',
    legalComments: 'none',
    minify: process.env.NODE_ENV === 'production',
    entryPoints: [resolve(root, 'src', 'preview', 'webview', 'entry.ts')],
    outfile: resolve(root, 'dist', 'preview-webview.js'),
};

async function copyWasm() {
    await mkdir(dist, { recursive: true });
    await copyFile(resvgWasmSrc, resolve(dist, 'resvg.wasm'));
    console.log('copied resvg.wasm to dist/');
}

async function run() {
    if (watch) {
        const ctxA = await context(extensionConfig);
        const ctxB = await context(serverConfig);
        const ctxC = await context(webviewConfig);
        await Promise.all([ctxA.watch(), ctxB.watch(), ctxC.watch()]);
        await copyWasm();
        console.log('watching extension + server + preview-webview bundles…');
    } else {
        await Promise.all([
            build(extensionConfig),
            build(serverConfig),
            build(webviewConfig),
            copyWasm(),
        ]);
        console.log('built extension + server + preview-webview bundles');
    }
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
