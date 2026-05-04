// GroupNode — Renderable for a `group { ... }` block. Sequences
// children inside the group's content area using the same row-pack
// engine `SwimlaneNode` uses, so an item whose desired start collides
// with a sibling's `rightEdge`, caption `spillX`, or a slack-arrow
// corridor bumps to a new row inside the group. The group's reported
// `box.height` grows with the row stack so parent containers stack
// against the actual painted extent.
//
// Filled-style groups paint a title chiclet flush in the upper-left
// corner of the box; the layout reserves vertical top padding equal
// to the chiclet height plus a small gutter before the first inner
// row begins.

import type {
    GroupBlock,
    ItemDeclaration,
    ParallelBlock,
    EntityProperty,
} from '@nowline/core';
import { isItemDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import type {
    PositionedGroup,
    PositionedTrackChild,
    PositionedItem,
    BoundingBox,
} from '../types.js';
import type { LayoutContext, TrackCursor } from '../layout-context.js';
import {
    TRACK_BLOCK_TAIL_GUTTER_PX,
    GROUP_TITLE_TAB_HEIGHT_PX,
    GROUP_TITLE_TAB_GUTTER_PX,
    GROUP_BOTTOM_PAD_PX,
    ITEM_INSET_PX,
    MIN_ITEM_WIDTH,
} from '../themes/shared.js';
import { propValue } from '../dsl-utils.js';
import { resolveDuration } from '../calendar.js';
import { RowPacker } from '../row-packer.js';

export interface GroupNodeDeps {
    sequenceItem: (
        child: ItemDeclaration,
        cursor: TrackCursor,
        ctx: LayoutContext,
        ownerOverride?: string,
    ) => PositionedItem;
    sequenceOne: (
        child: ItemDeclaration | GroupBlock | ParallelBlock,
        cursor: TrackCursor,
        ctx: LayoutContext,
    ) => PositionedTrackChild;
    resolveChildStart: (
        props: EntityProperty[],
        seqDefault: number,
        laneLeftX: number,
        ctx: LayoutContext,
    ) => number;
    newCursor: (x: number, y: number) => TrackCursor;
    estimateTextWidth: (text: string, fontSize: number) => number;
    /** Predict the extra vertical height an item's wrapped label-chip
     *  rows will add to its bar; used to size the row-packer's row
     *  pitch ahead of the call to `sequenceItem`. */
    predictItemChipExtraHeight: (item: ItemDeclaration, ctx: LayoutContext) => number;
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
     * Sequence children inside the group's content area, advance the
     * parent `cursor` past the group's right edge plus
     * `TRACK_BLOCK_TAIL_GUTTER_PX` of breathing room, and return a
     * `PositionedGroup` whose `box.height` covers the chiclet pad,
     * every row-packed child row, and the bottom pad.
     */
    place(cursor: TrackCursor, ctx: LayoutContext): PositionedGroup {
        const { node } = this;
        const { deps } = this;
        const style = resolveStyle('group', node.properties, ctx.styleCtx);
        const startX = cursor.x;
        const startY = cursor.y;
        const title = node.title ?? node.name;
        // Mirrors `renderGroup`'s `hasFill` decision so the painted box
        // and the layout's reservation agree on whether a chiclet exists.
        const hasChiclet =
            style.bg !== 'none' &&
            style.bg !== '#ffffff' &&
            Boolean(title);
        const topPad = hasChiclet
            ? GROUP_TITLE_TAB_HEIGHT_PX + GROUP_TITLE_TAB_GUTTER_PX
            : 0;
        const bottomPad = hasChiclet ? GROUP_BOTTOM_PAD_PX : 0;

        const step = ctx.bandScale.step();
        const groupContentLeftX = startX;
        const packer = new RowPacker({
            laneLeftX: groupContentLeftX,
            originY: startY + topPad,
            minRowHeight: step,
            slackCorridors: ctx.slackCorridors,
        });
        let timeCursorX = groupContentLeftX;

        const children: PositionedTrackChild[] = [];
        for (const child of node.content) {
            if (child.$type === 'DescriptionDirective') continue;

            if (!isItemDeclaration(child)) {
                const blockProps = (child as ParallelBlock | GroupBlock).properties ?? [];
                const blockStart = deps.resolveChildStart(
                    blockProps,
                    timeCursorX,
                    groupContentLeftX,
                    ctx,
                );
                const { rowIndex, y: blockY } = packer.placeBlock();
                const innerCursor = deps.newCursor(blockStart, blockY);
                const positioned = deps.sequenceOne(
                    child as ItemDeclaration | GroupBlock | ParallelBlock,
                    innerCursor,
                    ctx,
                );
                children.push(positioned);
                const blockEnd = positioned.box.x + positioned.box.width;
                const blockHeight = Math.max(step, innerCursor.height);
                packer.commitBlock({
                    rowIndex,
                    placed: positioned,
                    blockHeight,
                    blockEnd,
                });
                timeCursorX = Math.max(timeCursorX, blockEnd);
                continue;
            }

            const props = (child as ItemDeclaration).properties;
            const desiredStart = deps.resolveChildStart(
                props,
                timeCursorX,
                groupContentLeftX,
                ctx,
            );
            // Predict logical extent so the row-packer can bump on
            // collision before we hand off to `sequenceItem`. Mirrors
            // SwimlaneNode's pre-flight width math.
            const durationDays = resolveDuration(
                propValue(props, 'duration'),
                ctx.durations,
                ctx.cal,
            );
            const naturalWidth = Math.max(
                MIN_ITEM_WIDTH,
                durationDays * ctx.timeline.pixelsPerDay,
            );
            const desiredEnd = desiredStart + naturalWidth;
            const childId = (child as ItemDeclaration).name ?? '';

            const chipExtra = deps.predictItemChipExtraHeight(child as ItemDeclaration, ctx);
            const predictedHeight = step + chipExtra;
            const { rowIndex, y: rowY } = packer.placeItem({
                childId,
                desiredStart,
                desiredEnd,
                // Row pitch = `step()` + extra chip-row height. Keeps
                // the inter-row visible gap (= step - bandwidth) intact
                // when an item's labels wrap and grow the bar.
                predictedHeight,
            });

            const innerCursor = deps.newCursor(desiredStart, rowY);
            const positioned = deps.sequenceItem(child as ItemDeclaration, innerCursor, ctx);
            children.push(positioned);

            const itemLogicalEnd = positioned.box.x + positioned.box.width + ITEM_INSET_PX;
            timeCursorX = Math.max(timeCursorX, itemLogicalEnd);

            let spillReservation: number | null = null;
            if (positioned.textSpills || positioned.chipsOutside) {
                const titleWidth = positioned.textSpills
                    ? deps.estimateTextWidth(positioned.title, 13)
                    : 0;
                const metaWidth = positioned.textSpills && positioned.metaText
                    ? deps.estimateTextWidth(positioned.metaText, 11)
                    : 0;
                const visualRight = positioned.box.x + positioned.box.width;
                const chipsContribution = positioned.chipsOutside
                    ? Math.max(0, positioned.chipsRightX - (visualRight + 6))
                    : 0;
                const captionContribution = Math.max(titleWidth, metaWidth);
                spillReservation =
                    visualRight + 6 +
                    Math.max(captionContribution, chipsContribution) + 6;
            }

            packer.commitItem({
                rowIndex,
                placed: positioned,
                logicalEnd: itemLogicalEnd,
                spillReservation,
                rowHeight: predictedHeight,
            });
        }

        const innerHeight = Math.max(step, packer.usedHeight());
        // The group's painted box hugs everything its children put on
        // screen, including caption text that spills past a bar's right
        // edge. `usedRightX` is the rightmost extent any row reached —
        // either a bar's logical right or a caption's reserved spill —
        // so the orange tint visually "owns" the spilled title/meta.
        //
        // The cursor channel (`cursor.x` / `cursor.maxX`) stays on the
        // COMPACT `timeCursorX` (bar logical ends only). Bubbling the
        // wide `visualRightX` upward would propagate through
        // `ParallelNode.maxRight → parallel.box.width → swimlane
        // blockEnd → timeCursorX`, pushing every subsequent sibling
        // right by the spill width — including siblings on entirely
        // different rows of the parent swimlane. The painted box and
        // the logical cursor advance are intentionally decoupled here.
        const visualRightX = Math.max(timeCursorX, packer.usedRightX());
        const box: BoundingBox = {
            x: startX,
            y: startY,
            width: visualRightX - startX,
            height: topPad + innerHeight + bottomPad,
        };
        cursor.x = timeCursorX + TRACK_BLOCK_TAIL_GUTTER_PX;
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
            title,
            box,
            children,
            style,
        };
    }
}
