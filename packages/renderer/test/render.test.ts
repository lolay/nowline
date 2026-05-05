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
        // The mark renders as a "Powered by nowline" link in the canvas's
        // bottom margin. The whole string sits inside one <a href> so the
        // entire phrase is clickable and stays announced as a single link.
        expect(svg).toContain('data-layer="attribution"');
        expect(svg).toContain('aria-label="Powered by nowline"');
        expect(svg).toContain('>Powered by</text>');
        expect(svg).toContain('https://nowline.io');
    });
});

describe('renderSvg — lane capacity badge', () => {
    it('paints a multiplier badge inside the frame tab', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  item x "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // Lane swimlane block should contain a 5× text node from the
        // capacity badge. Identify the swimlane's <g> by data-id and
        // confirm the badge appears inside it.
        const laneFragment = svg.match(/<g data-id="sprint" data-layer="swimlane">[\s\S]*?<\/g>/);
        expect(laneFragment).not.toBeNull();
        expect(laneFragment![0]).toContain('>5\u00D7<');
    });

    it('paints a person SVG glyph inside the frame tab', async () => {
        // `team` is a grammar keyword — pick a non-keyword lane id.
        const dsl = `nowline v1\n\nconfig\nstyle counted\n  capacity-icon: person\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane crew "Team" capacity:8 style:counted\n  item x "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const laneFragment = svg.match(/<g data-id="crew" data-layer="swimlane">[\s\S]*?<\/g>/);
        expect(laneFragment).not.toBeNull();
        // Number text + curated person SVG icon in the chiclet.
        expect(laneFragment![0]).toContain('>8<');
        expect(laneFragment![0]).toMatch(/<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<circle[^>]*currentColor/);
    });

    it('omits the badge when no capacity is declared', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint"\n  item x "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const laneFragment = svg.match(/<g data-id="sprint" data-layer="swimlane">[\s\S]*?<\/g>/);
        expect(laneFragment).not.toBeNull();
        // No multiplication sign and no SVG icon inside the lane block.
        expect(laneFragment![0]).not.toContain('\u00D7');
        expect(laneFragment![0]).not.toMatch(/<svg [^>]*viewBox="0 0 24 24"/);
    });

    it('renders inline-literal capacity-icon in the badge via tspan', async () => {
        const dsl = `nowline v1\n\nconfig\nstyle gear\n  capacity-icon: "⚙"\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane ops "Ops" capacity:4 style:gear\n  item x "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const laneFragment = svg.match(/<g data-id="ops" data-layer="swimlane">[\s\S]*?<\/g>/);
        expect(laneFragment).not.toBeNull();
        expect(laneFragment![0]).toMatch(/>4<tspan dx="[^"]+">⚙<\/tspan>/);
    });

    it('still emits the badge when the lane has both an owner and capacity', async () => {
        const dsl = `nowline v1\n\nconfig\nteam plat "Platform"\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" owner:plat capacity:5\n  item x "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const laneFragment = svg.match(/<g data-id="sprint" data-layer="swimlane">[\s\S]*?<\/g>/);
        expect(laneFragment).not.toBeNull();
        // Owner badge text + capacity badge both appear.
        expect(laneFragment![0]).toContain('owner: Platform');
        expect(laneFragment![0]).toContain('>5\u00D7<');
    });
});

describe('renderSvg — item capacity suffix', () => {
    it('renders multiplier capacity as a single text node ending in U+00D7', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w capacity:5\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // Default `multiplier` glyph: number+× concatenated with no
        // separator. The exact text node may be split across multiple
        // <text> elements (one for metaText, one for the suffix), so look
        // for the suffix by its tail character.
        expect(svg).toContain('>5\u00D7<');
    });

    it('renders person capacity as text + curated SVG icon', async () => {
        const dsl = `nowline v1\n\nconfig\nstyle counted\n  capacity-icon: person\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w capacity:3 style:counted\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // Number renders as plain text, then an inline <svg> with a
        // currentColor circle (head) — that's the Lucide `user` shape.
        expect(svg).toContain('>3<');
        expect(svg).toMatch(/<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<circle[^>]*currentColor/);
    });

    it('renders points capacity as text + star SVG', async () => {
        const dsl = `nowline v1\n\nconfig\nstyle scored\n  capacity-icon: points\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w capacity:8 style:scored\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(svg).toContain('>8<');
        // Star is rendered as a <polygon> filled with currentColor.
        expect(svg).toMatch(/<polygon[^>]*points="12 2 15\.09/);
    });

    it('renders inline Unicode literal capacity-icon as a <tspan>-separated glyph', async () => {
        const dsl = `nowline v1\n\nconfig\nstyle gear\n  capacity-icon: "⚙"\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w capacity:2 style:gear\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // Number + tspan-separated literal in a single <text> element.
        expect(svg).toMatch(/>2<tspan dx="[^"]+">⚙<\/tspan>/);
    });

    it('renders custom glyph capacity by dereferencing to its unicode payload', async () => {
        // Style ref on the item itself — `capacity-icon` is an entity-level
        // style and doesn't cascade from a parent swimlane to its children.
        const dsl = `nowline v1\n\nconfig\nglyph budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Funded"\n  item x "Phase A" duration:2w capacity:12000 style:finance\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(svg).toMatch(/>12000<tspan dx="[^"]+">💰<\/tspan>/);
    });

    it('omits the suffix when capacity-icon is "none"', async () => {
        const dsl = `nowline v1\n\nconfig\nstyle silent\n  capacity-icon: none\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w capacity:7 style:silent\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // Number renders, but no glyph follows.
        expect(svg).toContain('>7<');
        expect(svg).not.toContain('\u00D7');
        expect(svg).not.toMatch(/<tspan/);
        // No SVG icon either.
        expect(svg).not.toMatch(/<svg [^>]*viewBox="0 0 24 24"/);
    });

    it('omits the entire suffix when no capacity is declared', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // No multiplication sign, no curated SVG glyphs.
        expect(svg).not.toContain('\u00D7');
        expect(svg).not.toMatch(/viewBox="0 0 24 24"/);
    });
});
