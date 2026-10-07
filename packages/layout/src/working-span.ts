// The width of an item's logical extent (m2p phase 4, decision 4). Every
// site that turns a duration into pixels goes through here, so the row
// packer's prediction, the bar-height predictor and `sequenceItem` agree on
// the same start and the same formula.

import type { LayoutContext } from './layout-context.js';

/**
 * Pixels `days` working days span from `startX`. Under `hide` (and any
 * calendar without non-working days) it is the legacy `days *
 * pixelsPerDay`, computed exactly as before so no float drifts. Under
 * `show` it is `advanceX(startX, days) - startX`, which grows by every
 * non-working day the span crosses; `startX` should already be snapped
 * with `ctx.scale.startX`.
 */
export function itemSpanPx(ctx: LayoutContext, startX: number, days: number): number {
    if (!ctx.scale.showsNonWorking) return days * ctx.timeline.pixelsPerDay;
    return ctx.scale.advanceX(startX, days) - startX;
}
