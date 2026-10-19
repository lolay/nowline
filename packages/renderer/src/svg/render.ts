import type {
    BoundingBox,
    InlineDatePin,
    PositionedCapacity,
    PositionedFootnoteArea,
    PositionedGroup,
    PositionedHeader,
    PositionedIncludeRegion,
    PositionedItem,
    PositionedLogo,
    PositionedParallel,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
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
    CONTAINER_BODY_FILL_OPACITY,
    CONTAINER_BRACKET_LINE_OFFSET_PX,
    CONTAINER_HEADER_TITLE_BASELINE_PX,
    CONTAINER_HEADER_TITLE_FONT_SIZE_PX,
    CONTAINER_MAX_FILLED_DEPTH,
    CONTAINER_NESTED_BODY_FILL_OPACITY,
    CORNER_RADIUS_PX,
    containerHeaderTitleX,
    estimateCapacitySuffixWidth,
    FONT_STACK,
    FOOTNOTE_HEADER_BASELINE_OFFSET_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    frameTabGeometry,
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
    PROGRESS_STRIP_HEIGHT_PX,
    TEXT_SIZE_PX,
} from '@nowline/layout';
import type { LoadedLogo } from '../logo.js';
import { renderEdge } from './edges.js';
import { BUILTIN_ICON_SVG, CAPACITY_ICON_SVG } from './icons.js';
import { IdGenerator } from './ids.js';
import {
    renderAnchor,
    renderAnchorCutLine,
    renderMilestone,
    renderMilestoneCutLine,
} from './markers.js';
import { renderNowline } from './nowline.js';
import {
    estimateCaptionWidthPx,
    fontAttrs,
    pickStatusDotPalette,
    rectFrame,
} from './primitives.js';
import { sanitizeSvg, svgIntrinsicSize } from './sanitize.js';
import { allShadowDefs, shadowFilterUrl } from './shadow.js';
import {
    renderGridLines,
    renderNonWorkingBands,
    renderNonWorkingLabels,
    renderTimeline,
} from './timeline.js';
import {
    hasOverrunArrow,
    hatchOverlay,
    renderWaveBoundaries,
    renderWaveCrossings,
    renderWaveLabels,
    renderWaveLegend,
    renderWaveStrip,
    renderWaveTints,
    usedWaveHatchKinds,
    waveHatchPatternDef,
} from './waves.js';
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
    /**
     * The logo `loadLogo` already read. Its bytes are embedded as they are,
     * so the asset is not resolved a second time. Omitted: `renderSvg`
     * resolves the logo through `assetResolver`.
     */
    logo?: LoadedLogo;
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

function hasAfterPin(pins: InlineDatePin[] | undefined): boolean {
    return pins?.some((pin) => pin.side === 'after') ?? false;
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
    // A logo in the card shifts the text right of it (and down, to center
    // it, when the logo made the card taller); see `h.textInset`.
    const textX = cardX + HEADER_CARD_PADDING_X + (h.textInset?.x ?? 0);
    const textTopY = cardY + (h.textInset?.y ?? 0);
    const titleParts: string[] = [];
    h.titleLines.forEach((line, i) => {
        titleParts.push(
            textTag(
                {
                    x: num(textX),
                    y: num(textTopY + HEADER_CARD_PADDING_TOP + i * HEADER_TITLE_LINE_HEIGHT_PX),
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
        textTopY +
        HEADER_CARD_PADDING_TOP +
        Math.max(0, h.titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT_PX;
    const authorColor = palette.header.author;
    const authorParts: string[] = [];
    h.authorLines.forEach((line, j) => {
        authorParts.push(
            textTag(
                {
                    x: num(textX),
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

function renderItem(
    i: PositionedItem,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    // The bar's hover tooltip: the full title when the caption cap at the
    // chart's end truncated it (specs/rendering.md § "Caption cap at the
    // chart's end"), then background work's line (specs/waves.md §9.3).
    const tooltipLines: string[] = [];
    if (i.titleTruncated) tooltipLines.push(i.title);
    if (i.waveTooltip !== undefined) tooltipLines.push(i.waveTooltip);
    if (tooltipLines.length > 0) parts.push(`<title>${escText(tooltipLines.join('\n'))}</title>`);
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

/**
 * A group or parallel, drawn above and around its content
 * (specs/true-width-layout.md §3.3): a body shaded with the container's `bg`
 * spanning exactly its dates, a header bracket over those dates (solid for
 * a group, dashed for a parallel by default; `bracket:` styles it), the
 * title at the container's start with any inline-date glyphs beside it,
 * then the children. A wave-only group draws only its children.
 *
 * `depth` is the container's nesting depth inside its lane, 1 for a
 * top-level container. A nested body takes a lighter tint, and bodies deeper
 * than `CONTAINER_MAX_FILLED_DEPTH` are outlined instead of filled, so tints
 * never compound three deep (§8 O4).
 */
function renderContainer(
    c: PositionedGroup | PositionedParallel,
    depth: number,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    const isDrawn = !(c.kind === 'group' && c.waveOnly);
    if (isDrawn) {
        const bodyY = c.box.y + c.headerHeight;
        const bodyHeight = c.box.height - c.headerHeight;
        if (c.style.bg !== 'none') {
            const isFilled = depth <= CONTAINER_MAX_FILLED_DEPTH;
            parts.push(
                tag('rect', {
                    x: num(c.box.x),
                    y: num(bodyY),
                    width: num(c.box.width),
                    height: num(bodyHeight),
                    fill: isFilled ? c.style.bg : 'none',
                    'fill-opacity': isFilled
                        ? depth === 1
                            ? CONTAINER_BODY_FILL_OPACITY
                            : CONTAINER_NESTED_BODY_FILL_OPACITY
                        : null,
                    stroke: isFilled ? null : c.style.bg,
                    'stroke-opacity': isFilled ? null : 0.6,
                    'stroke-width': isFilled ? null : 1,
                }),
            );
        }
        // The title and the bracket share one ink, the header's: a group's
        // `fg`, a parallel's bracket stroke. The title sits on the lane band,
        // never on the body, so a `text:` colour chosen to read on `bg`
        // (white on a filled chiclet, before the header) would vanish.
        const ink = c.kind === 'group' ? c.style.fg : palette.parallel.bracketStroke;
        if (c.headerHeight > 0 && c.style.bracket !== 'none') {
            const lineY = c.box.y + CONTAINER_BRACKET_LINE_OFFSET_PX;
            const x0 = c.box.x;
            const x1 = c.box.x + c.box.width;
            parts.push(
                tag('path', {
                    d: `M${num(x0)} ${num(bodyY)} V${num(lineY)} H${num(x1)} V${num(bodyY)}`,
                    fill: 'none',
                    stroke: ink,
                    'stroke-width': 1.2,
                    'stroke-dasharray': c.style.bracket === 'dashed' ? '3 2' : null,
                }),
            );
        }
        if (c.title && c.headerHeight > 0) {
            parts.push(
                textTag(
                    {
                        // Past the `after:` glyph when there is one; layout
                        // clamps the `before:` glyph past this text.
                        x: num(containerHeaderTitleX(c.box.x, hasAfterPin(c.inlineDatePins))),
                        y: num(c.box.y + CONTAINER_HEADER_TITLE_BASELINE_PX),
                        ...fontAttrs(c.style, fonts, CONTAINER_HEADER_TITLE_FONT_SIZE_PX),
                        'font-weight': 600,
                        fill: ink,
                    },
                    c.title,
                ),
            );
        }
        // The glyphs sit in the header's title row, never on a child, so
        // painting them before the children is safe.
        parts.push(renderInlineDatePins(c.inlineDatePins, c.style.fg));
    }
    for (const child of c.children) {
        parts.push(renderTrackChild(child, options, idPrefix, palette, fonts, depth));
    }
    return tag('g', { 'data-layer': c.kind, 'data-id': c.id ?? null }, parts.join(''));
}

function renderTrackChild(
    c: PositionedTrackChild,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
    parentDepth = 0,
): string {
    if (c.kind === 'item') return renderItem(c, options, idPrefix, palette, fonts);
    return renderContainer(c, parentDepth + 1, options, idPrefix, palette, fonts);
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
    // Layout places every row: the entry's number on its first row, the
    // title and description lines (wrapped ones included) at their own
    // baselines, and a region's heading row above its first entry.
    const numberX = f.box.x + FOOTNOTE_PANEL_PADDING_PX;
    for (const e of f.entries) {
        if (e.region !== undefined && e.regionHeadingY !== undefined) {
            parts.push(
                textTag(
                    {
                        x: num(numberX),
                        y: num(e.regionHeadingY),
                        'font-family': fonts.sans,
                        'font-size': 10,
                        'font-weight': 700,
                        fill: headerColor,
                    },
                    e.region,
                ),
            );
        }
        parts.push(
            textTag(
                {
                    x: num(numberX),
                    y: num(e.y),
                    'font-family': fonts.sans,
                    'font-size': 10,
                    'font-weight': 700,
                    fill: numberColor,
                },
                String(e.number),
            ),
        );
        for (const line of e.titleLines) {
            parts.push(
                textTag(
                    {
                        x: num(line.x),
                        y: num(line.y),
                        'font-family': fonts.sans,
                        'font-size': 11,
                        'font-weight': 600,
                        fill: titleColor,
                    },
                    line.text,
                ),
            );
        }
        for (const line of e.descriptionLines ?? []) {
            parts.push(
                textTag(
                    {
                        x: num(line.x),
                        y: num(line.y),
                        'font-family': fonts.sans,
                        'font-size': 11,
                        fill: descColor,
                    },
                    line.text,
                ),
            );
        }
    }
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
    // The same opaque fill hides the global non-working bands, so they are
    // re-emitted over it the same way, under the wave layers.
    const bandsUnder = model
        ? renderNonWorkingBands(model.timeline, model.chartBox.y, palette, clip)
        : '';
    const waveUnder = model?.waves
        ? renderWaveTints(model.waves, clip) + renderWaveBoundaries(model.waveBoundaries, clip)
        : '';
    const waveOver = model?.waves ? renderWaveCrossings(r.waveCrossings) : '';

    // Nested swimlanes (laid out by buildIncludeRegions against the parent's timeline).
    const nested = r.nestedSwimlanes
        .map((s) => renderSwimlane(s, options, idPrefix, palette, fonts))
        .join('');
    // The region's own dependency edges, behind its bars as on the host.
    const edges = (r.edges ?? []).map((e) => renderEdge(e, palette)).join('');
    // The region's own anchors and milestones: cut lines over its lanes,
    // then the diamonds and labels of its marker row, as on the host.
    const anchors = r.anchors ?? [];
    const milestones = r.milestones ?? [];
    const markers =
        anchors.map((a) => renderAnchorCutLine(a, palette)).join('') +
        milestones.map((m) => renderMilestoneCutLine(m, idPrefix, palette)).join('') +
        anchors.map((a) => renderAnchor(a, palette, fonts)).join('') +
        milestones.map((m) => renderMilestone(m, palette, fonts)).join('');

    return tag(
        'g',
        { 'data-layer': 'include' },
        region +
            bandsUnder +
            waveUnder +
            edges +
            nested +
            waveOver +
            markers +
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

// Draws the logo into its layout box. Layout sized the box to the asset's
// aspect ratio, so scaling the asset to the box fills it exactly whether
// the source is larger or smaller; `meet` (fit) only matters if the two
// disagree, and then it letterboxes rather than cropping or distorting.
async function embedLogo(
    logo: PositionedLogo,
    resolver: AssetResolver | undefined,
    idPrefix: string,
    options: RenderOptions,
): Promise<string> {
    const logoRef = logo.assetRef ?? '';
    const { x, y, width, height } = logo.box;
    let asset: AssetBytes;
    try {
        if (options.logo && options.logo.ref === logoRef) {
            asset = options.logo.asset;
        } else if (resolver) {
            asset = await resolver(logoRef);
        } else {
            return '';
        }
    } catch (err) {
        const msg = `logo file not found: ${logoRef} (${err instanceof Error ? err.message : String(err)})`;
        if (options.strict) throw err;
        options.warn?.(msg);
        return '';
    }
    const mime = (asset.mime ?? '').toLowerCase();
    if (mime === 'image/svg+xml') {
        const raw = new TextDecoder().decode(asset.bytes);
        const intrinsic = logo.intrinsic ?? svgIntrinsicSize(raw) ?? { width, height };
        // The root loses its own size so it fills this viewport; the
        // viewport's viewBox then scales the asset's units to the box.
        // One warning per logo listing what the sanitizer removed, not one
        // per attribute; editor metadata it removes silently.
        const removed = new Set<string>();
        const cleaned = sanitizeSvg(raw, {
            idPrefix: `${idPrefix}-logo`,
            onWarn: (msg) => removed.add(msg.replace(/^sanitizer: dropping /, '')),
            stripRootSize: true,
        });
        // A warning even under strict: callers promote warnings themselves
        // (the export kernel throws, the browser pipeline returns rows).
        if (removed.size > 0) {
            options.warn?.(
                `logo ${logoRef}: removed unsupported SVG content: ${[...removed].join(', ')}`,
            );
        }
        return tag(
            'svg',
            {
                'data-layer': 'logo',
                x: num(x),
                y: num(y),
                width: num(width),
                height: num(height),
                viewBox: `0 0 ${num(intrinsic.width)} ${num(intrinsic.height)}`,
                preserveAspectRatio: 'xMidYMid meet',
                overflow: 'hidden',
            },
            cleaned,
        );
    }
    if (
        mime === 'image/png' ||
        mime === 'image/jpeg' ||
        mime === 'image/jpg' ||
        mime === 'image/webp'
    ) {
        const b64 = bytesToBase64(asset.bytes);
        return tag('image', {
            'data-layer': 'logo',
            href: `data:${mime};base64,${b64}`,
            x: num(x),
            y: num(y),
            width: num(width),
            height: num(height),
            preserveAspectRatio: 'xMidYMid meet',
        });
    }
    const msg = `unsupported logo format: ${mime} (${logoRef})`;
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

    // <defs> — shadows + the milestone arrow markers (palette-driven fill
    // baked in). Dependency arrows draw their own heads (`renderEdge`), so
    // the milestone slack line's dark marker and the overrun arrow's red one
    // are the only ones. Their ids carry the per-render prefix: several SVGs
    // inlined in one HTML page share an id namespace and `url(#id)` resolves
    // to the first match, so a global id would paint one diagram's
    // arrowheads (and theme) onto another.
    const arrowDef = (id: string, fill: string): string =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`;
    const defs =
        `<defs>${allShadowDefs(idPrefix)}` +
        arrowDef(`${idPrefix}-arrow-dark`, palette.arrowhead.dark) +
        // The overrun arrow's red head, only when a milestone draws one.
        (hasOverrunArrow(model)
            ? arrowDef(`${idPrefix}-arrow-overrun`, palette.milestoneDiamond.cutLineOverrun)
            : '') +
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

    // Non-working bands under `show`, over the lane rows and under the
    // wave tints and the grid; nothing under `hide`.
    parts.push(renderNonWorkingBands(model.timeline, model.chartBox.y, palette));

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

    // Dependency arrows go BEFORE swimlane / item content: their legs
    // pass behind the bars they cross (specs/true-width-layout.md §3.4).
    // Each lands in a gap between rows, so its head stays in view.
    for (const e of model.edges) parts.push(renderEdge(e, palette));

    // Swimlane content (frame tabs + items) on top of the grid lines.
    for (const s of model.swimlanes)
        parts.push(renderSwimlane(s, options, idPrefix, palette, fonts));

    // Include regions (drawn after own swimlanes so the dashed border + tab
    // overlay the chart, with their own nested swimlanes inside).
    for (const r of model.includes)
        parts.push(renderIncludeRegion(r, options, idPrefix, palette, fonts, model));

    // Wave crossings over the main lanes' background bars.
    parts.push(renderWaveCrossings(model.waveCrossings));

    // Anchor + milestone cut lines drawn AFTER items so they overlay the
    // swimlane fills.
    for (const a of model.anchors) parts.push(renderAnchorCutLine(a, palette));
    for (const m of model.milestones) parts.push(renderMilestoneCutLine(m, idPrefix, palette));

    // Titled non-working runs: their marker-row labels, and under `hide`
    // the named cut lines, over the bars like the milestone cut lines.
    parts.push(renderNonWorkingLabels(model.timeline, palette, fonts));

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
    if (model.header.logo && (options.logo || options.assetResolver)) {
        const logoSvg = await embedLogo(
            model.header.logo,
            options.assetResolver,
            idPrefix,
            options,
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
