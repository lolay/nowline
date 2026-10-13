// Tiny DSL utilities shared between `layout.ts` and the per-entity nodes
// under `nodes/`. Kept intentionally trivial and pure: core's property
// lookups and strict ISO-date parser, re-exported, and a date formatter.
// Anything that needs configuration or non-trivial resolution (durations,
// calendars, styles) stays in the modules that own those concerns.

export { parseIsoDate, propValue, propValues } from '@nowline/core/internal';

/** A UTC-midnight date as `YYYY-MM-DD`, the inverse of `parseIsoDate`. */
export function formatIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}
