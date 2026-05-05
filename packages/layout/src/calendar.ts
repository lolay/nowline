// Calendar and duration resolution. A DSL `duration:` is either a raw literal
// (`1d`, `2w`, `3m`, `1q`, `1y`) or a named-duration id that resolves to a
// raw literal through `duration <id> length:<literal>`. The calendar block
// controls how literal units translate into absolute days.

import type { CalendarBlock, SizeDeclaration, NowlineFile } from '@nowline/core';

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

export function resolveDuration(
    value: string | undefined,
    sizes: Map<string, SizeDeclaration>,
    cal: CalendarConfig,
): number {
    if (!value) return 0;
    if (DURATION_RE.test(value)) return literalToDays(value, cal);
    const decl = sizes.get(value);
    if (!decl) return 0;
    // m2 transitional shape: read effort from the size declaration as the item's
    // calendar duration. m5 will introduce capacity-aware derivation
    // (`duration = effort / capacity`); until then, sized items behave as if
    // capacity = 1, which matches every example file's pre-migration semantics.
    const effortProp = decl.properties.find((p) => stripColon(p.key) === 'effort');
    if (!effortProp?.value) return 0;
    return literalToDays(effortProp.value, cal);
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
