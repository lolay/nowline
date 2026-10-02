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
    inlineDateGlyphSpills,
    itemAfterGlyphInsideLeftX,
    itemBeforeGlyphInsideLeftX,
    itemCaptionInsetX,
    itemCaptionLastBaselineOffset,
    itemCaptionMetaBaselineOffset,
    itemTitleFirstLineRightReservePx,
    MIN_BAR_WIDTH_FOR_INLINE_DATE_PX,
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

    describe('with an in-bar `after:` inline-date glyph', () => {
        // The glyph is 12px wide. Without a link tile it spans 6..18, so the
        // caption starts 4px past that at 22. Beside a link tile it spans
        // 24..36 (6 + 14 tile + 4 gap), so the caption starts at 40.
        it('is 22px without a link icon (glyph right edge 18 + 4px gap)', () => {
            expect(itemCaptionInsetX(false, { barWidth: 148 })).toBe(22);
        });

        it('is 40px with a link icon (glyph right edge 36 + 4px gap)', () => {
            expect(itemCaptionInsetX(true, { barWidth: 148 })).toBe(40);
        });

        it('is the four values 12, 24, 22 and 40 across the combinations', () => {
            const bar = { barWidth: 148 };
            expect([
                itemCaptionInsetX(false),
                itemCaptionInsetX(true),
                itemCaptionInsetX(false, bar),
                itemCaptionInsetX(true, bar),
            ]).toEqual([12, 24, 22, 40]);
        });

        it('adds no indent when the glyph spills out of a bar narrower than the threshold', () => {
            // MIN_BAR_WIDTH_FOR_INLINE_DATE_PX = 6 + 12 + 4 + 12 + 6 = 40.
            expect(MIN_BAR_WIDTH_FOR_INLINE_DATE_PX).toBe(40);
            expect(itemCaptionInsetX(false, { barWidth: 39.9 })).toBe(12);
            expect(itemCaptionInsetX(true, { barWidth: 39.9 })).toBe(24);
            expect(itemCaptionInsetX(false, { barWidth: 28 })).toBe(12);
            expect(itemCaptionInsetX(true, { barWidth: 28 })).toBe(24);
        });

        it('indents at exactly the threshold width, where the glyph is still in the bar', () => {
            expect(itemCaptionInsetX(false, { barWidth: 40 })).toBe(22);
            expect(itemCaptionInsetX(true, { barWidth: 40 })).toBe(40);
        });

        it('always clears the glyph by the 4px spill gap, whatever the link state', () => {
            for (const hasLink of [false, true]) {
                const glyphRight = itemAfterGlyphInsideLeftX(0, hasLink) + 12;
                expect(itemCaptionInsetX(hasLink, { barWidth: 148 })).toBe(glyphRight + 4);
            }
        });
    });
});

describe('itemAfterGlyphInsideLeftX', () => {
    // The one formula behind the `after:` glyph's placement and the
    // caption's left inset.
    it('sits at the leftmost slot, 6px in, with no link icon', () => {
        expect(itemAfterGlyphInsideLeftX(100, false)).toBe(106);
    });

    it('sits 4px right of the link tile (6 + 14 + 4 = 24px in) with a link icon', () => {
        expect(itemAfterGlyphInsideLeftX(100, true)).toBe(124);
    });

    it('measures from a left edge of 0 as an exact inside offset', () => {
        expect(itemAfterGlyphInsideLeftX(0, false)).toBe(6);
        expect(itemAfterGlyphInsideLeftX(0, true)).toBe(24);
    });
});

describe('inlineDateGlyphSpills', () => {
    it('spills below the 40px threshold and not at or above it', () => {
        expect(inlineDateGlyphSpills(39.99)).toBe(true);
        expect(inlineDateGlyphSpills(40)).toBe(false);
        expect(inlineDateGlyphSpills(148)).toBe(false);
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
