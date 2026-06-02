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
// Plan: export_determinism s1 scaffolds the public surface only. The kernel
// pipeline body lands in s2; the resvg-wasm rasterizer swap in s4.

import type { PdfOrientation, ResolvedFontPair } from '@nowline/export-core';
import type { ThemeName } from '@nowline/layout';

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
    /** Now-line date. Always an explicit UTC midnight; never `Date.now()`. */
    today: Date;
    /** Locale tag used to format timeline tick labels. Explicit; never the host's. */
    locale: string;
    /** Theme (light / dark / grayscale). */
    theme: ThemeName;
    /** Pinned font byte buffers — canonical export embeds the bundled DejaVu pair. */
    fonts: ResolvedFontPair;

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
    orientation?: PdfOrientation;
    /** PDF margin in points. */
    marginPt?: number;
    /** PNG pixel-density multiplier (default 2). */
    pngScale?: number;
    /** MS Project start-date override (YYYY-MM-DD). */
    msprojStart?: string;
}

/**
 * Produce the export artifact for `source` in `format`. This is the single
 * code path to any exported artifact — no surface re-implements a stage.
 *
 * Text formats (svg / json / html / mermaid / msproj) are returned as UTF-8
 * bytes with LF line endings; binary formats (png / pdf / xlsx) as their native
 * bytes. Returning bytes for every format keeps the determinism gate able to
 * `sha256` one value per (fixture, format).
 *
 * s1 scaffold: this is the real signature s2 fills in. The kernel pipeline —
 * parse → resolve includes → layout → renderSvg → format adapter — lands in s2,
 * and the resvg-wasm raster path in s4. The precondition checks below are the
 * kernel's actual input contract, so they carry forward rather than being
 * throwaway scaffolding.
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
    if (!(inputs?.today instanceof Date)) {
        throw new TypeError('@nowline/export: inputs.today must be a Date (UTC midnight).');
    }
    throw new Error(
        `@nowline/export: exportDocument(${format}) is not implemented yet ` +
            '(s1 scaffold; the kernel pipeline lands in plan step s2).',
    );
}
