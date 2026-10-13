import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../src/svg/sanitize.js';

describe('sanitizeSvg', () => {
    it('keeps benign svg content', () => {
        const input =
            '<svg xmlns="http://www.w3.org/2000/svg"><g><rect x="1" y="2" width="3" height="4"/></g></svg>';
        const out = sanitizeSvg(input);
        expect(out).toContain('<svg');
        expect(out).toContain('<rect');
        expect(out).not.toContain('script');
    });

    it('drops <script>', () => {
        const warnings: string[] = [];
        const input =
            '<svg><script>alert(1)</script><rect x="0" y="0" width="4" height="4"/></svg>';
        const out = sanitizeSvg(input, { onWarn: (m) => warnings.push(m) });
        expect(out).not.toContain('<script');
        expect(out).not.toContain('alert');
        expect(warnings.some((w) => w.includes('<script>'))).toBe(true);
    });

    it('strips event handlers', () => {
        const input = '<svg><rect x="0" y="0" width="4" height="4" onclick="evil()"/></svg>';
        const out = sanitizeSvg(input);
        expect(out).not.toContain('onclick');
        expect(out).not.toContain('evil');
    });

    it('rejects external hrefs', () => {
        const input = '<svg><use href="https://example.com/evil.svg#x"/></svg>';
        const out = sanitizeSvg(input);
        expect(out).not.toContain('example.com');
    });

    it('allows fragment-only hrefs and rewrites them', () => {
        const input =
            '<svg><defs><g id="logo"><rect x="0" y="0" width="4" height="4"/></g></defs><use href="#logo"/></svg>';
        const out = sanitizeSvg(input, { idPrefix: 'nl-logo' });
        expect(out).toMatch(/id="nl-logo-\d+"/);
        expect(out).toMatch(/href="#nl-logo-\d+"/);
    });

    it('drops <foreignObject>', () => {
        const input = '<svg><foreignObject><body><script>x</script></body></foreignObject></svg>';
        const out = sanitizeSvg(input);
        expect(out).not.toContain('foreignObject');
        expect(out).not.toContain('script');
    });

    it('drops inline style attributes', () => {
        const input =
            '<svg><rect style="fill:url(http://evil)" x="0" y="0" width="4" height="4"/></svg>';
        const out = sanitizeSvg(input);
        expect(out).not.toContain('style=');
    });

    it('rewrites url(#id) references inside fill', () => {
        const input =
            '<svg><defs><linearGradient id="g1"><stop offset="0" stop-color="#f00"/></linearGradient></defs><rect fill="url(#g1)" x="0" y="0" width="4" height="4"/></svg>';
        const out = sanitizeSvg(input, { idPrefix: 'nl-logo' });
        expect(out).toMatch(/url\(#nl-logo-\d+\)/);
    });

    it('is deterministic for identical input', () => {
        const input =
            '<svg><g id="a"><rect x="0" y="0" width="4" height="4"/></g><use href="#a"/></svg>';
        const a = sanitizeSvg(input);
        const b = sanitizeSvg(input);
        expect(a).toBe(b);
    });

    describe('rootViewport', () => {
        const viewport = { x: '10', y: '20', width: '36', height: '36' };

        it('places the root <svg> in the viewport and keeps its viewBox', () => {
            const out = sanitizeSvg(
                '<svg viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100"/></svg>',
                { rootViewport: viewport },
            );
            expect(out).toMatch(/^<svg [^>]*\bx="10"/);
            expect(out).toMatch(/^<svg [^>]*\by="20"/);
            expect(out).toMatch(/^<svg [^>]*\bwidth="36"/);
            expect(out).toMatch(/^<svg [^>]*\bheight="36"/);
            expect(out).toMatch(/^<svg [^>]*viewBox="0 0 200 100"/);
            expect(out).toMatch(/^<svg [^>]*preserveAspectRatio="xMidYMid meet"/);
            // Only the root is touched.
            expect(out).toContain('<rect height="100" width="200"/>');
        });

        it('derives a viewBox from a sized root without one, so it scales', () => {
            const out = sanitizeSvg('<svg width="200px" height="100"><rect/></svg>', {
                rootViewport: viewport,
            });
            expect(out).toMatch(/^<svg [^>]*viewBox="0 0 200 100"/);
            expect(out).toMatch(/^<svg [^>]*\bwidth="36"/);
        });

        it("keeps the author's preserveAspectRatio", () => {
            const out = sanitizeSvg(
                '<svg viewBox="0 0 1 1" preserveAspectRatio="xMinYMin slice"></svg>',
                { rootViewport: viewport },
            );
            expect(out).toContain('preserveAspectRatio="xMinYMin slice"');
        });
    });
});
