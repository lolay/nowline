import { describe, expect, it } from 'vitest';
import {
    fitContent,
    isPdfPresetName,
    PageSizeParseError,
    parsePageSize,
    presetDimensions,
    presetNames,
    resolvePage,
    validateMargin,
} from '../src/pdf-page.js';

describe('parsePageSize — presets', () => {
    it('recognizes every imperial and ISO preset case-insensitively', () => {
        for (const name of presetNames()) {
            expect(parsePageSize(name)).toEqual({ kind: 'preset', name });
            expect(parsePageSize(name.toUpperCase())).toEqual({ kind: 'preset', name });
        }
    });

    it('letter is 612 x 792 pt (8.5 x 11 in)', () => {
        expect(presetDimensions('letter')).toEqual({ widthPt: 612, heightPt: 792 });
    });

    it('a4 is 595.276 x 841.89 pt', () => {
        const a4 = presetDimensions('a4');
        expect(a4.widthPt).toBeCloseTo(595.276, 2);
        expect(a4.heightPt).toBeCloseTo(841.89, 2);
    });

    it('rejects unknown presets', () => {
        expect(() => parsePageSize('foolscap')).toThrow(PageSizeParseError);
        expect(() => parsePageSize('a0')).toThrow(PageSizeParseError); // a0 not in our table
    });
});

describe('parsePageSize — content', () => {
    it('returns kind=content for the literal value', () => {
        expect(parsePageSize('content')).toEqual({ kind: 'content' });
        expect(parsePageSize('Content')).toEqual({ kind: 'content' });
    });
});

describe('parsePageSize — custom WxHunit', () => {
    it('parses every unit', () => {
        expect(parsePageSize('8.5x11in')).toEqual({
            kind: 'custom',
            width: { value: 8.5, unit: 'in' },
            height: { value: 11, unit: 'in' },
        });
        expect(parsePageSize('210x297mm').kind).toBe('custom');
        expect(parsePageSize('21x29.7cm').kind).toBe('custom');
        expect(parsePageSize('612x792pt').kind).toBe('custom');
    });

    it('rejects mixed units with a clear error', () => {
        expect(() => parsePageSize('8.5inx11mm')).toThrow(/mixed units/);
    });

    it('rejects malformed expressions', () => {
        expect(() => parsePageSize('8.5')).toThrow(PageSizeParseError);
        expect(() => parsePageSize('foo')).toThrow(PageSizeParseError);
        expect(() => parsePageSize('-1x10in')).toThrow(PageSizeParseError);
    });
});

describe('isPdfPresetName', () => {
    it('reports presence for every preset and rejects unknowns', () => {
        for (const name of presetNames()) {
            expect(isPdfPresetName(name)).toBe(true);
        }
        expect(isPdfPresetName('letter')).toBe(true);
        expect(isPdfPresetName('foolscap')).toBe(false);
    });
});

describe('resolvePage', () => {
    it('keeps preset W/H when orientation matches the preset', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'portrait',
            contentWidthPt: 100,
            contentHeightPt: 200,
            marginPt: 36,
        });
        expect(page.widthPt).toBe(612);
        expect(page.heightPt).toBe(792);
        expect(page.orientation).toBe('portrait');
        expect(page.isContentSized).toBe(false);
    });

    it('swaps W/H for a landscape override on a portrait preset', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'landscape',
            contentWidthPt: 100,
            contentHeightPt: 200,
            marginPt: 36,
        });
        expect(page.widthPt).toBe(792);
        expect(page.heightPt).toBe(612);
        expect(page.orientation).toBe('landscape');
    });

    it('auto picks landscape when content is wider than tall', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'auto',
            contentWidthPt: 1500,
            contentHeightPt: 800,
            marginPt: 36,
        });
        expect(page.orientation).toBe('landscape');
        expect(page.widthPt).toBe(792);
    });

    it('content mode: page = content + 2 × margin, no scaling', () => {
        const page = resolvePage({
            pageSize: { kind: 'content' },
            orientation: 'auto',
            contentWidthPt: 1000,
            contentHeightPt: 500,
            marginPt: 36,
        });
        expect(page.widthPt).toBe(1072);
        expect(page.heightPt).toBe(572);
        expect(page.isContentSized).toBe(true);
    });
});

describe('validateMargin', () => {
    it('accepts a normal margin', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'portrait',
            contentWidthPt: 100,
            contentHeightPt: 200,
            marginPt: 36,
        });
        expect(() => validateMargin(36, page)).not.toThrow();
    });

    it('rejects a margin that consumes the whole page', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'portrait',
            contentWidthPt: 100,
            contentHeightPt: 200,
            marginPt: 36,
        });
        expect(() => validateMargin(400, page)).toThrow(/consumes the entire/);
    });
});

describe('fitContent', () => {
    it('content-sized page: factor 1, offset = margin', () => {
        const page = {
            widthPt: 1072,
            heightPt: 572,
            orientation: 'landscape' as const,
            isContentSized: true,
        };
        const fit = fitContent({
            page,
            contentWidthPt: 1000,
            contentHeightPt: 500,
            marginPt: 36,
        });
        expect(fit.factor).toBe(1);
        expect(fit.offsetX).toBe(36);
        expect(fit.offsetY).toBe(36);
    });

    it('fixed page, content fits at 1:1: factor 1, centered', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'portrait',
            contentWidthPt: 100,
            contentHeightPt: 200,
            marginPt: 36,
        });
        const fit = fitContent({
            page,
            contentWidthPt: 100,
            contentHeightPt: 200,
            marginPt: 36,
        });
        expect(fit.factor).toBe(1);
        expect(fit.offsetX).toBeCloseTo(36 + (612 - 2 * 36 - 100) / 2, 6);
        expect(fit.offsetY).toBeCloseTo(36 + (792 - 2 * 36 - 200) / 2, 6);
    });

    it('fixed page, content too big: scales down uniformly, centered', () => {
        const page = resolvePage({
            pageSize: { kind: 'preset', name: 'letter' },
            orientation: 'portrait',
            contentWidthPt: 2000,
            contentHeightPt: 1000,
            marginPt: 36,
        });
        const fit = fitContent({
            page,
            contentWidthPt: 2000,
            contentHeightPt: 1000,
            marginPt: 36,
        });
        expect(fit.factor).toBeLessThan(1);
        // Aspect ratio preserved
        const scaledW = 2000 * fit.factor;
        const scaledH = 1000 * fit.factor;
        expect(scaledW / scaledH).toBeCloseTo(2, 6);
    });
});
