import { describe, expect, it } from 'vitest';
import { cappedPixelsPerDay, layoutRoadmap, MIN_PIXELS_PER_DAY } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

// `LayoutOptions.width` is a best-effort maximum canvas width (specs/rendering.md
// § Canvas width). Unset means content-fit; a cap only ever shrinks
// pixels-per-day, never below `MIN_PIXELS_PER_DAY`.

// 26 weeks at the 40 px/week default is ~1040 px of timeline. Short titles
// on long bars keep every caption inside its bar, so nothing spills past
// the timeline and the cap is the whole story.
const WIDE = `nowline v1

roadmap r "Wide" start:2026-01-05 scale:1w

swimlane a "A"
  item one "One" duration:8w
  item two "Two" duration:8w
  item three "Three" duration:10w
`;

// Ten years at the yearly default (~1.2 px per working day).
const DECADE = `nowline v1

roadmap r "Decade" start:2026-01-05 scale:1y

swimlane a "A"
  item one "One" duration:10y
`;

describe('LayoutOptions.width', () => {
    it('leaves the content-fit layout untouched when unset or wider than the content', async () => {
        const { file, resolved } = await parseAndResolve(WIDE);
        const natural = layoutRoadmap(file, resolved, { theme: 'light' });
        const roomy = layoutRoadmap(file, resolved, { theme: 'light', width: natural.width + 500 });
        expect(roomy).toEqual(natural);
    });

    it('caps the canvas by shrinking pixels-per-day', async () => {
        const { file, resolved } = await parseAndResolve(WIDE);
        const natural = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(natural.width).toBeGreaterThan(900);

        const capped = layoutRoadmap(file, resolved, { theme: 'light', width: 700 });
        expect(capped.width).toBeLessThanOrEqual(700);
        expect(capped.width).toBeGreaterThan(690);
        expect(capped.timeline.pixelsPerDay).toBeLessThan(natural.timeline.pixelsPerDay);
        // The date window is unchanged; only its pixel density moves.
        expect(capped.timeline.startDate).toEqual(natural.timeline.startDate);
        expect(capped.timeline.endDate).toEqual(natural.timeline.endDate);
    });

    it('stops shrinking at the pixels-per-day floor and lets the canvas overflow', async () => {
        const { file, resolved } = await parseAndResolve(DECADE);
        const natural = layoutRoadmap(file, resolved, { theme: 'light' });
        expect(natural.timeline.pixelsPerDay).toBeGreaterThan(MIN_PIXELS_PER_DAY);

        const capped = layoutRoadmap(file, resolved, { theme: 'light', width: 320 });
        expect(capped.timeline.pixelsPerDay).toBe(MIN_PIXELS_PER_DAY);
        expect(capped.width).toBeGreaterThan(320);
        expect(capped.width).toBeLessThan(natural.width);
    });
});

describe('cappedPixelsPerDay', () => {
    const base = { naturalPixelsPerDay: 8, dayCount: 100, chromeWidth: 40 };

    it('returns the natural density with no cap', () => {
        expect(cappedPixelsPerDay({ ...base, maxWidth: undefined })).toBe(8);
    });

    it('returns the natural density when the content already fits', () => {
        expect(cappedPixelsPerDay({ ...base, maxWidth: 840 })).toBe(8);
        expect(cappedPixelsPerDay({ ...base, maxWidth: 5000 })).toBe(8);
    });

    it('shrinks the density so chrome plus timeline meets the cap', () => {
        expect(cappedPixelsPerDay({ ...base, maxWidth: 440 })).toBe(4);
    });

    it('clamps at the floor', () => {
        expect(cappedPixelsPerDay({ ...base, maxWidth: 60 })).toBe(MIN_PIXELS_PER_DAY);
    });

    it('never raises a natural density that is already below the floor', () => {
        const sparse = { naturalPixelsPerDay: 0.5, dayCount: 3000, chromeWidth: 40 };
        expect(cappedPixelsPerDay({ ...sparse, maxWidth: 320 })).toBe(0.5);
    });
});
