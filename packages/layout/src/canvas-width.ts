// `LayoutOptions.width` caps the canvas (specs/rendering.md § Canvas width).
// The cap is best-effort: it shrinks pixels-per-day so chrome plus timeline
// fits, but text does not scale, so spilled captions, run labels and the
// header card can still push the final canvas past it.

/**
 * Lowest pixels-per-day a width cap may shrink the timeline to. Below one
 * pixel a working day stops being visible, and short bars collapse into
 * `MIN_ITEM_WIDTH` slivers that no longer read as durations.
 */
export const MIN_PIXELS_PER_DAY = 1;

export interface CappedPixelsPerDayInput {
    /** Density from the scale (`pixelsPerUnit / daysPerUnit`). */
    naturalPixelsPerDay: number;
    /** Days the timeline spans at that density (working or calendar days). */
    dayCount: number;
    /** Canvas width that isn't timeline: header card plus both gutters. */
    chromeWidth: number;
    /** The cap; `undefined` means content-fit. */
    maxWidth: number | undefined;
}

/**
 * Pixels-per-day under an optional canvas cap. Only ever shrinks the natural
 * density, and never below `MIN_PIXELS_PER_DAY` (a density already below the
 * floor is left alone rather than raised).
 */
export function cappedPixelsPerDay(input: CappedPixelsPerDayInput): number {
    const { naturalPixelsPerDay, dayCount, chromeWidth, maxWidth } = input;
    if (maxWidth === undefined) return naturalPixelsPerDay;
    if (chromeWidth + dayCount * naturalPixelsPerDay <= maxWidth) return naturalPixelsPerDay;
    const fitted = (maxWidth - chromeWidth) / dayCount;
    const floor = Math.min(naturalPixelsPerDay, MIN_PIXELS_PER_DAY);
    return Math.max(floor, fitted);
}
