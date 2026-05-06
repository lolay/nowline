// FootnoteNode + buildFootnotes — footnote area at the bottom of the
// chart. Each footnote gets a stable index (1-based, sorted by id) and
// records its `on:` host references so item / swimlane sequencing can
// emit the matching superscript indicators. The panel grows to fit:
// 28 px header + (entries × FOOTNOTE_ROW_HEIGHT) + 16 px padding.

import type { FootnoteDeclaration } from '@nowline/core';
import { resolveStyle } from '../style-resolution.js';
import {
    FOOTNOTE_ROW_HEIGHT,
    FOOTNOTE_HEADER_HEIGHT_PX,
    FOOTNOTE_PANEL_PADDING_PX,
} from '../themes/shared.js';
import type {
    PositionedFootnoteArea,
    PositionedFootnoteEntry,
    BoundingBox,
} from '../types.js';
import type { LayoutContext } from '../layout-context.js';
import { propValues } from '../dsl-utils.js';

export interface BuiltFootnotes {
    area: PositionedFootnoteArea;
    index: Map<string, number>;
    hosts: Map<string, string[]>;
}

export function buildFootnotes(
    footnotes: Map<string, FootnoteDeclaration>,
    ctx: LayoutContext,
    chartBottomY: number,
): BuiltFootnotes {
    const entries: PositionedFootnoteEntry[] = [];
    const index = new Map<string, number>();
    const hosts = new Map<string, string[]>();
    const ordered = [...footnotes.entries()].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([id, f], i) => {
        const n = i + 1;
        index.set(id, n);
        hosts.set(id, propValues(f.properties, 'on'));
        entries.push({
            number: n,
            title: f.title ?? id,
            description: f.description?.text,
            style: resolveStyle('footnote', f.properties, ctx.styleCtx),
        });
    });
    const box: BoundingBox = {
        x: FOOTNOTE_PANEL_PADDING_PX,
        y: chartBottomY + FOOTNOTE_PANEL_PADDING_PX,
        width: ctx.chartRightX - 2 * FOOTNOTE_PANEL_PADDING_PX,
        height: entries.length === 0
            ? 0
            : FOOTNOTE_HEADER_HEIGHT_PX
                + entries.length * FOOTNOTE_ROW_HEIGHT
                + FOOTNOTE_PANEL_PADDING_PX,
    };
    return {
        area: { box, entries },
        index,
        hosts,
    };
}
