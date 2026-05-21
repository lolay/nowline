#!/usr/bin/env node

// Produces the browser bundle for `@nowline/embed`:
//
//   dist/nowline.min.js       — minified IIFE, exposes window.nowline
//   dist/nowline.min.js.map   — source map (served alongside the IIFE)
//   dist/nowline.esm.js       — ESM entry for bundler consumers
//   dist/meta.json            — esbuild metafile (used by check-size.mjs)
//
// Sibling CDN trees produced in the same run (so a single `pnpm build`
// or matrix cell lays down everything the release workflow needs):
//
//   dist-cdn-prod/X.Y.Z/nowline.min.js   — immutable per-patch; one
//                                          write per release.
//   dist-cdn-prod/X.Y/nowline.min.js     — rewritten each release
//                                          within the minor.
//   dist-cdn-prod/latest/nowline.min.js  — rewritten on every release.
//   dist-cdn-dev/nowline.min.js          — main-push dev tier; carries
//                                          the same banner plus a
//                                          `console.warn` once per page.
//
// They live outside `dist/` so they don't bloat the npm tarball
// (`"files": ["dist/", "src/"]` in package.json), and so a downstream
// `firebase deploy --only hosting` sees only the artifacts intended
// for that hosting site.
//
// Build env:
//   NOWLINE_EMBED_ENV   "prod" (default) or "dev". Dev build:
//                       - flips __NOWLINE_EMBED_ENV__ define to "dev"
//                         (so the auth gate + console.warn ride along
//                         instead of dead-code-eliminating);
//                       - writes to dist-cdn-dev/ instead of cdn-prod/.
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

const embedEnv =
    process.env.NOWLINE_EMBED_ENV === 'dev' || process.argv.includes('--dev') ? 'dev' : 'prod';
const isDev = embedEnv === 'dev';
const cdnDir = resolve(root, isDev ? 'dist-cdn-dev' : 'dist-cdn-prod');

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
        // verification curl in lolay/nowline-infra:ops/embed-deploy.md still
        // parses.
        return 'unknown';
    }
}

const sha = resolveSha();
const builtAt = new Date().toISOString();
const bannerHeader = `/*! @nowline/embed ${version} sha=${sha} built=${builtAt} env=${embedEnv} */`;
const devWarn = isDev
    ? `;(typeof console!=="undefined"&&console.warn&&console.warn("nowline embed @${sha} \\u2014 unstable, do not pin"));`
    : '';
const bannerJs = `${bannerHeader}${devWarn}`;

// Firebase web-app config for the dev auth gate. Read at build time from
// env vars (set by `.github/workflows/embed-cdn.yml` from the `embed-dev`
// environment-scoped variables — see
// lolay/nowline-infra:ops/embed-deploy.md § 2). Substituted into the bundle
// via esbuild defines; the prod build never reaches the
// firebase-auth.client module (dead-code-eliminated when
// __NOWLINE_EMBED_ENV__ === 'prod'), so empty values are fine there.
const firebaseDefines = {
    __NOWLINE_FIREBASE_API_KEY__: JSON.stringify(process.env.PUBLIC_FIREBASE_API_KEY ?? ''),
    __NOWLINE_FIREBASE_AUTH_DOMAIN__: JSON.stringify(process.env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? ''),
    __NOWLINE_FIREBASE_PROJECT_ID__: JSON.stringify(process.env.PUBLIC_FIREBASE_PROJECT_ID ?? ''),
    __NOWLINE_FIREBASE_APP_ID__: JSON.stringify(process.env.PUBLIC_FIREBASE_APP_ID ?? ''),
};

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
        __NOWLINE_EMBED_ENV__: JSON.stringify(embedEnv),
        __NOWLINE_EMBED_VERSION__: JSON.stringify(version),
        __NOWLINE_EMBED_SHA__: JSON.stringify(sha),
        ...firebaseDefines,
    },
    plugins: [stubNodeReadFile],
    logLevel: 'info',
};

// Prod IIFE writes to `dist/nowline.min.js` so the npm tarball (which
// ships the contents of `dist/`) carries the publicly-documented bundle.
// Dev IIFE writes directly into `dist-cdn-dev/` and does NOT touch
// `dist/` — otherwise the dev artifact (with the auth gate + firebase
// payload) would overwrite the prod one whenever both builds run in the
// same `pnpm build` invocation, and a subsequent `npm publish` would
// upload the wrong bytes.
const iifePrimaryOutfile = isDev
    ? resolve(cdnDir, 'nowline.min.js')
    : resolve(outDir, 'nowline.min.js');

const iifeConfig = {
    ...shared,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: iifePrimaryOutfile,
    minify: true,
    format: 'iife',
    globalName: 'nowline',
    metafile: true,
    // The IIFE is wrapped in a closure under `globalName`, so we don't
    // need to mark Node modules external — the stub plugin above handles
    // the only dynamic import that would have requested one.
};

// ESM is only built on the prod run. ESM consumers (bundler users) get
// dead-code elimination of the auth gate themselves via their own
// `__NOWLINE_EMBED_ENV__` define (or it stays undefined → IS_DEV is
// false → branch is skipped at runtime). Shipping a second ESM artifact
// for "dev" wouldn't have a documented consumer.
const esmConfig = {
    ...shared,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(outDir, 'nowline.esm.js'),
    minify: false,
    format: 'esm',
};

const fs = await import('node:fs/promises');

async function layOutCdnArtifacts() {
    if (isDev) {
        // Dev IIFE landed directly under `dist-cdn-dev/` — nothing more
        // to do; firebase deploy points at that directory verbatim.
        return [iifePrimaryOutfile];
    }

    // Prod IIFE landed under `dist/` (npm tarball source). Mirror it
    // into three aliases on the CDN:
    //
    //   X.Y.Z   immutable per patch; one write per release.
    //   X.Y     rewritten each release within the minor (auto-roll patches).
    //   latest  rewritten on every release.
    //
    // Bytes are identical across all three paths; only Cache-Control
    // differs (configured in packages/embed/firebase/prod/firebase.json).
    const src = iifePrimaryOutfile;
    const srcMap = `${src}.map`;
    await fs.mkdir(cdnDir, { recursive: true });

    const [major, minor, _patch] = version.split('.');
    const aliases = [version, `${major}.${minor}`, 'latest'];
    const written = [];
    for (const alias of aliases) {
        const aliasDir = resolve(cdnDir, alias);
        await fs.mkdir(aliasDir, { recursive: true });
        await fs.copyFile(src, resolve(aliasDir, 'nowline.min.js'));
        await fs.copyFile(srcMap, resolve(aliasDir, 'nowline.min.js.map'));
        written.push(resolve(aliasDir, 'nowline.min.js'));
    }
    return written;
}

async function run() {
    await fs.mkdir(outDir, { recursive: true });
    // ESM only on the prod build — see esmConfig comment for the rationale.
    const builds = isDev ? [build(iifeConfig)] : [build(iifeConfig), build(esmConfig)];
    const [iifeResult] = await Promise.all(builds);
    if (iifeResult.metafile && !isDev) {
        await fs.writeFile(
            resolve(outDir, 'meta.json'),
            JSON.stringify(iifeResult.metafile, null, 2),
        );
    }
    const written = await layOutCdnArtifacts();
    const label = isDev ? 'dev' : 'prod';
    const esmNote = isDev ? '' : ' + nowline.esm.js (ESM)';
    console.log(`built nowline.min.js (IIFE, ${label})${esmNote}; CDN paths:`);
    for (const path of written) console.log(`  ${path}`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
