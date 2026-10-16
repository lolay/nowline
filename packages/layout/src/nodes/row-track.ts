// Row track — the child loop that `SwimlaneNode` and `GroupNode` share
// (specs/layout-phases.md §3.8). Feeds a lane's or a group's content to
// a `RowPacker` in DSL order: an item is measured (`measureItem`) so the
// packer can bump it to a fresh row before `sequenceItem` places it with
// the same measure; a parallel or nested group takes a fresh row of its own through
// `sequenceOne`. The callers keep what differs between them: the lane
// its title tab and top-pad collapse, the group its header and body. Both
// read the packer's used height and right edge, and the track's span in
// time, from the result.

import type { GroupBlock, SwimlaneDeclaration } from '@nowline/core';
import { isItemDeclaration } from '@nowline/core';
import { type TrackNode, trackChildren } from '@nowline/core/internal';
import { CONTAINER_HEADER_CLEARANCE_PX, containerHeaderRightX } from '../container-header-geometry.js';
import { type LayoutContext, type LayoutHelpers, newCursor } from '../layout-context.js';
import { RowPacker } from '../row-packer.js';
import { resolveChildStart } from '../start-rules.js';
import type { PositionedItem, PositionedTrackChild } from '../types.js';
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
    /**
     * Earliest child start, in time: where a group's bracket and body open.
     * The track's left x when it has no children.
     */
    timeStartX: number;
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
    let timeStartX = Number.POSITIVE_INFINITY;
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
            // A block's box spans only its dates, so a caption its children
            // spill and a header title that runs past its end are outside
            // it; the row reserves them, as it does an item's spill, so the
            // next child drops a row rather than landing on them
            // (specs/true-width-layout.md §3.2, §3.3). The time cursor takes
            // the block's end in time, so that child still starts on its
            // date, as in engine C (specs/scheduler-unification.md §8
            // decision 7).
            const blockEnd = positioned.box.x + positioned.box.width;
            const blockHeight = Math.max(step, cursor.height);
            const contentRight = reservedRightX(positioned);
            packer.commitBlock({
                rowIndex,
                placed: positioned,
                blockHeight,
                blockEnd,
                spillReservation: contentRight > blockEnd ? contentRight : null,
                paintedRight: trackChildPaintedRightX(positioned),
            });
            timeStartX = Math.min(timeStartX, cursor.startX);
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
        timeStartX = Math.min(timeStartX, cursor.startX);

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

        packer.commitItem({
            rowIndex,
            placed: positioned,
            logicalEnd: itemLogicalEnd,
            spillReservation: itemSpillReservation(positioned),
            rowHeight: pitch,
        });
    }

    if (timeStartX === Number.POSITIVE_INFINITY) timeStartX = ctx.scale.startX(leftX);
    return { children, timeCursorX, timeStartX, packer };
}

/**
 * The row reservation an item's spill claims, or null when nothing spills.
 * `decorationsRightX` already aggregates the spilled dot / icon / footnote /
 * caption right edges from `sequenceItem`; the chip column tracks separately
 * via `chipsRightX`. A 6 px buffer leaves the next chained item's bar a
 * visible gutter past the spilled cluster instead of butting against it.
 */
function itemSpillReservation(item: PositionedItem): number | null {
    const spills =
        item.textSpills ||
        item.chipsOutside ||
        item.dotSpills ||
        item.iconSpills ||
        item.footnoteSpills;
    if (!spills) return null;
    return Math.max(item.decorationsRightX, item.chipsOutside ? item.chipsRightX : 0) + 6;
}

/**
 * Rightmost x a placed child reserves on its row: an item's bar or spill
 * reservation; for a group or parallel, whose box spans only its dates, the
 * furthest of its header (title and glyphs, plus clearance) and its
 * children's reservations.
 */
function reservedRightX(child: PositionedTrackChild): number {
    const boxRight = child.box.x + child.box.width;
    if (child.kind === 'item') return Math.max(boxRight, itemSpillReservation(child) ?? boxRight);
    const headerRight = containerHeaderRightX(child);
    return Math.max(
        boxRight,
        headerRight > boxRight ? headerRight + CONTAINER_HEADER_CLEARANCE_PX : boxRight,
        ...child.children.map(reservedRightX),
    );
}
