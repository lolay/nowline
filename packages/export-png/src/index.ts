// PNG exporter — rasterizes the renderer SVG via @resvg/resvg-wasm.
//
// Full replace of the old native @resvg/resvg-js dependency. The WASM build
// is browser-capable, loads system fonts optionally (we always use
// custom fontBuffers for determinism), and avoids native .node addons.
//
// Determinism contract:
//   - fontBuffers: only the resolved fonts the caller hands in are visible to
//     resvg, so identical inputs → identical bytes regardless of host machine.
//   - Fonts come from the @nowline/export-core resolver; passed as Uint8Array[].
//   - WASM module is initialized lazily on first call; initPngWasm() lets the
//     caller supply the bytes (HostEnv.loadWasm() path); auto-init falls back
//     to loading index_bg.wasm from the package's node_modules (Node only).
//
// Spec: specs/export-determinism.md — full replace (plan s4).

import type { ExportInputs, ResolvedFontPair } from '@nowline/export-core';

export interface PngOptions {
    /** Pixel-density multiplier. 1 (native), 1.5, 2, or 3 typical. Default 2. */
    scale?: number;
    /**
     * Background color (CSS color or `transparent`). Defaults to the
     * resolved roadmap background.
     */
    background?: string;
    /** Pre-resolved font pair. If absent, the exporter calls `resolveFonts()`. */
    fonts?: ResolvedFontPair;
}

// ---- WASM initialization ----------------------------------------------------

let wasmReady = false;
let wasmInitializing: Promise<void> | undefined;

/**
 * Initialize the resvg WASM module with the provided bytes. The kernel calls
 * this with `await host.loadWasm()` before the first PNG export. Idempotent:
 * subsequent calls with the same wasm bytes are no-ops.
 */
export async function initPngWasm(wasm: ArrayBuffer | Uint8Array): Promise<void> {
    if (wasmReady) return;
    const bytes = wasm instanceof Uint8Array ? wasm.buffer : wasm;
    if (!wasmInitializing) {
        wasmInitializing = (async () => {
            const { initWasm } = await import('@resvg/resvg-wasm');
            await initWasm(bytes as ArrayBuffer);
            wasmReady = true;
        })();
    }
    await wasmInitializing;
}

/**
 * Ensure the WASM module is initialized. If initPngWasm() was not called
 * explicitly, auto-loads index_bg.wasm from @resvg/resvg-wasm's Node package
 * (Node.js / non-compiled use — tests and development). Under bun compile the
 * kernel always calls initPngWasm() via HostEnv.loadWasm() so this path is not
 * reached in production binaries.
 */
async function ensureWasmInitialized(): Promise<void> {
    if (wasmReady) return;
    if (!wasmInitializing) {
        wasmInitializing = (async () => {
            const { createRequire } = await import('node:module');
            const { readFile } = await import('node:fs/promises');
            const { dirname } = await import('node:path');
            const req = createRequire(import.meta.url);
            const entry = req.resolve('@resvg/resvg-wasm');
            const wasmPath = `${dirname(entry)}/index_bg.wasm`;
            const wasmBytes = await readFile(wasmPath);
            const { initWasm } = await import('@resvg/resvg-wasm');
            await initWasm(wasmBytes.buffer as ArrayBuffer);
            wasmReady = true;
        })();
    }
    await wasmInitializing;
}

/** Test seam: reset WASM initialization state between isolated tests. */
export function _resetPngWasm(): void {
    wasmReady = false;
    wasmInitializing = undefined;
}

// ---- Scale workaround -------------------------------------------------------
//
// @resvg/resvg-wasm (like resvg-js ≤ 2.6.x) silently disables fitTo when
// fontBuffers are supplied. Pre-multiply root <svg width/height> by scale so
// the rasterized grid grows while preserving vector geometry.

const ROOT_SVG_RE = /<svg\b([^>]*)>/i;
const WIDTH_RE = /\bwidth="([\d.]+)(px)?"/i;
const HEIGHT_RE = /\bheight="([\d.]+)(px)?"/i;

function scaleRootSvgDimensions(svg: string, scale: number): string {
    const match = ROOT_SVG_RE.exec(svg);
    if (!match) return svg;
    const attrs = match[1];
    const widthMatch = WIDTH_RE.exec(attrs);
    const heightMatch = HEIGHT_RE.exec(attrs);
    if (!widthMatch || !heightMatch) return svg;
    const newWidth = Number(widthMatch[1]) * scale;
    const newHeight = Number(heightMatch[1]) * scale;
    let nextAttrs = attrs.replace(WIDTH_RE, `width="${newWidth}"`);
    nextAttrs = nextAttrs.replace(HEIGHT_RE, `height="${newHeight}"`);
    return svg.replace(ROOT_SVG_RE, `<svg${nextAttrs}>`);
}

// ---- Public API -------------------------------------------------------------

export async function exportPng(
    inputs: ExportInputs,
    svg: string,
    options: PngOptions = {},
): Promise<Uint8Array> {
    const scale = options.scale ?? 2;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`exportPng: invalid scale ${scale}; expected a positive number`);
    }

    await ensureWasmInitialized();

    const background = options.background ?? inputs.model.backgroundColor;
    const fontPair = options.fonts ?? (await resolveFontsFor(inputs));

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

    const scaledSvg = scale === 1 ? svg : scaleRootSvgDimensions(svg, scale);

    const { Resvg } = await import('@resvg/resvg-wasm');
    const resvg = new Resvg(scaledSvg, {
        background,
        font: {
            fontBuffers: [sansBytes, monoBytes],
            defaultFontFamily: fontPair.sans.name,
            sansSerifFamily: fontPair.sans.name,
            monospaceFamily: fontPair.mono.name,
        },
    });
    const rendered = resvg.render();
    const bytes = rendered.asPng();
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

async function resolveFontsFor(_inputs: ExportInputs): Promise<ResolvedFontPair> {
    // Imported lazily (not at module top) so the static module graph of
    // @nowline/export-png stays free of `node:fs` — the font resolver pulls it
    // in. Canonical callers (the kernel, the CLI) always pass `options.fonts`,
    // so this fallback never runs there; keeping the import dynamic lets the
    // package bundle for the browser (the determinism gate's headless leg and
    // the Free/Pro web apps) without a Node-builtin polyfill.
    const { resolveFonts } = await import('@nowline/export-core');
    const result = await resolveFonts();
    return { sans: result.sans, mono: result.mono };
}
