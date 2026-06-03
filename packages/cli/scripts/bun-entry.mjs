#!/usr/bin/env bun
// Bun-only entry point for `bun build --compile`.
//
// `import ... with { type: 'file' }` is the ONLY pattern Bun's static
// analyzer recognises for embedding binary assets in a standalone binary.
// `Bun.file(new URL(..., import.meta.url))` is NOT tracked by the bundler
// and leaves the asset out of the embedded VFS.
//
// This shim:
//   1. Imports resvg.wasm via the recognised pattern, yielding a VFS path.
//   2. Stashes that path in globalThis so loadWasm() (in dist/index.js) can
//      read it with Bun.file() at runtime.
//   3. Delegates immediately to dist/index.js (the normal Node entry).
//
// compile.mjs passes this file as the bun --compile entry instead of
// dist/index.js directly.

// @ts-expect-error — Bun-specific import assertion; not valid Node.js/TypeScript.
import resvgWasmPath from '../dist/resvg.wasm' with { type: 'file' };

// Make the VFS path available to loadWasm() in dist/commands/render.js.
globalThis.__RESVG_WASM_PATH__ = resvgWasmPath;

// Run the CLI.
await import('../dist/index.js');
