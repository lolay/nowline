// FootnoteNode + indexFootnotes / buildFootnotePanel — footnote area at the bottom of the
// chart. Each footnote gets a stable index (1-based, in document order) and
// records its `on:` host references so item / swimlane sequencing can
// emit the matching superscript indicators. An isolated region's
// footnotes continue the numbering after the host's, in include order,
// and share the one panel under a heading row with the region's title.
// An entry whose text does not fit the panel's width wraps onto more
// rows at the title's x. The panel grows to fit: 28 px header + (entry
// rows and region headings × FOOTNOTE_ROW_HEIGHT) + 16 px padding.

import type { FootnoteDeclaration } from '@nowline/core';
import { propValues } from '../dsl-utils.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import { estimateTextWidth, wrapText } from '../text-measure.js';
import {
    FOOTNOTE_HEADER_HEIGHT_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FOOTNOTE_ROW_HEIGHT,
} from '../themes/shared.js';
import type {
    BoundingBox,
    PositionedFootnoteArea,
    PositionedFootnoteEntry,
    PositionedFootnoteLine,
} from '../types.js';

/** Each footnote's 1-based number (in document order) and its `on:` host ids. */
export interface FootnoteIndex {
    index: Map<string, number>;
    hosts: Map<string, string[]>;
}

/**
 * Pure: depends only on the footnote declarations. Numbers start after
 * `precedingCount` (an isolated region continues after the host and the
 * regions before it). The map's order is document order: the resolver
 * inserts a file's own footnotes as declared, then each merged include's.
 */
export function indexFootnotes(
    footnotes: Map<string, FootnoteDeclaration>,
    precedingCount = 0,
): FootnoteIndex {
    const index = new Map<string, number>();
    const hosts = new Map<string, string[]>();
    [...footnotes.entries()].forEach(([id, f], i) => {
        index.set(id, precedingCount + i + 1);
        hosts.set(id, propValues(f.properties, 'on'));
    });
    return { index, hosts };
}

/** An isolated region's footnotes, numbered and styled by its own context. */
export interface RegionFootnotes {
    /** The region's title, as on its label tab. */
    title: string;
    footnotes: Map<string, FootnoteDeclaration>;
    ctx: LayoutContext;
}

/** Font sizes (px) of an entry's title and description. */
const FOOTNOTE_TEXT_FONT_SIZE_PX = 11;
/** The description column never starts closer than this to the title's x. */
const FOOTNOTE_DESCRIPTION_MIN_OFFSET_PX = 120;
/** Per-character advance the description column is placed by. */
const FOOTNOTE_TITLE_CHAR_ADVANCE_PX = 6;
const DESCRIPTION_LEAD = '— ';

/**
 * The panel below the chart, spanning the final canvas (`chartRightX`):
 * the host's footnotes, then each region's under its title, each in
 * document order. The canvas does not grow for the panel: an entry whose
 * title or description runs past the panel's inner right edge wraps onto
 * more rows, which start at the title's x and use the whole width.
 */
export function buildFootnotePanel(
    footnotes: Map<string, FootnoteDeclaration>,
    ctx: LayoutContext,
    chartBottomY: number,
    chartRightX: number,
    regions: readonly RegionFootnotes[] = [],
): PositionedFootnoteArea {
    const boxX = FOOTNOTE_PANEL_PADDING_PX;
    const boxY = chartBottomY + FOOTNOTE_PANEL_PADDING_PX;
    const boxWidth = chartRightX - 2 * FOOTNOTE_PANEL_PADDING_PX;
    const titleX = boxX + 2 * FOOTNOTE_PANEL_PADDING_PX;
    const textRightX = boxX + boxWidth - FOOTNOTE_PANEL_PADDING_PX;
    const firstRowY = boxY + FOOTNOTE_HEADER_HEIGHT_PX + FOOTNOTE_PANEL_PADDING_PX;
    const entries: PositionedFootnoteEntry[] = [];
    let row = 0;
    const add = (
        decls: Map<string, FootnoteDeclaration>,
        source: LayoutContext,
        region?: string,
    ): void => {
        for (const [id, f] of decls) {
            const title = f.title ?? id;
            const description = f.description?.text;
            const lines = entryLines(title, description, titleX, textRightX);
            const y = firstRowY + row * FOOTNOTE_ROW_HEIGHT;
            const at = (l: { x: number; row: number; text: string }): PositionedFootnoteLine => ({
                x: l.x,
                y: y + l.row * FOOTNOTE_ROW_HEIGHT,
                text: l.text,
            });
            const entry: PositionedFootnoteEntry = {
                number: source.footnoteIndex.get(id) ?? entries.length + 1,
                y,
                title,
                titleLines: lines.title.map(at),
                description,
                style: resolveStyle('footnote', f.properties, source.styleCtx),
            };
            if (lines.description.length > 0) entry.descriptionLines = lines.description.map(at);
            if (region !== undefined) entry.region = region;
            entries.push(entry);
            row += lines.rows;
        }
    };
    add(footnotes, ctx);
    for (const r of regions) {
        if (r.footnotes.size === 0) continue;
        // The region's heading takes a row of its own above its entries.
        const headingY = firstRowY + row * FOOTNOTE_ROW_HEIGHT;
        row += 1;
        const first = entries.length;
        add(r.footnotes, r.ctx, r.title);
        entries[first].regionHeadingY = headingY;
    }
    const box: BoundingBox = {
        x: boxX,
        y: boxY,
        width: boxWidth,
        height:
            entries.length === 0
                ? 0
                : FOOTNOTE_HEADER_HEIGHT_PX + row * FOOTNOTE_ROW_HEIGHT + FOOTNOTE_PANEL_PADDING_PX,
    };
    return { box, entries };
}

interface EntryLine {
    x: number;
    /** Rows below the entry's first row. */
    row: number;
    text: string;
}

/**
 * Wrap one entry into rows. The title starts at `titleX`; the description
 * follows on the title's row at the description column (`— ` first) and
 * wraps at `titleX`. A wrapped title, or a description whose first word
 * does not fit beside the title, starts the description on a row of its
 * own. A single word wider than the panel stays whole on its row, as
 * `wrapText` never splits a word.
 */
function entryLines(
    title: string,
    description: string | undefined,
    titleX: number,
    textRightX: number,
): { title: EntryLine[]; description: EntryLine[]; rows: number } {
    const fullWidth = textRightX - titleX;
    const titleRows = fitsOrWraps(title, fullWidth, fullWidth);
    const titleLines = titleRows.map((text, row) => ({ x: titleX, row, text }));
    if (!description) return { title: titleLines, description: [], rows: titleRows.length };

    const leadWidth = estimateTextWidth(DESCRIPTION_LEAD, FOOTNOTE_TEXT_FONT_SIZE_PX);
    const firstWord = description.trim().split(/\s+/)[0] ?? '';
    const columnX =
        titleX +
        Math.max(FOOTNOTE_DESCRIPTION_MIN_OFFSET_PX, title.length * FOOTNOTE_TITLE_CHAR_ADVANCE_PX);
    const besideTitle =
        titleRows.length === 1 &&
        leadWidth + estimateTextWidth(firstWord, FOOTNOTE_TEXT_FONT_SIZE_PX) <=
            textRightX - columnX;
    const firstX = besideTitle ? columnX : titleX;
    const firstRow = besideTitle ? titleRows.length - 1 : titleRows.length;
    const rows = fitsOrWraps(description, fullWidth, textRightX - firstX - leadWidth);
    const descriptionLines = rows.map((text, i) => ({
        x: i === 0 ? firstX : titleX,
        row: firstRow + i,
        text: i === 0 ? `${DESCRIPTION_LEAD}${text}` : text,
    }));
    return {
        title: titleLines,
        description: descriptionLines,
        rows: firstRow + rows.length,
    };
}

/**
 * `text` as is when it fits `firstWidth`, else wrapped (`wrapText`, which
 * collapses whitespace), so an entry that fits keeps its exact text.
 */
function fitsOrWraps(text: string, width: number, firstWidth: number): string[] {
    if (estimateTextWidth(text, FOOTNOTE_TEXT_FONT_SIZE_PX) <= firstWidth) return [text];
    const rows = wrapText(text, width, FOOTNOTE_TEXT_FONT_SIZE_PX, firstWidth);
    return rows.length > 0 ? rows : [text];
}
