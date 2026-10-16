// Row track — the child loop that `SwimlaneNode` and `GroupNode` share
// (specs/layout-phases.md §3.8). Feeds a lane's or a group's content to
// a `RowPacker` in DSL order: an item is measured (`measureItem`) so the
// packer can bump it to a fresh row before `sequenceItem` places it with
// the same measure; a parallel or nested group takes a fresh row of its own through
// `sequenceOne`. The callers keep what differs between them: the lane
// its title tab and top-pad collapse, the group its chiclet, header band
// and box. Both read the packer's used height and right edge, and the
// compact time cursor, from the result.

import type { GroupBlock, SwimlaneDeclaration } from '@nowline/core';
import { isItemDeclaration } from '@nowline/core';
import { type TrackNode, trackChildren } from '@nowline/core/internal';
import { blockTitleRowSpillReservation } from '../container-header-geometry.js';
import { type LayoutContext, type LayoutHelpers, newCursor } from '../layout-context.js';
import { RowPacker } from '../row-packer.js';
import { resolveChildStart } from '../start-rules.js';
import type { PositionedTrackChild } from '../types.js';
import { itemSpanPx } from '../working-span.js';
import { trackChildPaintedRightX } from './content-extent.js';
import { measureItem } from './item-measure.js';
import { sequenceItem } from './sequence-item.js';

/** Ids of every named item under `node`, `node` included. */
function itemIdsUnder(node: TrackNode): string[] {
    if (isItemDeclaration(node)) return node.name ? [node.name] : [];
    return trackChildren(node).flatMap(itemIdsUnder);
}

export interface RowTrackOrigin {
    /** Left edge of the track: the lane's left x, or the group's content left x. */
    leftX: number;
    /** Top of the first row (the packer's `originY`). */
    firstRowY: number;
}

export interface RowTrackResult {
    children: PositionedTrackChild[];
    /**
     * Compact cursor, in time: item duration ends and blocks' compact ends
     * only, never a caption spill.
     */
    timeCursorX: number;
    /** The packer the children were fed to; read `usedHeight()` and `usedRightX()` from it. */
    packer: RowPacker;
}

/**
 * Sequence a lane's or a group's track children (core's `trackChildren`:
 * description directives skipped) into rows starting at `origin`, in DSL
 * order. Nested blocks recurse through `sequenceOne`, which carries the
 * inherited state (cursor, flow key) the walk alone does not.
 */
export function sequenceRowTrack(
    container: SwimlaneDeclaration | GroupBlock,
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
    // Items not yet placed in this track: an item never bumps for the slack
    // arrow of one still to come, since rows never move up and that item
    // would follow it down.
    const pendingIds = new Set(trackChildren(container).flatMap(itemIdsUnder));

    const children: PositionedTrackChild[] = [];
    for (const child of trackChildren(container)) {
        for (const id of itemIdsUnder(child)) pendingIds.delete(id);
        if (!isItemDeclaration(child)) {
            const blockStart = resolveChildStart(child, timeCursorX, ctx);
            const { rowIndex, y: blockY } = packer.placeBlock();
            const cursor = newCursor(blockStart, blockY);
            const positioned = helpers.sequenceOne(child, cursor, ctx);
            children.push(positioned);
            // The packer keeps the painted box (a group's box hugs its
            // children's spilled captions), so a following item that would
            // land under a caption drops a row; the time cursor takes the
            // block's compact end (its children's logical ends), so that
            // item still starts on its date, as in engine C
            // (specs/scheduler-unification.md §8 decision 7).
            const blockEnd = positioned.box.x + positioned.box.width;
            const blockHeight = Math.max(step, cursor.height);
            packer.commitBlock({
                rowIndex,
                placed: positioned,
                blockHeight,
                blockEnd,
                spillReservation: blockTitleRowSpillReservation(positioned),
                paintedRight: trackChildPaintedRightX(positioned),
            });
            timeCursorX = Math.max(timeCursorX, cursor.x);
            continue;
        }

        const item = child;
        const desiredStart = resolveChildStart(item, timeCursorX, ctx);
        // Measure the item where `sequenceItem` will place it, so the row
        // pack can decide BEFORE handing off: the measure gives the logical
        // extent and the bar's growth, and `sequenceItem` reuses it. Under
        // `show` the bar snaps to a working day; the cursor below keeps the
        // raw start.
        const predictedStart = ctx.scale.startX(desiredStart);
        const measure = measureItem(item, predictedStart, ctx);
        const desiredEnd = predictedStart + measure.naturalWidth;
        // Row pitch = `step()` + the bar's growth. Keeps the inter-row
        // visible gap (= step - bandwidth) intact when a title wraps or an
        // item's labels wrap and grow the bar. The placed box is
        // `bandwidth + barExtra` tall, so this is also the placed pitch.
        const pitch = step + measure.barExtra;
        const { rowIndex, y: rowY } = packer.placeItem({
            childId: item.name ?? '',
            desiredStart: predictedStart,
            desiredEnd,
            predictedHeight: pitch,
            pendingIds,
        });

        const cursor = newCursor(desiredStart, rowY);
        const positioned = sequenceItem(item, cursor, ctx, measure);
        children.push(positioned);

        // The painted footprint in LOGICAL space: the item's span, or the
        // painted box when the 1 px floor makes it wider. The row packer
        // keeps it, so a following bar never overlaps it.
        const itemLogicalEnd = Math.max(
            predictedStart + measure.naturalWidth,
            positioned.box.x + positioned.box.width,
        );
        // The time cursor advances by the duration, so the next chained
        // item starts on its date, as in engine C.
        const durationEnd = predictedStart + itemSpanPx(ctx, predictedStart, measure.durationDays);
        timeCursorX = Math.max(timeCursorX, durationEnd);

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
            rowHeight: pitch,
        });
    }

    return { children, timeCursorX, packer };
}
