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
