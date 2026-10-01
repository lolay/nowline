// ItemNode unit tests — assert the new Renderable produces the same
// box geometry and `textSpills` decision the legacy `sequenceItem`
// arithmetic produces. m2.5c wires this into the production pipeline
// in a follow-up; the tests serve as the byte-stable contract.

import { describe, expect, it } from 'vitest';
import { defaultRowBand } from '../src/band-scale.js';
import { fitItemCaption, ItemNode } from '../src/nodes/item-node.js';
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
});
