// Bundled-fallback font loader.
//
// Spec: specs/handoffs/m2c.md § 10 "Bundled fallback".
//
// Ships exactly two TTFs under `assets/fonts/`: DejaVuSans.ttf (~740 KB) and
// DejaVuSansMono.ttf (~330 KB). Bold / italic are synthesized by PDFKit's
// faux-bold and skew transforms. License: see LICENSE-DejaVu.txt next to the
// fonts.
//
// The TTF bytes are embedded as base64 string literals via
// `scripts/bundle-fonts.mjs` (run as `prebuild` / `pretest`) so the loader
// works under both Node and a bun --compile binary. `bun --compile` does not
// virtualize fs.readFile of import.meta.url paths, so the on-disk asset is
// invisible inside the compiled binary; the embedded strings are the
// runtime source of truth.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONO_BASE64, SANS_BASE64 } from '../generated/bundled-fonts.js';

// Resolve the on-disk assets/fonts directory from this module's location.
// `import.meta.url` is rewritten to `undefined` when this module is bundled
// into a CommonJS context — esbuild collapses `import.meta` to `{}` for the VS
// Code extension's `dist/extension.cjs`. The two exported paths below are
// informational only (the runtime decodes the embedded base64 above, never
// reads these files), so degrade to a bare relative directory instead of
// throwing `ERR_INVALID_ARG_TYPE` at module load — which would crash the
// extension before it can activate. See packages/vscode-extension.
function bundledFontsDir(): string {
    try {
        // dist/fonts/bundled.js → ../../assets/fonts/
        //   src/fonts/bundled.ts → ../../assets/fonts/
        const here = path.dirname(fileURLToPath(import.meta.url));
        return path.resolve(here, '..', '..', 'assets', 'fonts');
    } catch {
        return path.join('assets', 'fonts');
    }
}

const ASSETS_DIR = bundledFontsDir();

// Informational: where the source-of-truth TTFs live on disk for users
// running under Node. Not the runtime load source — `loadBundledSans` and
// `loadBundledMono` decode from the embedded base64 instead. Inside a bun
// --compile binary these paths are phantom (the assets are not on disk).
export const BUNDLED_SANS_PATH = path.join(ASSETS_DIR, 'DejaVuSans.ttf');
export const BUNDLED_MONO_PATH = path.join(ASSETS_DIR, 'DejaVuSansMono.ttf');

/**
 * Family names stamped on the bundled DejaVu faces. The resolver's
 * `ResolvedFont.name`, the renderer's pinned `font-family`, the resvg family
 * hints, and the live-preview `@font-face` must all use these exact strings
 * so preview and raster export name the same face (the WYSIWYG contract).
 */
export const BUNDLED_SANS_FAMILY = 'DejaVu Sans';
export const BUNDLED_MONO_FAMILY = 'DejaVu Sans Mono';

let cachedSans: Uint8Array | undefined;
let cachedMono: Uint8Array | undefined;

function decodeBase64(b64: string): Uint8Array {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export async function loadBundledSans(): Promise<Uint8Array> {
    if (cachedSans) return cachedSans;
    cachedSans = decodeBase64(SANS_BASE64);
    return cachedSans;
}

export async function loadBundledMono(): Promise<Uint8Array> {
    if (cachedMono) return cachedMono;
    cachedMono = decodeBase64(MONO_BASE64);
    return cachedMono;
}

/** Test seam: drop cached bytes so platform-mocked tests start fresh. */
export function clearBundledCache(): void {
    cachedSans = undefined;
    cachedMono = undefined;
}
