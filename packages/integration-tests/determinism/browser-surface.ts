// Cross-surface determinism gate — headless-browser surface (surface (c)).
//
// Runs the SAME `@nowline/export` kernel inside a real (headless) browser via
// Vitest browser mode. This is the leg that proves the kernel's render + raster
// path (`renderSvg` + `@resvg/resvg-wasm`) produces the same bytes a browser
// app would — the path behind both "Export… → PNG" and "Copy as PNG".
//
// MUST stay free of any `node:*` import: this module is bundled for the browser.
// Everything that needs the filesystem (reading the fixture source, the bundled
// DejaVu bytes, the resvg wasm) is fetched from the Node side through Vitest
// browser *commands* (see vitest.browser.config.ts), so the bytes are sourced
// from the exact same place the Node leg uses — guaranteeing identical inputs.

import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
    type ResolvedFontPair,
} from '@nowline/export';
import { commands } from 'vitest/browser';
import { GATE_LOCALE, GATE_PNG_SCALE, GATE_TODAY, type GateFixture } from './spec.js';

// Commands implemented on the Node side (vitest.browser.config.ts). Declared
// here so the browser code is typed and the server/browser contract is explicit.
declare module 'vitest/browser' {
    interface BrowserCommands {
        /** Canonical bundled-font pair, base64-encoded for the channel. */
        detFonts(): Promise<{
            sansName: string;
            monoName: string;
            sansB64: string;
            monoB64: string;
        }>;
        /** resvg wasm bytes, base64-encoded. */
        detWasm(): Promise<string>;
        /** A fixture's `.nowline` source text, by fixture id. */
        detSource(fixtureId: string): Promise<string>;
        /**
         * Update-mode writeback: record the browser SHA-256 for each cell.
         * The server merges into hashes.json, storing `browser` only where it
         * actually diverges from `node` (mirrors the `cli` override policy).
         */
        detRecordBrowser(
            entries: { key: string; hash: string; node: string; icu: boolean }[],
        ): Promise<void>;
    }
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ---- Cached canonical inputs (fetched once from the Node side) ---------------

let wasmCache: ArrayBuffer | undefined;
async function loadWasm(): Promise<ArrayBuffer> {
    if (!wasmCache) {
        const bytes = base64ToBytes(await commands.detWasm());
        wasmCache = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    return wasmCache;
}

let fontsCache: ResolvedFontPair | undefined;
async function browserFonts(): Promise<ResolvedFontPair> {
    if (!fontsCache) {
        const f = await commands.detFonts();
        fontsCache = {
            sans: { name: f.sansName, bytes: base64ToBytes(f.sansB64), source: 'headless' },
            mono: { name: f.monoName, bytes: base64ToBytes(f.monoB64), source: 'headless' },
        };
    }
    return fontsCache;
}

// ---- Browser HostEnv ---------------------------------------------------------

function createBrowserHost(): HostEnv {
    return {
        // Browser fixtures are self-contained (GateFixture.browser === false for
        // any fixture with `include`s), so these never fire. Throwing loudly
        // means a future asset/include-bearing fixture can't silently diverge.
        readSource: async (ref: string) => {
            throw new Error(
                `determinism(browser): unexpected include read "${ref}" — browser ` +
                    'fixtures must be self-contained (mark the fixture browser:false).',
            );
        },
        readAsset: async (ref: string) => {
            throw new Error(
                `determinism(browser): unexpected asset read "${ref}" — browser ` +
                    'fixtures must reference no external assets.',
            );
        },
        loadWasm,
    };
}

function gateToday(): Date {
    const [y, m, d] = GATE_TODAY.split('-').map((n) => Number.parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d));
}

export async function exportBrowser(
    fixture: GateFixture,
    format: ExportFormat,
): Promise<Uint8Array> {
    const source = await commands.detSource(fixture.id);
    const inputs: RenderInputs = {
        // The basename only — the Node/CLI legs strip the volatile directory
        // before hashing, so JSON `file.uri` reduces to `file://<basename>`
        // identically on every surface. No includes in browser fixtures, so
        // this value is otherwise inert.
        sourcePath: fixture.sourceFile,
        today: gateToday(),
        locale: GATE_LOCALE,
        theme: fixture.theme,
        fonts: await browserFonts(),
        pngScale: GATE_PNG_SCALE,
    };
    return exportDocument(source, format, inputs, createBrowserHost());
}

export async function hashBrowser(fixture: GateFixture, format: ExportFormat): Promise<string> {
    const bytes = await exportBrowser(fixture, format);
    // Hash the exact view, not the underlying buffer (which may be larger).
    const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', view);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
