// Calendar and duration resolution. An item's `duration:` is a raw literal
// (`1d`, `2w`, `3m`, `1q`, `1y`); `size:NAME` references a `size NAME
// effort:<literal>` declaration whose effort literal is calendar-resolved
// once into a `ResolvedSize`. The calendar block controls how literal units
// translate into absolute days.

import type { CalendarBlock, EntityProperty, NowlineFile, SizeDeclaration } from '@nowline/core';

import { parseCapacityValue } from './capacity.js';
import { propValue } from './dsl-utils.js';
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
 * resolved day count. Capacity-agnostic — used both for the duration
 * literal lookup in `deriveItemDurationDays` and for the
 * `remaining:` literal normalization in `sequenceItem`. Returns 0 for
 * missing or unresolvable values; callers substitute their own minimum
 * width when the result is zero.
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
 * Derive an item's calendar duration in days from its properties.
 * Precedence (matches specs/dsl.md § "Sizing precedence"):
 *
 *   1. Explicit `duration:LITERAL` wins. The literal IS the calendar
 *      duration the bar paints; `size:NAME` (if also present) collapses
 *      to a pure annotation rendered as the size chip.
 *   2. Otherwise, `size:NAME` resolves to its size declaration's
 *      `effort:` (single-engineer days) and we divide by the item's
 *      capacity (default 1) to get the team's calendar duration.
 *   3. With neither, returns 0 — the validator already errors on items
 *      missing both `size:` and `duration:`, so this only happens in
 *      transient malformed inputs.
 */
export function deriveItemDurationDays(
    props: EntityProperty[],
    sizes: Map<string, ResolvedSize>,
    cal: CalendarConfig,
): number {
    const durationRaw = propValue(props, 'duration');
    if (durationRaw && DURATION_RE.test(durationRaw)) {
        return literalToDays(durationRaw, cal);
    }
    const sizeRef = propValue(props, 'size');
    const size = sizeRef ? sizes.get(sizeRef) : undefined;
    if (!size) return 0;
    const capacity = parseCapacityValue(propValue(props, 'capacity')) ?? 1;
    return size.effortDays / capacity;
}

/**
 * Total work for the item in single-engineer days. Used to normalize a
 * literal `remaining:` value (also single-engineer days per spec) into a
 * 0..1 progress fraction.
 *
 *   - sized: `size.effortDays` directly (already per-engineer).
 *   - duration-literal'd: `duration_days × capacity`. The literal sets
 *     calendar duration; multiplying by the engineer count recovers the
 *     equivalent single-engineer effort the lane is consuming.
 *
 * Returns 0 when neither `size:` nor `duration:` is set so callers can
 * skip normalization safely.
 */
export function deriveTotalEffortDays(
    props: EntityProperty[],
    sizes: Map<string, ResolvedSize>,
    cal: CalendarConfig,
): number {
    const sizeRef = propValue(props, 'size');
    const size = sizeRef ? sizes.get(sizeRef) : undefined;
    if (size) return size.effortDays;
    const durationRaw = propValue(props, 'duration');
    if (durationRaw && DURATION_RE.test(durationRaw)) {
        const capacity = parseCapacityValue(propValue(props, 'capacity')) ?? 1;
        return literalToDays(durationRaw, cal) * capacity;
    }
    return 0;
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
