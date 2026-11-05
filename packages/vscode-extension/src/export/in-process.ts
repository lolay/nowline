// In-process exporter for all nowline export formats.
//
// Delegates the full parse → resolve → layout → render → format pipeline to
// the shared @nowline/export kernel, providing a Node fs-backed HostEnv.
// Using one kernel keeps the extension output byte-for-byte identical to the
// CLI for the same source and the same render inputs.
//
// PNG/PDF require the resvg.wasm binary; initExportRuntime() registers the
// extension's dist/ directory so loadWasm() can find it.
//
// Spec: specs/ide.md § Export to other formats.
// Plan: export_determinism s6.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type { ExportFormat } from '@nowline/export';

import {
    exportDocument,
    type HostEnv,
    type ExportFormat as KernelFormat,
    type RenderInputs,
} from '@nowline/export';
import { lengthToPoints, parseLength, resolveFonts } from '@nowline/export-core';
import { resolveExportWidth } from '../preview/option-resolver.js';
import type { ExportSettings } from './cli-runner.js';
import type { ExportSource } from './export-source.js';

// ---- WASM path registration -------------------------------------------------

let extensionDistPath: string | undefined;

/**
 * Register the extension's `dist/` directory so the in-process exporter can
 * find `resvg.wasm` at runtime. Call once from `extension.ts` `activate()`
 * with `path.join(context.extensionPath, 'dist')`.
 */
export function initExportRuntime(distPath: string): void {
    extensionDistPath = distPath;
}

/** Test seam: reset WASM and distPath state between isolated tests. */
export function _resetWasmInit(): void {
    extensionDistPath = undefined;
}

// ---- HostEnv ----------------------------------------------------------------

function createExtensionHostEnv(sourcePath: string, assetRootOverride?: string): HostEnv {
    const assetRoot = path.resolve(assetRootOverride ?? path.dirname(sourcePath));
    return {
        async readSource(filePath: string): Promise<string> {
            return fs.readFile(filePath, 'utf-8');
        },
        async readAsset(ref: string): Promise<Uint8Array> {
            const absPath = path.resolve(assetRoot, ref);
            if (!absPath.startsWith(assetRoot + path.sep) && absPath !== assetRoot) {
                throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
            }
            const bytes = await fs.readFile(absPath);
            return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        },
        async loadWasm(): Promise<ArrayBuffer> {
            if (!extensionDistPath) {
                throw new Error(
                    'Nowline: initExportRuntime() was not called before PNG export. ' +
                        'This is an extension bug — please file an issue.',
                );
            }
            const wasmPath = path.join(extensionDistPath, 'resvg.wasm');
            const buf = await fs.readFile(wasmPath);
            return buf.buffer as ArrayBuffer;
        },
    };
}

// ---- Public interface -------------------------------------------------------

export interface InProcessExportResult {
    rendered: Uint8Array | string;
    isBinary: boolean;
}

const BINARY_FORMATS = new Set<KernelFormat>(['png', 'pdf', 'xlsx']);
const TEXT_DECODER = new TextDecoder('utf-8');

/**
 * Produce export output in-process for the given format by delegating to the
 * @nowline/export kernel.
 *
 * @param source    The text to export and the options the preview's chain
 *                  resolved for it. The text is used as given, never re-read
 *                  from disk, so the export is what the preview drew.
 * @param format    Target export format.
 * @param settings  Resolved nowline.export.* VS Code settings.
 */
export async function exportInProcess(
    source: ExportSource,
    format: KernelFormat,
    settings: ExportSettings,
): Promise<InProcessExportResult> {
    const { sourcePath, options } = source;
    const inputs: RenderInputs = {
        sourcePath,
        // `null` suppresses the now-line (the kernel's "omitted").
        today: options.today ?? undefined,
        locale: options.locale ?? 'en-US',
        theme: options.theme,
        noLinks: !options.showLinks,
        nonWorking: options.nonWorking,
        // Canvas width is a deliberate export setting (not preview-coupled):
        // a best-effort *maximum* cap under the shared width rule. `0`/unset
        // fits the content, keeping byte-for-byte parity with the CLI default.
        width: resolveExportWidth(settings.width),
        // Font-requiring formats resolve lazily below.
        pngScale: settings.pngScale > 0 ? settings.pngScale : undefined,
        pageSize: settings.pdfPageSize || undefined,
        orientation: parsePdfOrientation(settings.pdfOrientation),
        marginPt: parsePdfMargin(settings.pdfMargin),
        msprojStart: settings.msprojStart || undefined,
    };

    // PNG and PDF require a pre-resolved font pair passed via inputs.fonts.
    if (format === 'png' || format === 'pdf') {
        const result = await resolveFonts({
            fontSans: settings.fontSans || undefined,
            fontMono: settings.fontMono || undefined,
            headless: settings.headlessFonts,
        });
        inputs.fonts = { sans: result.sans, mono: result.mono };
    }

    const host = createExtensionHostEnv(sourcePath, options.assetRoot);
    const bytes = await exportDocument(source.text, format, inputs, host);

    const isBinary = BINARY_FORMATS.has(format);
    return {
        rendered: isBinary ? bytes : TEXT_DECODER.decode(bytes),
        isBinary,
    };
}

// ---- Helpers ----------------------------------------------------------------

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
