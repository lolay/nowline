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
//
// Under the `show` display (§7.3) a calendar's non-working days keep their
// full width instead: x is linear in calendar days, and `startX` /
// `advanceX` step an item over the non-working days it crosses. Every
// branch for it is gated on `showsNonWorking`, so `hide`, a calendar with no
// non-working day and a scale with no calendar keep the code above verbatim.

import { addDays, daysBetween } from './calendar.js';
import type { NonWorkingDisplay } from './non-working-display.js';
import type { WorkingCalendar } from './working-calendar.js';

/**
 * Tolerance, in days, for reading a day off an x. Pixel sums carry float
 * noise, so an x a hair before a day's start counts as that day.
 */
const DAY_EPSILON = 1e-6;

export interface TimeScaleOptions {
    /** [start, end] in calendar dates (UTC midnight assumed). */
    domain: [Date, Date];
    /** [originX, originX + chartWidth]. */
    range: [number, number];
    /** The working calendar; without one every day is a working day. */
    calendar?: WorkingCalendar;
    /** How non-working days are drawn; `hide` when omitted. */
    nonWorking?: NonWorkingDisplay;
}

export class TimeScale {
    readonly domain: [Date, Date];
    readonly range: [number, number];
    readonly pixelsPerDay: number;
    readonly calendar?: WorkingCalendar;
    /** The requested display; `showsNonWorking` says whether it takes effect. */
    readonly nonWorking: NonWorkingDisplay;

    constructor(opts: TimeScaleOptions) {
        this.domain = opts.domain;
        this.range = opts.range;
        this.calendar = opts.calendar;
        this.nonWorking = opts.nonWorking ?? 'hide';
        const spanDays = Math.max(
            1,
            this.showsNonWorking
                ? daysBetween(opts.domain[0], opts.domain[1])
                : this.indexOf(opts.domain[1]),
        );
        this.pixelsPerDay = (opts.range[1] - opts.range[0]) / spanDays;
    }

    /**
     * True when non-working days are drawn at full width: the `show`
     * display over a calendar that has non-working days. The one predicate
     * every show-only branch in the layout is gated on.
     */
    get showsNonWorking(): boolean {
        return this.nonWorking === 'show' && this.calendar?.hasNonWorkingDays === true;
    }

    /** Working days from the domain start to `date` (calendar days without a calendar). */
    private indexOf(date: Date): number {
        return this.calendar
            ? this.calendar.workingIndexOf(this.domain[0], date)
            : daysBetween(this.domain[0], date);
    }

    /** Calendar days from the domain start to `x`, and the whole day `x` lies in. */
    private dayAt(x: number): { days: number; day: number } {
        const days = (x - this.range[0]) / this.pixelsPerDay;
        return { days, day: Math.floor(days + DAY_EPSILON) };
    }

    /**
     * Project a date onto the x-axis. Always returns a number, even
     * for dates outside the domain (callers that need clamping use
     * `forwardWithinDomain`).
     */
    forward(date: Date): number {
        if (this.showsNonWorking) {
            return this.range[0] + daysBetween(this.domain[0], date) * this.pixelsPerDay;
        }
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
     * (UTC midnight). Never a non-working day, except under `show`, where
     * every day has width and this is the calendar day nearest x.
     */
    invert(x: number): Date {
        const index = Math.round((x - this.range[0]) / this.pixelsPerDay);
        if (this.showsNonWorking) return addDays(this.domain[0], index);
        return this.calendar
            ? this.calendar.dateAtWorkingIndex(this.domain[0], index)
            : addDays(this.domain[0], index);
    }

    /**
     * The working-day index at `x`, with the fraction of a working day it
     * is into. Under `show` an x inside a non-working day reads as the start
     * of the next working day; otherwise x is linear in the index.
     */
    indexAtX(x: number): number {
        const { days, day } = this.dayAt(x);
        if (!this.showsNonWorking || !this.calendar) return days;
        const date = addDays(this.domain[0], day);
        const index = this.calendar.workingIndexOf(this.domain[0], date);
        if (!this.calendar.isWorkingDay(date)) return index;
        return index + Math.max(0, days - day);
    }

    /**
     * Where an item placed at `x` starts. Under `show` an x inside a
     * non-working day moves forward to the start of the next working day;
     * an x inside a working day keeps its fraction, so a start mid-Friday
     * stays mid-Friday. The identity otherwise.
     */
    startX(x: number): number {
        if (!this.showsNonWorking || !this.calendar) return x;
        const date = addDays(this.domain[0], this.dayAt(x).day);
        if (this.calendar.isWorkingDay(date)) return x;
        const index = this.calendar.workingIndexOf(this.domain[0], date);
        return this.forward(this.calendar.dateAtWorkingIndex(this.domain[0], index));
    }

    /**
     * The x where `n` working days from `startX(x)` end. Under `show` that is
     * the end of the last working day the span reaches, with a partial day
     * interpolated, so a Mon-Fri item ends on Friday evening and the weekend
     * after it stays open. `x + n * pixelsPerDay` otherwise.
     */
    advanceX(x: number, n: number): number {
        if (!this.showsNonWorking || !this.calendar) return x + n * this.pixelsPerDay;
        const start = this.startX(x);
        if (n <= 0) return start;
        const target = this.indexAtX(start) + n;
        // The working day the span ends in, and how much of it it covers (0, 1].
        const lastDay = Math.ceil(target - DAY_EPSILON) - 1;
        const covered = target - lastDay;
        const lastDate = this.calendar.dateAtWorkingIndex(this.domain[0], lastDay);
        return this.forward(lastDate) + covered * this.pixelsPerDay;
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
