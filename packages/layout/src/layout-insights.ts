// Layout-time insights — observable reflow consequences from the positioned
// model. Informational by default; warnings only when author intent is lost
// (e.g. now-line outside the date window).

import { type I1006Args, type MessageCode, tr } from '@nowline/core';
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

/**
 * The name an insight echoes for an item: its id, else its title. A title
 * can carry explicit `\n` line breaks (they paint as separate lines in the
 * chart), but an insight message is one line of text, so each break run
 * collapses to a single space.
 */
function itemLabel(item: PositionedItem): string {
    if (item.id !== undefined) return item.id;
    return /[\r\n]/.test(item.title)
        ? item.title.replace(/\s*[\r\n]+\s*/g, ' ').trim()
        : item.title;
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
    collectWavePinInsight(item, locale, out);
    collectNonWorkingPinInsight(item, locale, out);
}

/** NL.W1001 (specs/waves.md WV15): a wave floor moved the item's pin. */
function collectWavePinInsight(item: PositionedItem, locale: string, out: LayoutInsight[]): void {
    const pin = item.wavePinOverride;
    if (!pin) return;
    const name = itemLabel(item);
    out.push(
        makeInsight(
            locale,
            'NL.W1001',
            'warning',
            { name, pin: pin.pin, key: pin.key, wave: pin.wave, start: pin.start },
            name,
        ),
    );
}

/** NL.I1008 (specs/working-calendar.md §6): a pin on a non-working day set the start. */
function collectNonWorkingPinInsight(
    item: PositionedItem,
    locale: string,
    out: LayoutInsight[],
): void {
    const pin = item.nonWorkingPin;
    if (!pin) return;
    const name = itemLabel(item);
    out.push(
        makeInsight(
            locale,
            'NL.I1008',
            'info',
            { name, pin: pin.pin, key: pin.key, start: pin.start },
            name,
        ),
    );
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
 * Pin insights on the items of an isolated region's lanes. Region items
 * carry only the wave pin override (NL.W1001, specs/waves.md §8.7) and the
 * non-working pin (NL.I1008) here; the other item and lane insights stay
 * main-lane only, as before waves.
 */
function collectWaveItemInsights(
    lane: PositionedSwimlane,
    locale: string,
    out: LayoutInsight[],
): void {
    walkTrackChildren(lane.children, (item) => {
        collectWavePinInsight(item, locale, out);
        collectNonWorkingPinInsight(item, locale, out);
    });
    for (const nested of lane.nested) {
        collectWaveItemInsights(nested, locale, out);
    }
}

/**
 * Roadmap-level wave insights (specs/waves.md WV16-WV18): the barrier
 * driver's pass cap, empty waves (once per roadmap), and dated milestones a
 * wave overruns. No-ops without waves.
 */
function collectWaveInsights(
    layout: PositionedRoadmap,
    locale: string,
    out: LayoutInsight[],
): void {
    if (layout.waveSolve?.capped) {
        out.push(makeInsight(locale, 'NL.W1002', 'warning', { passes: layout.waveSolve.passes }));
    }
    const waves = layout.waves ?? [];
    const empty = waves.filter((w) => w.empty).map((w) => w.id);
    if (empty.length > 0) {
        const args: I1006Args =
            empty.length === waves.length
                ? { reason: 'all', names: empty }
                : empty.length === 1
                  ? { reason: 'one', name: empty[0] }
                  : { reason: 'many', names: empty };
        out.push(
            makeInsight(
                locale,
                'NL.I1006',
                'info',
                args,
                args.reason === 'one' ? args.name : undefined,
            ),
        );
    }
    for (const m of layout.milestones) {
        // Only dated milestones get `overrunByWave`, and each carries its
        // own date as `overrunDate`: x cannot give it back, since a hidden
        // day shares the next working day's x.
        if (m.overrunByWave === undefined || m.overrunDate === undefined) continue;
        const wave = waves.find((w) => w.id === m.overrunByWave);
        if (!wave) continue;
        const name = m.id ?? m.title;
        out.push(
            makeInsight(
                locale,
                'NL.I1007',
                'info',
                {
                    name,
                    date: m.overrunDate,
                    wave: wave.id,
                    end: formatIsoDate(wave.endDate),
                },
                name,
            ),
        );
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
    for (const region of layout.includes) {
        for (const lane of region.nestedSwimlanes) {
            collectWaveItemInsights(lane, locale, out);
        }
    }
    collectWaveInsights(layout, locale, out);

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
