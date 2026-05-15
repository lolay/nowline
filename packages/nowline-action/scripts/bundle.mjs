#!/usr/bin/env node

// Produces the GitHub Actions runtime bundle for `@nowline/action`:
//
//   dist/index.cjs       — single-file CJS action entry point
//   dist/index.cjs.map   — source map (linked, served alongside)
//   dist/meta.json       — esbuild metafile (used by the safety check below)
//
// Why CJS, not ESM? When GitHub Actions runs `uses: lolay/nowline-action@vX`,
// it clones the mirror repo (which has no package.json) and spawns
// `node dist/<entry>`. Node's "type: module" detection walks up to the
// nearest package.json; absent one, it defaults to CJS for `.js`. Shipping
// `.cjs` makes the bundle's module type unambiguous regardless of where it
// lands.
//
// Safety checks (fail the build, not just warn):
//
// 1. The bundle MUST NOT import any non-`node:` external module. esbuild's
//    `bundle: true` inlines everything by default; if a dep is accidentally
//    marked external, the runner throws `Cannot find module` because there's
//    no `node_modules` directory next to the action. Inspect the metafile's
//    `outputs[bundle].imports` and fail if anything non-`node:` survives.
// 2. No workspace symlinks may end up referenced — `workspace:*` resolves
//    to local paths in dev, but consumers download the dist/ from a tag.
//    Caught by check 1 because workspace deps either get inlined or show
//    up as imports.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const nodeBuiltins = new Set(builtinModules);

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'dist');

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8'));
const builtAt = new Date().toISOString();

await mkdir(outDir, { recursive: true });

const result = await build({
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(outDir, 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    sourcemap: true,
    legalComments: 'linked',
    metafile: true,
    logLevel: 'info',
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    banner: {
        js: `// @nowline/action ${pkg.version} — bundled ${builtAt}`,
    },
});

await writeFile(resolve(outDir, 'meta.json'), JSON.stringify(result.metafile, null, 2));

assertNoExternalImports(result.metafile);

console.log(`built dist/index.cjs (CJS, node24) — @nowline/action ${pkg.version}`);

/**
 * Walk the metafile's outputs and assert that the bundled file has no
 * runtime imports other than Node.js builtins (`node:*` or bare specifiers
 * like `path` / `fs` that resolve to the same modules). Anything else means
 * a dep escaped bundling and the action will fail at runtime on a runner
 * that has no `node_modules/`.
 */
function assertNoExternalImports(metafile) {
    const bundleKey = Object.keys(metafile.outputs).find((k) => k.endsWith('index.cjs'));
    if (!bundleKey) {
        throw new Error('bundle script: index.cjs not found in metafile outputs');
    }
    const imports = metafile.outputs[bundleKey].imports ?? [];
    const escaped = imports.filter((imp) => !isNodeBuiltin(imp.path));
    if (escaped.length > 0) {
        const list = escaped.map((imp) => `  - ${imp.path} (${imp.kind})`).join('\n');
        throw new Error(
            `bundle script: ${escaped.length} non-builtin import(s) escaped bundling\n${list}\n` +
                'These will throw "Cannot find module" on a GitHub Actions runner. ' +
                'Make sure the package is in dependencies (not external) and rerun the bundle.',
        );
    }
}

function isNodeBuiltin(specifier) {
    if (specifier.startsWith('node:')) return true;
    // `fs/promises`, `stream/web`, etc. — strip the subpath before checking.
    const root = specifier.split('/')[0];
    return nodeBuiltins.has(root);
}
