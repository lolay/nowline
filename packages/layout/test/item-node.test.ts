// ItemNode unit tests — assert the new Renderable produces the same
// box geometry and `textSpills` decision the legacy `sequenceItem`
// arithmetic produces. m2.5c wires this into the production pipeline
// in a follow-up; the tests serve as the byte-stable contract.

import { describe, it, expect } from 'vitest';
import { ItemNode } from '../src/nodes/item-node.js';
import { defaultRowBand } from '../src/band-scale.js';
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
});
