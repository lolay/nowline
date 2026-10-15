// Axis columns — the date axis as a run of tick columns, read off the
// natural scale (specs/rendering.md § "Caption cap at the chart's end",
// specs/scheduler-unification.md §8 decision 12). A spilled caption that
// would run past the axis end is capped one column past it: the item
// measure truncates the title to `captionCapX`, and finalize step f2
// (`extendTimeline`) grows the axis by that one column so its tick and date
// label draw. Both read the same columns, so the cap and the extension
// agree.

import type { TimeScale } from './time-scale.js';
import { type ScaleUnit, tickBoundaryAtOrAfter } from './view-preset.js';
import type { WorkingCalendar } from './working-calendar.js';

/** What `AxisColumns` reads from the date window. */
export interface AxisColumnsWindow {
    startDate: Date;
    /** Working days in the natural window. */
    spanDays: number;
    preset: { unit: ScaleUnit };
    calendar: WorkingCalendar;
}

/** Days of float noise `isPast` ignores, as `tickBoundaryAtOrAfter` does. */
const PAST_TOLERANCE_DAYS = 1e-6;

export class AxisColumns {
    private readonly startDate: Date;
    private readonly spanDays: number;
    private readonly unit: ScaleUnit;
    private readonly calendar: WorkingCalendar;

    /** `scale` is the natural window's scale, before f2 extends it. */
    constructor(
        window: AxisColumnsWindow,
        private readonly scale: TimeScale,
    ) {
        this.startDate = window.startDate;
        this.spanDays = window.spanDays;
        this.unit = window.preset.unit;
        this.calendar = window.calendar;
    }

    /** True when `x` lies past the working-day index `days` (float noise aside). */
    isPast(x: number, days: number): boolean {
        return this.scale.indexAtX(x) > days + PAST_TOLERANCE_DAYS;
    }

    /**
     * The working-day index of the first column boundary at or after `x`
     * (the rounding f2 applies to a content box).
     */
    boundaryAtOrAfterX(x: number): number {
        return tickBoundaryAtOrAfter(
            this.startDate,
            this.scale.indexAtX(x),
            this.unit,
            this.calendar.daysPerUnit(this.unit),
            this.calendar,
        );
    }

    /** The column boundary one column after the boundary (or window end) `days`. */
    nextBoundary(days: number): number {
        return tickBoundaryAtOrAfter(
            this.startDate,
            days + 0.5,
            this.unit,
            this.calendar.daysPerUnit(this.unit),
            this.calendar,
        );
    }

    /** The x of the working-day index `days`, past the natural end too. */
    xAt(days: number): number {
        return this.scale.forward(this.calendar.dateAtWorkingIndex(this.startDate, days));
    }

    /**
     * Where a spilled caption beside a bar ending at `barRightX` may end at
     * most: one column past the axis end. The axis end is the natural one,
     * or the boundary f2 grows it to for this bar when the bar itself runs
     * past it.
     */
    captionCapX(barRightX: number): number {
        const axisDays = this.isPast(barRightX, this.spanDays)
            ? Math.max(this.spanDays, this.boundaryAtOrAfterX(barRightX))
            : this.spanDays;
        return this.xAt(this.nextBoundary(axisDays));
    }
}
