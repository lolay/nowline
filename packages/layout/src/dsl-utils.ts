// Tiny DSL utilities shared between `layout.ts` and the per-entity nodes
// under `nodes/`. Kept intentionally trivial and pure: property lookup
// helpers against the AST's `EntityProperty[]` (core's, re-exported) and an
// ISO-date parser and formatter. Anything that needs configuration or
// non-trivial resolution (durations, calendars, styles) stays in the
// modules that own those concerns.

export { propValue, propValues } from '@nowline/core/internal';

export function parseDate(raw: string | undefined): Date | null {
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    return Number.isNaN(d.getTime()) ? null : d;
}

/** A UTC-midnight date as `YYYY-MM-DD`, the inverse of `parseDate`. */
export function formatIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}
