// The now-line (finalize step f12): the line at `today` on the final
// scale, with its pill in the reserved row above the tick panel.

import { localeStrings } from '../i18n.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import { estimateTextWidth } from '../text-measure.js';
import {
    GUTTER_PX,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOW_PILL_WIDTH_PX,
} from '../themes/shared.js';
import type { PositionedNowline } from '../types.js';

/**
 * The now-line on the final scale. `chartRightX` is the final canvas right
 * edge; a pill that would cross it flips to flag mode.
 */
export function buildNowline(
    today: Date | undefined,
    ctx: LayoutContext,
    locale: string,
    chartRightX: number,
): PositionedNowline | null {
    if (!today) return null;
    const x = ctx.scale.forwardWithinDomain(today);
    if (x === null) return null;
    // Pill row is the band reserved at the very top of the timeline area.
    // The line drops from the bottom of the pill (top of the date headers)
    // through any marker row and into the chart, so the pill and line stay
    // visually connected.
    const pillTopY = ctx.timeline.box.y;
    const lineTopY = ctx.timeline.tickPanelY;
    // Pill width is locale-aware: en-US's `'now'` (3 chars) fits the
    // 36 px default trivially; longer strings like fr's `'maint.'`
    // (6 chars) need a wider pill to avoid clipping. Floor at the
    // default so en-US output stays byte-stable; grow when the
    // measured label needs it. The 2× inset matches the renderer's
    // flag-mode label inset (`NOW_PILL_LABEL_INSET_X_PX`) and gives
    // the same visual padding to centered-mode strings.
    const label = localeStrings(locale).nowLabel;
    const labelTextWidth = estimateTextWidth(label, NOW_PILL_LABEL_FONT_SIZE_PX);
    const pillWidth = Math.max(
        NOW_PILL_WIDTH_PX,
        Math.ceil(labelTextWidth + 2 * NOW_PILL_LABEL_INSET_X_PX),
    );
    // The "chart's left edge" the pill must clear is `chartLeftX` (in
    // beside-mode, the right edge of the header card; in above-mode,
    // the canvas left edge at x=0). originX = chartLeftX + GUTTER_PX,
    // so we recover chartLeftX as `originX - GUTTER_PX`.
    const chartLeftX = ctx.timeline.originX - GUTTER_PX;
    const halfPill = pillWidth / 2;
    let pillMode: 'center' | 'flag-right' | 'flag-left';
    if (x - halfPill < chartLeftX) {
        // Centered pill would intrude into the header card / past the
        // canvas left edge — anchor the pill's LEFT side to the line
        // and let it extend right into the chart.
        pillMode = 'flag-right';
    } else if (x + halfPill > chartRightX) {
        // Centered pill would clip past the canvas right edge — anchor
        // the pill's RIGHT side to the line and let it extend left.
        pillMode = 'flag-left';
    } else {
        pillMode = 'center';
    }
    // Bottom-most Y the now-line should reach. When a mirrored bottom
    // tick panel exists, thread the line through it (so the line ties
    // the two date strips together visually). Otherwise stop at the
    // last swimlane — never extend into the footnote area below.
    const bottomTickPanelY = ctx.timeline.bottomTickPanelY;
    const bottomTickPanelHeight = ctx.timeline.bottomTickPanelHeight ?? 0;
    const lineBottomY =
        bottomTickPanelY !== undefined && bottomTickPanelHeight > 0
            ? bottomTickPanelY + bottomTickPanelHeight
            : ctx.swimlaneBottomY;
    return {
        x,
        topY: lineTopY,
        bottomY: lineBottomY,
        pillTopY,
        pillMode,
        label,
        pillWidth,
        style: resolveStyle('item', [], ctx.styleCtx),
    };
}
