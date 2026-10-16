// ParallelNode — Renderable for a `parallel { ... }` block. Stacks
// children top-to-bottom inside its body (each child owns a fresh
// sub-track) under a header band, the way a group is drawn
// (specs/true-width-layout.md §3.3; `container-header-geometry.ts`). Each
// child is sequenced via the injected `helpers.sequenceOne` callback
// (`sequence-one.ts`), which dispatches to `sequenceItem`, `GroupNode` or a
// nested `ParallelNode`.

import type { GroupBlock, ItemDeclaration, ParallelBlock } from '@nowline/core';
import { containerChrome } from '../container-header-geometry.js';
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
     * `cursor` to the parallel's end in time (the latest track end), and
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
        const chrome = containerChrome({
            drawn: true,
            hasTitle: Boolean(title),
            hasPins: Boolean(afterDate || beforeDate),
            hasBracket: style.bracket !== 'none',
        });
        const firstTrackY = cursor.y + chrome.header + chrome.pad;
        const children: PositionedTrackChild[] = [];
        // The tracks' span in time: the bracket and body open on the
        // earliest track start and close on the latest track end, the join
        // (bars span exactly their dates, specs/true-width-layout.md §3.1).
        let minTimeLeft = Number.POSITIVE_INFINITY;
        let maxTimeRight = Number.NEGATIVE_INFINITY;
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
            const subCursor = newCursor(startX, firstTrackY + accumulatedHeight);
            const positioned = helpers.sequenceOne(
                child as ItemDeclaration | GroupBlock,
                subCursor,
                ctx,
            );
            children.push(positioned);
            accumulatedHeight += Math.max(ctx.bandScale.step(), subCursor.height);
            minTimeLeft = Math.min(minTimeLeft, subCursor.startX);
            maxTimeRight = Math.max(maxTimeRight, subCursor.x);
            childIndex++;
        }
        ctx.currentFlowKey = previousFlowKey;
        if (children.length === 0) {
            // Under `show` an empty box still opens on a working day.
            minTimeLeft = ctx.scale.showsNonWorking ? ctx.scale.startX(startX) : startX;
            maxTimeRight = minTimeLeft;
        }

        // Each track's height carries the inter-row gap below it; the body
        // ends `pad` below the last track's painted bottom, and the cursor
        // adds the gap back after the body.
        const step = ctx.bandScale.step();
        const interRowGap = step - ctx.bandScale.bandwidth();
        const contentHeight = Math.max(step, accumulatedHeight) - interRowGap;
        const box: BoundingBox = {
            x: minTimeLeft,
            y: cursor.y,
            width: maxTimeRight - minTimeLeft,
            height: chrome.header + chrome.pad + contentHeight + chrome.pad,
        };

        // No tail gutter: the parallel joins on its latest track end in
        // time, as engine C does (specs/scheduler-unification.md §8
        // decisions 6, 8).
        cursor.startX = box.x;
        cursor.x = maxTimeRight;
        cursor.height = Math.max(cursor.height, box.height + interRowGap);

        const id = node.name;
        // `after:` the parallel is a time path: its latest track end.
        if (id) {
            ctx.entityLeftEdges.set(id, box.x);
            ctx.entityRightEdges.set(id, maxTimeRight);
        }

        const inlineDatePins = computeContainerInlineDatePins({
            box,
            afterDate,
            beforeDate,
            title,
        });

        return {
            kind: 'parallel',
            id,
            title,
            box,
            headerHeight: chrome.header,
            children,
            style,
            inlineDatePins: inlineDatePins.length > 0 ? inlineDatePins : undefined,
        };
    }
}
