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

import { copyFile, mkdir, readdir } from 'node:fs/promises';
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

// Bundled DejaVu TTFs (the same files the export resolver embeds) so the
// live preview webview can `@font-face` them via `asWebviewUri` and render
// with the identical face the PNG/PDF raster export uses — WYSIWYG.
// @nowline/export-core is ESM-only (no CJS `main`), so resolve its workspace
// source directory directly rather than going through require.resolve.
const bundledFontsSrc = resolve(
    here,
    '..',
    '..',
    '..',
    'packages',
    'export-core',
    'assets',
    'fonts',
);
const BUNDLED_FONT_FILES = ['DejaVuSans.ttf', 'DejaVuSansMono.ttf'];

// PDFKit reads its standard-14 Adobe Font Metrics (`data/*.afm`) and the sRGB
// ICC profile from `__dirname/data/` via real `fs.readFileSync`. esbuild
// rewrites that `__dirname` to the bundle dir (`dist/`), so the files must be
// copied to `dist/data/` or PDF export throws `ENOENT … dist/data/Helvetica.afm`
// (PDFKit's constructor initialises a default Helvetica font before our
// Sans/Mono faces are registered). pdfkit is a transitive dep via
// @nowline/export-pdf, so resolve it from that package's node_modules.
const pdfkitEntry = require.resolve('pdfkit', {
    paths: [resolve(here, '..', '..', 'export-pdf')],
});
const pdfkitDataSrc = resolve(dirname(pdfkitEntry), 'data');

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

async function copyFonts() {
    const fontsDist = resolve(dist, 'fonts');
    await mkdir(fontsDist, { recursive: true });
    for (const file of BUNDLED_FONT_FILES) {
        await copyFile(resolve(bundledFontsSrc, file), resolve(fontsDist, file));
    }
    console.log('copied bundled DejaVu fonts to dist/fonts/');
}

async function copyPdfkitData() {
    const dataDist = resolve(dist, 'data');
    await mkdir(dataDist, { recursive: true });
    const files = await readdir(pdfkitDataSrc);
    await Promise.all(
        files.map((file) => copyFile(resolve(pdfkitDataSrc, file), resolve(dataDist, file))),
    );
    console.log(`copied ${files.length} pdfkit data files to dist/data/`);
}

async function run() {
    if (watch) {
        const ctxA = await context(extensionConfig);
        const ctxB = await context(serverConfig);
        const ctxC = await context(webviewConfig);
        await Promise.all([ctxA.watch(), ctxB.watch(), ctxC.watch()]);
        await copyWasm();
        await copyFonts();
        await copyPdfkitData();
        console.log('watching extension + server + preview-webview bundles…');
    } else {
        await Promise.all([
            build(extensionConfig),
            build(serverConfig),
            build(webviewConfig),
            copyWasm(),
            copyFonts(),
            copyPdfkitData(),
        ]);
        console.log('built extension + server + preview-webview bundles');
    }
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
