// ParallelNode — Renderable for a `parallel { ... }` block. Stacks
// children top-to-bottom (each child owns a fresh sub-track) and reports
// the union bounding box. Each child is sequenced via the injected
// `deps.sequenceOne` callback, which dispatches to the appropriate
// per-entity Renderable (or, transitionally, the legacy sequencer
// helpers in `layout.ts`).

import type {
    ParallelBlock,
    ItemDeclaration,
    GroupBlock,
} from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type {
    PositionedParallel,
    PositionedTrackChild,
    BoundingBox,
} from '../types.js';
import type { LayoutContext, TrackCursor } from '../layout-context.js';

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
        private readonly deps: ParallelNodeDeps,
    ) {}

    get id(): string {
        return this.node.name ?? '';
    }

    /**
     * Sequence children into stacked sub-tracks, advance the parent
     * `cursor` past the parallel's right edge plus 8 px of breathing
     * room, and return a `PositionedParallel`.
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

        for (const child of node.content) {
            if (child.$type === 'DescriptionDirective') continue;
            const subCursor = deps.newCursor(startX, startY + accumulatedHeight);
            const positioned = deps.sequenceOne(
                child as ItemDeclaration | GroupBlock,
                subCursor,
                ctx,
            );
            children.push(positioned);
            accumulatedHeight += Math.max(ctx.bandScale.step(), subCursor.height);
            maxRight = Math.max(maxRight, subCursor.maxX);
        }

        const box: BoundingBox = {
            x: startX,
            y: startY,
            width: maxRight - startX,
            height: accumulatedHeight,
        };

        cursor.x = maxRight + 8;
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
