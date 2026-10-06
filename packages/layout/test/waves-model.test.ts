// The wave render model (specs/waves.md §8.7, §8.8, §9.1-§9.5): the header
// strip row, the strip cells (alternation, label fit chain, tooltip, empty
// diamonds, gap labels, placeholder), styled colours, boundary lines,
// crossings over background bars and the legend.

import * as path from 'node:path';
import type { NowlineFile, ResolveResult } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { type LayoutOptions, layoutRoadmap } from '../src/layout.js';
import { MARKER_ROW_CENTER_OFFSET_PX } from '../src/nodes/marker-geometry.js';
import { fitStripLabel, readableLabelText } from '../src/nodes/wave-node.js';
import { contrastRatio } from '../src/themes/contrast.js';
import { darkTheme, grayscaleTheme, lightTheme, resolveColor } from '../src/themes/index.js';
import {
    FOOTNOTE_PANEL_PADDING_PX,
    TIMELINE_TICK_PANEL_HEIGHT_PX,
    WAVE_EMPTY_MARKER_STEP_PX,
    WAVE_LEGEND_GAP_PX,
    WAVE_LEGEND_LINE_PX,
    WAVE_STRIP_HEIGHT_PX,
} from '../src/themes/shared.js';
import type {
    PositionedGroup,
    PositionedItem,
    PositionedRoadmap,
    PositionedTrackChild,
    PositionedWave,
} from '../src/types.js';
import { parseAndResolve } from './helpers.js';
import {
    EXAMPLE_1,
    EXAMPLE_3,
    EXAMPLE_9,
    EXAMPLE_11,
    EXAMPLE_12,
    EXAMPLE_19,
} from './wave-examples.js';

function errorsOf(file: NowlineFile): string[] {
    return (file.$document?.diagnostics ?? [])
        .filter((d) => d.severity === 1)
        .map((d) => d.message);
}

async function lay(source: string, options: LayoutOptions = {}): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(source);
    expect(errorsOf(file)).toEqual([]);
    return layoutRoadmap(file, resolved, options);
}

// Resolves `files[main]` under `/root` with an in-memory file system.
async function layIncludes(
    files: Record<string, string>,
    main: string,
): Promise<PositionedRoadmap> {
    const readFile = async (abs: string): Promise<string> => {
        const rel = path.relative('/root', abs).split(path.sep).join('/');
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
    const { file, resolved }: { file: NowlineFile; resolved: ResolveResult } =
        await parseAndResolve(files[main], path.resolve('/root', main), readFile);
    expect(errorsOf(file)).toEqual([]);
    expect(resolved.diagnostics).toEqual([]);
    return layoutRoadmap(file, resolved);
}

function wavesOf(model: PositionedRoadmap): PositionedWave[] {
    expect(model.waves).toBeDefined();
    return model.waves ?? [];
}

function itemById(model: PositionedRoadmap, id: string): PositionedItem {
    const walk = (children: PositionedTrackChild[]): PositionedItem | undefined => {
        for (const c of children) {
            if (c.kind === 'item') {
                if (c.id === id) return c;
            } else {
                const hit = walk(c.children);
                if (hit) return hit;
            }
        }
        return undefined;
    };
    const lanes = [...model.swimlanes, ...model.includes.flatMap((inc) => inc.nestedSwimlanes)];
    for (const lane of lanes) {
        const hit = walk(lane.children);
        if (hit) return hit;
    }
    throw new Error(`no item ${id}`);
}

const boundaryXs = (model: PositionedRoadmap): number[] =>
    (model.waveBoundaries ?? []).map((b) => b.x);

// --- Header placement (§8.8) ---

const headerSource = (withWaves: boolean, config = ''): string => `nowline v1
${config}
roadmap r "R" start:2026-01-05 scale:1w
${withWaves ? '\nwave w1 "One"\n' : ''}
anchor kickoff date:2026-01-12

swimlane a
  item a1 duration:2w${withWaves ? ' wave:w1' : ''}

milestone m1 date:2026-01-19
`;

describe('wave strip header row (§8.8)', () => {
    const today = new Date('2026-01-14T00:00:00Z');

    it('adds a 20 px strip between the tick panel and the marker rows only with waves', async () => {
        const plain = await lay(headerSource(false), { today });
        const waved = await lay(headerSource(true), { today });
        expect('waveStrip' in plain.timeline).toBe(false);
        expect(plain.timeline.pillRowHeight).toBeGreaterThan(0);

        const t = waved.timeline;
        expect(t.waveStrip).toEqual({
            y: t.tickPanelY + t.tickPanelHeight,
            height: WAVE_STRIP_HEIGHT_PX,
        });
        expect(t.tickPanelY).toBe(plain.timeline.tickPanelY);
        expect(t.tickPanelHeight).toBe(plain.timeline.tickPanelHeight);
        // The marker rows and the chart move down by the strip's height.
        expect(t.markerRow.y).toBe(plain.timeline.markerRow.y + WAVE_STRIP_HEIGHT_PX);
        expect(t.markerRow.height).toBe(plain.timeline.markerRow.height);
        expect(waved.chartBox.y).toBe(plain.chartBox.y + WAVE_STRIP_HEIGHT_PX);
        expect(waved.anchors[0].center.y).toBe(plain.anchors[0].center.y + WAVE_STRIP_HEIGHT_PX);
        // The strip sits wholly above the marker band.
        expect(t.markerRow.y - MARKER_ROW_CENTER_OFFSET_PX).toBe(
            (t.waveStrip?.y ?? 0) + WAVE_STRIP_HEIGHT_PX,
        );
    });

    it('timeline-position:bottom puts the strip right under the now-pill row', async () => {
        const config = '\nconfig\n\ndefault roadmap timeline-position:bottom\n';
        const plain = await lay(headerSource(false, config), { today });
        const waved = await lay(headerSource(true, config), { today });
        const t = waved.timeline;
        expect(t.tickPanelHeight).toBe(0);
        expect(t.waveStrip?.y).toBe(t.tickPanelY);
        expect(t.waveStrip?.y).toBe(t.box.y + t.pillRowHeight);
        expect(t.markerRow.y).toBe(plain.timeline.markerRow.y + WAVE_STRIP_HEIGHT_PX);
        // The mirrored bottom panel carries no strip: it keeps its height,
        // and the only strip is the top one.
        expect(t.bottomTickPanelHeight).toBe(TIMELINE_TICK_PANEL_HEIGHT_PX);
        expect(t.bottomTickPanelY).toBe(
            (plain.timeline.bottomTickPanelY ?? 0) + WAVE_STRIP_HEIGHT_PX,
        );
    });
});

// --- Strip cells (§9.1) ---

describe('wave strip cells (§9.1)', () => {
    it('Example 1: columns and cells span each wave', async () => {
        const model = await lay(EXAMPLE_1);
        const strip = model.timeline.waveStrip!;
        for (const w of wavesOf(model)) {
            expect(w.columnBox).toEqual({
                x: w.startX,
                y: model.chartBox.y,
                width: w.endX - w.startX,
                height: (model.waveBoundaries?.[0].bottomY ?? 0) - model.chartBox.y,
            });
            expect(w.strip.box).toEqual({
                x: w.startX,
                y: strip.y,
                width: w.endX - w.startX,
                height: WAVE_STRIP_HEIGHT_PX,
            });
            expect(w.strip.labelKind).toBe('title');
            expect(w.strip.label).toBe(w.title);
            expect(w.strip.labelX).toBe((w.startX + w.endX) / 2);
            expect(w.footnoteIndicators).toEqual([]);
            expect(w.strip.footnotesShown).toBe(false);
        }
        expect(wavesOf(model).map((w) => w.visibleOrdinal)).toEqual([0, 1, 2]);
        expect(wavesOf(model).map((w) => w.style.stripFill)).toEqual([
            lightTheme.wave.stripFill,
            lightTheme.wave.stripFillAlt,
            lightTheme.wave.stripFill,
        ]);
    });

    it('Example 12: alternation counts non-empty waves only', async () => {
        const [w1, w2, w3] = wavesOf(await lay(EXAMPLE_12));
        expect(w1.visibleOrdinal).toBe(0);
        expect('visibleOrdinal' in w2).toBe(false);
        expect(w3.visibleOrdinal).toBe(1);
        expect(w1.style.stripFill).toBe(lightTheme.wave.stripFill);
        expect(w3.style.stripFill).toBe(lightTheme.wave.stripFillAlt);
        expect(w2.strip.labelKind).toBe('none');
        expect('label' in w2.strip).toBe(false);
        expect(w2.strip.box.width).toBe(0);
    });

    it('the fit chain degrades title, id, ellipsis, #k, none', () => {
        // 10 px bold: 6.09 px per character, plus 2 × 6 px padding.
        const title = 'Hardening phase';
        expect(fitStripLabel(title, 'hp', 3, 104, 0)).toEqual({ kind: 'title', label: title });
        expect(fitStripLabel(title, 'hp', 3, 103, 0)).toEqual({ kind: 'id', label: 'hp' });
        expect(fitStripLabel(title, 'hardening-phase', 3, 60, 0)).toEqual({
            kind: 'ellipsis',
            label: 'Harden…',
        });
        // Three characters plus the ellipsis is the shortest ellipsis.
        expect(fitStripLabel(title, 'hardening-phase', 3, 36.4, 0)).toEqual({
            kind: 'ellipsis',
            label: 'Har…',
        });
        expect(fitStripLabel(title, 'hardening-phase', 3, 36.3, 0)).toEqual({
            kind: 'ordinal',
            label: '#3',
        });
        expect(fitStripLabel(title, 'hardening-phase', 3, 24, 0)).toBeUndefined();
        // A trailing space never ends the ellipsized prefix.
        expect(fitStripLabel('Ab cdefgh', 'ab-cdefgh', 1, 42.5, 0)).toEqual({
            kind: 'ellipsis',
            label: 'Ab c…',
        });
        // The superscripts take their width from the same budget.
        expect(fitStripLabel('One', 'one', 1, 32.3, 0)?.kind).toBe('title');
        expect(fitStripLabel('One', 'one', 1, 32.3, 8)?.kind).toBe('ordinal');
    });

    it('long titles at scale:1m degrade to id, ellipsis, #k and none', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1m calendar:full

wave discover "Discovery and research"
wave build "Build the platform"
wave harden "Hardening"
wave ship "Ship"
wave tail "Tail"

swimlane a
  item a1 duration:8w wave:discover
  item a2 duration:3w wave:build
  item a3 duration:2w wave:harden
  item a4 duration:10d wave:ship
  item a5 duration:1d wave:tail
`);
        const waves = wavesOf(model);
        expect(waves.map((w) => [w.strip.labelKind, w.strip.label])).toEqual([
            ['title', 'Discovery and research'],
            ['id', 'build'],
            ['ellipsis', 'Har…'],
            ['ordinal', '#4'],
            ['none', undefined],
        ]);
        // Abbreviated labels bring in the legend's wave list.
        const list = model.waveLegend?.entries.find((e) => e.kind === 'waves');
        expect(list?.text).toBe(
            'Waves: #1 Discovery and research · #2 Build the platform · #3 Hardening · #4 Ship · #5 Tail',
        );
    });

    it('Example 9: the tooltip names the dates (end exclusive) and the holder', async () => {
        const model = await lay(EXAMPLE_9.replace(' A2_PIN', ' after:2026-01-19'));
        const [w1, w2] = wavesOf(model);
        expect(w1.strip.tooltip).toBe('Integrate · 2026-01-05 – 2026-02-02 · held by i1');
        expect(w2.strip.tooltip).toBe('Launch · 2026-02-02 – 2026-02-23 · held by i2');
    });

    it('the tooltip follows the layout locale', async () => {
        const model = await lay(EXAMPLE_9.replace(' A2_PIN', ''), { locale: 'fr' });
        expect(wavesOf(model)[1].strip.tooltip).toMatch(/ · retenue par i2$/);
    });

    it('Example 12: an empty wave is a diamond mid-strip at its x, and says so', async () => {
        const model = await lay(EXAMPLE_12);
        const [w1, w2] = wavesOf(model);
        const strip = model.timeline.waveStrip!;
        expect(w2.strip.marker).toEqual({ x: w1.endX, y: strip.y + strip.height / 2 });
        expect(w2.strip.labelX).toBe(w1.endX);
        // An empty wave spans no time: one date, and no holder.
        expect(w2.strip.tooltip).toBe(
            `Hardening (TBD) · ${w2.startDate.toISOString().slice(0, 10)} · no items`,
        );
        expect(w2.strip.footnotesShown).toBe(false);
        expect('marker' in w1.strip).toBe(false);
    });

    it('empty waves at one x step 9 px to the right', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two"
wave w3 "Three"
wave w4 "Four"

swimlane a
  item a1 duration:2w wave:w1
  item a4 duration:1w wave:w4
`);
        const [w1, w2, w3, w4] = wavesOf(model);
        expect(w2.startX).toBe(w1.endX);
        expect(w3.startX).toBe(w1.endX);
        expect(w2.strip.marker?.x).toBe(w1.endX);
        expect(w3.strip.marker?.x).toBe(w1.endX + WAVE_EMPTY_MARKER_STEP_PX);
        expect(w4.visibleOrdinal).toBe(1);
        // Empty waves add no line: one shared boundary plus the closing line.
        expect(boundaryXs(model)).toEqual([w1.endX, w4.endX]);
    });

    it('Example 11: a gap has no cell; its floor label is shown only when it fits', async () => {
        // The spec's one-week gap is 40 px wide: `fy-budget` needs 64 px.
        const tight = wavesOf(await lay(EXAMPLE_11));
        expect('gapLabel' in tight[1].strip).toBe(false);

        const model = await lay(EXAMPLE_11.replace('date:2026-02-02', 'date:2026-02-16'));
        const [plan, execute] = wavesOf(model);
        expect(execute.floorRef).toBe('fy-budget');
        expect(execute.startX).toBeGreaterThan(plan.endX);
        expect(execute.strip.gapLabel).toEqual({
            text: 'fy-budget',
            x: (plan.endX + execute.startX) / 2,
        });
        expect('gapLabel' in plan.strip).toBe(false);
        expect(execute.strip.box.x).toBe(execute.startX);
    });

    it('every wave empty: only the placeholder, no markers, boundaries or crossings', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"

swimlane a
  item a1 duration:2w
`);
        expect(model.timeline.waveStrip?.placeholder).toBe(
            'Waves declared: Discover, Build — no items assigned yet',
        );
        for (const w of wavesOf(model)) {
            expect(w.empty).toBe(true);
            expect('marker' in w.strip).toBe(false);
            expect('visibleOrdinal' in w).toBe(false);
        }
        expect('waveBoundaries' in model).toBe(false);
        expect('waveCrossings' in model).toBe(false);
        // The legend explains the empty waves (and the background bar), with
        // no boundary entry since no boundary is drawn.
        expect(model.waveLegend?.entries.map((e) => e.kind)).toEqual(['background', 'waves']);
        expect(model.waveLegend?.entries[1].text).toBe(
            'Waves: #1 Discover (no items) · #2 Build (no items)',
        );
    });

    it('a roadmap with members has no placeholder', async () => {
        const model = await lay(EXAMPLE_12);
        expect('placeholder' in (model.timeline.waveStrip ?? {})).toBe(false);
    });
});

// --- Boundaries (§9.2) ---

describe('wave boundaries (§9.2)', () => {
    it('contiguous waves: one line per boundary plus the closing line, never the origin', async () => {
        const model = await lay(EXAMPLE_1);
        const waves = wavesOf(model);
        expect(waves[0].startX).toBe(model.timeline.originX);
        expect(boundaryXs(model)).toEqual(waves.map((w) => w.endX));
        for (const b of model.waveBoundaries ?? []) {
            expect(b.topY).toBe(model.timeline.waveStrip?.y);
            expect(b.bottomY).toBe(waves[0].columnBox.y + waves[0].columnBox.height);
            expect(b.stroke).toBe(lightTheme.wave.boundary);
            expect(b.dash).toBeNull();
        }
    });

    it('a gap gives two lines', async () => {
        const model = await lay(EXAMPLE_11);
        const [plan, execute] = wavesOf(model);
        expect(boundaryXs(model)).toEqual([plan.endX, execute.startX, execute.endX]);
    });

    it('an empty wave adds no line of its own (Example 12)', async () => {
        const model = await lay(EXAMPLE_12);
        const [w1, , w3] = wavesOf(model);
        expect(boundaryXs(model)).toEqual([w1.endX, w3.endX]);
    });

    it('a floored first wave draws its opening line', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:full

wave w1 "One" after:2026-01-19

swimlane a
  item a1 duration:1w wave:w1
`);
        const [w1] = wavesOf(model);
        expect(w1.startX).toBeGreaterThan(model.timeline.originX);
        expect(boundaryXs(model)).toEqual([w1.startX, w1.endX]);
    });

    it('styles: an opening line uses its own wave; a gap’s closing line its closing wave', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

config

style dash
  fg: red
  border: dashed
style dot
  border: dotted
style plain
  fg: blue

roadmap r "R" start:2026-01-05 scale:1w calendar:full

wave w1 "One" style:dash
wave w2 "Two" style:dot after:2026-02-02
wave w3 "Three" style:plain

swimlane a
  item a1 duration:1w wave:w1
  item a2 duration:1w wave:w2
  item a3 duration:1w wave:w3
`);
        const model = layoutRoadmap(file, resolved);
        const [w1, w2, w3] = wavesOf(model);
        expect(w1.style).toMatchObject({
            boundary: '#e53935',
            boundaryDash: '4 2',
        });
        expect(w2.style).toMatchObject({ boundaryDash: '1 2' });
        expect(w3.style).toMatchObject({
            boundaryDash: null,
            boundary: resolveColor('blue', lightTheme),
        });
        expect(model.waveBoundaries).toEqual([
            // The gap's closing line at E_1 is wave 1's.
            {
                x: w1.endX,
                topY: model.timeline.waveStrip?.y,
                bottomY: w1.columnBox.y + w1.columnBox.height,
                stroke: '#e53935',
                dash: '4 2',
            },
            // Wave 2's opening line is its own.
            {
                x: w2.startX,
                topY: model.timeline.waveStrip?.y,
                bottomY: w1.columnBox.y + w1.columnBox.height,
                stroke: lightTheme.wave.boundary,
                dash: '1 2',
            },
            // E_2 = S_3 opens wave 3 (solid, blue); E_3 closes it likewise.
            {
                x: w3.startX,
                topY: model.timeline.waveStrip?.y,
                bottomY: w1.columnBox.y + w1.columnBox.height,
                stroke: w3.style.boundary,
                dash: null,
            },
            {
                x: w3.endX,
                topY: model.timeline.waveStrip?.y,
                bottomY: w1.columnBox.y + w1.columnBox.height,
                stroke: w3.style.boundary,
                dash: null,
            },
        ]);
        expect(w3.startX).toBe(w2.endX);
    });
});

// --- Crossings (§9.3) ---

describe('wave crossings (§9.3)', () => {
    it('Example 3: docs and oncall cross W3; oncall does not cross W6', async () => {
        const model = await lay(EXAMPLE_3);
        const [w1, w2] = wavesOf(model);
        expect(boundaryXs(model)).toEqual([w1.endX, w2.endX]);
        const docs = itemById(model, 'docs');
        const oncall = itemById(model, 'oncall');
        expect(docs.waveRole).toBe('background');
        expect(model.waveCrossings).toEqual([
            {
                x: w1.endX,
                topY: docs.box.y,
                bottomY: docs.box.y + docs.box.height,
                stroke: lightTheme.wave.boundary,
            },
            {
                x: w1.endX,
                topY: oncall.box.y,
                bottomY: oncall.box.y + oncall.box.height,
                stroke: lightTheme.wave.boundary,
            },
        ]);
        // oncall's logical end is W6 (= E_2); its visual right edge sits
        // 6 px inside it.
        expect(oncall.box.x + oncall.box.width).toBeLessThan(w2.endX);
    });

    it('members never get crossings', async () => {
        const model = await lay(EXAMPLE_1);
        expect('waveCrossings' in model).toBe(false);
    });

    it('a background bar in an isolated region crosses inside the region', async () => {
        const files = {
            ...EXAMPLE_19,
            'ios.nowline': `${EXAMPLE_19['ios.nowline']}swimlane ios-ops\n  item ios-oncall duration:6w\n`,
        };
        const model = await layIncludes(files, 'portfolio.nowline');
        const [w1] = wavesOf(model);
        const oncall = itemById(model, 'ios-oncall');
        expect(oncall.waveRole).toBe('background');
        expect('waveCrossings' in model).toBe(false);
        expect(model.includes[0].waveCrossings).toEqual([
            {
                x: w1.endX,
                topY: oncall.box.y,
                bottomY: oncall.box.y + oncall.box.height,
                stroke: lightTheme.wave.boundary,
            },
        ]);
        // The background bar also brings in the legend's hatch entry.
        expect(model.waveLegend?.entries[0].kind).toBe('background');
    });

    it('a region with no background work carries no crossings key', async () => {
        const model = await layIncludes(EXAMPLE_19, 'portfolio.nowline');
        expect('waveCrossings' in model.includes[0]).toBe(false);
    });
});

// --- Styled waves (§9.4) ---

describe('styled waves (§9.4)', () => {
    const styled = (style: string, theme: 'light' | 'dark') =>
        lay(
            `nowline v1

config

style lit
${style}

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two" style:lit

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:2w wave:w2
`,
            { theme },
        );

    it('unstyled waves use the theme tokens and no tint', async () => {
        const [w1] = wavesOf(await lay(EXAMPLE_1, { theme: 'dark' }));
        expect(w1.style).toEqual({
            stripFill: darkTheme.wave.stripFill,
            text: darkTheme.wave.labelText,
            boundary: darkTheme.wave.boundary,
            boundaryDash: null,
        });
    });

    it('bg tints the column; a label that drops below 4.5:1 picks dark or light text', async () => {
        // Dark theme, odd cell (#134e4a) under a 0.25 white overlay: the
        // light `wave.labelText` falls to about 3.9:1, so white is picked.
        const [w1, w2] = wavesOf(await styled('  bg: #ffffff', 'dark'));
        expect(w1.style.text).toBe(darkTheme.wave.labelText);
        expect('tint' in w1.style).toBe(false);
        expect(w2.style.tint).toBe('#ffffff');
        expect(w2.style.stripFill).toBe(darkTheme.wave.stripFillAlt);
        expect(w2.style.text).toBe(darkTheme.wave.hatchOnDark);
    });

    it('the dark candidate wins on a light cell where wave.labelText fails', () => {
        // Dark-theme light text (#99f6e4) on a light cell is below 4.5:1, and
        // the dark candidate beats the light one. Layout cannot reach this
        // (a 0.25 overlay never lightens a dark theme's strip cell), so the
        // picker is exercised directly.
        const fill = '#e0f2f1';
        expect(contrastRatio(darkTheme.wave.labelText, fill)).toBeLessThan(4.5);
        expect(readableLabelText(darkTheme.wave, fill)).toBe(darkTheme.wave.hatch);
    });

    it('grayscale fallbacks stay neutral', () => {
        expect(grayscaleTheme.wave.hatch).toBe('#000000');
        expect(readableLabelText({ ...grayscaleTheme.wave, labelText: '#cccccc' }, '#eeeeee')).toBe(
            '#000000',
        );
    });

    it('a tint the label still reads against keeps wave.labelText', async () => {
        const [, w2] = wavesOf(await styled('  bg: navy', 'light'));
        expect(w2.style.tint).toBeDefined();
        expect(w2.style.text).toBe(lightTheme.wave.labelText);
    });

    it('text: wins over the automatic pick', async () => {
        const [, w2] = wavesOf(await styled('  bg: #ffffff\n  text: yellow', 'dark'));
        expect(w2.style.text).toBe(resolveColor('yellow', darkTheme));
    });
});

// --- Legend (§9.5) ---

describe('wave legend (§9.5)', () => {
    it('no trigger: no legend, and the chart bottom does not grow', async () => {
        const model = await lay(EXAMPLE_1);
        expect('waveLegend' in model).toBe(false);
        expect(model.chartBox.y + model.chartBox.height).toBe(model.waveBoundaries?.[0].bottomY);
    });

    it('Example 3: background work brings the hatch and boundary swatches', async () => {
        const model = await lay(EXAMPLE_3);
        const legend = model.waveLegend;
        expect(legend?.entries.map((e) => [e.kind, e.text])).toEqual([
            ['background', 'Background work (not in a wave)'],
            ['boundary', 'Wave boundary'],
        ]);
        const swimlaneBottomY = model.waveBoundaries?.[0].bottomY ?? 0;
        expect(legend?.box.y).toBe(swimlaneBottomY + WAVE_LEGEND_GAP_PX);
        expect(legend?.box.x).toBe(model.timeline.originX);
        expect(legend?.box.height).toBe(
            WAVE_LEGEND_LINE_PX *
                new Set(legend?.entries.flatMap((e) => e.runs.map((r) => r.y))).size,
        );
        // The chart bottom grows by the gap and the legend's lines.
        expect(model.chartBox.y + model.chartBox.height).toBe(
            swimlaneBottomY + WAVE_LEGEND_GAP_PX + (legend?.box.height ?? 0),
        );
        for (const e of legend?.entries ?? []) {
            expect(e.swatch).toBeDefined();
            expect(e.runs).toHaveLength(1);
            expect(e.runs[0].x).toBeGreaterThan(e.swatch?.x ?? 0);
        }
    });

    it('a wide chart keeps the swatch entries on one line', async () => {
        const model = await lay(EXAMPLE_3.replace('scale:1w', 'scale:1w length:26w'));
        const legend = model.waveLegend;
        expect(legend?.box.height).toBe(WAVE_LEGEND_LINE_PX);
        const [bg, boundary] = legend?.entries ?? [];
        expect(boundary.runs[0].y).toBe(bg.runs[0].y);
        expect(boundary.swatch?.x).toBeGreaterThan(bg.runs[0].x);
    });

    it('Example 12: an empty wave lists every wave', async () => {
        const model = await lay(EXAMPLE_12);
        const entries = model.waveLegend?.entries ?? [];
        expect(entries.map((e) => e.kind)).toEqual(['boundary', 'waves']);
        expect(entries[1].text).toBe(
            'Waves: #1 Wave 1 · #2 Hardening (TBD) (no items) · #3 Wave 3',
        );
        expect('swatch' in entries[1]).toBe(false);
        expect(entries[1].runs.map((r) => r.text).join(' · ')).toBe(entries[1].text);
    });

    it('sits below the bottom tick panel and pushes the footnotes down', async () => {
        const source = `nowline v1

config

default roadmap timeline-position:both

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two"

swimlane a
  item a1 duration:2w wave:w1
  item bg "Background" duration:3w
  item a2 duration:1w wave:w2

footnote note "A note" on:a1
`;
        const model = await lay(source);
        const legend = model.waveLegend!;
        const panelBottom =
            (model.timeline.bottomTickPanelY ?? 0) + (model.timeline.bottomTickPanelHeight ?? 0);
        expect(legend.box.y).toBe(panelBottom + WAVE_LEGEND_GAP_PX);
        expect(model.footnotes.box.y).toBe(
            legend.box.y + legend.box.height + FOOTNOTE_PANEL_PADDING_PX,
        );
        // The now-line is unaffected and cut lines stop at the last lane.
        expect(model.waveBoundaries?.[0].bottomY).toBeLessThan(
            model.timeline.bottomTickPanelY ?? 0,
        );
    });
});

// --- Footnotes on waves (§5.3) ---

describe('footnotes on waves', () => {
    const source = (duration: string) => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "Discover"
wave w2 "Build"

swimlane a
  item a1 duration:${duration} wave:w1
  item a2 duration:2w wave:w2

footnote a-risk "Risk" on:w2
footnote b-vendor "Vendor" on:[w1, a1]
`;

    it('a footnote on:<wave> gives the wave its indicator in the cell', async () => {
        const model = await lay(source('3w'));
        const [w1, w2] = wavesOf(model);
        expect(w1.footnoteIndicators).toEqual([2]);
        expect(w2.footnoteIndicators).toEqual([1]);
        expect(w1.strip.footnotesShown).toBe(true);
        expect(w1.strip.labelKind).toBe('title');
        expect('waveLegend' in model).toBe(false);
    });

    it('indicators that do not fit move to the legend', async () => {
        // A 1d cell (8 px under the business calendar, clamped to the minimum
        // bar width) has no room for the superscript, or for any label.
        const model = await lay(source('1d'));
        const [w1] = wavesOf(model);
        expect(w1.footnoteIndicators).toEqual([2]);
        expect(w1.strip.footnotesShown).toBe(false);
        expect(w1.strip.labelKind).toBe('none');
        const list = model.waveLegend?.entries.find((e) => e.kind === 'waves');
        expect(list?.text).toBe('Waves: #1 Discover ² · #2 Build');
    });
});

// --- Renderer hand-offs: background tooltip (§9.3), wave-only groups (§9.7) ---

describe('background tooltip and wave-only groups', () => {
    it('background items carry the localized tooltip; members do not', async () => {
        const model = await lay(EXAMPLE_3);
        expect(itemById(model, 'oncall').waveTooltip).toBe('Background (no wave)');
        expect('waveTooltip' in itemById(model, 'schema')).toBe(false);
        const fr = await lay(EXAMPLE_3, { locale: 'fr' });
        expect(itemById(fr, 'oncall').waveTooltip).toBe('Travail de fond (hors vague)');
    });

    const groupIn = async (header: string, waves = true): Promise<PositionedGroup> => {
        const model = await lay(`nowline v1

config

style s
  bracket: dashed

roadmap r "R" start:2026-01-05 scale:1w
${waves ? '\nwave w1 "One"\nwave w2 "Two"\n' : ''}
swimlane a
  item a1 duration:1w${waves ? ' wave:w1' : ''}
  ${header}
    item a2 duration:1w
`);
        const group = model.swimlanes[0].children.find((c) => c.kind === 'group');
        expect(group).toBeDefined();
        return group as PositionedGroup;
    };

    it('only an untitled group with wave: and no style:/labels: is wave-only', async () => {
        expect((await groupIn('group wave:w2')).waveOnly).toBe(true);
        for (const header of [
            'group "Build" wave:w2',
            'group g1 "Build" wave:w2',
            'group wave:w2 style:s',
            'group wave:w2 labels:x',
            'group',
        ]) {
            expect('waveOnly' in (await groupIn(header))).toBe(false);
        }
        expect('waveOnly' in (await groupIn('group', false))).toBe(false);
    });

    it('an id alone does not title a wave-only group (Example 4)', async () => {
        const group = await groupIn('group g1 wave:w2');
        expect(group.waveOnly).toBe(true);
        expect(group.id).toBe('g1');
        // No id label: the group draws nothing and reserves no header band.
        expect(group.title).toBeUndefined();
        // Without waves the id still labels the group, as it always has.
        expect((await groupIn('group g1', false)).title).toBe('g1');
    });
});
