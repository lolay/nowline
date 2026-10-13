// Row track — the child loop that `SwimlaneNode` and `GroupNode` share
// (specs/layout-phases.md §3.8). Feeds a lane's or a group's content to
// a `RowPacker` in DSL order: an item's extent and height are predicted
// so the packer can bump it to a fresh row before `sequenceItem` places
// it; a parallel or nested group takes a fresh row of its own through
// `sequenceOne`. The callers keep what differs between them: the lane
// its title tab and top-pad collapse, the group its chiclet, header band
// and box. Both read the packer's used height and right edge, and the
// compact time cursor, from the result.

import type {
    GroupBlock,
    ItemDeclaration,
    ParallelBlock,
    SwimlaneDeclaration,
} from '@nowline/core';
import { isItemDeclaration } from '@nowline/core';
import { blockTitleRowSpillReservation } from '../container-header-geometry.js';
import { type LayoutContext, type LayoutHelpers, scheduledItemDays } from '../layout-context.js';
import { RowPacker } from '../row-packer.js';
import { ITEM_INSET_PX, MIN_ITEM_WIDTH } from '../themes/shared.js';
import type { PositionedTrackChild } from '../types.js';
import { itemSpanPx } from '../working-span.js';

export interface RowTrackOrigin {
    /** Left edge of the track: the lane's left x, or the group's content left x. */
    leftX: number;
    /** Top of the first row (the packer's `originY`). */
    firstRowY: number;
}

export interface RowTrackResult {
    children: PositionedTrackChild[];
    /** Compact cursor: bar logical ends and block ends only. */
    timeCursorX: number;
    /** The packer the children were fed to; read `usedHeight()` and `usedRightX()` from it. */
    packer: RowPacker;
}

/**
 * Sequence `content` into rows starting at `origin`. Description
 * directives are skipped; every other child is placed in DSL order.
 */
export function sequenceRowTrack(
    content: SwimlaneDeclaration['content'] | GroupBlock['content'],
    origin: RowTrackOrigin,
    ctx: LayoutContext,
    helpers: LayoutHelpers,
): RowTrackResult {
    const step = ctx.bandScale.step();
    const leftX = origin.leftX;

    // Topmost-fit row pack. See `RowPacker` for the full contract.
    // The packer owns the rows; we feed it children in DSL order and
    // it returns each child's resolved (rowIndex, y).
    const packer = new RowPacker({
        laneLeftX: leftX,
        originY: origin.firstRowY,
        minRowHeight: step,
        slackCorridors: ctx.slackCorridors,
    });
    let timeCursorX = leftX;

    const children: PositionedTrackChild[] = [];
    for (const child of content) {
        if (child.$type === 'DescriptionDirective') continue;

        if (!isItemDeclaration(child)) {
            const blockStart = helpers.resolveChildStart(
                child as ParallelBlock | GroupBlock,
                timeCursorX,
                leftX,
                ctx,
            );
            const { rowIndex, y: blockY } = packer.placeBlock();
            const cursor = helpers.newCursor(blockStart, blockY);
            const positioned = helpers.sequenceOne(
                child as ItemDeclaration | GroupBlock | ParallelBlock,
                cursor,
                ctx,
            );
            children.push(positioned);
            const blockEnd = positioned.box.x + positioned.box.width;
            const blockHeight = Math.max(step, cursor.height);
            packer.commitBlock({
                rowIndex,
                placed: positioned,
                blockHeight,
                blockEnd,
                spillReservation: blockTitleRowSpillReservation(positioned),
            });
            timeCursorX = Math.max(timeCursorX, blockEnd);
            continue;
        }

        const desiredStart = helpers.resolveChildStart(
            child as ItemDeclaration,
            timeCursorX,
            leftX,
            ctx,
        );
        // Predict the item's logical extent so the row-pack can decide
        // BEFORE handing off to sequenceItem. The arithmetic mirrors
        // the duration → width math in `sequenceItem`.
        // Under `show` the predicted extent starts where `sequenceItem`
        // will snap the bar to; the cursor below keeps the raw start.
        const durationDays = scheduledItemDays(ctx, child as ItemDeclaration);
        const predictedStart = ctx.scale.startX(desiredStart);
        const naturalWidth = Math.max(
            MIN_ITEM_WIDTH,
            itemSpanPx(ctx, predictedStart, durationDays),
        );
        const desiredEnd = predictedStart + naturalWidth;
        const childId = (child as ItemDeclaration).name ?? '';

        const barExtra = helpers.predictItemBarExtraHeight(
            child as ItemDeclaration,
            predictedStart,
            ctx,
        );
        const predictedHeight = step + barExtra;
        const { rowIndex, y: rowY } = packer.placeItem({
            childId,
            desiredStart: predictedStart,
            desiredEnd,
            // Row pitch = `step()` + extra bar height. Keeps the
            // inter-row visible gap (= step - bandwidth) intact
            // when a title wraps or an item's labels wrap and grow
            // the bar.
            predictedHeight,
        });

        const cursor = helpers.newCursor(desiredStart, rowY);
        const positioned = helpers.sequenceItem(child as ItemDeclaration, cursor, ctx);
        children.push(positioned);

        // Item end in LOGICAL space (one ITEM_INSET_PX past the visual
        // bar's right edge). The next chained item starts here and
        // lands edge-to-edge in time, with a 2 × ITEM_INSET_PX visible
        // gutter between bars.
        const itemLogicalEnd = positioned.box.x + positioned.box.width + ITEM_INSET_PX;
        timeCursorX = Math.max(timeCursorX, itemLogicalEnd);

        let spillReservation: number | null = null;
        const hasAnySpill =
            positioned.textSpills ||
            positioned.chipsOutside ||
            positioned.dotSpills ||
            positioned.iconSpills ||
            positioned.footnoteSpills;
        if (hasAnySpill) {
            // `decorationsRightX` already aggregates the spilled
            // dot / icon / footnote / caption right edges from
            // `sequenceItem`; the chip column tracks separately
            // via `chipsRightX`. Add a 6-px buffer so the next
            // chained item's bar leaves a visible gutter past
            // the spilled cluster instead of butting against it.
            const farRight = Math.max(
                positioned.decorationsRightX,
                positioned.chipsOutside ? positioned.chipsRightX : 0,
            );
            spillReservation = farRight + 6;
        }

        packer.commitItem({
            rowIndex,
            placed: positioned,
            logicalEnd: itemLogicalEnd,
            spillReservation,
            // Safety net: if the predictor under-shot (it can't see
            // the exact meta text), the row still grows to the bar
            // that was actually placed plus the inter-row gap.
            rowHeight: Math.max(
                predictedHeight,
                step + (positioned.box.height - ctx.bandScale.bandwidth()),
            ),
        });
    }

    return { children, timeCursorX, packer };
}
