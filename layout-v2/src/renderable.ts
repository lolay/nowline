// Renderable tree: the Y-axis measure/place model.
//
// Each node measures itself first (returns its intrinsic size given
// constraints), then is placed (anchored to an origin and lays out its
// children). Parents stack vertically; X comes from the TimeScale; height
// bubbles up from leaves.
//
// This is the structural shift from today's procedural pipeline:
//   Today: a single function knows about every entity kind and computes
//          coordinates directly.
//   v2:    each entity computes its own intrinsic height (text-size +
//          padding + content) and reports it. Parents stack.
//
// The measure pass deliberately stays cheap — no DOM, no string layout
// engine. We approximate text widths with a per-char heuristic the same
// way the production renderer does today; that's good enough for
// validating the architectural shape.

import type { TimeScale, BandScale } from './scales.js';
import type { Box, PositionedItem, PositionedSwimlane } from './positioned.js';

/**
 * Symmetric inset (px) between an item's logical column and its visible bar.
 * Matches production's `<g transform="translate(6,0)">` + `width=108` inside
 * a 120-px logical week column. Inset on both sides means adjacent items
 * always have a 12-px visible gutter.
 */
export const ITEM_INSET_PX = 6;

/** Vertical gap between shelf-packed rows inside a swimlane. */
const ROW_GAP_PX = 8;

/** Inner padding (px) between the bar's left edge and the title text. */
const TEXT_INSET_PX = 12;

/**
 * Gap (px) between the bar's right edge and overflow text. Smaller than
 * `TEXT_INSET_PX` so the text reads as belonging to this bar — adjacent
 * bars are at least `2 * ITEM_INSET_PX = 12` away, so the text still has
 * a clear visual home.
 */
const TEXT_OUTSIDE_GAP_PX = 4;

// ---- Frame-tab geometry ---------------------------------------------------
// PlantUML-style chiclet pinned to the band's top-left corner. Items in the
// same row top-align with the tab when they don't horizontally overlap it;
// otherwise they shift down to clear it.

/** Offset from band.y to the tab's top edge. Doubles as the compact top-pad. */
const TAB_TOP_OFFSET_PX = 10;
/** Offset from band.x to the tab's left edge. */
const TAB_LEFT_OFFSET_PX = 10;
/** Inner left/right padding inside the tab between border and text. */
const TAB_TEXT_INSET_PX = 10;
/** Tab height in px. */
const TAB_HEIGHT_PX = 22;
/** Font-size used when measuring the tab's intrinsic width. */
const TAB_FONT_SIZE_PX = 12;

function computeTabBox(bandX: number, bandY: number, title: string): Box {
    const width = Math.ceil(estimateTextWidth(title, TAB_FONT_SIZE_PX) + 2 * TAB_TEXT_INSET_PX);
    return {
        x: bandX + TAB_LEFT_OFFSET_PX,
        y: bandY + TAB_TOP_OFFSET_PX,
        width,
        height: TAB_HEIGHT_PX,
    };
}

export interface Constraints {
    time: TimeScale;
    /** The band slot the parent reserved for this entity (top-left + size). */
    bandTop: number;
    bandHeight: number;
    /**
     * Horizontal bounds of the band background (canvas-padding inset, NOT
     * the timeline column bounds). Defaults to `time.range()` when absent.
     */
    bandX?: number;
    bandWidth?: number;
}

export interface IntrinsicSize {
    /** What I want my width to be. Items get this from `time.forward(end)-forward(start)`. */
    width: number;
    /** What I want my height to be. Bubbles up to the parent BandScale. */
    height: number;
}

export interface ItemIntrinsicSize extends IntrinsicSize {
    /** Visible bar width (logical column - 2*ITEM_INSET_PX). */
    barWidth: number;
    /**
     * Width the item's text needs given title + meta (incl. internal
     * padding). The shelf-packer uses this to detect overflow into the
     * next column and bump the item to a new row.
     */
    intrinsicTextWidth: number;
}

export interface Renderable<P> {
    id: string;
    /** Compute the intrinsic size we want. Pure; idempotent. */
    measure(c: Constraints): IntrinsicSize;
    /**
     * Place this node at `origin` and emit its positioned form.
     * Children placement happens inside this call.
     */
    place(origin: { x: number; y: number }, c: Constraints): P;
}

// ---- Text width heuristic --------------------------------------------------

/**
 * Approximate rendered width of a string at a given font size. Same heuristic
 * the production layout uses today — char count × fontSize × 0.55. Good enough
 * to detect overflow in the prototype; an exact measure would require a real
 * text shaper (svg-text-bbox, OpenType, etc.).
 */
export function estimateTextWidth(text: string, fontSizePx: number): number {
    return text.length * fontSizePx * 0.55;
}

// ---- Item ------------------------------------------------------------------

export interface ItemInput {
    id: string;
    title: string;
    start: Date;
    end: Date;
    status: 'planned' | 'in-progress' | 'done' | 'at-risk' | 'blocked';
    /** 0..1 — fraction *remaining*. (status:done forces 0.) */
    remaining: number;
    /** Resolved `text-size` in pixels (the v2 height-from-content driver). */
    textSizePx: number;
    /** Resolved `padding` in pixels. */
    paddingPx: number;
    /** Raw duration literal (e.g. "2w") for the meta line. */
    duration: string;
    /** Raw `remaining` percent (0..100) or `undefined` if unspecified. */
    remainingPercent?: number;
}

const META_FONT_SIZE_PX = 11;
const TITLE_FONT_SIZE_PX = 13;

export class ItemNode implements Renderable<PositionedItem> {
    constructor(public readonly input: ItemInput) {}

    get id(): string {
        return this.input.id;
    }

    /**
     * Width comes from the time scale (logical column); barWidth is the visible
     * inset rectangle. Height = title + meta + 2*padding.
     */
    measure(c: Constraints): ItemIntrinsicSize {
        const left = c.time.forward(this.input.start);
        const right = c.time.forward(this.input.end);
        const width = Math.max(8, right - left);
        const barWidth = Math.max(8, width - ITEM_INSET_PX * 2);

        const meta = this.formatMeta();
        const intrinsicTextWidth =
            Math.max(
                estimateTextWidth(this.input.title, TITLE_FONT_SIZE_PX),
                estimateTextWidth(meta, META_FONT_SIZE_PX),
            ) + this.input.paddingPx * 2;

        // Height = title line-height + meta line-height + padding top+bottom.
        const lineHeight = this.input.textSizePx * 1.4;
        const titleLine = lineHeight;
        const metaLine = Math.round(lineHeight * 0.8);
        const height = titleLine + metaLine + this.input.paddingPx * 2;
        return { width, barWidth, intrinsicTextWidth, height };
    }

    place(origin: { x: number; y: number }, c: Constraints): PositionedItem {
        const intrinsic = this.measure(c);
        const meta = this.formatMeta();
        const boxX = origin.x + ITEM_INSET_PX;
        // Render text inside the bar when both lines (title + meta) fit with
        // a single inner inset. Otherwise nudge text to the right of the bar
        // so it reads cleanly instead of spilling out of the block.
        const titleWidth = estimateTextWidth(this.input.title, TITLE_FONT_SIZE_PX);
        const metaWidth = estimateTextWidth(meta, META_FONT_SIZE_PX);
        const widestLine = Math.max(titleWidth, metaWidth);
        const fitsInside = widestLine + TEXT_INSET_PX <= intrinsic.barWidth;
        const textX = fitsInside
            ? boxX + TEXT_INSET_PX
            : boxX + intrinsic.barWidth + TEXT_OUTSIDE_GAP_PX;
        return {
            id: this.input.id,
            title: this.input.title,
            box: {
                x: boxX,
                y: origin.y,
                width: intrinsic.barWidth,
                height: intrinsic.height,
            },
            status: this.input.status,
            remaining: this.input.status === 'done' ? 0 : Math.max(0, Math.min(1, this.input.remaining)),
            row: 0,
            metaText: meta,
            textX,
        };
    }

    /** "1w", "2w - 50% remaining" — second line under the title. */
    formatMeta(): string {
        const isDone = this.input.status === 'done';
        const pct = this.input.remainingPercent;
        if (!isDone && pct !== undefined && pct > 0) {
            return `${this.input.duration} - ${pct}% remaining`;
        }
        return this.input.duration;
    }
}

// ---- Swimlane --------------------------------------------------------------

export interface SwimlaneInput {
    id: string;
    title: string;
    items: ItemInput[];
    /**
     * Distance from band top to the first item-row top. Covers the frame-tab
     * area; production reference uses 44.
     */
    topPadPx: number;
    /**
     * Distance from the last item-row bottom to the band bottom; production
     * reference uses 40.
     */
    bottomPadPx: number;
}

export class SwimlaneNode implements Renderable<PositionedSwimlane> {
    constructor(
        public readonly input: SwimlaneInput,
        private readonly itemNodes: ItemNode[] = input.items.map((i) => new ItemNode(i)),
    ) {}

    get id(): string {
        return this.input.id;
    }

    /**
     * Intrinsic height = effectiveTopPad + packed rows + bottomPad. Pack
     * here (cheap; pure function of the time scale + items) so measure and
     * place see the same row count and the same top-pad decision.
     */
    measure(c: Constraints): IntrinsicSize {
        const packed = this.shelfPack(c);
        const [r0, r1] = c.time.range();
        const desired = packed.totalHeight + packed.topPadPx + this.input.bottomPadPx;
        return {
            width: r1 - r0,
            height: Math.max(desired, c.bandHeight),
        };
    }

    place(origin: { x: number; y: number }, c: Constraints): PositionedSwimlane {
        const intrinsic = this.measure(c);
        const packed = this.shelfPack(c);
        const bandX = c.bandX ?? c.time.range()[0];
        const bandWidth = c.bandWidth ?? c.time.range()[1] - c.time.range()[0];
        const tab = computeTabBox(bandX, origin.y, this.input.title);

        const children: PositionedItem[] = packed.assignments.map(({ node, row, intrinsic: im }) => {
            const itemX = c.time.forward(node.input.start);
            const itemY = origin.y + packed.topPadPx + row * (im.height + ROW_GAP_PX);
            const placed = node.place({ x: itemX, y: itemY }, c);
            return { ...placed, row };
        });

        return {
            id: this.input.id,
            title: this.input.title,
            band: { x: bandX, y: origin.y, width: bandWidth, height: intrinsic.height },
            tab,
            children,
        };
    }

    /**
     * Shelf-pack items into rows. For each item (in start order) we walk the
     * existing rows and drop it into the first one where its barLeft is past
     * the previous item's required visual right (max of barRight and intrinsic
     * text right). If no row fits, we open a new row.
     *
     * Also chooses the lane's effective top pad: if no row-0 item overlaps
     * the frame tab horizontally, row 0 sits at band.y + TAB_TOP_OFFSET_PX
     * (top-aligned with the tab). If any row-0 item would visually collide
     * with the tab, the lane uses the configured `topPadPx` so the items
     * clear the tab.
     */
    private shelfPack(c: Constraints): {
        assignments: { node: ItemNode; row: number; intrinsic: ItemIntrinsicSize }[];
        rowCount: number;
        totalHeight: number;
        topPadPx: number;
    } {
        type ShelfEntry = { rightEdge: number; rowHeight: number };
        const sorted = [...this.itemNodes].sort(
            (a, b) => a.input.start.getTime() - b.input.start.getTime(),
        );
        const rows: ShelfEntry[] = [];
        const assignments: {
            node: ItemNode;
            row: number;
            intrinsic: ItemIntrinsicSize;
            barLeft: number;
            barRight: number;
        }[] = [];
        for (const node of sorted) {
            const im = node.measure(c);
            const barLeft = c.time.forward(node.input.start) + ITEM_INSET_PX;
            const barRight = barLeft + im.barWidth;
            const requiredRight = barLeft + Math.max(im.barWidth, im.intrinsicTextWidth);
            let placedRow = -1;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].rightEdge <= barLeft) {
                    placedRow = i;
                    rows[i] = {
                        rightEdge: requiredRight,
                        rowHeight: Math.max(rows[i].rowHeight, im.height),
                    };
                    break;
                }
            }
            if (placedRow === -1) {
                rows.push({ rightEdge: requiredRight, rowHeight: im.height });
                placedRow = rows.length - 1;
            }
            assignments.push({ node, row: placedRow, intrinsic: im, barLeft, barRight });
        }
        const rowHeights = rows.map((r) => r.rowHeight);
        const totalHeight =
            rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rows.length - 1) * ROW_GAP_PX;

        // Decide the lane's top pad. Compact (top-align with the tab) when no
        // row-0 item overlaps the tab's horizontal span; expanded otherwise.
        const bandX = c.bandX ?? c.time.range()[0];
        const tabLeft = bandX + TAB_LEFT_OFFSET_PX;
        const tabRight =
            tabLeft +
            Math.ceil(estimateTextWidth(this.input.title, TAB_FONT_SIZE_PX) + 2 * TAB_TEXT_INSET_PX);
        const row0Overlaps = assignments
            .filter((a) => a.row === 0)
            .some((a) => a.barLeft < tabRight && a.barRight > tabLeft);
        const topPadPx = row0Overlaps
            ? this.input.topPadPx
            : Math.min(this.input.topPadPx, TAB_TOP_OFFSET_PX);

        return {
            assignments: assignments.map(({ node, row, intrinsic }) => ({ node, row, intrinsic })),
            rowCount: rows.length,
            totalHeight,
            topPadPx,
        };
    }
}

// ---- Roadmap -----------------------------------------------------------------

export interface PlacedRoadmap {
    swimlanes: PositionedSwimlane[];
    /** Total height of all stacked swimlanes (after measure-then-place). */
    totalHeight: number;
}

export class RoadmapNode {
    constructor(public readonly swimlanes: SwimlaneNode[]) {}

    /**
     * Stack swimlanes vertically. Each lane's intrinsic height feeds the
     * BandScale via `paddingInner`, so `defaults > spacing` would just be a
     * paddingInner value here. (For the prototype we use a simple stack.)
     */
    place(
        originY: number,
        c: Omit<Constraints, 'bandTop' | 'bandHeight'>,
        bands: BandScale,
    ): PlacedRoadmap {
        const placed: PositionedSwimlane[] = [];
        let cursorY = originY;
        for (const lane of this.swimlanes) {
            const bandTop = bands.forward(lane.id);
            const bandHeight = bands.bandwidth();
            const ctx: Constraints = {
                time: c.time,
                bandTop,
                bandHeight,
                bandX: c.bandX,
                bandWidth: c.bandWidth,
            };
            const placedLane = lane.place({ x: c.bandX ?? c.time.range()[0], y: bandTop }, ctx);
            placed.push(placedLane);
            cursorY = bandTop + placedLane.band.height;
        }
        return {
            swimlanes: placed,
            totalHeight: cursorY - originY,
        };
    }
}
