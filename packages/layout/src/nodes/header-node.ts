// HeaderNode — the roadmap header (title, author, company logo) in both
// positions, `beside` (a card left of the chart) and `above` (a band over
// it). `measure` sizes it before anything else is laid out, because the
// header decides where the chart starts: its left edge in beside mode,
// its top in above mode, and how low the header rows must end so the
// beside card fits (specs/layout-phases.md §3.7).
//
// HeaderNode does not implement `Renderable`: that signature is built
// around a time scale and a row band, which a header has no use for.

import {
    HEADER_AUTHOR_FONT_SIZE_PX,
    HEADER_AUTHOR_LINE_HEIGHT_PX,
    HEADER_CARD_PADDING_BOTTOM,
    HEADER_CARD_PADDING_TOP,
    HEADER_CARD_PADDING_X,
    HEADER_LOGO_GAP_PX,
    HEADER_LOGO_PAD_Y_PX,
    HEADER_TITLE_FONT_SIZE_PX,
    HEADER_TITLE_LINE_HEIGHT_PX,
    HEADER_TITLE_TO_AUTHOR_GAP_PX,
} from '../header-card-geometry.js';
import type { LogoDimensions, ScaledLogo } from '../header-logo.js';
import { estimateTextWidth, wrapText } from '../text-measure.js';
import {
    HEADER_ABOVE_HEIGHT_PX,
    HEADER_BESIDE_MAX_WIDTH_PX,
    HEADER_BESIDE_MIN_WIDTH_PX,
} from '../themes/shared.js';
import type { BoundingBox, HeaderPosition, PositionedHeader, ResolvedStyle } from '../types.js';

// Left margin between the canvas's left edge and the visible card. The
// matching right-side breathing room is owned by `GUTTER_PX` (the canonical
// content gutter, applied between `chartLeftX` and `originX`), so the gap
// from the card's right edge to the timeline strip is the same as the gap
// between two adjacent items.
const HEADER_CARD_OUTER_PAD = 6;

/** Clearance (px) the beside card keeps from the canvas top. */
const HEADER_CARD_TOP_INSET = 4;

/** Gap (px) between the header (or the canvas top) and the chart. */
const CHART_TOP_GAP_PX = 8;

export interface MeasuredHeader {
    position: HeaderPosition;
    titleLines: string[];
    authorLines: string[];
    cardWidth: number;
    /** Card height, grown when the logo is taller than the text. */
    cardHeight: number;
    /** Card height the title / author text alone needs. */
    textCardHeight: number;
    /** Width the logo takes left of the text, gap included; 0 without a logo. */
    logoSlot: number;
    logo?: ScaledLogo;
    /** Beside: the card's box width, which is also `chartLeftX`. Above: 0. */
    chartLeftX: number;
    /** Above: the band height, bumped for an `xl` logo. Beside never reads it. */
    aboveHeight: number;
    /** Where the chart may start: below the canvas top, or below the above band. */
    chartTopY: number;
    /** Beside: the lowest the header rows may end so the card fits (card + 4 px inset). Above: 0. */
    minRowsBottomY: number;
}

/** The positioned header without its attribution box, which finalize adds last. */
export type PositionedHeaderParts = Omit<PositionedHeader, 'attributionBox'>;

/** Where the chart ended up, as far as the header needs to know. */
export interface HeaderFrame {
    /** Bottom of the header rows; the beside card's bottom hugs it. */
    rowsBottomY: number;
    /** Bottom of the chart; the beside header column runs down to it. */
    chartBottomY: number;
    /** The final canvas right edge; the above band spans to it. */
    canvasRightX: number;
}

export interface HeaderNodeInput {
    /** The roadmap's title (or name); an empty string when it has neither. */
    title: string;
    author?: string;
    /** The resolved `default roadmap` style; `headerPosition` picks the mode. */
    style: ResolvedStyle;
    /** The drawn logo size, when the file declares a logo and the caller loaded one. */
    logo?: ScaledLogo;
}

export class HeaderNode {
    constructor(private readonly input: HeaderNodeInput) {}

    measure(): MeasuredHeader {
        const { title, author, style, logo } = this.input;
        const isBeside = style.headerPosition === 'beside';
        // Pre-size the beside-mode header card. Width = max line width +
        // padding, clamped to MIN..MAX with word-wrap once the title
        // exceeds MAX. Above mode keeps the fixed-strip geometry (full
        // canvas width, fixed height) but still reads the wrapped lines.
        const sized = sizeBesideHeader(title, author, logo);
        // Above-mode strip: fixed height, bumped only when the logo plus
        // its clearance is taller (`logo-size:xl`).
        const aboveHeight = logo
            ? Math.max(HEADER_ABOVE_HEIGHT_PX, logo.height + 2 * HEADER_LOGO_PAD_Y_PX)
            : HEADER_ABOVE_HEIGHT_PX;
        return {
            position: style.headerPosition,
            titleLines: sized.titleLines,
            authorLines: sized.authorLines,
            cardWidth: sized.cardWidth,
            cardHeight: sized.cardHeight,
            textCardHeight: sized.textCardHeight,
            logoSlot: sized.logoSlot,
            ...(logo ? { logo } : {}),
            chartLeftX: isBeside ? sized.boxWidth : 0,
            aboveHeight,
            chartTopY: isBeside ? CHART_TOP_GAP_PX : aboveHeight + CHART_TOP_GAP_PX,
            // In beside mode the card's BOTTOM aligns with the bottom of the
            // header rows so it visually anchors to the chart's top. The
            // rows must end low enough for the card plus a 4 px top inset;
            // the measure phase pushes the timeline down when they would not.
            minRowsBottomY: isBeside ? sized.cardHeight + HEADER_CARD_TOP_INSET : 0,
        };
    }

    /**
     * The header box, the card, the logo box and the text inset, once the
     * chart's extent is known. Beside: a column `chartLeftX` wide down to
     * the chart bottom, with the card's bottom on `rowsBottomY`. Above: a
     * band `aboveHeight` tall across the canvas, the card filling it.
     */
    place(measured: MeasuredHeader, frame: HeaderFrame): PositionedHeaderParts {
        const { title, author, style } = this.input;
        const isBeside = measured.position === 'beside';
        const box: BoundingBox = isBeside
            ? { x: 0, y: 0, width: measured.chartLeftX, height: frame.chartBottomY }
            : { x: 0, y: 0, width: frame.canvasRightX, height: measured.aboveHeight };
        // The visible card inside the box. Beside, its BOTTOM hugs the
        // bottom of the header rows so the title block anchors to the
        // chart's top edge whichever header rows are present; the measure
        // phase already pushed the rows down far enough for the card to
        // keep HEADER_CARD_TOP_INSET from the canvas top.
        const cardBox: BoundingBox = isBeside
            ? {
                  x: HEADER_CARD_OUTER_PAD,
                  y: frame.rowsBottomY - measured.cardHeight,
                  width: measured.cardWidth,
                  height: measured.cardHeight,
              }
            : { x: 0, y: 0, width: frame.canvasRightX, height: measured.aboveHeight };
        // Logo at the card's left padding, vertically centered; the text
        // shifts right past it and centers in the (possibly taller) card.
        let logo: PositionedHeader['logo'];
        let textInset: PositionedHeader['textInset'];
        if (measured.logo) {
            logo = {
                box: {
                    x: box.x + cardBox.x + HEADER_CARD_PADDING_X,
                    y: box.y + cardBox.y + (cardBox.height - measured.logo.height) / 2,
                    width: measured.logo.width,
                    height: measured.logo.height,
                },
                assetRef: measured.logo.assetRef,
                intrinsic: measured.logo.intrinsic,
            };
            textInset = {
                x: measured.logoSlot,
                y: Math.max(0, (cardBox.height - measured.textCardHeight) / 2),
            };
        }
        return {
            box,
            position: style.headerPosition,
            title,
            author,
            titleLines: measured.titleLines,
            authorLines: measured.authorLines,
            cardBox,
            logo,
            ...(textInset ? { textInset } : {}),
            style,
        };
    }
}

/** Sized output from the beside-mode header word-wrap pass. */
interface SizedHeader {
    titleLines: string[];
    authorLines: string[];
    cardWidth: number;
    cardHeight: number;
    textCardHeight: number;
    logoSlot: number;
    boxWidth: number;
}

function sizeBesideHeader(
    title: string,
    author: string | undefined,
    logo?: LogoDimensions,
): SizedHeader {
    const maxContentWidth = HEADER_BESIDE_MAX_WIDTH_PX - 2 * HEADER_CARD_PADDING_X;
    const titleLines = wrapText(title, maxContentWidth, HEADER_TITLE_FONT_SIZE_PX);
    const authorLines = wrapText(author ?? '', maxContentWidth, HEADER_AUTHOR_FONT_SIZE_PX);

    let widest = 0;
    for (const line of titleLines)
        widest = Math.max(widest, estimateTextWidth(line, HEADER_TITLE_FONT_SIZE_PX));
    for (const line of authorLines)
        widest = Math.max(widest, estimateTextWidth(line, HEADER_AUTHOR_FONT_SIZE_PX));

    // A logo sits left of the text and widens the card past the text-only
    // MAX clamp (which bounds the text column, not the logo slot).
    const hasText = titleLines.length > 0 || authorLines.length > 0;
    const logoSlot = logo ? logo.width + (hasText ? HEADER_LOGO_GAP_PX : 0) : 0;

    const naturalCardWidth = widest + 2 * HEADER_CARD_PADDING_X;
    // `HEADER_BESIDE_{MIN,MAX}_WIDTH_PX` bound the **boxWidth** (= cardWidth
    // + left outer pad). Subtract one outer pad to derive the cardWidth
    // bounds.
    const cardWidth = Math.max(
        HEADER_BESIDE_MIN_WIDTH_PX - HEADER_CARD_OUTER_PAD,
        Math.min(HEADER_BESIDE_MAX_WIDTH_PX - HEADER_CARD_OUTER_PAD, naturalCardWidth) + logoSlot,
    );

    const titleBlockHeight =
        titleLines.length > 0 ? (titleLines.length - 1) * HEADER_TITLE_LINE_HEIGHT_PX : 0;
    const authorBlockHeight =
        authorLines.length > 0
            ? HEADER_TITLE_TO_AUTHOR_GAP_PX +
              (authorLines.length - 1) * HEADER_AUTHOR_LINE_HEIGHT_PX
            : 0;
    const textCardHeight =
        HEADER_CARD_PADDING_TOP + titleBlockHeight + authorBlockHeight + HEADER_CARD_PADDING_BOTTOM;
    // A logo taller than the text block grows the card; logo and text are
    // then both centered vertically.
    const cardHeight = logo
        ? Math.max(textCardHeight, logo.height + 2 * HEADER_LOGO_PAD_Y_PX)
        : textCardHeight;

    // `boxWidth` only includes the LEFT outer pad — the right-side breathing
    // room between the card and the chart is owned by `GUTTER_PX` in the
    // measure phase. So `boxWidth` doubles as `chartLeftX` (the card's right
    // edge in canvas coordinates).
    const boxWidth = cardWidth + HEADER_CARD_OUTER_PAD;
    return {
        titleLines,
        authorLines,
        cardWidth,
        cardHeight,
        textCardHeight,
        logoSlot,
        boxWidth,
    };
}
