#!/usr/bin/env node

// Produces the browser bundle for `@nowline/embed`:
//
//   dist/nowline.min.js       — minified IIFE, exposes window.nowline
//   dist/nowline.min.js.map   — source map (served alongside the IIFE)
//   dist/nowline.esm.js       — ESM entry for bundler consumers
//   dist/meta.json            — esbuild metafile (used by check-size.mjs)
//
// Mirrors `packages/vscode-extension/scripts/bundle.mjs` but targets
// browsers: platform=browser, format=iife, globalName=nowline.
// Node-only modules are marked external so an accidentally retained
// `import('node:fs')` (e.g. through include-resolver) becomes a runtime
// error rather than a build failure — `check-size.mjs` separately
// asserts no `node:*` literal survived in the IIFE output.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'dist');

// Stubs out `@nowline/core/util/node-read-file.js` for the embed bundle.
// The Node fallback is never reached in browser (`@nowline/embed` always
// injects its own `readFile` into `resolveIncludes`), but esbuild still
// bundles the module because of the dynamic `await import()` site in
// `include-resolver.ts`. Replacing it with a throwing stub keeps the
// IIFE free of any `node:fs` literal.
const stubNodeReadFile = {
    name: 'stub-node-read-file',
    setup(build) {
        build.onResolve({ filter: /node-read-file(\.js)?$/ }, (args) => {
            if (!args.path.includes('node-read-file')) return undefined;
            return { path: args.path, namespace: 'stub-node-read-file' };
        });
        // The thrown message intentionally avoids the literal `node:fs` /
        // `node:path` strings so the bundle-size check's regex doesn't
        // false-positive on this stub.
        build.onLoad({ filter: /.*/, namespace: 'stub-node-read-file' }, () => ({
            contents:
                'export async function nodeReadFile() { ' +
                'throw new Error("nowline: filesystem readers are unavailable in the browser embed"); }',
            loader: 'js',
        }));
    },
};

const shared = {
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    target: ['es2020'],
    legalComments: 'linked',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [stubNodeReadFile],
    logLevel: 'info',
};

const iifeConfig = {
    ...shared,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(outDir, 'nowline.min.js'),
    minify: true,
    format: 'iife',
    globalName: 'nowline',
    metafile: true,
    // The IIFE is wrapped in a closure under `globalName`, so we don't
    // need to mark Node modules external — the stub plugin above handles
    // the only dynamic import that would have requested one.
};

const esmConfig = {
    ...shared,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(outDir, 'nowline.esm.js'),
    minify: false,
    format: 'esm',
};

const fs = await import('node:fs/promises');

async function run() {
    await fs.mkdir(outDir, { recursive: true });
    const [iifeResult] = await Promise.all([build(iifeConfig), build(esmConfig)]);
    if (iifeResult.metafile) {
        await fs.writeFile(
            resolve(outDir, 'meta.json'),
            JSON.stringify(iifeResult.metafile, null, 2),
        );
    }
    console.log('built nowline.min.js (IIFE) + nowline.esm.js (ESM)');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
