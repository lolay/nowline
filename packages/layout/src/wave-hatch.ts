// Wave hatch kind: which of the theme's two hatch strokes marks background
// work on a bar (specs/waves.md §9.3), picked by the bar fill's luminance.
// Moved from the SVG renderer (R5) so each background item and the legend's
// hatch swatch carry their kind and the renderer only draws the pattern.

import { fillLuminance } from './status-dot.js';
import type { ResolvedStyle, WaveHatchKind } from './types.js';

/**
 * Bar-fill luminance at or above which background work gets the dark hatch
 * (`wave.hatch`); below it, the light one (`wave.hatchOnDark`). The same
 * crossover the status dot picks its palette by (`pickStatusDotPalette`), so
 * the hatch and the dot agree on which bars read as dark.
 */
const WAVE_HATCH_LIGHT_FILL_MIN_LUMINANCE = 0.24;

/** The painted fill of a bar, as the renderer's `rectFrame` paints it. */
function barFill(bg: ResolvedStyle['bg']): string {
    return bg === 'none' ? 'transparent' : bg;
}

/** The hatch kind for a bar (or legend swatch) whose resolved `bg` is `bg`. */
export function waveHatchKind(bg: ResolvedStyle['bg']): WaveHatchKind {
    return fillLuminance(barFill(bg)) >= WAVE_HATCH_LIGHT_FILL_MIN_LUMINANCE ? 'dark' : 'light';
}
