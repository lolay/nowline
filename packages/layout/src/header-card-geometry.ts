// Header card geometry — sizing and text-stack metrics for the
// "header card" that sits beside the timeline (title + author block).
//
// Layout owns the card *size* (computed up-front in `sizeBesideHeader`
// from wrapped title/author text). The renderer paints the rectangle +
// text using the *same* paddings, line heights, and font sizes so the
// card is laid out and drawn consistently.
//
// Bumping any of these constants changes the visible size of the
// header card and the position of every text line inside it. Always
// keep the layout's `sizeBesideHeader` and the renderer's
// `renderHeader` aligned by going through this module.

/** Horizontal padding (px) inside the card from edge to text. */
export const HEADER_CARD_PADDING_X = 16;

/**
 * Top padding (px) — measured to the BASELINE of the first title
 * line. Larger than a typical "padding top" because it includes the
 * cap-to-baseline distance for the 16 pt title font.
 */
export const HEADER_CARD_PADDING_TOP = 26;

/**
 * Bottom padding (px) below the descender of the last text line.
 * Symmetric-feeling visual padding (smaller than `PADDING_TOP` since
 * top includes the cap-to-baseline distance).
 */
export const HEADER_CARD_PADDING_BOTTOM = 14;

/** Baseline-to-baseline spacing between consecutive title lines. */
export const HEADER_TITLE_LINE_HEIGHT_PX = 20;

/** Baseline-to-baseline spacing between consecutive author lines. */
export const HEADER_AUTHOR_LINE_HEIGHT_PX = 14;

/**
 * Vertical gap (px) between the LAST title baseline and the FIRST
 * author baseline. Larger than a normal line height because it spans
 * the title's descender + the author's cap height.
 */
export const HEADER_TITLE_TO_AUTHOR_GAP_PX = 18;

/** Font size (px) of the title text. */
export const HEADER_TITLE_FONT_SIZE_PX = 16;

/** Font size (px) of the author text (subtitle). */
export const HEADER_AUTHOR_FONT_SIZE_PX = 11;
