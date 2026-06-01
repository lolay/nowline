#!/usr/bin/env node

// Produces the browser bundle for `@nowline/embed`:
//
//   dist/nowline.min.js       — minified IIFE, exposes window.nowline
//   dist/nowline.min.js.map   — source map (served alongside the IIFE)
//   dist/nowline.esm.js       — ESM entry for bundler consumers
//   dist/meta.json            — esbuild metafile (used by check-size.mjs)
//
// Build env:
//   NOWLINE_EMBED_SHA   short git SHA to bake into the banner.
//                       Defaults to GITHUB_SHA.slice(0, 7) when in CI,
//                       falls back to `git rev-parse --short HEAD`.
//
// Mirrors `packages/vscode-extension/scripts/bundle.mjs` but targets
// browsers: platform=browser, format=iife, globalName=nowline.
// Node-only modules are marked external so an accidentally retained
// `import('node:fs')` (e.g. through include-resolver) becomes a runtime
// error rather than a build failure — `check-size.mjs` separately
// asserts no `node:*` literal survived in the IIFE output.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'dist');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const version = pkg.version;

function resolveSha() {
    const fromEnv = process.env.NOWLINE_EMBED_SHA ?? process.env.GITHUB_SHA;
    if (fromEnv && fromEnv.length >= 7) return fromEnv.slice(0, 7);
    try {
        return execSync('git rev-parse --short=7 HEAD', {
            cwd: root,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    } catch {
        // git not available (e.g. shallow clone without history). Fall back
        // to a stable sentinel so the banner stays well-formed and the
        // verification curl in the infrastructure deploy runbook still
        // parses.
        return 'unknown';
    }
}

const sha = resolveSha();

// builtAt must be deterministic so two builds from the same commit (e.g.
// the `pack-npm` CI cell and a local build) produce byte-identical
// bundles. Resolution order:
//   1. NOWLINE_EMBED_BUILT_AT env var — explicit override (CI pin or testing).
//   2. Commit date from `git show -s --format=%cI HEAD` — same across all
//      cells that check out the same tag.
//   3. new Date() — local dev fallback; non-deterministic but harmless.
function resolveBuiltAt() {
    const fromEnv = process.env.NOWLINE_EMBED_BUILT_AT;
    if (fromEnv) return fromEnv;
    try {
        return execSync('git show -s --format=%cI HEAD', {
            cwd: root,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    } catch {
        return new Date().toISOString();
    }
}

const builtAt = resolveBuiltAt();
const bannerJs = `/*! @nowline/embed ${version} sha=${sha} built=${builtAt} */`;

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
    banner: { js: bannerJs },
    define: {
        'process.env.NODE_ENV': '"production"',
        __NOWLINE_EMBED_VERSION__: JSON.stringify(version),
        __NOWLINE_EMBED_SHA__: JSON.stringify(sha),
    },
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
    console.log(`built dist/nowline.min.js (IIFE) + dist/nowline.esm.js (ESM)`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
