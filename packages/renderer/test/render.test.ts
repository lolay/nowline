import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { darkTheme, lightTheme, WAVE_STRIP_LABEL_PAD_PX } from '@nowline/layout';
import { describe, expect, it } from 'vitest';
import { renderSvg } from '../src/index.js';
import { parseFilesToModel, parseToModel } from './helpers.js';

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
  item x duration:1w link:https://github.com/acme/team/issues/1
`;
        const model = await parseToModel(dsl);
        const withLinks = await renderSvg(model);
        const noLinks = await renderSvg(model, { noLinks: true });
        expect(withLinks).toContain('href="https://github.com');
        expect(noLinks).not.toContain('href="https://github.com');
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
                bytes: new TextEncoder().encode(
                    '<svg><rect x="0" y="0" width="4" height="4"/></svg>',
                ),
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
        expect(laneFragment![0]).toMatch(
            /<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<circle[^>]*currentColor/,
        );
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
        // metaText + tspan-separated number + tspan-separated literal,
        // all inside the same <text> element so the gap is browser-
        // computed instead of estimated. Order: `2w<tspan>2</tspan><tspan>⚙</tspan>`.
        expect(svg).toMatch(/>2w<tspan dx="[^"]+">2<\/tspan><tspan dx="[^"]+">⚙<\/tspan>/);
    });

    it('renders custom symbol capacity by dereferencing to its unicode payload', async () => {
        // Style ref on the item itself — `capacity-icon` is an entity-level
        // style and doesn't cascade from a parent swimlane to its children.
        const dsl = `nowline v1\n\nconfig\nsymbol budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Funded"\n  item x "Phase A" duration:2w capacity:12000 style:finance\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(svg).toMatch(/>2w<tspan dx="[^"]+">12000<\/tspan><tspan dx="[^"]+">💰<\/tspan>/);
    });

    it('omits the glyph when capacity-icon is "none" (number still renders inline)', async () => {
        const dsl = `nowline v1\n\nconfig\nstyle silent\n  capacity-icon: none\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item x "Build" duration:2w capacity:7 style:silent\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        // The number sits in a tspan inside the meta <text> for inline
        // flow, but no glyph follows. Confirm: number present, exactly
        // one tspan inside the item group, no multiplier sign, no icon SVG.
        const fragment = svg.match(/<g data-id="x" data-layer="item">[\s\S]*?<\/g>/)![0];
        expect(fragment).toMatch(/>2w<tspan dx="[^"]+">7<\/tspan>/);
        const tspanCount = (fragment.match(/<tspan/g) || []).length;
        expect(tspanCount).toBe(1);
        expect(fragment).not.toContain('\u00D7');
        expect(fragment).not.toMatch(/<svg [^>]*viewBox="0 0 24 24"/);
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

describe('renderSvg — item size chip (driver-only meta)', () => {
    // The driver token (size chip or duration literal) is composed into
    // metaText by the layout. The renderer paints metaText verbatim in
    // one `<text>` element on the meta line (see specs/rendering.md §
    // Item size chip).

    function itemMetaTextNode(svg: string, itemId: string): string | null {
        const fragment = svg.match(
            new RegExp(`<g data-id="${itemId}" data-layer="item">[\\s\\S]*?<\\/g>`),
        );
        if (!fragment) return null;
        // The meta line is the <text> element with font-size="11" inside
        // the item group (the title sits at font-size="13"). The element
        // may carry trailing `<tspan>` children for the capacity suffix
        // (multiplier or literal glyph) — strip them so the test asserts
        // only the metaText portion.
        const metaOpen = fragment[0].match(/<text [^>]*font-size="11"[^>]*>([\s\S]*?)<\/text>/);
        if (!metaOpen) return null;
        const inner = metaOpen[1].split('<tspan')[0];
        return inner;
    }

    it('paints the size id verbatim (no case folding) when no title is set', async () => {
        const dsl = `nowline v1\n\nconfig\nsize m effort:1w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" size:m\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('m');
    });

    it('paints the size title when one is provided (author-controlled chip label)', async () => {
        // Title takes precedence — `size m "M"` is the canonical
        // t-shirt opt-in for an uppercase chip.
        const dsl = `nowline v1\n\nconfig\nsize m "M" effort:1w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" size:m\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('M');
    });

    it('shows chip only when size: drives (derived span is bar width only)', async () => {
        const dsl = `nowline v1\n\nconfig\nsize m effort:1w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" size:m capacity:5\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('m');
    });

    it('omits the chip when duration: literal overrides size: (driver is literal only)', async () => {
        const dsl = `nowline v1\n\nconfig\nsize lg effort:2w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" size:lg duration:3d capacity:2\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('3d');
    });

    it('renders `[driver][capacity suffix]` for sized items', async () => {
        const dsl = `nowline v1\n\nconfig\nsize m effort:2w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" size:m capacity:2\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('m');
        const fragment = svg.match(/<g data-id="build" data-layer="item">[\s\S]*?<\/g>/)![0];
        expect(fragment).toContain('>2\u00D7<');
    });

    it('omits the chip entirely for items without size:', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" duration:1w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('1w');
    });

    it('composes duration driver before owner on the meta line', async () => {
        const dsl = `nowline v1\n\nperson dana "Dana"\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" duration:1w owner:dana status:done\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('1w Dana');
    });

    it('composes chip before owner on the meta line when size: drives', async () => {
        const dsl = `nowline v1\n\nconfig\nsize m effort:1w\n\nperson eve "Eve"\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Sprint"\n  item build "Build" size:m owner:eve status:done\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(itemMetaTextNode(svg, 'build')).toBe('m Eve');
    });
});

describe('renderSvg — lane utilization underline', () => {
    // Light-theme palette anchors. Tests assert by hex so a token rename
    // would surface as a deliberate, reviewable change.
    const GREEN = '#10b981';
    const YELLOW = '#f59e0b';
    const RED = '#ef4444';

    function laneUtilizationFragment(svg: string, laneId: string): string | null {
        // Attribute order: `attrs()` sorts keys alphabetically, so
        // `data-id` precedes `data-layer` in the emitted markup.
        const m = svg.match(
            new RegExp(`<g data-id="${laneId}" data-layer="lane-utilization">[\\s\\S]*?<\\/g>`),
        );
        return m ? m[0] : null;
    }

    it('paints a single green rect across a healthy single-item lane', async () => {
        // Load = 1 item × capacity-default-1 = 1 against lane capacity:5,
        // u = 0.2 → green for the whole span.
        const dsl = `nowline v1\n\nconfig\nsize m effort:2w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  item build "Build" size:m\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        const rects = fragment!.match(/<rect [^/]*\/>/g) ?? [];
        expect(rects).toHaveLength(1);
        expect(rects[0]).toContain(`fill="${GREEN}"`);
        expect(rects[0]).toContain('data-utilization="green"');
        expect(rects[0]).toContain('height="2"');
    });

    it('paints yellow when load lands in `[warn-at, over-at)`', async () => {
        // capacity:5 with one item carrying capacity:4 → u = 0.8 → yellow.
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  item build "Build" duration:2w capacity:4\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        expect(fragment!).toContain(`fill="${YELLOW}"`);
        expect(fragment!).toContain('data-utilization="yellow"');
    });

    it('paints red when load reaches or exceeds `over-at`', async () => {
        // Two parallel items, each capacity:4 → load 8 against capacity:5
        // → u = 1.6 → red.
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  parallel\n    item a "A" duration:2w capacity:4\n    item b "B" duration:2w capacity:4\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        expect(fragment!).toContain(`fill="${RED}"`);
        expect(fragment!).toContain('data-utilization="red"');
    });

    it('paints one rect per coalesced segment along the band bottom edge', async () => {
        // Sequential items: green (1/5), then yellow when a parallel block
        // bumps load to 4 (4/5 = 0.8), then green again when it ends.
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  item warmup "Warm" duration:1w capacity:1\n  parallel\n    item p1 "P1" duration:1w capacity:2\n    item p2 "P2" duration:1w capacity:2\n  item cooldown "Cool" duration:1w capacity:1\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        const rects = fragment!.match(/<rect [^/]*\/>/g) ?? [];
        // green → yellow → green: three coalesced segments.
        expect(rects).toHaveLength(3);
        expect(rects[0]).toContain('data-utilization="green"');
        expect(rects[1]).toContain('data-utilization="yellow"');
        expect(rects[2]).toContain('data-utilization="green"');
        // All rects share the same y (band bottom edge).
        const ys = rects.map((r) => r.match(/y="([^"]+)"/)![1]);
        expect(new Set(ys).size).toBe(1);
    });

    it('omits the underline group when the lane has no capacity', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint"\n  item build "Build" duration:2w\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        expect(svg).not.toContain('data-layer="lane-utilization"');
    });

    it('omits the underline when both thresholds are `none` (full opt-out)', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5 utilization-warn-at:none utilization-over-at:none\n  item build "Build" duration:2w capacity:8\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).toBeNull();
    });

    it('uses dark-theme tokens when the model theme is dark', async () => {
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  item build "Build" duration:2w capacity:4\n`;
        const model = await parseToModel(dsl, { theme: 'dark' });
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        // Dark yellow token from themes/dark.ts.
        expect(fragment!).toContain('fill="#fbbf24"');
        // Light yellow must NOT appear in this fragment.
        expect(fragment!).not.toContain(YELLOW);
    });

    it('respects custom `utilization-warn-at` / `utilization-over-at` thresholds', async () => {
        // With warn:50% and over:90%, load 4/5 = 0.8 lands in the yellow
        // band that the default (warn:80% / over:100%) would also call
        // yellow — but here we move the thresholds so 0.8 sits clearly in
        // the middle of [0.5, 0.9).
        const dsl = `nowline v1\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5 utilization-warn-at:50% utilization-over-at:90%\n  item build "Build" duration:2w capacity:4\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        expect(fragment!).toContain('data-utilization="yellow"');
    });

    it('positions the underline rect at the lane band bottom edge', async () => {
        // Sanity-check geometry: the rect's y + 2 should equal the lane
        // box bottom. Locate the lane box via `data-id="sprint"
        // data-layer="swimlane-bg"` (renderSwimlaneBg's rect).
        const dsl = `nowline v1\n\nconfig\nsize m effort:2w\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane sprint "Sprint" capacity:5\n  item build "Build" size:m\n`;
        const model = await parseToModel(dsl);
        const svg = await renderSvg(model);
        const bg = svg.match(/<g data-id="sprint" data-layer="swimlane-bg">[\s\S]*?<\/g>/)?.[0];
        expect(bg).toBeDefined();
        const bgRect = bg!.match(/<rect ([^/]*)\/>/)![1];
        const bgY = parseFloat(bgRect.match(/y="([^"]+)"/)![1]);
        const bgH = parseFloat(bgRect.match(/height="([^"]+)"/)![1]);
        const fragment = laneUtilizationFragment(svg, 'sprint');
        expect(fragment).not.toBeNull();
        const utilRect = fragment!.match(/<rect ([^/]*)\/>/)![1];
        const utilY = parseFloat(utilRect.match(/y="([^"]+)"/)![1]);
        // 2px tall, flush with band bottom.
        expect(utilY + 2).toBeCloseTo(bgY + bgH, 5);
    });

    it('renders title-only swimlanes and id-less parallel/group blocks', async () => {
        const dsl = `nowline v1

roadmap "Generative AI" start:2026-04-06 scale:2w calendar:business

anchor "Kickoff" date:2026-04-06
milestone "Beta" date:2026-06-15

swimlane "Platform"
  item "Technology Selection" duration:2w status:done
  item api "API" duration:2w status:done

swimlane "Web"
  item "Web Prototype" duration:4w status:done

swimlane "Mobile"
  parallel
    group "iOS"
      item "iOS Prototype" duration:4w status:done
    group "Android"
      item "Android Prototype" duration:4w status:done
`;
        const model = await parseToModel(dsl, {
            theme: 'light',
            today: new Date(Date.UTC(2026, 5, 1)),
        });
        expect(model.swimlanes).toHaveLength(3);
        expect(model.swimlanes.map((lane) => lane.title)).toEqual(['Platform', 'Web', 'Mobile']);

        const mobile = model.swimlanes[2];
        const parallelChild = mobile.children.find((c) => c.kind === 'parallel');
        expect(parallelChild).toBeDefined();
        if (parallelChild?.kind !== 'parallel') throw new Error('expected parallel');
        expect(parallelChild.children.filter((c) => c.kind === 'group')).toHaveLength(2);

        const svg = await renderSvg(model);
        for (const label of [
            'Platform',
            'Web',
            'Mobile',
            // "Technology Selection" word-wraps to two <text> lines in its
            // 2w bar, so each line is painted as its own text node.
            'Technology',
            'Selection',
            'iOS Prototype',
            'Android Prototype',
            'Kickoff',
            'Beta',
        ]) {
            expect(svg).toContain(label);
        }
        expect(svg).toContain('data-layer="swimlane"');
        expect(svg).toContain('data-layer="item"');
    });
});

describe('renderSvg — wrapped item titles', () => {
    // The Platform lane from lolay/nowline#59. At `scale:2w` a `2w` item is a
    // 148px bar with a 124px text area, so "Technology Selection" (~151px)
    // wraps to two lines instead of spilling to the right.
    const HEADER = `nowline v1\n\nroadmap r1 "R" start:2026-04-06 scale:2w\n\n`;

    interface TextNode {
        x: number;
        y: number;
        fontSize: number;
        content: string;
    }

    function itemFragment(svg: string, itemId: string): string {
        const m = svg.match(
            new RegExp(`<g data-id="${itemId}" data-layer="item">[\\s\\S]*?<\\/g>`),
        );
        if (!m) throw new Error(`no item group for ${itemId}`);
        return m[0];
    }

    function textNodes(fragment: string): TextNode[] {
        const out: TextNode[] = [];
        for (const m of fragment.matchAll(/<text ([^>]*)>([^<]*)(?:<tspan[\s\S]*?)?<\/text>/g)) {
            // Anchor on whitespace so `y` doesn't match inside `font-family="`.
            const attr = (name: string) =>
                Number(m[1].match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1]);
            out.push({
                x: attr('x'),
                y: attr('y'),
                fontSize: attr('font-size'),
                content: m[2],
            });
        }
        return out;
    }

    function barRect(fragment: string): { x: number; y: number; height: number } {
        const m = fragment.match(/<rect [^>]*>/);
        if (!m) throw new Error('no bar rect');
        const attr = (name: string) => Number(m[0].match(new RegExp(` ${name}="([^"]+)"`))?.[1]);
        return { x: attr('x'), y: attr('y'), height: attr('height') };
    }

    it('paints a wrapped title as two <text> lines 16px apart', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item tech "Technology Selection" duration:2w\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'tech');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['Technology', 'Selection']);
        expect(titles[0].y).toBe(bar.y + 20);
        expect(titles[1].y).toBe(bar.y + 36);
        expect(titles[1].y - titles[0].y).toBe(16);
        expect(titles[1].x).toBe(titles[0].x);
    });

    it('shifts the meta baseline below line 2 and grows the bar for it', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item tech "Technology Selection" duration:2w\n  item api "API" duration:3w\n`,
        );
        const svg = await renderSvg(model);
        const wrapped = itemFragment(svg, 'tech');
        const bar = barRect(wrapped);
        const meta = textNodes(wrapped).filter((t) => t.fontSize === 11);
        expect(meta).toHaveLength(1);
        expect(meta[0].content).toBe('2w');
        // 38 (one-line meta baseline) + 16 (one extra title line).
        expect(meta[0].y).toBe(bar.y + 54);
        expect(bar.height).toBe(72);

        // The one-line neighbour on the same row keeps the classic geometry.
        const plain = itemFragment(svg, 'api');
        const plainBar = barRect(plain);
        const plainText = textNodes(plain);
        expect(plainBar.y).toBe(bar.y);
        expect(plainBar.height).toBe(56);
        expect(plainText.filter((t) => t.fontSize === 13)).toHaveLength(1);
        expect(plainText.find((t) => t.fontSize === 13)?.y).toBe(plainBar.y + 20);
        expect(plainText.find((t) => t.fontSize === 11)?.y).toBe(plainBar.y + 38);
    });

    it('keeps a one-line in-bar title at x+12 and a single <text> (byte-stable path)', async () => {
        const model = await parseToModel(`${HEADER}swimlane s "S"\n  item api "API" duration:3w\n`);
        const fragment = itemFragment(await renderSvg(model), 'api');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles).toHaveLength(1);
        expect(titles[0].x).toBe(bar.x + 12);
    });

    it('starts a wrapped caption past the link tile, not underneath it', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item auth "Auth token refactor" duration:2w link:https://github.com/acme/team/issues/1\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'auth');
        const bar = barRect(fragment);
        const tile = fragment.match(/<a [^>]*><rect [^>]*>/)?.[0];
        expect(tile).toBeDefined();
        const tileX = Number(tile?.match(/ x="([^"]+)"/)?.[1]);
        const tileWidth = Number(tile?.match(/ width="([^"]+)"/)?.[1]);
        const tileRight = tileX + tileWidth;
        expect(tileRight).toBe(bar.x + 20);
        const texts = textNodes(fragment);
        const titles = texts.filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['Auth token', 'refactor']);
        for (const t of texts) expect(t.x).toBeGreaterThan(tileRight);
        // Layout's 24px inset: the same indent the wrap width was computed with.
        expect(titles[0].x).toBe(bar.x + 24);
    });

    it('clears the link tile on a one-line in-bar title too (latent overlap fix)', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item api "API" duration:3w link:https://github.com/acme/team/issues/1\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'api');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles).toHaveLength(1);
        // Used to be bar.x + 12, inside the tile that spans bar.x + 6 .. bar.x + 20.
        expect(titles[0].x).toBe(bar.x + 24);
    });

    it('does not indent past a link tile that noLinks omits', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item api "API" duration:3w link:https://github.com/acme/team/issues/1\n`,
        );
        const fragment = itemFragment(await renderSvg(model, { noLinks: true }), 'api');
        const bar = barRect(fragment);
        expect(fragment).not.toContain('<a ');
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles).toHaveLength(1);
        expect(titles[0].x).toBe(bar.x + 12);
    });

    it('still spills a title with an unbreakable word as one line beside the bar', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item big "Internationalization" duration:2w\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'big');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['Internationalization']);
        expect(titles[0].y).toBe(bar.y + 20);
        expect(bar.height).toBe(56);
        // Spilled: starts past the bar's right edge (148px wide).
        expect(titles[0].x).toBeGreaterThan(bar.x + 148);
    });
});

describe('renderSvg — explicit title line breaks', () => {
    // `scale:2w`: a `2w` item is a 148px bar. The `\\n` in a template string below is the
    // two-character DSL escape; Langium turns it into a real newline in the title.
    const HEADER = `nowline v1\n\nroadmap r1 "R" start:2026-04-06 scale:2w\n\n`;

    interface TextNode {
        x: number;
        y: number;
        fontSize: number;
        content: string;
    }

    function itemFragment(svg: string, itemId: string): string {
        const m = svg.match(
            new RegExp(`<g data-id="${itemId}" data-layer="item">[\\s\\S]*?<\\/g>`),
        );
        if (!m) throw new Error(`no item group for ${itemId}`);
        return m[0];
    }

    function textNodes(fragment: string): TextNode[] {
        const out: TextNode[] = [];
        for (const m of fragment.matchAll(/<text ([^>]*)>([^<]*)(?:<tspan[\s\S]*?)?<\/text>/g)) {
            const attr = (name: string) =>
                Number(m[1].match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1]);
            out.push({
                x: attr('x'),
                y: attr('y'),
                fontSize: attr('font-size'),
                content: m[2],
            });
        }
        return out;
    }

    function barRect(fragment: string): { x: number; y: number; height: number } {
        const m = fragment.match(/<rect [^>]*>/);
        if (!m) throw new Error('no bar rect');
        const attr = (name: string) => Number(m[0].match(new RegExp(` ${name}="([^"]+)"`))?.[1]);
        return { x: attr('x'), y: attr('y'), height: attr('height') };
    }

    /** No `<text>` element anywhere in the SVG may carry a raw line break. */
    function expectNoRawNewlineInText(svg: string): void {
        for (const m of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
            expect(m[1]).not.toMatch(/[\r\n]/);
        }
    }

    it('paints in-bar explicit lines as separate <text> elements 16px apart, meta below', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item three "Design\\nBuild\\nShip" duration:2w\n`,
        );
        const svg = await renderSvg(model);
        const fragment = itemFragment(svg, 'three');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['Design', 'Build', 'Ship']);
        expect(titles.map((t) => t.y)).toEqual([bar.y + 20, bar.y + 36, bar.y + 52]);
        expect(new Set(titles.map((t) => t.x)).size).toBe(1);
        expect(titles[0].x).toBe(bar.x + 12);
        const meta = textNodes(fragment).filter((t) => t.fontSize === 11);
        expect(meta).toHaveLength(1);
        // 38 + 2 extra title lines * 16.
        expect(meta[0].y).toBe(bar.y + 70);
        expect(bar.height).toBe(88);
        expectNoRawNewlineInText(svg);
    });

    it('paints a spilled explicit block as stacked <text> lines beside the bar, meta below', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item wide "Internationalization of\\nthe billing service" duration:2w\n`,
        );
        const svg = await renderSvg(model);
        const fragment = itemFragment(svg, 'wide');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual([
            'Internationalization of',
            'the billing service',
        ]);
        expect(titles.map((t) => t.y)).toEqual([bar.y + 20, bar.y + 36]);
        // Spilled: both lines start past the bar's right edge (148px wide) at one x.
        expect(titles[0].x).toBeGreaterThan(bar.x + 148);
        expect(titles[1].x).toBe(titles[0].x);
        const meta = textNodes(fragment).filter((t) => t.fontSize === 11);
        expect(meta).toHaveLength(1);
        expect(meta[0].x).toBe(titles[0].x);
        expect(meta[0].y).toBe(bar.y + 54);
        expect(bar.height).toBe(72);
        expectNoRawNewlineInText(svg);
    });

    it('paints an explicit break in a bar that would fit the unbroken title on one line', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item plan "Plan\\nrollout" duration:4w\n`,
        );
        const svg = await renderSvg(model);
        const titles = textNodes(itemFragment(svg, 'plan')).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['Plan', 'rollout']);
        expectNoRawNewlineInText(svg);
    });

    it('paints a blank interior line as a baseline gap, not an empty <text>', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item gap "A\\n\\nB" duration:3w\n`,
        );
        const svg = await renderSvg(model);
        const fragment = itemFragment(svg, 'gap');
        const bar = barRect(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['A', 'B']);
        // Line 3 keeps its slot: baseline 20 + 2 * 16.
        expect(titles.map((t) => t.y)).toEqual([bar.y + 20, bar.y + 52]);
        expect(fragment).not.toContain('></text>');
    });

    it('paints the literal characters of "\\\\n" as one <text>, not as a break', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item lit "Plan A\\\\nB" duration:3w\n`,
        );
        const svg = await renderSvg(model);
        const titles = textNodes(itemFragment(svg, 'lit')).filter((t) => t.fontSize === 13);
        // The backslash and the n are in the output as two characters.
        expect(titles.map((t) => t.content)).toEqual(['Plan A\\nB']);
        expectNoRawNewlineInText(svg);
    });

    it('never paints a title that contains a newline as one raw <text>', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item a "One\\nTwo" duration:2w\n  item b "Wide title here\\nsecond" duration:1w\n`,
        );
        const svg = await renderSvg(model);
        expectNoRawNewlineInText(svg);
    });
});

describe('renderSvg — caption indent past an `after:` date glyph', () => {
    // `scale:2w`: a `2w` item is a 148px bar. The `after:DATE` glyph is 12px
    // wide in the bar's upper-left: bar.x + 6..18 alone, bar.x + 24..36 beside
    // a link tile (which spans bar.x + 6..20). The caption starts 4px past it.
    const HEADER = `nowline v1\n\nroadmap r1 "R" start:2026-04-06 scale:2w\n\n`;
    const LINK = 'link:https://github.com/acme/team/issues/1';

    interface TextNode {
        x: number;
        y: number;
        fontSize: number;
        content: string;
    }

    /** The item's `<g>`, closed at its OWN `</g>`: the glyph nests a `<g>` inside it. */
    function itemFragment(svg: string, itemId: string): string {
        const open = `<g data-id="${itemId}" data-layer="item">`;
        const start = svg.indexOf(open);
        if (start < 0) throw new Error(`no item group for ${itemId}`);
        let depth = 0;
        for (const m of svg.slice(start).matchAll(/<g\b|<\/g>/g)) {
            depth += m[0] === '</g>' ? -1 : 1;
            if (depth === 0) return svg.slice(start, start + (m.index ?? 0) + m[0].length);
        }
        throw new Error(`unbalanced item group for ${itemId}`);
    }

    function textNodes(fragment: string): TextNode[] {
        const out: TextNode[] = [];
        for (const m of fragment.matchAll(/<text ([^>]*)>([^<]*)(?:<tspan[\s\S]*?)?<\/text>/g)) {
            const attr = (name: string) =>
                Number(m[1].match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1]);
            out.push({
                x: attr('x'),
                y: attr('y'),
                fontSize: attr('font-size'),
                content: m[2],
            });
        }
        return out;
    }

    function barX(fragment: string): number {
        const m = fragment.match(/<rect [^>]*>/);
        if (!m) throw new Error('no bar rect');
        return Number(m[0].match(/ x="([^"]+)"/)?.[1]);
    }

    /** x of the `after:` glyph's nested `<svg>`, or undefined when none is painted. */
    function afterGlyphX(fragment: string): number | undefined {
        const m = fragment.match(/<g [^>]*data-side="after"[^>]*>[\s\S]*?<svg x="([^"]+)"/);
        return m ? Number(m[1]) : undefined;
    }

    it('starts the caption 4px past the glyph: bar.x + 22 without a link icon', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item plan "Plan" duration:2w after:2026-04-20\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'plan');
        const bar = barX(fragment);
        const glyph = afterGlyphX(fragment);
        expect(glyph).toBe(bar + 6);
        const texts = textNodes(fragment);
        const titles = texts.filter((t) => t.fontSize === 13);
        expect(titles).toHaveLength(1);
        expect(titles[0].x).toBe(bar + 22);
        // Clears the glyph's right edge (bar + 18) by the 4px gap.
        expect(titles[0].x).toBeGreaterThanOrEqual((glyph ?? 0) + 12 + 4);
        // The meta line shares the caption's left edge.
        const meta = texts.filter((t) => t.fontSize === 11);
        expect(meta.map((t) => t.content)).toEqual(['2w']);
        expect(meta[0].x).toBe(titles[0].x);
    });

    it('starts the caption at bar.x + 40 when the glyph sits beside a link tile', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item plan "Plan" duration:2w ${LINK} after:2026-04-20\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'plan');
        const bar = barX(fragment);
        const tile = fragment.match(/<a [^>]*><rect [^>]*>/)?.[0];
        expect(tile).toBeDefined();
        const tileRight =
            Number(tile?.match(/ x="([^"]+)"/)?.[1]) + Number(tile?.match(/ width="([^"]+)"/)?.[1]);
        expect(tileRight).toBe(bar + 20);
        const glyph = afterGlyphX(fragment);
        expect(glyph).toBe(bar + 24);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles).toHaveLength(1);
        expect(titles[0].x).toBe(bar + 40);
        expect(titles[0].x).toBeGreaterThanOrEqual((glyph ?? 0) + 12 + 4);
    });

    it('indents every line of a wrapped caption and the meta line, keeping the left edge straight', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item ship "Ship the thing" duration:2w after:2026-04-20\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'ship');
        const bar = barX(fragment);
        const texts = textNodes(fragment);
        const titles = texts.filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['Ship the', 'thing']);
        expect(titles.map((t) => t.x)).toEqual([bar + 22, bar + 22]);
        const meta = texts.filter((t) => t.fontSize === 11);
        expect(meta[0].x).toBe(bar + 22);
    });

    it('indents an explicit multi-line title on every line', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item two "One\\nTwo" duration:2w after:2026-04-20\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'two');
        const bar = barX(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles.map((t) => t.content)).toEqual(['One', 'Two']);
        expect(titles.map((t) => t.x)).toEqual([bar + 22, bar + 22]);
    });

    it('keeps the glyph-cleared indent under noLinks, where layout still placed the glyph beside the tile', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item plan "Plan" duration:2w ${LINK} after:2026-04-20\n`,
        );
        const fragment = itemFragment(await renderSvg(model, { noLinks: true }), 'plan');
        expect(fragment).not.toContain('<a ');
        const bar = barX(fragment);
        // Layout positioned the glyph at bar.x + 24 (past the link tile that
        // noLinks hides), so the caption must still clear it at bar.x + 40.
        expect(afterGlyphX(fragment)).toBe(bar + 24);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles[0].x).toBe(bar + 40);
    });

    it('leaves a `before:`-only item at the plain 12px inset', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item plan "Plan" duration:2w before:2026-06-29\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'plan');
        const bar = barX(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        expect(titles[0].x).toBe(bar + 12);
    });

    it('does not indent a caption that spilled beside the bar', async () => {
        const model = await parseToModel(
            `${HEADER}swimlane s "S"\n  item big "Internationalization" duration:2w after:2026-04-20\n`,
        );
        const fragment = itemFragment(await renderSvg(model), 'big');
        const bar = barX(fragment);
        const titles = textNodes(fragment).filter((t) => t.fontSize === 13);
        // Spilled: starts past the bar's right edge (148px wide) plus the 6px gap.
        expect(titles[0].x).toBe(bar + 148 + 6);
    });
});

// --- Waves (specs/waves.md §9) ---

const WAVE_SAMPLE = readFileSync(
    fileURLToPath(
        new URL('../../../specs/waves/samples/checkout-relaunch.nowline', import.meta.url),
    ),
    'utf-8',
);

// specs/waves.md §11 Example 1: no background work, every label fits.
const WAVE_PLAIN_SRC = `nowline v1

roadmap launch-plan "Launch plan" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"
wave launch "Launch"

swimlane web "Web"
  item web-research "UX research" duration:2w wave:discover
  item web-build "Checkout v2" duration:3w wave:build
  item web-launch "Launch page" duration:1w wave:launch
swimlane api "API"
  item api-spike "API spike" duration:1w wave:discover
  item api-build "Payments API" duration:4w wave:build
  item api-launch "Rate limits" duration:1w wave:launch
swimlane data "Data"
  item data-audit "Data audit" duration:3w wave:discover
  item data-build "Pipeline" duration:2w wave:build
  item data-launch "Dashboards" duration:2w wave:launch
`;

// Example 12: an empty middle wave.
const EXAMPLE_12_SRC = `nowline v1

roadmap placeholder "Placeholder" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Hardening (TBD)"
wave w3 "Wave 3"

swimlane a
  item a1 duration:2w wave:w1
  item a3 duration:1w wave:w3
swimlane b
  item b1 duration:1w wave:w1
  item b3 duration:2w wave:w3
`;

// Example 11 with the floor anchor two weeks later, so the gap fits its
// label; the dated milestone is still overrun by the wave.
const WAVE_GAP_SRC = `nowline v1

roadmap budget-floor "Budget-held rollout" start:2026-01-05 scale:1w calendar:full

anchor fy-budget "FY budget release" date:2026-02-16

wave plan "Plan"
wave execute "Execute" after:fy-budget

swimlane a
  item a1 duration:2w wave:plan
  item a2 duration:5w wave:execute
swimlane b
  item b1 duration:3w wave:plan
  item b2 duration:7w wave:execute

milestone exec-done "Execute complete" date:2026-03-16 after:execute
`;

// Narrowing spans at scale:1m walk the strip label fit chain.
const WAVE_FIT_SRC = `nowline v1

roadmap fit "Fit" start:2026-01-05 scale:1m

wave discovery "Discovery"
wave implementation "Implementation and build-out"
wave hardening "Hardening and stabilisation"
wave rollout-everywhere "Rollout everywhere"
wave launch-day "Launch day"

swimlane a
  item a1 duration:8w wave:discovery
  item a2 duration:4w wave:implementation
  item a3 duration:6w wave:hardening
  item a4 duration:8d wave:rollout-everywhere
  item a5 duration:3d wave:launch-day
`;

// Example 19: an isolated region taking part in the barrier.
const WAVE_REGION_FILES = {
    'ios.nowline': `nowline v1

roadmap ios-app "iOS" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane ios
  item ios-offline duration:4w wave:w1
  item ios-push duration:1w wave:w2
`,
    'portfolio.nowline': `nowline v1

include "./ios.nowline" roadmap:isolate

roadmap portfolio "Portfolio" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane platform
  item pf-api duration:2w wave:w1
  item pf-scale duration:2w wave:w2
`,
};

/** Every balanced `<g …>…</g>` whose open tag matches `open`. */
function groupsMatching(svg: string, open: RegExp): string[] {
    const out: string[] = [];
    const re = new RegExp(open.source, 'g');
    for (const m of svg.matchAll(re)) {
        const start = m.index ?? 0;
        let depth = 0;
        for (const t of svg.slice(start).matchAll(/<g\b|<\/g>/g)) {
            depth += t[0] === '</g>' ? -1 : 1;
            if (depth === 0) {
                out.push(svg.slice(start, start + (t.index ?? 0) + t[0].length));
                break;
            }
        }
    }
    return out;
}

/** The first `<g data-layer="name">`, balanced, or undefined. */
function waveLayer(svg: string, name: string): string | undefined {
    return groupsMatching(svg, new RegExp(`<g data-layer="${name}">`))[0];
}

function itemGroup(svg: string, id: string): string {
    const g = groupsMatching(svg, new RegExp(`<g data-id="${id}" data-layer="item">`))[0];
    expect(g).toBeDefined();
    return g ?? '';
}

function attrOf(el: string, name: string): string | undefined {
    return el.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function rectsOf(fragment: string): string[] {
    return [...fragment.matchAll(/<rect [^>]*>/g)].map((m) => m[0]);
}

/** A strip cell's fill shapes: square `<rect>`s or end-rounded `<path>`s. */
function cellShapesOf(fragment: string): string[] {
    return [...fragment.matchAll(/<(?:rect|path) [^>]*>/g)].map((m) => m[0]);
}

/** The horizontal extent of a cell `<rect>` or end-rounded `<path>`. */
function shapeXRange(shape: string): [number, number] {
    if (shape.startsWith('<rect')) {
        const x = Number(attrOf(shape, 'x'));
        return [x, x + Number(attrOf(shape, 'width'))];
    }
    const d = attrOf(shape, 'd') ?? '';
    const xs = [
        ...[...d.matchAll(/[MH](-?[\d.]+)/g)].map((m) => Number(m[1])),
        ...[...d.matchAll(/A[\d.]+ [\d.]+ 0 0 1 (-?[\d.]+)/g)].map((m) => Number(m[1])),
    ];
    return [Math.min(...xs), Math.max(...xs)];
}

function linesOf(fragment: string): string[] {
    return [...fragment.matchAll(/<line [^>]*>/g)].map((m) => m[0]);
}

const n2 = (v: number): string => String(Math.round(v * 100) / 100);

describe('renderSvg — waves', () => {
    it('emits the wave layers in z-order for the checkout sample (§9.9)', async () => {
        const svg = await renderSvg(await parseToModel(WAVE_SAMPLE));
        const order = [
            '<defs>',
            'data-layer="timeline"',
            'data-layer="wave-strip"',
            'data-layer="swimlane-bg"',
            'data-layer="grid"',
            'data-layer="wave-boundary"',
            'data-layer="wave-labels"',
            'data-layer="swimlane"',
            'data-layer="wave-cross"',
            'data-layer="milestone"',
            'data-layer="wave-legend"',
            'data-layer="attribution"',
        ].map((needle) => svg.indexOf(needle));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        // No styled wave: no tint layer.
        expect(svg).not.toContain('data-layer="wave-bg"');
    });

    it('a roadmap without waves has no wave layers and the unchanged <defs>', async () => {
        const svg = await renderSvg(await parseToModel(BASIC_DSL));
        expect(svg).not.toContain('wave');
        const defs = svg.match(/<defs>.*?<\/defs>/)?.[0] ?? '';
        expect(defs).not.toContain('<pattern');
        expect(defs.match(/<filter /g)).toHaveLength(3);
        expect(defs.match(/<marker /g)).toHaveLength(3);
    });

    it('strip cells alternate by visible ordinal; an empty wave does not break it', async () => {
        const model = await parseToModel(EXAMPLE_12_SRC);
        const svg = await renderSvg(model);
        const strip = waveLayer(svg, 'wave-strip') ?? '';
        const [panel] = rectsOf(strip);
        expect(attrOf(panel, 'fill')).toBe(lightTheme.timeline.panelFill);
        expect(attrOf(panel, 'height')).toBe('20');
        const cell = (id: string) =>
            groupsMatching(strip, new RegExp(`<g data-id="${id}">`))[0] ?? '';
        expect(attrOf(cellShapesOf(cell('w1'))[0], 'fill')).toBe(lightTheme.wave.stripFill);
        expect(cell('w2')).toBe('');
        expect(attrOf(cellShapesOf(cell('w3'))[0], 'fill')).toBe(lightTheme.wave.stripFillAlt);
        // Every cell carries its tooltip.
        const w1 = model.waves?.[0];
        expect(cell('w1')).toContain(`<title>${w1?.strip.tooltip}</title>`);
    });

    it('paints the label fit chain (title, ellipsis, id, #k, none) at scale:1m', async () => {
        const model = await parseToModel(WAVE_FIT_SRC);
        const svg = await renderSvg(model);
        const labels = waveLayer(svg, 'wave-labels') ?? '';
        const texts = [...labels.matchAll(/<text [^>]*font-weight="600"[^>]*>([^<]*)<\/text>/g)];
        expect(model.waves?.map((w) => w.strip.labelKind)).toEqual([
            'title',
            'ellipsis',
            'id',
            'ordinal',
            'none',
        ]);
        expect(texts.map((m) => m[1])).toEqual(['Discovery', 'Implemen…', 'hardening', '#4']);
        // Each label sits on a halo in its cell's fill, under the text.
        const halo = rectsOf(labels)[0];
        expect(attrOf(halo, 'fill')).toBe(lightTheme.wave.stripFill);
        expect(labels.indexOf(halo)).toBeLessThan(labels.indexOf('>Discovery<'));
    });

    it('draws an empty wave as a hollow diamond with its tooltip', async () => {
        const model = await parseToModel(EXAMPLE_12_SRC);
        const labels = waveLayer(await renderSvg(model), 'wave-labels') ?? '';
        const marker = model.waves?.[1].strip.marker;
        expect(marker).toBeDefined();
        const diamond = labels.match(/<path [^>]*>.*?<\/path>/)?.[0] ?? '';
        expect(attrOf(diamond, 'stroke')).toBe(lightTheme.wave.boundary);
        expect(attrOf(diamond, 'd')).toMatch(new RegExp(`^M${n2(marker?.x ?? 0)} `));
        expect(diamond).toContain('no items</title>');
    });

    it('shows only the placeholder when every wave is empty', async () => {
        const svg = await renderSvg(
            await parseToModel(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"

swimlane a
  item a1 duration:2w
`),
        );
        const labels = waveLayer(svg, 'wave-labels') ?? '';
        expect(labels).toContain('>Waves declared: Discover, Build — no items assigned yet</text>');
        expect(labels).toContain(`fill="${lightTheme.wave.labelMuted}"`);
        // On a halo in the backing panel's fill, so grid lines never cut it.
        const [halo] = rectsOf(labels);
        expect(attrOf(halo, 'fill')).toBe(lightTheme.timeline.panelFill);
        expect(labels.indexOf(halo)).toBeLessThan(labels.indexOf('>Waves declared'));
        const haloX = Number(attrOf(halo, 'x'));
        const haloW = Number(attrOf(halo, 'width'));
        const textX = Number(attrOf(labels.match(/<text [^>]*>/)?.[0] ?? '', 'x'));
        expect(haloX + haloW / 2).toBeCloseTo(textX, 1);
        expect(haloW).toBeGreaterThan(200);
        expect(svg.indexOf('data-layer="wave-labels"')).toBeGreaterThan(
            svg.indexOf('data-layer="grid"'),
        );
        expect(labels).not.toContain('<path');
        expect(rectsOf(waveLayer(svg, 'wave-strip') ?? '')).toHaveLength(1);
        expect(svg).not.toContain('data-layer="wave-boundary"');
        expect(svg).not.toContain('data-layer="wave-cross"');
    });

    it('labels a start-floor gap with its floor reference in muted italics', async () => {
        const model = await parseToModel(WAVE_GAP_SRC);
        const gap = model.waves?.[1].strip.gapLabel;
        expect(gap?.text).toBe('fy-budget');
        const labels = waveLayer(await renderSvg(model), 'wave-labels') ?? '';
        const text = labels.match(/<text [^>]*>fy-budget<\/text>/)?.[0] ?? '';
        expect(attrOf(text, 'font-style')).toBe('italic');
        expect(attrOf(text, 'fill')).toBe(lightTheme.wave.labelMuted);
        expect(attrOf(text, 'x')).toBe(n2(gap?.x ?? 0));
        // No strip cell covers the gap.
        const strip = waveLayer(await renderSvg(model), 'wave-strip') ?? '';
        const shapes = cellShapesOf(strip).slice(1);
        expect(shapes.length).toBeGreaterThan(0);
        for (const shape of shapes) {
            const [x1, x2] = shapeXRange(shape);
            expect(x1 < (gap?.x ?? 0) && (gap?.x ?? 0) < x2).toBe(false);
        }
        // The floor label sits on a halo in the backing panel's fill.
        const before = labels.slice(0, labels.indexOf(text));
        const halo = rectsOf(before).at(-1) ?? '';
        expect(attrOf(halo, 'fill')).toBe(lightTheme.timeline.panelFill);
        expect(Number(attrOf(halo, 'x')) + Number(attrOf(halo, 'width')) / 2).toBeCloseTo(
            gap?.x ?? 0,
            2,
        );
    });

    it('a styled wave with a dark bg tints its column and its strip cell', async () => {
        const model = await parseToModel(`nowline v1

config

style night
  bg: #1e3a8a

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two" style:night

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:2w wave:w2
`);
        const svg = await renderSvg(model);
        const w2 = model.waves?.[1];
        const tint = waveLayer(svg, 'wave-bg') ?? '';
        const [rect] = rectsOf(tint);
        expect(rectsOf(tint)).toHaveLength(1);
        expect(attrOf(rect, 'fill')).toBe('#1e3a8a');
        expect(attrOf(rect, 'fill-opacity')).toBe('0.12');
        expect(attrOf(rect, 'x')).toBe(n2(w2?.columnBox.x ?? 0));
        expect(attrOf(rect, 'height')).toBe(n2(w2?.columnBox.height ?? 0));
        // After the lane rows, before the grid.
        expect(svg.indexOf('data-layer="wave-bg"')).toBeGreaterThan(
            svg.lastIndexOf('data-layer="swimlane-bg"'),
        );
        expect(svg.indexOf('data-layer="wave-bg"')).toBeLessThan(svg.indexOf('data-layer="grid"'));
        const cell = groupsMatching(waveLayer(svg, 'wave-strip') ?? '', /<g data-id="w2">/)[0];
        const overlay = cellShapesOf(cell ?? '')[1];
        expect(attrOf(overlay, 'fill')).toBe('#1e3a8a');
        expect(attrOf(overlay, 'fill-opacity')).toBe('0.25');
        expect(waveLayer(svg, 'wave-labels')).toContain(`fill="${w2?.style.text}"`);
    });

    it('boundary lines span the strip top to the last lane, 2 px', async () => {
        const model = await parseToModel(WAVE_SAMPLE);
        const lines = linesOf(waveLayer(await renderSvg(model), 'wave-boundary') ?? '');
        const lastLane = model.swimlanes[model.swimlanes.length - 1].box;
        expect(lines).toHaveLength(model.waveBoundaries?.length ?? -1);
        for (const l of lines) {
            expect(attrOf(l, 'y1')).toBe(n2(model.timeline.waveStrip?.y ?? -1));
            expect(attrOf(l, 'y2')).toBe(n2(lastLane.y + lastLane.height));
            expect(attrOf(l, 'stroke-width')).toBe('2');
            expect(attrOf(l, 'stroke')).toBe(lightTheme.wave.boundary);
            expect(attrOf(l, 'stroke-dasharray')).toBeUndefined();
        }
    });

    it('a milestone on a boundary has no cut line; an overrun dated one keeps it', async () => {
        const sample = await parseToModel(WAVE_SAMPLE);
        expect(sample.milestones.every((m) => m.onWaveBoundary)).toBe(true);
        const cutLines = (svg: string) =>
            linesOf(svg).filter((l) => attrOf(l, 'stroke-dasharray') === '6 4');
        expect(cutLines(await renderSvg(sample))).toEqual([]);

        const overrun = await parseToModel(WAVE_GAP_SRC);
        const [m] = overrun.milestones;
        expect(m.isOverrun).toBe(true);
        expect(m.onWaveBoundary).toBeUndefined();
        const lines = cutLines(await renderSvg(overrun));
        expect(lines).toHaveLength(1);
        expect(attrOf(lines[0], 'stroke')).toBe(lightTheme.milestoneDiamond.cutLineOverrun);
        expect(attrOf(lines[0], 'x1')).toBe(n2(m.center.x));
    });

    it('hatches only background bars, after the bar rect, with a tooltip', async () => {
        const svg = await renderSvg(await parseToModel(WAVE_SAMPLE));
        const oncall = itemGroup(svg, 'on-call');
        expect(
            oncall.startsWith(
                '<g data-id="on-call" data-layer="item"><title>Background (no wave)</title>',
            ),
        ).toBe(true);
        const [bar, hatch] = rectsOf(oncall);
        expect(attrOf(bar, 'filter')).toBeDefined();
        expect(attrOf(hatch, 'fill')).toBe('url(#nl-0-root-wave-hatch-dark)');
        // Inset by half the 1 px stroke, same corner radius.
        expect(Number(attrOf(hatch, 'x'))).toBeCloseTo(Number(attrOf(bar, 'x')) + 0.5, 5);
        expect(Number(attrOf(hatch, 'width'))).toBeCloseTo(Number(attrOf(bar, 'width')) - 1, 5);
        expect(attrOf(hatch, 'rx')).toBe(attrOf(bar, 'rx'));
        // Members keep today's look.
        const auth = itemGroup(svg, 'auth');
        expect(auth).not.toContain('wave-hatch');
        expect(auth).not.toContain('<title>');
        expect(svg).toContain('<pattern height="6" id="nl-0-root-wave-hatch-dark"');
        expect(svg).not.toContain('wave-hatch-light');
    });

    it('picks the hatch by bar fill luminance; ids carry the SVG prefix', async () => {
        const model = await parseToModel(`nowline v1

config

style night
  bg: #0f172a

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"

swimlane a
  item a1 duration:2w wave:w1
  item pale duration:2w
  item dark duration:2w style:night
`);
        const svg = await renderSvg(model, { idPrefix: 'emb' });
        expect(rectsOf(itemGroup(svg, 'pale'))[1]).toContain(
            'fill="url(#emb-0-root-wave-hatch-dark)"',
        );
        expect(rectsOf(itemGroup(svg, 'dark'))[1]).toContain(
            'fill="url(#emb-0-root-wave-hatch-light)"',
        );
        const defs = svg.match(/<defs>.*?<\/defs>/)?.[0] ?? '';
        const dark = defs.match(
            /<pattern [^>]*id="emb-0-root-wave-hatch-dark"[^>]*>.*?<\/pattern>/,
        )?.[0];
        const light = defs.match(
            /<pattern [^>]*id="emb-0-root-wave-hatch-light"[^>]*>.*?<\/pattern>/,
        )?.[0];
        expect(dark).toContain(`stroke="${lightTheme.wave.hatch}"`);
        expect(light).toContain(`stroke="${lightTheme.wave.hatchOnDark}"`);
        expect(dark).toContain('patternTransform="rotate(45)"');
        // `opacity`, not `stroke-opacity`: svg-to-pdfkit only honours the
        // former inside a pattern cell (see export-pdf's waves test).
        expect(dark).toContain('opacity="0.13"');
        expect(dark).not.toContain('stroke-opacity');
        expect(svg).not.toContain('nl-0-root-wave-hatch');
    });

    it('emits no hatch pattern when there is no background work', async () => {
        const svg = await renderSvg(await parseToModel(EXAMPLE_12_SRC));
        expect(svg).not.toContain('<pattern');
        expect(svg).not.toContain('wave-hatch');
    });

    it('draws crossings over background bars, 1 px dashed in the boundary colour', async () => {
        const model = await parseToModel(WAVE_SAMPLE);
        const lines = linesOf(waveLayer(await renderSvg(model), 'wave-cross') ?? '');
        expect(lines).toHaveLength(model.waveCrossings?.length ?? -1);
        expect(lines.length).toBeGreaterThan(0);
        for (const [i, l] of lines.entries()) {
            const c = model.waveCrossings?.[i];
            expect(attrOf(l, 'x1')).toBe(n2(c?.x ?? 0));
            expect(attrOf(l, 'y1')).toBe(n2(c?.topY ?? 0));
            expect(attrOf(l, 'stroke-dasharray')).toBe('2 2');
            expect(attrOf(l, 'stroke-width')).toBe('1');
            expect(attrOf(l, 'stroke')).toBe(lightTheme.wave.boundary);
        }
    });

    it('renders the legend swatches and text, and none without a trigger', async () => {
        const svg = await renderSvg(await parseToModel(WAVE_SAMPLE));
        const legend = waveLayer(svg, 'wave-legend') ?? '';
        expect(legend).toContain('>Background work (not in a wave)</text>');
        expect(legend).toContain('>Wave boundary</text>');
        expect(rectsOf(legend)[1]).toContain('fill="url(#nl-0-root-wave-hatch-dark)"');
        const [swatch] = linesOf(legend);
        expect(attrOf(swatch, 'stroke')).toBe(lightTheme.wave.boundary);
        expect(svg.indexOf('data-layer="wave-legend"')).toBeGreaterThan(
            svg.indexOf('data-layer="footnotes"'),
        );

        const fit = waveLayer(await renderSvg(await parseToModel(WAVE_FIT_SRC)), 'wave-legend');
        // The wave-name list wraps between waves, one <text> per run.
        expect(fit).toContain('>Waves: #1 Discovery</text>');
        expect(fit).toContain('>#4 Rollout everywhere · #5 Launch day</text>');

        const plain = await renderSvg(await parseToModel(WAVE_PLAIN_SRC));
        expect(plain).not.toContain('wave-legend');
    });

    it('drops the bracket only for an untitled, unstyled `group wave:x`', async () => {
        const bracketOf = (svg: string): string[] =>
            groupsMatching(svg, /<g (?:data-id="[^"]*" )?data-layer="group">/).map((g) => {
                const own = g.slice(0, g.indexOf('<g', 1));
                return own.match(/<path [^>]*fill="none"[^>]*>/)?.[0] ?? '';
            });
        const groupSrc = (header: string, waves: boolean) => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w
${waves ? '\nwave w1 "One"\nwave w2 "Two"\n' : ''}
swimlane a
  item a1 duration:2w${waves ? ' wave:w1' : ''}
  ${header}
    item a2 duration:2w
`;
        const waveOnly = await renderSvg(await parseToModel(groupSrc('group wave:w2', true)));
        expect(bracketOf(waveOnly)).toEqual(['']);
        const titled = await renderSvg(
            await parseToModel(groupSrc('group g1 "Build" wave:w2', true)),
        );
        expect(bracketOf(titled)[0]).toContain('stroke=');
        const plain = await renderSvg(await parseToModel(groupSrc('group', false)));
        expect(bracketOf(plain)[0]).toContain('stroke=');
    });

    it('re-emits boundaries and crossings inside an isolated region, clipped to it', async () => {
        const model = await parseFilesToModel(
            {
                'ios.nowline': `${WAVE_REGION_FILES['ios.nowline']}swimlane ios-ops\n  item ios-oncall duration:6w\n`,
                'portfolio.nowline': WAVE_REGION_FILES['portfolio.nowline']
                    .replace(
                        'roadmap portfolio',
                        'config\n\nstyle night\n  bg: #1e3a8a\n\nroadmap portfolio',
                    )
                    .replace('wave w2 "Wave 2"', 'wave w2 "Wave 2" style:night'),
            },
            'portfolio.nowline',
        );
        const svg = await renderSvg(model);
        const region = groupsMatching(svg, /<g data-layer="include">/)[0] ?? '';
        const r = model.includes[0].box;
        const [left, right, top, bottom] = [r.x + 8, r.x + r.width - 8, r.y, r.y + r.height];
        const boundaries = linesOf(waveLayer(region, 'wave-boundary') ?? '');
        expect(boundaries.length).toBeGreaterThan(0);
        for (const l of boundaries) {
            const x = Number(attrOf(l, 'x1'));
            expect(x).toBeGreaterThan(left);
            expect(x).toBeLessThan(right);
            expect(attrOf(l, 'y1')).toBe(n2(top));
            expect(attrOf(l, 'y2')).toBe(n2(bottom));
        }
        expect(region).not.toContain('clipPath');
        // Region rect, then the boundaries, then its lanes, then crossings.
        const at = (needle: string) => region.indexOf(needle);
        expect(at('data-layer="wave-boundary"')).toBeGreaterThan(at('<rect'));
        expect(at('data-layer="wave-boundary"')).toBeLessThan(at('data-layer="swimlane"'));
        expect(at('data-layer="wave-cross"')).toBeGreaterThan(
            region.lastIndexOf('data-layer="item"'),
        );
        expect(linesOf(waveLayer(region, 'wave-cross') ?? '')).toHaveLength(
            model.includes[0].waveCrossings?.length ?? -1,
        );
        expect(itemGroup(region, 'ios-oncall')).toContain('wave-hatch-dark');
        // The styled wave's column tint, re-emitted inside the region and
        // clipped to its painted rect, under its boundaries.
        const tints = rectsOf(waveLayer(region, 'wave-bg') ?? '');
        expect(tints).toHaveLength(1);
        const [tint] = tints;
        const w2 = model.waves?.[1];
        expect(attrOf(tint, 'fill')).toBe('#1e3a8a');
        const tx = Number(attrOf(tint, 'x'));
        const ty = Number(attrOf(tint, 'y'));
        const tw = Number(attrOf(tint, 'width'));
        const th = Number(attrOf(tint, 'height'));
        expect(tx).toBeCloseTo(Math.max(w2?.columnBox.x ?? 0, left), 2);
        expect(tx).toBeGreaterThanOrEqual(left - 0.01);
        expect(tx + tw).toBeLessThanOrEqual(right + 0.01);
        expect(ty).toBeGreaterThanOrEqual(top - 0.01);
        expect(ty + th).toBeLessThanOrEqual(bottom + 0.01);
        expect(at('data-layer="wave-bg"')).toBeGreaterThan(at('<rect'));
        expect(at('data-layer="wave-bg"')).toBeLessThan(at('data-layer="wave-boundary"'));
    });

    it('moves the marker-row panel below the strip only with waves', async () => {
        const src = (waves: boolean) => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w
${waves ? '\nwave w1 "One"\n' : ''}
anchor kickoff date:2026-01-12

swimlane a
  item a1 duration:2w${waves ? ' wave:w1' : ''}
`;
        const panelYs = async (waves: boolean) => {
            const model = await parseToModel(src(waves));
            const timeline = waveLayer(await renderSvg(model), 'timeline') ?? '';
            return { model, ys: rectsOf(timeline).map((r) => attrOf(r, 'y')) };
        };
        const plain = await panelYs(false);
        const t0 = plain.model.timeline;
        expect(plain.ys).toEqual([n2(t0.tickPanelY), n2(t0.tickPanelY + t0.tickPanelHeight)]);
        const waved = await panelYs(true);
        const t1 = waved.model.timeline;
        const strip = t1.waveStrip;
        expect(strip?.y).toBe(t1.tickPanelY + t1.tickPanelHeight);
        expect(waved.ys).toEqual([n2(t1.tickPanelY), n2((strip?.y ?? 0) + (strip?.height ?? 0))]);
    });

    it('rounds the outer corners of a cell where it meets the backing panel ends', async () => {
        const model = await parseToModel(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w length:6w

wave w1 "One"
wave w2 "Two"
wave w3 "Three"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:2w wave:w2
  item a3 duration:4w wave:w3
`);
        const t = model.timeline;
        const strip = waveLayer(await renderSvg(model), 'wave-strip') ?? '';
        const [panel] = rectsOf(strip);
        expect(attrOf(panel, 'rx')).toBe('4');
        const cell = (id: string) =>
            cellShapesOf(groupsMatching(strip, new RegExp(`<g data-id="${id}">`))[0] ?? '')[0];
        const r = '3.5'; // the panel's radius less the 0.5 px inset
        const arc = `A${r} ${r} 0 0 1`;
        const [panelLeft, panelRight] = [t.box.x + 0.5, t.box.x + t.box.width - 0.5];
        // First cell: rounded on the left only, flush with the panel's inset.
        const first = cell('w1');
        expect(first.startsWith('<path')).toBe(true);
        expect(shapeXRange(first)[0]).toBeCloseTo(panelLeft, 5);
        const firstD = attrOf(first, 'd') ?? '';
        expect(firstD.split(arc)).toHaveLength(3);
        expect(firstD).toContain(`${arc} ${n2(panelLeft)} `);
        // Middle cell: a square rect, nowhere near the panel's ends.
        const middle = cell('w2');
        expect(middle.startsWith('<rect')).toBe(true);
        expect(attrOf(middle, 'rx')).toBeUndefined();
        // Last cell, clipped at the panel's right end: rounded on the right only.
        const last = cell('w3');
        expect(last.startsWith('<path')).toBe(true);
        expect(shapeXRange(last)[1]).toBeCloseTo(panelRight, 5);
        const lastD = attrOf(last, 'd') ?? '';
        expect(lastD.split(arc)).toHaveLength(3);
        expect(lastD).toContain(`${arc} ${n2(panelRight)} `);
        expect(lastD).not.toContain(`${arc} ${n2(shapeXRange(last)[0])} `);
    });

    it('right-aligns footnote superscripts in the cell on their own halo', async () => {
        const model = await parseToModel(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "Discover"
wave w2 "Build"

swimlane a
  item a1 duration:3w wave:w1
  item a2 duration:2w wave:w2

footnote a-risk "Risk" on:w2
footnote b-vendor "Vendor" on:[w1, a1]
`);
        const svg = await renderSvg(model);
        const labels = waveLayer(svg, 'wave-labels') ?? '';
        const strip = waveLayer(svg, 'wave-strip') ?? '';
        const texts = [...labels.matchAll(/<text [^>]*>[^<]*<\/text>/g)].map((m) => m[0]);
        for (const [i, w] of (model.waves ?? []).entries()) {
            expect(w.strip.footnotesShown).toBe(true);
            const cellShape = cellShapesOf(
                groupsMatching(strip, new RegExp(`<g data-id="${w.id}">`))[0] ?? '',
            )[0];
            const cellRight = shapeXRange(cellShape)[1];
            const sup = texts.find((t) => t.endsWith(`>${w.footnoteIndicators[0]}</text>`)) ?? '';
            expect(attrOf(sup, 'font-size')).toBe('8');
            expect(attrOf(sup, 'text-anchor')).toBe('end');
            const supRight = cellRight - WAVE_STRIP_LABEL_PAD_PX;
            expect(Number(attrOf(sup, 'x'))).toBeCloseTo(supRight, 5);
            // A halo in the cell's fill under the superscript.
            const fill = i === 0 ? lightTheme.wave.stripFill : lightTheme.wave.stripFillAlt;
            const halo = rectsOf(labels).find((r) => {
                const x = Number(attrOf(r, 'x'));
                return x < supRight && supRight < x + Number(attrOf(r, 'width'));
            });
            expect(halo).toBeDefined();
            expect(attrOf(halo ?? '', 'fill')).toBe(fill);
            expect(labels.indexOf(halo ?? '')).toBeLessThan(labels.indexOf(sup));
            // The label is clamped left of the superscripts.
            const label = texts.find((t) => t.endsWith(`>${w.strip.label}</text>`)) ?? '';
            const labelHalo = rectsOf(labels).find(
                (r) =>
                    Math.abs(
                        Number(attrOf(r, 'x')) +
                            Number(attrOf(r, 'width')) / 2 -
                            Number(attrOf(label, 'x')),
                    ) < 0.01,
            );
            const labelRight =
                Number(attrOf(label, 'x')) + (Number(attrOf(labelHalo ?? '', 'width')) - 4) / 2;
            expect(labelRight).toBeLessThanOrEqual(supRight - 8 + 0.01);
        }
        // Superscripts and labels are drawn after the grid.
        expect(svg.indexOf('data-layer="wave-labels"')).toBeGreaterThan(
            svg.indexOf('data-layer="grid"'),
        );
    });

    it('a status-tinted background bar in the dark theme takes the light hatch', async () => {
        const model = await parseToModel(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"

swimlane a
  item a1 duration:2w wave:w1
  item ops duration:2w status:in-progress
`,
            { theme: 'dark' },
        );
        const svg = await renderSvg(model);
        const [bar, hatch] = rectsOf(itemGroup(svg, 'ops'));
        expect(attrOf(bar, 'fill')).not.toBe(darkTheme.status.inProgress);
        expect(attrOf(hatch, 'fill')).toBe('url(#nl-0-root-wave-hatch-light)');
        const light = svg.match(
            /<pattern [^>]*id="nl-0-root-wave-hatch-light"[^>]*>.*?<\/pattern>/,
        )?.[0];
        expect(light).toContain(`stroke="${darkTheme.wave.hatchOnDark}"`);
    });
});
