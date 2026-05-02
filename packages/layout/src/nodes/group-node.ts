// GroupNode — Renderable for a `group { ... }` block. Sequences children
// horizontally inside a single sub-track and reports the union bounding
// box. Each child is sequenced via the injected `deps.sequenceOne`
// callback, which dispatches to the appropriate per-entity Renderable
// (or, transitionally, the legacy sequencer helpers in `layout.ts`).

import type {
    GroupBlock,
    ItemDeclaration,
    ParallelBlock,
} from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type {
    PositionedGroup,
    PositionedTrackChild,
    BoundingBox,
} from '../types.js';
import type { LayoutContext, TrackCursor } from '../layout-context.js';

export interface GroupNodeDeps {
    sequenceOne: (
        child: ItemDeclaration | GroupBlock | ParallelBlock,
        cursor: TrackCursor,
        ctx: LayoutContext,
    ) => PositionedTrackChild;
    newCursor: (x: number, y: number) => TrackCursor;
}

export class GroupNode {
    constructor(
        public readonly node: GroupBlock,
        private readonly deps: GroupNodeDeps,
    ) {}

    get id(): string {
        return this.node.name ?? '';
    }

    /**
     * Sequence children left-to-right inside a fresh inner cursor,
     * advance the parent `cursor` past the group's right edge plus 8 px
     * of breathing room, and return a `PositionedGroup`.
     */
    place(cursor: TrackCursor, ctx: LayoutContext): PositionedGroup {
        const { node } = this;
        const { deps } = this;
        const style = resolveStyle('group', node.properties, ctx.styleCtx);
        const startX = cursor.x;
        const startY = cursor.y;
        const innerCursor = deps.newCursor(startX, startY);
        const children: PositionedTrackChild[] = [];
        for (const child of node.content) {
            if (child.$type === 'DescriptionDirective') continue;
            const positioned = deps.sequenceOne(
                child as ItemDeclaration | GroupBlock | ParallelBlock,
                innerCursor,
                ctx,
            );
            children.push(positioned);
        }
        const box: BoundingBox = {
            x: startX,
            y: startY,
            width: innerCursor.maxX - startX,
            height: Math.max(ctx.bandScale.step(), innerCursor.height),
        };
        cursor.x = innerCursor.maxX + 8;
        cursor.maxX = Math.max(cursor.maxX, cursor.x);
        cursor.height = Math.max(cursor.height, box.height);
        const id = node.name;
        if (id) {
            ctx.entityLeftEdges.set(id, box.x);
            ctx.entityRightEdges.set(id, box.x + box.width);
        }
        return {
            kind: 'group',
            id,
            title: node.title ?? node.name,
            box,
            children,
            style,
        };
    }
}
