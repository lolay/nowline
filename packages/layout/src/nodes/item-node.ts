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
//
// The caption's left edge (`itemCaptionInsetX`) clears the link tile and
// the `after:` inline-date glyph in the bar's upper-left. The inset
// applies to EVERY caption line, so the left edge stays straight.
//
// The FIRST title line has a narrower budget than the rest: it shares
// the bar's upper-right with the status dot, footnote digits and the
// `before:` glyph, so it stops short of that cluster
// (`itemTitleFirstLineRightReservePx`). Line 2+ and the meta line sit
// below the cluster and keep the full inner width.
//
// Explicit breaks (lolay/nowline#60): a newline in the title is a hard
// line break and the author's lines are authoritative. No auto-wrap
// runs on them and the two-line cap does not apply. The caption stays
// in-bar when line 1 fits the first-line width, every other line fits
// the inner width and the meta line fits; otherwise it spills right as
// a multi-line block with its breaks preserved.

import {
    ITEM_CAPTION_TITLE_MAX_LINES,
    itemCaptionInsetX,
    itemTitleFirstLineRightReservePx,
} from '../item-bar-geometry.js';
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
 * comes from `itemCaptionInsetX`, which adds the link-icon column and
 * the `after:` glyph column when present) — the bar's inner-padded text area is
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
    /**
     * True when the item carries an inline `after:DATE`, which paints a
     * calendar glyph in the bar's upper-left (right of the link tile
     * when there is one). Caption text indents past the glyph so the
     * title doesn't run under it. The glyph spills out of a bar narrower
     * than `MIN_BAR_WIDTH_FOR_INLINE_DATE_PX`; `place` checks the placed
     * bar width and reserves nothing in that case.
     */
    hasAfterGlyph?: boolean;
    /**
     * Space (px) the title's FIRST line leaves free at the bar's right
     * edge, so it clears the status dot, footnote digits and `before:`
     * glyph in the upper-right. Layout computes it with
     * `itemTitleFirstLineRightReservePx` once it knows the item's
     * footnotes and `before:` date. Defaults to the status-dot-only
     * reserve for the placed bar width, because the dot is always
     * present.
     */
    titleFirstLineRightReservePx?: number;
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
     * `ITEM_CAPTION_TITLE_MAX_LINES`) when the title auto-wrapped inside
     * the bar; the author's own lines when the title has explicit breaks
     * (any count, in-bar or spilled); otherwise `[title]`, including
     * when a break-free title spills to the right.
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
 * The lines of a title that contains an explicit line break, or
 * `undefined` for a title with none (the common case, left untouched).
 *
 * `\r\n` and a lone `\r` count as `\n`, each line is trimmed, and
 * leading and trailing empty lines are dropped. Interior empty lines
 * stay as blank lines. A title that is only breaks and whitespace gives
 * `[]`; one that has a single line left after trimming (`"Plan\n"`)
 * gives one line, and callers then treat it as an ordinary single-line
 * title: a break at either end cannot separate anything.
 *
 * Langium's string converter has already turned the source escape `\n`
 * into a real newline and `\\n` into the two characters `\` `n`, so
 * only the former reaches here as a break.
 */
export function titleBreakLines(title: string): string[] | undefined {
    if (!/[\r\n]/.test(title)) return undefined;
    const lines = title
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim());
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start] === '') start += 1;
    while (end > start && lines[end - 1] === '') end -= 1;
    return lines.slice(start, end);
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
 * `firstLineWidth` (default `innerWidth`) is the budget for the title's
 * first line alone, narrower than `innerWidth` by the top-right
 * decoration cluster. It governs both the single-line fit check and
 * line 1 of a wrapped title; later lines and the meta line use
 * `innerWidth`.
 *
 * Words never break mid-word: a single word wider than its line's
 * budget, or a title that needs more than `ITEM_CAPTION_TITLE_MAX_LINES`
 * lines, spills.
 *
 * A title with an explicit line break (see `titleBreakLines`) skips all
 * of the above: its lines are authoritative and are returned as
 * `titleLines` whether the caption stays in-bar or spills.
 */
export function fitItemCaption(
    rawTitle: string,
    innerWidth: number,
    metaWidth: number,
    firstLineWidth: number = innerWidth,
): ItemCaptionFit {
    let title = rawTitle;
    const broken = titleBreakLines(rawTitle);
    if (broken) {
        if (broken.length >= 2) {
            // Explicit breaks: the author's lines are authoritative, so no
            // auto-wrap and no line cap. In-bar only when line 1 fits the
            // first-line width, every other line fits the inner width and
            // the meta line fits; otherwise the whole block spills right.
            const fits =
                metaWidth <= innerWidth &&
                broken.every(
                    (line, n) =>
                        estimateTextWidth(line, TITLE_FONT_SIZE_PX) <=
                        (n === 0 ? firstLineWidth : innerWidth),
                );
            return { textSpills: !fits, titleLines: broken };
        }
        // Zero or one line left after trimming: an ordinary title, now
        // free of its stray break.
        title = broken[0] ?? '';
    }
    const titleOverflows =
        title.length > 0 && estimateTextWidth(title, TITLE_FONT_SIZE_PX) > firstLineWidth;
    const metaOverflows = metaWidth > innerWidth;
    if (!titleOverflows && !metaOverflows) {
        return { textSpills: false, titleLines: [title] };
    }
    if (titleOverflows && !metaOverflows) {
        const lines = wrapText(title, innerWidth, TITLE_FONT_SIZE_PX, firstLineWidth);
        // `lines.length >= 2` keeps single-line behavior byte-identical: a
        // title that only "overflows" because of repeated whitespace in
        // the raw string (the estimate counts every space) normalizes to
        // one line, and that case still spills exactly as it always has.
        if (
            lines.length >= 2 &&
            lines.length <= ITEM_CAPTION_TITLE_MAX_LINES &&
            lines.every(
                (line, n) =>
                    estimateTextWidth(line, TITLE_FONT_SIZE_PX) <=
                    (n === 0 ? firstLineWidth : innerWidth),
            )
        ) {
            return { textSpills: false, titleLines: lines };
        }
    }
    return { textSpills: true, titleLines: [title] };
}

/**
 * The title lines an item finally paints. `fit` is the caption-fit
 * decision; `forcedSpill` is true when something outside it pushes the
 * caption out of the bar anyway (a narrow-bar link icon, `iconSpills`).
 * Shared by `sequenceItem` and the row-height predictor so the two
 * agree on the line count.
 *
 *   - Explicit breaks keep the author's lines, in-bar or spilled.
 *   - An auto-wrap (two lines) survives only while the caption stays
 *     in-bar; a spilled break-free title is one line.
 *   - Otherwise a single line: the title, minus any stray break at
 *     either end.
 */
export function resolveCaptionTitleLines(
    title: string,
    fit: ItemCaptionFit,
    forcedSpill: boolean,
): string[] {
    const broken = titleBreakLines(title);
    if (broken && broken.length >= 2) return broken;
    if (!fit.textSpills && !forcedSpill && fit.titleLines.length >= 2) return fit.titleLines;
    return [broken ? (broken[0] ?? '') : title];
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

        // The link icon and the `after:` glyph (when present) live in the
        // bar's upper-left and share the title's vertical band. The
        // caption indents past them so the title doesn't render on top.
        const captionLeftInset = itemCaptionInsetX(
            !!this.input.hasLinkIcon,
            this.input.hasAfterGlyph ? { barWidth: visualWidth } : undefined,
        );
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
        const firstLineWidth = Math.max(
            0,
            visualWidth -
                captionLeftInset -
                (this.input.titleFirstLineRightReservePx ??
                    itemTitleFirstLineRightReservePx({
                        barWidth: visualWidth,
                        footnoteLabels: [],
                        hasBeforeGlyph: false,
                    })),
        );
        const { textSpills, titleLines } = fitItemCaption(
            titleStr,
            innerWidth,
            metaWidth,
            firstLineWidth,
        );
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
