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
        expect(rounded(item!.inlineDatePins)).toMatchInlineSnapshot(`
          [
            {
              "glyphSize": 12,
              "glyphTopLeft": {
                "x": 424,
                "y": 67,
              },
              "isoDate": "2026-02-09",
              "side": "after",
              "spilled": false,
            },
            {
              "glyphSize": 12,
              "glyphTopLeft": {
                "x": 533,
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
