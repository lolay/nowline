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
        // metaText + tspan-separated number + tspan-separated literal,
        // all inside the same <text> element so the gap is browser-
        // computed instead of estimated. Order: `2w<tspan>2</tspan><tspan>⚙</tspan>`.
        expect(svg).toMatch(/>2w<tspan dx="[^"]+">2<\/tspan><tspan dx="[^"]+">⚙<\/tspan>/);
    });

    it('renders custom glyph capacity by dereferencing to its unicode payload', async () => {
        // Style ref on the item itself — `capacity-icon` is an entity-level
        // style and doesn't cascade from a parent swimlane to its children.
        const dsl = `nowline v1\n\nconfig\nglyph budget "Budget" unicode:"💰" ascii:"$"\nstyle finance\n  capacity-icon: budget\n\nroadmap r1 "R" start:2026-01-05\n\nswimlane s "Funded"\n  item x "Phase A" duration:2w capacity:12000 style:finance\n`;
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
            new RegExp(
                `<g data-id="${laneId}" data-layer="lane-utilization">[\\s\\S]*?<\\/g>`,
            ),
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
});
