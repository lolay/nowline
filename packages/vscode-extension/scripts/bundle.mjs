#!/usr/bin/env node

// Bundles the VS Code extension entry and the Nowline LSP server into
// self-contained CommonJS files under dist/. The extension marks the
// `vscode` API as external (provided by the host); the server bundles
// every workspace package so the .vsix is fully self-contained.

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

async function run() {
    if (watch) {
        const ctxA = await context(extensionConfig);
        const ctxB = await context(serverConfig);
        await Promise.all([ctxA.watch(), ctxB.watch()]);
        console.log('watching extension + server bundles…');
    } else {
        await Promise.all([build(extensionConfig), build(serverConfig)]);
        console.log('built extension + server bundles');
    }
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
