// The lane frame tab's title width estimate. A flat px-per-char estimate
// let "Headcount" paint over the inner gap and into its capacity badge
// (`tests/capacity-lanes`), while narrow titles reserved a wide hole.

import { describe, expect, it } from 'vitest';
import { estimateFrameTabTitleWidth, FRAME_TAB_INNER_GAP_PX } from '../src/index.js';
import { layoutRoadmap } from '../src/layout.js';
import { parseAndResolve } from './helpers.js';

// Painted widths (px) of 12px 600-weight titles in Chromium, with
// system-ui resolving to Inter: `measureText` on a canvas whose font is
// `600 12px system-ui, ...`.
const PAINTED_WIDTH_PX: Record<string, number> = {
    Headcount: 63.7,
    'Sprint pts': 56.1,
    Hours: 34.9,
    Funded: 43.4,
    Ops: 23.3,
    PMO: 28,
    Web: 26.2,
    Backend: 50.3,
    'Half-time': 54.2,
    'Default multiplier': 99.5,
    'Inline literal': 66.6,
};

describe('frame tab title width', () => {
    it.each(Object.entries(PAINTED_WIDTH_PX))(
        'estimates "%s" close to its painted width',
        (title, painted) => {
            const estimate = estimateFrameTabTitleWidth(title);
            // Never eats more than a sixth of the inner gap, never
            // reserves more than half of it again as extra air.
            expect(estimate - painted).toBeGreaterThanOrEqual(-FRAME_TAB_INNER_GAP_PX / 6);
            expect(estimate - painted).toBeLessThanOrEqual(FRAME_TAB_INNER_GAP_PX / 2);
        },
    );

    it('keeps a visible gap between "Headcount" and its capacity badge', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

style fte
  capacity-icon: person

roadmap r "R" start:2026-01-05

swimlane fte-lane "Headcount" capacity:6 style:fte
  item h1 "Hire" duration:4w
`);
        const tab = layoutRoadmap(file, resolved, {}).swimlanes[0].tab;
        expect(tab).toBeDefined();
        const titleRightX = (tab?.titleX ?? 0) + PAINTED_WIDTH_PX.Headcount;
        expect((tab?.badgeX ?? 0) - titleRightX).toBeGreaterThanOrEqual(FRAME_TAB_INNER_GAP_PX - 1);
    });
});
