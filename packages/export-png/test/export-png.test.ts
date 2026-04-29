import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderSvg } from '@nowline/renderer';
import { resolveFonts } from '@nowline/export-core';
import { exportPng } from '../src/index.js';
import { buildExportInputs, MINIMAL_FIXTURE } from './helpers.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function svgFor(source: string) {
    const inputs = await buildExportInputs(source);
    const svg = await renderSvg(inputs.model, {});
    return { inputs, svg };
}

function sha256(buf: Uint8Array): string {
    return createHash('sha256').update(buf).digest('hex');
}

async function bundledFonts() {
    const result = await resolveFonts({ headless: true });
    return { sans: result.sans, mono: result.mono };
}

describe('exportPng — output shape', () => {
    it('returns valid PNG bytes (magic header)', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const png = await exportPng(inputs, svg, { fonts, scale: 1 });
        expect(png.byteLength).toBeGreaterThan(100);
        const head = Buffer.from(png.slice(0, 8));
        expect(head.equals(PNG_MAGIC)).toBe(true);
    });

    it('higher scale produces a larger image', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const small = await exportPng(inputs, svg, { fonts, scale: 1 });
        const large = await exportPng(inputs, svg, { fonts, scale: 2 });
        expect(large.byteLength).toBeGreaterThan(small.byteLength);
    });

    it('rejects non-positive scale', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        await expect(exportPng(inputs, svg, { fonts, scale: 0 })).rejects.toThrow(/scale/);
        await expect(exportPng(inputs, svg, { fonts, scale: -1 })).rejects.toThrow(/scale/);
    });
});

describe('exportPng — determinism', () => {
    it('two calls with the same fonts and scale produce identical bytes', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const a = await exportPng(inputs, svg, { fonts, scale: 1 });
        const b = await exportPng(inputs, svg, { fonts, scale: 1 });
        expect(sha256(a)).toBe(sha256(b));
    });

    it('different scale yields different bytes', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const one = await exportPng(inputs, svg, { fonts, scale: 1 });
        const two = await exportPng(inputs, svg, { fonts, scale: 2 });
        expect(sha256(one)).not.toBe(sha256(two));
    });

    it('background option is plumbed through (transparent SVG case)', async () => {
        // The Nowline SVG paints its own full-page background, so swapping
        // resvg's `background` option doesn't change visible pixels for the
        // default fixture. Verify the option is at least accepted (doesn't
        // throw) — visual coverage lives in the smoke fixture below.
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const png = await exportPng(inputs, svg, { fonts, scale: 1, background: '#ff00ff' });
        expect(png.byteLength).toBeGreaterThan(100);
    });
});

describe('exportPng — defaults', () => {
    it('falls back to bundled fonts when no fonts pair is supplied', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        // headless=true via env so the resolver picks bundled DejaVu deterministically.
        const prev = process.env.NOWLINE_HEADLESS;
        process.env.NOWLINE_HEADLESS = '1';
        try {
            const png = await exportPng(inputs, svg, { scale: 1 });
            expect(png.byteLength).toBeGreaterThan(100);
        } finally {
            if (prev === undefined) delete process.env.NOWLINE_HEADLESS;
            else process.env.NOWLINE_HEADLESS = prev;
        }
    });
});
