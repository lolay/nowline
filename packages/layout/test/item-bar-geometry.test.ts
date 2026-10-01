// Caption geometry helpers for wrapped item titles. The numbers asserted
// here are the contract the renderer paints against (title line pitch,
// meta baseline, bar growth), so they are pinned literally rather than
// recomputed from the constants.

import { describe, expect, it } from 'vitest';
import {
    computeTitleBarExtra,
    ITEM_CAPTION_TITLE_LINE_HEIGHT_PX,
    ITEM_CAPTION_TITLE_MAX_LINES,
    itemCaptionInsetX,
    itemCaptionLastBaselineOffset,
    itemCaptionMetaBaselineOffset,
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
