// The lane frame tab's owner-name width estimate. A flat px-per-char
// estimate let wide names ("Sam Chen", "Mobile Team") paint past their
// reservation, into the capacity badge or the tab's right inset.

import { describe, expect, it } from 'vitest';
import { estimateFrameTabOwnerWidth, FRAME_TAB_INNER_GAP_PX } from '../src/index.js';
import { layoutRoadmap } from '../src/layout.js';
import { parseAndResolve } from './helpers.js';

// Painted widths (px) of 10px regular owner names in Chromium, with
// system-ui resolving to Inter: `measureText` on a canvas whose font is
// `400 10px system-ui, ...`.
const PAINTED_WIDTH_PX: Record<string, number> = {
    'Sam Chen': 48.6,
    Sam: 20.8,
    MM: 18.1,
    'Mobile Team': 60.6,
    'Platform Team': 68.3,
    Platform: 39.5,
    Data: 21.8,
    'Jennifer Wu': 57.4,
    'William Murphy': 73.1,
};

describe('frame tab owner width', () => {
    it.each(Object.entries(PAINTED_WIDTH_PX))(
        'estimates "%s" close to its painted width',
        (owner, painted) => {
            const estimate = estimateFrameTabOwnerWidth(owner);
            // Never eats more than a third of the inner gap, never
            // reserves more than half of it again as extra air.
            expect(estimate - painted).toBeGreaterThanOrEqual(-FRAME_TAB_INNER_GAP_PX / 3);
            expect(estimate - painted).toBeLessThanOrEqual(FRAME_TAB_INNER_GAP_PX / 2);
        },
    );

    it('keeps a visible gap between "Sam Chen" and the capacity badge', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05

person sam "Sam Chen"

swimlane l "Lane" owner:sam capacity:4
  item a "A" duration:4w
`);
        const tab = layoutRoadmap(file, resolved, {}).swimlanes[0].tab;
        expect(tab).toBeDefined();
        const ownerRightX = (tab?.ownerTextX ?? 0) + PAINTED_WIDTH_PX['Sam Chen'];
        expect((tab?.badgeX ?? 0) - ownerRightX).toBeGreaterThanOrEqual(
            FRAME_TAB_INNER_GAP_PX - FRAME_TAB_INNER_GAP_PX / 3,
        );
    });
});
