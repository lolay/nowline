// Date <-> pixel mapping. Replaces the hand-coded `xForDate` /
// `pixelsPerDay` arithmetic from `timeline.ts` with a wrapper that
// also exposes `invert(x) -> Date` for the m4 editor work and that
// composes with a `WorkingCalendar` for non-continuous time models.
//
// Forward direction matches the legacy arithmetic byte-for-byte
// (`originX + daysBetween(domain[0], date) * pixelsPerDay`) so the
// m2.5a refactor leaves the rendered output unchanged. Invert uses
// `d3-scale.scaleTime` so callers get a precise Date back from a
// pixel coordinate.

import { type ScaleTime, scaleTime } from 'd3-scale';
import { daysBetween } from './calendar.js';
import type { WorkingCalendar } from './working-calendar.js';

export interface TimeScaleOptions {
    /** [start, end] in calendar dates (UTC midnight assumed). */
    domain: [Date, Date];
    /** [originX, originX + chartWidth]. */
    range: [number, number];
    /** Optional non-continuous calendar for future weekend-skip support. */
    calendar?: WorkingCalendar;
}

export class TimeScale {
    readonly domain: [Date, Date];
    readonly range: [number, number];
    readonly pixelsPerDay: number;
    readonly calendar?: WorkingCalendar;
    private readonly d3: ScaleTime<number, number>;

    constructor(opts: TimeScaleOptions) {
        this.domain = opts.domain;
        this.range = opts.range;
        this.calendar = opts.calendar;
        const spanDays = Math.max(1, daysBetween(opts.domain[0], opts.domain[1]));
        this.pixelsPerDay = (opts.range[1] - opts.range[0]) / spanDays;
        this.d3 = scaleTime().domain(opts.domain).range(opts.range);
    }

    /**
     * Project a date onto the x-axis. Always returns a number, even
     * for dates outside the domain (callers that need clamping use
     * `forwardWithinDomain`).
     */
    forward(date: Date): number {
        const days = daysBetween(this.domain[0], date);
        return this.range[0] + days * this.pixelsPerDay;
    }

    /**
     * Project a date onto the x-axis, returning `null` when the date
     * is outside [domain[0], domain[1]]. Replaces the legacy
     * `xForDate(date, timeline)` helper.
     */
    forwardWithinDomain(date: Date): number | null {
        if (date < this.domain[0] || date > this.domain[1]) return null;
        return this.forward(date);
    }

    /**
     * Inverse projection. Returns a Date for any x in the chart;
     * callers that want day-resolution can floor the result.
     */
    invert(x: number): Date {
        return this.d3.invert(x);
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
