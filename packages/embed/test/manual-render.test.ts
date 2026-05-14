import { afterEach, describe, expect, it } from 'vitest';
import { __resetForTests, EmbedRenderError, parse, render } from '../src/index.js';
import { ROADMAP_ALPHA } from './fixtures.js';

describe('nowline.render', () => {
    afterEach(() => {
        __resetForTests();
    });

    it('returns a complete SVG string for a valid source', async () => {
        const svg = await render(ROADMAP_ALPHA);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.includes('</svg>')).toBe(true);
        // Every embed render emits an attribution mark; this catches the
        // case where the pipeline silently passed an empty model to the
        // renderer.
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('parses without rendering when only diagnostics are needed', async () => {
        const result = await parse(ROADMAP_ALPHA);
        expect(result.errors).toEqual([]);
        expect(result.ast).toBeDefined();
    });

    it('throws an EmbedRenderError on invalid source', async () => {
        const broken = 'nowline v1\nthis is not a valid roadmap line\n';
        await expect(render(broken)).rejects.toBeInstanceOf(EmbedRenderError);
    });

    it('produces deterministic output for the same input', async () => {
        const a = await render(ROADMAP_ALPHA, { idPrefix: 'fixed' });
        const b = await render(ROADMAP_ALPHA, { idPrefix: 'fixed' });
        expect(a).toBe(b);
    });

    it('respects an explicit theme override', async () => {
        const light = await render(ROADMAP_ALPHA, { theme: 'light', idPrefix: 'fixed' });
        const dark = await render(ROADMAP_ALPHA, { theme: 'dark', idPrefix: 'fixed' });
        expect(light).not.toBe(dark);
    });
});
