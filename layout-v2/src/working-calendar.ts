// WorkingCalendar: which calendar days count as "working time".
//
// Used by TimeScale to filter ticks and to compress non-working time on the
// X axis. Default is the 7-day continuous calendar (every day works); the
// helpers `weekendsOff()` and `withHolidays()` produce common variants.
//
// The model is tick-by-day, not tick-by-pixel: that's the structural shift
// from today's `pixelsPerDay × dayCount` to `walk the working days, count
// them, then convert to pixels.` Once the data model speaks days, the pixel
// math falls out for free.

const ONE_DAY_MS = 86_400_000;

export interface WorkingCalendar {
    /** Does this UTC date count as a working day? */
    isWorkingTime(date: Date): boolean;

    /** Number of working days in the half-open range [from, to). Always >= 0. */
    workingDaysBetween(from: Date, to: Date): number;

    /** Date that sits at the Nth working day after `from` (0-indexed). */
    dateAtWorkingIndex(from: Date, index: number): Date;
}

/** Default: every UTC date is a working day. */
export function continuousCalendar(): WorkingCalendar {
    return {
        isWorkingTime: () => true,
        workingDaysBetween: (from, to) => Math.max(0, daysBetween(from, to)),
        dateAtWorkingIndex: (from, index) => addUtcDays(from, index),
    };
}

/** Skip Saturdays and Sundays (UTC). */
export function weekendsOff(): WorkingCalendar {
    const isWeekend = (d: Date) => {
        const w = d.getUTCDay();
        return w === 0 || w === 6;
    };
    return filteredCalendar((d) => !isWeekend(d));
}

/**
 * Wraps another calendar to additionally skip the supplied YYYY-MM-DD dates.
 * Holidays already excluded by the inner calendar (e.g. weekends) don't double-count.
 */
export function withHolidays(
    inner: WorkingCalendar,
    holidayDates: ReadonlyArray<string>,
): WorkingCalendar {
    const off = new Set(holidayDates);
    return {
        isWorkingTime: (d) => inner.isWorkingTime(d) && !off.has(toIsoDate(d)),
        workingDaysBetween: (from, to) => {
            let count = 0;
            const start = startOfUtcDay(from);
            const end = startOfUtcDay(to);
            for (let t = start.getTime(); t < end.getTime(); t += ONE_DAY_MS) {
                const d = new Date(t);
                if (inner.isWorkingTime(d) && !off.has(toIsoDate(d))) count++;
            }
            return count;
        },
        dateAtWorkingIndex: (from, index) => {
            if (index <= 0) return startOfUtcDay(from);
            let cursor = startOfUtcDay(from);
            let i = 0;
            while (i < index) {
                cursor = addUtcDays(cursor, 1);
                if (inner.isWorkingTime(cursor) && !off.has(toIsoDate(cursor))) i++;
            }
            return cursor;
        },
    };
}

function filteredCalendar(predicate: (d: Date) => boolean): WorkingCalendar {
    return {
        isWorkingTime: predicate,
        workingDaysBetween: (from, to) => {
            let count = 0;
            const start = startOfUtcDay(from);
            const end = startOfUtcDay(to);
            for (let t = start.getTime(); t < end.getTime(); t += ONE_DAY_MS) {
                if (predicate(new Date(t))) count++;
            }
            return count;
        },
        dateAtWorkingIndex: (from, index) => {
            if (index <= 0) return startOfUtcDay(from);
            let cursor = startOfUtcDay(from);
            let i = 0;
            while (i < index) {
                cursor = addUtcDays(cursor, 1);
                if (predicate(cursor)) i++;
            }
            return cursor;
        },
    };
}

function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * ONE_DAY_MS);
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / ONE_DAY_MS);
}

function toIsoDate(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
