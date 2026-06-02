// In-process exporter for all nowline export formats.
//
// Mirrors the CLI's produce() pipeline (packages/cli/src/commands/render.ts)
// without spawning a subprocess, so export works with zero external install.
//
// PNG uses @resvg/resvg-wasm (pure WASM) instead of the native @resvg/resvg-js,
// which keeps a single universal .vsix. The .wasm binary is copied to dist/ by
// bundle.mjs and loaded lazily on first PNG export.
//
// Spec: specs/ide.md § Export to other formats.
// Plan: extension_in-process_export_0bc966fd.plan.md s2+s3.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
    collectDocumentDiagnostics,
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    resolveIncludes,
} from '@nowline/core';
import {
    type ExportInputs,
    lengthToPoints,
    parseLength,
    type ResolvedFontPair,
    resolveFonts,
} from '@nowline/export-core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { type AssetResolver, renderSvg } from '@nowline/renderer';
import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import type { ExportSettings } from './cli-runner.js';

// ---- Langium services -------------------------------------------------------
//
// A dedicated service instance for the export pipeline, independent of the
// browser package's singleton (which drives the live preview). Having two
// service instances is the same pattern the CLI and language server use.

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
    return URI.parse(`memory:///export-${++docCounter}.nowline`);
}

// ---- WASM PNG rasterizer ----------------------------------------------------
//
// Replicates exportPng() from @nowline/export-png but uses @resvg/resvg-wasm
// instead of @resvg/resvg-js to avoid native .node addons that cannot be
// bundled into a universal .vsix.
//
// Spike result (s1): 1.76% of pixels differ from native @resvg/resvg-js
// output (sub-pixel text anti-aliasing), acceptable for extension export.

let extensionDistPath: string | undefined;
let wasmInitialized = false;

/**
 * Register the extension's `dist/` directory so the in-process exporter can
 * find `resvg.wasm` at runtime. Call once from `extension.ts` `activate()`
 * with `path.join(context.extensionPath, 'dist')`.
 */
export function initExportRuntime(distPath: string): void {
    extensionDistPath = distPath;
}

async function ensureWasmInitialized(): Promise<void> {
    if (wasmInitialized) return;
    if (!extensionDistPath) {
        throw new Error(
            'Nowline: initExportRuntime() was not called before PNG export. ' +
                'This is an extension bug — please file an issue.',
        );
    }
    // dist/resvg.wasm is copied from @resvg/resvg-wasm/index_bg.wasm by bundle.mjs.
    const wasmPath = path.join(extensionDistPath, 'resvg.wasm');
    const wasmBin = await fs.readFile(wasmPath);
    const { initWasm } = await import('@resvg/resvg-wasm');
    await initWasm(wasmBin.buffer);
    wasmInitialized = true;
}

/** Test seam: reset WASM and distPath state between isolated tests. */
export function _resetWasmInit(): void {
    wasmInitialized = false;
    extensionDistPath = undefined;
}

// Workaround: resvg-wasm (like resvg-js ≤ 2.6.x) silently disables fitTo
// when fontBuffers are supplied. Pre-multiply root <svg width/height> by
// scale so the rasterized grid grows while preserving vector geometry.
const ROOT_SVG_RE = /<svg\b([^>]*)>/i;
const WIDTH_RE = /\bwidth="([\d.]+)(px)?"/i;
const HEIGHT_RE = /\bheight="([\d.]+)(px)?"/i;

function scaleRootSvgDimensions(svg: string, scale: number): string {
    const match = ROOT_SVG_RE.exec(svg);
    if (!match) return svg;
    const attrs = match[1];
    const wm = WIDTH_RE.exec(attrs);
    const hm = HEIGHT_RE.exec(attrs);
    if (!wm || !hm) return svg;
    const newWidth = Number(wm[1]) * scale;
    const newHeight = Number(hm[1]) * scale;
    let nextAttrs = attrs.replace(WIDTH_RE, `width="${newWidth}"`);
    nextAttrs = nextAttrs.replace(HEIGHT_RE, `height="${newHeight}"`);
    return svg.replace(ROOT_SVG_RE, `<svg${nextAttrs}>`);
}

async function rasterizePngWasm(
    svg: string,
    fontPair: ResolvedFontPair,
    scale: number,
): Promise<Uint8Array> {
    await ensureWasmInitialized();
    const { Resvg } = await import('@resvg/resvg-wasm');
    const scaledSvg = scale === 1 ? svg : scaleRootSvgDimensions(svg, scale);
    const sansBytes = new Uint8Array(
        fontPair.sans.bytes.buffer,
        fontPair.sans.bytes.byteOffset,
        fontPair.sans.bytes.byteLength,
    );
    const monoBytes = new Uint8Array(
        fontPair.mono.bytes.buffer,
        fontPair.mono.bytes.byteOffset,
        fontPair.mono.bytes.byteLength,
    );
    const renderer = new Resvg(scaledSvg, {
        font: {
            fontBuffers: [sansBytes, monoBytes],
            defaultFontFamily: fontPair.sans.name,
            sansSerifFamily: fontPair.sans.name,
            monospaceFamily: fontPair.mono.name,
        },
    });
    const rendered = renderer.render();
    const bytes = rendered.asPng();
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// ---- JSON serializer (inlined from packages/cli/src/convert/schema.ts) -----
//
// serializeToJson lives in the CLI package (not @nowline/core's public API),
// so we inline the pure utility here rather than adding a CLI dep.

const CONTAINER_KEYS = new Set(['$container', '$containerProperty', '$containerIndex']);
const RUNTIME_KEYS = new Set(['$cstNode', '$document']);

function isAstNode(v: unknown): v is import('langium').AstNode {
    return (
        v !== null && typeof v === 'object' && typeof (v as { $type?: unknown }).$type === 'string'
    );
}

function serializeNodeLocal(
    node: import('langium').AstNode,
    includePositions: boolean,
): Record<string, unknown> {
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
        out[key] = serializeValueLocal(value, includePositions);
    }
    return out;
}

function serializeValueLocal(value: unknown, includePositions: boolean): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((v) => serializeValueLocal(v, includePositions));
    if (isAstNode(value)) return serializeNodeLocal(value, includePositions);
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (k.startsWith('$') || CONTAINER_KEYS.has(k) || RUNTIME_KEYS.has(k)) continue;
            out[k] = serializeValueLocal(v, includePositions);
        }
        return out;
    }
    return value;
}

function serializeDocumentToJson(doc: LangiumDocument<NowlineFile>, source: string): string {
    const ast = doc.parseResult.value;
    return JSON.stringify(
        {
            $nowlineSchema: '1',
            file: { uri: doc.uri.toString(), source },
            ast: serializeNodeLocal(ast, true),
        },
        null,
        2,
    );
}

// ---- Asset resolver (mirrors CLI's createAssetResolver) ---------------------

function createExportAssetResolver(assetRoot: string): AssetResolver {
    const root = path.resolve(assetRoot);
    return async (ref: string) => {
        const absPath = path.resolve(root, ref);
        if (!absPath.startsWith(root + path.sep) && absPath !== root) {
            throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
        }
        const bytes = await fs.readFile(absPath);
        return {
            bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            mime: guessMime(absPath),
        };
    };
}

function guessMime(p: string): string {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

// ---- Staging pipeline -------------------------------------------------------

interface StageResult {
    svg: string;
    exportInputs: ExportInputs;
    document: LangiumDocument<NowlineFile>;
    source: string;
}

async function stageDocument(sourcePath: string, today: Date): Promise<StageResult> {
    const source = await fs.readFile(sourcePath, 'utf-8');
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
        throw new Error(`nowline: ${errors.join('; ')}`);
    }

    const ast = doc.parseResult.value;
    const readFile = async (absPath: string) => {
        const bytes = await fs.readFile(absPath);
        return new TextDecoder('utf-8').decode(bytes);
    };
    const resolved = await resolveIncludes(ast, sourcePath, {
        services: services.Nowline,
        readFile,
    });
    for (const diag of resolved.diagnostics) {
        if (diag.severity === 'error') {
            throw new Error(`nowline: include error: ${diag.message}`);
        }
    }

    const theme: ThemeName = 'light';
    const model = layoutRoadmap(ast, resolved, {
        theme,
        today,
        locale: undefined,
        width: undefined,
    });
    const svg = await renderSvg(model, {
        assetResolver: createExportAssetResolver(path.dirname(sourcePath)),
        noLinks: false,
        strict: false,
        warn: () => {},
    });

    return {
        svg,
        exportInputs: {
            model,
            ast,
            resolved,
            sourcePath: path.basename(sourcePath),
            today,
        },
        document: doc,
        source,
    };
}

// ---- Font resolution --------------------------------------------------------

async function resolveExportFonts(settings: ExportSettings): Promise<ResolvedFontPair> {
    const result = await resolveFonts({
        fontSans: settings.fontSans || undefined,
        fontMono: settings.fontMono || undefined,
        headless: settings.headlessFonts,
    });
    return { sans: result.sans, mono: result.mono };
}

// ---- Option parsers ---------------------------------------------------------

function parsePdfOrientation(raw: string): 'portrait' | 'landscape' | 'auto' | undefined {
    const lower = raw.toLowerCase();
    if (lower === 'portrait' || lower === 'landscape' || lower === 'auto') return lower;
    return undefined;
}

function parsePdfMargin(raw: string): number | undefined {
    if (!raw) return undefined;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    try {
        return lengthToPoints(parseLength(raw));
    } catch {
        return undefined;
    }
}

function todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ---- Public interface -------------------------------------------------------

export type ExportFormat = 'pdf' | 'png' | 'svg' | 'html' | 'mermaid' | 'xlsx' | 'msproj' | 'json';

export interface InProcessExportResult {
    rendered: Uint8Array | string;
    isBinary: boolean;
}

/**
 * Produce export output in-process for the given format, mirroring the CLI's
 * produce() without spawning a subprocess.
 *
 * @param sourcePath  Absolute filesystem path to the .nowline source file.
 * @param format      Target export format.
 * @param settings    Resolved nowline.export.* VS Code settings.
 * @param today       Optional date override for the now-line (defaults to UTC today).
 */
export async function exportInProcess(
    sourcePath: string,
    format: ExportFormat,
    settings: ExportSettings,
    today?: Date,
): Promise<InProcessExportResult> {
    const resolvedToday = today ?? todayUtc();
    const stage = await stageDocument(sourcePath, resolvedToday);

    if (format === 'svg') {
        return { rendered: stage.svg, isBinary: false };
    }

    if (format === 'json') {
        return {
            rendered: serializeDocumentToJson(stage.document, stage.source),
            isBinary: false,
        };
    }

    if (format === 'html') {
        const { exportHtml } = await import('@nowline/export-html');
        return { rendered: await exportHtml(stage.exportInputs, stage.svg), isBinary: false };
    }

    if (format === 'mermaid') {
        const { exportMermaid } = await import('@nowline/export-mermaid');
        return { rendered: exportMermaid(stage.exportInputs), isBinary: false };
    }

    if (format === 'msproj') {
        const { exportMsProjXml } = await import('@nowline/export-msproj');
        return {
            rendered: exportMsProjXml(stage.exportInputs, {
                startDate: settings.msprojStart || undefined,
            }),
            isBinary: false,
        };
    }

    if (format === 'xlsx') {
        const { exportXlsx } = await import('@nowline/export-xlsx');
        const bytes = await exportXlsx(stage.exportInputs, { generated: resolvedToday });
        return { rendered: bytes, isBinary: true };
    }

    // Formats below require font resolution.
    const fontPair = await resolveExportFonts(settings);

    if (format === 'png') {
        const scale = settings.pngScale > 0 ? settings.pngScale : 1;
        const bytes = await rasterizePngWasm(stage.svg, fontPair, scale);
        return { rendered: bytes, isBinary: true };
    }

    if (format === 'pdf') {
        const { exportPdf } = await import('@nowline/export-pdf');
        const bytes = await exportPdf(stage.exportInputs, stage.svg, {
            pageSize: settings.pdfPageSize || undefined,
            orientation: parsePdfOrientation(settings.pdfOrientation),
            marginPt: parsePdfMargin(settings.pdfMargin),
            fonts: fontPair,
        });
        return { rendered: bytes, isBinary: true };
    }

    throw new Error(`nowline: unsupported export format "${format}"`);
}
