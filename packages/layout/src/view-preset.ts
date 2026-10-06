// ViewPreset — declarative configuration for the timeline header
// (tick stride, label thinning, label format). Replaces the
// imperative `for` loop and `formatTickLabel` switch in the legacy
// `timeline.ts`.
//
// `resolveScale` parses the DSL `scale:` property (and any nested
// `scale` block) into a `ViewPreset`. `buildHeaderTicks` produces
// the `PositionedTick[]`. Day and week ticks keep the legacy fixed
// stride (byte-stable with the legacy generator); month, quarter, and
// year ticks sit on real calendar boundaries, because a fixed day
// count (30d, 22d, 65d, ...) drifts across month edges and mislabels
// columns once the span runs long enough.

import type { NowlineFile, ScaleBlock } from '@nowline/core';
import { addDays, daysBetween } from './calendar.js';
import { DEFAULT_LOCALE, localeStrings } from './i18n.js';
import { estimateTextWidth } from './text-measure.js';
import {
    DEFAULT_PIXELS_PER_DAY,
    LABEL_THINNING,
    TIMELINE_TICK_LABEL_FONT_SIZE_PX,
} from './themes/shared.js';
import type { TimeScale } from './time-scale.js';
import type { PositionedTick } from './types.js';
import type { WorkingCalendar } from './working-calendar.js';

export type ScaleUnit = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export interface ViewPreset {
    /** Tick stride unit (each tick is one `unit` apart). */
    unit: ScaleUnit;
    /** Show a label every N ticks (1 = every tick gets a label). */
    labelEvery: number;
    /** Pixels per `1 unit` worth of working days. */
    pixelsPerUnit: number;
}

// `ScaleConfig` is kept as an alias for source-compat with the few
// callers that still spell the old name; new code should use
// `ViewPreset`.
export type ScaleConfig = ViewPreset;

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

export function resolveScale(file: NowlineFile, scaleBlock: ScaleBlock | undefined): ViewPreset {
    const scaleProp = file.roadmapDecl?.properties.find((p) => stripColon(p.key) === 'scale');
    // `scale:` accepts a unit name (`days`/`weeks`/`months`/`quarters`/`years`)
    // OR a duration literal (`1w`, `2w`, `1m`, `1q`, `1y`). The literal form
    // is the documented default in the DSL spec; it picks the unit and uses
    // the literal's count to size the pixels-per-unit budget.
    const rawScale = scaleProp?.value;
    let unit: ScaleUnit = 'weeks';
    let pixelsPerUnitOverride: number | undefined;
    let labelEveryOverride: number | undefined;
    if (rawScale) {
        if (
            rawScale === 'days' ||
            rawScale === 'weeks' ||
            rawScale === 'months' ||
            rawScale === 'quarters' ||
            rawScale === 'years'
        ) {
            unit = rawScale;
        } else {
            const dur = /^(\d+)([dwmqy])$/.exec(rawScale);
            if (dur) {
                const n = Math.max(1, parseInt(dur[1], 10));
                switch (dur[2]) {
                    case 'd':
                        unit = 'days';
                        break;
                    case 'w':
                        unit = 'weeks';
                        break;
                    case 'm':
                        unit = 'months';
                        break;
                    case 'q':
                        unit = 'quarters';
                        break;
                    case 'y':
                        unit = 'years';
                        break;
                }
                pixelsPerUnitOverride = unitPx(unit) * n;
                // A literal scale like `1w` says "I want exactly one label per
                // unit." Override the default thinning so every tick is named.
                labelEveryOverride = 1;
            }
        }
    }
    const defaultLabelEvery = labelEveryOverride ?? LABEL_THINNING[unit] ?? 4;

    if (scaleBlock) {
        const unitProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'unit');
        const resolvedUnit: ScaleUnit = (unitProp?.value as ScaleUnit) ?? unit;
        const labelProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'label-every');
        const pxProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'pixels-per-unit');
        const labelEvery = labelProp
            ? Math.max(1, parseInt(labelProp.value, 10) || defaultLabelEvery)
            : defaultLabelEvery;
        const pixelsPerUnit = pxProp
            ? Math.max(1, parseInt(pxProp.value, 10) || unitPx(resolvedUnit))
            : (pixelsPerUnitOverride ?? unitPx(resolvedUnit));
        return { unit: resolvedUnit, labelEvery, pixelsPerUnit };
    }

    return {
        unit,
        labelEvery: defaultLabelEvery,
        pixelsPerUnit: pixelsPerUnitOverride ?? unitPx(unit),
    };
}

function unitPx(unit: ScaleUnit): number {
    // Baseline pixel widths per one unit, tuned so ~6 month roadmaps fit
    // comfortably in a 1200 px wide chart area.
    switch (unit) {
        case 'days':
            return DEFAULT_PIXELS_PER_DAY;
        case 'weeks':
            return 40;
        case 'months':
            return 80;
        case 'quarters':
            return 160;
        case 'years':
            return 320;
    }
}

type CalendarAlignedUnit = 'months' | 'quarters' | 'years';

// Months, quarters, and years vary in length (28-31d, 90-92d,
// 365-366d), so their ticks follow the real calendar instead of the
// `calendar:` preset's `days-per-*` count. That count is duration
// arithmetic for `1m` / `1q` / `1y` literals, not the length of a
// month on the date axis.
function isCalendarAligned(unit: ScaleUnit): unit is CalendarAlignedUnit {
    return unit === 'months' || unit === 'quarters' || unit === 'years';
}

/** First month / quarter / year start strictly after `date` (UTC). */
function nextUnitStart(date: Date, unit: CalendarAlignedUnit): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    switch (unit) {
        case 'months':
            return new Date(Date.UTC(year, month + 1, 1));
        case 'quarters':
            return new Date(Date.UTC(year, month - (month % 3) + 3, 1));
        case 'years':
            return new Date(Date.UTC(year + 1, 0, 1));
    }
}

function isUnitStart(date: Date, unit: CalendarAlignedUnit): boolean {
    if (date.getUTCDate() !== 1) return false;
    const month = date.getUTCMonth();
    switch (unit) {
        case 'months':
            return true;
        case 'quarters':
            return month % 3 === 0;
        case 'years':
            return month === 0;
    }
}

/**
 * Day offset from `start` of the first tick boundary at or after
 * `start + days`. Used to pad the date window so the chart's right
 * edge lands on a column boundary. Day and week units round up to a
 * multiple of the fixed stride (`tickDays`); month, quarter, and year
 * units round up to the next real month / quarter / year start.
 */
export function tickBoundaryAtOrAfter(
    start: Date,
    days: number,
    unit: ScaleUnit,
    tickDays: number,
): number {
    if (!isCalendarAligned(unit)) return Math.ceil(days / tickDays) * tickDays;
    // `days` can arrive from pixel arithmetic (`x / pixelsPerDay`), so
    // absorb float noise before rounding up; otherwise content that ends
    // exactly on a boundary would pad out a whole extra column.
    const target = addDays(start, Math.ceil(days - 1e-6));
    return daysBetween(start, isUnitStart(target, unit) ? target : nextUnitStart(target, unit));
}

/**
 * Build header ticks for the chart. The last tick is rendered (so the
 * chart has a closing edge) but its label is suppressed because there's
 * no following column.
 *
 * Day and week ticks use a fixed stride: the ith tick sits at
 * `originX + i * stridePx`. Month, quarter, and year ticks sit on real
 * calendar boundaries; see `buildCalendarAlignedTicks`.
 */
export function buildHeaderTicks(
    scale: TimeScale,
    preset: ViewPreset,
    calendar: WorkingCalendar,
    locale: string = DEFAULT_LOCALE,
): PositionedTick[] {
    if (isCalendarAligned(preset.unit)) {
        return buildCalendarAlignedTicks(scale, preset, preset.unit, locale);
    }
    const dayPerTick = calendar.daysPerUnit(preset.unit);
    const stridePx = dayPerTick * scale.pixelsPerDay;
    const totalDays = Math.max(1, Math.round(scale.widthPx / scale.pixelsPerDay));
    const tickCount = Math.floor(totalDays / dayPerTick) + 1;
    const ticks: PositionedTick[] = [];
    for (let i = 0; i < tickCount; i++) {
        const days = i * dayPerTick;
        const x = scale.originX + days * scale.pixelsPerDay;
        const isMajor = i % preset.labelEvery === 0;
        const isLast = i === tickCount - 1;
        ticks.push({
            x,
            labelX: isLast ? undefined : x + stridePx / 2,
            major: isMajor,
            label:
                isMajor && !isLast
                    ? formatTickLabel(preset.unit, addDays(scale.domain[0], days), i, locale)
                    : undefined,
        });
    }
    return ticks;
}

/**
 * Ticks at the chart's left edge, every real month / quarter / year
 * start inside the window, and the chart's right edge. The first and
 * last columns can be partial (a roadmap starting Jan 5 opens with a
 * Jan 5 - Feb 1 column); each column is labelled from its own start
 * date, so a partial column still names the month it sits in.
 * Thinning (`labelEvery`) counts ticks from the left edge, as the
 * fixed-stride generator does.
 */
function buildCalendarAlignedTicks(
    scale: TimeScale,
    preset: ViewPreset,
    unit: CalendarAlignedUnit,
    locale: string,
): PositionedTick[] {
    const [start, end] = scale.domain;
    const dates: Date[] = [start];
    for (let d = nextUnitStart(start, unit); d < end; d = nextUnitStart(d, unit)) {
        dates.push(d);
    }
    if (end > start) dates.push(end);
    const xs = dates.map((d) => scale.forward(d));
    const lastIndex = dates.length - 1;
    return dates.map((date, i) => {
        const x = xs[i];
        const isMajor = i % preset.labelEvery === 0;
        if (i === lastIndex) return { x, labelX: undefined, major: isMajor, label: undefined };
        const columnPx = xs[i + 1] - x;
        let label = isMajor ? formatTickLabel(unit, date, i, locale) : undefined;
        // A partial edge column can be a sliver (a roadmap starting Mar
        // 29, or `length:` ending just past a month start). Its centered
        // label would spill past the chart edge, so drop the label when
        // it doesn't fit; the tick and grid line stay.
        const isEdgeColumn = i === 0 || i === lastIndex - 1;
        if (
            label !== undefined &&
            isEdgeColumn &&
            estimateTextWidth(label, TIMELINE_TICK_LABEL_FONT_SIZE_PX) > columnPx
        ) {
            label = undefined;
        }
        return { x, labelX: x + columnPx / 2, major: isMajor, label };
    });
}

function formatTickLabel(unit: ScaleUnit, date: Date, _index: number, locale: string): string {
    switch (unit) {
        case 'days':
            return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
        case 'weeks': {
            const month = date.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
            const day = date.getUTCDate().toString().padStart(2, '0');
            return `${month} ${day}`;
        }
        case 'months':
            return date.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
        case 'quarters': {
            const q = Math.floor(date.getUTCMonth() / 3) + 1;
            return `${localeStrings(locale).quarterPrefix}${q} ${date.getUTCFullYear()}`;
        }
        case 'years':
            return `${date.getUTCFullYear()}`;
    }
}
