// Layout snapshot for the inline-date-pin geometry. Pins on items,
// groups, and parallels populate the `inlineDatePins` array on the
// positioned shape (PositionedItem / PositionedGroup /
// PositionedParallel). The snapshot makes the geometry a byte-stable
// regression gate so future renderer or geometry changes show up as
// snapshot drift.

import { describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/index.js';
import type {
    InlineDatePin,
    PositionedGroup,
    PositionedItem,
    PositionedParallel,
} from '../src/types.js';
import { parseAndResolve } from './helpers.js';

function isItem(child: unknown): child is PositionedItem {
    return !!child && (child as { kind?: string }).kind === 'item';
}

function isGroup(child: unknown): child is PositionedGroup {
    return !!child && (child as { kind?: string }).kind === 'group';
}

function isParallel(child: unknown): child is PositionedParallel {
    return !!child && (child as { kind?: string }).kind === 'parallel';
}

function rounded(pins: readonly InlineDatePin[] | undefined): unknown[] {
    return (pins ?? []).map((p) => ({
        side: p.side,
        isoDate: p.isoDate,
        glyphSize: p.glyphSize,
        glyphTopLeft: { x: Math.round(p.glyphTopLeft.x), y: Math.round(p.glyphTopLeft.y) },
        spilled: p.spilled,
    }));
}

describe('inline-date pin layout', () => {
    it('item with after: + before: emits one pin per side', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  item pinned "Pinned" duration:4w after:2026-02-09 before:2026-04-13
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const item = model.swimlanes[0].children.find(isItem);
        expect(item).toBeDefined();
        // `after:2026-02-09` is working-day index 25 (200 px from the origin
        // at 132): the bar opens at 338 and the after-glyph sits 6 px in.
        // The 4w bar is 148 px wide, so the before-glyph lands at 453.
        expect(rounded(item!.inlineDatePins)).toMatchInlineSnapshot(`
          [
            {
              "glyphSize": 12,
              "glyphTopLeft": {
                "x": 344,
                "y": 67,
              },
              "isoDate": "2026-02-09",
              "side": "after",
              "spilled": false,
            },
            {
              "glyphSize": 12,
              "glyphTopLeft": {
                "x": 453,
                "y": 67,
              },
              "isoDate": "2026-04-13",
              "side": "before",
              "spilled": false,
            },
          ]
        `);
    });

    it('group inline-date pins attach to the group bounding box', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group g "G" after:2026-02-09 before:2026-04-13
    item a "A" duration:2w
    item b "B" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const group = model.swimlanes[0].children.find(isGroup);
        expect(group).toBeDefined();
        const pins = group!.inlineDatePins ?? [];
        expect(pins).toHaveLength(2);
        expect(pins.map((p) => ({ side: p.side, isoDate: p.isoDate, size: p.glyphSize }))).toEqual([
            { side: 'after', isoDate: '2026-02-09', size: 12 },
            { side: 'before', isoDate: '2026-04-13', size: 12 },
        ]);
        // After-glyph sits inside the group's left edge; before-glyph
        // inside the group's right edge.
        expect(pins[0].glyphTopLeft.x).toBeGreaterThanOrEqual(group!.box.x);
        expect(pins[1].glyphTopLeft.x + pins[1].glyphSize).toBeLessThanOrEqual(
            group!.box.x + group!.box.width,
        );
    });

    it('styled-group pins join the title chiclet row and clear the chiclet', async () => {
        // A filled group paints its title chiclet flush in the box's
        // top-left corner; the after-glyph used to sit on top of it.
        const src = `nowline v1

config

style filled
  bg: blue

roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group g "Group title" style:filled after:2026-02-09 before:2026-04-13
    item a "A" duration:3w
    item b "B" duration:3w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const group = model.swimlanes[0].children.find(isGroup);
        expect(group).toBeDefined();
        const { box } = group!;
        const [after, before] = group!.inlineDatePins ?? [];
        expect([after?.side, before?.side]).toEqual(['after', 'before']);
        // Chiclet: 11 chars x 5.5 px + 2 x 6 px padding = 72.5 px wide,
        // 16 px tall, flush in the corner. Restated rather than imported
        // so a drift in the shared helper shows up here.
        const chicletRight = box.x + 11 * 5.5 + 2 * 6;
        expect(after.glyphTopLeft.x).toBeCloseTo(chicletRight + 4);
        // Both glyphs sit centered on the chiclet's 16 px row, above the
        // first child row (which starts 20 px down).
        expect(after.glyphTopLeft.y).toBeCloseTo(box.y + (16 - 12) / 2);
        expect(before.glyphTopLeft.y).toBeCloseTo(box.y + (16 - 12) / 2);
        // The before-glyph keeps its flush-right slot.
        expect(before.glyphTopLeft.x + 12).toBeCloseTo(box.x + box.width - 6);
    });

    it('styled-group before-glyph slides past a chiclet wider than the box', async () => {
        const src = `nowline v1

config

style filled
  bg: blue

roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group g "A much longer group title" style:filled after:2026-02-09 before:2026-02-16
    item a "A" duration:1w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const group = model.swimlanes[0].children.find(isGroup);
        expect(group).toBeDefined();
        const { box } = group!;
        const [after, before] = group!.inlineDatePins ?? [];
        const chicletRight = box.x + 25 * 5.5 + 2 * 6;
        // Precondition: the chiclet really is wider than the box leaves
        // room for, so the flush-right slot would land on it.
        expect(box.x + box.width - 6 - 12).toBeLessThan(chicletRight);
        expect(after.glyphTopLeft.x).toBeCloseTo(chicletRight + 4);
        expect(before.glyphTopLeft.x).toBeCloseTo(after.glyphTopLeft.x + 12 + 4);
    });

    it('unstyled-group pins sit in the header band, above the first child bar', async () => {
        // The first child bar starts flush with the group's top edge, so
        // the glyphs used to sit on it (and the bar, painted later,
        // covered them).
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group g "G" after:2026-02-09 before:2026-04-13
    item a "A" duration:2w
    item b "B" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const group = model.swimlanes[0].children.find(isGroup);
        expect(group).toBeDefined();
        const { box } = group!;
        const [after, before] = group!.inlineDatePins ?? [];
        const firstBar = group!.children.find(isItem)!.box;
        expect(firstBar.y).toBeCloseTo(box.y);
        // 12 px band above box.y, glyph tile fills it.
        expect(after.glyphTopLeft.y).toBeCloseTo(box.y - 12);
        expect(before.glyphTopLeft.y).toBeCloseTo(box.y - 12);
        expect(after.glyphTopLeft.y + after.glyphSize).toBeLessThanOrEqual(firstBar.y);
        // after-glyph above the first bar's left edge (the title moves
        // past it); before-glyph flush right.
        expect(after.glyphTopLeft.x).toBeCloseTo(box.x + 6);
        expect(before.glyphTopLeft.x + 12).toBeCloseTo(box.x + box.width - 6);
    });

    it('untitled groups reserve a glyph row only when pinned', async () => {
        const src = (props: string) => `nowline v1

config

style filled
  bg: blue

roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group ${props}
    item a "A" duration:2w
`;
        for (const style of ['', 'style:filled ']) {
            const pinned = await parseAndResolve(src(`${style}after:2026-01-05`));
            const bare = await parseAndResolve(src(style.trim()));
            const pinnedGroup = layoutRoadmap(pinned.file, pinned.resolved, {
                theme: 'light',
            }).swimlanes[0].children.find(isGroup)!;
            const bareGroup = layoutRoadmap(bare.file, bare.resolved, {
                theme: 'light',
            }).swimlanes[0].children.find(isGroup)!;
            const [after] = pinnedGroup.inlineDatePins ?? [];
            const bar = pinnedGroup.children.find(isItem)!.box;
            expect(after.glyphTopLeft.y + after.glyphSize).toBeLessThanOrEqual(bar.y);
            if (style) {
                // Filled: the chiclet row inside the box, as if titled.
                expect(after.glyphTopLeft.y).toBeCloseTo(pinnedGroup.box.y + 2);
                expect(bar.y).toBeCloseTo(pinnedGroup.box.y + 20);
                expect(bareGroup.children.find(isItem)!.box.y).toBeCloseTo(bareGroup.box.y);
            } else {
                // Unstyled: the header band above the box.
                expect(after.glyphTopLeft.y).toBeCloseTo(pinnedGroup.box.y - 12);
                expect(pinnedGroup.box.y).toBeCloseTo(bareGroup.box.y + 12);
            }
        }
    });

    it('parallel pins reserve a header band above the first track', async () => {
        const src = (props: string) => `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  parallel p "P" ${props}
    item a "A" duration:2w
    item b "B" duration:2w
`;
        const pinned = await parseAndResolve(src('after:2026-01-05 before:2026-04-13'));
        const bare = await parseAndResolve(src(''));
        const pinnedPar = layoutRoadmap(pinned.file, pinned.resolved, {
            theme: 'light',
        }).swimlanes[0].children.find(isParallel)!;
        const barePar = layoutRoadmap(bare.file, bare.resolved, {
            theme: 'light',
        }).swimlanes[0].children.find(isParallel)!;
        // Only pins reserve the band; a title-only parallel is unchanged.
        expect(pinnedPar.box.y).toBeCloseTo(barePar.box.y + 12);
        expect(pinnedPar.box.height).toBeCloseTo(barePar.box.height);
        const firstBar = pinnedPar.children.find(isItem)!.box;
        expect(firstBar.y).toBeCloseTo(pinnedPar.box.y);
        for (const pin of pinnedPar.inlineDatePins ?? []) {
            expect(pin.glyphTopLeft.y).toBeCloseTo(pinnedPar.box.y - 12);
        }
    });

    it('header-band before-glyph slides past a title wider than the box', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  parallel p "Regional rollout waves" after:2026-01-05 before:2026-02-02
    item a "A" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const parallel = model.swimlanes[0].children.find(isParallel)!;
        const { box } = parallel;
        const [after, before] = parallel.inlineDatePins ?? [];
        // Title follows the after-glyph (6 px inset + 12 px tile + 4 px
        // gap) and is estimated at 0.58 em/char of 10 px text; restated
        // rather than imported so a drift in the shared helpers shows up.
        const titleEnd = box.x + 6 + 12 + 4 + 22 * 10 * 0.58;
        // Precondition: the flush-right slot would land on the title.
        expect(box.x + box.width - 6 - 12).toBeLessThan(titleEnd);
        expect(after.glyphTopLeft.x).toBeCloseTo(box.x + 6);
        expect(before.glyphTopLeft.x).toBeCloseTo(titleEnd + 4);
    });

    it('a same-row sibling bumps past a pinned title row that overflows its box', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  parallel p "Regional rollout waves" before:2026-02-02
    item a "A" duration:2w
  item next "Next" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const lane = model.swimlanes[0];
        const parallel = lane.children.find(isParallel)!;
        const next = lane.children.find(isItem)!;
        const [before] = parallel.inlineDatePins ?? [];
        // Precondition: the glyph overhangs the box toward `next`.
        expect(before.glyphTopLeft.x + before.glyphSize).toBeGreaterThan(
            parallel.box.x + parallel.box.width,
        );
        // `next` would otherwise chain onto the parallel's row, with its
        // bar's top edge level with the glyph.
        expect(next.box.y).toBeGreaterThanOrEqual(parallel.box.y + parallel.box.height);
    });

    it('parallel inline-date pins attach to the parallel bounding box', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  parallel p "P" after:2026-02-09 before:2026-04-13
    item a "A" duration:2w
    item b "B" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const parallel = model.swimlanes[0].children.find(isParallel);
        expect(parallel).toBeDefined();
        const pins = parallel!.inlineDatePins ?? [];
        expect(pins).toHaveLength(2);
        expect(pins.map((p) => ({ side: p.side, isoDate: p.isoDate, size: p.glyphSize }))).toEqual([
            { side: 'after', isoDate: '2026-02-09', size: 12 },
            { side: 'before', isoDate: '2026-04-13', size: 12 },
        ]);
    });

    it('item without inline dates has an empty (or missing) pins array', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  item plain "Plain" duration:1w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const item = model.swimlanes[0].children.find(isItem);
        expect(item).toBeDefined();
        expect(item!.inlineDatePins ?? []).toEqual([]);
    });

    it('mixed list (id + date) produces exactly one after-side pin', async () => {
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  item upstream "U" duration:2w
  item downstream "D" duration:2w after:[upstream, 2026-03-09]
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const items = model.swimlanes[0].children.filter(isItem);
        const downstream = items.find((it) => it.id === 'downstream');
        expect(downstream).toBeDefined();
        const afterPins = (downstream!.inlineDatePins ?? []).filter((p) => p.side === 'after');
        expect(afterPins).toHaveLength(1);
        expect(afterPins[0].isoDate).toBe('2026-03-09');
    });
});
