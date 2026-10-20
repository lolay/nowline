// The item layer: a work item's bar, hatch overlay, progress strip, status dot,
// inline date pins, caption (title and meta line, inside or spilled), footnote
// indicators, link icon, overflow tail and label chips, plus the capacity suffix
// and inline date pins that lanes and containers reuse.

import type { InlineDatePin, PositionedCapacity, PositionedItem, Theme } from '@nowline/layout';
import {
    CORNER_RADIUS_PX,
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
    itemCaptionInsetX,
    itemCaptionMetaBaselineOffset,
    META_SUFFIX_DX_EM,
    PROGRESS_STRIP_HEIGHT_PX,
    TEXT_SIZE_PX,
} from '@nowline/layout';
import { BUILTIN_ICON_SVG, CAPACITY_ICON_SVG } from './icons.js';
import { fontAttrs, rectFrame } from './primitives.js';
import type { FontFamilies, RenderOptions } from './render.js';
import { shadowFilterUrl } from './shadow.js';
import { hatchOverlay } from './waves.js';
import { escAttr, escText, num, tag, textTag } from './xml.js';

/**
 * A built-in capacity icon's x: the run start plus layout's
 * `iconDxTerms`, added one at a time in order so the double is the same
 * as summing the widths onto x in turn.
 */
function iconXFrom(x0: number, capacity: PositionedCapacity): number {
    let x = x0;
    for (const term of capacity.iconDxTerms ?? []) x += term;
    return x;
}

/**
 * Paint an item / lane capacity suffix starting at `(x0, baselineY)`. The
 * capacity model arrives pre-resolved from layout (`PositionedCapacity`):
 * `text` is the formatted number, `icon` is either `null` (no glyph), a
 * built-in name, or an inline literal string, and `iconDxTerms` places a
 * built-in SVG icon.
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
 *      icon at `x0` plus `iconDxTerms` (layout's `capacityIconDxTerms`:
 *      the number's estimated width and a `0.25em` gap, sized to one em). The
 *      icon's `style="color:..."` propagates through the
 *      `currentColor`-bound paths in the icon library.
 *   4. `icon.kind === 'literal'` (inline Unicode literal or
 *      dereferenced custom `symbol`): paint number + glyph in a single
 *      `<text>`, with a `<tspan dx="0.1em">` separator before the
 *      glyph payload.
 *
 * The number always starts the run at `x0`: an item with meta text paints
 * its suffix through `renderItemMetaLine` instead.
 */
export function renderCapacitySuffix(
    capacity: PositionedCapacity,
    x0: number,
    baselineY: number,
    fontSize: number,
    fontFamily: string,
    color: string,
): string {
    const numberX = x0;
    const { text: numberStr, icon } = capacity;
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
        // icon sits at one font-em wide and tall, where layout placed it
        // past the number. Vertical positioning lifts the icon so its
        // visual center sits on the text x-height
        // (`baselineY - fontSize * 0.85`); this matches how Lucide-style
        // outline icons read in inline text.
        const numberSvg = textTag({ x: num(numberX), y: num(baselineY), ...baseAttrs }, numberStr);
        const iconSize = fontSize;
        const iconX = iconXFrom(x0, capacity);
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
 * Paint the item meta line (metaText plus optional capacity suffix) as
 * a single SVG fragment. Call sites used to emit metaText and the
 * suffix as two unrelated `<text>` nodes whose horizontal offsets came
 * from `estimateTextWidth` — fine for short metas like `2w`, but
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
 * sibling outside `<text>`, so their number leaves the flow too: layout's
 * `capacity.iconDxTerms` (from `capacityIconDxTerms`) place both the number
 * and the icon, inside the suffix's spill reservation.
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
        return renderCapacitySuffix(capacity, x, baselineY, fontSize, fontFamily, color);
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
    // Built-in SVG icon: the number is NOT flowed after metaText, because
    // the icon's x can only come from layout's estimates; a number drawn
    // after the real metaText sits wherever the font put it, and the icon
    // landed on it. Paint metaText, then the number and the icon both where
    // layout's `iconDxTerms` place them, so they agree as on a lane badge.
    const terms = capacity.iconDxTerms ?? [];
    let numberX = x;
    for (const term of terms.slice(0, 2)) numberX += term;
    const def = CAPACITY_ICON_SVG[icon.name];
    const iconSize = fontSize;
    const iconX = iconXFrom(x, capacity);
    const iconY = baselineY - fontSize * 0.85;
    const textPart =
        openText +
        escText(metaText) +
        '</text>' +
        textTag({ x: num(numberX), y: num(baselineY), ...baseAttrs }, numberStr);
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

export function renderInlineDatePins(pins: InlineDatePin[] | undefined, color: string): string {
    if (!pins || pins.length === 0) return '';
    return pins.map((pin) => renderInlineDatePin(pin, color)).join('');
}

export function hasAfterPin(pins: InlineDatePin[] | undefined): boolean {
    return pins?.some((pin) => pin.side === 'after') ?? false;
}

/**
 * The bar's hover tooltip: the full title when the caption cap at the
 * chart's end truncated it (specs/rendering.md § "Caption cap at the
 * chart's end"), then background work's line (specs/waves.md §9.3).
 */
function renderItemTooltip(i: PositionedItem): string {
    const tooltipLines: string[] = [];
    if (i.titleTruncated) tooltipLines.push(i.title);
    if (i.waveTooltip !== undefined) tooltipLines.push(i.waveTooltip);
    if (tooltipLines.length > 0) return `<title>${escText(tooltipLines.join('\n'))}</title>`;
    return '';
}

/** The bar rect, plus background work's hatch overlay when the item is one. */
function renderItemBar(i: PositionedItem, idPrefix: string): string {
    const parts: string[] = [];
    const shadow = shadowFilterUrl(idPrefix, i.style.shadow);
    parts.push(
        rectFrame(i.box.x, i.box.y, i.box.width, i.box.height, i.style, {
            filter: shadow ?? null,
        }),
    );
    // Background work's hatch overlay: a second rect right after the bar
    // rect (which stays the item group's first <rect>), under the progress
    // strip, the status dot and the text.
    if (i.waveRole === 'background' && i.waveHatch) {
        parts.push(hatchOverlay(i.box, i.style, i.waveHatch, idPrefix));
    }
    return parts.join('');
}

/**
 * Bottom progress strip along the bottom edge. Height comes from
 * `PROGRESS_STRIP_HEIGHT_PX` so layout's chip placement and the
 * milestone slack-arrow attach Y stay in sync if it's ever bumped.
 */
function renderItemProgress(i: PositionedItem): string {
    if (i.progressFraction > 0) {
        const pw = Math.max(0, Math.min(i.box.width, i.box.width * i.progressFraction));
        return tag('rect', {
            x: num(i.box.x),
            y: num(i.box.y + i.box.height - PROGRESS_STRIP_HEIGHT_PX),
            width: num(pw),
            height: PROGRESS_STRIP_HEIGHT_PX,
            fill: i.style.fg,
            opacity: 0.55,
        });
    }
    return '';
}

function renderItemStatusDot(i: PositionedItem): string {
    // Status-dot color — layout resolves it from the bar bg's relative
    // luminance and the item's status (`statusDotColor`, layout's
    // `status-dot.ts`), so the dot reads on pale and dark bars alike.
    //
    // Status dot — upper-right inset inside the bar, OR pushed into
    // the spill column when the bar is too narrow to host the dot's
    // full inset (`dotSpills`). Layout pre-computes `dotSpillCx` for
    // the spilled case so the renderer stays geometry-dumb.
    const dotCx =
        i.dotSpills && i.dotSpillCx !== null
            ? i.dotSpillCx
            : i.box.x + i.box.width - ITEM_STATUS_DOT_INSET_RIGHT_PX;
    return tag('circle', {
        cx: num(dotCx),
        cy: num(i.box.y + ITEM_STATUS_DOT_INSET_TOP_PX),
        r: ITEM_STATUS_DOT_RADIUS_PX,
        fill: i.statusDotColor,
    });
}

/**
 * Where the title and meta lines start. Title + meta are an atomic caption.
 * When `textSpills` is set the layout has already bumped the next item to a
 * fresh row, so we draw both lines BESIDE the bar (just past its right edge,
 * stacked) at the same vertical positions they would occupy inside. When
 * they fit, both go inside at the bar's left padding.
 *
 * The spilled-decoration cluster reads `[bar] [icon?] [title]
 * [footnote?] [dot?]` — the only decoration to the LEFT of the
 * title is the link icon (the icon→title affordance must stay
 * adjacent). The dot trails the title to mirror its in-bar
 * upper-right position; the footnote walks alongside the title
 * (between title and dot) just like its in-bar `text-anchor: end`
 * placement at the upper-right.
 */
function itemCaptionX(i: PositionedItem, options: RenderOptions): number {
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
    return captionX;
}

/** The title lines and the meta line (with its capacity suffix). */
function renderItemCaption(
    i: PositionedItem,
    captionX: number,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];

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
    // wide it actually rendered. Built-in SVG icon glyphs emit their
    // number and a sibling `<svg>` where layout placed them. See
    // `renderItemMetaLine` for the full case-by-case.
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
    return parts.join('');
}

/** Footnote superscript indicators, in the bar or spilled beside it. */
function renderItemFootnoteIndicators(
    i: PositionedItem,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    const captionOutsideTextColor = palette.entities.item.text;

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
    return parts.join('');
}

function renderItemLinkIcon(i: PositionedItem, options: RenderOptions, palette: Theme): string {
    const parts: string[] = [];

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
    return parts.join('');
}

function renderItemOverflowTail(i: PositionedItem, palette: Theme, fonts: FontFamilies): string {
    const parts: string[] = [];

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
    return parts.join('');
}

function renderItemLabelChips(i: PositionedItem, fonts: FontFamilies): string {
    const parts: string[] = [];

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
    return parts.join('');
}

export function renderItem(
    i: PositionedItem,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    parts.push(renderItemTooltip(i));
    parts.push(renderItemBar(i, idPrefix));
    parts.push(renderItemProgress(i));
    parts.push(renderItemStatusDot(i));
    // Inline-date pins (after:DATE / before:DATE). Same z-order family as
    // the status dot and footnote indicators — small badge in the top
    // decoration row. Color matches the bar's resolved meta (`fg`) so the
    // glyph reads against the bar fill the same way the meta text does.
    parts.push(renderInlineDatePins(i.inlineDatePins, i.style.fg));
    parts.push(renderItemCaption(i, itemCaptionX(i, options), palette, fonts));
    parts.push(renderItemFootnoteIndicators(i, palette, fonts));
    parts.push(renderItemLinkIcon(i, options, palette));
    parts.push(renderItemOverflowTail(i, palette, fonts));
    parts.push(renderItemLabelChips(i, fonts));
    return tag('g', { 'data-layer': 'item', 'data-id': i.id ?? null }, parts.join(''));
}
