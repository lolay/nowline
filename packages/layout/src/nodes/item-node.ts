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
// `textX`, and the title lines to paint. The shape is byte-stable with
// the legacy sequenceItem arithmetic when fed the same inputs and the
// title fits on one line.
//
// Caption fit decision (`fitItemCaption`), in order:
//   1. Title fits one line AND the meta line fits: in-bar, one line.
//   2. Otherwise, if the meta line fits and a greedy whitespace
//      word-wrap of the title gives at most
//      `ITEM_CAPTION_TITLE_MAX_LINES` lines (>= 2), each within the
//      inner width: in-bar, wrapped.
//   3. Otherwise: spill to the right of the bar as a single line.

import { ITEM_CAPTION_TITLE_MAX_LINES, itemCaptionInsetX } from '../item-bar-geometry.js';
import type {
    IntrinsicSize,
    MeasureContext,
    PlaceContext,
    Point,
    Renderable,
} from '../renderable.js';
import { estimateTextWidth, wrapText } from '../text-measure.js';
import { ITEM_INSET_PX, MIN_ITEM_WIDTH } from '../themes/shared.js';
import type { BoundingBox } from '../types.js';

/**
 * Inner padding applied on the RIGHT of the title text (the left inset
 * comes from `itemCaptionInsetX`, which adds the link-icon column when
 * present) — the bar's inner-padded text area is
 * `box.width - itemCaptionInsetX(..) - TEXT_INSET_PX` wide. Text wraps
 * or spills past the bar when either the title or the meta line
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
    /**
     * Extra horizontal width (px) appended to the meta line for spill
     * detection — covers content the renderer paints after `metaText` but
     * that the layout assembles as a structured trailing element rather
     * than a string (currently: the capacity suffix). The layout adds this
     * to the meta-line's measured width before deciding whether the
     * caption block fits inside the bar.
     *
     * Defaults to 0. Title spill checks ignore this value (the suffix
     * never renders on the title line).
     */
    metaTrailingWidth?: number;
    /**
     * True when the bar shows a link icon in its upper-left corner.
     * Caption text indents past the icon column so the title doesn't
     * collide with the icon.
     */
    hasLinkIcon?: boolean;
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
    /**
     * The title as it should be painted, one entry per line. Always has
     * at least one entry. Exactly two entries (never more than
     * `ITEM_CAPTION_TITLE_MAX_LINES`) when the title word-wrapped inside
     * the bar; otherwise `[title]`, including when the title spills to
     * the right (a spilled caption is always a single line).
     */
    titleLines: string[];
}

/**
 * Estimated width (px) of an item's whole meta line: `metaText` plus the
 * trailing capacity suffix (`trailingWidth`, 0 when there is none). Zero
 * when the item has no meta line. Shared with the row-height predictor so
 * both feed `fitItemCaption` the same number.
 */
export function estimateItemMetaWidth(metaText: string | undefined, trailingWidth: number): number {
    const metaTextWidth = metaText ? estimateTextWidth(metaText, META_FONT_SIZE_PX) : 0;
    return metaTextWidth + trailingWidth;
}

export interface ItemCaptionFit {
    /** True when the caption must render to the right of the bar. */
    textSpills: boolean;
    /** Title lines to paint; see `PlacedItemGeometry.titleLines`. */
    titleLines: string[];
}

/**
 * Decide how an item's caption sits relative to its bar: one line
 * in-bar, word-wrapped in-bar, or spilled to the right. This is the
 * single source of truth for the decision; `ItemNode.place` and the
 * row-height predictor in `layout.ts` both call it so predicted and
 * placed geometry agree.
 *
 * `metaWidth` is the full estimated width of the meta line (text plus
 * any trailing capacity suffix), or 0 when the item has no meta line.
 * A meta line is never wrapped, so one that is wider than `innerWidth`
 * forces a spill even when the title alone would wrap.
 *
 * Words never break mid-word: a single word wider than `innerWidth`, or
 * a title that needs more than `ITEM_CAPTION_TITLE_MAX_LINES` lines,
 * spills.
 */
export function fitItemCaption(
    title: string,
    innerWidth: number,
    metaWidth: number,
): ItemCaptionFit {
    const titleOverflows =
        title.length > 0 && estimateTextWidth(title, TITLE_FONT_SIZE_PX) > innerWidth;
    const metaOverflows = metaWidth > innerWidth;
    if (!titleOverflows && !metaOverflows) {
        return { textSpills: false, titleLines: [title] };
    }
    if (titleOverflows && !metaOverflows) {
        const lines = wrapText(title, innerWidth, TITLE_FONT_SIZE_PX);
        // `lines.length >= 2` keeps single-line behavior byte-identical: a
        // title that only "overflows" because of repeated whitespace in
        // the raw string (the estimate counts every space) normalizes to
        // one line, and that case still spills exactly as it always has.
        if (
            lines.length >= 2 &&
            lines.length <= ITEM_CAPTION_TITLE_MAX_LINES &&
            lines.every((line) => estimateTextWidth(line, TITLE_FONT_SIZE_PX) <= innerWidth)
        ) {
            return { textSpills: false, titleLines: lines };
        }
    }
    return { textSpills: true, titleLines: [title] };
}

export class ItemNode implements Renderable<PlacedItemGeometry> {
    constructor(public readonly input: ItemNodeInput) {}

    get id(): string {
        return this.input.id;
    }

    measure(ctx: MeasureContext): IntrinsicSize {
        const naturalWidth = Math.max(
            MIN_ITEM_WIDTH,
            this.input.logicalRightX - this.input.logicalLeftX,
        );
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
            height: intrinsic.height,
        };

        // The link icon (when present) lives in the bar's upper-left
        // and shares the title's vertical band. The caption indents
        // past the icon so the title doesn't render on top of it.
        const captionLeftInset = itemCaptionInsetX(!!this.input.hasLinkIcon);
        const innerWidth = Math.max(0, visualWidth - captionLeftInset - TEXT_INSET_PX);
        const titleStr = this.input.title;
        // Trailing decoration (capacity suffix) renders to the right of
        // metaText. When metaText is empty the suffix sits at the
        // caption's leading edge, so its width is the entire meta-line
        // budget; when both exist the suffix needs a small separator gap
        // (rendered via `<tspan dx>` later) included in trailingWidth.
        const metaWidth = estimateItemMetaWidth(
            this.input.metaText,
            this.input.metaTrailingWidth ?? 0,
        );
        const { textSpills, titleLines } = fitItemCaption(titleStr, innerWidth, metaWidth);
        const textX = textSpills
            ? boxX + visualWidth + TEXT_OUTSIDE_GAP_PX
            : boxX + captionLeftInset;

        return {
            id: this.input.id,
            box,
            textX,
            textSpills,
            titleLines,
        };
    }
}
