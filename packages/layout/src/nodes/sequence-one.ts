// sequenceOne — the dispatcher a track calls for each child: an item goes
// to `sequenceItem`, a parallel block to `ParallelNode`, a group to
// `GroupNode`. It is the one helper the nodes still take injected
// (`LayoutHelpers`): the group and parallel nodes call it for their nested
// blocks, so importing it there would form a cycle (specs/layout-phases.md
// §8, decision 4).

import type { GroupBlock, ItemDeclaration, ParallelBlock } from '@nowline/core';
import { isGroupBlock, isItemDeclaration, isParallelBlock } from '@nowline/core';
import type { LayoutContext, TrackCursor } from '../layout-context.js';
import type { PositionedGroup, PositionedParallel, PositionedTrackChild } from '../types.js';
import { GroupNode } from './group-node.js';
import { ParallelNode } from './parallel-node.js';

import { sequenceItem } from './sequence-item.js';

function sequenceParallel(
    node: ParallelBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedParallel {
    return new ParallelNode(node, { sequenceOne }).place(cursor, ctx);
}

function sequenceGroup(node: GroupBlock, cursor: TrackCursor, ctx: LayoutContext): PositionedGroup {
    return new GroupNode(node, { sequenceOne }).place(cursor, ctx);
}

export function sequenceOne(
    node: ItemDeclaration | GroupBlock | ParallelBlock,
    cursor: TrackCursor,
    ctx: LayoutContext,
): PositionedTrackChild {
    if (isItemDeclaration(node)) return sequenceItem(node, cursor, ctx);
    if (isParallelBlock(node)) return sequenceParallel(node, cursor, ctx);
    if (isGroupBlock(node)) return sequenceGroup(node, cursor, ctx);
    throw new Error(
        `Unknown swimlane child type: ${(node as { $type?: string }).$type ?? 'unknown'}`,
    );
}
