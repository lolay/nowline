// `default roadmap header-height:<bucket>` sizes the timeline tick panel
// (specs/rendering.md § Timeline Scale): the top panel and the mirrored
// bottom one share the height, `md` is today's 24 px, and `none` drops
// every tick panel whatever `timeline-position` says.

import type { NowlineFile } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { type LayoutOptions, layoutRoadmap } from '../src/layout.js';
import {
    HEADER_HEIGHT_PX,
    TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX,
    TIMELINE_TICK_PANEL_HEIGHT_PX,
    timelineTickLabelBaselineOffsetPx,
    WAVE_STRIP_HEIGHT_PX,
} from '../src/themes/shared.js';
import type { PositionedRoadmap } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

type Bucket = keyof typeof HEADER_HEIGHT_PX;
const BUCKETS: Bucket[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl'];

const today = new Date(Date.UTC(2026, 0, 14));

function errorsOf(file: NowlineFile): string[] {
    return (file.$document?.diagnostics ?? [])
        .filter((d) => d.severity === 1)
        .map((d) => d.message);
}

function source(defaults: string, waves = false): string {
    const config = defaults ? `config\n\ndefault roadmap ${defaults}\n\n` : '';
    return `nowline v1

${config}roadmap r "R" start:2026-01-05 scale:1w
${waves ? '\nwave w1 "One"\n' : ''}
anchor kickoff date:2026-01-12

swimlane a "A"
  item a1 duration:2w${waves ? ' wave:w1' : ''}
  item a2 duration:1w
`;
}

async function lay(src: string, options: LayoutOptions = { today }): Promise<PositionedRoadmap> {
    const { file, resolved } = await parseAndResolve(src);
    expect(errorsOf(file)).toEqual([]);
    return layoutRoadmap(file, resolved, options);
}

describe('header-height tick panel sizing', () => {
    it('maps md to the historical 24 px panel and 15 px label baseline', () => {
        expect(HEADER_HEIGHT_PX.md).toBe(24);
        expect(TIMELINE_TICK_PANEL_HEIGHT_PX).toBe(24);
        expect(TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX).toBe(15);
        expect(timelineTickLabelBaselineOffsetPx(24)).toBe(15);
    });

    it('grows strictly from none to xl', () => {
        const heights = BUCKETS.map((b) => HEADER_HEIGHT_PX[b]);
        expect(heights[0]).toBe(0);
        for (let i = 1; i < heights.length; i++) {
            expect(heights[i]).toBeGreaterThan(heights[i - 1]);
        }
    });

    it('lays out identically with no key and with header-height:md', async () => {
        const plain = await lay(source(''));
        const md = await lay(source('header-height:md'));
        expect(md).toEqual(plain);
    });

    it.each(BUCKETS)('header-height:%s sizes the top panel and shifts the chart', async (b) => {
        const md = await lay(source('header-height:md'));
        const model = await lay(source(`header-height:${b}`));
        const delta = HEADER_HEIGHT_PX[b] - HEADER_HEIGHT_PX.md;
        const t = model.timeline;
        expect(t.tickPanelHeight).toBe(HEADER_HEIGHT_PX[b]);
        expect(t.tickPanelY).toBe(md.timeline.tickPanelY);
        expect(t.markerRow.y).toBe(md.timeline.markerRow.y + delta);
        expect(model.chartBox.y).toBe(md.chartBox.y + delta);
        expect(model.anchors[0].center.y).toBe(md.anchors[0].center.y + delta);
        expect(model.height).toBe(md.height + delta);
        expect(t.bottomTickPanelY).toBeUndefined();
        // The now-line still starts at the top of the (possibly empty) panel.
        expect(model.nowline?.topY).toBe(t.tickPanelY);
    });

    it.each(BUCKETS)(
        'header-height:%s with timeline-position:both sizes both panels',
        async (b) => {
            const model = await lay(source(`header-height:${b} timeline-position:both`));
            const t = model.timeline;
            expect(t.tickPanelHeight).toBe(HEADER_HEIGHT_PX[b]);
            if (b === 'none') {
                expect(t.bottomTickPanelY).toBeUndefined();
                expect(t.bottomTickPanelHeight).toBeUndefined();
            } else {
                expect(t.bottomTickPanelHeight).toBe(HEADER_HEIGHT_PX[b]);
                expect(model.nowline?.bottomY).toBe(
                    (t.bottomTickPanelY ?? 0) + (t.bottomTickPanelHeight ?? 0),
                );
            }
        },
    );

    it.each(BUCKETS)(
        'header-height:%s with timeline-position:bottom sizes the bottom panel',
        async (b) => {
            const model = await lay(source(`header-height:${b} timeline-position:bottom`));
            const t = model.timeline;
            expect(t.tickPanelHeight).toBe(0);
            if (b === 'none') {
                expect(t.bottomTickPanelY).toBeUndefined();
            } else {
                expect(t.bottomTickPanelHeight).toBe(HEADER_HEIGHT_PX[b]);
            }
        },
    );

    it('header-height:none with timeline-position:both matches timeline-position:bottom minus its strip', async () => {
        const none = await lay(source('header-height:none timeline-position:both'));
        const bottom = await lay(source('timeline-position:bottom'));
        // Same top geometry (no top panel either way); only the bottom
        // strip and its 8 px gap go away.
        expect(none.timeline.tickPanelY).toBe(bottom.timeline.tickPanelY);
        expect(none.chartBox.y).toBe(bottom.chartBox.y);
        expect(none.height).toBe(bottom.height - 8 - HEADER_HEIGHT_PX.md);
        // With no bottom strip to thread through, the now-line stops at
        // the last swimlane, as it does for a top-only timeline.
        const topOnly = await lay(source('header-height:none'));
        expect(none.nowline?.bottomY).toBe(topOnly.nowline?.bottomY);
    });

    it.each(BUCKETS)(
        'header-height:%s keeps the wave strip directly under the tick panel',
        async (b) => {
            const model = await lay(source(`header-height:${b}`, true));
            const t = model.timeline;
            expect(t.waveStrip).toEqual({
                y: t.tickPanelY + HEADER_HEIGHT_PX[b],
                height: WAVE_STRIP_HEIGHT_PX,
            });
        },
    );
});
