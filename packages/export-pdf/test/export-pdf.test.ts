import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderSvg } from '@nowline/renderer';
import { resolveFonts } from '@nowline/export-core';
import { exportPdf } from '../src/index.js';
import { buildExportInputs, MINIMAL_FIXTURE, PINNED_DATE } from './helpers.js';

const PDF_HEAD = '%PDF-';

async function svgFor(source: string) {
    const inputs = await buildExportInputs(source, { today: PINNED_DATE });
    const svg = await renderSvg(inputs.model, {});
    return { inputs, svg };
}

async function bundledFonts() {
    const result = await resolveFonts({ headless: true });
    return { sans: result.sans, mono: result.mono };
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
    return Buffer.from(bytes.buffer, bytes.byteOffset + start, length).toString('latin1');
}

function sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

describe('exportPdf — output shape', () => {
    it('emits a PDF starting with %PDF- and ending with %%EOF', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts });
        expect(pdf.byteLength).toBeGreaterThan(1000);
        expect(ascii(pdf, 0, 5)).toBe(PDF_HEAD);
        const tail = ascii(pdf, pdf.byteLength - 16, 16);
        expect(tail).toMatch(/%%EOF/);
    });

    it('header advertises PDF 1.7', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts });
        expect(ascii(pdf, 0, 8)).toBe('%PDF-1.7');
    });

    it('default page is US Letter (612 x 792 pt)', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts });
        const text = Buffer.from(pdf).toString('latin1');
        // Letter portrait 612 x 792, but auto-orientation flips when content is
        // wider than tall — Nowline content usually is, so accept either
        // orientation here.
        expect(text).toMatch(/\/MediaBox \[0 0 (612 792|792 612)\]/);
    });

    it('respects an explicit page size', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, {
            fonts,
            pageSize: 'a4',
            orientation: 'portrait',
        });
        const text = Buffer.from(pdf).toString('latin1');
        // a4 portrait is 595.276 x 841.89 in our preset table
        expect(text).toMatch(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/);
    });

    it('content-sized page hugs the content + 2 × margin', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const margin = 36;
        const pdf = await exportPdf(inputs, svg, {
            fonts,
            pageSize: 'content',
            marginPt: margin,
        });
        const text = Buffer.from(pdf).toString('latin1');
        const expectedW = inputs.model.width + 2 * margin;
        const expectedH = inputs.model.height + 2 * margin;
        expect(text).toContain(`/MediaBox [0 0 ${expectedW} ${expectedH}]`);
    });
});

describe('exportPdf — info dict', () => {
    it('embeds the deterministic CreationDate', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        // Disable compression so the literal date string is searchable.
        const pdf = await exportPdf(inputs, svg, { fonts, compress: false });
        const text = Buffer.from(pdf).toString('latin1');
        // PDF dates render as `D:YYYYMMDDHHmmSS`. PINNED_DATE = 2026-04-27.
        expect(text).toContain('D:20260427');
        // Two occurrences (CreationDate + ModDate).
        expect(text.match(/D:20260427/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it('Producer / Creator default to nowline (m2c)', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts });
        const text = Buffer.from(pdf).toString('latin1');
        expect(text).toContain('/Producer');
        expect(text).toContain('nowline');
    });

    it('takes Title from inputs.model.header.title by default', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts });
        const text = Buffer.from(pdf).toString('latin1');
        expect(text).toContain('Minimal Example');
    });
});

describe('exportPdf — determinism', () => {
    it('two consecutive calls with the same inputs emit identical bytes', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const a = await exportPdf(inputs, svg, { fonts });
        const b = await exportPdf(inputs, svg, { fonts });
        expect(sha256(a)).toBe(sha256(b));
    });

    it('different page sizes yield different bytes', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const letter = await exportPdf(inputs, svg, { fonts, pageSize: 'letter' });
        const a4 = await exportPdf(inputs, svg, { fonts, pageSize: 'a4' });
        expect(sha256(letter)).not.toBe(sha256(a4));
    });
});

describe('exportPdf — validation', () => {
    it('rejects an oversized margin', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        await expect(
            exportPdf(inputs, svg, { fonts, pageSize: 'letter', marginPt: 1000 }),
        ).rejects.toThrow(/consumes the entire/);
    });

    it('parses a string page size', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts, pageSize: '8.5x11in' });
        expect(ascii(pdf, 0, 5)).toBe(PDF_HEAD);
    });
});
