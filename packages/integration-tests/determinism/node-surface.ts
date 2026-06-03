// Cross-surface determinism gate — Node surface helpers.
//
// Runs the `@nowline/export` kernel directly in Node (surface (b) of the gate)
// and owns everything that needs `node:*`: the fs-backed HostEnv, the canonical
// bundled-font pair, sha-256 hashing, the ICU-dependence detector, and reading
// /writing the golden manifest. The browser leg (surface (c)) has its own,
// node-free counterpart in `browser-surface.ts`.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
} from '@nowline/export';
import { type ResolvedFontPair, resolveFonts } from '@nowline/export-core';
import {
    CLI_TRACKING,
    type DeterminismManifest,
    FIXTURES,
    GATE_LOCALE,
    GATE_PNG_SCALE,
    GATE_TODAY,
    type GateFixture,
    ICU_TRACKING,
} from './spec.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// determinism/ -> integration-tests/ -> packages/ -> repo root
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const MANIFEST_PATH = path.join(HERE, 'hashes.json');

const require = createRequire(import.meta.url);

export function fixtureSourcePath(fixture: GateFixture): string {
    if (fixture.dir === 'determinism') {
        return path.join(HERE, 'fixtures', fixture.sourceFile);
    }
    return path.join(REPO_ROOT, fixture.dir, fixture.sourceFile);
}

export function findFixture(id: string): GateFixture {
    const f = FIXTURES.find((x) => x.id === id);
    if (!f) throw new Error(`determinism: no fixture with id "${id}"`);
    return f;
}

export function sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

// ---- Source-path normalization ----------------------------------------------
//
// Two exporters echo the absolute source path into their bytes: the JSON
// serializer (`file.uri = file://<sourcePath>`) and the PDF exporter (the
// `Subject` Info-dictionary entry). That path is an *input*, not engine output,
// and it is machine-specific (`/Users/you/...` vs `/home/runner/...`), so left
// raw it would make the goldens non-portable across checkouts and CI.
//
// The gate strips the volatile *directory* prefix from every artifact before
// hashing — uniformly on all surfaces — keeping the stable basename. So the
// JSON `file.uri` reduces to `file://<basename>` and the PDF `Subject` to the
// basename, identically everywhere, while every other byte is compared
// verbatim. The browser leg feeds the basename directly (it has no includes),
// so it needs no normalization; the Node and CLI legs feed the absolute path
// (needed for include resolution) and strip it here.

/** Replace every occurrence of `needle` bytes in `haystack` with nothing. */
function deleteBytes(haystack: Uint8Array, needle: Uint8Array): Uint8Array {
    if (needle.length === 0) return haystack;
    const out: number[] = [];
    let i = 0;
    outer: while (i < haystack.length) {
        if (i + needle.length <= haystack.length) {
            for (let j = 0; j < needle.length; j++) {
                if (haystack[i + j] !== needle[j]) {
                    out.push(haystack[i]);
                    i++;
                    continue outer;
                }
            }
            i += needle.length; // matched — drop it
            continue;
        }
        out.push(haystack[i]);
        i++;
    }
    return Uint8Array.from(out);
}

const utf8 = new TextEncoder();

/**
 * Strip the machine-specific source *directory* (keeping the basename) from an
 * artifact's bytes so JSON `file.uri` / PDF `Subject` are portable. `absPath`
 * is the absolute source path that surface embedded.
 */
export function stripVolatilePath(bytes: Uint8Array, absPath: string): Uint8Array {
    const dirWithSep = `${path.dirname(absPath)}/`;
    return deleteBytes(bytes, utf8.encode(dirWithSep));
}

// ---- Canonical fonts --------------------------------------------------------

let cachedFonts: ResolvedFontPair | undefined;

/** The bundled DejaVu pair every canonical export embeds (headless resolver). */
export async function canonicalFonts(): Promise<ResolvedFontPair> {
    if (!cachedFonts) {
        const result = await resolveFonts({ headless: true });
        cachedFonts = { sans: result.sans, mono: result.mono };
    }
    return cachedFonts;
}

// ---- Node HostEnv -----------------------------------------------------------

let cachedWasm: ArrayBuffer | undefined;

/**
 * The `@resvg/resvg-wasm` binary bytes — the single rasterizer every surface
 * shares. The browser leg pulls these (base64) through a Vitest command so it
 * rasterizes with byte-identical wasm to the Node leg.
 */
export async function loadResvgWasm(): Promise<ArrayBuffer> {
    if (cachedWasm) return cachedWasm;
    const entry = require.resolve('@resvg/resvg-wasm');
    const wasmPath = path.join(path.dirname(entry), 'index_bg.wasm');
    const buf = await fs.readFile(wasmPath);
    cachedWasm = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return cachedWasm;
}

/** Filesystem-backed HostEnv rooted at the fixture's directory (asset root). */
export function createNodeHost(assetRoot: string): HostEnv {
    const root = path.resolve(assetRoot);
    return {
        readSource: (absPath) => fs.readFile(absPath, 'utf-8'),
        readAsset: async (ref) => {
            const absPath = path.resolve(root, ref);
            if (!absPath.startsWith(root + path.sep) && absPath !== root) {
                throw new Error(`determinism: asset ${ref} escapes asset-root ${assetRoot}`);
            }
            const bytes = await fs.readFile(absPath);
            return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        },
        loadWasm: () => loadResvgWasm(),
    };
}

// ---- Canonical render inputs ------------------------------------------------

function gateToday(): Date {
    const [y, m, d] = GATE_TODAY.split('-').map((n) => Number.parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d));
}

export async function buildInputs(fixture: GateFixture): Promise<RenderInputs> {
    return {
        sourcePath: fixtureSourcePath(fixture),
        today: gateToday(),
        locale: GATE_LOCALE,
        theme: fixture.theme,
        fonts: await canonicalFonts(),
        pngScale: GATE_PNG_SCALE,
    };
}

// ---- Kernel-in-Node export --------------------------------------------------

export async function exportNode(fixture: GateFixture, format: ExportFormat): Promise<Uint8Array> {
    const source = await fs.readFile(fixtureSourcePath(fixture), 'utf-8');
    const inputs = await buildInputs(fixture);
    const host = createNodeHost(path.dirname(inputs.sourcePath));
    return exportDocument(source, format, inputs, host);
}

export async function hashNode(fixture: GateFixture, format: ExportFormat): Promise<string> {
    const bytes = await exportNode(fixture, format);
    return sha256(stripVolatilePath(bytes, fixtureSourcePath(fixture)));
}

// ---- ICU-dependence detector ------------------------------------------------
//
// Honest, per-cell classification of whether a (fixture, format) output depends
// on `Intl`/`toLocaleString` (the one cross-engine leak). We export the cell
// once normally, then again with `Date.prototype.toLocaleString` monkeypatched
// to a constant sentinel; if the bytes change, the output reads ICU data and is
// allowed to diverge in the browser. This drives the `icu` flag in the manifest
// and is re-checked on every gate run so the classification cannot rot.

// Printable, XML-safe, font-renderable token distinct from any real month
// abbreviation or quarter label. Must be valid inside SVG text / PDF strings
// so the patched PNG/PDF render still rasterizes (a NUL would break the XML).
const ICU_SENTINEL = 'IcuMark';

export async function detectIcu(fixture: GateFixture, format: ExportFormat): Promise<boolean> {
    const normal = await exportNode(fixture, format);
    const original = Date.prototype.toLocaleString;
    let patched: Uint8Array;
    try {
        // biome-ignore lint/complexity/useArrowFunction: needs its own `this`.
        Date.prototype.toLocaleString = function () {
            return ICU_SENTINEL;
        };
        patched = await exportNode(fixture, format);
    } finally {
        Date.prototype.toLocaleString = original;
    }
    return sha256(normal) !== sha256(patched);
}

// ---- Manifest IO ------------------------------------------------------------

export async function loadManifest(): Promise<DeterminismManifest | undefined> {
    try {
        const text = await fs.readFile(MANIFEST_PATH, 'utf-8');
        return JSON.parse(text) as DeterminismManifest;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw err;
    }
}

export async function saveManifest(manifest: DeterminismManifest): Promise<void> {
    const ordered: DeterminismManifest = {
        about: manifest.about,
        tracking: manifest.tracking,
        cliTracking: manifest.cliTracking,
        today: manifest.today,
        locale: manifest.locale,
        pngScale: manifest.pngScale,
        cells: sortCells(manifest.cells),
    };
    // 4-space indent + trailing LF to match the repo's biome JSON formatter
    // (indentWidth 4), so `make lint` never flags the generated manifest.
    await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(ordered, null, 4)}\n`, 'utf-8');
}

function sortCells(cells: DeterminismManifest['cells']): DeterminismManifest['cells'] {
    const out: DeterminismManifest['cells'] = {};
    // Canonical key order per cell (node, icu, cli?, browser?) regardless of
    // which leg wrote last, so the Node and browser update passes never churn
    // each other's formatting.
    for (const key of Object.keys(cells).sort()) {
        const c = cells[key];
        out[key] = {
            node: c.node,
            icu: c.icu,
            ...(c.cli ? { cli: c.cli } : {}),
            ...(c.browser ? { browser: c.browser } : {}),
        };
    }
    return out;
}

export function emptyManifest(): DeterminismManifest {
    return {
        about:
            'Cross-surface export-determinism goldens. `node` is the canonical ' +
            'SHA-256 every Node surface (compiled CLI binary, kernel-in-Node, MCP) ' +
            'must reproduce. `cli` is a recorded compiled-binary override for the ' +
            'few cells where the bun-compiled runtime diverges from Node (today: ' +
            'every pdf, via zlib). `browser` is a recorded headless-browser ' +
            'override for cells whose bytes diverge from Node in a browser (the ' +
            'deferred ICU date-label leak). The volatile source *directory* is ' +
            'stripped from every artifact before hashing (JSON file.uri / PDF ' +
            'Subject keep only the basename) so goldens are portable across ' +
            'checkouts and CI. Regenerate deliberately with ' +
            'UPDATE_DETERMINISM_GOLDENS=1 on a toolchain-version bump.',
        tracking: ICU_TRACKING,
        cliTracking: CLI_TRACKING,
        today: GATE_TODAY,
        locale: GATE_LOCALE,
        pngScale: GATE_PNG_SCALE,
        cells: {},
    };
}
