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
        // at 132): the bar opens at 333, a 1 px seam in, and the after-glyph
        // sits 6 px in. The 4w bar is 158 px wide, so the before-glyph lands
        // at 458.
        expect(rounded(item!.inlineDatePins)).toMatchInlineSnapshot(`
          [
            {
              "glyphSize": 12,
              "glyphTopLeft": {
                "x": 339,
                "y": 67,
              },
              "isoDate": "2026-02-09",
              "side": "after",
              "spilled": false,
            },
            {
              "glyphSize": 12,
              "glyphTopLeft": {
                "x": 458,
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
        // After-glyph starts on the group's start; before-glyph ends
        // inside its end.
        expect(pins[0].glyphTopLeft.x).toBeGreaterThanOrEqual(group!.box.x);
        expect(pins[1].glyphTopLeft.x + pins[1].glyphSize).toBeLessThanOrEqual(
            group!.box.x + group!.box.width,
        );
    });

    it('group pins sit in the header title row, above the bracket and the body', async () => {
        // Header band 18 px: title row, then the bracket line 13 px down;
        // the body starts below it and pads its first row by 6 px
        // (specs/true-width-layout.md §3.3). Restated rather than imported
        // so a drift in the shared helpers shows up here.
        const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group g "G" after:2026-02-09 before:2026-04-13
    item a "A" duration:2w
    item b "B" duration:2w
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const group = model.swimlanes[0].children.find(isGroup)!;
        const { box } = group;
        const [after, before] = group.inlineDatePins ?? [];
        const firstBar = group.children.find(isItem)!.box;
        expect(group.headerHeight).toBe(18);
        expect(firstBar.y).toBeCloseTo(box.y + 18 + 6);
        for (const pin of [after, before]) {
            expect(pin.glyphTopLeft.y).toBeCloseTo(box.y + (13 - 12) / 2);
            expect(pin.glyphTopLeft.y + pin.glyphSize).toBeLessThanOrEqual(box.y + 13);
        }
        // after-glyph on the group's start (the title moves past it);
        // before-glyph 6 px short of its end.
        expect(after.glyphTopLeft.x).toBeCloseTo(box.x);
        expect(before.glyphTopLeft.x + 12).toBeCloseTo(box.x + box.width - 6);
    });

    it('a styled group draws the same header and body as an unstyled one', async () => {
        // `bg` only shades the body; the chiclet and its top pad are gone.
        const src = (props: string) => `nowline v1

config

style filled
  bg: blue

roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group g "Group title" ${props}after:2026-02-09 before:2026-04-13
    item a "A" duration:3w
    item b "B" duration:3w
`;
        const styled = await parseAndResolve(src('style:filled '));
        const plain = await parseAndResolve(src(''));
        const styledGroup = layoutRoadmap(styled.file, styled.resolved, {
            theme: 'light',
        }).swimlanes[0].children.find(isGroup)!;
        const plainGroup = layoutRoadmap(plain.file, plain.resolved, {
            theme: 'light',
        }).swimlanes[0].children.find(isGroup)!;
        expect(styledGroup.style.bg).not.toBe(plainGroup.style.bg);
        expect(styledGroup.box).toEqual(plainGroup.box);
        expect(styledGroup.headerHeight).toBe(plainGroup.headerHeight);
        expect(styledGroup.inlineDatePins).toEqual(plainGroup.inlineDatePins);
        expect(styledGroup.children.map((c) => c.box)).toEqual(
            plainGroup.children.map((c) => c.box),
        );
    });

    it('an untitled group keeps its header for the bracket; bracket:none drops it unless pinned', async () => {
        const src = (props: string) => `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  group ${props}
    item a "A" duration:2w
`;
        const groupOf = async (props: string) => {
            const { file, resolved } = await parseAndResolve(src(props));
            return layoutRoadmap(file, resolved, { theme: 'light' }).swimlanes[0].children.find(
                isGroup,
            )!;
        };
        const bracketed = await groupOf('');
        const bare = await groupOf('bracket:none');
        const pinned = await groupOf('bracket:none after:2026-01-05');
        expect(bracketed.headerHeight).toBe(18);
        expect(bare.headerHeight).toBe(0);
        expect(pinned.headerHeight).toBe(18);
        // The body pads its rows either way.
        expect(bare.children.find(isItem)!.box.y).toBeCloseTo(bare.box.y + 6);
        const [after] = pinned.inlineDatePins ?? [];
        expect(after.glyphTopLeft.y + after.glyphSize).toBeLessThanOrEqual(
            pinned.children.find(isItem)!.box.y,
        );
    });

    it('a parallel header is the same with or without pins', async () => {
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
        expect(pinnedPar.box.y).toBeCloseTo(barePar.box.y);
        expect(pinnedPar.box.height).toBeCloseTo(barePar.box.height);
        expect(pinnedPar.headerHeight).toBe(18);
        const firstBar = pinnedPar.children.find(isItem)!.box;
        expect(firstBar.y).toBeCloseTo(pinnedPar.box.y + 18 + 6);
        for (const pin of pinnedPar.inlineDatePins ?? []) {
            expect(pin.glyphTopLeft.y).toBeCloseTo(pinnedPar.box.y + 0.5);
        }
    });

    it('a before-glyph slides past a title wider than the container', async () => {
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
        // Title follows the after-glyph (12 px tile + 4 px gap) and is
        // estimated at 0.58 em/char of 10 px text; restated rather than
        // imported so a drift in the shared helpers shows up.
        const titleEnd = box.x + 12 + 4 + 22 * 10 * 0.58;
        // Precondition: the right slot would land on the title.
        expect(box.x + box.width - 6 - 12).toBeLessThan(titleEnd);
        expect(after.glyphTopLeft.x).toBeCloseTo(box.x);
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

    // NL.E0405: `Date` would roll 2026-02-30 over to 2026-03-02, but layout
    // reads an impossible day as no date. The pin moves nothing, caps
    // nothing and draws no glyph: the item sits where it would without it.
    it('an impossible-day pin (2026-02-30) is ignored', async () => {
        const layoutOf = async (pins: string) => {
            const src = `nowline v1
roadmap r "R" start:2026-01-05 length:14w
swimlane s "S"
  item first "F" duration:2w
  item pinned "P" duration:2w${pins}
  group g "G"${pins}
    item a "A" duration:1w
`;
            const { file, resolved } = await parseAndResolve(src);
            return layoutRoadmap(file, resolved, { theme: 'light' });
        };
        const bare = await layoutOf('');
        const pinned = await layoutOf(' after:2026-02-30 before:2026-02-30');

        const itemOf = (m: typeof bare) =>
            m.swimlanes[0].children.filter(isItem).find((it) => it.id === 'pinned')!;
        const groupOf = (m: typeof bare) => m.swimlanes[0].children.find(isGroup)!;
        expect(itemOf(pinned).box).toEqual(itemOf(bare).box);
        expect(itemOf(pinned).hasOverflow).toBe(false);
        expect(itemOf(pinned).inlineDatePins ?? []).toEqual([]);
        expect(groupOf(pinned).box).toEqual(groupOf(bare).box);
        expect(groupOf(pinned).inlineDatePins ?? []).toEqual([]);
    });
});
