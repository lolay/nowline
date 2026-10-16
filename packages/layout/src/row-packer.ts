// RowPacker — the row-pack engine shared by `SwimlaneNode` and
// `GroupNode`. A child never lands above the one before it
// (specs/true-width-layout.md §3.2), so it either joins the last row or
// opens a new one below it: it drops a row when it would collide with the
// last row's `rightEdge`, caption `spillX`, or a slack-arrow corridor.
// Each row's height is the max of its placed children's heights, with a
// per-packer minimum.
//
// Two-phase API per child:
//   1) `placeItem(...)` / `placeBlock(...)` decides which row the child
//      lands on. The caller then sequences the child at the returned
//      `(rowIndex, y)`, producing a fully positioned subtree.
//   2) `commitItem(...)` / `commitBlock(...)` records the placed child
//      back into the packer so the row's `rightEdge` / `spillX` advance
//      and the row's height grows to accommodate the new child.
//
// A child only ever commits to the last row, so a row that grows has no
// rows below it to move.

import type { PositionedItem, PositionedTrackChild, SlackCorridor } from './types.js';

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
    /** Ids of the items still to come in this track. A slack corridor
     *  whose arrow starts at one of them never bumps this item: rows
     *  never move up, so that item would follow it down. */
    pendingIds?: ReadonlySet<string>;
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
    /** Logical right edge of the placed item: its span in time, so the
     *  next chained item butts edge-to-edge in logical space (each bar
     *  keeps its seams inside its own dates). */
    logicalEnd: number;
    /** Reserved spill x for captions that overflow the bar's right
     *  edge. `null` resets the row's spill reservation to `laneLeftX`. */
    spillReservation: number | null;
    /** Total vertical reservation the placed item needs (e.g. bar
     *  height plus a multi-row spilled chip column hanging below the
     *  bar). When omitted, the row only grows to `placed.box.height`,
     *  which is fine for items whose entire content fits inside the
     *  bar. Set this to `predictedHeight` from `placeItem(...)` when
     *  the item has a chip overhang so the row grows even if it
     *  landed in an EXISTING row (where the placement step ignores
     *  `predictedHeight`). */
    rowHeight?: number;
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
    /** Reserved spill x for what the block paints past its right edge
     *  (a header title, a caption its children spill). Omitted or
     *  `null` resets the row's spill reservation to `laneLeftX`. */
    spillReservation?: number | null;
    /** Rightmost x anything inside the block paints, when it can pass
     *  `blockEnd` (see `trackChildPaintedRightX`): a container's box spans
     *  only its dates, so a caption its children spill is not in it. It widens
     *  `usedRightX()` (the lane's extent, and so the canvas); the
     *  caller reserves it on the row through `spillReservation`. */
    paintedRight?: number;
}

export class RowPacker {
    public readonly rows: PackedRow[];
    private readonly opts: RowPackerOptions;
    /** Rightmost `BlockCommitInput.paintedRight` committed so far. */
    private paintedRightX: number;

    constructor(opts: RowPackerOptions) {
        this.opts = opts;
        this.paintedRightX = opts.laneLeftX;
        this.rows = [
            {
                y: opts.originY,
                height: opts.minRowHeight,
                rightEdge: opts.laneLeftX,
                spillX: opts.laneLeftX,
            },
        ];
    }

    /**
     * Join the last row (the last committed child's) when the item's natural
     * extent fits there without colliding with sibling content or a slack
     * corridor; otherwise append a fresh row below it.
     */
    placeItem(input: ItemPlacementInput): ItemPlacement {
        const last = this.rows[this.rows.length - 1];
        const fits =
            input.desiredStart >= last.rightEdge &&
            input.desiredStart >= last.spillX &&
            !this.rowIntersectsCorridor(last, input) &&
            !this.rowCrossesOwnCorridor(last, input);
        const row = fits
            ? last
            : this.appendRow(Math.max(this.opts.minRowHeight, input.predictedHeight));
        return { rowIndex: this.rows.length - 1, y: row.y };
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
     * fit the item, advances `rightEdge` and sets the caption spill.
     */
    commitItem(input: ItemCommitInput): void {
        const row = this.rows[input.rowIndex];
        row.height = Math.max(row.height, input.placed.box.height, input.rowHeight ?? 0);
        row.rightEdge = input.logicalEnd;
        row.spillX = input.spillReservation ?? this.opts.laneLeftX;
    }

    /**
     * Record a placed block. Sets the row's height to the block's full
     * height (blocks own their row, no other child shares it).
     */
    commitBlock(input: BlockCommitInput): void {
        const row = this.rows[input.rowIndex];
        row.height = Math.max(row.height, input.blockHeight);
        row.rightEdge = input.blockEnd;
        row.spillX = input.spillReservation ?? this.opts.laneLeftX;
        if (input.paintedRight !== undefined && input.paintedRight > this.paintedRightX) {
            this.paintedRightX = input.paintedRight;
        }
    }

    /** Total vertical extent reached (last row's bottom - originY). */
    usedHeight(): number {
        const last = this.rows[this.rows.length - 1];
        return last.y + last.height - this.opts.originY;
    }

    /** Rightmost extent reached — bar logical end OR caption spill,
     *  whichever is wider, across every row, and anything a committed
     *  block paints past its own box (`BlockCommitInput.paintedRight`).
     *  Empty rows contribute `laneLeftX`. */
    usedRightX(): number {
        let x = this.paintedRightX;
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
                c.slackPredId !== p.childId &&
                !p.pendingIds?.has(c.slackPredId),
        );
    }

    /**
     * An overrun slack arrow runs left, from its source back to a milestone
     * dated before the source ends. Rows never move up, so the source cannot
     * push the work before it out of that path; it drops to a row where the
     * path is clear instead.
     */
    private rowCrossesOwnCorridor(r: PackedRow, p: ItemPlacementInput): boolean {
        return this.opts.slackCorridors.some(
            (c) =>
                c.slackPredId === p.childId &&
                c.xStart < p.desiredStart &&
                r.rightEdge > Math.max(c.xStart, this.opts.laneLeftX),
        );
    }

    private appendRow(height: number): PackedRow {
        const last = this.rows[this.rows.length - 1];
        const r: PackedRow = {
            y: last.y + last.height,
            height,
            rightEdge: this.opts.laneLeftX,
            spillX: this.opts.laneLeftX,
        };
        this.rows.push(r);
        return r;
    }
}
