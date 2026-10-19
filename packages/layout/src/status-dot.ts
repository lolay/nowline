// Status-dot colour: the bar fill's luminance picks one of the theme's two
// status-dot palettes, and the item's status picks the colour in it. Moved
// from the SVG renderer (R5) so each positioned item carries its resolved
// dot colour and the renderer only draws the dot.

import type { Theme } from './themes/shape.js';
import type { StatusKind } from './types.js';

/**
 * sRGB → relative luminance per WCAG 2.x. Input may be `#rrggbb`,
 * `#rgb`, or a non-hex token like `none` / `transparent`. Non-hex
 * inputs return 1 (treated as light) so a transparent bar reuses
 * the chart's light bg. Mostly used to choose between two
 * status-dot palettes (`onLight` vs `onDark`) so the dot reads on
 * any bar fill — see `pickStatusDotPalette` and
 * `specs/rendering.md`'s status-dot section.
 *
 * This is the renderer's copy, kept with its semantics: unlike
 * `relativeLuminance` in `themes/contrast.ts`, which throws on anything
 * but `#rgb` / `#rrggbb`, it never throws, and a 6-character string that
 * is not hex gives `NaN` (so it compares false against any threshold).
 */
export function fillLuminance(hex: string): number {
    if (!hex || hex === 'none' || hex === 'transparent') return 1;
    let h = hex.startsWith('#') ? hex.slice(1) : hex;
    if (h.length === 3) {
        h = h
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (h.length !== 6) return 1;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Pick the status-dot palette whose tone contrasts best with the
 * given bar bg.
 *
 * The crossover threshold is the bar luminance at which a deep dot
 * (avg luminance ≈ 0.045 across `onLight` palette entries) and a
 * pale dot (avg ≈ 0.85 across `onDark` entries) give equal WCAG
 * contrast. Solving `(L_bar + 0.05)² ≈ 0.86 × 0.095` gives
 * `L_bar ≈ 0.24`, so:
 *   - bars with luminance ≥ 0.24 (most label-driven mid-tones AND
 *     all pale status-tint bars) → `onLight` deep dot
 *   - bars with luminance < 0.24 (dark status-tint bars in dark
 *     theme, e.g. `#172554`) → `onDark` pale dot
 */
export function pickStatusDotPalette(bg: string, palette: Theme): Theme['statusDot']['onLight'] {
    return fillLuminance(bg) >= 0.24 ? palette.statusDot.onLight : palette.statusDot.onDark;
}

/**
 * The status dot's colour for a bar filled `bg` with status `status`.
 *
 * Status-dot color — the dot communicates status via hue, but
 * the bar bg can range from pale status tints (`#eff6ff`) to
 * saturated mid-tones (`#1e88e5` from `bg:blue` labels) to
 * dark navies (`#172554` in dark theme), so a single palette
 * can't keep contrast across all bars. Two palettes — `onLight`
 * (deep tints, for pale bars) and `onDark` (pale tints, for
 * saturated/dark bars) — are picked from based on the bar
 * bg's relative luminance.
 */
export function statusDotColor(status: StatusKind, bg: string, palette: Theme): string {
    const dotPalette = pickStatusDotPalette(bg, palette);
    const statusColors: Record<string, string> = {
        done: dotPalette.done,
        'in-progress': dotPalette.inProgress,
        'at-risk': dotPalette.atRisk,
        blocked: dotPalette.blocked,
        planned: dotPalette.planned,
        neutral: dotPalette.neutral,
    };
    return statusColors[status] ?? statusColors.neutral;
}
