// Logo loading before layout, header-size probing, and scaled embedding
// (specs/rendering.md § Roadmap Header, § Company Logo Error Handling).

import { describe, expect, it } from 'vitest';
import { loadLogo, rasterSize, renderSvg, svgIntrinsicSize } from '../src/index.js';
import { parseToModel } from './helpers.js';

function bytes(...parts: (number[] | string)[]): Uint8Array {
    const out: number[] = [];
    for (const p of parts) {
        if (typeof p === 'string') for (const c of p) out.push(c.charCodeAt(0));
        else out.push(...p);
    }
    return new Uint8Array(out);
}

const u32be = (n: number): number[] => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
];
const u16be = (n: number): number[] => [(n >> 8) & 255, n & 255];
const u16le = (n: number): number[] => [n & 255, (n >> 8) & 255];
const u24le = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const zeros = (n: number): number[] => new Array(n).fill(0);

function png(width: number, height: number): Uint8Array {
    return bytes(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        u32be(13),
        'IHDR',
        u32be(width),
        u32be(height),
        [8, 6, 0, 0, 0],
    );
}

// SOI, an APP0 segment to skip, then SOF2 (progressive).
function jpeg(width: number, height: number): Uint8Array {
    return bytes(
        [0xff, 0xd8],
        [0xff, 0xe0],
        u16be(16),
        'JFIF',
        zeros(10),
        [0xff, 0xc2],
        u16be(17),
        [8],
        u16be(height),
        u16be(width),
        zeros(12),
    );
}

function riff(chunk: string, payload: number[]): Uint8Array {
    return bytes('RIFF', u32be(0), 'WEBP', chunk, u32be(0).reverse(), payload);
}

const webpVp8 = (w: number, h: number): Uint8Array =>
    riff('VP8 ', [...zeros(3), 0x9d, 0x01, 0x2a, ...u16le(w), ...u16le(h)]);

function webpVp8l(w: number, h: number): Uint8Array {
    const bits = (w - 1) | ((h - 1) << 14);
    return riff('VP8L', [
        0x2f,
        bits & 255,
        (bits >> 8) & 255,
        (bits >> 16) & 255,
        (bits >>> 24) & 255,
        0,
    ]);
}

const webpVp8x = (w: number, h: number): Uint8Array =>
    riff('VP8X', [...zeros(4), ...u24le(w - 1), ...u24le(h - 1)]);

describe('rasterSize', () => {
    it('reads PNG, JPEG and every WebP flavor', () => {
        expect(rasterSize(png(640, 480), 'image/png')).toEqual({ width: 640, height: 480 });
        expect(rasterSize(jpeg(1200, 300), 'image/jpeg')).toEqual({ width: 1200, height: 300 });
        expect(rasterSize(webpVp8(320, 100), 'image/webp')).toEqual({ width: 320, height: 100 });
        expect(rasterSize(webpVp8l(500, 250), 'image/webp')).toEqual({ width: 500, height: 250 });
        expect(rasterSize(webpVp8x(4000, 1000), 'image/webp')).toEqual({
            width: 4000,
            height: 1000,
        });
    });

    it('is undefined for bytes that are not the declared format', () => {
        expect(rasterSize(png(10, 10), 'image/jpeg')).toBeUndefined();
        expect(rasterSize(bytes('not an image at all, honestly'), 'image/png')).toBeUndefined();
        expect(rasterSize(png(0, 10), 'image/png')).toBeUndefined();
    });
});

describe('svgIntrinsicSize', () => {
    it('prefers pixel width and height', () => {
        expect(
            svgIntrinsicSize('<svg width="200px" height="50" viewBox="0 0 20 20"></svg>'),
        ).toEqual({ width: 200, height: 50 });
    });

    it('falls back to the viewBox size', () => {
        expect(svgIntrinsicSize('<?xml version="1.0"?><svg viewBox="0,0 300 100"/>')).toEqual({
            width: 300,
            height: 100,
        });
        expect(svgIntrinsicSize('<svg width="100%" height="100%" viewBox="0 0 3 1"/>')).toEqual({
            width: 3,
            height: 1,
        });
    });

    it('is undefined with neither', () => {
        expect(svgIntrinsicSize('<svg width="100%"><rect/></svg>')).toBeUndefined();
        expect(svgIntrinsicSize('<html></html>')).toBeUndefined();
    });
});

describe('loadLogo', () => {
    const resolverFor = (files: Record<string, Uint8Array>) => async (ref: string) => {
        const file = files[ref];
        if (!file) throw new Error(`ENOENT: ${ref}`);
        return { bytes: file, mime: 'application/octet-stream' };
    };

    it('returns the intrinsic size of a loadable logo', async () => {
        const warn: string[] = [];
        const resolver = resolverFor({
            'a.png': png(64, 32),
            'b.svg': bytes('<svg viewBox="0 0 9 3"/>'),
        });
        const png64 = await loadLogo('a.png', resolver, (m) => warn.push(m));
        expect(png64?.ref).toBe('a.png');
        expect(png64?.dimensions).toEqual({ width: 64, height: 32 });
        const svg93 = await loadLogo('b.svg', resolver, (m) => warn.push(m));
        expect(svg93?.ref).toBe('b.svg');
        expect(svg93?.dimensions).toEqual({ width: 9, height: 3 });
        expect(warn).toEqual([]);
    });

    it('keeps the bytes and MIME type it read', async () => {
        const file = png(64, 32);
        const loaded = await loadLogo('a.png', resolverFor({ 'a.png': file }), () => {});
        expect(loaded?.asset).toEqual({ bytes: file, mime: 'application/octet-stream' });
    });

    it('warns and returns undefined for a missing file', async () => {
        const warn: string[] = [];
        expect(await loadLogo('./gone.svg', resolverFor({}), (m) => warn.push(m))).toBeUndefined();
        expect(warn).toEqual(['logo file not found: ./gone.svg (ENOENT: ./gone.svg)']);
    });

    it('warns on an unsupported extension without reading the file', async () => {
        const warn: string[] = [];
        let reads = 0;
        const resolver = async () => {
            reads++;
            return { bytes: new Uint8Array(), mime: '' };
        };
        expect(await loadLogo('logo.gif', resolver, (m) => warn.push(m))).toBeUndefined();
        expect(warn).toEqual(['unsupported logo format: .gif (logo.gif)']);
        expect(reads).toBe(0);
    });

    it('warns when the file cannot be parsed', async () => {
        const warn: string[] = [];
        const resolver = resolverFor({ 'x.png': bytes('GIF89a'), 'y.svg': bytes('<svg/>') });
        expect(await loadLogo('x.png', resolver, (m) => warn.push(m))).toBeUndefined();
        expect(await loadLogo('y.svg', resolver, (m) => warn.push(m))).toBeUndefined();
        expect(warn).toEqual([
            'logo could not be parsed: x.png (not a readable PNG header)',
            'logo could not be parsed: y.svg (no viewBox and no pixel width/height on the root <svg>)',
        ]);
    });

    it('is silent without a ref or a resolver', async () => {
        const warn: string[] = [];
        expect(await loadLogo(undefined, resolverFor({}), (m) => warn.push(m))).toBeUndefined();
        expect(await loadLogo('a.png', undefined, (m) => warn.push(m))).toBeUndefined();
        expect(warn).toEqual([]);
    });
});

describe('renderSvg — header logo', () => {
    const DSL = `nowline v1

roadmap r "Platform 2026" logo:"./acme.svg" start:2026-01-05

swimlane a "A"
  item x duration:1w
`;

    it('scales an SVG logo into its box through a viewBox viewport', async () => {
        const model = await parseToModel(DSL, { logo: { width: 300, height: 100 } });
        const svg = await renderSvg(model, {
            assetResolver: async () => ({
                bytes: bytes(
                    '<svg width="300" height="100" viewBox="0 0 30 10"><rect width="30" height="10"/></svg>',
                ),
                mime: 'image/svg+xml',
            }),
        });
        const box = model.header.logo?.box;
        expect(box).toBeDefined();
        expect(svg).toContain(
            `<svg data-layer="logo" height="${box?.height}" overflow="hidden" preserveAspectRatio="xMidYMid meet" viewBox="0 0 300 100" width="${box?.width}" x="${box?.x}" y="${box?.y}">`,
        );
        // The asset's own root keeps its viewBox but drops its size, so it
        // fills the viewport instead of drawing at 300 x 100.
        expect(svg).toContain('<svg viewBox="0 0 30 10"><rect');
    });

    it('stretches a raster logo to the non-square box, not a square', async () => {
        const model = await parseToModel(DSL.replace('acme.svg', 'acme.png'), {
            logo: { width: 4, height: 1 },
        });
        const svg = await renderSvg(model, {
            assetResolver: async () => ({ bytes: png(4, 1), mime: 'image/png' }),
        });
        expect(svg).toMatch(
            /<image data-layer="logo" height="36" href="data:image\/png;base64,[^"]+" preserveAspectRatio="xMidYMid meet" width="144"/,
        );
    });

    it('reports what the sanitizer removed in one warning per logo', async () => {
        const model = await parseToModel(DSL, { logo: { width: 1, height: 1 } });
        const warnings: string[] = [];
        await renderSvg(model, {
            warn: (m) => warnings.push(m),
            assetResolver: async () => ({
                bytes: bytes(
                    '<svg viewBox="0 0 1 1" inkscape:label="x"><script>alert(1)</script>' +
                        '<rect onclick="a()" onload="b()" width="1" height="1"/><rect onclick="c()"/></svg>',
                ),
                mime: 'image/svg+xml',
            }),
        });
        expect(warnings).toEqual([
            'logo ./acme.svg: removed unsupported SVG content: <script>, event handler onclick, event handler onload',
        ]);
    });

    it('embeds a loaded logo without resolving the asset again', async () => {
        const model = await parseToModel(DSL, { logo: { width: 300, height: 100 } });
        const asset = {
            bytes: bytes('<svg viewBox="0 0 30 10"><rect width="30" height="10"/></svg>'),
            mime: 'image/svg+xml',
        };
        let reads = 0;
        const assetResolver = async () => {
            reads++;
            return asset;
        };
        const loaded = { ref: './acme.svg', dimensions: { width: 300, height: 100 }, asset };
        const viaLogo = await renderSvg(model, { assetResolver, logo: loaded });
        expect(reads).toBe(0);
        // Same bytes in, same SVG out.
        expect(viaLogo).toBe(await renderSvg(model, { assetResolver }));
        expect(reads).toBe(1);
        // Without a resolver the loaded bytes still embed.
        expect(await renderSvg(model, { logo: loaded })).toBe(viaLogo);
    });

    it('resolves the asset when the loaded logo is for another ref', async () => {
        const model = await parseToModel(DSL, { logo: { width: 300, height: 100 } });
        const asset = { bytes: bytes('<svg viewBox="0 0 30 10"/>'), mime: 'image/svg+xml' };
        let reads = 0;
        await renderSvg(model, {
            assetResolver: async () => {
                reads++;
                return asset;
            },
            logo: { ref: './other.svg', dimensions: { width: 300, height: 100 }, asset },
        });
        expect(reads).toBe(1);
    });

    it('shifts the title right of the logo', async () => {
        const plain = await renderSvg(await parseToModel(DSL));
        const model = await parseToModel(DSL, { logo: { width: 1, height: 1 } });
        const withLogo = await renderSvg(model, {
            assetResolver: async () => ({
                bytes: bytes('<svg viewBox="0 0 1 1"/>'),
                mime: 'image/svg+xml',
            }),
        });
        const titleX = (svg: string): number =>
            Number(/x="([\d.]+)"[^>]*>Platform 2026</.exec(svg)?.[1]);
        expect(titleX(withLogo) - titleX(plain)).toBe(model.header.textInset?.x);
    });
});
