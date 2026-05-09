// WorkingCalendar primitive — strategy interface for non-continuous
// time models (skip weekends, holidays, custom shutdowns). Today the
// rendering pipeline treats time as continuous; the existing
// `CalendarConfig` only changes how `1w` literals expand into days,
// not whether ticks skip weekends. WorkingCalendar establishes the
// API surface for the future weekend/holiday work without making
// `TimeScale` and `ViewPreset` aware of `CalendarConfig` directly.
//
// The default factories `continuousCalendar()` and
// `fromCalendarConfig(cal)` are pass-through: every calendar day is a
// working day, units expand using `CalendarConfig.daysPer*`. Future
// non-continuous calendars override `nextWorkingDay` and `addUnits`
// without changing the consumer surface.

import type { CalendarConfig } from './calendar.js';
import { addDays as addCalendarDays } from './calendar.js';
import type { ScaleUnit } from './view-preset.js';

export interface WorkingCalendar {
    /** Days per `1<unit>` literal (e.g. `1w` → 5 for business). */
    daysPerUnit(unit: ScaleUnit): number;
    /** Move forward by N units (e.g. `addUnits(d, 2, 'weeks')`). */
    addUnits(date: Date, count: number, unit: ScaleUnit): Date;
    /** True when the given date is a working day in this calendar. */
    isWorkingDay(date: Date): boolean;
}

export function fromCalendarConfig(cal: CalendarConfig): WorkingCalendar {
    return {
        daysPerUnit: (unit) => daysPerUnitForCalendar(unit, cal),
        addUnits: (date, count, unit) =>
            addCalendarDays(date, count * daysPerUnitForCalendar(unit, cal)),
        // The continuous model used today treats every calendar day as a
        // working day; non-continuous calendars will override this to
        // implement weekend/holiday skipping when the work lands.
        isWorkingDay: () => true,
    };
}

export function continuousCalendar(): WorkingCalendar {
    return {
        daysPerUnit: (unit) => {
            switch (unit) {
                case 'days':
                    return 1;
                case 'weeks':
                    return 7;
                case 'months':
                    return 30;
                case 'quarters':
                    return 91;
                case 'years':
                    return 365;
            }
        },
        addUnits: (date, count, unit) => {
            const days =
                count *
                (unit === 'days'
                    ? 1
                    : unit === 'weeks'
                      ? 7
                      : unit === 'months'
                        ? 30
                        : unit === 'quarters'
                          ? 91
                          : 365);
            return addCalendarDays(date, days);
        },
        isWorkingDay: () => true,
    };
}

export function daysPerUnit(unit: ScaleUnit, cal: CalendarConfig): number {
    return daysPerUnitForCalendar(unit, cal);
}

function daysPerUnitForCalendar(unit: ScaleUnit, cal: CalendarConfig): number {
    switch (unit) {
        case 'days':
            return 1;
        case 'weeks':
            return cal.daysPerWeek;
        case 'months':
            return cal.daysPerMonth;
        case 'quarters':
            return cal.daysPerQuarter;
        case 'years':
            return cal.daysPerYear;
    }
}
