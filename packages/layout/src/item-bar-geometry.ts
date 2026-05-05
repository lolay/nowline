// Item-bar internal geometry — the "rails" inside an item rectangle:
// caption text (title + meta), label chips along the bottom, status
// dot at the upper-right, footnote indicators just left of the dot,
// and the link icon tile at the bottom-right.
//
// These metrics are shared between layout (label-chip placement,
// future content-aware width estimation) and renderer (text baselines
// + glyph positions). Keeping them in one module means a single edit
// re-skins every item bar consistently — the alternative is hunting
// matching `+ 12`s across two packages.
//
// Coordinate convention: every offset is **relative to the item's
// `box`** (`box.x` for X, `box.y` for Y), with `box.height` /
// `box.width` used as the "right edge" / "bottom edge" anchor where
// noted.

// ---- Caption (title + meta text) ---------------------------------

/** Horizontal inset (px) for the caption's left edge inside the bar. */
export const ITEM_CAPTION_INSET_X_PX = 12;

/**
 * When the bar's title would overflow to the right, layout sets
 * `textSpills` and the caption renders to the RIGHT of the bar; this
 * is the gap (px) between the bar's right edge and the spilled
 * caption.
 */
export const ITEM_CAPTION_SPILL_GAP_PX = 6;

/** Baseline Y of the title text relative to the bar's top. */
export const ITEM_CAPTION_TITLE_BASELINE_OFFSET_PX = 20;

/** Baseline Y of the meta text (second line) relative to the bar's top. */
export const ITEM_CAPTION_META_BASELINE_OFFSET_PX = 38;

/** Font size (px) of the title text. */
export const ITEM_CAPTION_TITLE_FONT_SIZE_PX = 13;

/** Font size (px) of the meta text. */
export const ITEM_CAPTION_META_FONT_SIZE_PX = 11;

// ---- Status dot (upper-right glyph) ------------------------------

/** Distance (px) from the bar's right edge to the dot's center. */
export const ITEM_STATUS_DOT_INSET_RIGHT_PX = 12;

/** Distance (px) from the bar's top edge to the dot's center. */
export const ITEM_STATUS_DOT_INSET_TOP_PX = 12;

/** Radius (px) of the status dot. */
export const ITEM_STATUS_DOT_RADIUS_PX = 5;

// ---- Footnote indicators (numbers next to status dot) ------------

/**
 * X offset (px from bar's right edge) where the rightmost footnote
 * digit's anchor sits. Tuned to leave room for the status dot.
 */
export const ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX = 22;

/** Baseline Y (px from bar's top) for footnote indicator digits. */
export const ITEM_FOOTNOTE_INDICATOR_BASELINE_OFFSET_PX = 14;

/**
 * Horizontal step (px) between consecutive footnote indicators when
 * an item carries more than one footnote — they walk LEFT from the
 * status dot.
 */
export const ITEM_FOOTNOTE_INDICATOR_STEP_PX = 8;

// ---- Link icon tile (bottom-right) -------------------------------

/** Side length (px) of the square link-icon tile. */
export const ITEM_LINK_ICON_TILE_SIZE_PX = 14;

/** Distance (px) from the bar's right/bottom edges to the tile's edge. */
export const ITEM_LINK_ICON_INSET_PX = 6;

// ---- Narrow-bar decoration spill --------------------------------

/**
 * Horizontal gap (px) between consecutive decorations (status dot,
 * link icon, footnote, title) when they spill into the column to
 * the right of a bar that's too narrow to host them inside.
 */
export const ITEM_DECORATION_SPILL_GAP_PX = 4;

/**
 * Minimum bar width (px) needed to host the status dot inside the
 * bar with its full inset. Below this, the dot would have to
 * extend past the bar's left edge, so the dot spills into the
 * caption column to the right of the bar instead.
 */
export const MIN_BAR_WIDTH_FOR_DOT_PX =
    ITEM_STATUS_DOT_INSET_RIGHT_PX + ITEM_STATUS_DOT_RADIUS_PX;

/**
 * Minimum bar width (px) needed to host the link-icon tile AND the
 * status dot inside the bar with at least
 * `ITEM_DECORATION_SPILL_GAP_PX` of breathing room between them.
 * Below this, the link icon would visually collide with (or push
 * into) the dot's column, so the icon spills out and renders ahead
 * of the (also-spilled) title.
 */
export const MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX =
    ITEM_LINK_ICON_INSET_PX +
    ITEM_LINK_ICON_TILE_SIZE_PX +
    ITEM_DECORATION_SPILL_GAP_PX +
    ITEM_STATUS_DOT_INSET_RIGHT_PX +
    ITEM_STATUS_DOT_RADIUS_PX;

/**
 * Minimum bar width (px) needed to host the footnote indicator at
 * its inset-right position without overshooting the bar's left
 * edge or colliding with a leading link icon. Approximate width
 * for one digit is 8px (font-size 10, bold).
 */
export const MIN_BAR_WIDTH_FOR_FOOTNOTE_PX =
    ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX + 1;

// ---- Label chips (along the bar's bottom) ------------------------

/** Height (px) of a label chip rectangle. */
export const LABEL_CHIP_HEIGHT_PX = 13;

/**
 * Vertical gap (px) between the top of the bottom progress strip and
 * the BOTTOM of a label chip. Keeps chips from touching the strip and
 * gives a clear visual rail.
 */
export const LABEL_CHIP_GAP_ABOVE_PROGRESS_STRIP_PX = 3;

/** Horizontal gap (px) between consecutive chips in a row. */
export const LABEL_CHIP_GAP_BETWEEN_PX = 4;

/**
 * Vertical gap (px) between two stacked chip rows when chips spill
 * outside the bar and form a multi-row column to the right.
 */
export const LABEL_CHIP_ROW_GAP_PX = 4;

/**
 * Vertical row pitch (px) for a stacked chip column — chip height +
 * inter-row gap.
 */
export const LABEL_CHIP_ROW_STEP_PX =
    LABEL_CHIP_HEIGHT_PX + LABEL_CHIP_ROW_GAP_PX;

/**
 * Slack budget (fraction) applied ONCE per item when chips spill
 * outside the bar. If a chip would overflow its row by less than
 * `SPILL_ROW_SLACK_FRACTION × chip.width`, the row is allowed to
 * stretch by the overflow amount and keep the chip on it instead of
 * wrapping. This rescues "lonely chip" cases where one chip just
 * barely overshoots; once the slack is consumed, no further row
 * expansions happen for that item.
 */
export const SPILL_ROW_SLACK_FRACTION = 0.25;

export interface ChipRowSample<T> {
    id: T;
    width: number;
}

export interface SpillChipPack<T> {
    /** Rows ordered top-to-bottom — `rows[0]` sits at the chip
     *  column's top y, `rows[1]` one `LABEL_CHIP_ROW_STEP_PX` below,
     *  and so on. */
    rows: ChipRowSample<T>[][];
    /** True when the slack rule was used to keep an extra chip on
     *  row 0 (or whichever row was being filled when the overflow
     *  happened). At most one expansion per item. */
    expanded: boolean;
}

/**
 * Pack `chips` into rows for the SPILL column to the right of an
 * item bar. Each row is capped at `barVisualWidth` (with gaps
 * between chips). When a chip would overflow:
 *
 * - If the row is empty, place the chip anyway (a chip wider than
 *   the cap occupies its own row).
 * - Else if the slack rule applies (`overflow ≤ 0.25 × chip.width`)
 *   AND the slack hasn't already been used for this item, expand
 *   the current row by `overflow` and keep the chip on it.
 * - Else wrap the chip to a fresh row.
 */
export function packSpillChips<T>(
    chips: ChipRowSample<T>[],
    barVisualWidth: number,
): SpillChipPack<T> {
    if (chips.length === 0) return { rows: [[]], expanded: false };
    const rows: ChipRowSample<T>[][] = [[]];
    let used = 0;
    let rowCap = barVisualWidth;
    let expanded = false;
    for (const chip of chips) {
        const row = rows[rows.length - 1];
        const needed = (row.length === 0 ? 0 : LABEL_CHIP_GAP_BETWEEN_PX) + chip.width;
        const wouldBe = used + needed;
        if (wouldBe <= rowCap) {
            row.push(chip);
            used = wouldBe;
            continue;
        }
        if (row.length === 0) {
            row.push(chip);
            used = chip.width;
            continue;
        }
        const overflow = wouldBe - rowCap;
        const slack = chip.width * SPILL_ROW_SLACK_FRACTION;
        if (!expanded && overflow <= slack) {
            row.push(chip);
            used = wouldBe;
            rowCap = wouldBe;
            expanded = true;
            continue;
        }
        rows.push([chip]);
        used = chip.width;
        rowCap = barVisualWidth;
    }
    return { rows, expanded };
}
