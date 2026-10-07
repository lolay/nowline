import { afterEach, describe, expect, it } from 'vitest';
import { __resetForTests, EmbedRenderError, initialize, parse, render } from '../src/index.js';
import {
    NON_WORKING_LAYER,
    ROADMAP_ALPHA,
    ROADMAP_BUSINESS,
    ROADMAP_BUSINESS_FILE_SHOW,
} from './fixtures.js';

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

describe('nowline.render: the non-working display', () => {
    afterEach(() => {
        __resetForTests();
    });

    it('the option show adds the non-working layer', async () => {
        const svg = await render(ROADMAP_BUSINESS, { nonWorking: 'show' });
        expect(svg).toContain(NON_WORKING_LAYER);
    });

    it('a file key show with no option has the layer (unset stays undefined)', async () => {
        const svg = await render(ROADMAP_BUSINESS_FILE_SHOW);
        expect(svg).toContain(NON_WORKING_LAYER);
    });

    it('a file key show with the option hide has no layer', async () => {
        const svg = await render(ROADMAP_BUSINESS_FILE_SHOW, { nonWorking: 'hide' });
        expect(svg).not.toContain(NON_WORKING_LAYER);
    });

    it('stays hide with no key and no option', async () => {
        const svg = await render(ROADMAP_BUSINESS);
        expect(svg).not.toContain(NON_WORKING_LAYER);
    });
});

describe('nowline.initialize: the non-working display', () => {
    afterEach(() => {
        __resetForTests();
    });

    it('initialize({ nonWorking: "show" }) adds the layer to render()', async () => {
        initialize({ startOnLoad: false, nonWorking: 'show' });
        expect(await render(ROADMAP_BUSINESS)).toContain(NON_WORKING_LAYER);
    });

    it('initialize without nonWorking leaves a file key show in force', async () => {
        initialize({ startOnLoad: false });
        expect(await render(ROADMAP_BUSINESS_FILE_SHOW)).toContain(NON_WORKING_LAYER);
    });

    it('initialize({ nonWorking: "hide" }) overrides a file key show', async () => {
        initialize({ startOnLoad: false, nonWorking: 'hide' });
        expect(await render(ROADMAP_BUSINESS_FILE_SHOW)).not.toContain(NON_WORKING_LAYER);
    });

    it('a per-call option wins over initialize', async () => {
        initialize({ startOnLoad: false, nonWorking: 'show' });
        expect(await render(ROADMAP_BUSINESS, { nonWorking: 'hide' })).not.toContain(
            NON_WORKING_LAYER,
        );
    });
});
