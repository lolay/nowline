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
// columns once the span runs long enough. Under a calendar with
// non-working days (`hide`) every unit takes real boundaries: days,
// week starts, or unit starts on the working-day axis.

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
import type { PositionedNonWorkingRun, PositionedTick } from './types.js';
import type { WorkingCalendar } from './working-calendar.js';

export type ScaleUnit = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export interface ViewPreset {
    /** Tick stride unit (each tick is one `unit` apart). */
    unit: ScaleUnit;
    /** Show a label every N ticks (1 = every tick gets a label). */
    labelEvery: number;
    /** Pixels per `1 unit` worth of working days. */
    pixelsPerUnit: number;
    /**
     * Set when `labelEvery` came from the default thinning
     * (`LABEL_THINNING`) rather than a `scale:` literal or `label-every:`.
     * Under `hide` the default days thinning labels week starts instead.
     */
    labelEveryDefault?: true;
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
    // Spread into the result only when the thinning is the default one.
    const defaultFlag = (hasLabelEvery: boolean): { labelEveryDefault?: true } =>
        labelEveryOverride === undefined && !hasLabelEvery ? { labelEveryDefault: true } : {};

    if (scaleBlock) {
        const unitProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'unit');
        const resolvedUnit: ScaleUnit = (unitProp?.value as ScaleUnit) ?? unit;
        const labelProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'label-every');
        const pxProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'pixels-per-unit');
        const explicitLabelEvery = labelProp ? parseInt(labelProp.value, 10) || 0 : 0;
        const labelEvery =
            explicitLabelEvery !== 0 ? Math.max(1, explicitLabelEvery) : defaultLabelEvery;
        const pixelsPerUnit = pxProp
            ? Math.max(1, parseInt(pxProp.value, 10) || unitPx(resolvedUnit))
            : (pixelsPerUnitOverride ?? unitPx(resolvedUnit));
        return {
            unit: resolvedUnit,
            labelEvery,
            pixelsPerUnit,
            ...defaultFlag(explicitLabelEvery !== 0),
        };
    }

    return {
        unit,
        labelEvery: defaultLabelEvery,
        pixelsPerUnit: pixelsPerUnitOverride ?? unitPx(unit),
        ...defaultFlag(false),
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

/** Half a pixel: a column this close to a full unit counts as full. */
const NARROW_COLUMN_TOLERANCE_PX = 0.5;
/** Two working-day boundaries closer than this share one grid line. */
const SAME_X_TOLERANCE_PX = 0.5;
const DAYS_PER_WEEK = 7;

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
 *
 * With a `calendar` that has non-working days, `days` and the result
 * are working-day indices (specs/working-calendar.md §7.2): the content
 * ends before the first date whose index is `ceil(days)`, and the
 * boundary is the first day, week start or unit start at or after it.
 * A zero or negative count pads to the start (index 0) for days and
 * weeks, and to the first unit start at or after the start otherwise.
 */
export function tickBoundaryAtOrAfter(
    start: Date,
    days: number,
    unit: ScaleUnit,
    tickDays: number,
    calendar?: WorkingCalendar,
): number {
    // `days` can arrive from pixel arithmetic (`x / pixelsPerDay`), so
    // absorb float noise before rounding up; otherwise content that ends
    // exactly on a boundary would pad out a whole extra column.
    const count = Math.ceil(days - 1e-6);
    if (calendar?.hasNonWorkingDays) {
        if (!isCalendarAligned(unit) && count <= 0) return 0;
        const contentEnd =
            count <= 0 ? start : addDays(calendar.dateAtWorkingIndex(start, count - 1), 1);
        const boundary = isCalendarAligned(unit)
            ? unitStartAtOrAfter(contentEnd, unit)
            : unit === 'weeks'
              ? weekStartAtOrAfter(contentEnd, start, calendar.weekStart)
              : contentEnd;
        return calendar.workingIndexOf(start, boundary);
    }
    if (!isCalendarAligned(unit)) return Math.ceil(days / tickDays) * tickDays;
    const target = addDays(start, count);
    return daysBetween(start, unitStartAtOrAfter(target, unit));
}

function unitStartAtOrAfter(date: Date, unit: CalendarAlignedUnit): Date {
    return isUnitStart(date, unit) ? date : nextUnitStart(date, unit);
}

/**
 * The first week start at or after `date`: the calendar's `weekStart`
 * weekday, or, with none, a 7-day stride from the window start.
 */
function weekStartAtOrAfter(date: Date, windowStart: Date, weekStart: number | undefined): Date {
    const offset =
        weekStart === undefined ? -daysBetween(windowStart, date) : weekStart - date.getUTCDay();
    return addDays(date, ((offset % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK);
}

/** The first week start strictly after `date`; see `weekStartAtOrAfter`. */
function nextWeekStart(date: Date, windowStart: Date, weekStart: number | undefined): Date {
    return weekStartAtOrAfter(addDays(date, 1), windowStart, weekStart);
}

/**
 * Build header ticks for the chart. The last tick is rendered (so the
 * chart has a closing edge) but its label is suppressed because there's
 * no following column.
 *
 * Day and week ticks use a fixed stride: the ith tick sits at
 * `originX + i * stridePx`. Month, quarter, and year ticks sit on real
 * calendar boundaries; see `buildCalendarAlignedTicks`. When the scale's
 * calendar has non-working days the axis hides them and every unit
 * takes the boundary path; see `buildHiddenDayTicks`.
 */
export function buildHeaderTicks(
    scale: TimeScale,
    preset: ViewPreset,
    calendar: WorkingCalendar,
    locale: string = DEFAULT_LOCALE,
): PositionedTick[] {
    if (scale.calendar?.hasNonWorkingDays) {
        return buildHiddenDayTicks(scale, preset, scale.calendar, locale);
    }
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
 * Ticks under `hide` (specs/working-calendar.md §7.2). Candidate
 * boundaries are the window start plus every day (days), every week start
 * (weeks), or every unit start (months and up), and the window end always
 * closes the axis; x comes from the working-day scale, so a boundary on a
 * hidden day shares the next working day's x. A column of zero width is
 * dropped with its label.
 *
 * Thinning counts the kept columns. Under the default days thinning the
 * majors are the week starts instead (the first tick only when it is
 * one). The closing tick never has a label; its `major` flag follows the
 * same rule, as on the fixed-stride path.
 *
 * At days and weeks a label is dropped only when it is wider than its
 * column and the column is narrower than a full unit (a partial week at
 * either edge); a full business week keeps a label wider than its 40 px.
 * Months and up keep the #92 rule: an edge column drops a label it cannot
 * hold. A dropped label keeps its `labelX`.
 */
function buildHiddenDayTicks(
    scale: TimeScale,
    preset: ViewPreset,
    calendar: WorkingCalendar,
    locale: string,
): PositionedTick[] {
    const { unit } = preset;
    const [start, end] = scale.domain;
    const next = (date: Date): Date => {
        if (isCalendarAligned(unit)) return nextUnitStart(date, unit);
        if (unit === 'weeks') return nextWeekStart(date, start, calendar.weekStart);
        return addDays(date, 1);
    };
    const candidates: Date[] = [start];
    for (let d = next(start); d < end; d = next(d)) candidates.push(d);

    // Keep the boundaries that open a column of positive width.
    const endX = scale.forward(end);
    const kept: Array<{ date: Date; x: number }> = [];
    candidates.forEach((date, i) => {
        const x = scale.forward(date);
        const nextX = i + 1 < candidates.length ? scale.forward(candidates[i + 1]) : endX;
        if (nextX > x) kept.push({ date, x });
    });

    const weekStartMajors =
        unit === 'days' && preset.labelEveryDefault === true && calendar.weekStart !== undefined;
    const isMajor = (date: Date, column: number): boolean =>
        weekStartMajors
            ? date.getUTCDay() === calendar.weekStart
            : column % preset.labelEvery === 0;
    const fullUnitPx = calendar.daysPerUnit(unit) * scale.pixelsPerDay;

    const ticks: PositionedTick[] = kept.map(({ date, x }, column) => {
        const columnPx = (column + 1 < kept.length ? kept[column + 1].x : endX) - x;
        const major = isMajor(date, column);
        let label = major ? formatTickLabel(unit, date, column, locale) : undefined;
        if (label !== undefined) {
            const tooWide = estimateTextWidth(label, TIMELINE_TICK_LABEL_FONT_SIZE_PX) > columnPx;
            const isNarrowed = isCalendarAligned(unit)
                ? column === 0 || column === kept.length - 1
                : columnPx < fullUnitPx - NARROW_COLUMN_TOLERANCE_PX;
            if (tooWide && isNarrowed) label = undefined;
        }
        return { x, labelX: x + columnPx / 2, major, label };
    });
    if (end > start) {
        ticks.push({
            x: endX,
            labelX: undefined,
            major: isMajor(end, kept.length),
            label: undefined,
        });
    }
    return ticks;
}

/**
 * The window's non-working runs for the model (specs/working-calendar.md
 * §7.5), or undefined when the window holds no non-working day (always
 * the case on the identity path). Under `hide` a run has zero width at the
 * x of the next working day. At the days scale a run is marked `seam` when
 * it lies strictly inside the chart and no grid line falls at its x: no
 * major tick there, and no tick at all when the minor grid is on.
 */
export function buildNonWorkingRuns(
    scale: TimeScale,
    ticks: ReadonlyArray<PositionedTick>,
    unit: ScaleUnit,
    minorGrid: boolean,
): PositionedNonWorkingRun[] | undefined {
    const calendar = scale.calendar;
    if (!calendar?.hasNonWorkingDays) return undefined;
    const runs = calendar.nonWorkingRuns(scale.domain[0], scale.domain[1]);
    if (runs.length === 0) return undefined;
    const [left, right] = scale.range;
    const hasGridLineAt = (x: number): boolean =>
        ticks.some((t) => Math.abs(t.x - x) < SAME_X_TOLERANCE_PX && (t.major || minorGrid));
    return runs.map((run) => {
        const x = scale.forward(run.from);
        const out: PositionedNonWorkingRun = {
            x,
            width: scale.forward(addDays(run.through, 1)) - x,
            from: run.from,
            through: run.through,
        };
        if (run.titles.length > 0) out.titles = run.titles;
        const isInside = x - left > SAME_X_TOLERANCE_PX && right - x > SAME_X_TOLERANCE_PX;
        if (unit === 'days' && isInside && !hasGridLineAt(x)) out.seam = true;
        return out;
    });
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
