// Scales: the "logical units → pixels" abstraction.
//
// TimeScale wraps d3-scale's scaleUtc for the X axis. BandScale wraps
// scaleBand for the Y axis (one band per swimlane). Both expose forward,
// invert (for editor click/drag), ticks (for axis rendering), and a couple
// of helpers our layout actually needs (bandwidth, step).
//
// Design: keep our domain language at the boundary (Date for time, string
// laneId for bands) so consumers never reach for d3 types directly.

import { scaleUtc, scaleBand, type ScaleBand, type ScaleTime } from 'd3-scale';
import type { CountableTimeInterval } from 'd3-time';
import type { WorkingCalendar } from './working-calendar.js';

export interface TimeScaleOptions {
    domain: [Date, Date];
    range: [number, number];
    /** Optional non-continuous calendar (skips weekends, holidays, etc.). */
    calendar?: WorkingCalendar;
}

/**
 * Time scale for the X axis. Continuous by default; non-continuous when a
 * `WorkingCalendar` is supplied (the calendar filters the d3 tick stream and
 * the forward mapping walks only working days).
 *
 * For continuous mode, `forward(date)` is `d3.scaleUtc(domain, range)(date)`
 * directly — pure linear time → pixels.
 *
 * For non-continuous mode, the domain "shrinks" to working time only:
 * forward computes the working-day index of `date` and maps that index linearly
 * across the range. This means a Saturday's pixel collapses to the same value
 * as the surrounding Friday/Monday boundary, which is what we want for
 * "compress non-working time" semantics.
 */
export class TimeScale {
    private readonly base: ScaleTime<number, number>;
    private readonly options: TimeScaleOptions;
    private readonly workingDayCount: number;

    constructor(options: TimeScaleOptions) {
        this.options = options;
        this.base = scaleUtc().domain(options.domain).range(options.range);
        this.workingDayCount = this.options.calendar
            ? this.options.calendar.workingDaysBetween(options.domain[0], options.domain[1])
            : Math.max(1, daysBetween(options.domain[0], options.domain[1]));
    }

    /** Domain accessor for callers that want to inspect bounds. */
    domain(): [Date, Date] {
        return [this.options.domain[0], this.options.domain[1]];
    }

    range(): [number, number] {
        return [this.options.range[0], this.options.range[1]];
    }

    /** Map a date to a pixel x. Falls outside `range` if `date` is out of domain. */
    forward(date: Date): number {
        if (!this.options.calendar) return this.base(date);
        const idx = this.options.calendar.workingDaysBetween(this.options.domain[0], date);
        const t = idx / Math.max(1, this.workingDayCount);
        const [r0, r1] = this.options.range;
        return r0 + (r1 - r0) * t;
    }

    /** Inverse: pixel x → Date. Useful for editor click/drag (m4). */
    invert(x: number): Date {
        if (!this.options.calendar) return this.base.invert(x);
        const [r0, r1] = this.options.range;
        const t = (x - r0) / Math.max(1, r1 - r0);
        const idx = Math.round(t * this.workingDayCount);
        return this.options.calendar.dateAtWorkingIndex(this.options.domain[0], idx);
    }

    /** Ticks at a given d3 time interval, filtered by the WorkingCalendar. */
    ticks(interval: CountableTimeInterval, step = 1): Date[] {
        const stepped = step === 1 ? interval : interval.every(step);
        if (!stepped) return [];
        const all = stepped.range(this.options.domain[0], offsetByOne(this.options.domain[1]));
        if (!this.options.calendar) return all;
        return all.filter((d) => this.options.calendar!.isWorkingTime(d));
    }

    /**
     * Number of pixels representing one canonical day.
     * For continuous mode: `(range / domainDays)`.
     * For non-continuous: `(range / workingDays)` so each working day still
     * gets uniform spacing in the visible range.
     */
    pixelsPerDay(): number {
        const [r0, r1] = this.options.range;
        return (r1 - r0) / Math.max(1, this.workingDayCount);
    }
}

export interface BandScaleOptions {
    domain: string[];
    range: [number, number];
    /** Inner padding as a fraction of the step (0..1). */
    paddingInner?: number;
    /** Outer padding as a fraction of the step (0..1). */
    paddingOuter?: number;
}

/**
 * Band scale for the Y axis (one band per swimlane). Each band has a
 * `bandwidth()` (its row height) and a `step()` (band-to-band stride).
 *
 * The `bandwidth` accessor is what `defaults > spacing` should drive in v2:
 * raise `paddingInner` and the gap between adjacent bands grows; bandwidth
 * shrinks accordingly.
 */
export class BandScale {
    private readonly base: ScaleBand<string>;

    constructor(options: BandScaleOptions) {
        this.base = scaleBand<string>().domain(options.domain).range(options.range);
        if (options.paddingInner !== undefined) this.base.paddingInner(options.paddingInner);
        if (options.paddingOuter !== undefined) this.base.paddingOuter(options.paddingOuter);
    }

    /** Top y-coordinate of the band for the given laneId (or NaN if missing). */
    forward(laneId: string): number {
        const v = this.base(laneId);
        return v === undefined ? Number.NaN : v;
    }

    /** Inverse: pixel y → laneId, or null if the y is outside any band. */
    invert(y: number): string | null {
        const domain = this.base.domain();
        const step = this.base.step();
        const bandwidth = this.base.bandwidth();
        for (const laneId of domain) {
            const top = this.base(laneId)!;
            if (y >= top && y <= top + bandwidth) return laneId;
        }
        // Fallback: if we landed in a padding gap, snap to nearest band by step.
        const [r0] = this.base.range();
        const idx = Math.floor((y - r0) / Math.max(1, step));
        if (idx < 0 || idx >= domain.length) return null;
        return domain[idx];
    }

    bandwidth(): number {
        return this.base.bandwidth();
    }

    step(): number {
        return this.base.step();
    }

    domain(): string[] {
        return [...this.base.domain()];
    }

    range(): [number, number] {
        const r = this.base.range();
        return [r[0], r[1]];
    }
}

function daysBetween(a: Date, b: Date): number {
    const ONE_DAY = 86_400_000;
    return Math.round((b.getTime() - a.getTime()) / ONE_DAY);
}

function offsetByOne(date: Date): Date {
    // d3 time intervals are half-open [start, stop); we want endDate inclusive.
    return new Date(date.getTime() + 86_400_000);
}
