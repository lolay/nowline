import { describe, expect, it } from 'vitest';
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

describe('renderSvg — arrowhead marker ids', () => {
    // A cross-lane `after:` draws a dependency edge (`marker-end` on the
    // neutral marker); the after-only milestone over two parallels draws a
    // slack arrow (`marker-end` on the dark marker).
    const ARROWS_DSL = `nowline v1

roadmap r "R" start:2026-01-05

swimlane api "API"
  item contract "Contract" duration:2w
swimlane web "Web"
  item ui "UI" duration:1w after:contract
  parallel
    item a "First" duration:1w
  parallel
    item b "Second" duration:3w
  milestone ship "Ship" after:[a, b]
`;

    const markerIds = (svg: string): string[] =>
        [...svg.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
    const markerRefs = (svg: string): string[] =>
        [...svg.matchAll(/marker-end="url\(#([^)]+)\)"/g)].map((m) => m[1]);

    it('scopes marker ids to the per-document idPrefix', async () => {
        // Two SVGs inlined in one HTML page share an id namespace, and
        // `url(#id)` resolves to the first match. Global `nl-arrow` ids
        // let a light diagram's arrowheads paint a dark diagram's edges.
        const light = await parseToModel(ARROWS_DSL, { theme: 'light' });
        const dark = await parseToModel(ARROWS_DSL, { theme: 'dark' });
        expect(light.edges.length).toBeGreaterThan(0);
        expect(light.milestones.some((m) => (m.slackArrows?.length ?? 0) > 0)).toBe(true);

        const svgA = await renderSvg(light, { idPrefix: 'doc-a' });
        const svgB = await renderSvg(dark, { idPrefix: 'doc-b' });
        const idsA = markerIds(svgA);
        const idsB = markerIds(svgB);
        expect(idsA).toHaveLength(3);
        expect(idsB).toHaveLength(3);
        for (const id of [...idsA, ...idsB]) expect(id).not.toMatch(/^nl-arrow/);
        expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);

        // Every edge and slack arrow references a marker in its own document.
        for (const [svg, ids] of [
            [svgA, idsA],
            [svgB, idsB],
        ] as const) {
            const refs = markerRefs(svg);
            expect(refs.length).toBeGreaterThanOrEqual(2);
            for (const ref of refs) expect(ids).toContain(ref);
        }
    });

    it('keeps the default render free of the legacy global marker ids', async () => {
        const svg = await renderSvg(await parseToModel(ARROWS_DSL));
        expect(svg).not.toContain('id="nl-arrow');
        expect(svg).not.toContain('url(#nl-arrow');
    });
});
