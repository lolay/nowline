// Values layout measures for the SVG renderer (R5 m3), so the renderer only
// draws: each test lays out a small roadmap and checks the field the
// renderer now reads instead of measuring itself.

import type { NowlineFile } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { estimateTextWidth as estimateTextWidthFromIndex } from '../src/index.js';
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
import { parseAndResolve } from './helpers.js';
import { EXAMPLE_1, EXAMPLE_11 } from './wave-examples.js';

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

describe('wave strip label widths', () => {
    it('carry the bold 10 px width of each strip label', async () => {
        const waves = wavesOf(await lay(EXAMPLE_1));
        expect(waves.map((w) => w.strip.label)).toEqual(['Discover', 'Build', 'Launch']);
        for (const w of waves) {
            expect(w.strip.labelWidth).toBe(
                estimateTextWidth(w.strip.label ?? '', 10) * MARKER_BOLD_WIDTH_FACTOR,
            );
        }
        // 'Discover': 8 chars at 0.58 em of 10 px, widened 5 % for bold.
        expect(waves[0].strip.labelWidth).toBeCloseTo(48.72, 10);
    });

    it('omit the width when the strip has no label', async () => {
        const model = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two"

swimlane a
  item a1 duration:2w wave:w1
`);
        const empty = wavesOf(model)[1];
        expect(empty.strip.labelKind).toBe('none');
        expect('labelWidth' in empty.strip).toBe(false);
    });

    it('carry the regular 10 px width of a gap floor label', async () => {
        const model = await lay(EXAMPLE_11.replace('date:2026-02-02', 'date:2026-02-16'));
        const gap = wavesOf(model)[1].strip.gapLabel;
        expect(gap?.text).toBe('fy-budget');
        expect(gap?.width).toBe(estimateTextWidth('fy-budget', 10));
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
