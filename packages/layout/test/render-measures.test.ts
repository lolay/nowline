// Values layout measures for the SVG renderer (R5 m3), so the renderer only
// draws: each test lays out a small roadmap and checks the field the
// renderer now reads instead of measuring itself.

import type { NowlineFile } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { capacityIconDxTerms, estimateCapacitySuffixWidth } from '../src/capacity.js';
import { estimateTextWidth as estimateTextWidthFromIndex } from '../src/index.js';
import { ITEM_FOOTNOTE_INDICATOR_STEP_PX } from '../src/item-bar-geometry.js';
import { type LayoutOptions, layoutRoadmap } from '../src/layout.js';
import { MARKER_BOLD_WIDTH_FACTOR } from '../src/nodes/marker-geometry.js';
import { fillLuminance, statusDotColor } from '../src/status-dot.js';
import { estimateTextWidth } from '../src/text-measure.js';
import { darkTheme, lightTheme } from '../src/themes/index.js';
import type {
    PositionedItem,
    PositionedRoadmap,
    PositionedTrackChild,
    PositionedWave,
} from '../src/types.js';
import { waveHatchKind } from '../src/wave-hatch.js';
import { parseAndResolve } from './helpers.js';
import { EXAMPLE_1, EXAMPLE_3, EXAMPLE_11 } from './wave-examples.js';

/** A strip label's width at the strip's 10 px bold weight. */
function boldWidth(text: string): number {
    return estimateTextWidth(text, 10) * MARKER_BOLD_WIDTH_FACTOR;
}

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

function itemsOf(model: PositionedRoadmap): PositionedItem[] {
    const out: PositionedItem[] = [];
    const walk = (children: PositionedTrackChild[]): void => {
        for (const c of children) {
            if (c.kind === 'item') out.push(c);
            else walk(c.children);
        }
    };
    for (const lane of model.swimlanes) walk(lane.children);
    return out;
}

function wavesOf(model: PositionedRoadmap): PositionedWave[] {
    expect(model.waves).toBeDefined();
    return model.waves ?? [];
}

describe('text width estimator', () => {
    it('is exported from the package entry point', () => {
        expect(estimateTextWidthFromIndex).toBe(estimateTextWidth);
        expect(estimateTextWidthFromIndex('abcd', 10)).toBeCloseTo(23.2, 10);
    });
});

const STATUS_SRC = `nowline v1

config

style hollow
  bg: none

style navy
  bg: #172554

roadmap r "R" start:2026-01-05 scale:1w

swimlane a
  item p "Planned" duration:1w status:planned
  item d "Done" duration:1w status:done
  item g "Going" duration:1w status:in-progress
  item k "Risk" duration:1w status:at-risk
  item b "Blocked" duration:1w status:blocked
  item h "Hollow" duration:1w status:done style:hollow
  item n "Navy" duration:1w status:blocked style:navy
`;

describe('status-dot colour', () => {
    it('picks the light-bar palette entry for each status on pale bars', async () => {
        const items = itemsOf(await lay(STATUS_SRC, { theme: 'light' }));
        const byId = new Map(items.map((i) => [i.id, i]));
        const onLight = lightTheme.statusDot.onLight;
        expect(byId.get('p')?.statusDotColor).toBe(onLight.planned);
        expect(byId.get('d')?.statusDotColor).toBe(onLight.done);
        expect(byId.get('g')?.statusDotColor).toBe(onLight.inProgress);
        expect(byId.get('k')?.statusDotColor).toBe(onLight.atRisk);
        expect(byId.get('b')?.statusDotColor).toBe(onLight.blocked);
        expect(byId.get('d')?.statusDotColor).toBe('#065f46');
    });

    it('treats a transparent bar as light and a dark bar as dark', async () => {
        const items = itemsOf(await lay(STATUS_SRC, { theme: 'light' }));
        const byId = new Map(items.map((i) => [i.id, i]));
        expect(byId.get('h')?.style.bg).toBe('none');
        expect(byId.get('h')?.statusDotColor).toBe(lightTheme.statusDot.onLight.done);
        expect(byId.get('n')?.style.bg).toBe('#172554');
        expect(byId.get('n')?.statusDotColor).toBe(lightTheme.statusDot.onDark.blocked);
    });

    it('reads the bar fill of every item, whatever the theme', async () => {
        for (const theme of ['light', 'dark', 'grayscale'] as const) {
            const model = await lay(STATUS_SRC, { theme });
            for (const i of itemsOf(model)) {
                expect(i.statusDotColor).toBe(statusDotColor(i.status, i.style.bg, model.palette));
            }
        }
        expect(statusDotColor('neutral', '#172554', darkTheme)).toBe(
            darkTheme.statusDot.onDark.neutral,
        );
    });

    it('keeps the renderer luminance semantics for non-hex fills', () => {
        expect(fillLuminance('none')).toBe(1);
        expect(fillLuminance('transparent')).toBe(1);
        expect(fillLuminance('')).toBe(1);
        expect(fillLuminance('#abcd')).toBe(1);
        expect(fillLuminance('#fff')).toBe(fillLuminance('#ffffff'));
        expect(fillLuminance('ffffff')).toBeCloseTo(1, 10);
        expect(fillLuminance('#000000')).toBe(0);
        expect(Number.isNaN(fillLuminance('zzzzzz'))).toBe(true);
    });
});

const CAPACITY_SRC = `nowline v1

config

style counted
  capacity-icon: person

roadmap r "R" start:2026-01-05 scale:1w

swimlane crew "Team" capacity:8 style:counted
  item a "Alpha" duration:2w capacity:3 style:counted
  item c "Gamma" duration:1w capacity:4
`;

describe('capacity icon offset', () => {
    it('places an item meta-line icon past the meta text and the number', async () => {
        const model = await lay(CAPACITY_SRC, { theme: 'light' });
        const a = itemsOf(model).find((i) => i.id === 'a');
        expect(a?.metaText).toBe('2w');
        // 0.5 em per char of `2w`, the 0.6 em separator, 0.5 em per char
        // of `3` and the 0.1 em gap, all at the 11 px meta size, in the
        // order the renderer adds them to the caption x.
        expect(a?.capacity?.iconDxTerms).toEqual([2 * 11 * 0.5, 11 * 0.6, 11 * 0.5, 11 * 0.1]);
        expect(a?.capacity?.iconDxTerms).toEqual(
            capacityIconDxTerms('3', a?.capacity?.icon ?? null, 11, '2w'),
        );
    });

    it('places a lane badge icon past the number at the badge size', async () => {
        const lane = (await lay(CAPACITY_SRC, { theme: 'light' })).swimlanes[0];
        expect(lane.capacity?.icon).toEqual({ kind: 'builtin', name: 'person' });
        expect(lane.capacity?.iconDxTerms).toEqual([estimateTextWidth('8', 10), 10 * 0.1]);
    });

    it('is omitted for a glyph painted inside the text', async () => {
        const c = itemsOf(await lay(CAPACITY_SRC, { theme: 'light' })).find((i) => i.id === 'c');
        expect(c?.capacity?.icon).toEqual({ kind: 'builtin', name: 'multiplier' });
        expect(c?.capacity && 'iconDxTerms' in c.capacity).toBe(false);
        expect(capacityIconDxTerms('4', null, 11)).toBeUndefined();
        expect(capacityIconDxTerms('4', { kind: 'literal', text: '*' }, 11, 'm')).toBeUndefined();
    });

    it('starts the run at the number when there is no meta text', () => {
        const icon = { kind: 'builtin', name: 'time' } as const;
        expect(capacityIconDxTerms('12', icon, 11)).toEqual([
            estimateTextWidth('12', 11),
            11 * 0.1,
        ]);
    });
});

describe('lane frame-tab badge widths', () => {
    it('carry the capacity badge and footnote indicator widths', async () => {
        const model = await lay(
            `${CAPACITY_SRC}\nfootnote f1 "One" on:crew\nfootnote f2 "Two" on:crew\n`,
            { theme: 'light' },
        );
        const lane = model.swimlanes[0];
        expect(lane.footnoteIndicators).toEqual([1, 2]);
        expect(lane.tab?.capacityBadgeWidth).toBe(
            estimateCapacitySuffixWidth('8', { kind: 'builtin', name: 'person' }, 10),
        );
        expect(lane.tab?.footnoteIndicatorWidth).toBe(estimateTextWidth('1,2', 10));
    });

    it('are 0 for a lane without a badge or indicators', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item x duration:1w
`);
        expect(model.swimlanes[0].tab?.capacityBadgeWidth).toBe(0);
        expect(model.swimlanes[0].tab?.footnoteIndicatorWidth).toBe(0);
    });
});

describe('wave strip label geometry', () => {
    it('clips each cell to the panel and centres its label halo', async () => {
        const model = await lay(EXAMPLE_1);
        const t = model.timeline;
        const strip = t.waveStrip;
        expect(strip).toBeDefined();
        for (const w of wavesOf(model)) {
            const cell = w.strip.cell;
            expect(cell).toBeDefined();
            if (!cell || !strip) continue;
            expect(cell.y).toBe(strip.y + 0.5);
            expect(cell.height).toBe(strip.height - 1);
            expect(cell.x).toBe(Math.max(w.strip.box.x, t.box.x + 0.5));
            expect(cell.x + cell.width).toBeCloseTo(
                Math.min(w.strip.box.x + w.strip.box.width, t.box.x + t.box.width - 0.5),
                10,
            );
            const haloWidth = boldWidth(w.strip.label ?? '') + 4;
            expect(w.strip.labelDraw).toEqual({
                x: w.strip.labelX,
                halo: {
                    x: w.strip.labelX - haloWidth / 2,
                    y: strip.y + 3,
                    width: haloWidth,
                    height: strip.height - 6,
                },
            });
            expect('superscripts' in w.strip).toBe(false);
        }
    });

    it('places shown superscripts right-aligned and keeps the label left of them', async () => {
        const model = await lay(
            `${EXAMPLE_1}\nfootnote n1 "One" on:build\nfootnote n2 "Two" on:build\n`,
        );
        const build = wavesOf(model)[1];
        const strip = model.timeline.waveStrip;
        const cell = build.strip.cell;
        expect(build.strip.footnotesShown).toBe(true);
        expect(cell && strip).toBeTruthy();
        if (!cell || !strip) return;
        const cellRight = cell.x + cell.width;
        const width = 2 * ITEM_FOOTNOTE_INDICATOR_STEP_PX;
        expect(build.strip.superscripts?.rightX).toBe(cellRight - 6);
        expect(build.strip.superscripts?.halo.x).toBe(cellRight - 6 - width - 2);
        expect(build.strip.superscripts?.halo.width).toBeCloseTo(width + 4, 10);
        const labelWidth = boldWidth(build.strip.label ?? '');
        expect(build.strip.labelDraw?.x).toBe(
            Math.min(build.strip.labelX, cellRight - 6 - width - labelWidth / 2),
        );
    });

    it('gives an empty wave no cell and a gap label its halo', async () => {
        const model = await lay(EXAMPLE_11.replace('date:2026-02-02', 'date:2026-02-16'));
        const strip = model.timeline.waveStrip;
        const gap = wavesOf(model)[1].strip.gapLabel;
        expect(gap && strip).toBeTruthy();
        if (!gap || !strip) return;
        const width = estimateTextWidth('fy-budget', 10);
        expect(gap.halo).toEqual({
            x: gap.x - (width + 4) / 2,
            y: strip.y + 3,
            width: width + 4,
            height: strip.height - 6,
        });
        const empty = wavesOf(
            await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two"

swimlane a
  item a1 duration:2w wave:w1
`),
        )[1];
        expect(empty.empty).toBe(true);
        expect('cell' in empty.strip).toBe(false);
        expect('labelDraw' in empty.strip).toBe(false);
    });
});

describe('wave hatch kind', () => {
    it('marks each background item with the hatch for its fill', async () => {
        const src = EXAMPLE_3.replace(
            'roadmap background',
            'config\n\nstyle navy\n  bg: #172554\n\nroadmap background',
        ).replace(
            'item oncall "On-call rotation" duration:6w',
            'item oncall "On-call rotation" duration:6w style:navy',
        );
        const items = itemsOf(await lay(src, { theme: 'light' }));
        const byId = new Map(items.map((i) => [i.id, i]));
        expect(byId.get('docs')?.waveRole).toBe('background');
        expect(byId.get('docs')?.waveHatch).toBe('dark');
        expect(byId.get('oncall')?.style.bg).toBe('#172554');
        expect(byId.get('oncall')?.waveHatch).toBe('light');
        expect(byId.get('schema')?.waveRole).toBe('member');
        expect(Object.hasOwn(byId.get('schema') ?? {}, 'waveHatch')).toBe(false);
    });

    it('gives the legend background swatch the hatch of a default bar', async () => {
        for (const theme of ['light', 'dark'] as const) {
            const model = await lay(EXAMPLE_3, { theme });
            const entries = model.waveLegend?.entries ?? [];
            const background = entries.find((e) => e.kind === 'background');
            expect(background?.hatch).toBe(waveHatchKind(model.palette.entities.item.bg));
            for (const e of entries) {
                if (e.kind !== 'background') expect('hatch' in e).toBe(false);
            }
        }
    });

    it('reads a transparent fill as light', () => {
        expect(waveHatchKind('none')).toBe('dark');
        expect(waveHatchKind('#ffffff')).toBe('dark');
        expect(waveHatchKind('#000000')).toBe('light');
    });
});
