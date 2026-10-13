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
});

// An Inkscape save: editor namespaces, a namedview, and colors in `style`.
const INKSCAPE_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg width="120mm" height="40mm" viewBox="0 0 120 40" version="1.1" id="svg5"
   inkscape:version="1.3.2" sodipodi:docname="acme.svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">
  <sodipodi:namedview id="namedview7" pagecolor="#ffffff" inkscape:document-units="mm" />
  <metadata><rdf:RDF><cc:Work rdf:about="" /></rdf:RDF></metadata>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <rect style="color:#000000;fill:#1e3a8a;fill-opacity:1;stroke:none;mix-blend-mode:normal;-inkscape-stroke:none;enable-background:accumulate" width="120" height="40" />
    <text xml:space="preserve" style="font-size:22px;line-height:1.25;font-family:sans-serif;fill:#ffffff" x="40" y="28"><tspan sodipodi:role="line" x="40" y="28">ACME</tspan></text>
  </g>
  <g inkscape:label="Hidden" inkscape:groupmode="layer" style="display:none"><rect width="1" height="1"/></g>
</svg>`;

describe('sanitizeSvg — styles', () => {
    const run = (input: string): { out: string; warnings: string[] } => {
        const warnings: string[] = [];
        const out = sanitizeSvg(input, { onWarn: (m) => warnings.push(m) });
        return { out, warnings };
    };

    it('keeps Inkscape logo colors and drops its editor metadata silently', () => {
        const { out, warnings } = run(INKSCAPE_SVG);
        expect(warnings).toEqual([]);
        expect(out).toContain('fill="#1e3a8a"');
        expect(out).toContain('fill="#ffffff"');
        expect(out).toContain('font-size="22px"');
        expect(out).toContain('display="none"');
        expect(out).not.toMatch(/style=|inkscape|sodipodi|namedview|metadata|rdf|xmlns:|version=/);
    });

    it('applies class rules from <style> between attributes and inline style', () => {
        const { out, warnings } = run(
            '<svg><defs><style>/* Illustrator */ .a { fill: #111; stroke: #222 } .b, .c { fill: #333 !important; }</style></defs>' +
                '<rect class="a" fill="#000" width="1" height="1"/>' +
                '<rect class="a c" width="1" height="1"/>' +
                '<rect class="a" style="fill:#444" width="1" height="1"/></svg>',
        );
        expect(warnings).toEqual([]);
        expect(out).not.toContain('<style');
        expect(out).not.toContain('.a {');
        const rects = out.match(/<rect[^>]*>/g) ?? [];
        expect(rects[0]).toContain('fill="#111"');
        expect(rects[0]).toContain('stroke="#222"');
        expect(rects[1]).toContain('fill="#333"');
        expect(rects[2]).toContain('fill="#444"');
    });

    it('reports and skips rules it cannot apply', () => {
        const { out, warnings } = run(
            '<svg><style>rect { fill: red } #x .y { fill: blue } @import url(evil.css);</style><rect width="1" height="1"/></svg>',
        );
        expect(out).not.toContain('red');
        expect(out).not.toContain('blue');
        expect(warnings).toEqual([
            'sanitizer: dropping <style> rule rect',
            'sanitizer: dropping <style> rule #x .y',
            'sanitizer: dropping <style> at-rule',
        ]);
    });

    it('warns on a dropped property that would change the drawing', () => {
        const { warnings } = run(
            '<svg><rect style="mix-blend-mode:multiply;shape-inside:url(#r);marker:none;-webkit-x:1" width="1" height="1"/></svg>',
        );
        expect(warnings).toEqual([
            'sanitizer: dropping style property mix-blend-mode',
            'sanitizer: dropping style property shape-inside',
        ]);
    });

    it('rejects external and smuggled values that arrive through style', () => {
        const { out, warnings } = run(
            '<svg><defs><linearGradient id="g"/></defs>' +
                '<rect style="fill:url(https://evil.example/x.svg#a)" width="1" height="1"/>' +
                '<rect style="fill:url(#g) url(https://evil.example/y)" width="1" height="1"/>' +
                '<rect class="z" style="stroke:expression(alert(1))" width="1" height="1"/></svg>',
        );
        expect(out).not.toContain('evil.example');
        expect(out).not.toContain('expression');
        expect(warnings).toEqual([
            'sanitizer: dropping suspicious value at fill',
            'sanitizer: dropping suspicious value at fill',
            'sanitizer: dropping suspicious value at stroke',
        ]);
    });

    it('rejects an external url() in a plain attribute too', () => {
        const { out, warnings } = run(
            '<svg><rect fill="url(https://evil.example/p)" width="1" height="1"/></svg>',
        );
        expect(out).not.toContain('evil.example');
        expect(warnings).toEqual(['sanitizer: dropping suspicious value at fill']);
    });
});
