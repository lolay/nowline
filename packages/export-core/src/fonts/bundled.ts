// Bundled-fallback font loader.
//
// Spec: specs/handoffs/m2c.md § 10 "Bundled fallback".
//
// Ships exactly two TTFs under `assets/fonts/`: DejaVuSans.ttf (~740 KB) and
// DejaVuSansMono.ttf (~330 KB). Bold / italic are synthesized by PDFKit's
// faux-bold and skew transforms. License: see LICENSE-DejaVu.txt next to the
// fonts.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// dist/fonts/bundled.js → ../../assets/fonts/
//   src/fonts/bundled.ts → ../../assets/fonts/
const ASSETS_DIR = path.resolve(HERE, '..', '..', 'assets', 'fonts');

export const BUNDLED_SANS_PATH = path.join(ASSETS_DIR, 'DejaVuSans.ttf');
export const BUNDLED_MONO_PATH = path.join(ASSETS_DIR, 'DejaVuSansMono.ttf');

let cachedSans: Uint8Array | undefined;
let cachedMono: Uint8Array | undefined;

export async function loadBundledSans(): Promise<Uint8Array> {
    if (cachedSans) return cachedSans;
    const buf = await fs.readFile(BUNDLED_SANS_PATH);
    cachedSans = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return cachedSans;
}

export async function loadBundledMono(): Promise<Uint8Array> {
    if (cachedMono) return cachedMono;
    const buf = await fs.readFile(BUNDLED_MONO_PATH);
    cachedMono = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return cachedMono;
}

/** Test seam: drop cached bytes so platform-mocked tests start fresh. */
export function clearBundledCache(): void {
    cachedSans = undefined;
    cachedMono = undefined;
}
