// The item after a parallel or group (specs/true-width-layout.md §3.2,
// specs/rendering.md § Parallel): it joins the block's row, and sits level
// with the block's first track, not with its header band.

import { describe, expect, it } from 'vitest';
import {
    layoutRoadmap,
    type PositionedGroup,
    type PositionedItem,
    type PositionedParallel,
} from '../src/index.js';
import { parseAndResolve } from './helpers.js';

async function lane(body: string) {
    const src = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:business

swimlane s "S"
${body}
`;
    const { file, resolved } = await parseAndResolve(src);
    return layoutRoadmap(file, resolved, { theme: 'light' }).swimlanes[0].children;
}

function item(children: readonly unknown[], id: string): PositionedItem {
    const found = children.find((c) => (c as PositionedItem).id === id);
    return found as PositionedItem;
}

describe('item after a block aligns with its first track', () => {
    it('a titled parallel: the next item sits level with the first track', async () => {
        const children = await lane(`  parallel p "Block"
    item a "A" duration:3w
    item b "B" duration:3w
  item c "C" duration:1w`);
        const block = children[0] as PositionedParallel;
        expect(block.headerHeight).toBeGreaterThan(0);
        expect(item(children, 'c').box.y).toBe(item(block.children, 'a').box.y);
        expect(item(children, 'c').box.y).toBeGreaterThan(block.box.y);
    });

    it('an untitled parallel keeps its bracket band, and the next item still follows the first track', async () => {
        const children = await lane(`  parallel
    item a "A" duration:3w
    item b "B" duration:3w
  item c "C" duration:1w`);
        const block = children[0] as PositionedParallel;
        expect(block.headerHeight).toBeGreaterThan(0);
        expect(item(children, 'c').box.y).toBe(item(block.children, 'a').box.y);
    });

    it('a group: the next item sits level with its first child', async () => {
        const children = await lane(`  group g "Grp"
    item a "A" duration:3w
  item c "C" duration:1w`);
        const block = children[0] as PositionedGroup;
        expect(item(children, 'c').box.y).toBe(item(block.children, 'a').box.y);
    });
});
