// RowPacker — the topmost-fit row-pack engine shared by `SwimlaneNode`
// and `GroupNode`. Tracks rows of variable height (each row's height is
// the max of its placed children's heights, with a per-packer minimum)
// and bumps a child to a new row when it would collide with a sibling's
// `rightEdge`, caption `spillX`, or a slack-arrow corridor.
//
// Two-phase API per child:
//   1) `placeItem(...)` / `placeBlock(...)` decides which row the child
//      lands on. The caller then sequences the child at the returned
//      `(rowIndex, y)`, producing a fully positioned subtree.
//   2) `commitItem(...)` / `commitBlock(...)` records the placed child
//      back into the packer so the row's `rightEdge` / `spillX` advance
//      and the row's height grows to accommodate the new child.
//
// When a row's height grows after later rows already exist, the packer
// shifts every subsequent row (and every positioned child placed in it)
// downward by the delta. Items keep their row-anchored top edge; the
// row simply gets taller. This keeps the contract "all children in a
// row share that row's top y" intact while letting individual children
// grow vertically (e.g. wrapped label-chiclet stacks in m3).

import type {
    PositionedTrackChild,
    PositionedItem,
    SlackCorridor,
} from './types.js';

export interface PackedRow {
    /** Top-y of the row in canvas px. */
    y: number;
    /** Visible height of the row. Grows with the tallest committed child. */
    height: number;
    /** Logical x of the rightmost extent reached by a committed child. */
    rightEdge: number;
    /** Reserved x for caption spill. Items whose `desiredStart < spillX`
     *  bump to a new row even if `rightEdge` would let them in. */
    spillX: number;
    /** Children placed in this row. Used when the row's height grows
     *  after later rows exist — every child in every later row shifts
     *  down by the delta. */
    placedChildren: PositionedTrackChild[];
}

export interface RowPackerOptions {
    /** Logical left x of the track this packer owns (lane left edge or
     *  group's content left). New rows reset their `rightEdge` /
     *  `spillX` to this value. */
    laneLeftX: number;
    /** Top-y of the first row. */
    originY: number;
    /** Minimum height of any row. Typically `bandScale.step()`. */
    minRowHeight: number;
    /** Slack-arrow corridors to avoid. Items whose vertical band
     *  intersects a corridor at the candidate row bump to a new row. */
    slackCorridors: SlackCorridor[];
}

/** Item placement query — passed to `placeItem` BEFORE sequencing. */
export interface ItemPlacementInput {
    /** Item id; corridor-bumping is skipped for the corridor's own
     *  predecessor (the slack arrow's source item is exempt). */
    childId: string;
    /** Logical left x where the item wants to start. */
    desiredStart: number;
    /** Logical right x of the item's natural extent. */
    desiredEnd: number;
    /** Predicted intrinsic height of the item. Used to set the row's
     *  initial height when this is the first item in a fresh row, or
     *  to grow the row when a taller item lands in an existing row. */
    predictedHeight: number;
}

/** Result of a `placeItem` query. */
export interface ItemPlacement {
    rowIndex: number;
    y: number;
}

/** Item-commit payload — passed to `commitItem` AFTER sequencing. */
export interface ItemCommitInput {
    rowIndex: number;
    placed: PositionedItem;
    /** Logical right edge of the placed item. Includes the trailing
     *  `ITEM_INSET_PX` so the next chained item butts edge-to-edge in
     *  logical space (with a 2 × ITEM_INSET_PX visible gutter between
     *  bars). */
    logicalEnd: number;
    /** Reserved spill x for captions that overflow the bar's right
     *  edge. `null` resets the row's spill reservation to `laneLeftX`. */
    spillReservation: number | null;
}

/** Result of a `placeBlock` query (parallel/group as a child). */
export interface BlockPlacement {
    rowIndex: number;
    y: number;
}

/** Block-commit payload — passed to `commitBlock` AFTER sequencing. */
export interface BlockCommitInput {
    rowIndex: number;
    placed: PositionedTrackChild;
    /** Total vertical extent the block occupies (the block's reported
     *  `box.height`). The row this block landed on grows to at least
     *  this height. */
    blockHeight: number;
    /** Logical right edge of the block. */
    blockEnd: number;
}

export class RowPacker {
    public readonly rows: PackedRow[];
    private readonly opts: RowPackerOptions;

    constructor(opts: RowPackerOptions) {
        this.opts = opts;
        this.rows = [
            {
                y: opts.originY,
                height: opts.minRowHeight,
                rightEdge: opts.laneLeftX,
                spillX: opts.laneLeftX,
                placedChildren: [],
            },
        ];
    }

    /**
     * Find the topmost row where the item's natural extent fits without
     * colliding with sibling content or a slack corridor; appending a
     * fresh row at the bottom when none of the existing rows fit.
     */
    placeItem(input: ItemPlacementInput): ItemPlacement {
        for (let i = 0; i < this.rows.length; i += 1) {
            const r = this.rows[i];
            if (input.desiredStart < r.rightEdge) continue;
            if (input.desiredStart < r.spillX) continue;
            if (this.rowIntersectsCorridor(r, input)) continue;
            return { rowIndex: i, y: r.y };
        }
        const fresh = this.appendRow(
            Math.max(this.opts.minRowHeight, input.predictedHeight),
        );
        return { rowIndex: this.rows.length - 1, y: fresh.y };
    }

    /**
     * Blocks (parallel / group) always claim a fresh row at the bottom
     * of the stack so their inner sub-tracks have contiguous rows to
     * expand into. If the bottom row is empty, we reuse it; otherwise
     * we append.
     */
    placeBlock(): BlockPlacement {
        const last = this.rows[this.rows.length - 1];
        if (last.rightEdge > this.opts.laneLeftX) {
            const fresh = this.appendRow(this.opts.minRowHeight);
            return { rowIndex: this.rows.length - 1, y: fresh.y };
        }
        return { rowIndex: this.rows.length - 1, y: last.y };
    }

    /**
     * Record a placed item back into its row. Grows the row's height to
     * fit the item, advances `rightEdge`, sets the caption spill, and
     * shifts later rows down if this row got taller.
     */
    commitItem(input: ItemCommitInput): void {
        const row = this.rows[input.rowIndex];
        this.growRowHeight(input.rowIndex, input.placed.box.height);
        row.rightEdge = input.logicalEnd;
        row.spillX = input.spillReservation ?? this.opts.laneLeftX;
        row.placedChildren.push(input.placed);
    }

    /**
     * Record a placed block. Sets the row's height to the block's full
     * height (blocks own their row, no other child shares it).
     */
    commitBlock(input: BlockCommitInput): void {
        const row = this.rows[input.rowIndex];
        this.growRowHeight(input.rowIndex, input.blockHeight);
        row.rightEdge = input.blockEnd;
        row.spillX = this.opts.laneLeftX;
        row.placedChildren.push(input.placed);
    }

    /** Total vertical extent reached (last row's bottom - originY). */
    usedHeight(): number {
        const last = this.rows[this.rows.length - 1];
        return last.y + last.height - this.opts.originY;
    }

    /** Rightmost extent reached — bar logical end OR caption spill,
     *  whichever is wider, across every row. Empty rows contribute
     *  `laneLeftX`. */
    usedRightX(): number {
        let x = this.opts.laneLeftX;
        for (const r of this.rows) {
            if (r.rightEdge > x) x = r.rightEdge;
            if (r.spillX > x) x = r.spillX;
        }
        return x;
    }

    private rowIntersectsCorridor(r: PackedRow, p: ItemPlacementInput): boolean {
        return this.opts.slackCorridors.some(
            (c) =>
                c.y >= r.y &&
                c.y < r.y + r.height &&
                p.desiredStart < c.xEnd &&
                p.desiredEnd > c.xStart &&
                c.slackPredId !== p.childId,
        );
    }

    private appendRow(height: number): PackedRow {
        const last = this.rows[this.rows.length - 1];
        const r: PackedRow = {
            y: last.y + last.height,
            height,
            rightEdge: this.opts.laneLeftX,
            spillX: this.opts.laneLeftX,
            placedChildren: [],
        };
        this.rows.push(r);
        return r;
    }

    private growRowHeight(rowIndex: number, newHeight: number): void {
        const row = this.rows[rowIndex];
        const delta = newHeight - row.height;
        if (delta <= 0) return;
        row.height = newHeight;
        for (let i = rowIndex + 1; i < this.rows.length; i += 1) {
            const r = this.rows[i];
            r.y += delta;
            for (const child of r.placedChildren) {
                shiftPositionedY(child, delta);
            }
        }
    }
}

/**
 * Walk a positioned subtree and shift every absolute y by `dy`. Used
 * when an earlier row in the packer grows, retroactively pushing every
 * later row (and its placed subtrees) down to keep them clear.
 *
 * Items: shift the bar box plus label chips and any overflow box.
 * Groups / parallels: shift the container box and recurse into
 * children. The caller's `box.y` already moved with the parent.
 */
function shiftPositionedY(p: PositionedTrackChild, dy: number): void {
    p.box.y += dy;
    if (p.kind === 'item') {
        for (const chip of p.labelChips) {
            chip.box.y += dy;
        }
        if (p.overflowBox) {
            p.overflowBox.y += dy;
        }
        return;
    }
    for (const child of p.children) {
        shiftPositionedY(child, dy);
    }
}
