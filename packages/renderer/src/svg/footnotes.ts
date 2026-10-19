// The footnotes layer: the panel at the bottom of the chart that lists each
// footnote's number, title and description, drawn only when the roadmap has
// footnotes.

import type { PositionedFootnoteArea, Theme } from '@nowline/layout';
import { FOOTNOTE_HEADER_BASELINE_OFFSET_PX, FOOTNOTE_PANEL_PADDING_PX } from '@nowline/layout';
import type { FontFamilies } from './render.js';
import { num, tag, textTag } from './xml.js';

export function renderFootnotes(
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
