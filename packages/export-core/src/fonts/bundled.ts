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

import { SANS_BASE64, MONO_BASE64 } from '../generated/bundled-fonts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// dist/fonts/bundled.js → ../../assets/fonts/
//   src/fonts/bundled.ts → ../../assets/fonts/
const ASSETS_DIR = path.resolve(HERE, '..', '..', 'assets', 'fonts');

// Informational: where the source-of-truth TTFs live on disk for users
// running under Node. Not the runtime load source — `loadBundledSans` and
// `loadBundledMono` decode from the embedded base64 instead. Inside a bun
// --compile binary these paths are phantom (the assets are not on disk).
export const BUNDLED_SANS_PATH = path.join(ASSETS_DIR, 'DejaVuSans.ttf');
export const BUNDLED_MONO_PATH = path.join(ASSETS_DIR, 'DejaVuSansMono.ttf');

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
