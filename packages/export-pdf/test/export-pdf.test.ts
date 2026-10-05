import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveFonts } from '@nowline/export-core';
import { renderSvg } from '@nowline/renderer';
import { describe, expect, it } from 'vitest';
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

/** The Info dict's Subject string. PDFKit writes it as an indirect object. */
function infoSubject(pdf: Uint8Array): string | undefined {
    const text = Buffer.from(pdf).toString('latin1');
    const ref = /\/Subject (\d+) 0 R/.exec(text)?.[1];
    if (!ref) return undefined;
    return new RegExp(`\\n${ref} 0 obj\\n\\((.*)\\)\\nendobj`).exec(text)?.[1];
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

    it('Subject defaults to the source basename, never the absolute path', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(
            { ...inputs, sourcePath: '/Users/someone/src/roadmaps/minimal.nowline' },
            svg,
            { fonts, compress: false },
        );
        expect(infoSubject(pdf)).toBe('minimal.nowline');
        expect(Buffer.from(pdf).toString('latin1')).not.toContain('/Users/someone');
    });

    it('an explicit subject still wins over the basename default', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = await exportPdf(inputs, svg, { fonts, compress: false, subject: 'Q3 plan' });
        expect(infoSubject(pdf)).toBe('Q3 plan');
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

    it('bytes do not depend on the source directory', async () => {
        // Regression: Subject used to embed the absolute sourcePath, and both
        // the /ID (an MD5 over the Info dict) and every xref offset follow it,
        // so the same roadmap exported from two checkouts differed byte-wise.
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const at = (sourcePath: string) => exportPdf({ ...inputs, sourcePath }, svg, { fonts });
        const ci = await at('/home/runner/work/nowline/nowline/examples/minimal.nowline');
        const mac = await at('/Users/someone/src/nowline/examples/minimal.nowline');
        const win = await at('C:\\Users\\someone\\nowline\\examples\\minimal.nowline');
        expect(sha256(mac)).toBe(sha256(ci));
        expect(sha256(win)).toBe(sha256(ci));
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

describe('exportPdf — waves', () => {
    // specs/waves.md §10: svg-to-pdfkit must draw the background-work hatch
    // (a `<pattern>` fill), or the renderer needs its stripe-line fallback.
    const SAMPLE = fileURLToPath(
        new URL('../../../specs/waves/samples/checkout-relaunch.nowline', import.meta.url),
    );

    it('draws the background-work hatch as a PDF pattern', async () => {
        const { inputs, svg } = await svgFor(await readFile(SAMPLE, 'utf-8'));
        expect(svg).toMatch(/<pattern [^>]*id="[^"]+-wave-hatch-dark"/);
        const fonts = await bundledFonts();
        const pdf = Buffer.from(await exportPdf(inputs, svg, { fonts, compress: false })).toString(
            'latin1',
        );
        expect(pdf).toMatch(/\/PatternType 1\b/);
        expect(pdf).toMatch(/\/Pattern\s*<</);
        expect(pdf).toMatch(/\/Pattern cs/);
        // The hatch line's `opacity` (WAVE_HATCH_OPACITY) reaches the PDF as
        // both a fill (`ca`) and a stroke (`CA`) alpha. A stroke-only `CA`,
        // which `stroke-opacity` produced, is ignored by poppler inside a
        // pattern cell, so the hatch drew opaque there.
        expect(pdf).toMatch(/\/ca 0\.13\b/);
        expect(pdf).toMatch(/\/CA 0\.13\b/);
    });

    it('a roadmap without background work has no pattern', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const fonts = await bundledFonts();
        const pdf = Buffer.from(await exportPdf(inputs, svg, { fonts, compress: false })).toString(
            'latin1',
        );
        expect(pdf).not.toMatch(/\/PatternType/);
    });
});
