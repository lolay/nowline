// Caption geometry helpers for wrapped item titles. The numbers asserted
// here are the contract the renderer paints against (title line pitch,
// meta baseline, bar growth), so they are pinned literally rather than
// recomputed from the constants.

import { describe, expect, it } from 'vitest';
import {
    computeTitleBarExtra,
    ITEM_CAPTION_TITLE_LINE_HEIGHT_PX,
    ITEM_CAPTION_TITLE_MAX_LINES,
    ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX,
    itemBeforeGlyphInsideLeftX,
    itemCaptionInsetX,
    itemCaptionLastBaselineOffset,
    itemCaptionMetaBaselineOffset,
    itemTitleFirstLineRightReservePx,
} from '../src/item-bar-geometry.js';

describe('wrapped-title caption constants', () => {
    it('pins the title line pitch and the line cap', () => {
        expect(ITEM_CAPTION_TITLE_LINE_HEIGHT_PX).toBe(16);
        expect(ITEM_CAPTION_TITLE_MAX_LINES).toBe(2);
    });
});

describe('itemCaptionMetaBaselineOffset', () => {
    it('is the classic 38px for a single title line', () => {
        expect(itemCaptionMetaBaselineOffset(1)).toBe(38);
    });

    it('drops by one title line pitch per extra title line', () => {
        expect(itemCaptionMetaBaselineOffset(2)).toBe(54);
        expect(itemCaptionMetaBaselineOffset(3)).toBe(70);
    });

    it('treats a degenerate line count as one line', () => {
        expect(itemCaptionMetaBaselineOffset(0)).toBe(38);
    });
});

describe('itemCaptionLastBaselineOffset', () => {
    it('is the meta baseline when the item has a meta line', () => {
        expect(itemCaptionLastBaselineOffset(1, true)).toBe(38);
        expect(itemCaptionLastBaselineOffset(2, true)).toBe(54);
    });

    it('is the last title baseline when there is no meta line', () => {
        expect(itemCaptionLastBaselineOffset(1, false)).toBe(20);
        expect(itemCaptionLastBaselineOffset(2, false)).toBe(36);
    });
});

describe('computeTitleBarExtra', () => {
    it('does not grow the bar for a single title line, with or without meta', () => {
        expect(computeTitleBarExtra(1, true)).toBe(0);
        expect(computeTitleBarExtra(1, false)).toBe(0);
    });

    it('does not grow the bar for two title lines with no meta (line 2 at baseline 36)', () => {
        expect(computeTitleBarExtra(2, false)).toBe(0);
    });

    it('grows the bar by one line pitch for two title lines over a meta line', () => {
        expect(computeTitleBarExtra(2, true)).toBe(16);
    });

    it('never goes negative', () => {
        expect(computeTitleBarExtra(0, false)).toBe(0);
    });
});

describe('itemCaptionInsetX', () => {
    it('is 12px without a link icon', () => {
        expect(itemCaptionInsetX(false)).toBe(12);
    });

    it('is 24px with a link icon (6 + 14 tile + 4 gap, past the 12px inset)', () => {
        expect(itemCaptionInsetX(true)).toBe(24);
    });
});

describe('itemBeforeGlyphInsideLeftX', () => {
    // The one formula behind the `before:` glyph's placement and the
    // title first-line clearance.
    it('sits 4px left of the status dot when there are no footnotes', () => {
        // dot left edge = 100 - 12 - 5 = 83; glyph right edge 79; left edge 79 - 12.
        expect(itemBeforeGlyphInsideLeftX(100, 0)).toBe(67);
    });

    it('sits 4px left of the leftmost footnote anchor when there are footnotes', () => {
        // rightmost footnote anchors at 100 - 22 = 78; glyph right edge 74; left 62.
        expect(itemBeforeGlyphInsideLeftX(100, 1)).toBe(62);
        // Each extra footnote shifts it one 8px step further left.
        expect(itemBeforeGlyphInsideLeftX(100, 3)).toBe(46);
    });

    it('measures from a right edge of 0 as a negative inside offset', () => {
        expect(itemBeforeGlyphInsideLeftX(0, 0)).toBe(-33);
        expect(itemBeforeGlyphInsideLeftX(0, 1)).toBe(-38);
    });
});

describe('itemTitleFirstLineRightReservePx', () => {
    const digitW = 1 * ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX * 0.58; // one "1" at size 10 = 5.8px

    it('measures footnote digits at font size 10, the size the renderer paints them', () => {
        expect(ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX).toBe(10);
    });

    it('is 21px with only the status dot: 17px to its left edge plus the 4px gap', () => {
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: [],
                hasBeforeGlyph: false,
            }),
        ).toBe(21);
    });

    it('widens by the footnote digit when the item has one footnote', () => {
        // Digit right end at -22, left edge at -22 - 5.8, plus the 4px gap.
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: ['1'],
                hasBeforeGlyph: false,
            }),
        ).toBeCloseTo(22 + digitW + 4, 10);
    });

    it('walks one 8px step further left per extra footnote', () => {
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: ['1', '2'],
                hasBeforeGlyph: false,
            }),
        ).toBeCloseTo(22 + 8 + digitW + 4, 10);
    });

    it('measures a wide late digit, not just the leftmost one', () => {
        // Footnotes 9 and 100: the 3-digit label's left edge (-22 - 17.4) is
        // further left than the 1-digit label's (-22 - 8 - 5.8).
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: ['9', '100'],
                hasBeforeGlyph: false,
            }),
        ).toBeCloseTo(22 + 3 * digitW + 4, 10);
    });

    it('widens to the `before:` glyph left edge: 33px past the right edge plus the gap', () => {
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: [],
                hasBeforeGlyph: true,
            }),
        ).toBe(37);
    });

    it('puts the `before:` glyph left of the footnotes when both are present', () => {
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: ['1'],
                hasBeforeGlyph: true,
            }),
        ).toBe(42);
    });

    it('falls back to the plain 12px right inset on a bar too narrow to host the dot', () => {
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 16,
                footnoteLabels: [],
                hasBeforeGlyph: false,
            }),
        ).toBe(12);
    });

    it('ignores decorations that spill out of a narrow bar', () => {
        // 20px: the dot fits inside (>= 17) but footnotes (>= 23) spill.
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 20,
                footnoteLabels: ['1'],
                hasBeforeGlyph: false,
            }),
        ).toBe(21);
        // 30px: footnotes fit, the `before:` glyph (>= 40) spills.
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 30,
                footnoteLabels: ['1'],
                hasBeforeGlyph: true,
            }),
        ).toBeCloseTo(22 + digitW + 4, 10);
        // 39px: still spilled; 40px: the glyph is inside and widens the reserve.
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 39,
                footnoteLabels: [],
                hasBeforeGlyph: true,
            }),
        ).toBe(21);
        expect(
            itemTitleFirstLineRightReservePx({
                barWidth: 40,
                footnoteLabels: [],
                hasBeforeGlyph: true,
            }),
        ).toBe(37);
    });
});
