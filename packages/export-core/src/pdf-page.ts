// PDF page-size parsing, preset table, and orientation/margin resolution.
//
// Spec: specs/handoffs/m2c.md § 4 "PDF — vector PDF via PDFKit"
//   - Default: US Letter (8.5 × 11 in) portrait.
//   - Presets: imperial (letter, legal, tabloid, ledger) + ISO 216 (a5–a1, b5–b3).
//   - Custom: WxHunit (mixed units rejected).
//   - "content": page = content dimensions, no scaling, no upper bound.

import type { PdfLength, PdfOrientation, PdfPageSize, PdfPresetName } from './types.js';
import { LengthParseError, lengthToPoints, parseLength } from './units.js';

interface PresetDimensions {
    widthPt: number;
    heightPt: number;
}

function fromMm(widthMm: number, heightMm: number): PresetDimensions {
    const factor = 72 / 25.4;
    return {
        widthPt: roundToMicropoint(widthMm * factor),
        heightPt: roundToMicropoint(heightMm * factor),
    };
}

function roundToMicropoint(n: number): number {
    return Math.round(n * 1000) / 1000;
}

const PRESETS: Readonly<Record<PdfPresetName, PresetDimensions>> = {
    letter: { widthPt: 612, heightPt: 792 },
    legal: { widthPt: 612, heightPt: 1008 },
    tabloid: { widthPt: 792, heightPt: 1224 },
    ledger: { widthPt: 1224, heightPt: 792 },
    a1: fromMm(594, 841),
    a2: fromMm(420, 594),
    a3: fromMm(297, 420),
    a4: fromMm(210, 297),
    a5: fromMm(148, 210),
    b3: fromMm(353, 500),
    b4: fromMm(250, 353),
    b5: fromMm(176, 250),
};

const PRESET_NAMES = Object.keys(PRESETS) as readonly PdfPresetName[];

export class PageSizeParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PageSizeParseError';
    }
}

export function isPdfPresetName(value: string): value is PdfPresetName {
    return (PRESET_NAMES as readonly string[]).includes(value.toLowerCase());
}

export function presetNames(): readonly PdfPresetName[] {
    return PRESET_NAMES;
}

export function presetDimensions(name: PdfPresetName): PresetDimensions {
    return PRESETS[name];
}

// Canonical form: `<W>x<H><unit>` — single trailing unit applies to both
// (e.g. `8.5x11in`).
// Explicit form: `<W><unit>x<H><unit>` — both dimensions tagged. Same unit
// required; mismatch is rejected as "mixed units".
const CUSTOM_RE = /^(\d+(?:\.\d+)?)([a-z]+)?x(\d+(?:\.\d+)?)([a-z]+)$/i;

/**
 * Parse a `--page-size` value: preset name, custom `WxHunit`, or `content`.
 * Case-insensitive.
 */
export function parsePageSize(input: string): PdfPageSize {
    const lower = input.trim().toLowerCase();
    if (!lower) throw new PageSizeParseError('empty page size');
    if (lower === 'content') return { kind: 'content' };
    if (isPdfPresetName(lower)) {
        return { kind: 'preset', name: lower as PdfPresetName };
    }

    const match = CUSTOM_RE.exec(lower);
    if (!match) {
        throw new PageSizeParseError(
            `invalid page size "${input}": expected preset (${PRESET_NAMES.join(', ')}), "content", or <W>x<H><unit> (e.g. 8.5x11in)`,
        );
    }
    const [, wRaw, wUnitMaybe, hRaw, hUnit] = match;
    if (wUnitMaybe !== undefined && wUnitMaybe !== hUnit) {
        throw new PageSizeParseError(
            `invalid page size "${input}": mixed units (${wUnitMaybe} vs ${hUnit}); use the same unit for width and height`,
        );
    }

    let width: PdfLength;
    let height: PdfLength;
    try {
        width = parseLength(`${wRaw}${hUnit}`);
        height = parseLength(`${hRaw}${hUnit}`);
    } catch (err) {
        if (err instanceof LengthParseError) {
            throw new PageSizeParseError(`invalid page size "${input}": ${err.message}`);
        }
        throw err;
    }
    return { kind: 'custom', width, height };
}

export interface ResolvedPage {
    widthPt: number;
    heightPt: number;
    orientation: 'portrait' | 'landscape';
    isContentSized: boolean;
}

/**
 * Resolve the final page rectangle (in points) from page size, orientation,
 * and content dimensions.
 *
 * Rules per § 4 "Orientation" / "Scaling":
 *  - `--page-size content` → page = content + 2 × margin; orientation derived from
 *    the resulting aspect; `orientation` argument is ignored.
 *  - Fixed page (preset or custom):
 *      `auto` → portrait if content taller-than-wide, landscape otherwise.
 *      `portrait` / `landscape` → swap the preset W/H if the preset is in the
 *      opposite orientation.
 */
export function resolvePage(args: {
    pageSize: PdfPageSize;
    orientation: PdfOrientation;
    contentWidthPt: number;
    contentHeightPt: number;
    marginPt: number;
}): ResolvedPage {
    const { pageSize, orientation, contentWidthPt, contentHeightPt, marginPt } = args;

    if (pageSize.kind === 'content') {
        const widthPt = contentWidthPt + 2 * marginPt;
        const heightPt = contentHeightPt + 2 * marginPt;
        return {
            widthPt,
            heightPt,
            orientation: widthPt >= heightPt ? 'landscape' : 'portrait',
            isContentSized: true,
        };
    }

    let widthPt: number;
    let heightPt: number;
    if (pageSize.kind === 'preset') {
        ({ widthPt, heightPt } = PRESETS[pageSize.name]);
    } else {
        widthPt = lengthToPoints(pageSize.width);
        heightPt = lengthToPoints(pageSize.height);
    }

    const resolvedOrientation: 'portrait' | 'landscape' =
        orientation === 'auto'
            ? contentWidthPt > contentHeightPt
                ? 'landscape'
                : 'portrait'
            : orientation;

    if (resolvedOrientation === 'landscape' && widthPt < heightPt) {
        [widthPt, heightPt] = [heightPt, widthPt];
    } else if (resolvedOrientation === 'portrait' && widthPt > heightPt) {
        [widthPt, heightPt] = [heightPt, widthPt];
    }

    return { widthPt, heightPt, orientation: resolvedOrientation, isContentSized: false };
}

/**
 * Validate a margin against the resolved page. `margin × 2 ≥ either dim`
 * means the printable area collapses; throw with a pointer at `--margin`.
 */
export function validateMargin(marginPt: number, page: ResolvedPage): void {
    if (!Number.isFinite(marginPt) || marginPt < 0) {
        throw new PageSizeParseError('invalid margin: must be a non-negative number of points');
    }
    if (marginPt * 2 >= page.widthPt || marginPt * 2 >= page.heightPt) {
        throw new PageSizeParseError(
            `margin ${marginPt}pt consumes the entire ${page.widthPt}x${page.heightPt}pt page`,
        );
    }
}

export interface ContentScale {
    /** Factor applied to content; 1 = native, < 1 = shrink to fit. */
    factor: number;
    /** Top-left of where the (scaled) content begins inside the page. */
    offsetX: number;
    offsetY: number;
}

/**
 * For fixed-page mode, fit (centered, never up-scaled) the content rectangle
 * inside the printable area `(page − 2 × margin)`. For content-sized pages,
 * the factor is always 1 and the offset is just the margin.
 */
export function fitContent(args: {
    page: ResolvedPage;
    contentWidthPt: number;
    contentHeightPt: number;
    marginPt: number;
}): ContentScale {
    const { page, contentWidthPt, contentHeightPt, marginPt } = args;
    if (page.isContentSized) {
        return { factor: 1, offsetX: marginPt, offsetY: marginPt };
    }
    const printableW = page.widthPt - 2 * marginPt;
    const printableH = page.heightPt - 2 * marginPt;
    const scaleX = printableW / contentWidthPt;
    const scaleY = printableH / contentHeightPt;
    const factor = Math.min(scaleX, scaleY, 1);
    const scaledW = contentWidthPt * factor;
    const scaledH = contentHeightPt * factor;
    return {
        factor,
        offsetX: marginPt + (printableW - scaledW) / 2,
        offsetY: marginPt + (printableH - scaledH) / 2,
    };
}
