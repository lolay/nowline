import { describe, expect, it } from 'vitest';
import { TimeScale, BandScale } from '../src/scales.js';
import {
    ItemNode,
    SwimlaneNode,
    RoadmapNode,
    ITEM_INSET_PX,
    type ItemInput,
    type Constraints,
} from '../src/renderable.js';

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

const baseTime = new TimeScale({
    domain: [D('2026-01-05'), D('2026-02-23')], // 49 days
    range: [200, 1180], // 980 px → 20 px/day
});

const baseBands = new BandScale({
    domain: ['engineering'],
    range: [100, 220],
});

function makeItem(over: Partial<ItemInput> = {}): ItemInput {
    return {
        id: 'demo',
        title: 'Demo',
        start: D('2026-01-05'),
        end: D('2026-01-12'),
        status: 'planned',
        remaining: 1,
        textSizePx: 14,
        paddingPx: 8,
        duration: '1w',
        ...over,
    };
}

describe('ItemNode.measure', () => {
    const ctx: Constraints = { time: baseTime, bandTop: 100, bandHeight: 64 };

    it('width equals time.forward(end) - time.forward(start)', () => {
        const item = new ItemNode(
            makeItem({ start: D('2026-01-05'), end: D('2026-01-12') }),
        );
        const m = item.measure(ctx);
        // 7 days × 20 px/day = 140
        expect(m.width).toBeCloseTo(140, 1);
    });

    it('height comes from text-size + padding (NOT a constant)', () => {
        // text-size 14, padding 8 → titleLine 19.6, metaLine 15.68 → ~35.28 + 16 = ~51.28
        const small = new ItemNode(makeItem({ textSizePx: 14, paddingPx: 8 })).measure(ctx);
        // text-size 18, padding 12 → titleLine 25.2, metaLine 20.16 → ~45.36 + 24 = ~69.36
        const large = new ItemNode(makeItem({ textSizePx: 18, paddingPx: 12 })).measure(ctx);
        expect(large.height).toBeGreaterThan(small.height);
        // Bumping just text-size also grows height (drives "auto-computed item height").
        const sameTextLargerPadding = new ItemNode(makeItem({ textSizePx: 14, paddingPx: 16 })).measure(ctx);
        expect(sameTextLargerPadding.height).toBeGreaterThan(small.height);
    });
});

describe('ItemNode.place', () => {
    const ctx: Constraints = { time: baseTime, bandTop: 100, bandHeight: 64 };

    it('positions x via the time scale at the item start date plus the inset', () => {
        const item = new ItemNode(makeItem({ start: D('2026-01-12') }));
        const placed = item.place({ x: baseTime.forward(D('2026-01-12')), y: 100 }, ctx);
        // Jan 12 is 7 days after Jan 5 → 7 × 20 = 140; range starts at 200 → 340.
        // Visible bar is inset by ITEM_INSET_PX (6) for the gutter.
        expect(placed.box.x).toBeCloseTo(340 + ITEM_INSET_PX, 1);
    });

    it('visible bar width = logical width - 2 * ITEM_INSET_PX', () => {
        const item = new ItemNode(makeItem({ start: D('2026-01-05'), end: D('2026-01-12') }));
        const placed = item.place({ x: baseTime.forward(D('2026-01-05')), y: 100 }, ctx);
        // Logical 7 days × 20 = 140; visible = 140 - 12 = 128.
        expect(placed.box.width).toBeCloseTo(140 - 2 * ITEM_INSET_PX, 1);
    });

    it('forces remaining to 0 for status:done', () => {
        const item = new ItemNode(makeItem({ status: 'done', remaining: 0.5 }));
        const placed = item.place({ x: 0, y: 100 }, ctx);
        expect(placed.remaining).toBe(0);
    });

    it('formats meta text from duration alone for done items', () => {
        const item = new ItemNode(makeItem({ status: 'done', duration: '1w' }));
        const placed = item.place({ x: 0, y: 100 }, ctx);
        expect(placed.metaText).toBe('1w');
    });

    it('appends "{n}% remaining" when in-progress with a remaining percent', () => {
        const item = new ItemNode(
            makeItem({ status: 'in-progress', duration: '2w', remainingPercent: 50, remaining: 0.5 }),
        );
        const placed = item.place({ x: 0, y: 100 }, ctx);
        expect(placed.metaText).toBe('2w - 50% remaining');
    });
});

describe('SwimlaneNode.measure / .place', () => {
    const ctx: Constraints = { time: baseTime, bandTop: 100, bandHeight: 64 };

    it('intrinsic height grows past the bandHeight when content exceeds the band', () => {
        const lane = new SwimlaneNode({
            id: 'engineering',
            title: 'Engineering',
            topPadPx: 8,
            bottomPadPx: 8,
            items: [makeItem({ id: 'a' }), makeItem({ id: 'b', textSizePx: 18, paddingPx: 12 })],
        });
        const m = lane.measure(ctx);
        expect(m.height).toBeGreaterThan(64);
    });

    it('places the first item at band.y + topPadPx (no centering)', () => {
        const lane = new SwimlaneNode({
            id: 'engineering',
            title: 'Engineering',
            topPadPx: 4,
            bottomPadPx: 4,
            items: [makeItem({ id: 'a', start: D('2026-01-05'), end: D('2026-01-12') })],
        });
        const placed = lane.place({ x: 200, y: 100 }, ctx);
        const item = placed.children[0];
        expect(item.box.y).toBeCloseTo(placed.band.y + 4, 5);
    });

    it('uses bandX/bandWidth for the band rect when provided', () => {
        const lane = new SwimlaneNode({
            id: 'engineering',
            title: 'Engineering',
            topPadPx: 0,
            bottomPadPx: 0,
            items: [makeItem({ id: 'a' })],
        });
        const wideCtx: Constraints = {
            time: baseTime,
            bandTop: 100,
            bandHeight: 64,
            bandX: 24,
            bandWidth: 1200,
        };
        const placed = lane.place({ x: 24, y: 100 }, wideCtx);
        expect(placed.band.x).toBe(24);
        expect(placed.band.width).toBe(1200);
    });
});

describe('SwimlaneNode shelf-packing (fidelity #5)', () => {
    const ctx: Constraints = { time: baseTime, bandTop: 100, bandHeight: 64 };

    it('packs three sequential, non-overlapping items into a single row', () => {
        const lane = new SwimlaneNode({
            id: 'engineering',
            title: 'Engineering',
            topPadPx: 4,
            bottomPadPx: 4,
            items: [
                makeItem({ id: 'a', title: 'A', start: D('2026-01-05'), end: D('2026-01-12') }),
                makeItem({ id: 'b', title: 'B', start: D('2026-01-12'), end: D('2026-01-19') }),
                makeItem({ id: 'c', title: 'C', start: D('2026-01-19'), end: D('2026-01-26') }),
            ],
        });
        const placed = lane.place({ x: 200, y: 100 }, ctx);
        expect(placed.children.map((c) => c.row)).toEqual([0, 0, 0]);
    });

    it('pushes the next item to row 1 when its predecessor\'s text overflows its bar', () => {
        const lane = new SwimlaneNode({
            id: 'engineering',
            title: 'Engineering',
            topPadPx: 4,
            bottomPadPx: 4,
            items: [
                makeItem({
                    id: 'long',
                    title: 'A title that cannot possibly fit inside one week',
                    start: D('2026-01-05'),
                    end: D('2026-01-12'),
                }),
                makeItem({
                    id: 'next',
                    title: 'Next',
                    start: D('2026-01-12'),
                    end: D('2026-01-19'),
                }),
            ],
        });
        const placed = lane.place({ x: 200, y: 100 }, ctx);
        const longItem = placed.children.find((c) => c.id === 'long')!;
        const nextItem = placed.children.find((c) => c.id === 'next')!;
        expect(longItem.row).toBe(0);
        expect(nextItem.row).toBe(1);
    });

    it('grows band height when row count grows', () => {
        const single = new SwimlaneNode({
            id: 'lane',
            title: 'Lane',
            topPadPx: 4,
            bottomPadPx: 4,
            items: [
                makeItem({ id: 'a', start: D('2026-01-05'), end: D('2026-01-12') }),
                makeItem({ id: 'b', start: D('2026-01-12'), end: D('2026-01-19') }),
            ],
        });
        const stacked = new SwimlaneNode({
            id: 'lane',
            title: 'Lane',
            topPadPx: 4,
            bottomPadPx: 4,
            items: [
                makeItem({
                    id: 'a',
                    title: 'Way too long to ever fit in a single week column',
                    start: D('2026-01-05'),
                    end: D('2026-01-12'),
                }),
                makeItem({ id: 'b', start: D('2026-01-12'), end: D('2026-01-19') }),
            ],
        });
        expect(stacked.measure(ctx).height).toBeGreaterThan(single.measure(ctx).height);
    });
});

describe('BandScale drives swimlane row height (validation #6)', () => {
    it('paddingInner shrinks bandwidth → each lane gets less vertical space', () => {
        const tight = new BandScale({ domain: ['a', 'b'], range: [0, 200], paddingInner: 0 });
        const padded = new BandScale({ domain: ['a', 'b'], range: [0, 200], paddingInner: 0.5 });
        expect(padded.bandwidth()).toBeLessThan(tight.bandwidth());
        // The visible gap (step - bandwidth) grows with paddingInner.
        expect(padded.step() - padded.bandwidth()).toBeGreaterThan(
            tight.step() - tight.bandwidth(),
        );
    });
});

describe('RoadmapNode.place', () => {
    it('stacks swimlanes by reading band positions from the BandScale', () => {
        const lane = new SwimlaneNode({
            id: 'engineering',
            title: 'Engineering',
            topPadPx: 0,
            bottomPadPx: 0,
            items: [makeItem({ id: 'a' })],
        });
        const roadmap = new RoadmapNode([lane]);
        const placed = roadmap.place(100, { time: baseTime }, baseBands);
        expect(placed.swimlanes).toHaveLength(1);
        expect(placed.swimlanes[0].band.y).toBe(baseBands.forward('engineering'));
    });
});
