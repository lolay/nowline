// The header layers: the title card, the "Powered by nowline" attribution mark,
// and the embedded logo that sits in the card, plus the base64 helper the logo
// path uses.

import type { PositionedHeader, PositionedLogo, PositionedRoadmap, Theme } from '@nowline/layout';
import {
    ATTRIBUTION_BAR_LOGICAL_WIDTH,
    ATTRIBUTION_BAR_LOGICAL_X,
    ATTRIBUTION_INE_LOGICAL_X,
    ATTRIBUTION_LINK,
    ATTRIBUTION_NOW_LOGICAL_X,
    ATTRIBUTION_PREFIX_FONT_SIZE,
    ATTRIBUTION_SCALE,
    ATTRIBUTION_TEXT,
    ATTRIBUTION_WORDMARK_FONT_SIZE,
    HEADER_AUTHOR_FONT_SIZE_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_CARD_PADDING_TOP,
    HEADER_CARD_PADDING_X,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
} from '@nowline/layout';
import type { AssetBytes, AssetResolver, FontFamilies, RenderOptions } from './render.js';
import { sanitizeSvg, svgIntrinsicSize } from './sanitize.js';
import { num, tag, textTag } from './xml.js';

export function renderHeader(
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

// Paint the "Powered by nowline" attribution mark inside the
// layout-supplied `attributionBox`. The whole mark — prefix text,
// "now", red "l" bar, and "ine" — sits inside one <a href> so the
// entire string is clickable. Glyph anatomy (positions, widths, scale)
// lives in `themes/shared.ts` (`ATTRIBUTION_*`); the layout reserves a
// box of exactly that size at canvas-bottom-right.
export function renderAttributionMark(model: PositionedRoadmap, fonts: FontFamilies): string {
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
export async function embedLogo(
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
