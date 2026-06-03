// Browser-compatible bundled font loader.
//
// Same bundled DejaVu bytes as loadBundledSans/loadBundledMono (Node), but
// decoded with `atob()` instead of Node's `Buffer.from()` so the module
// bundles cleanly for the browser (the Free/Pro web apps, Playwright legs).
//
// Usage: `loadBundledFontsForBrowser()` returns a cached `ResolvedFontPair`
// synchronously after the first call. Call it once at module init or lazy-once
// inside your `loadWasm` / font-loading step.
//
// Node callers: use `loadBundledSans()` / `loadBundledMono()` from bundled.ts.

import { MONO_BASE64, SANS_BASE64 } from '../generated/bundled-fonts.js';
import type { ResolvedFontPair } from '../types.js';

function b64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

let cachedFonts: ResolvedFontPair | undefined;

/**
 * Return the canonical bundled DejaVu font pair decoded with browser-compatible
 * APIs (`atob`). Result is cached after the first call so the ~1 MB decode only
 * runs once per page. Safe to call before wasm initialization.
 */
export function loadBundledFontsForBrowser(): ResolvedFontPair {
    if (!cachedFonts) {
        cachedFonts = {
            sans: { name: 'DejaVu Sans', bytes: b64ToBytes(SANS_BASE64), source: 'bundled' },
            mono: {
                name: 'DejaVu Sans Mono',
                bytes: b64ToBytes(MONO_BASE64),
                source: 'bundled',
            },
        };
    }
    return cachedFonts;
}

/** Test seam: drop the cached pair so isolated tests start fresh. */
export function _clearBrowserFontsCache(): void {
    cachedFonts = undefined;
}
