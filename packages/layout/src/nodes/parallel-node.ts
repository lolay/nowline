// ParallelNode — Renderable for a `parallel { ... }` block. Stacks
// children top-to-bottom (each child owns a fresh sub-track) and reports
// the union bounding box. Each child is sequenced via the injected
// `helpers.sequenceOne` callback (`sequence-one.ts`), which dispatches to
// `sequenceItem`, `GroupNode` or a nested `ParallelNode`.

import type { GroupBlock, ItemDeclaration, ParallelBlock } from '@nowline/core';
import {
    PARALLEL_HEADER_TITLE_INSET_X_PX,
    parallelHeaderBandPx,
} from '../container-header-geometry.js';
import { propValues } from '../dsl-utils.js';
import { computeContainerInlineDatePins, pickInlineDate } from '../inline-date-pin-geometry.js';
import {
    type LayoutContext,
    type LayoutHelpers,
    newCursor,
    type TrackCursor,
} from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import type { BoundingBox, PositionedParallel, PositionedTrackChild } from '../types.js';
import { waveFloorX } from '../wave-layout.js';

export class ParallelNode {
    constructor(
        public readonly node: ParallelBlock,
        private readonly helpers: LayoutHelpers,
    ) {}

    get id(): string {
        return this.node.name ?? '';
    }

    /**
     * Sequence children into stacked sub-tracks, advance the parent
     * `cursor` to the parallel's right edge (the latest track end), and
     * return a `PositionedParallel`.
     */
    place(cursor: TrackCursor, ctx: LayoutContext): PositionedParallel {
        const { node } = this;
        const { helpers } = this;
        const style = resolveStyle('parallel', node.properties, ctx.styleCtx);
        // The block's own wave and its lead wave floor the shared start
        // (specs/waves.md §5.1); each track is floored again by its own
        // wave where it is placed. A no-op without waves.
        const startX = waveFloorX(node, cursor.x, ctx);
        const afterDate = pickInlineDate(propValues(node.properties, 'after'));
        const beforeDate = pickInlineDate(propValues(node.properties, 'before'));
        const title = node.title ?? node.name;
        // The first track starts flush with the box's top corners, so
        // inline-date glyphs get a header band above the box (shared
        // with the title) instead of sitting on the first track's bar.
        const headerBand = parallelHeaderBandPx(Boolean(afterDate || beforeDate));
        const startY = cursor.y + headerBand;
        // Under `show` the box opens on a working day; each track keeps the
        // raw start as its cursor seed and is snapped where it is placed.
        const boxLeftX = ctx.scale.showsNonWorking ? ctx.scale.startX(startX) : startX;
        const children: PositionedTrackChild[] = [];
        let maxRight = boxLeftX;
        let accumulatedHeight = 0;

        // Each child of a parallel block lives on its own sub-track,
        // so each child starts a fresh flow segment under the parent's
        // path. Two predecessors that sit on different parallel
        // sub-tracks therefore stay in different flows for milestone
        // slack-arrow dedupe.
        const previousFlowKey = ctx.currentFlowKey;
        ctx.nextParallelId += 1;
        const parId = node.name ?? `parallel-${ctx.nextParallelId}`;

        let childIndex = 0;
        for (const child of node.content) {
            if (child.$type === 'DescriptionDirective') continue;
            ctx.currentFlowKey = `${previousFlowKey}/par:${parId}#${childIndex}`;
            const subCursor = newCursor(startX, startY + accumulatedHeight);
            const positioned = helpers.sequenceOne(
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
            x: boxLeftX,
            y: startY,
            width: maxRight - boxLeftX,
            height: accumulatedHeight,
        };

        // No tail gutter: the parallel joins on its latest track end, as
        // engine C does (specs/scheduler-unification.md §8 decision 8).
        cursor.x = maxRight;
        cursor.maxX = Math.max(cursor.maxX, cursor.x);
        cursor.height = Math.max(cursor.height, headerBand + accumulatedHeight);

        const id = node.name;
        if (id) {
            ctx.entityLeftEdges.set(id, box.x);
            ctx.entityRightEdges.set(id, box.x + box.width);
        }

        const inlineDatePins = computeContainerInlineDatePins({
            box,
            afterDate,
            beforeDate,
            row: { kind: 'header-band', title, titleInsetX: PARALLEL_HEADER_TITLE_INSET_X_PX },
        });

        return {
            kind: 'parallel',
            id,
            title,
            box,
            children,
            style,
            inlineDatePins: inlineDatePins.length > 0 ? inlineDatePins : undefined,
        };
    }
}
