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

// Visual inset applied on each side of an item bar. Two adjacent (logically
// chained) items therefore have a 2× ITEM_INSET_PX visible gutter between
// them, leaving room for vertical drop-lines (dependency arrows, anchor /
// milestone cuts, the now-line) to pass between bars without crossing them.
export const ITEM_INSET_PX = 6;

// Default pixel-per-day when no explicit scale is set. Calibrated so a
// 26-week (180 day) roadmap fits a 1200 px content area.
export const DEFAULT_PIXELS_PER_DAY = 5;

// Header box defaults per position. The beside-mode card width is dynamic
// (sized to the title + author text, clamped to MIN..MAX with text wrap),
// so the layout uses these bounds instead of a single fixed width.
export const HEADER_BESIDE_MIN_WIDTH_PX = 120;
export const HEADER_BESIDE_MAX_WIDTH_PX = 240;
export const HEADER_ABOVE_HEIGHT_PX = 72;

// Footnote area defaults.
export const FOOTNOTE_ROW_HEIGHT = 18;

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
