// @nowline/export — the shared export kernel.
//
// The single code path from `.nowline` source to any of the eight export
// artifacts (stageRoadmap: parse → resolve includes → load logo → schedule →
// layout; then renderSvg → format adapter).
// Every surface — the CLI, the `@nowline/mcp` server, the VS Code extension,
// and the Free/Pro web apps — runs this same code with the same inputs, so
// they all produce byte-for-byte identical output for the same source and the
// same pinned toolchain version.
//
// Spec: specs/export-determinism.md (the byte-identity precedent and the
// HostEnv / RenderInputs contract this surface implements).
//
// Staging is `@nowline/renderer`'s `stageRoadmap` (specs/surface-options.md
// §3.3); `exportStaged` exports a roadmap a caller already staged.

import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    type RawDiagnostic,
    type ResolveDiagnostic,
    serializeToJson,
} from '@nowline/core';
import type { ExportInputs, ResolvedFontPair } from '@nowline/export-core';
import type { NonWorkingDisplay, ThemeName } from '@nowline/layout';
import {
    type AssetResolver,
    type FontFamilies,
    renderSvg,
    type StagedRoadmap,
    type StageInputs,
    type StageLayout,
    type StageResult,
    stageRoadmap,
} from '@nowline/renderer';
import type { LangiumDocument } from 'langium';

export type { PdfOrientation, ResolvedFontPair } from '@nowline/export-core';
export type { NonWorkingDisplay, ThemeName } from '@nowline/layout';
export {
    civilDateInZone,
    type NormalizedZone,
    normalizeZone,
    type ResolveTodayOptions,
    resolveToday,
    TimezoneError,
} from '@nowline/layout';
export type { StagedRoadmap, StageResult } from '@nowline/renderer';

/**
 * Thrown when include resolution reports a wave-rule error (a coded or
 * `rule: 'wave'` diagnostic, specs/waves.md §6.1) and no other include error.
 * `message` is the same `@nowline/export: include error in …` text as the
 * plain include error; `diagnostics` carries every resolver diagnostic, errors
 * and warnings, so a surface can report the routed ones (see
 * `isRoutedResolveDiagnostic`) with file and line, like validator diagnostics.
 * Every other include error stays a plain `Error`.
 */
export class IncludeResolveError extends Error {
    readonly diagnostics: ResolveDiagnostic[];

    constructor(message: string, diagnostics: ResolveDiagnostic[]) {
        super(message);
        this.name = 'IncludeResolveError';
        this.diagnostics = diagnostics;
    }
}

/** The eight canonical export formats. Every surface produces exactly these. */
export type ExportFormat = 'svg' | 'png' | 'pdf' | 'html' | 'mermaid' | 'xlsx' | 'msproj' | 'json';

/**
 * The only environment-specific seam in the kernel. The host supplies I/O —
 * reading source/include/asset files and the resvg wasm bytes — and nothing
 * else. Every implementation must return identical bytes for identical inputs;
 * the host contributes I/O only, never a byte of the artifact (see
 * specs/export-determinism.md § Invariant).
 */
export interface HostEnv {
    /** Read a source / include / asset text file as UTF-8. Drives `include` resolution. */
    readSource(path: string): Promise<string>;
    /** Read a binary asset (logos, icons) referenced by the roadmap. */
    readAsset(path: string): Promise<Uint8Array>;
    /** Return the `resvg.wasm` bytes used by the PNG rasterizer. */
    loadWasm(): Promise<ArrayBuffer>;
}

/**
 * Everything the kernel needs that is neither the source text nor host I/O.
 * `today`, `locale`, `theme`, and `fonts` are explicit inputs — never ambient
 * reads of the system clock, time zone, or `navigator.language` — so the output
 * bytes are a pure function of (source, these inputs, pinned toolchain version).
 */
export interface RenderInputs {
    /**
     * Absolute path to the `.nowline` source file. Used as the base for
     * resolving relative `include` directives and relative asset references.
     * For in-memory sources with no includes/assets, pass any stable path
     * string (e.g. `'/dev/null/unnamed.nowline'`).
     */
    sourcePath: string;
    /** Now-line date. Always an explicit UTC midnight; never `Date.now()`. Omit to suppress the now-line. */
    today?: Date;
    /** Locale tag used to format timeline tick labels. Explicit; never the host's. */
    locale: string;
    /** Theme (light / dark / grayscale). */
    theme: ThemeName;
    /**
     * Pinned font byte buffers — canonical export embeds the bundled DejaVu
     * pair. Required for formats that rasterize or embed fonts (png, pdf).
     * Optional for text-only formats (svg, html, json, mermaid, msproj, xlsx).
     */
    fonts?: ResolvedFontPair;

    // ---- layout / render knobs ------------------------------------------
    /** Optional best-effort maximum canvas width in px; unset fits the content. */
    width?: number;
    /**
     * How the chart shows a calendar's non-working days (`hide` collapses them,
     * `show` draws shaded bands). Wins over the file's
     * `default roadmap non-working:` key; leave it unset (undefined) to let the
     * key apply, then `hide`. The schedule exporters (mermaid, msproj, xlsx)
     * take no display input, so their bytes are the same in both views.
     */
    nonWorking?: NonWorkingDisplay;
    /** Drop `<a>` links from the rendered SVG. */
    noLinks?: boolean;
    /** Treat render warnings (e.g. missing assets) as hard errors. */
    strict?: boolean;

    // ---- format-specific options ----------------------------------------
    /**
     * PDF page size: a preset name, a custom dimensions string, or a value
     * already parsed with `parsePageSize` (so a caller can reject a bad one
     * before rendering).
     */
    pageSize?: import('@nowline/export-core').PdfPageSize | string;
    /** PDF orientation. */
    orientation?: import('@nowline/export-core').PdfOrientation;
    /** PDF margin in points. */
    marginPt?: number;
    /** PNG pixel-density multiplier (default 2). */
    pngScale?: number;
    /** MS Project start-date override (YYYY-MM-DD). */
    msprojStart?: string;

    // ---- host callbacks ---------------------------------------------------
    /**
     * Called before layout with the routed (wave-rule) resolver diagnostics
     * when include resolution succeeds, which leaves only warnings (possibly
     * none). Errors throw `IncludeResolveError` instead. Never affects output.
     */
    onResolveDiagnostics?: (diagnostics: ResolveDiagnostic[]) => void;
    /**
     * Receives non-fatal notices about the artifact, such as the MS Project
     * lossy-feature summary. Never affects output. Omit to keep each
     * exporter's default (stderr), as before.
     */
    onNotice?: (message: string) => void;
    /**
     * Receives asset warnings, such as a `logo:` file that is missing or
     * unreadable (the render then proceeds without the logo) or SVG logo
     * content the sanitizer removed. Under `strict` they throw instead and
     * this is not called.
     */
    onWarning?: (message: string) => void;
}

// ---- Langium services singleton -----------------------------------------------
//
// One dedicated service instance for the export kernel, independent of the
// browser preview singleton. Mirrors the CLI pattern (packages/cli/src/core/parse.ts).

type Services = {
    shared: ReturnType<typeof createNowlineServices>['shared'];
    Nowline: NowlineServices;
};

let cachedServices: Services | undefined;

function getExportServices(): Services {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

// ---- JSON serializer ---------------------------------------------------------
//
// Delegates to core's `serializeToJson`. The one envelope difference: the
// stage parses from a synthetic `memory:///stage-N.nowline` URI, so it
// overrides `file.uri` with the raw `file://${sourcePath}` concatenation —
// not `URI.file()`, which would percent-encode and change the bytes the
// determinism gate hashes.

function serializeDocumentToJson(
    document: LangiumDocument<NowlineFile>,
    source: string,
    sourcePath: string,
): string {
    const doc = serializeToJson(document, source, {
        includePositions: true,
        uri: `file://${sourcePath}`,
    });
    return JSON.stringify(doc, null, 2);
}

// ---- MIME inference ----------------------------------------------------------

function guessMime(ref: string): string {
    const ext = ref.slice(ref.lastIndexOf('.')).toLowerCase();
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

function hostAssetResolver(host: HostEnv): AssetResolver {
    return async (ref: string) => {
        const bytes = await host.readAsset(ref);
        return { bytes, mime: guessMime(ref) };
    };
}

// ---- Argument checks ---------------------------------------------------------

function checkHostAndInputs(host: HostEnv, inputs: RenderInputs): void {
    if (
        typeof host?.readSource !== 'function' ||
        typeof host.readAsset !== 'function' ||
        typeof host.loadWasm !== 'function'
    ) {
        throw new TypeError('@nowline/export: host must implement the HostEnv interface.');
    }
    if (!(inputs?.today instanceof Date) && inputs?.today !== undefined) {
        throw new TypeError(
            '@nowline/export: inputs.today must be a Date (UTC midnight) or undefined.',
        );
    }
    if (typeof inputs?.sourcePath !== 'string' || inputs.sourcePath.length === 0) {
        throw new TypeError('@nowline/export: inputs.sourcePath must be a non-empty string.');
    }
}

const STAGE_LAYOUT_KEYS = ['theme', 'today', 'width', 'locale', 'nonWorking'] as const;

function sameLayoutValue(a: StageLayout[keyof StageLayout], b: unknown): boolean {
    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }
    return a === b;
}

/** A stage laid out with other options would export a different chart than `inputs` asks for. */
function checkStageMatches(stage: StagedRoadmap, inputs: RenderInputs): void {
    for (const key of STAGE_LAYOUT_KEYS) {
        if (!sameLayoutValue(stage.layout[key], inputs[key])) {
            throw new Error(
                `@nowline/export: the staged roadmap was laid out with a different ${key} than inputs.${key}.`,
            );
        }
    }
}

// ---- Staging -----------------------------------------------------------------

/** Lexer, parser and validator error messages, in document order. */
function errorMessages(diagnostics: RawDiagnostic[]): string[] {
    const errors: string[] = [];
    for (const raw of diagnostics) {
        if (raw.origin === 'lexer') {
            errors.push(raw.error.message);
        } else if (raw.origin === 'parser') {
            errors.push(raw.error.message);
        } else if (raw.diagnostic.severity === 1 /* DiagnosticSeverity.Error */) {
            errors.push(raw.diagnostic.message);
        }
    }
    return errors;
}

/** What a caller that has already parsed `source` may hand to {@link stageForExport}. */
export interface StageForExportOptions {
    /** A document the caller already parsed and validated from `source`. */
    document?: StageInputs['document'];
    /** The caller's Langium services, which built `document`. Omitted: the kernel's own. */
    services?: StageInputs['services'];
}

/**
 * Stage `source` the way the kernel does (`stageRoadmap` with the host's
 * source and asset reads, laid out with `inputs`) and return the raw result:
 * `invalid`, `include-error` or `staged`. A surface that reports the stage's
 * own diagnostics maps them itself, then hands a `staged` result to
 * {@link exportStaged}; {@link acceptStagedRoadmap} is the kernel's mapping.
 */
export function stageForExport(
    source: string,
    inputs: RenderInputs,
    host: HostEnv,
    options: StageForExportOptions = {},
): Promise<StageResult> {
    return stageRoadmap({
        source,
        sourcePath: inputs.sourcePath,
        services: options.services ?? getExportServices(),
        readSource: host.readSource.bind(host),
        assetResolver: hostAssetResolver(host),
        document: options.document,
        layout: inputs,
    });
}

/**
 * Map a stage result to the kernel's contract: validation and include errors
 * throw, routed warnings reach `onResolveDiagnostics`, and logo warnings
 * reach `onWarning` (or throw under `strict`). Returns the staged roadmap.
 */
export function acceptStagedRoadmap(stage: StageResult, inputs: RenderInputs): StagedRoadmap {
    if (stage.kind === 'invalid') {
        throw new Error(
            `@nowline/export: validation errors in ${inputs.sourcePath}: ${errorMessages(stage.diagnostics).join('; ')}`,
        );
    }

    // Include errors are more fundamental than wave-rule errors: any of them
    // keeps the plain throw. Wave-rule errors alone travel on a typed error.
    const includeError = (diag: ResolveDiagnostic): string =>
        `@nowline/export: include error in ${inputs.sourcePath}: ${diag.message}`;
    if (stage.kind === 'include-error') {
        if (stage.legacy) throw new Error(includeError(stage.legacy));
        const firstError = stage.routed.filter((d) => d.severity === 'error')[0];
        throw new IncludeResolveError(includeError(firstError), stage.resolved.diagnostics);
    }
    inputs.onResolveDiagnostics?.(stage.routed);

    // A failed logo load warns (throws under strict); the stage laid out as
    // if no logo were declared.
    if (inputs.strict && stage.warnings.length > 0) {
        throw new Error(
            `@nowline/export: render warnings (--strict): ${stage.warnings.join('; ')}`,
        );
    }
    for (const msg of stage.warnings) inputs.onWarning?.(msg);

    return stage;
}

/** Stage `source` and map the result to the kernel's contract. */
async function stageDocument(
    source: string,
    inputs: RenderInputs,
    host: HostEnv,
): Promise<StagedRoadmap> {
    return acceptStagedRoadmap(await stageForExport(source, inputs, host), inputs);
}

// ---- Rendering ---------------------------------------------------------------

/**
 * Pin the renderer's per-role families to the resolved fonts' real family
 * names so raster/preview SVG names exactly the bundled face. `serif` maps to
 * the sans family: the resolver has no serif role and raster already falls
 * back serif->sans (resvg has no serif face loaded), so this is behavior-
 * preserving while making the SVG explicit.
 */
function pinnedFamilies(fonts: ResolvedFontPair): FontFamilies {
    return { sans: fonts.sans.name, serif: fonts.sans.name, mono: fonts.mono.name };
}

/**
 * Render the staged model. The portable render (no `fontFamilies`, the
 * FONT_STACK) reports non-strict warnings to `onWarning`; a font-pinned
 * raster re-render does not repeat them. Every render embeds the stage's
 * logo bytes, so the logo is read once.
 */
async function renderStaged(
    stage: StagedRoadmap,
    inputs: RenderInputs,
    assetResolver: AssetResolver,
    fontFamilies?: FontFamilies,
): Promise<string> {
    const warnings: string[] = [];
    const svg = await renderSvg(stage.model, {
        assetResolver,
        logo: stage.logo,
        noLinks: inputs.noLinks ?? false,
        strict: inputs.strict ?? false,
        warn: (msg) => warnings.push(msg),
        fontFamilies,
    });
    if (inputs.strict && warnings.length > 0) {
        throw new Error(`@nowline/export: render warnings (--strict): ${warnings.join('; ')}`);
    }
    if (!fontFamilies) for (const msg of warnings) inputs.onWarning?.(msg);
    return svg;
}

// ---- Text encoding -----------------------------------------------------------

const encoder = new TextEncoder();

function toUtf8(text: string): Uint8Array {
    return encoder.encode(text);
}

// ---- Public API --------------------------------------------------------------

/**
 * Produce the export artifact for `source` in `format`. This is the single
 * code path to any exported artifact — no surface re-implements a stage.
 * It is `stageRoadmap` plus the kernel's error mapping, then `exportStaged`.
 *
 * Text formats (svg / json / html / mermaid / msproj) are returned as UTF-8
 * bytes; binary formats (png / pdf / xlsx) as their native bytes. Returning
 * Uint8Array for every format keeps the determinism gate able to `sha256` one
 * value per (fixture, format).
 */
export async function exportDocument(
    source: string,
    format: ExportFormat,
    inputs: RenderInputs,
    host: HostEnv,
): Promise<Uint8Array> {
    if (typeof source !== 'string') {
        throw new TypeError('@nowline/export: source must be a string.');
    }
    checkHostAndInputs(host, inputs);
    const stage = await stageDocument(source, inputs, host);
    return exportStaged(stage, format, inputs, host);
}

/**
 * Export a roadmap the caller already staged with `stageRoadmap`, so a
 * surface that stages once (for diagnostics or layout insights) does not
 * parse and lay out again. The stage must have been laid out with the same
 * theme, today, width, locale and non-working display as `inputs`; a
 * mismatch throws. The caller owns the stage's own errors and warnings
 * (`exportDocument` maps them to the kernel's contract first); this applies
 * `noLinks`, `strict` and `onWarning` to the render only.
 *
 * The SVG is rendered only for the formats that use it (svg, html, png, pdf).
 */
export async function exportStaged(
    stage: StagedRoadmap,
    format: ExportFormat,
    inputs: RenderInputs,
    host: HostEnv,
): Promise<Uint8Array> {
    checkHostAndInputs(host, inputs);
    checkStageMatches(stage, inputs);

    const assetResolver = hostAssetResolver(host);
    const portableSvg = (): Promise<string> => renderStaged(stage, inputs, assetResolver);
    const rasterSvg = (fonts: ResolvedFontPair): Promise<string> =>
        renderStaged(stage, inputs, assetResolver, pinnedFamilies(fonts));
    const exportInputs: ExportInputs = {
        model: stage.model,
        ast: stage.ast,
        resolved: stage.resolved,
        schedule: stage.schedule,
        sourcePath: inputs.sourcePath,
        today: inputs.today,
    };

    if (format === 'svg') {
        return toUtf8(await portableSvg());
    }

    if (format === 'json') {
        const source = stage.document.textDocument.getText();
        return toUtf8(serializeDocumentToJson(stage.document, source, inputs.sourcePath));
    }

    if (format === 'html') {
        const svg = await portableSvg();
        const mod = await import('@nowline/export-html');
        const html = await mod.exportHtml(exportInputs, svg);
        return toUtf8(html);
    }

    if (format === 'mermaid') {
        const mod = await import('@nowline/export-mermaid');
        const md = mod.exportMermaid(exportInputs);
        return toUtf8(md);
    }

    if (format === 'msproj') {
        const mod = await import('@nowline/export-msproj');
        const xml = mod.exportMsProjXml(exportInputs, {
            startDate: inputs.msprojStart,
            onLossy: inputs.onNotice,
        });
        return toUtf8(xml);
    }

    if (format === 'xlsx') {
        const mod = await import('@nowline/export-xlsx');
        const bytes = await mod.exportXlsx(exportInputs, { generated: inputs.today });
        return bytes;
    }

    if (format === 'png') {
        // The portable render still runs first: its warnings reach
        // `onWarning` (or throw under strict) before any raster work.
        await portableSvg();
        if (!inputs.fonts) {
            throw new TypeError('@nowline/export: inputs.fonts is required for png format.');
        }
        const wasmBytes = await host.loadWasm();
        const pngMod = await import('@nowline/export-png');
        await pngMod.initPngWasm(wasmBytes);
        // Raster with the pinned bundled family so the SVG resvg rasterizes
        // names exactly the embedded font (matches the live preview).
        const svg = await rasterSvg(inputs.fonts);
        const bytes = await pngMod.exportPng(exportInputs, svg, {
            scale: inputs.pngScale ?? 2,
            fonts: inputs.fonts,
        });
        return bytes;
    }

    if (format === 'pdf') {
        await portableSvg();
        if (!inputs.fonts) {
            throw new TypeError('@nowline/export: inputs.fonts is required for pdf format.');
        }
        const mod = await import('@nowline/export-pdf');
        // Same pinned-family raster SVG as PNG so PDF text names the embedded
        // font explicitly and stays consistent with preview + PNG.
        const svg = await rasterSvg(inputs.fonts);
        const bytes = await mod.exportPdf(exportInputs, svg, {
            pageSize: inputs.pageSize,
            orientation: inputs.orientation,
            marginPt: inputs.marginPt,
            fonts: inputs.fonts,
        });
        return bytes;
    }

    throw new Error(`@nowline/export: unsupported format "${format as string}".`);
}
