// Values that are currently identical across every theme. The split is
// allowed to move: if a theme needs its own padding or shadow tuning, the
// value migrates into the Theme interface + both per-theme files. Nothing
// in the layout engine assumes a particular split.

export const SPACING_PX: Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
    none: 0,
    xs: 2,
    sm: 4,
    md: 8,
    lg: 16,
    xl: 24,
};

export const PADDING_PX: Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
    none: 0,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 20,
    xl: 32,
};

export const HEADER_HEIGHT_PX: Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
    none: 0,
    xs: 24,
    sm: 36,
    md: 56,
    lg: 80,
    xl: 112,
};

export const TEXT_SIZE_PX: Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
    none: 0,
    xs: 10,
    sm: 12,
    md: 14,
    lg: 18,
    xl: 24,
};

export const CORNER_RADIUS_PX: Record<'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full', number> = {
    none: 0,
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 20,
    full: 9999,
};

export const LOGO_SIZE_PX: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
    xs: 18,
    sm: 24,
    md: 36,
    lg: 48,
    xl: 72,
};

// Row pitch (formerly `ITEM_ROW_HEIGHT = 64`) and bar height (formerly
// `ITEM_ROW_HEIGHT - 8 = 56`) are owned by `BandScale` as of m2.5b.
// `defaultRowBand()` keeps the legacy 64/56 split byte-stable; new
// callers should consume `bandScale.step()` and `bandScale.bandwidth()`.

// Minimum item bar width so zero-duration items remain visible.
export const MIN_ITEM_WIDTH = 8;

// Height (px) of the bottom progress strip drawn along the item bar's
// bottom edge. Single source of truth used by:
//   - the renderer (strip rect height + bottom-edge offset)
//   - layout (label-chip Y reservation above the strip)
//   - milestone slack-arrow attach Y (when a predecessor's caption
//     spills past the bar's right edge, the arrow drops to the strip's
//     vertical center so it visually aligns with the progress bar
//     instead of running through the spilled text)
//
// Bumping this updates all three call sites consistently — the strip
// grows, chips lift, and the slack arrow stays centered on the strip.
export const PROGRESS_STRIP_HEIGHT_PX = 4;

// Timeline tick header band — a single row that holds the date labels
// (e.g. "Jan 05", "Feb 14"). Layout sizes the panel; the renderer
// paints the labels at a fixed baseline offset from the panel's top.
//
// Bumping the panel height without re-centering the baseline mis-centers
// the dates — keep both knobs together so a change to either one is
// visible at a glance.
export const TIMELINE_TICK_PANEL_HEIGHT_PX = 24;

/**
 * Baseline Y of the tick-label text relative to the tick panel's top.
 * Approximately vertically centers a 10 pt label in the panel.
 */
export const TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX = 15;

/**
 * Horizontal breathing room (px) added to a track-block's right edge
 * after sequencing. Applied to `group { ... }` and `parallel { ... }`
 * blocks so successive blocks don't crowd each other. Items butt up
 * against their neighbors (no gutter) — only block boundaries get this
 * gutter.
 */
export const TRACK_BLOCK_TAIL_GUTTER_PX = 8;

// Frame-tab chiclet — the rounded label tab that overhangs a swimlane
// frame and the dashed include-region border. Both surfaces share the
// same height + label baseline so the chiclets read as siblings.
//
// The `FRAME_TAB_LABEL_BASELINE_OFFSET_PX` is tuned for a 12 pt label
// roughly vertically centered in the tab; bumping the height without
// adjusting the baseline pushes labels off-center.

/** Height (px) of the frame-tab chiclet (swimlane + include region). */
export const FRAME_TAB_HEIGHT_PX = 22;

/** Baseline Y of the chiclet label relative to the tab's top edge. */
export const FRAME_TAB_LABEL_BASELINE_OFFSET_PX = 15;

/**
 * Dashed-accent pattern (px on / px off) used for two nowline accents
 * that read as "structural emphasis": the milestone vertical cut line
 * and the include-region's dashed border. Coupling them in one constant
 * keeps both surfaces visually in sync.
 *
 * Mirrors the spec samples (`stroke-dasharray="6 4"`).
 */
export const ACCENT_DASH_PATTERN = '6 4';

// Now-line pill — the rounded "now" chiclet that sits above the
// timeline at the now-line's x. Layout reserves the pill row's height
// in the timeline header AND uses NOW_PILL_WIDTH_PX/2 to keep the
// canvas wide enough that the pill never clips at the right edge
// (centered on the line, the pill extends ±half-width past it). The
// renderer paints with the same constants so the layout's reservation
// matches the painted glyph 1:1.

/** Width (px) of the rounded "now" pill above the now-line. */
export const NOW_PILL_WIDTH_PX = 36;

/** Height (px) of the rounded "now" pill. Matches the pill row band
 *  reserved at the top of the timeline. */
export const NOW_PILL_HEIGHT_PX = 16;

/** Corner radius (px) of the pill — half of `NOW_PILL_HEIGHT_PX` so
 *  the rect renders as a fully-rounded chiclet. */
export const NOW_PILL_CORNER_RADIUS_PX = NOW_PILL_HEIGHT_PX / 2;

/** Font size (px) of the "now" label inside the pill. */
export const NOW_PILL_LABEL_FONT_SIZE_PX = 10;

/** Baseline offset (px) of the label text from the pill's top edge.
 *  Tuned to vertically center a 10 pt bold glyph in a 16 px pill. */
export const NOW_PILL_LABEL_BASELINE_OFFSET_PX = NOW_PILL_HEIGHT_PX - 4;

/**
 * Horizontal inset (px) of the "now" label from the pill's squared
 * edge in flag mode. In `flag-right` mode the label sits at
 * `nowX + INSET` (left-aligned past the line); in `flag-left` mode at
 * `nowX - INSET` (right-aligned before the line). Center mode ignores
 * this — the label sits at `nowX` with `text-anchor=middle`.
 */
export const NOW_PILL_LABEL_INSET_X_PX = 6;

// Visual inset applied on each side of an item bar. Two adjacent (logically
// chained) items therefore have a 2× ITEM_INSET_PX visible gutter between
// them, leaving room for vertical drop-lines (dependency arrows, anchor /
// milestone cuts, the now-line) to pass between bars without crossing them.
export const ITEM_INSET_PX = 6;

// Canonical content gutter — the rest-state spacing between adjacent
// pieces of chart content. Used for:
//   - the gap between two adjacent items in a track (= 2 × ITEM_INSET_PX),
//   - the gap between the header card and the chart's left edge (originX
//     offset from chartLeftX),
//   - the bottom margin around the attribution wordmark.
//
// Future interactive layers (e.g. drag-and-drop authoring) may locally
// inflate this gutter at the active drop site to reveal a target slot.
// That's a runtime concern — the layout engine emits a static positioned
// model and the interactive shell animates spacing on top. Keep this
// constant as the rest-state baseline.
export const GUTTER_PX = 2 * ITEM_INSET_PX;

// Default pixel-per-day when no explicit scale is set. Calibrated so a
// 26-week (180 day) roadmap fits a 1200 px content area.
export const DEFAULT_PIXELS_PER_DAY = 5;

// Header box defaults per position. The beside-mode card width is dynamic
// (sized to the title + author text, clamped to MIN..MAX with text wrap),
// so the layout uses these bounds instead of a single fixed width.
export const HEADER_BESIDE_MIN_WIDTH_PX = 120;
export const HEADER_BESIDE_MAX_WIDTH_PX = 240;
export const HEADER_ABOVE_HEIGHT_PX = 72;

// Footnote panel — fixed-position panel below the chart with a
// "Footnotes" header and one row per entry. Layout sizes the panel
// using these values; the renderer paints labels at offsets derived
// from the same constants so a padding bump cascades to both surfaces.
//
//   ┌───────────────────────────────┐
//   │  Footnotes              ↑     │   header band (HEADER_HEIGHT)
//   │                         │     │
//   ├─────────────────────────┘     │   gap = PANEL_PADDING
//   │  N  Title — description       │   row N (ROW_HEIGHT each)
//   │  N  …                         │
//   │                               │
//   └───────────────────────────────┘   bottom pad = PANEL_PADDING
//
// Total panel height (when entries.length > 0):
//   HEADER_HEIGHT + entries × ROW_HEIGHT + PANEL_PADDING

/** Height (px) of the header band above the entry rows. */
export const FOOTNOTE_HEADER_HEIGHT_PX = 28;

/**
 * Single padding value (px) reused as: left/right text inset, bottom
 * padding under the last row, gap between the header band and the
 * first entry, and gap between the number column and the title column.
 * Bumping it changes every footnote panel inset consistently.
 */
export const FOOTNOTE_PANEL_PADDING_PX = 16;

/** Baseline Y of the "Footnotes" header text relative to the panel top. */
export const FOOTNOTE_HEADER_BASELINE_OFFSET_PX = 22;

/** Baseline-to-baseline spacing between footnote entry rows. */
export const FOOTNOTE_ROW_HEIGHT = 18;

// Attribution mark — a clickable "Powered by nowline" link that sits in
// the canvas's bottom margin. Single source of truth for layout (which
// reserves a glyph-sized slot at canvas-bottom-right) and the renderer
// (which paints the glyph inside that slot at the same scale, so the
// reserved box hugs the painted glyph 1:1).
//
// "Powered by" is rendered at 80% of the wordmark's font size so it
// reads as a subdued tag rather than competing with the brand. Both
// share the same baseline (y = wordmarkFontSize) so the tag's x-height
// sits cleanly above the wordmark's baseline.
//
// Logical units (before `ATTRIBUTION_SCALE`):
//   "Powered by"  text  ≈ 10 × 32 × 0.58 = 185.6  weight 400, x=0
//   gap                                       10
//   "now"         text  ≈ 3  × 40 × 0.58 = 69.6   weight 700, x=195.6
//   bar (the "l")                                 x=195.6+74=269.6, w=5
//   "ine"         text  ≈ 3  × 40 × 0.58 = 69.6   weight 400, x=195.6+81=276.6
// Bar bottom is y = 12 + 40 = 52. The 74/81 internal offsets keep the
// red bar reading as a single "l" between "now" and "ine".
export const ATTRIBUTION_TEXT = 'Powered by';
export const ATTRIBUTION_LINK = 'https://nowline.io';
export const ATTRIBUTION_SCALE = 0.22;
export const ATTRIBUTION_WORDMARK_FONT_SIZE = 40;
export const ATTRIBUTION_PREFIX_FONT_SIZE = 32;

const ATTR_CHAR_FACTOR = 0.58;
export const ATTRIBUTION_PREFIX_LOGICAL_WIDTH =
    ATTRIBUTION_TEXT.length * ATTRIBUTION_PREFIX_FONT_SIZE * ATTR_CHAR_FACTOR; // 185.6
export const ATTRIBUTION_PREFIX_TO_WORDMARK_GAP = 10;
export const ATTRIBUTION_NOW_LOGICAL_X =
    ATTRIBUTION_PREFIX_LOGICAL_WIDTH + ATTRIBUTION_PREFIX_TO_WORDMARK_GAP; // 195.6
export const ATTRIBUTION_BAR_LOGICAL_X = ATTRIBUTION_NOW_LOGICAL_X + 74;    // 269.6
export const ATTRIBUTION_BAR_LOGICAL_WIDTH = 5;
export const ATTRIBUTION_INE_LOGICAL_X = ATTRIBUTION_NOW_LOGICAL_X + 81;    // 276.6
export const ATTRIBUTION_INE_LOGICAL_WIDTH =
    3 * ATTRIBUTION_WORDMARK_FONT_SIZE * ATTR_CHAR_FACTOR;                  // 69.6
export const ATTRIBUTION_GLYPH_LOGICAL_WIDTH =
    ATTRIBUTION_INE_LOGICAL_X + ATTRIBUTION_INE_LOGICAL_WIDTH;              // 346.2
export const ATTRIBUTION_GLYPH_LOGICAL_HEIGHT =
    12 + ATTRIBUTION_WORDMARK_FONT_SIZE;                                    // 52
export const ATTRIBUTION_GLYPH_WIDTH =
    ATTRIBUTION_GLYPH_LOGICAL_WIDTH * ATTRIBUTION_SCALE;
export const ATTRIBUTION_GLYPH_HEIGHT =
    ATTRIBUTION_GLYPH_LOGICAL_HEIGHT * ATTRIBUTION_SCALE;

// Dependency-edge rounded-corner radius (for Manhattan routing).
export const EDGE_CORNER_RADIUS = 4;

// Shadow filter parameters per shadow kind.
export const SHADOW_PARAMS: Record<'none' | 'subtle' | 'fuzzy' | 'hard', {
    dx: number;
    dy: number;
    stdDeviation: number;
    opacity: number;
}> = {
    none: { dx: 0, dy: 0, stdDeviation: 0, opacity: 0 },
    subtle: { dx: 0, dy: 1, stdDeviation: 1.5, opacity: 0.2 },
    fuzzy: { dx: 0, dy: 3, stdDeviation: 5, opacity: 0.3 },
    hard: { dx: 2, dy: 2, stdDeviation: 0, opacity: 0.45 },
};

// Font stacks keyed by DSL `font:` value.
export const FONT_STACK: Record<'sans' | 'serif' | 'mono', string> = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

// Label thinning defaults per scale unit (from specs/rendering.md § Timeline).
// Values are label-every counts (i.e. label every Nth tick).
export const LABEL_THINNING: Record<'days' | 'weeks' | 'months' | 'quarters' | 'years', number> = {
    days: 7,
    weeks: 4,
    months: 3,
    quarters: 4,
    years: 5,
};
