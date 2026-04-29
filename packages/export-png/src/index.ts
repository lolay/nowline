// PNG exporter — rasterizes the renderer SVG via resvg-js (WASM).
//
// Spec: specs/handoffs/m2c.md § 3 "PNG — rasterized SVG via resvg-js (WASM)".
//
// Determinism contract:
//   - `loadSystemFonts: false` — only the resolved fonts the caller hands in
//     are visible to resvg, so identical input → identical bytes regardless
//     of host machine.
//   - Fonts come from the @nowline/export-core resolver; we pass them as
//     `fontBuffers` (Uint8Array, supported since resvg-js 2.5.0).
//   - The WASM module is loaded lazily on first call.
//
// The package owns the resvg-js dependency; that's why it's in the "full"
// CLI build but not in the "tiny" build.

import type { ResolvedFontPair, ExportInputs } from '@nowline/export-core';
import { resolveFonts } from '@nowline/export-core';

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
    /** Resvg-js options bag for advanced overrides. Use sparingly. */
    resvgOptions?: Record<string, unknown>;
}

let resvgModule: typeof import('@resvg/resvg-js') | undefined;

async function getResvgModule(): Promise<typeof import('@resvg/resvg-js')> {
    if (!resvgModule) {
        resvgModule = await import('@resvg/resvg-js');
    }
    return resvgModule;
}

/** Test seam: drop the cached WASM module so isolated tests start fresh. */
export function _resetResvgModule(): void {
    resvgModule = undefined;
}

export async function exportPng(
    inputs: ExportInputs,
    svg: string,
    options: PngOptions = {},
): Promise<Uint8Array> {
    const scale = options.scale ?? 2;
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error(`exportPng: invalid scale ${scale}; expected a positive number`);
    }
    const background = options.background ?? inputs.model.backgroundColor;

    const fontPair = options.fonts ?? (await resolveFontsFor(inputs));
    const fontBuffers = [bufferOf(fontPair.sans.bytes), bufferOf(fontPair.mono.bytes)];

    // Workaround: in resvg-js 2.6.2, supplying `font.fontBuffers` silently
    // disables `fitTo` (zoom / width / height / dpi). To honour `--scale` we
    // multiply the root <svg width=…> / <svg height=…> attributes ourselves
    // before handing the SVG to resvg. The internal viewBox stays the same,
    // so vector geometry is preserved — only the rasterized pixel grid grows.
    const scaledSvg = scale === 1 ? svg : scaleRootSvgDimensions(svg, scale);

    const resvgOpts = {
        background,
        font: {
            loadSystemFonts: false,
            fontBuffers,
            defaultFontFamily: fontPair.sans.name,
            sansSerifFamily: fontPair.sans.name,
            monospaceFamily: fontPair.mono.name,
        },
        ...(options.resvgOptions ?? {}),
    };

    const { Resvg } = await getResvgModule();
    const resvg = new Resvg(scaledSvg, resvgOpts);
    const png = resvg.render();
    const bytes = png.asPng();
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

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

async function resolveFontsFor(_inputs: ExportInputs): Promise<ResolvedFontPair> {
    const result = await resolveFonts();
    return { sans: result.sans, mono: result.mono };
}

function bufferOf(bytes: Uint8Array): Buffer {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
