// FootnoteNode + indexFootnotes / buildFootnotePanel — footnote area at the bottom of the
// chart. Each footnote gets a stable index (1-based, sorted by id) and
// records its `on:` host references so item / swimlane sequencing can
// emit the matching superscript indicators. An isolated region's
// footnotes continue the numbering after the host's, in include order,
// and share the one panel under a heading row with the region's title.
// The panel grows to fit: 28 px header + (entries and region headings ×
// FOOTNOTE_ROW_HEIGHT) + 16 px padding.

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

/**
 * Pure: depends only on the footnote declarations. Numbers start after
 * `precedingCount` (an isolated region continues after the host and the
 * regions before it).
 */
export function indexFootnotes(
    footnotes: Map<string, FootnoteDeclaration>,
    precedingCount = 0,
): FootnoteIndex {
    const index = new Map<string, number>();
    const hosts = new Map<string, string[]>();
    const ordered = [...footnotes.entries()].sort(([a], [b]) => a.localeCompare(b));
    ordered.forEach(([id, f], i) => {
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

/**
 * The panel below the chart, spanning the final canvas (`chartRightX`):
 * the host's footnotes, then each region's under its title.
 */
export function buildFootnotePanel(
    footnotes: Map<string, FootnoteDeclaration>,
    ctx: LayoutContext,
    chartBottomY: number,
    chartRightX: number,
    regions: readonly RegionFootnotes[] = [],
): PositionedFootnoteArea {
    const entries: PositionedFootnoteEntry[] = [];
    const add = (
        decls: Map<string, FootnoteDeclaration>,
        source: LayoutContext,
        region?: string,
    ): void => {
        const ordered = [...decls.entries()].sort(([a], [b]) => a.localeCompare(b));
        for (const [id, f] of ordered) {
            const entry: PositionedFootnoteEntry = {
                number: source.footnoteIndex.get(id) ?? entries.length + 1,
                title: f.title ?? id,
                description: f.description?.text,
                style: resolveStyle('footnote', f.properties, source.styleCtx),
            };
            if (region !== undefined) entry.region = region;
            entries.push(entry);
        }
    };
    add(footnotes, ctx);
    let headings = 0;
    for (const r of regions) {
        if (r.footnotes.size === 0) continue;
        add(r.footnotes, r.ctx, r.title);
        headings += 1;
    }
    const box: BoundingBox = {
        x: FOOTNOTE_PANEL_PADDING_PX,
        y: chartBottomY + FOOTNOTE_PANEL_PADDING_PX,
        width: chartRightX - 2 * FOOTNOTE_PANEL_PADDING_PX,
        height:
            entries.length === 0
                ? 0
                : FOOTNOTE_HEADER_HEIGHT_PX +
                  (entries.length + headings) * FOOTNOTE_ROW_HEIGHT +
                  FOOTNOTE_PANEL_PADDING_PX,
    };
    return { box, entries };
}
