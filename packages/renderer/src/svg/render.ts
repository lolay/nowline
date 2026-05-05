import type {
    PositionedRoadmap,
    PositionedHeader,
    PositionedSwimlane,
    PositionedItem,
    PositionedGroup,
    PositionedParallel,
    PositionedTrackChild,
    PositionedAnchor,
    PositionedMilestone,
    PositionedDependencyEdge,
    PositionedTimelineScale,
    PositionedNowline,
    PositionedFootnoteArea,
    PositionedIncludeRegion,
    PositionedCapacity,
    ResolvedStyle,
    Point,
    Theme,
} from '@nowline/layout';
import {
    ATTRIBUTION_TEXT,
    ATTRIBUTION_LINK,
    ATTRIBUTION_SCALE,
    ATTRIBUTION_WORDMARK_FONT_SIZE,
    ATTRIBUTION_PREFIX_FONT_SIZE,
    ATTRIBUTION_NOW_LOGICAL_X,
    ATTRIBUTION_BAR_LOGICAL_X,
    ATTRIBUTION_BAR_LOGICAL_WIDTH,
    ATTRIBUTION_INE_LOGICAL_X,
    PROGRESS_STRIP_HEIGHT_PX,
    EDGE_CORNER_RADIUS,
    TEXT_SIZE_PX,
    CORNER_RADIUS_PX,
    FONT_STACK,
    TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    GROUP_TITLE_TAB_HEIGHT_PX,
    GROUP_TITLE_TAB_PAD_X_PX,
    GROUP_TITLE_TAB_LABEL_BASELINE_OFFSET_PX,
    GROUP_TITLE_TAB_LABEL_FONT_SIZE_PX,
    GROUP_TITLE_TAB_CHAR_WIDTH_PX,
    ACCENT_DASH_PATTERN,
    HEADER_CARD_PADDING_X,
    HEADER_CARD_PADDING_TOP,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_AUTHOR_FONT_SIZE_PX,
    ITEM_CAPTION_INSET_X_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_BASELINE_OFFSET_PX,
    ITEM_CAPTION_META_BASELINE_OFFSET_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    ITEM_CAPTION_META_FONT_SIZE_PX,
    ITEM_STATUS_DOT_INSET_RIGHT_PX,
    ITEM_STATUS_DOT_INSET_TOP_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX,
    ITEM_FOOTNOTE_INDICATOR_BASELINE_OFFSET_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_LINK_ICON_INSET_PX,
    ITEM_DECORATION_SPILL_GAP_PX,
    NOW_PILL_WIDTH_PX,
    NOW_PILL_HEIGHT_PX,
    NOW_PILL_CORNER_RADIUS_PX,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_BASELINE_OFFSET_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOWLINE_STROKE_WIDTH_PX,
    FOOTNOTE_ROW_HEIGHT,
    FOOTNOTE_HEADER_HEIGHT_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FOOTNOTE_HEADER_BASELINE_OFFSET_PX,
    frameTabGeometry,
    estimateCapacitySuffixWidth,
} from '@nowline/layout';
import { IdGenerator } from './ids.js';
import { attrs, escAttr, escText, num, tag, textTag } from './xml.js';
import { allShadowDefs, shadowFilterUrl } from './shadow.js';
import { sanitizeSvg } from './sanitize.js';
import { LINK_ICON_PATHS, CAPACITY_ICON_SVG } from './icons.js';

// Browser-safe types. The renderer never touches `fs`, `path`, or `Buffer`.
// Callers inject an AssetResolver when they want logos embedded.
export interface AssetBytes {
    bytes: Uint8Array;
    mime: string;
}

export type AssetResolver = (ref: string) => Promise<AssetBytes>;

export interface RenderOptions {
    assetResolver?: AssetResolver;
    noLinks?: boolean;
    strict?: boolean;
    warn?: (message: string) => void;
    // Override the deterministic id prefix (defaults to 'nl').
    idPrefix?: string;
}

// `TEXT_SIZE_PX`, `CORNER_RADIUS_PX`, `FONT_STACK` come from
// `@nowline/layout` (themes/shared) so a typography or radius change
// flows from one place to both layout and renderer.
//
// `WEIGHT_NUM` lives here only because no DSL `weight` table exists in
// shared yet. If/when it does, hoist this alongside `FONT_STACK`.
const WEIGHT_NUM: Record<string, number> = {
    thin: 100, light: 300, normal: 400, bold: 700,
};

// `style.textSize` is `SizeBucket` which includes `'full'`; the shared
// `TEXT_SIZE_PX` table only carries the size buckets (no `'full'` —
// that's a corner-radius-only value). Widen the lookup so a stray
// `'full'` falls through to the `?? 14` fallback instead of compiling.
function textSizePx(bucket: ResolvedStyle['textSize']): number {
    return (TEXT_SIZE_PX as Record<string, number>)[bucket] ?? 14;
}

function fontAttrs(style: ResolvedStyle, overrideSize?: number): Record<string, string | number> {
    return {
        'font-family': FONT_STACK[style.font],
        'font-size': overrideSize ?? textSizePx(style.textSize),
        'font-weight': WEIGHT_NUM[style.weight] ?? 400,
        'font-style': style.italic ? 'italic' : 'normal',
        fill: style.text,
    };
}

function strokeDash(style: ResolvedStyle): string | undefined {
    if (style.border === 'dashed') return '4 3';
    if (style.border === 'dotted') return '1 3';
    return undefined;
}

/**
 * sRGB → relative luminance per WCAG 2.x. Input may be `#rrggbb`,
 * `#rgb`, or a non-hex token like `none` / `transparent`. Non-hex
 * inputs return 1 (treated as light) so a transparent bar reuses
 * the chart's light bg. Mostly used to choose between two
 * status-dot palettes (`onLight` vs `onDark`) so the dot reads on
 * any bar fill — see `pickStatusDotPalette` and
 * `specs/rendering.md`'s status-dot section.
 */
function relativeLuminance(hex: string): number {
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
    const lin = (c: number): number =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
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
function pickStatusDotPalette(
    bg: string,
    palette: Theme,
): Theme['statusDot']['onLight'] {
    return relativeLuminance(bg) >= 0.24
        ? palette.statusDot.onLight
        : palette.statusDot.onDark;
}

/**
 * Approx. rendered width (px) of `text` at `fontSizePx`. Mirrors the
 * `0.58 em / char` heuristic the layout uses for spill detection so the
 * renderer's positioning of the capacity suffix lines up with what the
 * layout reserved.
 */
function estimateCaptionWidthPx(text: string, fontSizePx: number): number {
    return text.length * fontSizePx * 0.58;
}

/**
 * Paint an item / lane capacity suffix starting at `(x0, baselineY)`. The
 * capacity model arrives pre-resolved from layout (`PositionedCapacity`):
 * `text` is the formatted number, `icon` is either `null` (no glyph), a
 * built-in name, or an inline literal string.
 *
 * Three rendering paths:
 *
 *   1. `icon === null` (the resolved `capacity-icon` was `'none'`): paint
 *      the bare number as a single `<text>` node.
 *   2. `icon.kind === 'builtin'` and `name === 'multiplier'`: paint
 *      `5×` as a single `<text>` node — the multiplication sign is a
 *      typographic operator with consistent rendering across system
 *      fonts and built-in side bearing, so no `<tspan dx>` separator.
 *   3. `icon.kind === 'builtin'` and `name` ∈ {person, people, points,
 *      time}: paint the number as `<text>`, then drop the curated SVG
 *      icon at the next column (`0.1em` gap, sized to one em). The
 *      icon's `style="color:..."` propagates through the
 *      `currentColor`-bound paths in the icon library.
 *   4. `icon.kind === 'literal'` (inline Unicode literal or
 *      dereferenced custom `glyph`): paint number + glyph in a single
 *      `<text>`, with a `<tspan dx="0.1em">` separator before the
 *      glyph payload.
 *
 * `precedingText` is the existing meta-line text (or `undefined` when the
 * suffix is standalone). When present, the suffix's left edge starts one
 * space's width past the meta text's estimated right edge so `2w  5×`
 * reads as a single caption rather than running text together.
 */
function renderCapacitySuffix(
    capacity: PositionedCapacity,
    precedingText: string | undefined,
    x0: number,
    baselineY: number,
    fontSize: number,
    fontFamily: string,
    color: string,
): string {
    const charWidthPx = fontSize * 0.58;
    const precedingWidthPx = precedingText
        ? estimateCaptionWidthPx(precedingText, fontSize)
        : 0;
    const separatorPx = precedingText ? charWidthPx : 0;
    const numberX = x0 + precedingWidthPx + separatorPx;
    const { text: numberStr, icon } = capacity;
    const numberWidthPx = estimateCaptionWidthPx(numberStr, fontSize);
    const baseAttrs = {
        'font-family': fontFamily,
        'font-size': fontSize,
        fill: color,
    } as const;

    if (!icon) {
        return textTag(
            { x: num(numberX), y: num(baselineY), ...baseAttrs },
            numberStr,
        );
    }

    if (icon.kind === 'builtin' && icon.name === 'multiplier') {
        return textTag(
            { x: num(numberX), y: num(baselineY), ...baseAttrs },
            `${numberStr}\u00D7`,
        );
    }

    if (icon.kind === 'builtin') {
        const def = CAPACITY_ICON_SVG[icon.name];
        // Render `<text>5</text>` followed by the curated SVG icon. The
        // icon sits at one font-em wide and tall, with a 0.1em separator
        // gap. Vertical positioning lifts the icon so its visual center
        // sits on the text x-height (`baselineY - fontSize * 0.85`); this
        // matches how Lucide-style outline icons read in inline text.
        const numberSvg = textTag(
            { x: num(numberX), y: num(baselineY), ...baseAttrs },
            numberStr,
        );
        const gapPx = fontSize * 0.1;
        const iconSize = fontSize;
        const iconX = numberX + numberWidthPx + gapPx;
        const iconY = baselineY - fontSize * 0.85;
        const iconSvg = `<svg x="${num(iconX)}" y="${num(iconY)}" width="${num(iconSize)}" height="${num(iconSize)}" viewBox="${def.viewBox}" style="color:${escAttr(color)}" aria-hidden="true">${def.body}</svg>`;
        return numberSvg + iconSvg;
    }

    // Literal glyph (inline Unicode literal or dereferenced custom glyph).
    // Single <text> node with the number + a tspan-separated glyph.
    const dx = num(fontSize * 0.1);
    return (
        `<text x="${num(numberX)}" y="${num(baselineY)}" font-family="${escAttr(fontFamily)}"`
        + ` font-size="${fontSize}" fill="${escAttr(color)}">`
        + `${escText(numberStr)}<tspan dx="${dx}">${escText(icon.text)}</tspan>`
        + '</text>'
    );
}

function rectFrame(x: number, y: number, w: number, h: number, style: ResolvedStyle, extra: Record<string, string | number | undefined | null | boolean> = {}): string {
    const rx = Math.min(CORNER_RADIUS_PX[style.cornerRadius] ?? 4, h / 2);
    return tag('rect', {
        x: num(x),
        y: num(y),
        width: num(w),
        height: num(h),
        rx: num(rx),
        ry: num(rx),
        fill: style.bg === 'none' ? 'transparent' : style.bg,
        stroke: style.fg,
        'stroke-width': 1,
        'stroke-dasharray': strokeDash(style) ?? null,
        ...extra,
    });
}

function renderHeader(h: PositionedHeader, idPrefix: string, palette: Theme): string {
    // The layout has already sized the card to its (wrapped) text content
    // and stashed the bounds in `h.cardBox`, with `h.titleLines` /
    // `h.authorLines` ready to render line-by-line. See sizeBesideHeader
    // in @nowline/layout.
    const cardX = h.box.x + h.cardBox.x;
    const cardY = h.box.y + h.cardBox.y;
    const cardWidth = h.cardBox.width;
    const cardHeight = h.cardBox.height;
    const cardFill = h.style.bg === 'none' ? palette.surface.headerBox : h.style.bg;
    const borderColor = palette.header.cardBorder;
    const card = tag('rect', {
        x: num(cardX),
        y: num(cardY),
        width: num(cardWidth),
        height: num(cardHeight),
        rx: 6,
        ry: 6,
        fill: cardFill,
        stroke: borderColor,
        'stroke-width': 1,
        filter: `url(#${idPrefix}-shadow-subtle)`,
    });
    // Title and author baselines come from `@nowline/layout`'s
    // `header-card-geometry` module so the renderer paints with the
    // exact metrics `sizeBesideHeader` sized the card to.
    const titleParts: string[] = [];
    h.titleLines.forEach((line, i) => {
        titleParts.push(textTag(
            {
                x: num(cardX + HEADER_CARD_PADDING_X),
                y: num(cardY + HEADER_CARD_PADDING_TOP + i * HEADER_TITLE_LINE_HEIGHT_PX),
                'font-family': FONT_STACK[h.style.font],
                'font-size': HEADER_TITLE_FONT_SIZE_PX,
                'font-weight': 600,
                fill: h.style.text,
            },
            line,
        ));
    });
    const titleText = titleParts.join('');
    const lastTitleY = cardY + HEADER_CARD_PADDING_TOP
        + Math.max(0, h.titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT_PX;
    const authorColor = palette.header.author;
    const authorParts: string[] = [];
    h.authorLines.forEach((line, j) => {
        authorParts.push(textTag(
            {
                x: num(cardX + HEADER_CARD_PADDING_X),
                y: num(lastTitleY + HEADER_TITLE_TO_AUTHOR_GAP_PX + j * HEADER_AUTHOR_LINE_HEIGHT_PX),
                'font-family': FONT_STACK[h.style.font],
                'font-size': HEADER_AUTHOR_FONT_SIZE_PX,
                fill: authorColor,
            },
            line,
        ));
    });
    const authorText = authorParts.join('');
    return tag('g', { 'data-layer': 'header', 'data-id': `${idPrefix}-header` }, card + titleText + authorText);
}

function renderTimeline(t: PositionedTimelineScale, palette: Theme): string {
    const panelFill = palette.timeline.panelFill;
    const borderColor = palette.timeline.border;
    const gridColor = palette.timeline.gridLine;
    const labelColor = palette.timeline.labelText;
    const parts: string[] = [];
    // Header layout from top: now-pill row → tick-label panel → marker row.
    // The pill row owns its space (no panel rect); the now-line crosses it
    // visually. Marker row is omitted entirely when empty.
    const tickPanelY = t.tickPanelY;
    const tickPanelHeight = t.tickPanelHeight;
    const hasMarkerRow = t.markerRow.height > 0;
    const markerRowY = tickPanelY + tickPanelHeight;
    const markerRowHeight = t.markerRow.height;

    parts.push(
        tag('rect', {
            x: num(t.box.x),
            y: num(tickPanelY),
            width: num(t.box.width),
            height: num(tickPanelHeight),
            rx: 4,
            ry: 4,
            fill: panelFill,
            stroke: borderColor,
            'stroke-width': 1,
        }),
    );
    if (hasMarkerRow) {
        parts.push(
            tag('rect', {
                x: num(t.box.x),
                y: num(markerRowY),
                width: num(t.box.width),
                height: num(markerRowHeight),
                rx: 4,
                ry: 4,
                fill: panelFill,
                stroke: borderColor,
                'stroke-width': 1,
            }),
        );
    }
    // Where the dotted grid lines start (just below the lowest header
    // panel — date row alone, or marker row when present).
    const gridTopY = hasMarkerRow ? markerRowY + markerRowHeight : tickPanelY + tickPanelHeight;
    for (const tick of t.ticks) {
        if (!tick.major) continue;
        // Label sits at the COLUMN CENTER (tick.labelX), not at the tick
        // boundary. The last tick has no following column → no label.
        if (tick.label && tick.labelX !== undefined) {
            parts.push(
                textTag(
                    {
                        x: num(tick.labelX),
                        y: num(tickPanelY + TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX),
                        'font-family': FONT_STACK.sans,
                        'font-size': 10,
                        fill: labelColor,
                        'text-anchor': 'middle',
                    },
                    tick.label,
                ),
            );
        }
        // Dotted grid line drops from below the lowest header panel through
        // the swimlane area, at the column BOUNDARY (tick.x).
        parts.push(
            tag('line', {
                x1: num(tick.x),
                y1: num(gridTopY),
                x2: num(tick.x),
                y2: num(t.box.y + t.box.height),
                stroke: gridColor,
                'stroke-width': 1,
                'stroke-dasharray': '2 3',
            }),
        );
    }
    return tag('g', { 'data-layer': 'timeline' }, parts.join(''));
}

function renderNowline(n: PositionedNowline | null, palette: Theme): string {
    if (!n) return '';
    const color = palette.nowline.stroke;
    const labelTextColor = palette.nowline.labelText;
    // Line drops from `topY` (just below the pill / top of date headers)
    // through the headers into the chart, ending at `bottomY`.
    const line = tag('line', {
        x1: num(n.x),
        y1: num(n.topY),
        x2: num(n.x),
        y2: num(n.bottomY),
        stroke: color,
        'stroke-width': NOWLINE_STROKE_WIDTH_PX,
    });
    // Pill — sits above the date headers at `pillTopY`. Three modes
    // (decided by layout in `buildNowline`):
    //   - center      → rounded rect centered on the line, label `middle`
    //   - flag-right  → squared LEFT, rounded RIGHT, line at left edge,
    //                   label `start` past the line
    //   - flag-left   → rounded LEFT, squared RIGHT, line at right edge,
    //                   label `end` before the line
    // The squared edge IS the line; the rounded edge points into the
    // chart, so the pill always hugs the line and never overflows.
    const pillBg = renderNowPillBg(n, color);
    const label = renderNowPillLabel(n, labelTextColor);
    return tag('g', { 'data-layer': 'nowline' }, line + pillBg + label);
}

/**
 * X coordinate of the pill's squared edge in flag modes. SVG strokes
 * are centered on their geometry, so a 2.25 px line at `n.x` actually
 * paints from `n.x - 1.125` to `n.x + 1.125`. To make the pill's
 * squared edge line up with the OUTER edge of the line stroke (so
 * the line and the pill share a single continuous edge instead of
 * the line peeking past the pill by half-stroke), we offset by
 * `NOWLINE_STROKE_WIDTH_PX / 2` on the side the line is on.
 *
 *   flag-right: line on the LEFT  → squared edge at n.x - half-stroke
 *   flag-left:  line on the RIGHT → squared edge at n.x + half-stroke
 *
 * Center mode doesn't apply — the line passes through the pill's
 * vertical center, so a half-stroke offset would make things worse.
 */
function squaredEdgeX(n: PositionedNowline): number {
    const halfStroke = NOWLINE_STROKE_WIDTH_PX / 2;
    if (n.pillMode === 'flag-right') return n.x - halfStroke;
    if (n.pillMode === 'flag-left') return n.x + halfStroke;
    return n.x;
}

function renderNowPillBg(n: PositionedNowline, color: string): string {
    const top = n.pillTopY;
    const bottom = n.pillTopY + NOW_PILL_HEIGHT_PX;
    const r = NOW_PILL_CORNER_RADIUS_PX;
    if (n.pillMode === 'center') {
        return tag('rect', {
            x: num(n.x - NOW_PILL_WIDTH_PX / 2),
            y: num(top),
            width: num(NOW_PILL_WIDTH_PX),
            height: num(NOW_PILL_HEIGHT_PX),
            rx: r,
            ry: r,
            fill: color,
        });
    }
    const edgeX = squaredEdgeX(n);
    if (n.pillMode === 'flag-right') {
        // Squared LEFT edge aligns with line's left outer stroke edge,
        // rounded corners on the RIGHT.
        const right = edgeX + NOW_PILL_WIDTH_PX;
        const d = [
            `M ${num(edgeX)} ${num(top)}`,
            `L ${num(right - r)} ${num(top)}`,
            `A ${r} ${r} 0 0 1 ${num(right)} ${num(top + r)}`,
            `L ${num(right)} ${num(bottom - r)}`,
            `A ${r} ${r} 0 0 1 ${num(right - r)} ${num(bottom)}`,
            `L ${num(edgeX)} ${num(bottom)}`,
            'Z',
        ].join(' ');
        return tag('path', { d, fill: color });
    }
    // flag-left: squared RIGHT edge aligns with line's right outer
    // stroke edge, rounded corners on the LEFT.
    const left = edgeX - NOW_PILL_WIDTH_PX;
    const d = [
        `M ${num(edgeX)} ${num(top)}`,
        `L ${num(left + r)} ${num(top)}`,
        `A ${r} ${r} 0 0 0 ${num(left)} ${num(top + r)}`,
        `L ${num(left)} ${num(bottom - r)}`,
        `A ${r} ${r} 0 0 0 ${num(left + r)} ${num(bottom)}`,
        `L ${num(edgeX)} ${num(bottom)}`,
        'Z',
    ].join(' ');
    return tag('path', { d, fill: color });
}

function renderNowPillLabel(n: PositionedNowline, labelTextColor: string): string {
    const baselineY = n.pillTopY + NOW_PILL_LABEL_BASELINE_OFFSET_PX;
    const edgeX = squaredEdgeX(n);
    let labelX: number;
    let textAnchor: 'start' | 'middle' | 'end';
    if (n.pillMode === 'center') {
        labelX = n.x;
        textAnchor = 'middle';
    } else if (n.pillMode === 'flag-right') {
        labelX = edgeX + NOW_PILL_LABEL_INSET_X_PX;
        textAnchor = 'start';
    } else {
        labelX = edgeX - NOW_PILL_LABEL_INSET_X_PX;
        textAnchor = 'end';
    }
    return textTag(
        {
            x: num(labelX),
            y: num(baselineY),
            'font-family': FONT_STACK.sans,
            'font-size': NOW_PILL_LABEL_FONT_SIZE_PX,
            'font-weight': 700,
            fill: labelTextColor,
            'text-anchor': textAnchor,
        },
        'now',
    );
}

function renderItem(i: PositionedItem, options: RenderOptions, idPrefix: string, palette: Theme): string {
    const parts: string[] = [];
    const shadow = shadowFilterUrl(idPrefix, i.style.shadow);
    parts.push(
        rectFrame(i.box.x, i.box.y, i.box.width, i.box.height, i.style, {
            filter: shadow ?? null,
        }),
    );
    // Status-dot color — the dot communicates status via hue, but
    // the bar bg can range from pale status tints (`#eff6ff`) to
    // saturated mid-tones (`#1e88e5` from `bg:blue` labels) to
    // dark navies (`#172554` in dark theme), so a single palette
    // can't keep contrast across all bars. Two palettes — `onLight`
    // (deep tints, for pale bars) and `onDark` (pale tints, for
    // saturated/dark bars) — are picked from based on the bar
    // bg's relative luminance.
    const dotPalette = pickStatusDotPalette(i.style.bg, palette);
    const statusColors: Record<string, string> = {
        done: dotPalette.done,
        'in-progress': dotPalette.inProgress,
        'at-risk': dotPalette.atRisk,
        blocked: dotPalette.blocked,
        planned: dotPalette.planned,
        neutral: dotPalette.neutral,
    };
    const dotColor = statusColors[i.status] ?? statusColors.neutral;
    // Bottom progress strip along the bottom edge. Height comes from
    // `PROGRESS_STRIP_HEIGHT_PX` so layout's chip placement and the
    // milestone slack-arrow attach Y stay in sync if it's ever bumped.
    if (i.progressFraction > 0) {
        const pw = Math.max(0, Math.min(i.box.width, i.box.width * i.progressFraction));
        parts.push(
            tag('rect', {
                x: num(i.box.x),
                y: num(i.box.y + i.box.height - PROGRESS_STRIP_HEIGHT_PX),
                width: num(pw),
                height: PROGRESS_STRIP_HEIGHT_PX,
                fill: i.style.fg,
                opacity: 0.55,
            }),
        );
    }
    // Status dot — upper-right inset inside the bar, OR pushed into
    // the spill column when the bar is too narrow to host the dot's
    // full inset (`dotSpills`). Layout pre-computes `dotSpillCx` for
    // the spilled case so the renderer stays geometry-dumb.
    const dotCx = i.dotSpills && i.dotSpillCx !== null
        ? i.dotSpillCx
        : i.box.x + i.box.width - ITEM_STATUS_DOT_INSET_RIGHT_PX;
    parts.push(
        tag('circle', {
            cx: num(dotCx),
            cy: num(i.box.y + ITEM_STATUS_DOT_INSET_TOP_PX),
            r: ITEM_STATUS_DOT_RADIUS_PX,
            fill: dotColor,
        }),
    );
    // Title + meta are an atomic caption. When `textSpills` is set the
    // layout has already bumped the next item to a fresh row, so we draw
    // both lines BESIDE the bar (just past its right edge, stacked) at
    // the same vertical positions they would occupy inside. When they
    // fit, both go inside at the bar's left padding.
    //
    // The spilled-decoration cluster reads `[bar] [icon?] [title]
    // [footnote?] [dot?]` — the only decoration to the LEFT of the
    // title is the link icon (the icon→title affordance must stay
    // adjacent). The dot trails the title to mirror its in-bar
    // upper-right position; the footnote walks alongside the title
    // (between title and dot) just like its in-bar `text-anchor: end`
    // placement at the upper-right.
    let captionX: number;
    if (i.textSpills) {
        captionX = i.box.x + i.box.width + ITEM_CAPTION_SPILL_GAP_PX;
        if (i.iconSpills) {
            captionX +=
                ITEM_LINK_ICON_TILE_SIZE_PX + ITEM_DECORATION_SPILL_GAP_PX;
        }
    } else {
        captionX = i.box.x + ITEM_CAPTION_INSET_X_PX;
    }
    // When the caption spills outside the bar it renders on the
    // chart / group bg instead of the bar fill — `i.style.text` is
    // resolved against the bar (e.g. `enterprise-style` propagates
    // `text:white` from a label and audit-log's title becomes
    // white-on-blue inside, but white-on-peach when spilled onto
    // the orange-tinted audit-track group). Use the theme's
    // default item text color (always tuned for chart bg) when
    // text spills, and the per-bar color when it stays inside.
    const captionInsideTextColor = i.style.text;
    const captionOutsideTextColor = palette.entities.item.text;
    const titleColor = i.textSpills ? captionOutsideTextColor : captionInsideTextColor;
    const metaColor = i.textSpills ? captionOutsideTextColor : i.style.fg;
    if (i.title) {
        parts.push(
            textTag(
                {
                    x: num(captionX),
                    y: num(i.box.y + ITEM_CAPTION_TITLE_BASELINE_OFFSET_PX),
                    'font-family': FONT_STACK[i.style.font],
                    'font-size': ITEM_CAPTION_TITLE_FONT_SIZE_PX,
                    'font-weight': 600,
                    fill: titleColor,
                },
                i.title,
            ),
        );
    }
    if (i.metaText) {
        parts.push(
            textTag(
                {
                    x: num(captionX),
                    y: num(i.box.y + ITEM_CAPTION_META_BASELINE_OFFSET_PX),
                    'font-family': FONT_STACK[i.style.font],
                    'font-size': ITEM_CAPTION_META_FONT_SIZE_PX,
                    fill: metaColor,
                },
                i.metaText,
            ),
        );
    }
    // Capacity suffix — `2w 5×`, `2w 5 [person]`, `0.5 ★`, etc. Renders on
    // the meta line, immediately after metaText (or at the line's left
    // edge when there's no metaText). See specs/rendering.md § Item
    // capacity suffix. Layout owns parsing/formatting/icon resolution; the
    // renderer just paints the assembled `PositionedCapacity`.
    if (i.capacity) {
        parts.push(
            renderCapacitySuffix(
                i.capacity,
                i.metaText,
                captionX,
                i.box.y + ITEM_CAPTION_META_BASELINE_OFFSET_PX,
                ITEM_CAPTION_META_FONT_SIZE_PX,
                FONT_STACK[i.style.font],
                metaColor,
            ),
        );
    }
    // Footnote superscript indicators. Two render modes:
    //   - In-bar (default): glyphs walk LEFT from
    //     `bar.right - ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX`,
    //     anchored end. They sit on the bar fill, so use the bar's
    //     resolved text color for contrast (a hardcoded red was
    //     getting lost on saturated mid-tone bars from `bg:blue`
    //     labels). The "footnote = red" attention cue lives on the
    //     footnote PANEL's red number column at the bottom of the
    //     chart where red reads cleanly against white.
    //   - Spilled (narrow bars): the glyphs render in the spill
    //     column to the right of the bar, walking RIGHT from
    //     `footnoteSpillStartX` so they read in the same numerical
    //     order as the in-bar case. They sit on the chart bg, so
    //     use the chart-tuned default text color (same as spilled
    //     captions).
    if (i.footnoteIndicators.length > 0) {
        const footnoteY = i.box.y + ITEM_FOOTNOTE_INDICATOR_BASELINE_OFFSET_PX;
        if (i.footnoteSpills && i.footnoteSpillStartX !== null) {
            let fx = i.footnoteSpillStartX;
            for (let k = 0; k < i.footnoteIndicators.length; k++) {
                const n2 = i.footnoteIndicators[k];
                parts.push(
                    textTag(
                        {
                            x: num(fx),
                            y: num(footnoteY),
                            'font-family': FONT_STACK.sans,
                            'font-size': 10,
                            'font-weight': 700,
                            fill: captionOutsideTextColor,
                        },
                        String(n2),
                    ),
                );
                fx += ITEM_FOOTNOTE_INDICATOR_STEP_PX;
            }
        } else {
            let fx = i.box.x + i.box.width - ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX;
            for (let k = i.footnoteIndicators.length - 1; k >= 0; k--) {
                const n2 = i.footnoteIndicators[k];
                parts.push(
                    textTag(
                        {
                            x: num(fx),
                            y: num(footnoteY),
                            'font-family': FONT_STACK.sans,
                            'font-size': 10,
                            'font-weight': 700,
                            fill: i.style.text,
                            'text-anchor': 'end',
                        },
                        String(n2),
                    ),
                );
                fx -= ITEM_FOOTNOTE_INDICATOR_STEP_PX;
            }
        }
    }
    // Link icon — colored tile + white external-link glyph. Default
    // position is the bar's UPPER-LEFT corner; on a bar too narrow
    // to host both the icon and the status-dot column with a gap
    // between them, the icon spills out to the right of the bar
    // (in front of the spilled title) so the icon→title affordance
    // stays intact. The glyph is the same outbound-arrow ↗ for
    // every link kind (linear / github / jira / generic) — they
    // only differ in tile color. The include FILE-LEVEL region
    // (`include "./other.nowline"`) uses a separate stacked-sheets
    // glyph rendered by `renderIncludeRegion`, distinct from this
    // item-level link icon.
    if (!options.noLinks && i.linkIcon && i.linkIcon !== 'none') {
        const tileColor: Record<string, string> = {
            linear: '#5e6ad2',
            github: '#0f172a',
            jira: '#0052cc',
            generic: palette.item.linkIconFg,
        };
        const tile = tileColor[i.linkIcon] ?? tileColor.generic;
        const tileSize = ITEM_LINK_ICON_TILE_SIZE_PX;
        const tileX = i.iconSpills && i.iconSpillX !== null
            ? i.iconSpillX
            : i.box.x + ITEM_LINK_ICON_INSET_PX;
        const tileY = i.box.y + ITEM_LINK_ICON_INSET_PX;
        const tileRect = tag('rect', {
            x: num(tileX),
            y: num(tileY),
            width: tileSize,
            height: tileSize,
            rx: 2,
            ry: 2,
            fill: tile,
        });
        const gx = tileX;
        const gy = tileY;
        const glyph = tag('path', {
            d: `M${num(gx + 4)} ${num(gy + 10)} L${num(gx + 10)} ${num(gy + 4)} M${num(gx + 6)} ${num(gy + 4)} H${num(gx + 10)} V${num(gy + 8)}`,
            stroke: '#ffffff',
            fill: 'none',
            'stroke-width': 1.1,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
        });
        const inner = tileRect + glyph;
        const link = i.linkHref
            ? tag('a', { href: i.linkHref, target: '_blank', rel: 'noopener' }, inner)
            : inner;
        parts.push(link);
    }
    // Overflow tail — red fill + stroke + caption.
    if (i.hasOverflow && i.overflowBox) {
        const tailFill = palette.item.overflowTailFill;
        const tailStroke = palette.item.overflowTailStroke;
        const captionColor = palette.item.overflowCaption;
        parts.push(
            tag('rect', {
                x: num(i.overflowBox.x),
                y: num(i.overflowBox.y),
                width: num(i.overflowBox.width),
                height: num(i.overflowBox.height),
                fill: tailFill,
                stroke: tailStroke,
                'stroke-width': 1,
            }),
        );
        if (i.overflowAnchorId && i.overflowBox.width > 60) {
            parts.push(
                textTag(
                    {
                        x: num(i.overflowBox.x + i.overflowBox.width / 2),
                        y: num(i.overflowBox.y + i.overflowBox.height / 2 + 3),
                        'font-family': FONT_STACK.sans,
                        'font-size': 9,
                        'font-weight': 700,
                        fill: captionColor,
                        'text-anchor': 'middle',
                    },
                    `past ${i.overflowAnchorId}`,
                ),
            );
        }
    }
    // Label chips
    for (const chip of i.labelChips) {
        const rx = Math.min(CORNER_RADIUS_PX[chip.style.cornerRadius] ?? 8, chip.box.height / 2);
        parts.push(
            tag('rect', {
                x: num(chip.box.x),
                y: num(chip.box.y),
                width: num(chip.box.width),
                height: num(chip.box.height),
                rx: num(rx),
                ry: num(rx),
                fill: chip.style.bg === 'none' ? 'transparent' : chip.style.bg,
                stroke: chip.style.fg,
                'stroke-width': 0.5,
            }),
        );
        parts.push(
            textTag(
                {
                    x: num(chip.box.x + chip.box.width / 2),
                    y: num(chip.box.y + chip.box.height / 2 + 3),
                    ...fontAttrs(chip.style, TEXT_SIZE_PX.xs),
                    'text-anchor': 'middle',
                },
                chip.text,
            ),
        );
    }
    return tag('g', { 'data-layer': 'item', 'data-id': i.id ?? null }, parts.join(''));
}

function renderGroup(g: PositionedGroup, options: RenderOptions, idPrefix: string, palette: Theme): string {
    const parts: string[] = [];
    const hasFill = g.style.bg !== 'none' && g.style.bg !== '#ffffff';
    if (hasFill) {
        // Filled-box style with a chiclet label flush in the upper-left
        // corner. The painted box matches the layout-reported `box` 1:1
        // (no overhang), so parents stack against the right rectangle.
        parts.push(
            tag('rect', {
                x: num(g.box.x),
                y: num(g.box.y),
                width: num(g.box.width),
                height: num(g.box.height),
                rx: 6,
                ry: 6,
                fill: g.style.bg,
                stroke: g.style.fg,
                'stroke-width': 1,
                'fill-opacity': 0.18,
                filter: `url(#${idPrefix}-shadow-subtle)`,
            }),
        );
        if (g.title) {
            const tabW =
                g.title.length * GROUP_TITLE_TAB_CHAR_WIDTH_PX +
                2 * GROUP_TITLE_TAB_PAD_X_PX;
            const tabX = g.box.x;
            const tabY = g.box.y;
            const tabH = GROUP_TITLE_TAB_HEIGHT_PX;
            // Asymmetric corner shape: TOP-LEFT and BOTTOM-RIGHT are
            // rounded (radius 6, matching the parent group box), while
            // TOP-RIGHT and BOTTOM-LEFT are square. The TL roundness
            // continues the group box's outer corner; the squared
            // BL / TR sides "anchor" the tab into the box's left and
            // top edges so it reads as a corner-mounted label rather
            // than a floating pill.
            const r = 6;
            const tabPath =
                `M${num(tabX + r)} ${num(tabY)}` +
                `H${num(tabX + tabW)}` +
                `V${num(tabY + tabH - r)}` +
                `A${r} ${r} 0 0 1 ${num(tabX + tabW - r)} ${num(tabY + tabH)}` +
                `H${num(tabX)}` +
                `V${num(tabY + r)}` +
                `A${r} ${r} 0 0 1 ${num(tabX + r)} ${num(tabY)}` +
                `Z`;
            parts.push(
                tag('path', {
                    d: tabPath,
                    fill: g.style.fg,
                }),
            );
            parts.push(
                textTag(
                    {
                        x: num(tabX + GROUP_TITLE_TAB_PAD_X_PX),
                        y: num(tabY + GROUP_TITLE_TAB_LABEL_BASELINE_OFFSET_PX),
                        'font-family': FONT_STACK[g.style.font],
                        'font-size': GROUP_TITLE_TAB_LABEL_FONT_SIZE_PX,
                        'font-weight': 600,
                        fill: '#ffffff',
                    },
                    g.title,
                ),
            );
        }
    } else {
        const bracketColor = g.style.fg;
        if (g.style.bracket !== 'none') {
            parts.push(
                tag('path', {
                    d: `M${num(g.box.x)} ${num(g.box.y)} L${num(g.box.x)} ${num(g.box.y + g.box.height)} L${num(g.box.x + 4)} ${num(g.box.y + g.box.height)}`,
                    fill: 'none',
                    stroke: bracketColor,
                    'stroke-width': 1,
                    'stroke-dasharray': g.style.bracket === 'dashed' ? '3 2' : null,
                }),
            );
        }
        if (g.title) {
            parts.push(
                textTag(
                    {
                        x: num(g.box.x + 6),
                        y: num(g.box.y - 2),
                        ...fontAttrs(g.style, TEXT_SIZE_PX.xs),
                        'fill-opacity': 0.7,
                    },
                    g.title,
                ),
            );
        }
    }
    for (const c of g.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette));
    }
    void palette;
    return tag('g', { 'data-layer': 'group', 'data-id': g.id ?? null }, parts.join(''));
}

function renderParallel(p: PositionedParallel, options: RenderOptions, idPrefix: string, palette: Theme): string {
    const parts: string[] = [];
    // `bracket: solid|dashed` parallels render explicit [ ] brackets framing
    // the nested tracks with 12 px vertical padding above/below.
    if (p.style.bracket === 'solid' || p.style.bracket === 'dashed') {
        const padding = 12;
        const stub = 4;
        const top = p.box.y - padding;
        const bottom = p.box.y + p.box.height + padding;
        const lx = p.box.x;
        const rx = p.box.x + p.box.width;
        const stroke = palette.parallel.bracketStroke;
        parts.push(
            tag('path', {
                d: `M${num(lx + stub)} ${num(top)} H${num(lx)} V${num(bottom)} H${num(lx + stub)}`,
                fill: 'none',
                stroke,
                'stroke-width': 1.25,
                'stroke-dasharray': p.style.bracket === 'dashed' ? '3 3' : null,
                'stroke-linejoin': 'round',
            }),
        );
        parts.push(
            tag('path', {
                d: `M${num(rx - stub)} ${num(top)} H${num(rx)} V${num(bottom)} H${num(rx - stub)}`,
                fill: 'none',
                stroke,
                'stroke-width': 1.25,
                'stroke-dasharray': p.style.bracket === 'dashed' ? '3 3' : null,
                'stroke-linejoin': 'round',
            }),
        );
    }
    if (p.title) {
        parts.push(
            textTag(
                {
                    x: num(p.box.x + 4),
                    y: num(p.box.y - 2),
                    ...fontAttrs(p.style, TEXT_SIZE_PX.xs),
                    'fill-opacity': 0.7,
                },
                p.title,
            ),
        );
    }
    for (const c of p.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette));
    }
    return tag('g', { 'data-layer': 'parallel', 'data-id': p.id ?? null }, parts.join(''));
}

function renderTrackChild(c: PositionedTrackChild, options: RenderOptions, idPrefix: string, palette: Theme): string {
    if (c.kind === 'item') return renderItem(c, options, idPrefix, palette);
    if (c.kind === 'group') return renderGroup(c, options, idPrefix, palette);
    return renderParallel(c, options, idPrefix, palette);
}

function renderSwimlane(s: PositionedSwimlane, options: RenderOptions, idPrefix: string, palette: Theme): string {
    const tint = s.bandIndex % 2 === 0 ? palette.swimlane.rowTintEven : palette.swimlane.rowTintOdd;
    const borderColor = palette.swimlane.border;
    const tabFill = palette.swimlane.tabFill;
    const tabStroke = palette.swimlane.tabStroke;
    const tabText = palette.swimlane.tabText;
    const ownerText = palette.swimlane.ownerText;
    const footnoteColor = palette.swimlane.footnoteIndicator;
    const parts: string[] = [];
    parts.push(
        tag('rect', {
            x: num(s.box.x),
            y: num(s.box.y),
            width: num(s.box.width),
            height: num(s.box.height),
            fill: tint,
            stroke: borderColor,
            'stroke-width': 1,
        }),
    );
    // Frame-tab chiclet at the top-left of the band — auto-sized to fit
    // title + owner. Geometry comes from the shared `frameTabGeometry`
    // helper that the layout's row-packer also calls, so the chiclet's
    // visible footprint matches the collision box layout reserved for it.
    if (s.title) {
        // Lane capacity badge sits inside the frame tab after the owner
        // (or after the title if no owner). Compute its width up-front so
        // `frameTabGeometry` can size the chiclet to fit it, then read
        // the placement positions back out — no second placement pass in
        // the renderer.
        const LANE_BADGE_FONT_SIZE_PX = 10;
        const capacityBadgeBareWidthPx = s.capacity
            ? estimateCapacitySuffixWidth(
                  s.capacity.text,
                  s.capacity.icon,
                  LANE_BADGE_FONT_SIZE_PX,
              )
            : 0;
        const tab = frameTabGeometry(s.box.x, s.title, s.owner, capacityBadgeBareWidthPx);
        const tabH = FRAME_TAB_HEIGHT_PX;
        const tabY = s.box.y + 10;
        const labelY = tabY + FRAME_TAB_LABEL_BASELINE_OFFSET_PX;
        parts.push(
            tag('rect', {
                x: num(tab.tabX),
                y: num(tabY),
                width: num(tab.tabW),
                height: num(tabH),
                rx: 4,
                ry: 4,
                fill: tabFill,
                stroke: tabStroke,
                'stroke-width': 1,
            }),
        );
        parts.push(
            textTag(
                {
                    x: num(tab.titleX),
                    y: num(labelY),
                    'font-family': FONT_STACK[s.style.font],
                    'font-size': 12,
                    'font-weight': 600,
                    fill: tabText,
                },
                s.title,
            ),
        );
        if (s.owner) {
            parts.push(
                textTag(
                    {
                        x: num(tab.ownerX),
                        y: num(labelY),
                        'font-family': FONT_STACK[s.style.font],
                        'font-size': 10,
                        fill: ownerText,
                    },
                    `owner: ${s.owner}`,
                ),
            );
        }
        if (s.capacity) {
            // Re-uses the same `renderCapacitySuffix` helper that paints
            // item-level suffixes (m6) so multiplier / built-in SVG /
            // inline literal / dereferenced-custom-glyph paths stay
            // consistent across both contexts.
            parts.push(
                renderCapacitySuffix(
                    s.capacity,
                    undefined,
                    tab.badgeX,
                    labelY,
                    LANE_BADGE_FONT_SIZE_PX,
                    FONT_STACK[s.style.font],
                    ownerText,
                ),
            );
        }
        if (s.footnoteIndicators.length > 0) {
            parts.push(
                textTag(
                    {
                        x: num(tab.rightX - 8),
                        y: num(tabY + 14),
                        'font-family': FONT_STACK.sans,
                        'font-size': 10,
                        'font-weight': 700,
                        fill: footnoteColor,
                        'text-anchor': 'end',
                    },
                    s.footnoteIndicators.join(','),
                ),
            );
        }
    }
    for (const c of s.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette));
    }
    return tag('g', { 'data-layer': 'swimlane', 'data-id': s.id ?? null }, parts.join(''));
}

function renderAnchor(a: PositionedAnchor, palette: Theme): string {
    const size = a.radius;
    const cx = a.center.x;
    const cy = a.center.y;
    const fill = palette.anchorDiamond.fill;
    const stroke = palette.anchorDiamond.stroke;
    const diamond = tag('path', {
        d: `M${num(cx)} ${num(cy - size)} L${num(cx + size)} ${num(cy)} L${num(cx)} ${num(cy + size)} L${num(cx - size)} ${num(cy)} Z`,
        fill,
        stroke,
        'stroke-width': 1.25,
    });
    const labelColor = palette.anchorDiamond.label;
    // For left-flipped labels, anchor the text at its RIGHT edge using
    // `text-anchor: end`. The layout's `labelBox.width` is intentionally
    // pessimistic (0.58 em/char) so positioning by the box's left edge
    // would leave a visible gap between the actual text right edge and
    // the diamond. End-anchoring lets the browser size the glyph run
    // exactly and put the rightmost glyph 6 px from the diamond — same
    // rhythm the right-side labels already get from start-anchoring at
    // `diamondRight + 6`.
    const labelX = a.labelSide === 'left'
        ? a.labelBox.x + a.labelBox.width
        : a.labelBox.x;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(labelX),
        y: num(cy + 4),
        'font-family': FONT_STACK.sans,
        'font-size': 10,
        fill: labelColor,
    };
    if (a.labelSide === 'left') labelAttrs['text-anchor'] = 'end';
    const label = a.title ? textTag(labelAttrs, a.title) : '';
    return tag('g', { 'data-layer': 'anchor', 'data-id': a.id ?? null }, diamond + label);
}

function renderAnchorCutLine(a: PositionedAnchor, palette: Theme): string {
    const stroke = palette.anchorDiamond.cutLine;
    return tag('line', {
        x1: num(a.center.x),
        y1: num(a.center.y + a.radius + 1),
        x2: num(a.center.x),
        y2: num(a.cutBottomY),
        stroke,
        'stroke-width': 1,
        'stroke-dasharray': '1 3',
    });
}

function renderMilestone(m: PositionedMilestone, palette: Theme): string {
    const cx = m.center.x;
    const cy = m.center.y;
    const r = m.radius;
    const fill = palette.milestoneDiamond.fill;
    const flag = tag('path', {
        d: `M${num(cx)} ${num(cy - r)} L${num(cx + r)} ${num(cy)} L${num(cx)} ${num(cy + r)} L${num(cx - r)} ${num(cy)} Z`,
        fill,
        stroke: fill,
        'stroke-width': 1,
    });
    const labelColor = palette.milestoneDiamond.label;
    // See renderAnchor — left-flipped labels use `text-anchor: end` so
    // the visual right edge sits at `diamondLeft - 6`, matching the
    // 6 px rhythm of right-side labels.
    const labelX = m.labelSide === 'left'
        ? m.labelBox.x + m.labelBox.width
        : m.labelBox.x;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(labelX),
        y: num(cy + 4),
        'font-family': FONT_STACK.sans,
        'font-size': 10,
        'font-weight': 600,
        fill: labelColor,
    };
    if (m.labelSide === 'left') labelAttrs['text-anchor'] = 'end';
    const label = m.title ? textTag(labelAttrs, m.title) : '';
    return tag('g', { 'data-layer': 'milestone', 'data-id': m.id ?? null }, flag + label);
}

function renderMilestoneCutLine(m: PositionedMilestone, palette: Theme): string {
    const stroke = m.isOverrun
        ? palette.milestoneDiamond.cutLineOverrun
        : palette.milestoneDiamond.cutLineNormal;
    const parts: string[] = [];
    parts.push(
        tag('line', {
            x1: num(m.center.x),
            y1: num(m.center.y + m.radius + 1),
            x2: num(m.center.x),
            y2: num(m.cutBottomY),
            stroke,
            'stroke-width': 2,
            'stroke-dasharray': ACCENT_DASH_PATTERN,
            'stroke-linecap': 'round',
        }),
    );
    if (m.slackArrows && m.slackArrows.length > 0) {
        const slackColor = palette.milestoneDiamond.slack;
        for (const arrow of m.slackArrows) {
            parts.push(
                tag('path', {
                    d: `M${num(arrow.x)} ${num(arrow.y)} H${num(m.center.x - 6)}`,
                    fill: 'none',
                    stroke: slackColor,
                    'stroke-width': 1.1,
                    'stroke-dasharray': '3 3',
                    'stroke-linecap': 'round',
                    'marker-end': 'url(#nl-arrow-dark)',
                }),
            );
        }
    }
    return parts.join('');
}

function renderEdge(e: PositionedDependencyEdge, palette: Theme): string {
    const color = e.kind === 'overflow'
        ? palette.dependency.overflowStroke
        : palette.dependency.edgeStroke;
    const points = e.waypoints;
    if (points.length < 2) return '';
    return tag('path', {
        d: roundedOrthogonalPath(points, EDGE_CORNER_RADIUS),
        fill: 'none',
        stroke: color,
        'stroke-width': 1.1,
        'stroke-dasharray': e.kind === 'overflow' ? '4 2' : null,
        'stroke-linejoin': 'round',
        'marker-end': 'url(#nl-arrow)',
    });
}

// Build an SVG path for a sequence of orthogonal waypoints, inserting a
// quarter-arc at every interior bend. Falls back to straight segments when
// adjacent points aren't axis-aligned (defensive — the layout always emits
// orthogonal segments).
function roundedOrthogonalPath(points: Point[], radius: number): string {
    if (points.length < 2) return '';
    const parts: string[] = [`M${num(points[0].x)} ${num(points[0].y)}`];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        if (i === points.length - 1) {
            parts.push(`L${num(cur.x)} ${num(cur.y)}`);
            continue;
        }
        const next = points[i + 1];
        const dxIn = Math.sign(cur.x - prev.x);
        const dyIn = Math.sign(cur.y - prev.y);
        const dxOut = Math.sign(next.x - cur.x);
        const dyOut = Math.sign(next.y - cur.y);
        const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
        const r = Math.min(radius, inLen / 2, outLen / 2);
        if (r <= 0 || (dxIn !== 0 && dxOut !== 0) || (dyIn !== 0 && dyOut !== 0)) {
            parts.push(`L${num(cur.x)} ${num(cur.y)}`);
            continue;
        }
        const beforeBend = { x: cur.x - dxIn * r, y: cur.y - dyIn * r };
        const afterBend = { x: cur.x + dxOut * r, y: cur.y + dyOut * r };
        parts.push(`L${num(beforeBend.x)} ${num(beforeBend.y)}`);
        parts.push(`Q${num(cur.x)} ${num(cur.y)} ${num(afterBend.x)} ${num(afterBend.y)}`);
    }
    return parts.join(' ');
}

function renderFootnotes(f: PositionedFootnoteArea, idPrefix: string, palette: Theme): string {
    if (f.entries.length === 0) return '';
    const panelFill = palette.footnotePanel.fill;
    const borderColor = palette.footnotePanel.border;
    const headerColor = palette.footnotePanel.header;
    const titleColor = palette.footnotePanel.title;
    const descColor = palette.footnotePanel.description;
    const numberColor = palette.footnotePanel.number;
    const parts: string[] = [];
    parts.push(
        tag('rect', {
            x: num(f.box.x),
            y: num(f.box.y),
            width: num(f.box.width),
            height: num(f.box.height),
            rx: 6,
            ry: 6,
            fill: panelFill,
            stroke: borderColor,
            'stroke-width': 1,
            filter: `url(#${idPrefix}-shadow-subtle)`,
        }),
    );
    parts.push(
        textTag(
            {
                x: num(f.box.x + FOOTNOTE_PANEL_PADDING_PX),
                y: num(f.box.y + FOOTNOTE_HEADER_BASELINE_OFFSET_PX),
                'font-family': FONT_STACK.sans,
                'font-size': 12,
                'font-weight': 700,
                fill: headerColor,
            },
            'Footnotes',
        ),
    );
    // First entry baseline = panel-top + header band + one panel padding
    // (the gap between the header band and the first row).
    const firstEntryBaselineY = f.box.y + FOOTNOTE_HEADER_HEIGHT_PX + FOOTNOTE_PANEL_PADDING_PX;
    const numberX = f.box.x + FOOTNOTE_PANEL_PADDING_PX;
    const titleX = numberX + FOOTNOTE_PANEL_PADDING_PX;
    f.entries.forEach((e, i) => {
        const y = firstEntryBaselineY + i * FOOTNOTE_ROW_HEIGHT;
        parts.push(
            textTag(
                { x: num(numberX), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 10, 'font-weight': 700, fill: numberColor },
                String(e.number),
            ),
        );
        parts.push(
            textTag(
                { x: num(titleX), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 11, 'font-weight': 600, fill: titleColor },
                e.title,
            ),
        );
        if (e.description) {
            parts.push(
                textTag(
                    { x: num(titleX + Math.max(120, e.title.length * 6)), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 11, fill: descColor },
                    `— ${e.description}`,
                ),
            );
        }
    });
    return tag('g', { 'data-layer': 'footnotes' }, parts.join(''));
}

function renderIncludeRegion(
    r: PositionedIncludeRegion,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
): string {
    const border = palette.includeRegion.border;
    const fill = palette.includeRegion.fill;
    const tabFill = palette.includeRegion.tabFill;
    const tabStroke = palette.includeRegion.tabStroke;
    const tabText = palette.includeRegion.tabText;
    const badgeFill = palette.includeRegion.badgeFill;
    const badgeStroke = palette.includeRegion.badgeStroke;
    const badgeText = palette.includeRegion.badgeText;

    const rx = r.box.x + 8;
    const ry = r.box.y;
    const rw = r.box.width - 16;
    const rh = r.box.height;

    const region = tag('rect', {
        x: num(rx),
        y: num(ry),
        width: num(rw),
        height: num(rh),
        rx: 8,
        ry: 8,
        fill,
        stroke: border,
        'stroke-width': 1,
        'stroke-dasharray': ACCENT_DASH_PATTERN,
    });

    const tabPaddingX = 10;
    const tabHeight = FRAME_TAB_HEIGHT_PX;
    const tabWidth = Math.max(60, r.label.length * 6.5 + tabPaddingX * 2);
    const tabX = rx + 16;
    const tabY = ry - tabHeight / 2;
    const tab = tag('rect', {
        x: num(tabX),
        y: num(tabY),
        width: num(tabWidth),
        height: tabHeight,
        rx: 4,
        ry: 4,
        fill: tabFill,
        stroke: tabStroke,
        'stroke-width': 1,
    });
    const tabLabel = textTag(
        {
            x: num(tabX + tabPaddingX),
            y: num(tabY + FRAME_TAB_LABEL_BASELINE_OFFSET_PX),
            'font-family': FONT_STACK.sans,
            'font-size': 11,
            'font-weight': 600,
            fill: tabText,
        },
        r.label,
    );

    // Include badge to the right of the tab. The glyph here is the
    // stacked-sheets icon, distinct from the item-level link-icon
    // outbound-arrow: an `include` is a content pull (one document
    // brings in another), conceptually different from a `link:` that
    // navigates somewhere.
    const badgeSize = 18;
    const badgeX = tabX + tabWidth + 6;
    const badgeY = ry - badgeSize / 2;
    const badge = tag('rect', {
        x: num(badgeX),
        y: num(badgeY),
        width: badgeSize,
        height: badgeSize,
        rx: 4,
        ry: 4,
        fill: badgeFill,
        stroke: badgeStroke,
        'stroke-width': 1,
    });
    // Glyph: stacked sheets — back rectangle peeking behind front
    // rectangle. Sized for the 18×18 badge tile.
    const glyph = tag('path', {
        d: `M${num(badgeX + 7)} ${num(badgeY + 4)} H${num(badgeX + 14)} V${num(badgeY + 11)}` +
            ` M${num(badgeX + 4)} ${num(badgeY + 7)} H${num(badgeX + 11)} V${num(badgeY + 14)} H${num(badgeX + 4)} Z`,
        stroke: badgeText,
        'stroke-width': 1.4,
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    });
    // Halo behind the source-path text. The text's baseline at `ry + 4`
    // straddles the dashed region border (drawn at y = ry); without a
    // backing rect the dashed stroke cuts through the text body. Matches
    // how the tab and badge already mask the border where they cross it.
    // Fill is `includeRegion.fill` — same cream/tint as the region, near
    // the canvas surface above, so the halo disappears into both.
    const sourceFontSize = 9;
    const sourceCharWidth = 5.5; // approx px/char for 9pt mono
    const sourceTextX = badgeX + badgeSize + 6;
    const sourceTextY = ry + 4;
    const sourceHaloPad = 3;
    const sourceHalo = tag('rect', {
        x: num(sourceTextX - sourceHaloPad),
        y: num(sourceTextY - sourceFontSize),
        width: num(r.sourcePath.length * sourceCharWidth + sourceHaloPad * 2),
        height: sourceFontSize + sourceHaloPad * 2,
        fill,
    });
    const sourceText = textTag(
        {
            x: num(sourceTextX),
            y: num(sourceTextY),
            'font-family': FONT_STACK.mono,
            'font-size': sourceFontSize,
            fill: badgeText,
        },
        r.sourcePath,
    );

    // Nested swimlanes (laid out by buildIncludeRegions against the parent's timeline).
    const nested = r.nestedSwimlanes
        .map((s) => renderSwimlane(s, options, idPrefix, palette))
        .join('');

    return tag(
        'g',
        { 'data-layer': 'include' },
        region + nested + tab + tabLabel + badge + glyph + sourceHalo + sourceText,
    );
}

// Paint the "Powered by nowline" attribution mark inside the
// layout-supplied `attributionBox`. The whole mark — prefix text,
// "now", red "l" bar, and "ine" — sits inside one <a href> so the
// entire string is clickable. Glyph anatomy (positions, widths, scale)
// lives in `themes/shared.ts` (`ATTRIBUTION_*`); the layout reserves a
// box of exactly that size at canvas-bottom-right.
function renderAttributionMark(model: PositionedRoadmap): string {
    const muted = model.palette.attribution.mark;
    const accent = model.palette.attribution.link;
    if (model.swimlanes.length === 0) return '';
    const tx = model.header.attributionBox.x;
    const ty = model.header.attributionBox.y;
    // Both texts share the wordmark's baseline (y = wordmark font size)
    // so the smaller "Powered by" sits visually above the wordmark's
    // baseline without bumping the bar's bottom up.
    const baselineY = ATTRIBUTION_WORDMARK_FONT_SIZE;
    const inner =
        textTag(
            {
                x: '0',
                y: baselineY,
                'font-family': FONT_STACK.sans,
                'font-size': ATTRIBUTION_PREFIX_FONT_SIZE,
                'font-weight': 400,
                fill: muted,
            },
            ATTRIBUTION_TEXT,
        ) +
        textTag(
            {
                x: ATTRIBUTION_NOW_LOGICAL_X,
                y: baselineY,
                'font-family': FONT_STACK.sans,
                'font-size': ATTRIBUTION_WORDMARK_FONT_SIZE,
                'font-weight': 700,
                fill: muted,
            },
            'now',
        ) +
        tag('rect', {
            x: ATTRIBUTION_BAR_LOGICAL_X,
            y: 12,
            width: ATTRIBUTION_BAR_LOGICAL_WIDTH,
            height: ATTRIBUTION_WORDMARK_FONT_SIZE,
            fill: accent,
        }) +
        textTag(
            {
                x: ATTRIBUTION_INE_LOGICAL_X,
                y: baselineY,
                'font-family': FONT_STACK.sans,
                'font-size': ATTRIBUTION_WORDMARK_FONT_SIZE,
                'font-weight': 400,
                fill: muted,
            },
            'ine',
        );
    const group = tag(
        'g',
        { transform: `translate(${num(tx)} ${num(ty)}) scale(${num(ATTRIBUTION_SCALE)})` },
        inner,
    );
    return tag(
        'a',
        { href: ATTRIBUTION_LINK, target: '_blank', rel: 'noopener', 'aria-label': 'Powered by nowline' },
        tag('g', { 'data-layer': 'attribution' }, group),
    );
}

async function embedLogo(
    logoRef: string,
    resolver: AssetResolver | undefined,
    idPrefix: string,
    options: RenderOptions,
    x: number,
    y: number,
    size: number,
): Promise<string> {
    if (!resolver) return '';
    let asset: AssetBytes;
    try {
        asset = await resolver(logoRef);
    } catch (err) {
        const msg = `logo: failed to load ${logoRef}: ${err instanceof Error ? err.message : String(err)}`;
        if (options.strict) throw err;
        options.warn?.(msg);
        return '';
    }
    const mime = (asset.mime ?? '').toLowerCase();
    if (mime === 'image/svg+xml') {
        const raw = new TextDecoder().decode(asset.bytes);
        const cleaned = sanitizeSvg(raw, { idPrefix: `${idPrefix}-logo`, onWarn: options.warn });
        return tag('g', { transform: `translate(${num(x)} ${num(y)})` }, cleaned);
    }
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp') {
        const b64 = bytesToBase64(asset.bytes);
        return tag('image', {
            href: `data:${mime};base64,${b64}`,
            x: num(x),
            y: num(y),
            width: num(size),
            height: num(size),
            preserveAspectRatio: 'xMidYMid meet',
        });
    }
    const msg = `logo: unsupported mime ${mime} for ${logoRef}`;
    if (options.strict) throw new Error(msg);
    options.warn?.(msg);
    return '';
}

// Base64 without depending on Node's Buffer (renderer stays browser-safe).
function bytesToBase64(bytes: Uint8Array): string {
    if (typeof btoa !== 'undefined') {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    // Node fallback without importing Buffer directly; use lazy dynamic require.
    const g = globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } };
    if (g.Buffer) return g.Buffer.from(bytes).toString('base64');
    throw new Error('renderer: no base64 encoder available');
}

export async function renderSvg(
    model: PositionedRoadmap,
    options: RenderOptions = {},
): Promise<string> {
    const ids = new IdGenerator(options.idPrefix ?? 'nl');
    const idPrefix = ids.next('root');

    const palette = model.palette;
    const parts: string[] = [];

    // <defs> — shadows + arrowhead markers (palette-driven fills baked in).
    const arrowFillNeutral = palette.arrowhead.neutral;
    const arrowFillLight = palette.arrowhead.light;
    const arrowFillDark = palette.arrowhead.dark;
    const arrowDef = (id: string, fill: string): string =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`;
    const defs =
        `<defs>${allShadowDefs(idPrefix)}` +
        arrowDef('nl-arrow', arrowFillNeutral) +
        arrowDef('nl-arrow-light', arrowFillLight) +
        arrowDef('nl-arrow-dark', arrowFillDark) +
        `</defs>`;
    parts.push(defs);

    // Background
    parts.push(
        tag('rect', {
            x: 0,
            y: 0,
            width: num(model.width),
            height: num(model.height),
            fill: model.backgroundColor,
        }),
    );

    // Timeline (behind everything else in the chart)
    parts.push(renderTimeline(model.timeline, palette));

    // Swimlanes
    for (const s of model.swimlanes) parts.push(renderSwimlane(s, options, idPrefix, palette));

    // Include regions (drawn after own swimlanes so the dashed border + tab
    // overlay the chart, with their own nested swimlanes inside).
    for (const r of model.includes) parts.push(renderIncludeRegion(r, options, idPrefix, palette));

    // Dependency edges on top of items but below cut-lines / nowline
    for (const e of model.edges) parts.push(renderEdge(e, palette));

    // Anchor + milestone cut lines drawn AFTER items so they overlay the
    // swimlane fills.
    for (const a of model.anchors) parts.push(renderAnchorCutLine(a, palette));
    for (const m of model.milestones) parts.push(renderMilestoneCutLine(m, palette));

    // Marker-row diamonds + labels.
    for (const a of model.anchors) parts.push(renderAnchor(a, palette));
    for (const m of model.milestones) parts.push(renderMilestone(m, palette));

    // Now-line
    parts.push(renderNowline(model.nowline, palette));

    // Footnotes + header last (always on top)
    parts.push(renderFootnotes(model.footnotes, idPrefix, palette));
    parts.push(renderHeader(model.header, idPrefix, palette));
    parts.push(renderAttributionMark(model));

    // Logo (if header carries one)
    if (model.header.logo && options.assetResolver) {
        const logoSvg = await embedLogo(
            model.header.logo.assetRef ?? '',
            options.assetResolver,
            idPrefix,
            options,
            model.header.logo.box.x,
            model.header.logo.box.y,
            Math.max(model.header.logo.box.width, model.header.logo.box.height),
        );
        if (logoSvg) parts.push(logoSvg);
    }

    const svgAttrs = attrs({
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${num(model.width)} ${num(model.height)}`,
        width: num(model.width),
        height: num(model.height),
        'data-theme': model.theme,
        'data-generator': 'nowline',
    });
    return `<svg${svgAttrs}>${parts.join('')}</svg>`;
}

// Exported for tests.
export const __internal = {
    renderItem,
    renderSwimlane,
    renderTimeline,
    renderHeader,
    renderEdge,
};

// These helpers are kept in the exports table so tsc doesn't prune them.
void escAttr;
void escText;
