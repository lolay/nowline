// @nowline/export — the shared export kernel.
//
// The single code path from `.nowline` source to any of the eight export
// artifacts (parse → resolve includes → layout → renderSvg → format adapter).
// Every surface — the CLI, the `@nowline/mcp` server, the VS Code extension,
// and the Free/Pro web apps — runs this same code with the same inputs, so
// they all produce byte-for-byte identical output for the same source and the
// same pinned toolchain version.
//
// Spec: specs/export-determinism.md (the byte-identity precedent and the
// HostEnv / RenderInputs contract this surface implements).
//
// Plan: s2 implements the kernel pipeline (parse → resolve → layout →
// renderSvg → format dispatch). s4 swaps export-png to resvg-wasm.

import {
    collectDocumentDiagnostics,
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    resolveIncludes,
} from '@nowline/core';
import type { ExportInputs, ResolvedFontPair } from '@nowline/export-core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { type AssetResolver, type FontFamilies, renderSvg } from '@nowline/renderer';
import type { AstNode, LangiumDocument } from 'langium';
import { URI } from 'langium';

export type { PdfOrientation, ResolvedFontPair } from '@nowline/export-core';
export type { ThemeName } from '@nowline/layout';

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
    /** Optional fixed canvas width in px. */
    width?: number;
    /** Drop `<a>` links from the rendered SVG. */
    noLinks?: boolean;
    /** Treat render warnings (e.g. missing assets) as hard errors. */
    strict?: boolean;

    // ---- format-specific options ----------------------------------------
    /** PDF page size — a preset name or a custom dimensions string. */
    pageSize?: string;
    /** PDF orientation. */
    orientation?: import('@nowline/export-core').PdfOrientation;
    /** PDF margin in points. */
    marginPt?: number;
    /** PNG pixel-density multiplier (default 2). */
    pngScale?: number;
    /** MS Project start-date override (YYYY-MM-DD). */
    msprojStart?: string;
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
let docCounter = 0;

function getExportServices(): Services {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

function freshUri(): URI {
    // Always mint a fresh URI — re-using one lets Langium mutate the prior
    // document in place, causing spurious diagnostics on repeated exports.
    return URI.parse(`memory:///kernel-${++docCounter}.nowline`);
}

// ---- Inline JSON serializer ---------------------------------------------------
//
// Equivalent to packages/cli/src/convert/schema.ts. Inlined here so the kernel
// has no dependency on @nowline/cli.

const JSON_SCHEMA_VERSION = '1';
const CONTAINER_KEYS = new Set(['$container', '$containerProperty', '$containerIndex']);
const RUNTIME_KEYS = new Set(['$cstNode', '$document']);

function isAstNode(v: unknown): v is AstNode {
    return (
        v !== null && typeof v === 'object' && typeof (v as { $type?: unknown }).$type === 'string'
    );
}

function serializeNode(node: AstNode, includePositions: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = { $type: node.$type };
    if (includePositions && node.$cstNode) {
        const cst = node.$cstNode;
        out.$position = {
            start: {
                line: cst.range.start.line + 1,
                column: cst.range.start.character + 1,
                offset: cst.offset,
            },
            end: {
                line: cst.range.end.line + 1,
                column: cst.range.end.character + 1,
                offset: cst.end,
            },
        };
    }
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('$') || CONTAINER_KEYS.has(key) || RUNTIME_KEYS.has(key)) continue;
        out[key] = serializeValue(value, includePositions);
    }
    return out;
}

function serializeValue(value: unknown, includePositions: boolean): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((v) => serializeValue(v, includePositions));
    if (isAstNode(value)) return serializeNode(value, includePositions);
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (k.startsWith('$') || CONTAINER_KEYS.has(k) || RUNTIME_KEYS.has(k)) continue;
            out[k] = serializeValue(v, includePositions);
        }
        return out;
    }
    return value;
}

function serializeDocumentToJson(
    document: LangiumDocument<NowlineFile>,
    source: string,
    sourcePath: string,
): string {
    const ast = document.parseResult.value;
    return JSON.stringify(
        {
            $nowlineSchema: JSON_SCHEMA_VERSION,
            file: { uri: `file://${sourcePath}`, source },
            ast: serializeNode(ast, true),
        },
        null,
        2,
    );
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

// ---- Staged pipeline ---------------------------------------------------------

interface StageResult {
    /** SVG rendered with the portable FONT_STACK (for `svg` / `html` exports). */
    svg: string;
    /**
     * Re-render the already-laid-out model with a pinned `font-family` map.
     * Used by the raster paths (png/pdf) so the exported pixels name exactly
     * the bundled font and match the live preview (WYSIWYG). Reuses the same
     * asset resolver and strict/warn handling as the portable render.
     */
    renderWith: (fontFamilies: FontFamilies) => Promise<string>;
    exportInputs: ExportInputs;
    document: LangiumDocument<NowlineFile>;
    source: string;
}

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

async function stageDocument(
    source: string,
    inputs: RenderInputs,
    host: HostEnv,
): Promise<StageResult> {
    const services = getExportServices();
    const uri = freshUri();

    const doc = services.shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        source,
        uri,
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });

    const errors: string[] = [];
    for (const raw of collectDocumentDiagnostics(doc)) {
        if (raw.origin === 'lexer') {
            errors.push(raw.error.message);
        } else if (raw.origin === 'parser') {
            errors.push(raw.error.message);
        } else if (raw.diagnostic.severity === 1 /* DiagnosticSeverity.Error */) {
            errors.push(raw.diagnostic.message);
        }
    }
    if (errors.length > 0) {
        throw new Error(
            `@nowline/export: validation errors in ${inputs.sourcePath}: ${errors.join('; ')}`,
        );
    }

    const ast = doc.parseResult.value;

    const resolved = await resolveIncludes(ast, inputs.sourcePath, {
        services: services.Nowline,
        readFile: host.readSource.bind(host),
    });
    for (const diag of resolved.diagnostics) {
        if (diag.severity === 'error') {
            throw new Error(
                `@nowline/export: include error in ${inputs.sourcePath}: ${diag.message}`,
            );
        }
    }

    const model = layoutRoadmap(ast, resolved, {
        theme: inputs.theme,
        today: inputs.today,
        width: inputs.width,
        locale: inputs.locale,
    });

    const assetResolver: AssetResolver = async (ref: string) => {
        const bytes = await host.readAsset(ref);
        return { bytes, mime: guessMime(ref) };
    };

    const renderWith = async (fontFamilies?: FontFamilies): Promise<string> => {
        const warnings: string[] = [];
        const svg = await renderSvg(model, {
            assetResolver,
            noLinks: inputs.noLinks ?? false,
            strict: inputs.strict ?? false,
            warn: (msg) => warnings.push(msg),
            fontFamilies,
        });
        if (inputs.strict && warnings.length > 0) {
            throw new Error(`@nowline/export: render warnings (--strict): ${warnings.join('; ')}`);
        }
        return svg;
    };

    // Portable render (FONT_STACK) for the svg/html file exports.
    const svg = await renderWith();

    return {
        svg,
        renderWith: (fontFamilies: FontFamilies) => renderWith(fontFamilies),
        exportInputs: {
            model,
            ast,
            resolved,
            sourcePath: inputs.sourcePath,
            today: inputs.today,
        },
        document: doc,
        source,
    };
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
 *
 * Text formats (svg / json / html / mermaid / msproj) are returned as UTF-8
 * bytes; binary formats (png / pdf / xlsx) as their native bytes. Returning
 * Uint8Array for every format keeps the determinism gate able to `sha256` one
 * value per (fixture, format).
 *
 * Note: PNG rasterizes via @nowline/export-png (native resvg-js) until s4
 * swaps it to @resvg/resvg-wasm. The `host.loadWasm()` seam is reserved for
 * that swap and is not called here yet.
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

    const stage = await stageDocument(source, inputs, host);

    if (format === 'svg') {
        return toUtf8(stage.svg);
    }

    if (format === 'json') {
        return toUtf8(serializeDocumentToJson(stage.document, stage.source, inputs.sourcePath));
    }

    if (format === 'html') {
        const mod = await import('@nowline/export-html');
        const html = await mod.exportHtml(stage.exportInputs, stage.svg);
        return toUtf8(html);
    }

    if (format === 'mermaid') {
        const mod = await import('@nowline/export-mermaid');
        const md = mod.exportMermaid(stage.exportInputs);
        return toUtf8(md);
    }

    if (format === 'msproj') {
        const mod = await import('@nowline/export-msproj');
        const xml = mod.exportMsProjXml(stage.exportInputs, {
            startDate: inputs.msprojStart,
        });
        return toUtf8(xml);
    }

    if (format === 'xlsx') {
        const mod = await import('@nowline/export-xlsx');
        const bytes = await mod.exportXlsx(stage.exportInputs, { generated: inputs.today });
        return bytes;
    }

    if (format === 'png') {
        if (!inputs.fonts) {
            throw new TypeError('@nowline/export: inputs.fonts is required for png format.');
        }
        const wasmBytes = await host.loadWasm();
        const pngMod = await import('@nowline/export-png');
        await pngMod.initPngWasm(wasmBytes);
        // Raster with the pinned bundled family so the SVG resvg rasterizes
        // names exactly the embedded font (matches the live preview).
        const rasterSvg = await stage.renderWith(pinnedFamilies(inputs.fonts));
        const bytes = await pngMod.exportPng(stage.exportInputs, rasterSvg, {
            scale: inputs.pngScale ?? 2,
            fonts: inputs.fonts,
        });
        return bytes;
    }

    if (format === 'pdf') {
        if (!inputs.fonts) {
            throw new TypeError('@nowline/export: inputs.fonts is required for pdf format.');
        }
        const mod = await import('@nowline/export-pdf');
        // Same pinned-family raster SVG as PNG so PDF text names the embedded
        // font explicitly and stays consistent with preview + PNG.
        const rasterSvg = await stage.renderWith(pinnedFamilies(inputs.fonts));
        const bytes = await mod.exportPdf(stage.exportInputs, rasterSvg, {
            pageSize: inputs.pageSize,
            orientation: inputs.orientation,
            marginPt: inputs.marginPt,
            fonts: inputs.fonts,
        });
        return bytes;
    }

    throw new Error(`@nowline/export: unsupported format "${format as string}".`);
}
