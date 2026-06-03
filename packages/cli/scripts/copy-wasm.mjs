#!/usr/bin/env node
// Copy @resvg/resvg-wasm/index_bg.wasm → dist/resvg.wasm so the CLI can
// locate it at runtime (both uncompiled Node and bun --compile, which embeds
// files referenced via new URL('./resvg.wasm', import.meta.url)).
//
// Runs as the `postbuild` step, after tsc has created dist/.

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

const req = createRequire(import.meta.url);
const wasmEntry = req.resolve('@resvg/resvg-wasm');
const wasmSrc = resolve(dirname(wasmEntry), 'index_bg.wasm');
const wasmDest = resolve(packageRoot, 'dist', 'resvg.wasm');

await mkdir(resolve(packageRoot, 'dist'), { recursive: true });
await copyFile(wasmSrc, wasmDest);
console.log(`copied resvg.wasm → dist/resvg.wasm`);
