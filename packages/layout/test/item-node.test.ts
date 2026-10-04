// ItemNode unit tests — assert the new Renderable produces the same
// box geometry and `textSpills` decision the legacy `sequenceItem`
// arithmetic produces. m2.5c wires this into the production pipeline
// in a follow-up; the tests serve as the byte-stable contract.

import { describe, expect, it } from 'vitest';
import { defaultRowBand } from '../src/band-scale.js';
import { itemTitleFirstLineRightReservePx } from '../src/item-bar-geometry.js';
import {
    fitItemCaption,
    ItemNode,
    resolveCaptionTitleLines,
    titleBreakLines,
} from '../src/nodes/item-node.js';
import { TimeScale } from '../src/time-scale.js';
import type { ResolvedStyle } from '../src/types.js';

const FAKE_TIME = new TimeScale({
    domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 31))],
    range: [0, 300],
});

const FAKE_STYLE = {} as ResolvedStyle;

function makeCtx() {
    return {
        time: FAKE_TIME,
        bands: defaultRowBand(),
        style: FAKE_STYLE,
    };
}

describe('ItemNode', () => {
    it('reports the time-driven width and band-driven height in measure', () => {
        const node = new ItemNode({
            id: 'a',
            title: 'Research',
            logicalLeftX: 0,
            logicalRightX: 120,
        });
        const intrinsic = node.measure(makeCtx());
        expect(intrinsic.width).toBe(120);
        expect(intrinsic.height).toBe(56);
    });

    it('insets the visible box by ITEM_INSET_PX on each side', () => {
        const node = new ItemNode({
            id: 'a',
            title: 'Research',
            logicalLeftX: 0,
            logicalRightX: 120,
        });
        const placed = node.place({ x: 0, y: 100 }, makeCtx());
        expect(placed.box.x).toBe(6);
        expect(placed.box.y).toBe(100);
        expect(placed.box.width).toBe(108); // 120 - 2*6
        expect(placed.box.height).toBe(56);
    });

    it('keeps text inside the bar when title + meta fit the inner-padded width', () => {
        const node = new ItemNode({
            id: 'a',
            title: 'OK',
            metaText: '1w',
            logicalLeftX: 0,
            logicalRightX: 240,
        });
        const placed = node.place({ x: 0, y: 0 }, makeCtx());
        expect(placed.textSpills).toBe(false);
        expect(placed.textX).toBe(6 + 12); // boxX + TEXT_INSET_PX
    });

    it('spills text past the bar when the title exceeds the inner-padded width', () => {
        const node = new ItemNode({
            id: 'a',
            title: 'A long title that will not fit inside the available bar',
            metaText: '1w',
            logicalLeftX: 0,
            logicalRightX: 80,
        });
        const placed = node.place({ x: 0, y: 0 }, makeCtx());
        expect(placed.textSpills).toBe(true);
        // textX past the bar's right edge plus a small visual gap.
        expect(placed.textX).toBeGreaterThan(placed.box.x + placed.box.width);
    });

    it('matches the legacy sequenceItem textSpills decision (innerWidth = visualWidth - 24)', () => {
        // Legacy arithmetic: textSpills = title|meta width > visualWidth - 24.
        const cases = [
            { title: 'Design', metaText: '2w - 50% remaining', logicalRight: 240, expected: false },
            { title: 'Design', metaText: '2w - 50% remaining', logicalRight: 60, expected: true },
            { title: 'Build', metaText: undefined, logicalRight: 100, expected: false },
        ];
        for (const c of cases) {
            const node = new ItemNode({
                id: 'a',
                title: c.title,
                metaText: c.metaText,
                logicalLeftX: 0,
                logicalRightX: c.logicalRight,
            });
            const placed = node.place({ x: 0, y: 0 }, makeCtx());
            expect(placed.textSpills, `case: ${JSON.stringify(c)}`).toBe(c.expected);
        }
    });

    describe('title word-wrap', () => {
        // Logical width 160 -> visual 148 -> inner width 148 - 12 - 12 = 124.
        // "Technology Selection" estimates at 150.8px (> 124), but wrapped it
        // is "Technology" (75.4px) over "Selection" (67.9px).
        function place(input: {
            title: string;
            metaText?: string;
            metaTrailingWidth?: number;
            hasLinkIcon?: boolean;
            logicalRightX?: number;
        }) {
            const node = new ItemNode({
                id: 'a',
                logicalLeftX: 0,
                logicalRightX: 160,
                ...input,
            });
            return node.place({ x: 0, y: 0 }, makeCtx());
        }

        it('wraps "Technology Selection" inside a 160px logical bar instead of spilling', () => {
            const placed = place({ title: 'Technology Selection', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Technology', 'Selection']);
            expect(placed.textX).toBe(6 + 12); // boxX + caption inset, not past the bar
            expect(placed.box.height).toBe(56); // ItemNode leaves bar growth to layout
        });

        it('wraps without a meta line too', () => {
            const placed = place({ title: 'Technology Selection' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Technology', 'Selection']);
        });

        it('keeps a title that fits on one line as a single line', () => {
            const placed = place({ title: 'Research', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Research']);
        });

        it('reports a single line for the spilled caption', () => {
            const placed = place({
                title: 'A long title that will not fit inside',
                logicalRightX: 80,
            });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['A long title that will not fit inside']);
        });

        it('spills a single word that is too long to fit, never breaking mid-word', () => {
            const placed = place({ title: 'Internationalization' }); // 20 chars = 150.8px > 124
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['Internationalization']);
            expect(placed.textX).toBeGreaterThan(placed.box.x + placed.box.width);
        });

        it('spills when only one of the wrapped lines is too long', () => {
            // Greedy wrap gives ["Go", "Internationalization"]; line 2 is 150.8px.
            const placed = place({ title: 'Go Internationalization' });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['Go Internationalization']);
        });

        it('spills a title that needs three lines', () => {
            // Greedy at 124px: "Migrate legacy" / "billing service" / "to new platform".
            const title = 'Migrate legacy billing service to new platform';
            const placed = place({ title, metaText: '2w' });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual([title]);
        });

        it('spills when the meta line is too wide, even though the title would wrap', () => {
            const title = 'Technology Selection';
            // Control: the same title wraps when the meta line fits.
            expect(place({ title, metaText: '2w' }).textSpills).toBe(false);
            // 43 chars * 11 * 0.58 = 274.3px > 124px.
            const placed = place({
                title,
                metaText: '2w alice - 50% remaining and some more text',
            });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual([title]);
        });

        it('spills when the trailing capacity suffix pushes the meta line past the width', () => {
            const title = 'Technology Selection';
            const placed = place({ title, metaText: '2w', metaTrailingWidth: 200 });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual([title]);
        });

        it('narrows the wrap width by the link-icon column', () => {
            // "Internationalize" is 16 chars = 120.6px: inside the 124px inner
            // width, but outside the 112px inner width a link icon leaves.
            const title = 'Plan Internationalize';
            const plain = place({ title });
            expect(plain.textSpills).toBe(false);
            expect(plain.titleLines).toEqual(['Plan', 'Internationalize']);

            const withIcon = place({ title, hasLinkIcon: true });
            expect(withIcon.textSpills).toBe(true);
            expect(withIcon.titleLines).toEqual([title]);
        });

        it('indents a wrapped caption past the link icon', () => {
            const placed = place({
                title: 'Technology Selection',
                hasLinkIcon: true,
                logicalRightX: 190, // visual 178 -> inner 142 with the icon (< 150.8px)
            });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Technology', 'Selection']);
            expect(placed.textX).toBe(6 + 24);
        });

        it('treats a title that overflows only through repeated spaces as the legacy spill', () => {
            // The raw string estimates at 264px, but it normalizes to one line
            // ("Go now"). That is not a wrap, so it spills exactly as before.
            const placed = place({ title: `Go${' '.repeat(30)}now` });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual([`Go${' '.repeat(30)}now`]);
        });
    });

    describe('first-line clearance of the top-right decorations', () => {
        // Logical width 160 -> visual 148 -> inner width 124. The status dot
        // is always there, so the first line gets 148 - 12 - 21 = 115px; the
        // meta line and later title lines keep the full 124px.
        function place(input: {
            title: string;
            metaText?: string;
            hasLinkIcon?: boolean;
            titleFirstLineRightReservePx?: number;
        }) {
            const node = new ItemNode({
                id: 'a',
                logicalLeftX: 0,
                logicalRightX: 160,
                ...input,
            });
            return node.place({ x: 0, y: 0 }, makeCtx());
        }

        it('wraps a title that fits innerWidth but not innerWidth - 9', () => {
            // "Plan the rollout": 16 chars = 120.6px. Inside 124, outside 115.
            const placed = place({ title: 'Plan the rollout', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Plan the', 'rollout']);
        });

        it('spills a single word that fits innerWidth but not the first-line width', () => {
            // "Internationalize": 16 chars = 120.6px, the status dot would sit under it.
            const placed = place({ title: 'Internationalize', metaText: '2w' });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['Internationalize']);
        });

        it('still keeps a title that fits the first-line width on one line', () => {
            // "Ship the thing": 14 chars = 105.6px < 115.
            const placed = place({ title: 'Ship the thing', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Ship the thing']);
        });

        it('widens the reserve for footnotes', () => {
            const title = 'Ship the thing'; // 105.6px
            const withFootnote = itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: ['1'],
                hasBeforeGlyph: false,
            });
            // Control: the dot-only reserve keeps it on one line.
            expect(place({ title }).titleLines).toEqual([title]);
            // Footnote digit: first line is 148 - 12 - 31.8 = 104.2px < 105.6px.
            const placed = place({ title, titleFirstLineRightReservePx: withFootnote });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Ship the', 'thing']);
        });

        it('widens the reserve for a `before:` glyph', () => {
            const title = 'Ship the thing'; // 105.6px
            const withGlyph = itemTitleFirstLineRightReservePx({
                barWidth: 148,
                footnoteLabels: [],
                hasBeforeGlyph: true,
            });
            // First line is 148 - 12 - 37 = 99px < 105.6px.
            const placed = place({ title, titleFirstLineRightReservePx: withGlyph });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Ship the', 'thing']);
        });

        it('lets a long second line use the full inner width', () => {
            // Line 2 "Internationalize" is 120.6px: past the 115px first-line width,
            // inside the 124px inner width. Only line 1 is clear of the dot.
            const placed = place({ title: 'Go Internationalize', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Go', 'Internationalize']);
        });

        it('keeps the meta line on the full inner width', () => {
            // 19 chars at 11px = 121.2px: past the 115px first-line width, inside
            // the 124px inner width. The meta line sits below the decorations.
            const placed = place({ title: 'OK', metaText: 'x'.repeat(19) });
            expect(placed.textSpills).toBe(false);
        });

        it('measures the first line from the link-icon indent', () => {
            // Logical 190 -> visual 178. With the 24px icon indent: inner width
            // 178 - 24 - 12 = 142, first-line width 178 - 24 - 21 = 133.
            // "Ship the new thing" (18 chars = 135.7px) fits 142 but not 133.
            const node = new ItemNode({
                id: 'a',
                title: 'Ship the new thing',
                logicalLeftX: 0,
                logicalRightX: 190,
                hasLinkIcon: true,
            });
            const placed = node.place({ x: 0, y: 0 }, makeCtx());
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Ship the new', 'thing']);
        });
    });

    describe('caption indent past an in-bar `after:` glyph', () => {
        // Logical width 160 -> visual 148. A plain bar leaves 124px of inner
        // width (inset 12) and a 115px first line. The `after:` glyph pushes
        // the caption in to 22px (40px beside a link tile), which narrows
        // both: inner 114 / first line 105 (no link), inner 96 / first line 87.
        function place(input: {
            title: string;
            metaText?: string;
            hasLinkIcon?: boolean;
            hasAfterGlyph?: boolean;
            logicalRightX?: number;
            titleFirstLineRightReservePx?: number;
        }) {
            const node = new ItemNode({
                id: 'a',
                logicalLeftX: 0,
                logicalRightX: 160,
                ...input,
            });
            return node.place({ x: 0, y: 0 }, makeCtx());
        }

        it('narrows the fit width: a title that fit one line now wraps', () => {
            // "Ship the thing" is 105.6px: inside the 115px first line, outside 105.
            expect(place({ title: 'Ship the thing', metaText: '2w' }).titleLines).toEqual([
                'Ship the thing',
            ]);
            const placed = place({
                title: 'Ship the thing',
                metaText: '2w',
                hasAfterGlyph: true,
            });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Ship the', 'thing']);
        });

        it('starts the caption at the glyph-cleared inset: 6 + 22 without a link', () => {
            const placed = place({ title: 'Ship it', hasAfterGlyph: true });
            expect(placed.textSpills).toBe(false);
            expect(placed.textX).toBe(6 + 22);
        });

        it('starts the caption at 6 + 40 beside a link tile', () => {
            const placed = place({ title: 'Ship it', hasAfterGlyph: true, hasLinkIcon: true });
            expect(placed.textSpills).toBe(false);
            expect(placed.textX).toBe(6 + 40);
        });

        it('narrows the fit width further beside a link tile', () => {
            // Logical 190 -> visual 178. "Ship the new one" is 120.6px: it fits the
            // link tile's 24px indent (first line 178 - 24 - 21 = 133px) but not
            // the 40px one the glyph adds (178 - 40 - 21 = 117px).
            const title = 'Ship the new one';
            const withLinkOnly = place({ title, hasLinkIcon: true, logicalRightX: 190 });
            expect(withLinkOnly.titleLines).toEqual([title]);
            const withBoth = place({
                title,
                hasLinkIcon: true,
                hasAfterGlyph: true,
                logicalRightX: 190,
            });
            expect(withBoth.textSpills).toBe(false);
            expect(withBoth.titleLines).toEqual(['Ship the new', 'one']);
        });

        it('narrows the inner width for every later line and the meta line too', () => {
            // Inner width 124 -> 114. Line 2 "Internationalize" is 120.6px: it fits
            // 124 and no longer fits 114, so the wrapped title spills.
            const base = place({ title: 'Go Internationalize', metaText: '2w' });
            expect(base.textSpills).toBe(false);
            const indented = place({
                title: 'Go Internationalize',
                metaText: '2w',
                hasAfterGlyph: true,
            });
            expect(indented.textSpills).toBe(true);
            // Meta line: 19 chars at 11px = 121.2px fits 124 but not 114.
            const meta = 'x'.repeat(19);
            expect(place({ title: 'OK', metaText: meta }).textSpills).toBe(false);
            expect(place({ title: 'OK', metaText: meta, hasAfterGlyph: true }).textSpills).toBe(
                true,
            );
        });

        it('adds no indent when the glyph spills out of a bar narrower than 40px', () => {
            // Logical 50 -> visual 38. The glyph spills, so the caption keeps
            // the plain 12px inset. A fixed 12px right reserve keeps the dot
            // out of the way of this tiny bar.
            const placed = place({
                title: 'A',
                hasAfterGlyph: true,
                logicalRightX: 50,
                titleFirstLineRightReservePx: 12,
            });
            expect(placed.box.width).toBe(38);
            expect(placed.textSpills).toBe(false);
            expect(placed.textX).toBe(6 + 12);
        });

        it('ignores the flag when no glyph is declared', () => {
            const placed = place({ title: 'Ship the thing', metaText: '2w', hasAfterGlyph: false });
            expect(placed.titleLines).toEqual(['Ship the thing']);
            expect(placed.textX).toBe(6 + 12);
        });
    });

    describe('explicit title line breaks', () => {
        // Logical width 160 -> visual 148 -> inner width 124, first-line width 115
        // (dot clearance). Logical 400 -> visual 388 -> inner 364, first-line 355.
        function place(input: {
            title: string;
            metaText?: string;
            hasLinkIcon?: boolean;
            logicalRightX?: number;
        }) {
            const node = new ItemNode({
                id: 'a',
                logicalLeftX: 0,
                logicalRightX: 160,
                ...input,
            });
            return node.place({ x: 0, y: 0 }, makeCtx());
        }

        it('keeps the break in a bar where the unbroken title fits on one line (explicit beats fit)', () => {
            // "Technology Selection" is 150.8px: it fits a 388px bar on one line.
            const control = place({
                title: 'Technology Selection',
                metaText: '2w',
                logicalRightX: 400,
            });
            expect(control.titleLines).toEqual(['Technology Selection']);
            const placed = place({
                title: 'Technology\nSelection',
                metaText: '2w',
                logicalRightX: 400,
            });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Technology', 'Selection']);
            expect(placed.textX).toBe(6 + 12);
        });

        it('keeps a three-line explicit title in-bar, past the two-line auto-wrap cap', () => {
            const placed = place({ title: 'Design\nBuild\nShip', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Design', 'Build', 'Ship']);
            // ItemNode leaves the bar growth (+32px with meta) to layout.
            expect(placed.box.height).toBe(56);
        });

        it('never auto-wraps an explicit line, even a long one that would wrap', () => {
            // Line 1 "Plan the rollout" is 120.6px: inside the 124px inner width but over
            // the 115px first-line width. Auto-wrap would split it; an explicit line
            // is authoritative, so the block spills as written instead.
            const placed = place({ title: 'Plan the rollout\nnext', metaText: '2w' });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['Plan the rollout', 'next']);
        });

        it('spills an explicit title as a multi-line block when a line is too wide', () => {
            // Line 2 "Internationalization" is 150.8px > 124px.
            const placed = place({ title: 'Go\nInternationalization', metaText: '2w' });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['Go', 'Internationalization']);
            expect(placed.textX).toBeGreaterThan(placed.box.x + placed.box.width);
        });

        it('holds line 1 to the first-line width and later lines to the full inner width', () => {
            // "Internationalize" is 120.6px: over the 115px first line, inside the 124px rest.
            expect(place({ title: 'Internationalize\nB' }).textSpills).toBe(true);
            const placed = place({ title: 'A\nInternationalize' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['A', 'Internationalize']);
        });

        it('spills when the meta line is wider than the inner width, even with short lines', () => {
            const placed = place({ title: 'A\nB', metaText: 'x'.repeat(30) });
            expect(placed.textSpills).toBe(true);
            expect(placed.titleLines).toEqual(['A', 'B']);
        });

        it('normalizes CRLF and a lone CR to line breaks', () => {
            expect(place({ title: 'A\r\nB' }).titleLines).toEqual(['A', 'B']);
            expect(place({ title: 'A\rB' }).titleLines).toEqual(['A', 'B']);
            expect(place({ title: 'A\r\nB\rC\nD' }).titleLines).toEqual(['A', 'B', 'C', 'D']);
        });

        it('trims each line and drops leading and trailing empty lines', () => {
            expect(place({ title: '\n\n  A  \n B \n\n' }).titleLines).toEqual(['A', 'B']);
        });

        it('keeps interior empty lines as blank lines', () => {
            const placed = place({ title: 'A\n\nB' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['A', '', 'B']);
        });

        it('treats a title with one line left after trimming as an ordinary title', () => {
            // "Plan\n": the stray break is gone, nothing is left to separate.
            expect(place({ title: 'Plan\n' }).titleLines).toEqual(['Plan']);
            // ...and an ordinary title still auto-wraps (a break at either end is not "explicit").
            expect(place({ title: 'Technology Selection\n', metaText: '2w' }).titleLines).toEqual([
                'Technology',
                'Selection',
            ]);
            expect(place({ title: '\n  \n' }).titleLines).toEqual(['']);
        });

        it('leaves a title without a break byte-identical to the break-free path', () => {
            // The literal characters backslash + n (what `\\n` in the DSL becomes) are not a break.
            const placed = place({ title: 'Plan A\\nB', metaText: '2w' });
            expect(placed.textSpills).toBe(false);
            expect(placed.titleLines).toEqual(['Plan A\\nB']);
        });
    });
});

describe('fitItemCaption', () => {
    it('keeps a fitting title and meta on one in-bar line', () => {
        expect(fitItemCaption('Short', 124, 40)).toEqual({
            textSpills: false,
            titleLines: ['Short'],
        });
    });

    it('treats an empty title as fitting', () => {
        expect(fitItemCaption('', 0, 0)).toEqual({ textSpills: false, titleLines: [''] });
    });

    it('wraps a two-line title when the meta line fits', () => {
        expect(fitItemCaption('Technology Selection', 124, 0)).toEqual({
            textSpills: false,
            titleLines: ['Technology', 'Selection'],
        });
    });

    it('spills when the meta line is wider than the inner width', () => {
        expect(fitItemCaption('Short', 124, 125)).toEqual({
            textSpills: true,
            titleLines: ['Short'],
        });
    });

    it('uses a narrower budget for the first line only', () => {
        // 16 chars = 120.6px: one line at 124, two lines at a 115px first line.
        expect(fitItemCaption('Plan the rollout', 124, 0)).toEqual({
            textSpills: false,
            titleLines: ['Plan the rollout'],
        });
        expect(fitItemCaption('Plan the rollout', 124, 0, 115)).toEqual({
            textSpills: false,
            titleLines: ['Plan the', 'rollout'],
        });
    });

    it('spills when the first line is one word wider than the first-line width', () => {
        expect(fitItemCaption('Internationalize', 124, 0, 115)).toEqual({
            textSpills: true,
            titleLines: ['Internationalize'],
        });
    });

    it('spills when a narrower first line pushes the title to three lines', () => {
        // Greedy at 124: "Migrate legacy" / "billing service" / "to new platform".
        const title = 'Migrate legacy billing service to new platform';
        expect(fitItemCaption(title, 124, 0, 115).textSpills).toBe(true);
    });

    it('returns the author lines for an explicit break, in-bar or spilled, with no auto-wrap', () => {
        expect(fitItemCaption('Technology\nSelection', 364, 0)).toEqual({
            textSpills: false,
            titleLines: ['Technology', 'Selection'],
        });
        expect(fitItemCaption('Technology\nSelection', 60, 0)).toEqual({
            textSpills: true,
            titleLines: ['Technology', 'Selection'],
        });
        // Three lines: no cap.
        expect(fitItemCaption('a\nb\nc', 124, 0).titleLines).toEqual(['a', 'b', 'c']);
    });
});

describe('titleBreakLines', () => {
    it('is undefined for a title with no break', () => {
        expect(titleBreakLines('Plain title')).toBeUndefined();
        expect(titleBreakLines('Plan A\\nB')).toBeUndefined();
        expect(titleBreakLines('')).toBeUndefined();
    });

    it('splits, trims and drops leading and trailing empty lines', () => {
        expect(titleBreakLines('A\nB')).toEqual(['A', 'B']);
        expect(titleBreakLines('\r\n A \r\n\r\n B \r\n')).toEqual(['A', '', 'B']);
        expect(titleBreakLines('\n\n')).toEqual([]);
        expect(titleBreakLines('A\n')).toEqual(['A']);
    });
});

describe('resolveCaptionTitleLines', () => {
    const wrapped = { textSpills: false, titleLines: ['Technology', 'Selection'] };
    const spilled = { textSpills: true, titleLines: ['Technology Selection'] };

    it('keeps an auto-wrap only while the caption stays in-bar', () => {
        expect(resolveCaptionTitleLines('Technology Selection', wrapped, false)).toEqual([
            'Technology',
            'Selection',
        ]);
        // A narrow-bar icon spill forces the caption out: the wrap is dropped.
        expect(resolveCaptionTitleLines('Technology Selection', wrapped, true)).toEqual([
            'Technology Selection',
        ]);
        expect(resolveCaptionTitleLines('Technology Selection', spilled, false)).toEqual([
            'Technology Selection',
        ]);
    });

    it('keeps explicit lines whether or not the caption spills', () => {
        const fit = { textSpills: true, titleLines: ['A', 'B', 'C'] };
        expect(resolveCaptionTitleLines('A\nB\nC', fit, false)).toEqual(['A', 'B', 'C']);
        expect(resolveCaptionTitleLines('A\nB\nC', fit, true)).toEqual(['A', 'B', 'C']);
    });

    it('drops a stray leading or trailing break from a single-line title', () => {
        expect(resolveCaptionTitleLines('Plan\n', spilled, false)).toEqual(['Plan']);
        expect(resolveCaptionTitleLines('Technology Selection\n', wrapped, true)).toEqual([
            'Technology Selection',
        ]);
    });
});
