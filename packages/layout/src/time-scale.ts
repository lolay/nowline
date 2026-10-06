// Date <-> pixel mapping. Replaces the hand-coded `xForDate` /
// `pixelsPerDay` arithmetic from `timeline.ts` with a wrapper that
// also exposes `invert(x) -> Date` for the m4 editor work and that
// composes with a `WorkingCalendar` for non-continuous time models.
//
// x is linear in the working-day index from the domain start
// (specs/working-calendar.md §7.1): `originX + index * pixelsPerDay`.
// With no calendar, or one with no non-working day, the index is
// `daysBetween`, so the forward direction matches the legacy
// arithmetic byte-for-byte. Under a calendar with non-working days a
// hidden date maps to the start of the next working day, and `invert`
// returns the working day whose start is nearest x.

import { addDays, daysBetween } from './calendar.js';
import type { WorkingCalendar } from './working-calendar.js';

export interface TimeScaleOptions {
    /** [start, end] in calendar dates (UTC midnight assumed). */
    domain: [Date, Date];
    /** [originX, originX + chartWidth]. */
    range: [number, number];
    /** The working calendar; without one every day is a working day. */
    calendar?: WorkingCalendar;
}

export class TimeScale {
    readonly domain: [Date, Date];
    readonly range: [number, number];
    readonly pixelsPerDay: number;
    readonly calendar?: WorkingCalendar;

    constructor(opts: TimeScaleOptions) {
        this.domain = opts.domain;
        this.range = opts.range;
        this.calendar = opts.calendar;
        const spanDays = Math.max(1, this.indexOf(opts.domain[1]));
        this.pixelsPerDay = (opts.range[1] - opts.range[0]) / spanDays;
    }

    /** Working days from the domain start to `date` (calendar days without a calendar). */
    private indexOf(date: Date): number {
        return this.calendar
            ? this.calendar.workingIndexOf(this.domain[0], date)
            : daysBetween(this.domain[0], date);
    }

    /**
     * Project a date onto the x-axis. Always returns a number, even
     * for dates outside the domain (callers that need clamping use
     * `forwardWithinDomain`).
     */
    forward(date: Date): number {
        return this.range[0] + this.indexOf(date) * this.pixelsPerDay;
    }

    /**
     * Project a date onto the x-axis, returning `null` when the date
     * is outside [domain[0], domain[1]]. The guard compares raw dates,
     * so a hidden day inside the window still projects. Replaces the
     * legacy `xForDate(date, timeline)` helper.
     */
    forwardWithinDomain(date: Date): number | null {
        if (date < this.domain[0] || date > this.domain[1]) return null;
        return this.forward(date);
    }

    /**
     * Inverse projection: the working day whose start is nearest x
     * (UTC midnight). Never a non-working day.
     */
    invert(x: number): Date {
        const index = Math.round((x - this.range[0]) / this.pixelsPerDay);
        return this.calendar
            ? this.calendar.dateAtWorkingIndex(this.domain[0], index)
            : addDays(this.domain[0], index);
    }

    /** First pixel of the chart (start of range). */
    get originX(): number {
        return this.range[0];
    }

    /** Width of the chart band in pixels. */
    get widthPx(): number {
        return this.range[1] - this.range[0];
    }
}
