// Layout-time insights — observable reflow consequences from the positioned
// model. Informational by default; warnings only when author intent is lost
// (e.g. now-line outside the date window).

import { type MessageCode, tr } from '@nowline/core';
import { MIN_BAR_WIDTH_FOR_DOT_PX } from './item-bar-geometry.js';
import type {
    PositionedItem,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
} from './types.js';

export type LayoutInsightSeverity = 'info' | 'warning';

export interface LayoutInsight {
    message: string;
    severity: LayoutInsightSeverity;
    code: MessageCode;
    entityId?: string;
    /** LSP severity: 2 = warning, 3 = information */
    lspSeverity: 2 | 3;
    data: { code: MessageCode; args: Record<string, unknown> };
}

export interface LayoutInsightContext {
    today?: Date;
    locale?: string;
}

function formatIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function itemLabel(item: PositionedItem): string {
    return item.id ?? item.title;
}

function walkTrackChildren(
    children: PositionedTrackChild[],
    visit: (item: PositionedItem) => void,
): void {
    for (const child of children) {
        if (child.kind === 'item') {
            visit(child);
        } else {
            walkTrackChildren(child.children, visit);
        }
    }
}

function collectItemInsights(item: PositionedItem, locale: string, out: LayoutInsight[]): void {
    const name = itemLabel(item);

    if (item.textSpills) {
        out.push(makeInsight(locale, 'NL.I1000', 'info', { name }, name));
    }
    if (item.chipsOutside) {
        out.push(makeInsight(locale, 'NL.I1001', 'info', { name }, name));
    }
    // The status dot is always present, so a bar narrower than the dot's
    // inset is genuinely too small to host its marker. The other cases are
    // already captured by the layout's actual spill flags — using those
    // avoids flagging "decorations spilled" on items that have no link or
    // footnote and nothing actually spilled.
    const tooNarrow =
        item.box.width < MIN_BAR_WIDTH_FOR_DOT_PX ||
        item.dotSpills ||
        item.iconSpills ||
        item.footnoteSpills;
    if (tooNarrow) {
        out.push(makeInsight(locale, 'NL.I1002', 'info', { name }, name));
    }
    if (item.hasOverflow) {
        out.push(
            makeInsight(locale, 'NL.I1003', 'info', { name, anchor: item.overflowAnchorId }, name),
        );
    }
}

function makeInsight(
    locale: string,
    code: MessageCode,
    severity: LayoutInsightSeverity,
    args: Record<string, unknown>,
    entityId?: string,
): LayoutInsight {
    return {
        message: tr(locale, code, args as never),
        severity,
        code,
        entityId,
        lspSeverity: severity === 'warning' ? 2 : 3,
        data: { code, args },
    };
}

function collectSwimlaneInsights(
    lane: PositionedSwimlane,
    locale: string,
    out: LayoutInsight[],
): void {
    const laneName = lane.id ?? lane.title;
    const items: PositionedItem[] = [];
    walkTrackChildren(lane.children, (item) => items.push(item));

    for (const item of items) {
        collectItemInsights(item, locale, out);
    }

    const rowYs = new Set(items.map((i) => i.box.y));
    if (rowYs.size > 1) {
        out.push(
            makeInsight(locale, 'NL.I1004', 'info', { lane: laneName, rows: rowYs.size }, laneName),
        );
    }

    const hasRed = lane.utilization?.segments.some((s) => s.classification === 'red') ?? false;
    if (hasRed) {
        out.push(makeInsight(locale, 'NL.I1005', 'info', { lane: laneName }, laneName));
    }

    for (const nested of lane.nested) {
        collectSwimlaneInsights(nested, locale, out);
    }
}

/**
 * Collect layout-derived insights from a positioned roadmap. These describe
 * observable reflow consequences (caption spill, lane packing, etc.), not
 * parse/validation errors.
 */
export function collectLayoutInsights(
    layout: PositionedRoadmap,
    context: LayoutInsightContext = {},
): LayoutInsight[] {
    const locale = context.locale ?? 'en-US';
    const out: LayoutInsight[] = [];

    for (const lane of layout.swimlanes) {
        collectSwimlaneInsights(lane, locale, out);
    }

    if (context.today) {
        const today = context.today;
        const start = layout.timeline.startDate;
        const end = layout.timeline.endDate;
        if (today < start || today > end) {
            out.push(
                makeInsight(locale, 'NL.W1000', 'warning', {
                    date: formatIsoDate(today),
                    start: formatIsoDate(start),
                    end: formatIsoDate(end),
                }),
            );
        }
    }

    return out;
}
