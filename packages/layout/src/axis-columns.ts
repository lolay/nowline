// Axis columns — the date axis as a run of tick columns, read off the
// natural scale (specs/rendering.md § "Caption cap at the chart's end",
// specs/scheduler-unification.md §8 decision 12). A spilled caption that
// would run past the axis end is capped one full column past it (past the
// end of a partial last column, when an explicit `length:` ends the axis
// mid-column): the item measure truncates the title to `captionCapX`, and
// finalize step f2 (`extendTimeline`) grows the axis by that one column,
// labelled by the axis's usual rules. Both read the same columns, so the
// cap and the extension agree.

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

/**
 * How far (px) past the axis end a spilled caption may run before it is
 * truncated, when one column is narrower than this: about 20 characters of
 * a 13 px title.
 */
export const CAPTION_OVERHANG_BUDGET_PX = 160;

/** Bounds the column walk in `captionLimit` (a day-scale axis has ~4 px columns). */
const MAX_CAPTION_COLUMNS = 64;

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
        return this.boundaryAtOrAfter(this.scale.indexAtX(x));
    }

    /**
     * The working-day index of the first column boundary at or after the
     * working-day index `days`: `days` itself on a boundary, else the end
     * of the partial column it falls in (an explicit `length:` can end the
     * drawn axis mid-column).
     */
    boundaryAtOrAfter(days: number): number {
        return tickBoundaryAtOrAfter(
            this.startDate,
            days,
            this.unit,
            this.calendar.daysPerUnit(this.unit),
            this.calendar,
        );
    }

    /**
     * The one column a spilled caption past the axis end `axisDays` may
     * run into, as working-day indices: from the boundary at or after the
     * axis end (the end of a partial last column) to the next boundary.
     */
    captionColumn(axisDays: number): { start: number; end: number } {
        const start = this.boundaryAtOrAfter(axisDays);
        return { start, end: this.nextBoundary(start) };
    }

    /**
     * The farthest working-day index a spilled caption past the axis end
     * `axisDays` may reach: the end of the first column after the axis end
     * (`captionColumn`), or further, whole columns at a time, while the
     * overhang past the axis end stays within `CAPTION_OVERHANG_BUDGET_PX`.
     */
    captionLimit(axisDays: number): number {
        const { start, end } = this.captionColumn(axisDays);
        const startX = this.xAt(start);
        let limit = end;
        for (let i = 0; i < MAX_CAPTION_COLUMNS; i++) {
            const next = this.nextBoundary(limit);
            if (next <= limit || this.xAt(next) - startX > CAPTION_OVERHANG_BUDGET_PX) break;
            limit = next;
        }
        return limit;
    }

    /** The column boundary one column after the boundary `days`. */
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
     * most: one full column past the axis end (`captionColumn`). The axis
     * end is the natural one, or the boundary f2 grows it to for this bar
     * when the bar itself runs past it.
     */
    captionCapX(barRightX: number): number {
        const axisDays = this.isPast(barRightX, this.spanDays)
            ? Math.max(this.spanDays, this.boundaryAtOrAfterX(barRightX))
            : this.spanDays;
        return this.xAt(this.captionLimit(axisDays));
    }
}
