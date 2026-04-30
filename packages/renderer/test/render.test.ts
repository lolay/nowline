import { describe, it, expect } from 'vitest';
import { renderSvg } from '../src/index.js';
import { parseToModel } from './helpers.js';

const BASIC_DSL = `nowline v1

roadmap r1 "Basic" start:2026-01-05

swimlane build "Build"
  item design "Design" duration:1w status:done
  item implement "Implement" duration:2w status:in-progress
  item ship "Ship" duration:3d status:planned
`;

describe('renderSvg', () => {
    it('produces a valid SVG document', async () => {
        const model = await parseToModel(BASIC_DSL);
        const svg = await renderSvg(model);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('data-layer="swimlane"');
        expect(svg).toContain('data-layer="item"');
    });

    it('is byte-for-byte deterministic', async () => {
        const model = await parseToModel(BASIC_DSL);
        const a = await renderSvg(model);
        const b = await renderSvg(model);
        expect(a).toBe(b);
    });

    it('emits dark-theme background when model theme is dark', async () => {
        const light = await parseToModel(BASIC_DSL, { theme: 'light' });
        const dark = await parseToModel(BASIC_DSL, { theme: 'dark' });
        const lightSvg = await renderSvg(light);
        const darkSvg = await renderSvg(dark);
        expect(lightSvg).toContain('data-theme="light"');
        expect(darkSvg).toContain('data-theme="dark"');
        expect(lightSvg).not.toBe(darkSvg);
    });

    it('respects noLinks by omitting link icons', async () => {
        const dsl = `nowline v1

roadmap r1 "R"

swimlane a "A"
  item x duration:1w link:https://linear.app/team/issue/X-1
`;
        const model = await parseToModel(dsl);
        const withLinks = await renderSvg(model);
        const noLinks = await renderSvg(model, { noLinks: true });
        expect(withLinks).toContain('href="https://linear.app');
        expect(noLinks).not.toContain('href="https://linear.app');
    });

    it('renders the now-line when today falls inside the range', async () => {
        const dsl = `nowline v1

roadmap r1 "R" start:2026-01-01 length:26w

swimlane a "A"
  item x duration:1w
`;
        const model = await parseToModel(dsl, { today: new Date(Date.UTC(2026, 2, 1)) });
        const svg = await renderSvg(model);
        expect(svg).toContain('data-layer="nowline"');
        // m2d: pill label reads the short-form "now" rather than "Today".
        expect(svg).toContain('>now<');
    });

    it('embeds inline SVG logos via the asset resolver', async () => {
        const dsl = `nowline v1

roadmap r1 "R"

swimlane a "A"
  item x duration:1w
`;
        const model = await parseToModel(dsl);
        // Attach a logo box to exercise the resolver path.
        model.header.logo = {
            box: { x: 0, y: 0, width: 36, height: 36 },
            assetRef: 'logo.svg',
        };
        const svg = await renderSvg(model, {
            assetResolver: async () => ({
                bytes: new TextEncoder().encode('<svg><rect x="0" y="0" width="4" height="4"/></svg>'),
                mime: 'image/svg+xml',
            }),
        });
        expect(svg).toContain('<rect');
    });

    it('embeds raster logos as base64 data URIs', async () => {
        const model = await parseToModel(BASIC_DSL);
        model.header.logo = {
            box: { x: 0, y: 0, width: 36, height: 36 },
            assetRef: 'logo.png',
        };
        const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const svg = await renderSvg(model, {
            assetResolver: async () => ({ bytes: pngBytes, mime: 'image/png' }),
        });
        expect(svg).toContain('data:image/png;base64');
    });

    it('ships the Nowline attribution mark', async () => {
        const model = await parseToModel(BASIC_DSL);
        const svg = await renderSvg(model);
        // m2d: wordmark glyph replaces the "Made with Nowline" text. The
        // accessible label preserves the original phrase for screen readers.
        expect(svg).toContain('data-layer="attribution"');
        expect(svg).toContain('aria-label="Made with Nowline"');
        expect(svg).toContain('https://nowline.io');
    });
});
