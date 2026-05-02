// ViewPreset: declarative description of the time-axis header.
//
// Replaces today's `scale: 1w` parsing + label thinning math with a typed
// structure that says: "smallest tick is one week; show two header rows —
// year over month over ISO-week-number." This is the Bryntum-flavored
// "view preset" shape, simplified to what we need.
//
// A `ViewPreset` has:
//   - resolution: smallest tick (the lower header row's unit)
//   - headers:    one entry per header row (top to bottom)
//   - pixelsPerTick: x density for the resolution unit (no calendar math here —
//                    the WorkingCalendar in TimeScale handles non-continuous
//                    compression independently)
//
// HeaderRow.thinEvery handles label density: e.g. day-resolution + weekly
// header thinEvery=7 reproduces today's per-week labels without a separate
// LABEL_THINNING table.

import {
    utcDay,
    utcMonth,
    utcWeek,
    utcYear,
    type CountableTimeInterval,
} from 'd3-time';

/** d3-time has no `utcQuarter`; compose it from `utcMonth.every(3)`. */
const utcQuarter = utcMonth.every(3) as CountableTimeInterval;

export type TimeUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface HeaderRow {
    /** Tick interval for this row (e.g. month above week above day). */
    unit: TimeUnit;
    /** Multiplier on the unit (e.g. 3-month quarters: unit=month, increment=3). */
    increment?: number;
    /**
     * How many *resolution* ticks each label spans. With a day resolution and
     * thinEvery=7, a week header gets one label per 7 day-ticks. Optional —
     * defaults to a sensible thinning per unit.
     */
    thinEvery?: number;
    /** Label formatter; receives the tick start date and the previous tick. */
    format: (date: Date, previous: Date | undefined) => string;
}

export interface ViewPreset {
    name: string;
    /** Smallest visible tick (drives the lower header row). */
    resolution: { unit: TimeUnit; increment: number };
    /** Header rows, top to bottom. */
    headers: HeaderRow[];
    /** Pixels per resolution-unit tick. */
    pixelsPerTick: number;
}

/** d3-time interval lookup keyed by `TimeUnit`. */
export function intervalFor(unit: TimeUnit): CountableTimeInterval {
    switch (unit) {
        case 'day':
            return utcDay;
        case 'week':
            return utcWeek;
        case 'month':
            return utcMonth;
        case 'quarter':
            return utcQuarter;
        case 'year':
            return utcYear;
    }
}

/** Default thinning per unit (one label per N ticks of the resolution). */
export function defaultThinEvery(unit: TimeUnit): number {
    // Mirrors today's LABEL_THINNING table from packages/layout/themes/shared.ts.
    switch (unit) {
        case 'day':
            return 7;
        case 'week':
            return 4;
        case 'month':
            return 3;
        case 'quarter':
            return 4;
        case 'year':
            return 5;
    }
}

const SHORT_MONTH = (d: Date) =>
    d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

/** Human-friendly default formatters keyed by unit. */
export function defaultFormat(unit: TimeUnit): HeaderRow['format'] {
    switch (unit) {
        case 'day':
            return (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        case 'week':
            // Always "Jan 05" — matches production's "Jan 05 / Jan 12 / ..."
            // run exactly. Year is shown only when the chart actually crosses
            // a year boundary between two ticks so single-year roadmaps keep
            // a uniform label format.
            return (d, prev) => {
                const base = `${SHORT_MONTH(d)} ${String(d.getUTCDate()).padStart(2, '0')}`;
                const yearChanged = prev !== undefined && prev.getUTCFullYear() !== d.getUTCFullYear();
                return yearChanged ? `${base} ${d.getUTCFullYear()}` : base;
            };
        case 'month':
            return (d, prev) => {
                const m = SHORT_MONTH(d);
                const showYear = !prev || prev.getUTCFullYear() !== d.getUTCFullYear();
                return showYear ? `${m} ${d.getUTCFullYear()}` : m;
            };
        case 'quarter':
            return (d) => `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
        case 'year':
            return (d) => `${d.getUTCFullYear()}`;
    }
}

// ---- Built-in presets ------------------------------------------------------

export const dayPreset: ViewPreset = {
    name: 'day',
    resolution: { unit: 'day', increment: 1 },
    pixelsPerTick: 30,
    headers: [
        {
            unit: 'month',
            format: defaultFormat('month'),
        },
        {
            unit: 'day',
            thinEvery: 1,
            format: defaultFormat('day'),
        },
    ],
};

export const weekPreset: ViewPreset = {
    name: 'week',
    resolution: { unit: 'week', increment: 1 },
    // Matches production reference: 120 px per week column.
    pixelsPerTick: 120,
    // Single-row by design — production uses one "Jan 05 / Jan 12 / ..." row
    // and lets the first label carry the year. Multi-row capability is still
    // exercised by `monthPreset` and `dayPreset` below.
    headers: [
        {
            unit: 'week',
            thinEvery: 1,
            format: defaultFormat('week'),
        },
    ],
};

export const monthPreset: ViewPreset = {
    name: 'month',
    resolution: { unit: 'month', increment: 1 },
    pixelsPerTick: 80,
    headers: [
        {
            unit: 'year',
            format: defaultFormat('year'),
        },
        {
            unit: 'month',
            thinEvery: 1,
            format: defaultFormat('month'),
        },
    ],
};

/** Lookup by name: matches today's `scale:days|weeks|months` usage. */
export function presetByName(name: string | undefined): ViewPreset {
    switch (name) {
        case 'day':
        case 'days':
        case '1d':
            return dayPreset;
        case 'month':
        case 'months':
        case '1m':
            return monthPreset;
        case 'week':
        case 'weeks':
        case '1w':
        default:
            return weekPreset;
    }
}

// ---- Tick generation -------------------------------------------------------

export interface HeaderTick {
    /** Start of the tick window. */
    start: Date;
    /** End of the tick window (exclusive). */
    end: Date;
    /** Pre-formatted label, or undefined if thinning suppressed it. */
    label: string | undefined;
}

export interface RenderedHeaderRow {
    unit: TimeUnit;
    ticks: HeaderTick[];
}

/**
 * Walk a preset over [start, end] and produce ticks for every header row plus
 * the resolution row. The renderer turns these into <text>/<line> elements;
 * the layout uses `start`+`end` to compute label x-positions via TimeScale.
 *
 * Ticks are anchored to the chart's `start` (not to natural d3-time
 * boundaries) so the first column always begins on the roadmap's start
 * date. This matches the production reference, where a roadmap starting
 * Jan 05 shows columns "Jan 05 / Jan 12 / Jan 19 / ..." instead of
 * "Jan 11 / Jan 18 / ..." which is what `utcWeek.range(...)` would give.
 *
 * Pure: no scale/no DOM. Tests only need to assert tick shape.
 */
export function buildHeaderRows(
    preset: ViewPreset,
    start: Date,
    end: Date,
): { rows: RenderedHeaderRow[]; resolutionTicks: Date[] } {
    const rows = preset.headers.map<RenderedHeaderRow>((row) => {
        const inc = row.increment ?? 1;
        const ticksRaw = rangeFromStart(row.unit, inc, start, end);
        const thinEvery = row.thinEvery ?? defaultThinEvery(row.unit);
        const ticks: HeaderTick[] = [];
        for (let i = 0; i < ticksRaw.length; i++) {
            const startDate = ticksRaw[i];
            const endDate = ticksRaw[i + 1] ?? end;
            const showLabel = i % thinEvery === 0;
            ticks.push({
                start: startDate,
                end: endDate,
                label: showLabel ? row.format(startDate, ticksRaw[i - 1]) : undefined,
            });
        }
        return { unit: row.unit, ticks };
    });

    const resolutionRaw = rangeFromStart(
        preset.resolution.unit,
        preset.resolution.increment,
        start,
        end,
    );
    // Grid lines drop at the boundaries BETWEEN columns. The first raw tick
    // coincides with the chart's left edge (where the timeline panel border
    // already lives) so it's excluded for grid-line drawing.
    const resolutionTicks = resolutionRaw.slice(1);

    return { rows, resolutionTicks };
}

/**
 * Produce ticks anchored at `start`, advancing by one `unit` × `increment`
 * each step. Uses `interval.offset(...)` so weeks step by 7 days from the
 * anchor day-of-week, months step calendar-month-wise, etc.
 */
function rangeFromStart(unit: TimeUnit, increment: number, start: Date, end: Date): Date[] {
    const interval = intervalFor(unit);
    const out: Date[] = [];
    let cursor = new Date(start);
    while (cursor.getTime() < end.getTime()) {
        out.push(new Date(cursor));
        cursor = interval.offset(cursor, increment);
    }
    return out;
}
