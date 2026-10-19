// Values layout measures for the SVG renderer (R5 m3), so the renderer only
// draws: each test lays out a small roadmap and checks the field the
// renderer now reads instead of measuring itself.

import type { NowlineFile } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { estimateTextWidth as estimateTextWidthFromIndex } from '../src/index.js';
import { type LayoutOptions, layoutRoadmap } from '../src/layout.js';
import { MARKER_BOLD_WIDTH_FACTOR } from '../src/nodes/marker-geometry.js';
import { estimateTextWidth } from '../src/text-measure.js';
import type { PositionedRoadmap, PositionedWave } from '../src/types.js';
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
