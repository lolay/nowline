import type {
    BoundingBox,
    InlineDatePin,
    Point,
    PositionedAnchor,
    PositionedCapacity,
    PositionedDependencyEdge,
    PositionedFootnoteArea,
    PositionedGroup,
    PositionedHeader,
    PositionedIncludeRegion,
    PositionedItem,
    PositionedMilestone,
    PositionedNowline,
    PositionedParallel,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTimelineScale,
    PositionedTrackChild,
    PositionedWave,
    PositionedWaveBoundary,
    PositionedWaveCrossing,
    PositionedWaveLegend,
    ResolvedStyle,
    Theme,
} from '@nowline/layout';
import {
    ACCENT_DASH_PATTERN,
    ATTRIBUTION_BAR_LOGICAL_WIDTH,
    ATTRIBUTION_BAR_LOGICAL_X,
    ATTRIBUTION_INE_LOGICAL_X,
    ATTRIBUTION_LINK,
    ATTRIBUTION_NOW_LOGICAL_X,
    ATTRIBUTION_PREFIX_FONT_SIZE,
    ATTRIBUTION_SCALE,
    ATTRIBUTION_TEXT,
    ATTRIBUTION_WORDMARK_FONT_SIZE,
    CONTAINER_HEADER_TITLE_BASELINE_OFFSET_PX,
    CONTAINER_HEADER_TITLE_FONT_SIZE_PX,
    CORNER_RADIUS_PX,
    containerHeaderTitleX,
    EDGE_CORNER_RADIUS,
    estimateCapacitySuffixWidth,
    FONT_STACK,
    FOOTNOTE_HEADER_BASELINE_OFFSET_PX,
    FOOTNOTE_HEADER_HEIGHT_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FOOTNOTE_ROW_HEIGHT,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    frameTabGeometry,
    GROUP_HEADER_TITLE_INSET_X_PX,
    GROUP_TITLE_TAB_HEIGHT_PX,
    GROUP_TITLE_TAB_LABEL_BASELINE_OFFSET_PX,
    GROUP_TITLE_TAB_LABEL_FONT_SIZE_PX,
    GROUP_TITLE_TAB_PAD_X_PX,
    groupHasFill,
    groupHeaderBandPx,
    groupTitleTabWidth,
    HEADER_AUTHOR_FONT_SIZE_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_CARD_PADDING_TOP,
    HEADER_CARD_PADDING_X,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
    ITEM_CAPTION_META_FONT_SIZE_PX,
    ITEM_CAPTION_SPILL_GAP_PX,
    ITEM_CAPTION_TITLE_BASELINE_OFFSET_PX,
    ITEM_CAPTION_TITLE_FONT_SIZE_PX,
    ITEM_CAPTION_TITLE_LINE_HEIGHT_PX,
    ITEM_DECORATION_SPILL_GAP_PX,
    ITEM_FOOTNOTE_INDICATOR_BASELINE_OFFSET_PX,
    ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX,
    ITEM_FOOTNOTE_INDICATOR_INSET_RIGHT_PX,
    ITEM_FOOTNOTE_INDICATOR_STEP_PX,
    ITEM_LINK_ICON_INSET_PX,
    ITEM_LINK_ICON_TILE_SIZE_PX,
    ITEM_STATUS_DOT_INSET_RIGHT_PX,
    ITEM_STATUS_DOT_INSET_TOP_PX,
    ITEM_STATUS_DOT_RADIUS_PX,
    includeChromeGeometry,
    itemCaptionInsetX,
    itemCaptionMetaBaselineOffset,
    MARKER_BOLD_WIDTH_FACTOR,
    NOW_PILL_CORNER_RADIUS_PX,
    NOW_PILL_HEIGHT_PX,
    NOW_PILL_LABEL_BASELINE_OFFSET_PX,
    NOW_PILL_LABEL_FONT_SIZE_PX,
    NOW_PILL_LABEL_INSET_X_PX,
    NOWLINE_STROKE_WIDTH_PX,
    PARALLEL_HEADER_TITLE_INSET_X_PX,
    PROGRESS_STRIP_HEIGHT_PX,
    TEXT_SIZE_PX,
    TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX,
    TIMELINE_TICK_LABEL_FONT_SIZE_PX,
    WAVE_BOUNDARY_WIDTH_PX,
    WAVE_CROSS_DASH,
    WAVE_EMPTY_MARKER_SIZE_PX,
    WAVE_HATCH_OPACITY,
    WAVE_HATCH_STROKE_PX,
    WAVE_HATCH_TILE_PX,
    WAVE_STRIP_LABEL_FONT_SIZE_PX,
    WAVE_STRIP_LABEL_PAD_PX,
    WAVE_STYLED_STRIP_MIX_OPACITY,
    WAVE_STYLED_TINT_OPACITY,
} from '@nowline/layout';
import { BUILTIN_ICON_SVG, CAPACITY_ICON_SVG } from './icons.js';
import { IdGenerator } from './ids.js';
import { sanitizeSvg } from './sanitize.js';
import { allShadowDefs, shadowFilterUrl } from './shadow.js';
import { attrs, escAttr, escText, num, tag, textTag } from './xml.js';

// Browser-safe types. The renderer never touches `fs`, `path`, or `Buffer`.
// Callers inject an AssetResolver when they want logos embedded.
export interface AssetBytes {
    bytes: Uint8Array;
    mime: string;
}

export type AssetResolver = (ref: string) => Promise<AssetBytes>;

/**
 * Per-role `font-family` strings the renderer stamps onto `<text>` elements.
 * Defaults to the shared, portable `FONT_STACK` (generic CSS stacks). Raster
 * and preview callers override this with a *pinned* family (e.g. the bundled
 * `DejaVu Sans` / `DejaVu Sans Mono`) so the rendered SVG names exactly the
 * font that resvg / the webview `@font-face` actually provide — the WYSIWYG
 * contract. The `.svg` file export keeps the default portable stack.
 */
export type FontFamilies = Record<'sans' | 'serif' | 'mono', string>;

export interface RenderOptions {
    assetResolver?: AssetResolver;
    noLinks?: boolean;
    strict?: boolean;
    warn?: (message: string) => void;
    // Override the deterministic id prefix (defaults to 'nl').
    idPrefix?: string;
    /**
     * Override per-role `font-family` strings. Defaults to the portable
     * `FONT_STACK`. Set to a pinned family for raster/preview WYSIWYG.
     */
    fontFamilies?: FontFamilies;
}

// `TEXT_SIZE_PX`, `CORNER_RADIUS_PX`, `FONT_STACK` come from
// `@nowline/layout` (themes/shared) so a typography or radius change
// flows from one place to both layout and renderer.
//
// `WEIGHT_NUM` lives here only because no DSL `weight` table exists in
// shared yet. If/when it does, hoist this alongside `FONT_STACK`.
const WEIGHT_NUM: Record<string, number> = {
    thin: 100,
    light: 300,
    normal: 400,
    bold: 700,
};

// `style.textSize` is `SizeBucket` which includes `'full'`; the shared
// `TEXT_SIZE_PX` table only carries the size buckets (no `'full'` —
// that's a corner-radius-only value). Widen the lookup so a stray
// `'full'` falls through to the `?? 14` fallback instead of compiling.
function textSizePx(bucket: ResolvedStyle['textSize']): number {
    return (TEXT_SIZE_PX as Record<string, number>)[bucket] ?? 14;
}

function fontAttrs(
    style: ResolvedStyle,
    fonts: FontFamilies,
    overrideSize?: number,
): Record<string, string | number> {
    return {
        'font-family': fonts[style.font],
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
function pickStatusDotPalette(bg: string, palette: Theme): Theme['statusDot']['onLight'] {
    return relativeLuminance(bg) >= 0.24 ? palette.statusDot.onLight : palette.statusDot.onDark;
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
 *      dereferenced custom `symbol`): paint number + glyph in a single
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
    const precedingWidthPx = precedingText ? estimateCaptionWidthPx(precedingText, fontSize) : 0;
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
        return textTag({ x: num(numberX), y: num(baselineY), ...baseAttrs }, numberStr);
    }

    if (icon.kind === 'builtin' && icon.name === 'multiplier') {
        return textTag({ x: num(numberX), y: num(baselineY), ...baseAttrs }, `${numberStr}\u00D7`);
    }

    if (icon.kind === 'builtin') {
        const def = CAPACITY_ICON_SVG[icon.name];
        // Render `<text>5</text>` followed by the curated SVG icon. The
        // icon sits at one font-em wide and tall, with a 0.1em separator
        // gap. Vertical positioning lifts the icon so its visual center
        // sits on the text x-height (`baselineY - fontSize * 0.85`); this
        // matches how Lucide-style outline icons read in inline text.
        const numberSvg = textTag({ x: num(numberX), y: num(baselineY), ...baseAttrs }, numberStr);
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
        `<text x="${num(numberX)}" y="${num(baselineY)}" font-family="${escAttr(fontFamily)}"` +
        ` font-size="${fontSize}" fill="${escAttr(color)}">` +
        `${escText(numberStr)}<tspan dx="${dx}">${escText(icon.text)}</tspan>` +
        '</text>'
    );
}

/**
 * Em-distance the renderer reserves between an item's metaText and its
 * capacity suffix (or any inline trailing token). Half a space's worth
 * — wide enough to read as a separator, narrow enough not to look like
 * a stray gap. SVG `<tspan dx>` honors this exactly so we don't depend
 * on per-character estimation for the gap itself.
 */
const META_SUFFIX_DX_EM = 0.6;

/**
 * Tighter em-per-char width estimate used inside `renderItemMetaLine`
 * for positioning a built-in SVG icon after a metaText + number. Layout
 * still uses 0.58 em/char to pessimistically reserve bar width for
 * spill detection (so `metaText 5×` always fits its row); the renderer
 * paints the icon at a tighter offset so there's no visible
 * dead-space between the rendered number and its glyph. Lands inside
 * the layout reservation either way (`0.5 < 0.58`).
 */
const META_ICON_EM_PER_CHAR = 0.5;

/**
 * Paint the item meta line (metaText plus optional capacity suffix) as
 * a single SVG fragment. Call sites used to emit metaText and the
 * suffix as two unrelated `<text>` nodes whose horizontal offsets came
 * from `estimateCaptionWidthPx` — fine for short metas like `2w`, but
 * the per-character estimate over-reserves for longer captions like
 * `L 1w — 1w remaining`, leaving a visible gap before `2×`.
 *
 * The fix flows the suffix INSIDE the same `<text>` element via
 * `<tspan dx>` whenever the suffix is pure inline text (multiplier,
 * literal glyph, or no glyph). Browsers compute the dx anchor relative
 * to the previously rendered glyph so the gap matches the spec
 * regardless of how wide metaText actually rendered.
 *
 * Built-in SVG icons (person/people/points/time) still need an `<svg>`
 * sibling outside `<text>`, so the icon's x is computed via the
 * tighter `META_ICON_EM_PER_CHAR` constant — which still lands inside
 * the layout's pessimistic spill reservation.
 */
function renderItemMetaLine(opts: {
    metaText: string | undefined;
    capacity: PositionedCapacity | null;
    x: number;
    baselineY: number;
    fontSize: number;
    fontFamily: string;
    color: string;
}): string {
    const { metaText, capacity, x, baselineY, fontSize, fontFamily, color } = opts;
    if (!metaText && !capacity) return '';
    const baseAttrs = {
        'font-family': fontFamily,
        'font-size': fontSize,
        fill: color,
    } as const;
    if (!capacity) {
        return textTag({ x: num(x), y: num(baselineY), ...baseAttrs }, metaText!);
    }
    if (!metaText) {
        return renderCapacitySuffix(capacity, undefined, x, baselineY, fontSize, fontFamily, color);
    }
    const sepDx = num(fontSize * META_SUFFIX_DX_EM);
    const openText =
        `<text x="${num(x)}" y="${num(baselineY)}" font-family="${escAttr(fontFamily)}"` +
        ` font-size="${fontSize}" fill="${escAttr(color)}">`;
    const { text: numberStr, icon } = capacity;
    if (!icon) {
        return (
            openText +
            escText(metaText) +
            `<tspan dx="${sepDx}">${escText(numberStr)}</tspan>` +
            '</text>'
        );
    }
    if (icon.kind === 'builtin' && icon.name === 'multiplier') {
        return (
            openText +
            escText(metaText) +
            `<tspan dx="${sepDx}">${escText(numberStr)}\u00D7</tspan>` +
            '</text>'
        );
    }
    if (icon.kind === 'literal') {
        const glyphDx = num(fontSize * 0.1);
        return (
            openText +
            escText(metaText) +
            `<tspan dx="${sepDx}">${escText(numberStr)}</tspan>` +
            `<tspan dx="${glyphDx}">${escText(icon.text)}</tspan>` +
            '</text>'
        );
    }
    // Built-in SVG icon — text element holds metaText + tspan-separated
    // number, then the icon SVG sits at an estimated position. Tighter
    // per-character estimate than layout's spill detector so the icon
    // visually hugs the number.
    const def = CAPACITY_ICON_SVG[icon.name];
    const tightWidth = (s: string) => s.length * fontSize * META_ICON_EM_PER_CHAR;
    const numberStartX = x + tightWidth(metaText) + fontSize * META_SUFFIX_DX_EM;
    const iconGapPx = fontSize * 0.1;
    const iconSize = fontSize;
    const iconX = numberStartX + tightWidth(numberStr) + iconGapPx;
    const iconY = baselineY - fontSize * 0.85;
    const textPart =
        openText +
        escText(metaText) +
        `<tspan dx="${sepDx}">${escText(numberStr)}</tspan>` +
        '</text>';
    const iconPart = `<svg x="${num(iconX)}" y="${num(iconY)}" width="${num(iconSize)}" height="${num(iconSize)}" viewBox="${def.viewBox}" style="color:${escAttr(color)}" aria-hidden="true">${def.body}</svg>`;
    return textPart + iconPart;
}

/**
 * Paint one inline-date pin (`after:DATE` / `before:DATE`) as a small
 * `calendar` glyph from the curated icon library. Wrapped in a `<g>`
 * carrying `<title>YYYY-MM-DD</title>` so browsers surface the date as
 * a native hover tooltip; non-interactive exports (PDF / PNG) still
 * carry the date in the title text. Z-order: above the bar fill,
 * alongside status dot and footnote indicators, below dependency
 * arrowheads.
 *
 * Shared by item, group, and parallel render paths so the visual is
 * identical across every entity type.
 */
function renderInlineDatePin(pin: InlineDatePin, color: string): string {
    const def = BUILTIN_ICON_SVG.calendar;
    const inner =
        `<svg x="${num(pin.glyphTopLeft.x)}" y="${num(pin.glyphTopLeft.y)}"` +
        ` width="${num(pin.glyphSize)}" height="${num(pin.glyphSize)}"` +
        ` viewBox="${def.viewBox}" style="color:${escAttr(color)}" aria-hidden="true">${def.body}</svg>`;
    const titleEl = `<title>${escText(pin.isoDate)}</title>`;
    return tag(
        'g',
        {
            'data-layer': 'inline-date-pin',
            'data-side': pin.side,
            'data-date': pin.isoDate,
            'data-spilled': pin.spilled ? 'true' : null,
        },
        titleEl + inner,
    );
}

function renderInlineDatePins(pins: InlineDatePin[] | undefined, color: string): string {
    if (!pins || pins.length === 0) return '';
    return pins.map((pin) => renderInlineDatePin(pin, color)).join('');
}

function hasPins(pins: InlineDatePin[] | undefined): boolean {
    return (pins?.length ?? 0) > 0;
}

function hasAfterPin(pins: InlineDatePin[] | undefined): boolean {
    return pins?.some((pin) => pin.side === 'after') ?? false;
}

function rectFrame(
    x: number,
    y: number,
    w: number,
    h: number,
    style: ResolvedStyle,
    extra: Record<string, string | number | undefined | null | boolean> = {},
): string {
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

function renderHeader(
    h: PositionedHeader,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
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
        titleParts.push(
            textTag(
                {
                    x: num(cardX + HEADER_CARD_PADDING_X),
                    y: num(cardY + HEADER_CARD_PADDING_TOP + i * HEADER_TITLE_LINE_HEIGHT_PX),
                    'font-family': fonts[h.style.font],
                    'font-size': HEADER_TITLE_FONT_SIZE_PX,
                    'font-weight': 600,
                    fill: h.style.text,
                },
                line,
            ),
        );
    });
    const titleText = titleParts.join('');
    const lastTitleY =
        cardY +
        HEADER_CARD_PADDING_TOP +
        Math.max(0, h.titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT_PX;
    const authorColor = palette.header.author;
    const authorParts: string[] = [];
    h.authorLines.forEach((line, j) => {
        authorParts.push(
            textTag(
                {
                    x: num(cardX + HEADER_CARD_PADDING_X),
                    y: num(
                        lastTitleY +
                            HEADER_TITLE_TO_AUTHOR_GAP_PX +
                            j * HEADER_AUTHOR_LINE_HEIGHT_PX,
                    ),
                    'font-family': fonts[h.style.font],
                    'font-size': HEADER_AUTHOR_FONT_SIZE_PX,
                    fill: authorColor,
                },
                line,
            ),
        );
    });
    const authorText = authorParts.join('');
    return tag(
        'g',
        { 'data-layer': 'header', 'data-id': `${idPrefix}-header` },
        card + titleText + authorText,
    );
}

// Renders the chart-body vertical grid lines (major dotted at every
// labeled tick, plus optional faint minor lines at every tick when
// `minorGrid` is set). Emitted as its own layer drawn AFTER the
// swimlane backgrounds so the lines actually span the chart body
// instead of being occluded — without this layer the lines would only
// be visible inside the timeline header strip. Grid lines stay BEHIND
// items, edges, anchor/milestone cuts, and the now-line so item bars
// sit cleanly on top of the ruled-paper backdrop.
function renderGridLines(t: PositionedTimelineScale, swimlaneTopY: number, palette: Theme): string {
    const gridColor = palette.timeline.gridLine;
    const minorGridColor = palette.timeline.minorGridLine;
    // Major lines thread through the FULL timeline strip — they start
    // at the top of the top date-label panel (when present) and run
    // all the way through the bottom date-label panel (when one is
    // mirrored at the chart bottom via `timeline-position:both` or
    // `timeline-position:bottom`). This ties date labels at both ends
    // to their column boundaries.
    //
    // Minor lines stay quieter: they start at the TOP OF THE TOPMOST
    // SWIMLANE (i.e. below the top date panel AND below the marker
    // row, so they don't streak through anchor/milestone diamonds in
    // the header) and stop ABOVE the bottom date panel.
    //
    // Anchor diamonds, milestone markers, and date label text are
    // rendered later in the orchestrator so they sit on top of any
    // crossing line.
    const bottomTickPanelHeight = t.bottomTickPanelHeight ?? 0;
    const hasBottomTickPanel = t.bottomTickPanelY !== undefined && bottomTickPanelHeight > 0;
    const majorTopY = t.tickPanelY;
    const majorBottomY = hasBottomTickPanel
        ? t.bottomTickPanelY! + bottomTickPanelHeight
        : t.box.y + t.box.height;
    // Use the topmost swimlane's top edge directly — `markerRow.height`
    // alone misses the small gap (`timelineHeightBudget` slack) between
    // the marker row and the swimlane area, which would leave the minor
    // lines short and floating in dead space above the swimlane.
    const minorTopY = swimlaneTopY;
    const minorBottomY = t.box.y + t.box.height;
    const parts: string[] = [];
    for (const tick of t.ticks) {
        if (tick.major) {
            // Solid major line at every labeled tick — the dominant
            // column boundary, drawn in the stronger gridLine color.
            parts.push(
                tag('line', {
                    x1: num(tick.x),
                    y1: num(majorTopY),
                    x2: num(tick.x),
                    y2: num(majorBottomY),
                    stroke: gridColor,
                    'stroke-width': 1,
                }),
            );
        } else if (t.minorGrid) {
            // Solid faint minor line at every non-major tick boundary.
            // Hierarchy is established by color (lighter than the major)
            // rather than by texture. Skip the very last tick since it
            // has no following column — a line at the chart's right edge
            // just doubles up the chart border.
            if (tick.labelX === undefined) continue;
            parts.push(
                tag('line', {
                    x1: num(tick.x),
                    y1: num(minorTopY),
                    x2: num(tick.x),
                    y2: num(minorBottomY),
                    stroke: minorGridColor,
                    'stroke-width': 1,
                }),
            );
        }
    }
    return tag('g', { 'data-layer': 'grid' }, parts.join(''));
}

function renderTimeline(t: PositionedTimelineScale, palette: Theme, fonts: FontFamilies): string {
    const panelFill = palette.timeline.panelFill;
    const borderColor = palette.timeline.border;
    const labelColor = palette.timeline.labelText;
    const parts: string[] = [];
    // Header layout from top: now-pill row → tick-label panel → (wave
    // strip) → marker row.
    // The pill row owns its space (no panel rect); the now-line crosses it
    // visually. Marker row is omitted entirely when empty. The top tick
    // panel is also omitted when the roadmap requested
    // `timeline-position:bottom` (height 0). The optional bottom tick
    // panel mirrors the top panel directly above the footnote area.
    const tickPanelY = t.tickPanelY;
    const tickPanelHeight = t.tickPanelHeight;
    const hasTopTickPanel = tickPanelHeight > 0;
    const hasMarkerRow = t.markerRow.height > 0;
    // The wave strip, when there is one, sits between the tick panel and
    // the marker rows (specs/waves.md §8.8); its panel is the wave-strip
    // layer's.
    const markerRowY = t.waveStrip
        ? t.waveStrip.y + t.waveStrip.height
        : tickPanelY + tickPanelHeight;
    const markerRowHeight = t.markerRow.height;
    const bottomTickPanelY = t.bottomTickPanelY;
    const bottomTickPanelHeight = t.bottomTickPanelHeight ?? 0;
    const hasBottomTickPanel = bottomTickPanelY !== undefined && bottomTickPanelHeight > 0;

    if (hasTopTickPanel) {
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
    }
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
    if (hasBottomTickPanel) {
        parts.push(
            tag('rect', {
                x: num(t.box.x),
                y: num(bottomTickPanelY!),
                width: num(t.box.width),
                height: num(bottomTickPanelHeight),
                rx: 4,
                ry: 4,
                fill: panelFill,
                stroke: borderColor,
                'stroke-width': 1,
            }),
        );
    }
    // Header-only labels — the chart-body grid lines themselves are
    // emitted by `renderGridLines` after the swimlane backgrounds so
    // they actually span the chart body rather than being occluded.
    for (const tick of t.ticks) {
        if (!tick.major) continue;
        if (!tick.label || tick.labelX === undefined) continue;
        // Label sits at the COLUMN CENTER (tick.labelX), not at the
        // tick boundary. The last tick has no following column → no
        // label.
        if (hasTopTickPanel) {
            parts.push(
                textTag(
                    {
                        x: num(tick.labelX),
                        y: num(tickPanelY + TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX),
                        'font-family': fonts.sans,
                        'font-size': TIMELINE_TICK_LABEL_FONT_SIZE_PX,
                        fill: labelColor,
                        'text-anchor': 'middle',
                    },
                    tick.label,
                ),
            );
        }
        if (hasBottomTickPanel) {
            parts.push(
                textTag(
                    {
                        x: num(tick.labelX),
                        y: num(bottomTickPanelY! + TIMELINE_TICK_LABEL_BASELINE_OFFSET_PX),
                        'font-family': fonts.sans,
                        'font-size': TIMELINE_TICK_LABEL_FONT_SIZE_PX,
                        fill: labelColor,
                        'text-anchor': 'middle',
                    },
                    tick.label,
                ),
            );
        }
    }
    return tag('g', { 'data-layer': 'timeline' }, parts.join(''));
}

function renderNowline(n: PositionedNowline | null, palette: Theme, fonts: FontFamilies): string {
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
    const label = renderNowPillLabel(n, labelTextColor, fonts);
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
    // Pill width comes from the layout (`n.pillWidth`) — locale-aware,
    // floored at `NOW_PILL_WIDTH_PX` so en-US output stays byte-stable
    // and longer locale strings (e.g. fr `'maint.'`) grow the pill
    // instead of clipping. See `buildNowline` in `@nowline/layout`.
    const width = n.pillWidth;
    if (n.pillMode === 'center') {
        return tag('rect', {
            x: num(n.x - width / 2),
            y: num(top),
            width: num(width),
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
        const right = edgeX + width;
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
    const left = edgeX - width;
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

function renderNowPillLabel(
    n: PositionedNowline,
    labelTextColor: string,
    fonts: FontFamilies,
): string {
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
            'font-family': fonts.sans,
            'font-size': NOW_PILL_LABEL_FONT_SIZE_PX,
            'font-weight': 700,
            fill: labelTextColor,
            'text-anchor': textAnchor,
        },
        n.label,
    );
}

function renderItem(
    i: PositionedItem,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    // Background work's hover tooltip (specs/waves.md §9.3).
    if (i.waveTooltip !== undefined) parts.push(`<title>${escText(i.waveTooltip)}</title>`);
    const shadow = shadowFilterUrl(idPrefix, i.style.shadow);
    parts.push(
        rectFrame(i.box.x, i.box.y, i.box.width, i.box.height, i.style, {
            filter: shadow ?? null,
        }),
    );
    // Background work's hatch overlay: a second rect right after the bar
    // rect (which stays the item group's first <rect>), under the progress
    // strip, the status dot and the text.
    if (i.waveRole === 'background') parts.push(hatchOverlay(i.box, i.style, idPrefix));
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
    const dotCx =
        i.dotSpills && i.dotSpillCx !== null
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
    // Inline-date pins (after:DATE / before:DATE). Same z-order family as
    // the status dot and footnote indicators — small badge in the top
    // decoration row. Color matches the bar's resolved meta (`fg`) so the
    // glyph reads against the bar fill the same way the meta text does.
    parts.push(renderInlineDatePins(i.inlineDatePins, i.style.fg));
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
            captionX += ITEM_LINK_ICON_TILE_SIZE_PX + ITEM_DECORATION_SPILL_GAP_PX;
        }
    } else {
        // Same inset layout used to size the wrap: 12px, 24px past a
        // link-icon tile (spanning `box.x + 6 .. box.x + 20`), and past an
        // in-bar `after:` glyph too (22px, or 40px beside the link tile).
        // `linkIcon` is the string 'none' (truthy) for an item without a
        // `link:`, and `noLinks` omits the tile entirely, so only indent
        // for the tile when it is really drawn. An icon that spilled out
        // of the bar forces the caption to spill too, so that case never
        // reaches here.
        const hasLink = !!i.linkIcon && i.linkIcon !== 'none';
        const afterPin = i.inlineDatePins?.find((p) => p.side === 'after' && !p.spilled);
        // Layout placed an `after:` glyph beside the link tile whether or
        // not `noLinks` hides it, so the glyph's clearance keys off the
        // `link:` itself rather than off the tile being drawn.
        const insetX = afterPin
            ? itemCaptionInsetX(hasLink, { barWidth: i.box.width })
            : itemCaptionInsetX(!options.noLinks && hasLink && !i.iconSpills);
        captionX = i.box.x + insetX;
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
    // A title that auto-wrapped inside the bar, or that carries explicit
    // `\n` breaks (in-bar or spilled), arrives pre-split in `titleLines`;
    // paint one `<text>` per line at the same baselines either way, the
    // same pattern as the header card, with the meta line below the last
    // one. Everything else (a single-line title) is just `[title]`. A blank
    // line between two explicit breaks keeps its baseline slot but paints
    // nothing.
    const titleLines = i.titleLines ?? (i.title ? [i.title] : []);
    titleLines.forEach((line, n) => {
        if (line === '') return;
        parts.push(
            textTag(
                {
                    x: num(captionX),
                    y: num(
                        i.box.y +
                            ITEM_CAPTION_TITLE_BASELINE_OFFSET_PX +
                            n * ITEM_CAPTION_TITLE_LINE_HEIGHT_PX,
                    ),
                    'font-family': fonts[i.style.font],
                    'font-size': ITEM_CAPTION_TITLE_FONT_SIZE_PX,
                    'font-weight': 600,
                    fill: titleColor,
                },
                line,
            ),
        );
    });
    // Meta line and capacity suffix render as a unified SVG fragment.
    // For pure-text suffixes (multiplier, literal glyph, no glyph) the
    // unified path emits a single `<text>` element with `<tspan dx>`
    // for the gap so the suffix hugs the metaText regardless of how
    // wide it actually rendered. Built-in SVG icon glyphs still emit a
    // sibling `<svg>` but at a tighter offset than the legacy two-text
    // path. See `renderItemMetaLine` for the full case-by-case.
    if (i.metaText || i.capacity) {
        parts.push(
            renderItemMetaLine({
                metaText: i.metaText,
                capacity: i.capacity,
                x: captionX,
                baselineY: i.box.y + itemCaptionMetaBaselineOffset(titleLines.length),
                fontSize: ITEM_CAPTION_META_FONT_SIZE_PX,
                fontFamily: fonts[i.style.font],
                color: metaColor,
            }),
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
                            'font-family': fonts.sans,
                            'font-size': ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX,
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
                            'font-family': fonts.sans,
                            'font-size': ITEM_FOOTNOTE_INDICATOR_FONT_SIZE_PX,
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
        const tileX =
            i.iconSpills && i.iconSpillX !== null
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
                        'font-family': fonts.sans,
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
                    ...fontAttrs(chip.style, fonts, TEXT_SIZE_PX.xs),
                    'text-anchor': 'middle',
                },
                chip.text,
            ),
        );
    }
    return tag('g', { 'data-layer': 'item', 'data-id': i.id ?? null }, parts.join(''));
}

function renderGroup(
    g: PositionedGroup,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    const hasFill = groupHasFill(g.style.bg);
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
            // Layout sizes the inline-date glyph clearance off the same
            // helper, so an `after:` glyph always lands past this edge.
            const tabW = groupTitleTabWidth(g.title);
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
                        'font-family': fonts[g.style.font],
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
        // Same helper `GroupNode.place` reserves the band with.
        const headerBand = groupHeaderBandPx(hasFill, Boolean(g.title), hasPins(g.inlineDatePins));
        // A `group wave:x` that only assigns membership draws no bracket:
        // it would sit exactly on the wave boundary (specs/waves.md §9.7).
        if (g.style.bracket !== 'none' && !g.waveOnly) {
            // Bracket-style groups paint a left-side `[` glyph along
            // `box.x`. When the group has a title or inline-date glyphs
            // the layout has reserved a header band ABOVE `box.y` (see
            // GroupNode.place); the bracket extends up through that band
            // and adds a top foot mirroring the bottom foot so the `[`
            // visually wraps the title and glyphs that sit in it. Bare
            // bracket groups keep the historical asymmetric shape
            // (vertical bar + a single bottom foot) since there's
            // nothing above to wrap.
            const stub = 4;
            const bottom = g.box.y + g.box.height;
            const dash = g.style.bracket === 'dashed' ? '3 2' : null;
            const bracketPath =
                headerBand > 0
                    ? `M${num(g.box.x + stub)} ${num(g.box.y - headerBand)}` +
                      ` L${num(g.box.x)} ${num(g.box.y - headerBand)}` +
                      ` L${num(g.box.x)} ${num(bottom)}` +
                      ` L${num(g.box.x + stub)} ${num(bottom)}`
                    : `M${num(g.box.x)} ${num(g.box.y)}` +
                      ` L${num(g.box.x)} ${num(bottom)}` +
                      ` L${num(g.box.x + stub)} ${num(bottom)}`;
            parts.push(
                tag('path', {
                    d: bracketPath,
                    fill: 'none',
                    stroke: bracketColor,
                    'stroke-width': 1,
                    'stroke-dasharray': dash,
                }),
            );
        }
        if (g.title) {
            parts.push(
                textTag(
                    {
                        // Past the `after:` glyph when there is one; layout
                        // clamps the `before:` glyph past this text.
                        x: num(
                            containerHeaderTitleX(
                                g.box.x,
                                GROUP_HEADER_TITLE_INSET_X_PX,
                                hasAfterPin(g.inlineDatePins),
                            ),
                        ),
                        y: num(g.box.y - CONTAINER_HEADER_TITLE_BASELINE_OFFSET_PX),
                        ...fontAttrs(g.style, fonts, CONTAINER_HEADER_TITLE_FONT_SIZE_PX),
                        'fill-opacity': 0.7,
                    },
                    g.title,
                ),
            );
        }
    }
    // Inline-date pins on the group itself (`group ... after:DATE` /
    // `before:DATE`). They sit in the chiclet row or the header band,
    // never on a child bar, so painting them before the children is safe.
    parts.push(renderInlineDatePins(g.inlineDatePins, g.style.fg));
    for (const c of g.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette, fonts));
    }
    void palette;
    return tag('g', { 'data-layer': 'group', 'data-id': g.id ?? null }, parts.join(''));
}

function renderParallel(
    p: PositionedParallel,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
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
                    x: num(
                        containerHeaderTitleX(
                            p.box.x,
                            PARALLEL_HEADER_TITLE_INSET_X_PX,
                            hasAfterPin(p.inlineDatePins),
                        ),
                    ),
                    y: num(p.box.y - CONTAINER_HEADER_TITLE_BASELINE_OFFSET_PX),
                    ...fontAttrs(p.style, fonts, CONTAINER_HEADER_TITLE_FONT_SIZE_PX),
                    'fill-opacity': 0.7,
                },
                p.title,
            ),
        );
    }
    // Inline-date pins on the parallel itself (`parallel ... after:DATE` /
    // `before:DATE`). They sit in the header band the layout reserves
    // above the first track, so painting them before children is safe.
    parts.push(renderInlineDatePins(p.inlineDatePins, p.style.fg));
    for (const c of p.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette, fonts));
    }
    return tag('g', { 'data-layer': 'parallel', 'data-id': p.id ?? null }, parts.join(''));
}

function renderTrackChild(
    c: PositionedTrackChild,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    if (c.kind === 'item') return renderItem(c, options, idPrefix, palette, fonts);
    if (c.kind === 'group') return renderGroup(c, options, idPrefix, palette, fonts);
    return renderParallel(c, options, idPrefix, palette, fonts);
}

// Renders only the swimlane's background tint rect. Emitted before the
// chart-body grid lines so those lines visibly span the full chart width.
// The frame tab (chiclet at top-left) and item content are emitted later,
// in renderSwimlaneContent, so they appear on top of the grid.
// Tri-state lane utilization underline. Painted along the bottom edge of
// the band when the lane has `capacity:` AND at least one item contributing
// load AND has not opted out of every color band via `utilization-*-at:none`.
// Geometry per specs/rendering.md § Lane utilization underline:
//   - height: 2px (matches the milestone-line stroke weight)
//   - y: flush with the bottom edge of the band, fully inside it
//   - x: aligned to the segment boundaries the layout already pre-coalesced
// One <rect> per coalesced segment; classification → palette token mapping
// is the only renderer-side decision.
const LANE_UTILIZATION_HEIGHT_PX = 2;

function utilizationColor(classification: 'green' | 'yellow' | 'red', palette: Theme): string {
    switch (classification) {
        case 'green':
            return palette.swimlane.utilizationOk;
        case 'yellow':
            return palette.swimlane.utilizationWarn;
        case 'red':
            return palette.swimlane.utilizationOver;
    }
}

function renderLaneUtilization(s: PositionedSwimlane, palette: Theme): string {
    if (!s.utilization || s.utilization.segments.length === 0) return '';
    const y = s.box.y + s.box.height - LANE_UTILIZATION_HEIGHT_PX;
    const rects = s.utilization.segments.map((seg) => {
        const width = seg.endX - seg.startX;
        if (width <= 0) return '';
        return tag('rect', {
            x: num(seg.startX),
            y: num(y),
            width: num(width),
            height: LANE_UTILIZATION_HEIGHT_PX,
            fill: utilizationColor(seg.classification, palette),
            'data-utilization': seg.classification,
            'data-load': num(seg.load),
        });
    });
    return tag(
        'g',
        {
            'data-layer': 'lane-utilization',
            'data-id': s.id ?? null,
        },
        rects.join(''),
    );
}

function renderSwimlaneBg(s: PositionedSwimlane, palette: Theme): string {
    const tint = s.bandIndex % 2 === 0 ? palette.swimlane.rowTintEven : palette.swimlane.rowTintOdd;
    const borderColor = palette.swimlane.border;
    return tag(
        'g',
        { 'data-layer': 'swimlane-bg', 'data-id': s.id ?? null },
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
}

function renderSwimlane(
    s: PositionedSwimlane,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const tabFill = palette.swimlane.tabFill;
    const tabStroke = palette.swimlane.tabStroke;
    const tabText = palette.swimlane.tabText;
    const ownerText = palette.swimlane.ownerText;
    const footnoteColor = palette.swimlane.footnoteIndicator;
    const parts: string[] = [];
    // Frame-tab chiclet at the top-left of the band — auto-sized to fit
    // title + owner. Geometry comes from the shared `frameTabGeometry`
    // helper that the layout's row-packer also calls, so the chiclet's
    // visible footprint matches the collision box layout reserved for it.
    if (s.title) {
        // Lane capacity badge + footnote indicator sit inside the frame
        // tab after the owner (or after the title if no owner). Compute
        // both widths up-front so `frameTabGeometry` can size the chiclet
        // to fit them, then read the placement positions back out — no
        // second placement pass in the renderer.
        const LANE_BADGE_FONT_SIZE_PX = 10;
        const capacityBadgeBareWidthPx = s.capacity
            ? estimateCapacitySuffixWidth(s.capacity.text, s.capacity.icon, LANE_BADGE_FONT_SIZE_PX)
            : 0;
        // Footnote indicator is a comma-joined number list painted at
        // 10 pt 700-weight; estimate via the shared caption helper.
        const footnoteIndicatorText =
            s.footnoteIndicators.length > 0 ? s.footnoteIndicators.join(',') : '';
        const footnoteIndicatorWidthPx = footnoteIndicatorText
            ? estimateCaptionWidthPx(footnoteIndicatorText, LANE_BADGE_FONT_SIZE_PX)
            : 0;
        const tab = frameTabGeometry(
            s.box.x,
            s.title,
            s.owner,
            capacityBadgeBareWidthPx,
            footnoteIndicatorWidthPx,
        );
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
                    'font-family': fonts[s.style.font],
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
                        'font-family': fonts[s.style.font],
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
                    fonts[s.style.font],
                    ownerText,
                ),
            );
        }
        if (footnoteIndicatorText) {
            parts.push(
                textTag(
                    {
                        x: num(tab.footnoteRightX),
                        y: num(tabY + 14),
                        'font-family': fonts.sans,
                        'font-size': LANE_BADGE_FONT_SIZE_PX,
                        'font-weight': 700,
                        fill: footnoteColor,
                        'text-anchor': 'end',
                    },
                    footnoteIndicatorText,
                ),
            );
        }
    }
    for (const c of s.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette, fonts));
    }
    // m13: tri-state utilization underline along the band's bottom edge.
    // Painted after items so it overlays any item that happens to extend
    // to the band's bottom; under cut-lines / now-line which run as
    // separate top-level passes.
    parts.push(renderLaneUtilization(s, palette));
    return tag('g', { 'data-layer': 'swimlane', 'data-id': s.id ?? null }, parts.join(''));
}

function renderAnchor(a: PositionedAnchor, palette: Theme, fonts: FontFamilies): string {
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
    const labelX = a.labelSide === 'left' ? a.labelBox.x + a.labelBox.width : a.labelBox.x;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(labelX),
        y: num(cy + 4),
        'font-family': fonts.sans,
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

function renderMilestone(m: PositionedMilestone, palette: Theme, fonts: FontFamilies): string {
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
    const labelX = m.labelSide === 'left' ? m.labelBox.x + m.labelBox.width : m.labelBox.x;
    const labelAttrs: Record<string, string | number | null | undefined> = {
        x: num(labelX),
        y: num(cy + 4),
        'font-family': fonts.sans,
        'font-size': 10,
        'font-weight': 600,
        fill: labelColor,
    };
    if (m.labelSide === 'left') labelAttrs['text-anchor'] = 'end';
    const label = m.title ? textTag(labelAttrs, m.title) : '';
    return tag('g', { 'data-layer': 'milestone', 'data-id': m.id ?? null }, flag + label);
}

function renderMilestoneCutLine(m: PositionedMilestone, idPrefix: string, palette: Theme): string {
    const stroke = m.isOverrun
        ? palette.milestoneDiamond.cutLineOverrun
        : palette.milestoneDiamond.cutLineNormal;
    const parts: string[] = [];
    // A milestone on a wave boundary draws no cut line: the boundary
    // already marks that instant (specs/waves.md §9.2).
    if (!m.onWaveBoundary) {
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
    }
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
                    'marker-end': `url(#${idPrefix}-arrow-dark)`,
                }),
            );
        }
    }
    return parts.join('');
}

function renderEdge(e: PositionedDependencyEdge, idPrefix: string, palette: Theme): string {
    const color =
        e.kind === 'overflow' ? palette.dependency.overflowStroke : palette.dependency.edgeStroke;
    const points = e.waypoints;
    if (points.length < 2) return '';
    // Under-bar edges paint BEFORE item fills (see `renderRoadmap`)
    // and use a thinner stroke so the bar stays foreground. Normal /
    // overflow edges sit on top of items and use the standard 1.1 px
    // stroke.
    const strokeWidth = e.kind === 'underBar' ? 0.8 : 1.1;
    return tag('path', {
        d: roundedOrthogonalPath(points, EDGE_CORNER_RADIUS),
        fill: 'none',
        stroke: color,
        'stroke-width': strokeWidth,
        'stroke-dasharray': e.kind === 'overflow' ? '4 2' : null,
        'stroke-linejoin': 'round',
        'marker-end': `url(#${idPrefix}-arrow)`,
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

function renderFootnotes(
    f: PositionedFootnoteArea,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
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
                'font-family': fonts.sans,
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
                {
                    x: num(numberX),
                    y: num(y),
                    'font-family': fonts.sans,
                    'font-size': 10,
                    'font-weight': 700,
                    fill: numberColor,
                },
                String(e.number),
            ),
        );
        parts.push(
            textTag(
                {
                    x: num(titleX),
                    y: num(y),
                    'font-family': fonts.sans,
                    'font-size': 11,
                    'font-weight': 600,
                    fill: titleColor,
                },
                e.title,
            ),
        );
        if (e.description) {
            parts.push(
                textTag(
                    {
                        x: num(titleX + Math.max(120, e.title.length * 6)),
                        y: num(y),
                        'font-family': fonts.sans,
                        'font-size': 11,
                        fill: descColor,
                    },
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
    fonts: FontFamilies,
    model?: PositionedRoadmap,
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

    // Chrome geometry — single source of truth shared with the layout
    // (`buildIncludeRegions` calls the same helper to size the dashed
    // bracket so the chrome always fits inside it). All placement Xs
    // come from the helper directly so the renderer stays declarative.
    const tabHeight = FRAME_TAB_HEIGHT_PX;
    const chrome = includeChromeGeometry(r.box.x, r.label, r.sourcePath);
    const tabY = ry - tabHeight / 2;
    const tab = tag('rect', {
        x: num(chrome.tabX),
        y: num(tabY),
        width: num(chrome.tabWidth),
        height: tabHeight,
        rx: 4,
        ry: 4,
        fill: tabFill,
        stroke: tabStroke,
        'stroke-width': 1,
    });
    const tabLabel = textTag(
        {
            x: num(chrome.tabLabelX),
            y: num(tabY + FRAME_TAB_LABEL_BASELINE_OFFSET_PX),
            'font-family': fonts.sans,
            'font-size': 11,
            'font-weight': 600,
            fill: tabText,
        },
        r.label,
    );

    // Content badge to the right of the tab. The glyph here is the
    // stacked-sheets icon, distinct from the item-level link-icon
    // outbound-arrow: an `include` is a content pull (one document
    // brings in another), conceptually different from a `link:` that
    // navigates somewhere.
    const badgeX = chrome.badgeX;
    const badgeSize = chrome.badgeSize;
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
        d:
            `M${num(badgeX + 7)} ${num(badgeY + 4)} H${num(badgeX + 14)} V${num(badgeY + 11)}` +
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
    const sourceTextY = ry + 4;
    const sourceHalo = tag('rect', {
        x: num(chrome.sourceHaloX),
        y: num(sourceTextY - sourceFontSize),
        width: num(chrome.sourceHaloWidth),
        height: sourceFontSize + 6,
        fill,
    });
    const sourceText = textTag(
        {
            x: num(chrome.sourceTextX),
            y: num(sourceTextY),
            'font-family': fonts.mono,
            'font-size': sourceFontSize,
            fill: badgeText,
        },
        r.sourcePath,
    );

    // The opaque region fill hides the global wave layers, so a roadmap
    // with waves re-emits its styled tints and boundaries over it, clipped
    // to the painted region rect by rect intersection (no clipPath, no new
    // defs), and the region's own crossings over its nested lanes
    // (specs/waves.md §9.8). The strip stays global.
    const clip: BoundingBox = { x: rx, y: ry, width: rw, height: rh };
    const waveUnder = model?.waves
        ? renderWaveTints(model.waves, clip) + renderWaveBoundaries(model.waveBoundaries, clip)
        : '';
    const waveOver = model?.waves ? renderWaveCrossings(r.waveCrossings) : '';

    // Nested swimlanes (laid out by buildIncludeRegions against the parent's timeline).
    const nested = r.nestedSwimlanes
        .map((s) => renderSwimlane(s, options, idPrefix, palette, fonts))
        .join('');

    return tag(
        'g',
        { 'data-layer': 'include' },
        region +
            waveUnder +
            nested +
            waveOver +
            tab +
            tabLabel +
            badge +
            glyph +
            sourceHalo +
            sourceText,
    );
}

// Paint the "Powered by nowline" attribution mark inside the
// layout-supplied `attributionBox`. The whole mark — prefix text,
// "now", red "l" bar, and "ine" — sits inside one <a href> so the
// entire string is clickable. Glyph anatomy (positions, widths, scale)
// lives in `themes/shared.ts` (`ATTRIBUTION_*`); the layout reserves a
// box of exactly that size at canvas-bottom-right.
function renderAttributionMark(model: PositionedRoadmap, fonts: FontFamilies): string {
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
                'font-family': fonts.sans,
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
                'font-family': fonts.sans,
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
                'font-family': fonts.sans,
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
        {
            href: ATTRIBUTION_LINK,
            target: '_blank',
            rel: 'noopener',
            'aria-label': 'Powered by nowline',
        },
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
    if (
        mime === 'image/png' ||
        mime === 'image/jpeg' ||
        mime === 'image/jpg' ||
        mime === 'image/webp'
    ) {
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
    const g = globalThis as {
        Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } };
    };
    if (g.Buffer) return g.Buffer.from(bytes).toString('base64');
    throw new Error('renderer: no base64 encoder available');
}

// --- Waves (specs/waves.md §9) ---------------------------------------------
//
// Every wave layer is emitted only when it has content, so a roadmap without
// waves renders byte-identically: no `wave-*` layers and no hatch `<defs>`.

/**
 * Bar-fill luminance at or above which background work gets the dark hatch
 * (`wave.hatch`); below it, the light one (`wave.hatchOnDark`). The same
 * crossover the status dot picks its palette by (`pickStatusDotPalette`), so
 * the hatch and the dot agree on which bars read as dark.
 */
const WAVE_HATCH_LIGHT_FILL_MIN_LUMINANCE = 0.24;

/** Horizontal padding of a strip label's halo on each side. */
const WAVE_LABEL_HALO_PAD_PX = 2;

/** Vertical inset of a strip label's halo from the strip's top and bottom. */
const WAVE_LABEL_HALO_INSET_Y_PX = 3;

/** Strip label baseline below the strip's vertical centre (10 px text). */
const WAVE_LABEL_BASELINE_BELOW_CENTER_PX = 4;

/** Footnote superscripts in the strip: size and baseline below the strip top. */
const WAVE_SUPERSCRIPT_FONT_SIZE_PX = 8;
const WAVE_SUPERSCRIPT_BASELINE_OFFSET_PX = 10;

type WaveHatchKind = 'dark' | 'light';

/** The painted fill of a bar, as `rectFrame` paints it. */
function barFill(style: ResolvedStyle): string {
    return style.bg === 'none' ? 'transparent' : style.bg;
}

function waveHatchKind(fill: string): WaveHatchKind {
    return relativeLuminance(fill) >= WAVE_HATCH_LIGHT_FILL_MIN_LUMINANCE ? 'dark' : 'light';
}

function waveHatchUrl(idPrefix: string, kind: WaveHatchKind): string {
    return `url(#${idPrefix}-wave-hatch-${kind})`;
}

/**
 * A hatch `<pattern>`: a `WAVE_HATCH_TILE_PX` tile rotated 45°, one
 * `WAVE_HATCH_STROKE_PX` stroke down its middle (so the tile never clips
 * it) at `WAVE_HATCH_OPACITY`. The id carries the SVG's prefix, like the
 * shadow filters, so two SVGs on one page never share it.
 *
 * The line carries `opacity`, not `stroke-opacity`. Browsers and resvg draw
 * the two the same (one stroke, nothing overlaps), but svg-to-pdfkit turns
 * `stroke-opacity` into a stroke-only `CA` inside the pattern cell, which
 * poppler ignores, so the PDF hatch drew opaque. With `opacity` it sets the
 * fill alpha `ca` as well, which poppler and cairo both honour.
 */
function waveHatchPatternDef(idPrefix: string, kind: WaveHatchKind, palette: Theme): string {
    const tile = WAVE_HATCH_TILE_PX;
    return tag(
        'pattern',
        {
            id: `${idPrefix}-wave-hatch-${kind}`,
            width: tile,
            height: tile,
            patternUnits: 'userSpaceOnUse',
            patternTransform: 'rotate(45)',
        },
        tag('line', {
            x1: num(tile / 2),
            y1: 0,
            x2: num(tile / 2),
            y2: tile,
            stroke: kind === 'dark' ? palette.wave.hatch : palette.wave.hatchOnDark,
            'stroke-width': WAVE_HATCH_STROKE_PX,
            opacity: WAVE_HATCH_OPACITY,
        }),
    );
}

/**
 * The hatch patterns the SVG uses, in a fixed order: one per kind that a
 * background bar (main lanes or isolated regions) or the legend's hatch
 * swatch needs. Empty without waves.
 */
function usedWaveHatchKinds(model: PositionedRoadmap): WaveHatchKind[] {
    if (!model.waves) return [];
    const used = new Set<WaveHatchKind>();
    const walk = (children: PositionedTrackChild[]): void => {
        for (const c of children) {
            if (c.kind === 'item') {
                if (c.waveRole === 'background') used.add(waveHatchKind(barFill(c.style)));
            } else {
                walk(c.children);
            }
        }
    };
    const walkLanes = (lanes: PositionedSwimlane[]): void => {
        for (const lane of lanes) {
            walk(lane.children);
            walkLanes(lane.nested);
        }
    };
    walkLanes(model.swimlanes);
    for (const r of model.includes) walkLanes(r.nestedSwimlanes);
    if (model.waveLegend?.entries.some((e) => e.kind === 'background')) {
        used.add(waveHatchKind(legendSwatchFill(model.palette)));
    }
    return (['dark', 'light'] as const).filter((k) => used.has(k));
}

/**
 * The hatch overlay over a background bar: the bar's rect inset by half its
 * 1 px stroke, with the same corner radius, so it never covers the stroke.
 */
function hatchOverlay(box: BoundingBox, style: ResolvedStyle, idPrefix: string): string {
    const inset = 0.5;
    const rx = Math.min(CORNER_RADIUS_PX[style.cornerRadius] ?? 4, box.height / 2);
    return tag('rect', {
        x: num(box.x + inset),
        y: num(box.y + inset),
        width: num(Math.max(0, box.width - 2 * inset)),
        height: num(Math.max(0, box.height - 2 * inset)),
        rx: num(rx),
        ry: num(rx),
        fill: waveHatchUrl(idPrefix, waveHatchKind(barFill(style))),
    });
}

/** `a ∩ b`, or undefined when they do not overlap. */
function intersectBox(a: BoundingBox, b: BoundingBox): BoundingBox | undefined {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    if (x2 <= x1 || y2 <= y1) return undefined;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** The strip's backing panel corner radius (matches the tick panel's). */
const WAVE_STRIP_PANEL_RADIUS_PX = 4;

/** How far a strip cell sits inside the backing panel: half its 1 px stroke. */
const WAVE_CELL_INSET_PX = 0.5;

/**
 * The strip cell's painted box: the wave's span clipped to the strip's
 * backing panel, inset by half the panel's 1 px stroke so the cell never
 * covers it. Undefined for an empty or off-screen wave.
 */
function waveCellBox(w: PositionedWave, t: PositionedTimelineScale): BoundingBox | undefined {
    if (w.empty) return undefined;
    const inset = WAVE_CELL_INSET_PX;
    return intersectBox(
        {
            x: w.strip.box.x,
            y: w.strip.box.y + inset,
            width: w.strip.box.width,
            height: w.strip.box.height - 2 * inset,
        },
        {
            x: t.box.x + inset,
            y: w.strip.box.y,
            width: t.box.width - 2 * inset,
            height: w.strip.box.height,
        },
    );
}

/**
 * Corner radii of a cell's left and right ends: a cell that reaches an end
 * of the backing panel rounds its outer corners there to the panel's radius
 * less the inset, so it never covers the panel's rounded corner or border.
 */
interface WaveCellCorners {
    left: number;
    right: number;
}

function waveCellCorners(cell: BoundingBox, t: PositionedTimelineScale): WaveCellCorners {
    const r = Math.min(
        WAVE_STRIP_PANEL_RADIUS_PX - WAVE_CELL_INSET_PX,
        cell.width / 2,
        cell.height / 2,
    );
    const eps = 1e-6;
    return {
        left: cell.x <= t.box.x + WAVE_CELL_INSET_PX + eps ? r : 0,
        right: cell.x + cell.width >= t.box.x + t.box.width - WAVE_CELL_INSET_PX - eps ? r : 0,
    };
}

/** A box as a path with the given left / right corner radii. */
function roundedEndsPath(box: BoundingBox, c: WaveCellCorners): string {
    const { x, y, width: w, height: h } = box;
    const arc = (r: number, ex: number, ey: number): string =>
        r > 0 ? ` A${num(r)} ${num(r)} 0 0 1 ${num(ex)} ${num(ey)}` : '';
    return (
        `M${num(x + c.left)} ${num(y)}` +
        ` H${num(x + w - c.right)}` +
        arc(c.right, x + w, y + c.right) +
        ` V${num(y + h - c.right)}` +
        arc(c.right, x + w - c.right, y + h) +
        ` H${num(x + c.left)}` +
        arc(c.left, x, y + h - c.left) +
        ` V${num(y + c.left)}` +
        arc(c.left, x + c.left, y) +
        ' Z'
    );
}

/**
 * A cell's fill: the strip fill, then the styled `bg` overlay when set.
 * Square rects, unless `corners` rounds an end that meets the panel's.
 */
function waveCellFill(w: PositionedWave, box: BoundingBox, corners?: WaveCellCorners): string {
    const shape = (fill: Record<string, string | number>): string =>
        corners && (corners.left > 0 || corners.right > 0)
            ? tag('path', { d: roundedEndsPath(box, corners), ...fill })
            : tag('rect', {
                  x: num(box.x),
                  y: num(box.y),
                  width: num(box.width),
                  height: num(box.height),
                  ...fill,
              });
    const base = shape({ fill: w.style.stripFill });
    if (!w.style.tint) return base;
    return (
        base +
        shape({
            fill: w.style.tint,
            'fill-opacity': WAVE_STYLED_STRIP_MIX_OPACITY,
        })
    );
}

/**
 * `wave-strip` (§9.1): the backing panel and one cell per non-empty wave,
 * each with its tooltip. Drawn right after the timeline panels, so the
 * major grid lines cross the cells as they cross the tick panel.
 */
function renderWaveStrip(model: PositionedRoadmap, palette: Theme): string {
    const t = model.timeline;
    const strip = t.waveStrip;
    if (!model.waves || !strip) return '';
    const parts: string[] = [
        tag('rect', {
            x: num(t.box.x),
            y: num(strip.y),
            width: num(t.box.width),
            height: num(strip.height),
            rx: WAVE_STRIP_PANEL_RADIUS_PX,
            ry: WAVE_STRIP_PANEL_RADIUS_PX,
            fill: palette.timeline.panelFill,
            stroke: palette.timeline.border,
            'stroke-width': 1,
        }),
    ];
    for (const w of model.waves) {
        const box = waveCellBox(w, t);
        if (!box) continue;
        parts.push(
            tag(
                'g',
                { 'data-id': w.id },
                `<title>${escText(w.strip.tooltip)}</title>${waveCellFill(w, box, waveCellCorners(box, t))}`,
            ),
        );
    }
    return tag('g', { 'data-layer': 'wave-strip' }, parts.join(''));
}

/**
 * `wave-bg` (§9.4): a column tint over each styled wave's `columnBox`,
 * clipped to `clip` when given (an include region's painted rect).
 */
function renderWaveTints(waves: PositionedWave[], clip?: BoundingBox): string {
    const parts: string[] = [];
    for (const w of waves) {
        if (!w.style.tint || w.empty) continue;
        const box = clip ? intersectBox(w.columnBox, clip) : w.columnBox;
        if (!box || box.width <= 0 || box.height <= 0) continue;
        parts.push(
            tag('rect', {
                x: num(box.x),
                y: num(box.y),
                width: num(box.width),
                height: num(box.height),
                fill: w.style.tint,
                'fill-opacity': WAVE_STYLED_TINT_OPACITY,
            }),
        );
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'wave-bg' }, parts.join(''));
}

/**
 * `wave-boundary` (§9.2): the 2 px boundary lines, from the strip top to the
 * last lane. With `clip`, only the lines strictly inside it, cut to its
 * vertical extent.
 */
function renderWaveBoundaries(
    boundaries: PositionedWaveBoundary[] | undefined,
    clip?: BoundingBox,
): string {
    const parts: string[] = [];
    for (const b of boundaries ?? []) {
        let topY = b.topY;
        let bottomY = b.bottomY;
        if (clip) {
            if (b.x <= clip.x || b.x >= clip.x + clip.width) continue;
            topY = Math.max(topY, clip.y);
            bottomY = Math.min(bottomY, clip.y + clip.height);
            if (bottomY <= topY) continue;
        }
        parts.push(
            tag('line', {
                x1: num(b.x),
                y1: num(topY),
                x2: num(b.x),
                y2: num(bottomY),
                stroke: b.stroke,
                'stroke-width': WAVE_BOUNDARY_WIDTH_PX,
                'stroke-dasharray': b.dash,
            }),
        );
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'wave-boundary' }, parts.join(''));
}

/** Estimated width of 10 px wave text, bold when `bold`. */
function waveTextWidth(text: string, bold: boolean): number {
    const w = estimateCaptionWidthPx(text, WAVE_STRIP_LABEL_FONT_SIZE_PX);
    return bold ? w * MARKER_BOLD_WIDTH_FACTOR : w;
}

/**
 * `wave-labels` (§9.1): strip labels on halos in their cell's fill,
 * right-aligned footnote superscripts, empty-wave diamonds, gap floor
 * labels, and the all-empty placeholder. Drawn after the boundaries.
 */
function renderWaveLabels(model: PositionedRoadmap, palette: Theme, fonts: FontFamilies): string {
    const t = model.timeline;
    const strip = t.waveStrip;
    if (!model.waves || !strip) return '';
    const baselineY = strip.y + strip.height / 2 + WAVE_LABEL_BASELINE_BELOW_CENTER_PX;
    const haloY = strip.y + WAVE_LABEL_HALO_INSET_Y_PX;
    const haloHeight = strip.height - 2 * WAVE_LABEL_HALO_INSET_Y_PX;
    const parts: string[] = [];
    // Muted italics on a halo in the backing panel's fill, so the major
    // grid lines drawn later never cut through the text (§9.1).
    const mutedText = (x: number, text: string): string => {
        const haloWidth = waveTextWidth(text, false) + 2 * WAVE_LABEL_HALO_PAD_PX;
        return (
            tag('rect', {
                x: num(x - haloWidth / 2),
                y: num(haloY),
                width: num(haloWidth),
                height: num(haloHeight),
                fill: palette.timeline.panelFill,
            }) +
            textTag(
                {
                    x: num(x),
                    y: num(baselineY),
                    'font-family': fonts.sans,
                    'font-size': WAVE_STRIP_LABEL_FONT_SIZE_PX,
                    'font-style': 'italic',
                    fill: palette.wave.labelMuted,
                    'text-anchor': 'middle',
                },
                text,
            )
        );
    };

    if (strip.placeholder !== undefined) {
        parts.push(mutedText(t.box.x + t.box.width / 2, strip.placeholder));
    }

    for (const w of model.waves) {
        // A gap opened by a start floor: no cell, the floor reference in
        // muted italics on a halo in the backing panel's fill.
        if (w.strip.gapLabel) {
            const { text, x } = w.strip.gapLabel;
            parts.push(mutedText(x, text));
        }

        // An empty wave: a hollow diamond, with the wave's tooltip.
        if (w.strip.marker) {
            const { x, y } = w.strip.marker;
            const r = WAVE_EMPTY_MARKER_SIZE_PX / 2;
            parts.push(
                tag(
                    'path',
                    {
                        d: `M${num(x)} ${num(y - r)} L${num(x + r)} ${num(y)} L${num(x)} ${num(y + r)} L${num(x - r)} ${num(y)} Z`,
                        fill: palette.timeline.panelFill,
                        stroke: palette.wave.boundary,
                        'stroke-width': 1.5,
                    },
                    `<title>${escText(w.strip.tooltip)}</title>`,
                ),
            );
        }

        const cell = waveCellBox(w, t);
        if (!cell) continue;
        const cellRight = cell.x + cell.width;
        const superscriptWidth = w.strip.footnotesShown
            ? w.footnoteIndicators.length * ITEM_FOOTNOTE_INDICATOR_STEP_PX
            : 0;
        if (superscriptWidth) {
            // The superscripts' own halo in the cell's fill, first so the
            // label's halo never covers them.
            const right = cellRight - WAVE_STRIP_LABEL_PAD_PX + WAVE_LABEL_HALO_PAD_PX;
            const left =
                cellRight - WAVE_STRIP_LABEL_PAD_PX - superscriptWidth - WAVE_LABEL_HALO_PAD_PX;
            parts.push(
                waveCellFill(w, { x: left, y: haloY, width: right - left, height: haloHeight }),
            );
        }
        if (w.strip.label !== undefined) {
            const textWidth = waveTextWidth(w.strip.label, true);
            // Centred on the visible span, but never under the superscripts.
            const x = superscriptWidth
                ? Math.min(
                      w.strip.labelX,
                      cellRight - WAVE_STRIP_LABEL_PAD_PX - superscriptWidth - textWidth / 2,
                  )
                : w.strip.labelX;
            const haloWidth = textWidth + 2 * WAVE_LABEL_HALO_PAD_PX;
            parts.push(
                waveCellFill(w, {
                    x: x - haloWidth / 2,
                    y: haloY,
                    width: haloWidth,
                    height: haloHeight,
                }),
            );
            parts.push(
                textTag(
                    {
                        x: num(x),
                        y: num(baselineY),
                        'font-family': fonts.sans,
                        'font-size': WAVE_STRIP_LABEL_FONT_SIZE_PX,
                        'font-weight': 600,
                        fill: w.style.text,
                        'text-anchor': 'middle',
                    },
                    w.strip.label,
                ),
            );
        }
        if (w.strip.footnotesShown) {
            // Right-aligned in the cell, walking left like an item's.
            let fx = cellRight - WAVE_STRIP_LABEL_PAD_PX;
            for (let k = w.footnoteIndicators.length - 1; k >= 0; k--) {
                parts.push(
                    textTag(
                        {
                            x: num(fx),
                            y: num(strip.y + WAVE_SUPERSCRIPT_BASELINE_OFFSET_PX),
                            'font-family': fonts.sans,
                            'font-size': WAVE_SUPERSCRIPT_FONT_SIZE_PX,
                            'font-weight': 700,
                            fill: w.style.text,
                            'text-anchor': 'end',
                        },
                        String(w.footnoteIndicators[k]),
                    ),
                );
                fx -= ITEM_FOOTNOTE_INDICATOR_STEP_PX;
            }
        }
    }
    if (parts.length === 0) return '';
    return tag('g', { 'data-layer': 'wave-labels' }, parts.join(''));
}

/**
 * `wave-cross` (§9.3): a 1 px dashed boundary over each background bar a
 * boundary runs through, showing the barrier does not hold that work.
 */
function renderWaveCrossings(crossings: PositionedWaveCrossing[] | undefined): string {
    if (!crossings || crossings.length === 0) return '';
    const parts = crossings.map((c) =>
        tag('line', {
            x1: num(c.x),
            y1: num(c.topY),
            x2: num(c.x),
            y2: num(c.bottomY),
            stroke: c.stroke,
            'stroke-width': 1,
            'stroke-dasharray': WAVE_CROSS_DASH,
        }),
    );
    return tag('g', { 'data-layer': 'wave-cross' }, parts.join(''));
}

/** The legend's hatch swatch fill: a default item bar. */
function legendSwatchFill(palette: Theme): string {
    const bg = palette.entities.item.bg;
    return bg === 'none' ? 'transparent' : bg;
}

/**
 * `wave-legend` (§9.5): a hatched bar swatch for background work, a short
 * boundary line, and the wave-name runs, all as the layout placed them.
 */
function renderWaveLegend(
    legend: PositionedWaveLegend | undefined,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    if (!legend) return '';
    const parts: string[] = [];
    for (const entry of legend.entries) {
        const s = entry.swatch;
        if (s && entry.kind === 'background') {
            const fill = legendSwatchFill(palette);
            const geometry = {
                x: num(s.x),
                y: num(s.y),
                width: num(s.width),
                height: num(s.height),
            };
            parts.push(
                tag('rect', {
                    ...geometry,
                    rx: 2,
                    ry: 2,
                    fill,
                    stroke: palette.entities.item.fg,
                    'stroke-width': 1,
                }),
            );
            parts.push(
                tag('rect', {
                    x: num(s.x + 0.5),
                    y: num(s.y + 0.5),
                    width: num(s.width - 1),
                    height: num(s.height - 1),
                    rx: 2,
                    ry: 2,
                    fill: waveHatchUrl(idPrefix, waveHatchKind(fill)),
                }),
            );
        } else if (s && entry.kind === 'boundary') {
            const x = s.x + s.width / 2;
            parts.push(
                tag('line', {
                    x1: num(x),
                    y1: num(s.y),
                    x2: num(x),
                    y2: num(s.y + s.height),
                    stroke: palette.wave.boundary,
                    'stroke-width': WAVE_BOUNDARY_WIDTH_PX,
                }),
            );
        }
        for (const run of entry.runs) {
            parts.push(
                textTag(
                    {
                        x: num(run.x),
                        y: num(run.y),
                        'font-family': fonts.sans,
                        'font-size': WAVE_STRIP_LABEL_FONT_SIZE_PX,
                        fill: palette.wave.labelText,
                    },
                    run.text,
                ),
            );
        }
    }
    return tag('g', { 'data-layer': 'wave-legend' }, parts.join(''));
}

export async function renderSvg(
    model: PositionedRoadmap,
    options: RenderOptions = {},
): Promise<string> {
    const ids = new IdGenerator(options.idPrefix ?? 'nl');
    const idPrefix = ids.next('root');

    const palette = model.palette;
    // Per-role family strings stamped onto every <text>. Defaults to the
    // portable FONT_STACK; raster/preview callers pass a pinned bundled
    // family so the SVG names exactly the font the consumer provides.
    const fonts: FontFamilies = options.fontFamilies ?? FONT_STACK;
    const parts: string[] = [];

    // <defs> — shadows + arrowhead markers (palette-driven fills baked in).
    // Marker ids carry the per-render prefix: several SVGs inlined in one
    // HTML page share an id namespace and `url(#id)` resolves to the first
    // match, so a global id would paint one diagram's arrowheads (and theme)
    // onto another.
    const arrowFillNeutral = palette.arrowhead.neutral;
    const arrowFillLight = palette.arrowhead.light;
    const arrowFillDark = palette.arrowhead.dark;
    const arrowDef = (id: string, fill: string): string =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`;
    const defs =
        `<defs>${allShadowDefs(idPrefix)}` +
        arrowDef(`${idPrefix}-arrow`, arrowFillNeutral) +
        arrowDef(`${idPrefix}-arrow-light`, arrowFillLight) +
        arrowDef(`${idPrefix}-arrow-dark`, arrowFillDark) +
        // Wave hatch patterns, only those a bar or the legend uses.
        usedWaveHatchKinds(model)
            .map((k) => waveHatchPatternDef(idPrefix, k, palette))
            .join('') +
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

    // Timeline header strip (panels + date labels). Chart-body grid
    // lines used to live here too, but they were occluded by the
    // swimlane background rects emitted later — so the major dotted
    // and minor grid lines never actually rendered in the chart body.
    // They now ship as their own layer below.
    parts.push(renderTimeline(model.timeline, palette, fonts));
    // Wave strip panel and cells, under the grid like the tick panel.
    parts.push(renderWaveStrip(model, palette));

    // Swimlane backgrounds — emitted as their own pass so the grid
    // lines can be drawn on top of them, then the swimlane content
    // (frame tab + items) sits on top of the grid.
    for (const s of model.swimlanes) parts.push(renderSwimlaneBg(s, palette));

    // Styled wave column tints, over the lane rows and under the grid.
    if (model.waves) parts.push(renderWaveTints(model.waves));

    // Chart-body grid lines (major dotted at every labeled tick, plus
    // optional faint minor lines when minor-grid is set). Drawn after
    // swimlane backgrounds so they actually span the chart body, but
    // before items and overlays so item bars sit cleanly on top.
    parts.push(renderGridLines(model.timeline, model.chartBox.y, palette));

    // Wave boundaries over the grid and the marker-row panel but under
    // the bars, then the strip labels, diamonds and gap labels on top of
    // them (specs/waves.md §9.9).
    parts.push(renderWaveBoundaries(model.waveBoundaries));
    parts.push(renderWaveLabels(model, palette, fonts));

    // m2g+: under-bar dependency edges go BEFORE swimlane / item
    // content. The channel router falls back to under-bar routing when
    // it can't find a clear vertical gutter between source and target;
    // these edges intentionally cross item bars and need the item fills
    // painted ON TOP so the bars stay the visual foreground. Renderer
    // applies a thinner stroke (see `renderEdge`) to further de-emphasise
    // the arrow body — only the head and stub at the target end stay
    // crisply visible.
    for (const e of model.edges) {
        if (e.kind === 'underBar') parts.push(renderEdge(e, idPrefix, palette));
    }

    // Swimlane content (frame tabs + items) on top of the grid lines.
    for (const s of model.swimlanes)
        parts.push(renderSwimlane(s, options, idPrefix, palette, fonts));

    // Include regions (drawn after own swimlanes so the dashed border + tab
    // overlay the chart, with their own nested swimlanes inside).
    for (const r of model.includes)
        parts.push(renderIncludeRegion(r, options, idPrefix, palette, fonts, model));

    // Wave crossings over the main lanes' background bars.
    parts.push(renderWaveCrossings(model.waveCrossings));

    // Normal / overflow dependency edges on top of items but below
    // cut-lines / nowline. Under-bar edges already painted above.
    for (const e of model.edges) {
        if (e.kind !== 'underBar') parts.push(renderEdge(e, idPrefix, palette));
    }

    // Anchor + milestone cut lines drawn AFTER items so they overlay the
    // swimlane fills.
    for (const a of model.anchors) parts.push(renderAnchorCutLine(a, palette));
    for (const m of model.milestones) parts.push(renderMilestoneCutLine(m, idPrefix, palette));

    // Marker-row diamonds + labels.
    for (const a of model.anchors) parts.push(renderAnchor(a, palette, fonts));
    for (const m of model.milestones) parts.push(renderMilestone(m, palette, fonts));

    // Now-line
    parts.push(renderNowline(model.nowline, palette, fonts));

    // Footnotes + header last (always on top)
    parts.push(renderFootnotes(model.footnotes, idPrefix, palette, fonts));
    parts.push(renderWaveLegend(model.waveLegend, idPrefix, palette, fonts));
    parts.push(renderHeader(model.header, idPrefix, palette, fonts));
    parts.push(renderAttributionMark(model, fonts));

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
