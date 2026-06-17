#!/usr/bin/env node
// Hybrid .mcpb server bundle for Claude Desktop (`make pack-mcpb`).
//
// Bundles the compiled MCP server into a single ESM file and installs only the
// packages that cannot be bundled safely. Everything else (all @nowline/*
// workspace code, exceljs, MCP SDK, zod, …) is tree-shaken into dist/index.js.
//
// EXTERNAL ALLOWLIST — kept in staging/node_modules (not bundled):
//
//   @resvg/resvg-wasm
//     index_bg.wasm is loaded via createRequire(import.meta.url).resolve(...)
//     in packages/export-png and packages/mcp/src/server.ts. Inlining the JS
//     without the wasm file on disk breaks PNG export.
//
//   pdfkit
//     Reads AFM font-metric files from js/data/ at runtime. Bundling pdfkit
//     breaks path resolution (prior ENOENT on pdfkit data files — see CHANGELOG).
//
//   langium (+ vscode-jsonrpc, chevrotain transitives via npm install)
//     Langium's Node entry pulls in vscode-jsonrpc, which uses dynamic require()
//     calls that esbuild cannot fold into an ESM bundle. Keeping langium
//     external preserves runtime compatibility while still bundling @nowline/core.
//
// NOT external (bundled inline):
//
//   DejaVu fonts — embedded as base64 in @nowline/export-core/generated/
//     bundled-fonts.js at build time; no on-disk TTF read at runtime.
//
// Spec: specs/mcp.md § ".mcpb bundle packaging"

import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/**
 * Packages kept in staging/node_modules. Asset-I/O packages (resvg, pdfkit) plus
 * langium (dynamic require incompatibility with esbuild ESM output).
 */
export const MCPB_EXTERNAL_ALLOWLIST = [
    '@resvg/resvg-wasm',
    'pdfkit',
    'langium',
    'vscode-jsonrpc',
    'vscode-languageserver-protocol',
    'vscode-languageserver-types',
    'vscode-uri',
    'chevrotain',
    'chevrotain-allstar',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const stagingDir = path.join(repoRoot, 'dist-mcpb', 'staging');
const outFile = path.join(stagingDir, 'dist', 'index.js');

const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
const entry = path.join(packageRoot, 'dist', 'index.js');

mkdirSync(path.dirname(outFile), { recursive: true });

await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile: outFile,
    sourcemap: false,
    legalComments: 'none',
    minify: false,
    logLevel: 'info',
    external: MCPB_EXTERNAL_ALLOWLIST,
});

const exportPngPkg = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages/export-png/package.json'), 'utf-8'),
);
const exportPdfPkg = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages/export-pdf/package.json'), 'utf-8'),
);
const corePkg = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages/core/package.json'), 'utf-8'),
);

const stagingPkg = {
    name: '@nowline/mcp',
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    type: 'module',
    main: './dist/index.js',
    bin: {
        'nowline-mcp': './dist/index.js',
    },
    engines: pkg.engines,
    dependencies: {
        '@resvg/resvg-wasm': exportPngPkg.dependencies['@resvg/resvg-wasm'],
        pdfkit: exportPdfPkg.dependencies.pdfkit,
        langium: corePkg.dependencies.langium,
    },
};

writeFileSync(path.join(stagingDir, 'package.json'), `${JSON.stringify(stagingPkg, null, 4)}\n`);

for (const name of ['manifest.json', '.mcpbignore', 'icon.png']) {
    copyFileSync(path.join(packageRoot, name), path.join(stagingDir, name));
}

execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', {
    cwd: stagingDir,
    stdio: 'inherit',
});

const { size } = await import('node:fs/promises').then((fs) => fs.stat(outFile));
console.log(
    `bundled MCP server (${(size / 1024 / 1024).toFixed(2)} MiB) → ${path.relative(repoRoot, outFile)}`,
);
