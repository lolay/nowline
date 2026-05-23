#!/usr/bin/env node

// Bundles the VS Code extension entry, the Nowline LSP server, and the
// preview-shell webview script into self-contained files under dist/.
// The extension marks the `vscode` API as external (provided by the
// host); the server bundles every workspace package so the .vsix is
// fully self-contained. The webview bundle is a browser-targeted IIFE
// imported by `shell-html.ts` via `webview.asWebviewUri`.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const watch = process.argv.includes('--watch');

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

async function run() {
    if (watch) {
        const ctxA = await context(extensionConfig);
        const ctxB = await context(serverConfig);
        const ctxC = await context(webviewConfig);
        await Promise.all([ctxA.watch(), ctxB.watch(), ctxC.watch()]);
        console.log('watching extension + server + preview-webview bundles…');
    } else {
        await Promise.all([build(extensionConfig), build(serverConfig), build(webviewConfig)]);
        console.log('built extension + server + preview-webview bundles');
    }
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
