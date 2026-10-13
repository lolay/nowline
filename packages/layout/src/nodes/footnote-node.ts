// FootnoteNode + indexFootnotes / buildFootnotePanel — footnote area at the bottom of the
// chart. Each footnote gets a stable index (1-based, sorted by id) and
// records its `on:` host references so item / swimlane sequencing can
// emit the matching superscript indicators. The panel grows to fit:
// 28 px header + (entries × FOOTNOTE_ROW_HEIGHT) + 16 px padding.

import type { FootnoteDeclaration } from '@nowline/core';
import { propValues } from '../dsl-utils.js';
import type { LayoutContext } from '../layout-context.js';
import { resolveStyle } from '../style-resolution.js';
import {
    FOOTNOTE_HEADER_HEIGHT_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FOOTNOTE_ROW_HEIGHT,
} from '../themes/shared.js';
import type { BoundingBox, PositionedFootnoteArea, PositionedFootnoteEntry } from '../types.js';

/** Each footnote's 1-based number (sorted by id) and its `on:` host ids. */
export interface FootnoteIndex {
    index: Map<string, number>;
    hosts: Map<string, string[]>;
}

/** Pure: depends only on the footnote declarations. */
export function indexFootnotes(footnotes: Map<string, FootnoteDeclaration>): FootnoteIndex {
    const index = new Map<string, number>();
    const hosts = new Map<string, string[]>();
    const ordered = [...footnotes.entries()].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([id, f], i) => {
        index.set(id, i + 1);
        hosts.set(id, propValues(f.properties, 'on'));
    });
    return { index, hosts };
}

export function buildFootnotePanel(
    footnotes: Map<string, FootnoteDeclaration>,
    ctx: LayoutContext,
    chartBottomY: number,
): PositionedFootnoteArea {
    const entries: PositionedFootnoteEntry[] = [];
    const ordered = [...footnotes.entries()].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([id, f], i) => {
        entries.push({
            number: i + 1,
            title: f.title ?? id,
            description: f.description?.text,
            style: resolveStyle('footnote', f.properties, ctx.styleCtx),
        });
    });
    const box: BoundingBox = {
        x: FOOTNOTE_PANEL_PADDING_PX,
        y: chartBottomY + FOOTNOTE_PANEL_PADDING_PX,
        width: ctx.chartRightX - 2 * FOOTNOTE_PANEL_PADDING_PX,
        height:
            entries.length === 0
                ? 0
                : FOOTNOTE_HEADER_HEIGHT_PX +
                  entries.length * FOOTNOTE_ROW_HEIGHT +
                  FOOTNOTE_PANEL_PADDING_PX,
    };
    return { box, entries };
}
