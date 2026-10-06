// Task durations in MS Project's `PT<minutes>M0S` form.
//
// The day count is engine C's `ScheduledItem.days` under the file's calendar
// (specs/working-calendar.md §8), so sizes, `capacity:` and `q` match the
// chart. Each working day is 8 hours of the Standard calendar `calendar.ts`
// emits.

const MINUTES_PER_WORKING_DAY = 8 * 60;

/**
 * Working minutes for a task of `days` working days. An item with no
 * duration gets one day: a zero-length task is a milestone in MS Project.
 */
export function workingDaysToMinutes(days: number | undefined): number {
    if (days === undefined || !(days > 0)) return MINUTES_PER_WORKING_DAY;
    return Math.round(days * MINUTES_PER_WORKING_DAY);
}

export function minutesToMsProjDuration(minutes: number): string {
    return `PT${Math.max(0, Math.round(minutes))}M0S`;
}
