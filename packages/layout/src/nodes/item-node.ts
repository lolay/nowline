// ItemNode — first Renderable entity in the m2.5c port. Owns the
// geometry of a single item bar: its visual box (insets + height) and
// its caption x (inside vs. spilled past the bar).
//
// Constructed from already-resolved inputs (start/end x, status,
// remaining, meta text) so this node stays small and pure. The
// dependency-resolution logic in layout.ts (after/before chains,
// cursor.x, footnote indexing) remains where it is for now; m2.5c's
// remaining work is to migrate the rest into sibling node files.
//
// `measure(ctx)` returns the bar's intrinsic size. `place(origin,
// ctx)` returns a `PositionedItem`-shaped fragment with the box, row,
// and `textX`. The shape is byte-stable with the legacy sequenceItem
// arithmetic when fed the same inputs.

import type { BoundingBox } from '../types.js';
import type { Renderable, MeasureContext, PlaceContext, IntrinsicSize, Point } from '../renderable.js';
import { ITEM_INSET_PX, MIN_ITEM_WIDTH } from '../themes/shared.js';

/**
 * Inner padding applied on each side of the title text — the bar's
 * inner-padded text area is `box.width - 2 * TEXT_INSET_PX` wide.
 * Text spills past the bar when either the title or the meta line
 * exceeds that area.
 */
const TEXT_INSET_PX = 12;

/**
 * Gap (px) between the bar's right edge and overflow text. Smaller
 * than `TEXT_INSET_PX` so the text reads as belonging to this bar —
 * adjacent bars are at least `2 * ITEM_INSET_PX = 12` away, so the
 * text still has a clear visual home.
 */
const TEXT_OUTSIDE_GAP_PX = 4;

const TITLE_FONT_SIZE_PX = 13;
const META_FONT_SIZE_PX = 11;

export interface ItemNodeInput {
    id: string;
    title: string;
    /** Logical left x of the column the bar lives in. */
    logicalLeftX: number;
    /** Logical right x of the column the bar lives in. */
    logicalRightX: number;
    /** Caption text shown under the title (e.g. "1w - 50% remaining"). */
    metaText?: string;
}

export interface PlacedItemGeometry {
    id: string;
    box: BoundingBox;
    /**
     * X for the title/meta text. Equal to `box.x + TEXT_INSET_PX`
     * when text fits inside the bar; otherwise positioned just past
     * the bar's right edge so the caption reads as belonging to the
     * item rather than being clipped.
     */
    textX: number;
    /** True when text spills past the bar's right edge. */
    textSpills: boolean;
}

/** Approx. rendered width of `text` at `fontSizePx`. Same heuristic the production layout uses. */
function estimateTextWidth(text: string, fontSizePx: number): number {
    return text.length * fontSizePx * 0.55;
}

export class ItemNode implements Renderable<PlacedItemGeometry> {
    constructor(public readonly input: ItemNodeInput) {}

    get id(): string {
        return this.input.id;
    }

    measure(ctx: MeasureContext): IntrinsicSize {
        const naturalWidth = Math.max(MIN_ITEM_WIDTH, this.input.logicalRightX - this.input.logicalLeftX);
        return {
            width: naturalWidth,
            height: ctx.bands.bandwidth(),
        };
    }

    place(origin: Point, ctx: PlaceContext): PlacedItemGeometry {
        const intrinsic = this.measure(ctx);
        const visualWidth = Math.max(MIN_ITEM_WIDTH, intrinsic.width - 2 * ITEM_INSET_PX);
        const boxX = origin.x + ITEM_INSET_PX;
        const box: BoundingBox = {
            x: boxX,
            y: origin.y,
            width: visualWidth,
            height: ctx.bands.bandwidth(),
        };

        const innerWidth = Math.max(0, visualWidth - 2 * TEXT_INSET_PX);
        const titleStr = this.input.title;
        const titleWidth = titleStr ? estimateTextWidth(titleStr, TITLE_FONT_SIZE_PX) : 0;
        const metaWidth = this.input.metaText
            ? estimateTextWidth(this.input.metaText, META_FONT_SIZE_PX)
            : 0;
        const textSpills =
            (titleStr.length > 0 && titleWidth > innerWidth) ||
            (this.input.metaText !== undefined && metaWidth > innerWidth);
        const textX = textSpills
            ? boxX + visualWidth + TEXT_OUTSIDE_GAP_PX
            : boxX + TEXT_INSET_PX;

        return {
            id: this.input.id,
            box,
            textX,
            textSpills,
        };
    }
}
