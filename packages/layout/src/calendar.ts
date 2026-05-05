// Calendar and duration resolution. An item's `duration:` is a raw literal
// (`1d`, `2w`, `3m`, `1q`, `1y`); `size:NAME` references a `size NAME
// effort:<literal>` declaration whose effort literal is calendar-resolved
// once into a `ResolvedSize`. The calendar block controls how literal units
// translate into absolute days.

import type { CalendarBlock, NowlineFile, SizeDeclaration } from '@nowline/core';

import type { ResolvedSize } from './types.js';

export type CalendarMode = 'business' | 'full' | 'custom';

export interface CalendarConfig {
    mode: CalendarMode;
    daysPerWeek: number;
    daysPerMonth: number;
    daysPerQuarter: number;
    daysPerYear: number;
}

const BUSINESS: CalendarConfig = {
    mode: 'business',
    daysPerWeek: 5,
    daysPerMonth: 22,
    daysPerQuarter: 65,
    daysPerYear: 260,
};

const FULL: CalendarConfig = {
    mode: 'full',
    daysPerWeek: 7,
    daysPerMonth: 30,
    daysPerQuarter: 91,
    daysPerYear: 365,
};

export function resolveCalendar(
    file: NowlineFile,
    customBlock: CalendarBlock | undefined,
): CalendarConfig {
    const calProp = file.roadmapDecl?.properties.find(
        (p) => stripColon(p.key) === 'calendar',
    );
    const mode: CalendarMode = (calProp?.value as CalendarMode) ?? 'business';
    if (mode === 'business') return { ...BUSINESS };
    if (mode === 'full') return { ...FULL };
    if (customBlock) {
        const get = (key: string, fallback: number): number => {
            const p = customBlock.properties.find((x) => stripColon(x.key) === key);
            const n = p ? parseInt(p.value, 10) : NaN;
            return Number.isFinite(n) && n > 0 ? n : fallback;
        };
        return {
            mode: 'custom',
            daysPerWeek: get('days-per-week', BUSINESS.daysPerWeek),
            daysPerMonth: get('days-per-month', BUSINESS.daysPerMonth),
            daysPerQuarter: get('days-per-quarter', BUSINESS.daysPerQuarter),
            daysPerYear: get('days-per-year', BUSINESS.daysPerYear),
        };
    }
    return { ...BUSINESS };
}

// Decimal-aware so `size xs effort:0.5d` and `duration:1.5w` round-trip cleanly.
const DURATION_RE = /^(\d+(?:\.\d+)?)([dwmqy])$/;

export function literalToDays(literal: string, cal: CalendarConfig): number {
    const m = DURATION_RE.exec(literal);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    switch (m[2]) {
        case 'd':
            return n;
        case 'w':
            return n * cal.daysPerWeek;
        case 'm':
            return n * cal.daysPerMonth;
        case 'q':
            return n * cal.daysPerQuarter;
        case 'y':
            return n * cal.daysPerYear;
        default:
            return 0;
    }
}

/**
 * Convert a `duration:` literal or a `size:NAME` reference into a calendar-
 * resolved day count. Returns 0 for missing or unresolvable values; callers
 * substitute their own minimum width when the result is zero. Stays
 * capacity-agnostic so the same helper serves both literal-and-effort
 * lookups; the m5 capacity-aware derivation lives at the call site so
 * `duration:` literal overrides are honored.
 */
export function resolveDuration(
    value: string | undefined,
    sizes: Map<string, ResolvedSize>,
    cal: CalendarConfig,
): number {
    if (!value) return 0;
    if (DURATION_RE.test(value)) return literalToDays(value, cal);
    return sizes.get(value)?.effortDays ?? 0;
}

/**
 * Build the layout's `Map<string, ResolvedSize>` once the calendar is
 * known. Skips sizes whose `effort:` literal is missing or unparseable —
 * the validator already errors on those, so layout silently drops them
 * rather than emitting NaN-laden positions.
 */
export function resolveSizes(
    decls: Map<string, SizeDeclaration>,
    cal: CalendarConfig,
): Map<string, ResolvedSize> {
    const out = new Map<string, ResolvedSize>();
    for (const [name, decl] of decls) {
        const effortProp = decl.properties.find((p) => stripColon(p.key) === 'effort');
        const effortLiteral = effortProp?.value;
        if (!effortLiteral) continue;
        const effortDays = literalToDays(effortLiteral, cal);
        if (effortDays <= 0) continue;
        out.set(name, { name, effortDays, effortLiteral });
    }
    return out;
}

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

// Date arithmetic in day units. All coordinates are relative to the roadmap
// start date; today is computed in days since start.
export function daysBetween(from: Date, to: Date): number {
    const ONE_DAY = 86400 * 1000;
    return Math.round((to.getTime() - from.getTime()) / ONE_DAY);
}

export function addDays(base: Date, days: number): Date {
    const out = new Date(base.getTime());
    out.setUTCDate(out.getUTCDate() + days);
    return out;
}
