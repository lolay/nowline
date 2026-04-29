// Convert Nowline duration tokens into MS Project's `PT...H...M...S` form.
//
// MS Project uses ISO 8601 duration "PT<minutes>M0S" (e.g. `PT480M0S` = 8h)
// for Standard-calendar working time. We resolve every duration to working
// minutes under the calendar emitted by `calendar.ts` (Mon–Fri, 8h/day).
//
// Size buckets resolve the same way as in @nowline/export-mermaid.

const SIZE_BUCKET_DAYS: Readonly<Record<string, number>> = {
    xs: 1,
    sm: 3,
    s: 3,
    md: 5,
    m: 5,
    lg: 10,
    l: 10,
    xl: 15,
};

const NUMERIC_RE = /^(\d+(?:\.\d+)?)\s*(d|w|m|y)?$/i;

const MINUTES_PER_WORKING_DAY = 8 * 60; // Standard calendar
const WORKING_DAYS_PER_WEEK = 5;
const WORKING_DAYS_PER_MONTH = 22;
const WORKING_DAYS_PER_YEAR = 252;

export function durationToMsProjMinutes(literal: string | undefined): number {
    if (!literal) return MINUTES_PER_WORKING_DAY; // 1d default
    const trimmed = literal.trim().toLowerCase();
    if (!trimmed) return MINUTES_PER_WORKING_DAY;
    if (trimmed in SIZE_BUCKET_DAYS) {
        return SIZE_BUCKET_DAYS[trimmed] * MINUTES_PER_WORKING_DAY;
    }
    const match = NUMERIC_RE.exec(trimmed);
    if (!match) return MINUTES_PER_WORKING_DAY;
    const value = Number(match[1]);
    const unit = (match[2] ?? 'd').toLowerCase();
    if (!Number.isFinite(value) || value <= 0) return MINUTES_PER_WORKING_DAY;
    let days = value;
    if (unit === 'w') days = value * WORKING_DAYS_PER_WEEK;
    else if (unit === 'm') days = value * WORKING_DAYS_PER_MONTH;
    else if (unit === 'y') days = value * WORKING_DAYS_PER_YEAR;
    return Math.round(days * MINUTES_PER_WORKING_DAY);
}

export function minutesToMsProjDuration(minutes: number): string {
    return `PT${Math.max(0, Math.round(minutes))}M0S`;
}
