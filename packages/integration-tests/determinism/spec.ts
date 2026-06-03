// Cross-surface export-determinism gate — shared specification.
//
// This module is the single source of truth for *what* the gate checks: the
// fixture matrix, the canonical render inputs, the format coverage per
// surface, and the golden-manifest shape. It is intentionally free of any
// `node:*` import so the browser leg (Vitest browser mode) can import it too.
//
// Spec: specs/export-determinism.md § Enforcement. The precedent is that every
// surface produces byte-for-byte identical output for the same source, render
// inputs, and pinned toolchain version. This harness is the mechanism that
// turns "currently true" into "structurally guaranteed".

import type { ExportFormat, ThemeName } from '@nowline/export';

/**
 * Canonical now-line date for every gate render. UTC midnight, fixed so the
 * output is a pure function of source + toolchain. Matches the snapshot
 * harness (`FIXED_TODAY`) and `scripts/render-samples.mjs` so a gate SVG hash
 * lines up with the committed layout snapshots.
 */
export const GATE_TODAY = '2026-02-09';

/**
 * Canonical operator locale. A file's own `locale:` directive still wins for
 * content (so `minimal.fr.nowline` renders French regardless), exactly as the
 * CLI behaves — this is only the fallback when a file declines to declare one.
 */
export const GATE_LOCALE = 'en-US';

/** Canonical PNG pixel-density multiplier. */
export const GATE_PNG_SCALE = 2;

/** Canonical theme-independent render width is layout's default (undefined). */

/**
 * The eight canonical formats, checked across the Node surfaces (compiled CLI
 * binary + kernel-in-Node). Every format must be byte-identical across those
 * two surfaces — that is the v1 lock.
 */
export const NODE_FORMATS: readonly ExportFormat[] = [
    'json',
    'svg',
    'html',
    'mermaid',
    'msproj',
    'xlsx',
    'png',
    'pdf',
] as const;

/**
 * Formats checked in the headless browser. A deliberate subset:
 *   - `json`  proves the AST serialization is engine-independent (never ICU).
 *   - `svg`   surfaces any ICU date-label divergence directly in the text.
 *   - `png`   exercises the `@resvg/resvg-wasm` raster path that backs both
 *             "Export… → PNG" and "Copy as PNG", so one browser PNG hash
 *             covers both browser actions.
 * pdf/xlsx are heavyweight in-browser and add no determinism signal the svg
 * leg doesn't already give, so they stay Node-only.
 */
export const BROWSER_FORMATS: readonly ExportFormat[] = ['json', 'svg', 'png'] as const;

export interface GateFixture {
    /** Stable key used in the manifest (`<id>:<format>`). */
    id: string;
    /** Source basename under `dir`. */
    sourceFile: string;
    /**
     * Root for `sourceFile`: the repo's `examples/` or `tests/`, or this
     * package's own `determinism/fixtures/` for gate-specific sources.
     */
    dir: 'examples' | 'tests' | 'determinism';
    /** Theme to render with. */
    theme: ThemeName;
    /**
     * Eligible for the headless-browser leg. False for fixtures that need
     * filesystem `include`/asset resolution (the browser HostEnv is a
     * no-op reader), since the browser leg targets the render/raster path,
     * not include plumbing.
     */
    browser: boolean;
}

/**
 * The fixture matrix. Chosen to span the timeline scales that decide ICU
 * exposure:
 *   - `minimal` / `minimal-fr` use `scale:2w` → weeks ticks → `toLocaleString`
 *     month abbreviations → ICU-divergent (en and fr).
 *   - `platform-2026` spans a year → quarter/year ticks → no `Intl` → clean.
 *   - `isolate-include` exercises the include path (Node/CLI legs only).
 * The set deliberately includes both a clean and a known-divergent fixture so
 * the browser leg meaningfully exercises both branches.
 */
export const FIXTURES: readonly GateFixture[] = [
    // Clean (no Intl): quarters-scale ticks → browser bytes must equal Node.
    {
        id: 'clean-quarters',
        sourceFile: 'clean-quarters.nowline',
        dir: 'determinism',
        theme: 'light',
        browser: true,
    },
    {
        id: 'minimal',
        sourceFile: 'minimal.nowline',
        dir: 'examples',
        theme: 'light',
        browser: true,
    },
    {
        id: 'minimal-fr',
        sourceFile: 'minimal.fr.nowline',
        dir: 'examples',
        theme: 'light',
        browser: true,
    },
    {
        id: 'platform-2026',
        sourceFile: 'platform-2026.nowline',
        dir: 'examples',
        theme: 'light',
        browser: true,
    },
    {
        id: 'platform-2026-dark',
        sourceFile: 'platform-2026.nowline',
        dir: 'examples',
        theme: 'dark',
        browser: true,
    },
    {
        id: 'dependencies',
        sourceFile: 'dependencies.nowline',
        dir: 'examples',
        theme: 'light',
        browser: true,
    },
    {
        id: 'capacity',
        sourceFile: 'capacity.nowline',
        dir: 'examples',
        theme: 'light',
        browser: true,
    },
    { id: 'sizing', sourceFile: 'sizing.nowline', dir: 'examples', theme: 'light', browser: true },
    {
        id: 'nested-both-headers',
        sourceFile: 'nested-both-headers.nowline',
        dir: 'tests',
        theme: 'light',
        browser: true,
    },
    {
        id: 'isolate-include',
        sourceFile: 'isolate-include.nowline',
        dir: 'examples',
        theme: 'light',
        browser: false,
    },
] as const;

/** Manifest key for a (fixture, format) cell. */
export function cellKey(fixtureId: string, format: ExportFormat): string {
    return `${fixtureId}:${format}`;
}

export interface CellGolden {
    /**
     * SHA-256 (hex) of the canonical bytes — the kernel run in Node. This is
     * the pinned value the Node surfaces (kernel-in-Node, `npx @nowline/mcp`)
     * reproduce, and that the compiled CLI binary reproduces for every format
     * except the ones carrying a `cli` override below.
     */
    node: string;
    /**
     * True when this cell's bytes depend on `Intl`/`toLocaleString` (i.e. the
     * fixture renders weeks/months tick labels). Verified live by the gate's
     * detector so the classification can never silently rot.
     */
    icu: boolean;
    /**
     * SHA-256 (hex) of the **compiled CLI binary** output, present ONLY for
     * cells where the `bun compile` binary diverges from the Node kernel due to
     * a known *runtime* difference. Today the sole case is `pdf`: PDFKit's
     * `FlateDecode` stream compression goes through the host runtime's zlib, and
     * Bun's zlib and Node's zlib emit different (both valid) compressed bytes
     * for identical input. A recorded, reviewed value — not an omission — so the
     * known divergence stays pinned and any *new* drift turns the gate red.
     * Cells without `cli` assert `binary === node` (the v1 lock). See `cliNote`.
     */
    cli?: string;
    /**
     * SHA-256 (hex) of the kernel run in a headless browser. Present ONLY for
     * `icu: true` cells in the browser-covered format set, where the browser's
     * ICU/CLDR data can legitimately differ from Node's. A recorded, reviewed
     * value — not an omission — so the known divergence stays pinned and a
     * *new* divergence still turns the gate red. Clean cells assert
     * `browser === node` and store nothing here. See `tracking`.
     */
    browser?: string;
}

export interface DeterminismManifest {
    about: string;
    /** Tracking reference for the deferred ICU self-contained-formatter fix. */
    tracking: string;
    /** Tracking reference for the deferred Bun-vs-Node PDF (zlib) divergence. */
    cliTracking: string;
    today: string;
    locale: string;
    pngScale: number;
    /** Keyed by `cellKey(fixtureId, format)`. */
    cells: Record<string, CellGolden>;
}

/**
 * Tracking pointer for the deferred browser ICU fix (the only place the engine,
 * not the code, leaks into the bytes). Recorded in every divergent cell and in
 * the spec so the divergence is honest, not hidden.
 */
export const ICU_TRACKING =
    'Deferred: replace Intl-based axis-label formatting in @nowline/layout ' +
    'with a self-contained formatter (or pin ICU data) so the browser leg ' +
    'reaches full byte-identity. See specs/export-determinism.md § The ICU caveat.';

/**
 * Tracking pointer for the deferred PDF cross-runtime fix. The `bun compile`
 * CLI binary and Node emit different PDFKit `FlateDecode` byte streams because
 * each runtime's zlib differs; making the kernel's PDF path use a runtime-
 * independent deflate (or `compress:false`) would close it. Recorded in every
 * `cli`-override cell and in the spec so the divergence is honest, not hidden.
 */
export const CLI_TRACKING =
    'Deferred: PDFKit FlateDecode goes through the host runtime zlib, so the ' +
    'bun-compiled CLI binary and Node emit different (both valid) PDF bytes. ' +
    'Make the kernel PDF deflate runtime-independent for full binary↔Node ' +
    'identity. See specs/export-determinism.md § The PDF compression caveat.';

/** True when the harness should (re)write goldens instead of asserting them. */
export function isUpdateMode(env: Record<string, string | undefined>): boolean {
    return env.UPDATE_DETERMINISM_GOLDENS === '1';
}
