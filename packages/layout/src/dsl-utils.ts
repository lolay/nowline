// Tiny DSL utilities shared between `layout.ts` and the per-entity nodes
// under `nodes/`. Kept intentionally trivial and pure: a `:`-trim,
// property lookup helpers against the AST's `EntityProperty[]`, and an
// ISO-date parser. Anything that needs configuration or non-trivial
// resolution (durations, calendars, styles) stays in the modules that
// own those concerns.

import type { EntityProperty } from '@nowline/core';

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

export function propValue(props: EntityProperty[], key: string): string | undefined {
    return props.find((p) => stripColon(p.key) === key)?.value;
}

export function propValues(props: EntityProperty[], key: string): string[] {
    const p = props.find((x) => stripColon(x.key) === key);
    if (!p) return [];
    return p.value !== undefined ? [p.value] : [...p.values];
}

export function parseDate(raw: string | undefined): Date | null {
    if (!raw) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    return Number.isNaN(d.getTime()) ? null : d;
}
