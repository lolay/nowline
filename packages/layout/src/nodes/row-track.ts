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
import { trackChildren } from '@nowline/core/internal';
import { blockTitleRowSpillReservation } from '../container-header-geometry.js';
import { type LayoutContext, type LayoutHelpers, newCursor } from '../layout-context.js';
import { RowPacker } from '../row-packer.js';
import { resolveChildStart } from '../start-rules.js';
import { ITEM_INSET_PX } from '../themes/shared.js';
import type { PositionedTrackChild } from '../types.js';
import { measureItem } from './item-measure.js';
import { sequenceItem } from './sequence-item.js';

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

    const children: PositionedTrackChild[] = [];
    for (const child of trackChildren(container)) {
        if (!isItemDeclaration(child)) {
            const blockStart = resolveChildStart(child, timeCursorX, ctx);
            const { rowIndex, y: blockY } = packer.placeBlock();
            const cursor = newCursor(blockStart, blockY);
            const positioned = helpers.sequenceOne(child, cursor, ctx);
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
        });

        const cursor = newCursor(desiredStart, rowY);
        const positioned = sequenceItem(item, cursor, ctx, measure);
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
            rowHeight: pitch,
        });
    }

    return { children, timeCursorX, packer };
}
