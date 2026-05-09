import { describe, expect, it } from 'vitest';
import { renderSvg } from '@nowline/renderer';
import { exportHtml } from '../src/index.js';
import { buildExportInputs, MINIMAL_FIXTURE } from './helpers.js';

const STABLE_GENERATOR = 'nowline (m2c-test)';

async function svgFor(
    source: string,
): Promise<{ inputs: Awaited<ReturnType<typeof buildExportInputs>>; svg: string }> {
    const inputs = await buildExportInputs(source);
    const svg = await renderSvg(inputs.model, {});
    return { inputs, svg };
}

describe('exportHtml', () => {
    it('produces a self-contained HTML document', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const html = await exportHtml(inputs, svg, { generator: STABLE_GENERATOR });
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html.endsWith('</html>')).toBe(true);
        expect(html).toContain('<title>Minimal Example</title>');
        expect(html).toContain(`<meta name="generator" content="${STABLE_GENERATOR}">`);
        expect(html).toContain('id="nowline-viewport"');
        expect(html).toContain('<svg');
    });

    it('inlines a pan/zoom script with no external references', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const html = await exportHtml(inputs, svg, { generator: STABLE_GENERATOR });
        expect(html).toContain("addEventListener('pointerdown'");
        expect(html).toContain("addEventListener('wheel'");
        // No external script srcs / stylesheets / image fetches. SVG xmlns
        // declarations are namespace identifiers and don't count.
        expect(html).not.toMatch(/<script\s+[^>]*\bsrc=/i);
        expect(html).not.toMatch(/<link\s+[^>]*\bhref=/i);
        expect(html).not.toMatch(/<(img|video|audio|iframe)\s+[^>]*\bsrc=\s*["']https?:/i);
    });

    it('embeds a print stylesheet', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const html = await exportHtml(inputs, svg, { generator: STABLE_GENERATOR });
        expect(html).toContain('@media print');
    });

    it('respects an explicit title', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const html = await exportHtml(inputs, svg, {
            title: 'Custom Title',
            generator: STABLE_GENERATOR,
        });
        expect(html).toContain('<title>Custom Title</title>');
    });

    it('escapes HTML special characters in the title', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const html = await exportHtml(inputs, svg, {
            title: 'A & B <c>',
            generator: STABLE_GENERATOR,
        });
        expect(html).toContain('A &amp; B &lt;c&gt;');
    });

    it('is byte-deterministic given the same input + generator', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const a = await exportHtml(inputs, svg, { generator: STABLE_GENERATOR });
        const b = await exportHtml(inputs, svg, { generator: STABLE_GENERATOR });
        expect(a).toBe(b);
    });

    it('uses the model.backgroundColor for the page background', async () => {
        const { inputs, svg } = await svgFor(MINIMAL_FIXTURE);
        const html = await exportHtml(inputs, svg, { generator: STABLE_GENERATOR });
        expect(html).toContain(`background: ${inputs.model.backgroundColor}`);
    });
});
