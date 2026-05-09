// ParallelNode — Renderable for a `parallel { ... }` block. Stacks
// children top-to-bottom (each child owns a fresh sub-track) and reports
// the union bounding box. Each child is sequenced via the injected
// `deps.sequenceOne` callback, which dispatches to the appropriate
// per-entity Renderable (or, transitionally, the legacy sequencer
// helpers in `layout.ts`).

import type { GroupBlock, ItemDeclaration, ParallelBlock } from '@nowline/core';
import type { LayoutContext, TrackCursor } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import { TRACK_BLOCK_TAIL_GUTTER_PX } from '../themes/shared.js';
import type { BoundingBox, PositionedParallel, PositionedTrackChild } from '../types.js';

export interface ParallelNodeDeps {
    sequenceOne: (
        child: ItemDeclaration | GroupBlock | ParallelBlock,
        cursor: TrackCursor,
        ctx: LayoutContext,
    ) => PositionedTrackChild;
    newCursor: (x: number, y: number) => TrackCursor;
}

export class ParallelNode {
    constructor(
        public readonly node: ParallelBlock,
        // biome-ignore lint/correctness/noUnusedPrivateClassMembers: accessed via `const { deps } = this` destructuring inside methods, which the analyzer does not detect.
        private readonly deps: ParallelNodeDeps,
    ) {}

    get id(): string {
        return this.node.name ?? '';
    }

    /**
     * Sequence children into stacked sub-tracks, advance the parent
     * `cursor` past the parallel's right edge plus
     * `TRACK_BLOCK_TAIL_GUTTER_PX` of breathing room, and return a
     * `PositionedParallel`.
     */
    place(cursor: TrackCursor, ctx: LayoutContext): PositionedParallel {
        const { node } = this;
        const { deps } = this;
        const style = resolveStyle('parallel', node.properties, ctx.styleCtx);
        const startX = cursor.x;
        const startY = cursor.y;
        const children: PositionedTrackChild[] = [];
        let maxRight = startX;
        let accumulatedHeight = 0;

        // Each child of a parallel block lives on its own sub-track,
        // so each child starts a fresh flow segment under the parent's
        // path. Two predecessors that sit on different parallel
        // sub-tracks therefore stay in different flows for milestone
        // slack-arrow dedupe.
        const previousFlowKey = ctx.currentFlowKey;
        const parId = node.name ?? 'p';

        let childIndex = 0;
        for (const child of node.content) {
            if (child.$type === 'DescriptionDirective') continue;
            ctx.currentFlowKey = `${previousFlowKey}/par:${parId}#${childIndex}`;
            const subCursor = deps.newCursor(startX, startY + accumulatedHeight);
            const positioned = deps.sequenceOne(
                child as ItemDeclaration | GroupBlock,
                subCursor,
                ctx,
            );
            children.push(positioned);
            accumulatedHeight += Math.max(ctx.bandScale.step(), subCursor.height);
            maxRight = Math.max(maxRight, subCursor.maxX);
            childIndex++;
        }
        ctx.currentFlowKey = previousFlowKey;

        const box: BoundingBox = {
            x: startX,
            y: startY,
            width: maxRight - startX,
            height: accumulatedHeight,
        };

        cursor.x = maxRight + TRACK_BLOCK_TAIL_GUTTER_PX;
        cursor.maxX = Math.max(cursor.maxX, cursor.x);
        cursor.height = Math.max(cursor.height, accumulatedHeight);

        const id = node.name;
        if (id) {
            ctx.entityLeftEdges.set(id, box.x);
            ctx.entityRightEdges.set(id, box.x + box.width);
        }

        return {
            kind: 'parallel',
            id,
            title: node.title ?? node.name,
            box,
            children,
            style,
        };
    }
}
