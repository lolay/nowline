// WorkingCalendar primitives (m2p phase 1): rule precedence, the working-day
// index <-> date functions, non-working runs and the identity path. Every
// expectation is either a worked example from the spec (§10 of
// working-calendar.md) or checked against an independent day-by-day
// reference (`refWorking`) that shares no code with the implementation.

import { describe, expect, it } from 'vitest';
import { addDays, type CalendarConfig, daysBetween, resolveCalendar } from '../src/calendar.js';
import {
    type CalendarRule,
    continuousCalendar,
    fromCalendarConfig,
    type NonWorkingRun,
    presetRules,
    type WorkingCalendar,
} from '../src/working-calendar.js';
import { parseAndResolve } from './helpers.js';

const businessCal: CalendarConfig = {
    mode: 'business',
    daysPerWeek: 5,
    daysPerMonth: 22,
    daysPerQuarter: 65,
    daysPerYear: 260,
};

const fullCal: CalendarConfig = {
    mode: 'full',
    daysPerWeek: 7,
    daysPerMonth: 30,
    daysPerQuarter: 91,
    daysPerYear: 365,
};

const customCal: CalendarConfig = {
    mode: 'custom',
    daysPerWeek: 6,
    daysPerMonth: 26,
    daysPerQuarter: 78,
    daysPerYear: 312,
};

const DAY_MS = 86400 * 1000;
const SUN = 0;
const MON = 1;
const TUE = 2;
const THU = 4;
const FRI = 5;
const SAT = 6;
const PX_PER_DAY = 8;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const days = (...weekdays: number[]) => new Set(weekdays);
const ALL_WEEKDAYS = [SUN, MON, TUE, 3, THU, FRI, SAT];

/** `YYYY-MM-DD` for a date inside 0000-9999; used for readable assertions only. */
const ymd = (date: Date) => date.toISOString().slice(0, 10);

const businessWith = (...extra: CalendarRule[]) =>
    fromCalendarConfig(businessCal, [...presetRules('business'), ...extra]);

const run = (
    from: Date,
    through: Date,
    titles: string[] = [],
): { from: Date; through: Date; titles: string[] } => ({ from, through, titles });

// ---------------------------------------------------------------------------
// Rule fixtures shared by the scenario tests and the brute-force sweep.
// ---------------------------------------------------------------------------

/** The maintainer's case: six-day weeks through March 2026. */
const crunchRule: CalendarRule = {
    working: true,
    every: days(SAT),
    start: utc(2026, 3, 2),
    end: utc(2026, 3, 29),
    id: 'crunch',
    title: 'Six-day weeks',
};
const mar14Holiday: CalendarRule = { working: false, dates: [utc(2026, 3, 14)] };
const summerFridays: CalendarRule = {
    working: false,
    every: days(FRI),
    start: utc(2026, 6, 1),
    end: utc(2026, 8, 31),
};
const workingSummerFriday: CalendarRule = { working: true, dates: [utc(2026, 7, 10)] };
const workingWeekend: CalendarRule = {
    working: true,
    start: utc(2026, 4, 4),
    end: utc(2026, 4, 5),
};
const equalConflictRules: CalendarRule[] = [
    { working: true, dates: [utc(2026, 6, 10)] },
    { working: false, dates: [utc(2026, 6, 10)] },
];
const overlappingWindowRules: CalendarRule[] = [
    { working: true, every: days(FRI, SAT), start: utc(2026, 5, 1), end: utc(2026, 6, 30) },
    summerFridays,
    { working: false, start: utc(2026, 6, 5), end: utc(2026, 6, 8) },
    { working: true, dates: [utc(2026, 6, 6)] },
];
const openWorkingSaturdays: CalendarRule = { working: true, every: days(SAT) };
const shutdownRule: CalendarRule = {
    working: false,
    every: days(...ALL_WEEKDAYS),
    start: utc(2026, 8, 3),
    end: utc(2026, 8, 14),
};
const openBoundedRules: CalendarRule[] = [
    { working: true, every: days(SAT), start: utc(2026, 3, 30) },
    { working: false, every: days(MON), end: utc(2026, 2, 1) },
];
const holidayRules: CalendarRule[] = [
    { working: false, dates: [utc(2026, 1, 1)], title: "New Year's Day" },
    { working: false, dates: [utc(2026, 1, 19)], title: 'MLK Day' },
    { working: false, dates: [utc(2026, 7, 4)], title: 'Independence Day' },
    { working: false, start: utc(2026, 11, 26), end: utc(2026, 11, 27), title: 'Thanksgiving' },
    { working: false, start: utc(2026, 12, 24), end: utc(2027, 1, 1), title: 'Shutdown' },
    { working: false, dates: [utc(2027, 1, 1)], title: "New Year's Day 2027" },
    { working: false, start: utc(2027, 3, 15), end: utc(2027, 3, 19), title: 'Closure' },
    { working: false, dates: [utc(2027, 3, 22)], title: 'Bridge day' },
    { working: false, start: utc(2027, 5, 29), end: utc(2027, 5, 31), title: 'Memorial Day' },
];

// ---------------------------------------------------------------------------
// Independent reference: one day at a time, straight from the precedence rule.
// ---------------------------------------------------------------------------

function isDatedRule(rule: CalendarRule): boolean {
    return (
        rule.dates !== undefined ||
        (rule.start !== undefined && rule.end !== undefined && rule.every === undefined)
    );
}

function ruleCovers(rule: CalendarRule, date: Date): boolean {
    const time = date.getTime();
    if (rule.dates) return rule.dates.some((d) => d.getTime() === time);
    if (rule.every && !rule.every.has(date.getUTCDay())) return false;
    if (rule.start && time < rule.start.getTime()) return false;
    if (rule.end && time > rule.end.getTime()) return false;
    return true;
}

/** Dated beats bounded recurrence beats the open-ended week; `working` wins ties. */
function refWorking(rules: ReadonlyArray<CalendarRule>, date: Date): boolean {
    const covering = rules.filter((r) => ruleCovers(r, date));
    const dated = covering.filter(isDatedRule);
    if (dated.length > 0) return dated.some((r) => r.working);
    const bounded = covering.filter((r) => r.every && (r.start || r.end));
    if (bounded.length > 0) return bounded.some((r) => r.working);
    const open = covering.filter((r) => r.every && !r.start && !r.end);
    if (open.length > 0) return open.some((r) => r.working);
    return true;
}

const REF_FROM = utc(2022, 1, 1);
const REF_TO = utc(2032, 1, 1);

interface Reference {
    isWorking(date: Date): boolean;
    /** Working days in [base, date), counting from the first working day at or after `date`. */
    indexOf(base: Date, date: Date): number;
    /** The working day whose index from `base` is `k`. */
    dateAt(base: Date, k: number): number;
    nextWorking(date: Date): number;
    runs(from: Date, to: Date): Array<[number, number]>;
}

function buildReference(rules: ReadonlyArray<CalendarRule>): Reference {
    const first = REF_FROM.getTime();
    const count = Math.round((REF_TO.getTime() - first) / DAY_MS);
    const working: boolean[] = [];
    const prefix: number[] = [0];
    const workingTimes: number[] = [];
    for (let i = 0; i < count; i++) {
        const date = new Date(first + i * DAY_MS);
        const isWorking = refWorking(rules, date);
        working.push(isWorking);
        prefix.push(prefix[i] + (isWorking ? 1 : 0));
        if (isWorking) workingTimes.push(date.getTime());
    }
    const offsetOf = (date: Date) => Math.round((date.getTime() - first) / DAY_MS);
    const nextOffset = (date: Date) => {
        let offset = offsetOf(date);
        while (!working[offset]) offset++;
        return offset;
    };
    const allRuns: Array<[number, number]> = [];
    let open = -1;
    for (let i = 0; i < count; i++) {
        if (!working[i] && open < 0) open = i;
        if (working[i] && open >= 0) {
            allRuns.push([open, i - 1]);
            open = -1;
        }
    }
    return {
        isWorking: (date) => working[offsetOf(date)],
        indexOf: (base, date) => prefix[nextOffset(date)] - prefix[offsetOf(base)],
        dateAt: (base, k) => workingTimes[prefix[offsetOf(base)] + k],
        nextWorking: (date) => first + nextOffset(date) * DAY_MS,
        runs: (from, to) =>
            allRuns
                .filter(([start, through]) => start < offsetOf(to) && through >= offsetOf(from))
                .map(([start, through]): [number, number] => [
                    first + start * DAY_MS,
                    first + through * DAY_MS,
                ]),
    };
}

/** Every UTC midnight in [from, through], inclusive. */
function eachDay(from: Date, through: Date): Date[] {
    const out: Date[] = [];
    for (let t = from.getTime(); t <= through.getTime(); t += DAY_MS) out.push(new Date(t));
    return out;
}

const CHECK_FROM = utc(2026, 1, 1);
const CHECK_TO = utc(2028, 12, 31);

const FIXED_BASES = [
    utc(2026, 1, 5), // Monday
    utc(2026, 1, 3), // Saturday
    utc(2026, 3, 7), // Saturday inside the crunch window
    utc(2026, 3, 14), // Saturday, the Mar 14 holiday
    utc(2026, 6, 5), // Friday inside summer Fridays
    utc(2026, 8, 10), // Monday inside the shutdown
    utc(2027, 1, 1), // Friday
];

/** The day before, first day, last day and day after every rule's span, plus the fixed bases. */
function sweepBases(rules: ReadonlyArray<CalendarRule>): Date[] {
    const times = new Set<number>(FIXED_BASES.map((d) => d.getTime()));
    const edges = (date: Date) => {
        for (const delta of [-1, 0, 1]) times.add(date.getTime() + delta * DAY_MS);
    };
    for (const rule of rules) {
        if (rule.start) edges(rule.start);
        if (rule.end) edges(rule.end);
        for (const d of rule.dates ?? []) edges(d);
    }
    return [...times].sort((a, b) => a - b).map((t) => new Date(t));
}

const fmtTime = (time: number) => (Number.isNaN(time) ? 'Invalid' : ymd(new Date(time)));

/** Compare a calendar against the reference; returns the first few disagreements. */
function bruteForceMismatches(rules: ReadonlyArray<CalendarRule>): string[] {
    const cal = fromCalendarConfig(businessCal, rules);
    const ref = buildReference(rules);
    const out: string[] = [];
    const note = (message: string) => {
        if (out.length < 12) out.push(message);
    };
    const dates = eachDay(CHECK_FROM, CHECK_TO);

    for (const date of dates) {
        if (cal.isWorkingDay(date) !== ref.isWorking(date)) {
            note(`isWorkingDay(${ymd(date)}) expected ${ref.isWorking(date)}`);
        }
    }

    for (const base of sweepBases(rules)) {
        for (const date of dates) {
            const expected = ref.indexOf(base, date);
            const actual = cal.workingIndexOf(base, date);
            if (!Object.is(actual, expected)) {
                note(
                    `workingIndexOf(${ymd(base)}, ${ymd(date)}) = ${actual}, expected ${expected}`,
                );
            }
            const snapped = cal.dateAtWorkingIndex(base, actual).getTime();
            if (snapped !== ref.nextWorking(date)) {
                note(
                    `dateAtWorkingIndex(${ymd(base)}, index of ${ymd(date)}) = ${fmtTime(snapped)}, ` +
                        `expected ${fmtTime(ref.nextWorking(date))}`,
                );
            }
        }
        for (let k = -400; k <= 600; k++) {
            const expected = ref.dateAt(base, k);
            const actual = cal.dateAtWorkingIndex(base, k);
            if (actual.getTime() !== expected) {
                note(
                    `dateAtWorkingIndex(${ymd(base)}, ${k}) = ${fmtTime(actual.getTime())}, ` +
                        `expected ${fmtTime(expected)}`,
                );
                continue;
            }
            const back = cal.workingIndexOf(base, actual);
            if (!Object.is(back, k)) {
                note(`workingIndexOf(${ymd(base)}, ${ymd(actual)}) = ${back}, expected ${k}`);
            }
        }
    }

    for (let offset = 0; ; offset += 11) {
        const from = new Date(CHECK_FROM.getTime() + offset * DAY_MS);
        if (from.getTime() > CHECK_TO.getTime()) break;
        for (const length of [1, 3, 9, 40]) {
            const to = new Date(from.getTime() + length * DAY_MS);
            const expected = ref.runs(from, to);
            const actual = cal
                .nonWorkingRuns(from, to)
                .map((r): [number, number] => [r.from.getTime(), r.through.getTime()]);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                note(
                    `nonWorkingRuns(${ymd(from)}, ${ymd(to)}) = ${JSON.stringify(
                        actual.map(([a, b]) => [fmtTime(a), fmtTime(b)]),
                    )}, expected ${JSON.stringify(expected.map(([a, b]) => [fmtTime(a), fmtTime(b)]))}`,
                );
            }
        }
    }
    return out;
}

/** A compact signature of how a calendar treats every 2026 date; equal calendars match. */
function fingerprint(cal: WorkingCalendar): string {
    const base = utc(2026, 1, 5);
    return eachDay(utc(2026, 1, 1), utc(2026, 12, 31))
        .map((d) => `${cal.isWorkingDay(d) ? 1 : 0}:${cal.workingIndexOf(base, d)}`)
        .join(',');
}

function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    );
}

// ---------------------------------------------------------------------------
// Identity: with no non-working day every answer matches daysBetween / addDays.
// ---------------------------------------------------------------------------

const IDENTITY_BASES = [utc(2026, 1, 5), utc(2026, 1, 3), utc(2026, 3, 1), utc(2025, 12, 31)];
const FRACTIONS = [0.25, 0.5, 2.5, 6.75, -0.5, -1.5, -2.5];

function identityMismatches(cal: WorkingCalendar): string[] {
    const out: string[] = [];
    const note = (message: string) => {
        if (out.length < 12) out.push(message);
    };
    for (const base of IDENTITY_BASES) {
        for (let offset = -400; offset <= 1100; offset++) {
            const date = addDays(base, offset);
            const expectedIndex = daysBetween(base, date);
            const actualIndex = cal.workingIndexOf(base, date);
            if (!Object.is(actualIndex, expectedIndex)) {
                note(`workingIndexOf(${ymd(base)}, +${offset}) = ${actualIndex}`);
            }
            const actualDate = cal.dateAtWorkingIndex(base, offset).getTime();
            if (actualDate !== date.getTime()) {
                note(`dateAtWorkingIndex(${ymd(base)}, ${offset}) = ${fmtTime(actualDate)}`);
            }
        }
        for (const fraction of FRACTIONS) {
            const actual = cal.dateAtWorkingIndex(base, fraction).getTime();
            const expected = addDays(base, fraction).getTime();
            if (actual !== expected) {
                note(
                    `dateAtWorkingIndex(${ymd(base)}, ${fraction}) = ${fmtTime(actual)}, ` +
                        `addDays gives ${fmtTime(expected)}`,
                );
            }
        }
    }
    return out;
}

describe('working calendar identity (no non-working days)', () => {
    const cases: Array<[string, () => WorkingCalendar]> = [
        ['calendar:full', () => fromCalendarConfig(fullCal)],
        ['calendar:custom', () => fromCalendarConfig(customCal)],
        ['business with an empty rule list', () => fromCalendarConfig(businessCal, [])],
        ['continuousCalendar()', () => continuousCalendar()],
    ];

    it.each(cases)(
        '%s matches daysBetween and addDays for integer and fractional indices',
        (_n, make) => {
            expect(identityMismatches(make())).toEqual([]);
        },
    );

    it.each(cases)('%s reports no non-working days and no week start', (_n, make) => {
        const cal = make();
        expect(cal.hasNonWorkingDays).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 1, 10))).toBe(true);
        expect(cal.nonWorkingRuns(utc(2026, 1, 1), utc(2026, 12, 31))).toEqual([]);
        expect(cal.weekStart).toBeUndefined();
    });

    it('pins addDays quirk for a negative fraction from March 1', () => {
        const cal = fromCalendarConfig(fullCal);
        expect(ymd(cal.dateAtWorkingIndex(utc(2026, 3, 1), -1.5))).toBe('2026-02-28');
        expect(ymd(addDays(utc(2026, 3, 1), -1.5))).toBe('2026-02-28');
    });
});

describe('working calendar general path forced by a far-away holiday', () => {
    const cal = fromCalendarConfig(fullCal, [
        { working: false, dates: [new Date(Date.UTC(1700, 0, 1))] },
    ]);

    it('has non-working days even though none falls near 2026', () => {
        expect(cal.hasNonWorkingDays).toBe(true);
    });

    it('still equals daysBetween and addDays for integer and non-negative fractional indices', () => {
        const mismatches: string[] = [];
        for (const base of IDENTITY_BASES) {
            for (let offset = 0; offset <= 1100; offset++) {
                const date = addDays(base, offset);
                if (!Object.is(cal.workingIndexOf(base, date), daysBetween(base, date))) {
                    mismatches.push(`index ${ymd(base)} +${offset}`);
                }
                if (cal.dateAtWorkingIndex(base, offset).getTime() !== date.getTime()) {
                    mismatches.push(`date ${ymd(base)} +${offset}`);
                }
            }
            for (const fraction of FRACTIONS.filter((f) => f >= 0)) {
                const actual = cal.dateAtWorkingIndex(base, fraction).getTime();
                if (actual !== addDays(base, fraction).getTime()) {
                    mismatches.push(`fraction ${ymd(base)} ${fraction}`);
                }
            }
        }
        expect(mismatches.slice(0, 8)).toEqual([]);
    });

    it('floors a negative fraction where addDays truncates toward the month start', () => {
        expect(ymd(cal.dateAtWorkingIndex(utc(2026, 3, 1), -1.5))).toBe('2026-02-27');
        expect(ymd(addDays(utc(2026, 3, 1), -1.5))).toBe('2026-02-28');
    });
});

// ---------------------------------------------------------------------------
// The business week.
// ---------------------------------------------------------------------------

describe('business calendar', () => {
    const cal = fromCalendarConfig(businessCal);
    const base = utc(2026, 1, 5); // Monday

    it('presets the weekend as a titled open-ended non-working rule', () => {
        const rules = presetRules('business');
        expect(rules).toHaveLength(1);
        expect(rules[0].working).toBe(false);
        expect([...(rules[0].every ?? [])].sort()).toEqual([SUN, SAT]);
        expect(rules[0].id).toBe('weekend');
        expect(rules[0].title).toBe('Weekend');
        expect(rules[0].dates).toBeUndefined();
        expect(rules[0].start).toBeUndefined();
        expect(rules[0].end).toBeUndefined();
    });

    it('presets nothing for full and custom, and returns a fresh array each call', () => {
        expect(presetRules('full')).toEqual([]);
        expect(presetRules('custom')).toEqual([]);
        expect(presetRules('business')).not.toBe(presetRules('business'));
    });

    it('exposes the preset weekend as its normalized rules', () => {
        expect(cal.rules).toHaveLength(1);
        expect(cal.rules[0].id).toBe('weekend');
        expect(cal.hasNonWorkingDays).toBe(true);
    });

    it('numbers Monday through Friday 0 to 4 and lets the weekend share Monday', () => {
        const indices = [5, 6, 7, 8, 9, 10, 11, 12].map((d) =>
            cal.workingIndexOf(base, utc(2026, 1, d)),
        );
        expect(indices).toEqual([0, 1, 2, 3, 4, 5, 5, 5]);
    });

    it('counts backward before the base without returning negative zero', () => {
        expect(cal.workingIndexOf(base, utc(2026, 1, 4))).toBe(0);
        expect(Object.is(cal.workingIndexOf(base, utc(2026, 1, 4)), 0)).toBe(true);
        expect(Object.is(cal.workingIndexOf(base, utc(2026, 1, 3)), 0)).toBe(true);
        expect(cal.workingIndexOf(base, utc(2026, 1, 2))).toBe(-1);
    });

    it('maps working indices back to dates, flooring fractions', () => {
        expect(ymd(cal.dateAtWorkingIndex(base, 20))).toBe('2026-02-02');
        expect(ymd(cal.dateAtWorkingIndex(base, 4.5))).toBe('2026-01-09');
        expect(ymd(cal.dateAtWorkingIndex(base, -0.5))).toBe('2026-01-02');
    });

    it('treats a Saturday base as the following Monday for index 0', () => {
        const saturday = utc(2026, 1, 3);
        expect(ymd(cal.dateAtWorkingIndex(saturday, 0))).toBe('2026-01-05');
        expect(ymd(cal.dateAtWorkingIndex(saturday, -1))).toBe('2026-01-02');
    });

    it('answers isWorkingDay from the weekday', () => {
        expect(cal.isWorkingDay(utc(2026, 1, 9))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 1, 10))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 1, 11))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 1, 12))).toBe(true);
    });

    it('lists four weekends between 2026-01-05 and 2026-02-02', () => {
        expect(cal.nonWorkingRuns(utc(2026, 1, 5), utc(2026, 2, 2))).toEqual([
            run(utc(2026, 1, 10), utc(2026, 1, 11)),
            run(utc(2026, 1, 17), utc(2026, 1, 18)),
            run(utc(2026, 1, 24), utc(2026, 1, 25)),
            run(utc(2026, 1, 31), utc(2026, 2, 1)),
        ]);
    });

    it('starts weeks on Monday', () => {
        expect(cal.weekStart).toBe(1);
    });

    it('keeps the calendar-day unit lengths per preset', () => {
        const unitsOf = (c: WorkingCalendar) =>
            (['days', 'weeks', 'months', 'quarters', 'years'] as const).map((u) =>
                c.daysPerUnit(u),
            );
        expect(unitsOf(cal)).toEqual([1, 5, 22, 65, 260]);
        expect(unitsOf(fromCalendarConfig(fullCal))).toEqual([1, 7, 30, 91, 365]);
        expect(unitsOf(fromCalendarConfig(customCal))).toEqual([1, 6, 26, 78, 312]);
        expect(unitsOf(continuousCalendar())).toEqual([1, 7, 30, 91, 365]);
    });

    it('advances addUnits in working days for business', () => {
        expect(ymd(cal.addUnits(utc(2026, 1, 5), 1, 'weeks'))).toBe('2026-01-12');
        expect(ymd(cal.addUnits(utc(2026, 1, 8), 2, 'days'))).toBe('2026-01-12');
        expect(ymd(cal.addUnits(utc(2026, 1, 10), 0, 'days'))).toBe('2026-01-12');
    });

    it('advances addUnits in calendar days for full, custom and continuous', () => {
        const full = fromCalendarConfig(fullCal);
        expect(ymd(full.addUnits(utc(2026, 1, 5), 1, 'weeks'))).toBe('2026-01-12');
        expect(full.addUnits(utc(2026, 1, 5), 1, 'months').getTime()).toBe(
            addDays(utc(2026, 1, 5), 30).getTime(),
        );
        const custom = fromCalendarConfig(customCal);
        expect(custom.addUnits(utc(2026, 1, 5), 2, 'weeks').getTime()).toBe(
            addDays(utc(2026, 1, 5), 12).getTime(),
        );
        expect(ymd(continuousCalendar().addUnits(utc(2026, 1, 5), 2, 'weeks'))).toBe('2026-01-19');
        expect(ymd(continuousCalendar().addUnits(utc(2026, 1, 5), 1, 'quarters'))).toBe(
            '2026-04-06',
        );
    });
});

// ---------------------------------------------------------------------------
// weekStart.
// ---------------------------------------------------------------------------

describe('weekStart', () => {
    const weekStartOf = (...weekdays: number[]) =>
        fromCalendarConfig(businessCal, [{ working: false, every: days(...weekdays) }]).weekStart;

    it('is the first working weekday after the longest recurring non-working run', () => {
        expect(weekStartOf(SAT, SUN)).toBe(1);
        expect(weekStartOf(FRI, SAT)).toBe(0);
        expect(weekStartOf(SAT, SUN, MON)).toBe(2);
    });

    it('breaks a tie toward the earliest resulting week start in Sunday-first order', () => {
        expect(weekStartOf(TUE, SAT)).toBe(0);
    });

    it('is undefined when no open-ended non-working day exists', () => {
        expect(fromCalendarConfig(fullCal).weekStart).toBeUndefined();
        expect(
            fromCalendarConfig(businessCal, [
                { working: false, every: days(SAT, SUN), end: utc(2026, 3, 1) },
                { working: false, dates: [utc(2026, 12, 25)] },
            ]).weekStart,
        ).toBeUndefined();
    });

    it('ignores weekdays that an open-ended working rule overrides', () => {
        const cal = businessWith(openWorkingSaturdays);
        expect(cal.weekStart).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// The maintainer's use case.
// ---------------------------------------------------------------------------

describe('six-day weeks through March (working Saturdays over the preset weekend)', () => {
    const crunch = businessWith(crunchRule);
    const monday = utc(2026, 1, 5);

    const weekWidth = (cal: WorkingCalendar, weekMonday: Date) =>
        (cal.workingIndexOf(monday, addDays(weekMonday, 7)) -
            cal.workingIndexOf(monday, weekMonday)) *
        PX_PER_DAY;

    it('works Saturdays inside the window and never Sundays', () => {
        for (const d of [7, 14, 21, 28]) expect(crunch.isWorkingDay(utc(2026, 3, d))).toBe(true);
        for (const d of [1, 8, 15, 22, 29])
            expect(crunch.isWorkingDay(utc(2026, 3, d))).toBe(false);
        expect(crunch.isWorkingDay(utc(2026, 2, 28))).toBe(false);
        expect(crunch.isWorkingDay(utc(2026, 4, 4))).toBe(false);
    });

    it('widens the weeks inside the window to 48 px and leaves the others at 40 px', () => {
        const mondays = [
            utc(2026, 2, 23),
            utc(2026, 3, 2),
            utc(2026, 3, 9),
            utc(2026, 3, 16),
            utc(2026, 3, 23),
            utc(2026, 3, 30),
        ];
        expect(mondays.map((m) => weekWidth(crunch, m))).toEqual([40, 48, 48, 48, 48, 40]);
    });

    it('finishes four chained one-week items earlier inside the window', () => {
        const chain = (cal: WorkingCalendar) => {
            let cursor = utc(2026, 3, 2);
            let last = cursor;
            for (let item = 0; item < 4; item++) {
                last = cal.dateAtWorkingIndex(cursor, 4);
                cursor = cal.dateAtWorkingIndex(cursor, 5);
            }
            return last;
        };
        expect(ymd(chain(crunch))).toBe('2026-03-24');
        expect(ymd(chain(businessWith()))).toBe('2026-03-27');
        expect(ymd(crunch.dateAtWorkingIndex(utc(2026, 3, 2), 19))).toBe('2026-03-24');
    });

    it('keeps a dated holiday non-working even on a working Saturday', () => {
        const withHoliday = businessWith(crunchRule, mar14Holiday);
        expect(withHoliday.isWorkingDay(utc(2026, 3, 14))).toBe(false);
        expect(withHoliday.isWorkingDay(utc(2026, 3, 21))).toBe(true);
        expect(weekWidth(withHoliday, utc(2026, 3, 9))).toBe(40);
        expect(weekWidth(withHoliday, utc(2026, 3, 16))).toBe(48);
    });

    it('is the same calendar as three tiled recurrence entries', () => {
        const tiled = fromCalendarConfig(businessCal, [
            { working: false, every: days(SUN, SAT), end: utc(2026, 3, 1) },
            { working: false, every: days(SUN), start: utc(2026, 3, 2), end: utc(2026, 3, 29) },
            { working: false, every: days(SUN, SAT), start: utc(2026, 3, 30) },
        ]);
        const mismatches: string[] = [];
        for (const d of eachDay(utc(2025, 1, 1), utc(2027, 12, 31))) {
            if (tiled.isWorkingDay(d) !== crunch.isWorkingDay(d)) {
                mismatches.push(`isWorkingDay ${ymd(d)}`);
            }
            if (tiled.workingIndexOf(monday, d) !== crunch.workingIndexOf(monday, d)) {
                mismatches.push(`workingIndexOf ${ymd(d)}`);
            }
        }
        for (let k = -300; k <= 700; k++) {
            if (
                tiled.dateAtWorkingIndex(monday, k).getTime() !==
                crunch.dateAtWorkingIndex(monday, k).getTime()
            ) {
                mismatches.push(`dateAtWorkingIndex ${k}`);
            }
        }
        expect(mismatches.slice(0, 8)).toEqual([]);
        expect(tiled.weekStart).toBeUndefined();
    });

    it('does not change the calendar when the rules are declared in a different order', () => {
        const reference = fingerprint(crunch);
        const reordered = fromCalendarConfig(businessCal, [crunchRule, ...presetRules('business')]);
        expect(fingerprint(reordered)).toBe(reference);
    });
});

describe('titled runs from dated rules', () => {
    it('forms one run with its title once from a dates list spanning a weekend', () => {
        const cal = businessWith({
            working: false,
            dates: [utc(2026, 12, 24), utc(2026, 12, 25)],
            id: 'christmas',
            title: 'Christmas',
        });
        expect(cal.nonWorkingRuns(utc(2026, 12, 21), utc(2026, 12, 31))).toEqual([
            run(utc(2026, 12, 24), utc(2026, 12, 27), ['Christmas']),
        ]);
    });

    it('merges a Friday and a Monday holiday with the weekend into one run with both titles', () => {
        const cal = businessWith(
            { dates: [utc(2026, 7, 3)], title: 'Independence Day (observed)', working: false },
            { dates: [utc(2026, 7, 6)], title: 'Bridge day', working: false },
        );
        expect(cal.nonWorkingRuns(utc(2026, 7, 1), utc(2026, 7, 8))).toEqual([
            run(utc(2026, 7, 3), utc(2026, 7, 6), ['Independence Day (observed)', 'Bridge day']),
        ]);
    });

    it('orders titles by start date, then input order', () => {
        const cal = businessWith(
            { working: false, dates: [utc(2026, 7, 6)], title: 'Second' },
            { working: false, dates: [utc(2026, 7, 3)], title: 'First' },
            { working: false, dates: [utc(2026, 7, 3)], title: 'Also first' },
        );
        const [only] = cal.nonWorkingRuns(utc(2026, 7, 3), utc(2026, 7, 4));
        expect(only.titles).toEqual(['First', 'Also first', 'Second']);
    });

    it('does not title a run from the untitled preset weekend', () => {
        const cal = businessWith({ working: false, dates: [utc(2026, 7, 3)], title: 'Holiday' });
        const [only] = cal.nonWorkingRuns(utc(2026, 7, 3), utc(2026, 7, 4));
        expect(only.titles).toEqual(['Holiday']);
    });
});

// ---------------------------------------------------------------------------
// Precedence.
// ---------------------------------------------------------------------------

describe('rule precedence', () => {
    it('lets a dated working Friday punch through bounded summer Fridays', () => {
        const cal = businessWith(summerFridays, workingSummerFriday);
        expect(cal.isWorkingDay(utc(2026, 5, 29))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 6, 1))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 6, 5))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 7, 10))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 7, 17))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 8, 28))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 9, 4))).toBe(true);
    });

    it('lets a dated working weekend beat the preset weekend', () => {
        const cal = businessWith(workingWeekend);
        expect(cal.isWorkingDay(utc(2026, 4, 4))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 4, 5))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 4, 11))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 3, 28))).toBe(false);
    });

    it('lets working win a conflict between equally specific rules, in either order', () => {
        const forward = businessWith(...equalConflictRules);
        const backward = businessWith(...[...equalConflictRules].reverse());
        expect(forward.isWorkingDay(utc(2026, 6, 10))).toBe(true);
        expect(backward.isWorkingDay(utc(2026, 6, 10))).toBe(true);
    });

    it('resolves overlapping bounded windows and dated exceptions', () => {
        const cal = fromCalendarConfig(businessCal, [
            ...presetRules('business'),
            ...overlappingWindowRules,
        ]);
        expect(cal.isWorkingDay(utc(2026, 5, 8))).toBe(true); // Friday, working window only
        expect(cal.isWorkingDay(utc(2026, 5, 9))).toBe(true); // Saturday, working window
        expect(cal.isWorkingDay(utc(2026, 6, 12))).toBe(true); // both windows: working wins
        expect(cal.isWorkingDay(utc(2026, 6, 13))).toBe(true); // Saturday, working window
        expect(cal.isWorkingDay(utc(2026, 6, 5))).toBe(false); // dated non-working beats both
        expect(cal.isWorkingDay(utc(2026, 6, 6))).toBe(true); // dated working beats dated non-working
        expect(cal.isWorkingDay(utc(2026, 6, 8))).toBe(false); // dated non-working Monday
        expect(cal.isWorkingDay(utc(2026, 7, 3))).toBe(false); // summer Friday only
        expect(cal.isWorkingDay(utc(2026, 7, 4))).toBe(false); // weekend again after the window
    });

    it('lets an open-ended working Saturday override part of the weekend everywhere', () => {
        const cal = businessWith(openWorkingSaturdays);
        expect(cal.isWorkingDay(utc(2026, 1, 10))).toBe(true);
        expect(cal.isWorkingDay(utc(2031, 6, 7))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 1, 11))).toBe(false);
        expect(cal.isWorkingDay(utc(2024, 6, 9))).toBe(false);
    });

    it('closes every day inside a bounded shutdown without throwing', () => {
        const cal = businessWith(shutdownRule);
        expect(cal.isWorkingDay(utc(2026, 7, 31))).toBe(true);
        for (const d of eachDay(utc(2026, 8, 3), utc(2026, 8, 14))) {
            expect(cal.isWorkingDay(d)).toBe(false);
        }
        expect(cal.isWorkingDay(utc(2026, 8, 17))).toBe(true);
        expect(cal.nonWorkingRuns(utc(2026, 8, 3), utc(2026, 8, 15))).toEqual([
            run(utc(2026, 8, 1), utc(2026, 8, 16)),
        ]);
        expect(ymd(cal.dateAtWorkingIndex(utc(2026, 7, 31), 1))).toBe('2026-08-17');
    });

    it('handles recurrence windows that are open on one side', () => {
        const cal = fromCalendarConfig(businessCal, [
            ...presetRules('business'),
            ...openBoundedRules,
        ]);
        expect(cal.isWorkingDay(utc(2026, 3, 28))).toBe(false); // before the Saturday window opens
        expect(cal.isWorkingDay(utc(2026, 4, 4))).toBe(true);
        expect(cal.isWorkingDay(utc(2031, 4, 5))).toBe(true); // Saturday
        expect(cal.isWorkingDay(utc(2031, 4, 6))).toBe(false); // Sunday
        expect(cal.isWorkingDay(utc(2026, 1, 26))).toBe(false); // Monday before the end
        expect(cal.isWorkingDay(utc(2026, 2, 2))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 2, 9))).toBe(true);
    });

    it('does not depend on declaration order for the crunch, holiday and summer Fridays', () => {
        const extras = [crunchRule, mar14Holiday, summerFridays];
        const fingerprints = permutations(extras).flatMap((order) => [
            fingerprint(fromCalendarConfig(businessCal, [...presetRules('business'), ...order])),
            fingerprint(fromCalendarConfig(businessCal, [...order, ...presetRules('business')])),
        ]);
        expect(new Set(fingerprints).size).toBe(1);
        // Guard against a vacuous pass: the rules really do something.
        const cal = fromCalendarConfig(businessCal, [...extras, ...presetRules('business')]);
        expect(cal.isWorkingDay(utc(2026, 3, 21))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 3, 14))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 7, 3))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Brute-force agreement with the day-by-day reference.
// ---------------------------------------------------------------------------

describe('agreement with a day-by-day reference', () => {
    const sets: Array<[string, CalendarRule[]]> = [
        ['business weekend', presetRules('business')],
        ['Friday and Saturday off', [{ working: false, every: days(FRI, SAT) }]],
        ['Sunday off', [{ working: false, every: days(SUN) }]],
        ['Tuesday and Thursday off', [{ working: false, every: days(TUE, THU) }]],
        ['business plus a holiday list', [...presetRules('business'), ...holidayRules]],
        ['six-day weeks', [...presetRules('business'), crunchRule]],
        [
            'six-day weeks plus the Mar 14 holiday',
            [...presetRules('business'), crunchRule, mar14Holiday],
        ],
        [
            'summer Fridays plus a working Friday',
            [...presetRules('business'), summerFridays, workingSummerFriday],
        ],
        ['a working weekend over the weekend', [...presetRules('business'), workingWeekend]],
        ['equal-level conflict', [...presetRules('business'), ...equalConflictRules]],
        ['overlapping bounded windows', [...presetRules('business'), ...overlappingWindowRules]],
        ['open-ended working Saturdays', [...presetRules('business'), openWorkingSaturdays]],
        ['a bounded all-days shutdown', [...presetRules('business'), shutdownRule]],
        ['recurrence windows open on one side', [...presetRules('business'), ...openBoundedRules]],
    ];

    for (const [name, rules] of sets) {
        it(`${name}: indices, dates, round trips and runs match for every base`, {
            timeout: 120_000,
        }, () => {
            expect(bruteForceMismatches(rules)).toEqual([]);
        });
    }
});

// ---------------------------------------------------------------------------
// Performance.
// ---------------------------------------------------------------------------

describe('working calendar performance', () => {
    it('answers across 10,000 years with about 100 holidays within 0.5 ms per call', () => {
        const holidays: CalendarRule[] = [];
        for (let year = 2026; year <= 2035; year++) {
            for (let month = 0; month < 10; month++) {
                holidays.push({
                    working: false,
                    dates: [new Date(Date.UTC(year, month, 15))],
                    id: `holiday-${year}-${month}`,
                });
            }
        }
        const cal = fromCalendarConfig(businessCal, [
            ...presetRules('business'),
            ...holidays,
            { working: false, every: days(FRI), start: utc(2026, 6, 1), end: utc(2026, 8, 31) },
        ]);
        const base = utc(2026, 1, 5);
        const far = new Date(Date.UTC(12026, 0, 1)).getTime();
        const iterations = 1000;
        let sink = 0;

        const batch = () => {
            const started = performance.now();
            for (let i = 0; i < iterations; i++) {
                sink += cal.workingIndexOf(base, new Date(far - i * DAY_MS));
                sink += cal.dateAtWorkingIndex(base, 2_500_000 - i).getTime() % 7;
            }
            return (performance.now() - started) / (2 * iterations);
        };

        batch(); // warm-up
        const best = Math.min(batch(), batch(), batch(), batch(), batch());
        expect(Number.isFinite(sink)).toBe(true);
        expect(best).toBeLessThan(0.5);
    });
});

// ---------------------------------------------------------------------------
// Worked examples from the spec (§10) at the primitive level.
// ---------------------------------------------------------------------------

describe('spec §10 example A: a plain business week', () => {
    const cal = fromCalendarConfig(businessCal);
    const base = utc(2026, 1, 5);

    it('puts W1 on Jan 5-9 and its successor on Monday Jan 12', () => {
        expect([0, 1, 2, 3, 4].map((i) => ymd(cal.dateAtWorkingIndex(base, i)))).toEqual([
            '2026-01-05',
            '2026-01-06',
            '2026-01-07',
            '2026-01-08',
            '2026-01-09',
        ]);
        expect(ymd(cal.dateAtWorkingIndex(base, 5))).toBe('2026-01-12');
    });

    it('puts W4 on Jan 26-30 and a Friday milestone at 152 px', () => {
        expect(ymd(cal.dateAtWorkingIndex(base, 15))).toBe('2026-01-26');
        expect(ymd(cal.dateAtWorkingIndex(base, 19))).toBe('2026-01-30');
        expect(cal.workingIndexOf(base, utc(2026, 1, 30)) * PX_PER_DAY).toBe(152);
    });

    it('places the weekly ticks at 0, 40, 80 and 120 px', () => {
        const ticks = [5, 12, 19, 26].map(
            (d) => cal.workingIndexOf(base, utc(2026, 1, d)) * PX_PER_DAY,
        );
        expect(ticks).toEqual([0, 40, 80, 120]);
    });
});

describe('spec §10 example B: Thanksgiving next to the weekend', () => {
    const cal = businessWith({
        working: false,
        start: utc(2026, 11, 26),
        end: utc(2026, 11, 27),
        id: 'thanksgiving',
        title: 'Thanksgiving',
    });
    const base = utc(2026, 11, 23);

    it('indexes the working days around the holiday', () => {
        expect([0, 1, 2, 3, 4, 5, 6].map((i) => ymd(cal.dateAtWorkingIndex(base, i)))).toEqual([
            '2026-11-23',
            '2026-11-24',
            '2026-11-25',
            '2026-11-30',
            '2026-12-01',
            '2026-12-02',
            '2026-12-03',
        ]);
    });

    it('puts a Saturday milestone and the seam at 24 px, same as Thursday', () => {
        expect(cal.workingIndexOf(base, utc(2026, 11, 28)) * PX_PER_DAY).toBe(24);
        expect(cal.workingIndexOf(base, utc(2026, 11, 26))).toBe(3);
    });

    it('merges the holiday and weekend into one titled run', () => {
        expect(cal.nonWorkingRuns(utc(2026, 11, 23), utc(2026, 12, 7))).toEqual([
            run(utc(2026, 11, 26), utc(2026, 11, 29), ['Thanksgiving']),
            run(utc(2026, 12, 5), utc(2026, 12, 6)),
        ]);
    });

    it('counts backward across the holiday from a Monday base', () => {
        expect(ymd(cal.dateAtWorkingIndex(utc(2026, 11, 30), -1))).toBe('2026-11-25');
    });
});

describe('spec §10 example C: a Friday and Saturday weekend', () => {
    const cal = fromCalendarConfig(businessCal, [{ working: false, every: days(FRI, SAT) }]);
    const base = utc(2026, 1, 4); // Sunday

    it('starts weeks on Sunday', () => {
        expect(cal.weekStart).toBe(0);
    });

    it('spans a one-week item Sunday through Thursday', () => {
        expect(ymd(cal.dateAtWorkingIndex(base, 4))).toBe('2026-01-08');
        expect(ymd(cal.dateAtWorkingIndex(base, 5))).toBe('2026-01-11');
        expect(cal.isWorkingDay(utc(2026, 1, 9))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Edges.
// ---------------------------------------------------------------------------

describe('nonWorkingRuns windows', () => {
    const cal = fromCalendarConfig(businessCal);

    it('extends a run past both ends of the window', () => {
        expect(cal.nonWorkingRuns(utc(2026, 1, 11), utc(2026, 1, 12))).toEqual([
            run(utc(2026, 1, 10), utc(2026, 1, 11)),
        ]);
    });

    it('returns nothing for a window that stops before the weekend', () => {
        expect(cal.nonWorkingRuns(utc(2026, 1, 5), utc(2026, 1, 10))).toEqual([]);
    });

    it('includes a weekend whose first day is the last day of the window', () => {
        expect(cal.nonWorkingRuns(utc(2026, 1, 5), utc(2026, 1, 11))).toEqual([
            run(utc(2026, 1, 10), utc(2026, 1, 11)),
        ]);
    });

    it('returns nothing when from is not before to', () => {
        expect(cal.nonWorkingRuns(utc(2026, 1, 12), utc(2026, 1, 5))).toEqual([]);
        expect(cal.nonWorkingRuns(utc(2026, 1, 10), utc(2026, 1, 10))).toEqual([]);
    });

    it('types its result as NonWorkingRun records', () => {
        const [first]: NonWorkingRun[] = cal.nonWorkingRuns(utc(2026, 1, 9), utc(2026, 1, 12));
        expect(first.from).toBeInstanceOf(Date);
        expect(first.through).toBeInstanceOf(Date);
        expect(first.titles).toEqual([]);
    });
});

describe('a calendar parsed from a roadmap file', () => {
    const source = (extra: string) =>
        `nowline v1\n\nroadmap r start:2026-01-05${extra}\n\nswimlane s\n  item a duration:1w\n`;

    it('carries the weekend by default', async () => {
        const { file, resolved } = await parseAndResolve(source(''));
        const cal = fromCalendarConfig(resolveCalendar(file, resolved.config.calendar));
        expect(cal.hasNonWorkingDays).toBe(true);
        expect(cal.weekStart).toBe(1);
        expect(cal.isWorkingDay(utc(2026, 1, 10))).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 1, 9))).toBe(true);
    });

    it('has no non-working days under calendar:full', async () => {
        const { file, resolved } = await parseAndResolve(source(' calendar:full'));
        const cal = fromCalendarConfig(resolveCalendar(file, resolved.config.calendar));
        expect(cal.hasNonWorkingDays).toBe(false);
        expect(cal.isWorkingDay(utc(2026, 1, 10))).toBe(true);
    });
});

describe('caller mutation after construction', () => {
    it('changes nothing in the calendar and exposes a copy of the rules', () => {
        const fridays = days(FRI);
        const holidayDates = [utc(2026, 1, 7)];
        const holiday: CalendarRule = { working: false, dates: holidayDates };
        const rules: CalendarRule[] = [{ working: false, every: fridays }, holiday];
        const cal = fromCalendarConfig(businessCal, rules);
        const before = fingerprint(cal);

        fridays.add(MON);
        holidayDates.push(utc(2026, 1, 8));
        holiday.working = true;
        rules[0].working = true;
        rules.push({ working: false, every: days(TUE) });
        rules.length = 0;

        expect(fingerprint(cal)).toBe(before);
        expect(cal.rules).not.toBe(rules);
        expect(cal.rules).toHaveLength(2);
        expect(cal.isWorkingDay(utc(2026, 1, 5))).toBe(true); // Monday
        expect(cal.isWorkingDay(utc(2026, 1, 7))).toBe(false); // the holiday
        expect(cal.isWorkingDay(utc(2026, 1, 8))).toBe(true);
        expect(cal.isWorkingDay(utc(2026, 1, 9))).toBe(false); // Friday
        expect(cal.isWorkingDay(utc(2026, 1, 10))).toBe(true); // Saturday: no weekend rule here
    });
});

describe('invalid rules', () => {
    it.each([
        ['a weekday of 7', days(7)],
        ['a weekday of -1', days(-1)],
        ['a fractional weekday', days(1.5)],
    ])('throws a RangeError for %s', (_name, every) => {
        expect(() => fromCalendarConfig(businessCal, [{ working: false, every }])).toThrow(
            RangeError,
        );
    });

    it('throws when an open-ended rule leaves no working weekday', () => {
        expect(() =>
            fromCalendarConfig(businessCal, [{ working: false, every: days(...ALL_WEEKDAYS) }]),
        ).toThrow(RangeError);
    });

    it('throws when a rule closing every weekday is open on one side', () => {
        expect(() =>
            fromCalendarConfig(businessCal, [
                { working: false, every: days(...ALL_WEEKDAYS), start: utc(2026, 8, 3) },
            ]),
        ).toThrow(RangeError);
        expect(() =>
            fromCalendarConfig(businessCal, [
                { working: false, every: days(...ALL_WEEKDAYS), end: utc(2026, 8, 3) },
            ]),
        ).toThrow(RangeError);
    });

    it('does not throw for a bounded all-days window', () => {
        expect(() => businessWith(shutdownRule)).not.toThrow();
    });

    const malformed: Array<[string, CalendarRule]> = [
        ['an invalid dates entry', { working: false, dates: [new Date(Number.NaN)] }],
        [
            'an invalid range start',
            { working: false, start: new Date(Number.NaN), end: utc(2026, 1, 10) },
        ],
        [
            'an invalid recurrence end',
            { working: false, every: days(MON), end: new Date(Number.NaN) },
        ],
        [
            'an end before its start',
            { working: false, start: utc(2026, 1, 20), end: utc(2026, 1, 10) },
        ],
        ['an empty every', { working: false, every: new Set<number>() }],
        [
            'dates together with every',
            { working: false, dates: [utc(2026, 1, 7)], every: days(MON) },
        ],
        [
            'dates together with a range',
            {
                working: false,
                dates: [utc(2026, 1, 7)],
                start: utc(2026, 1, 7),
                end: utc(2026, 1, 8),
            },
        ],
        ['a range with only a start', { working: false, start: utc(2026, 1, 7) }],
        ['a range with only an end', { working: false, end: utc(2026, 1, 7) }],
    ];

    it.each(malformed)('drops %s silently', (_name, rule) => {
        const without = fromCalendarConfig(businessCal, presetRules('business'));
        const withRule = fromCalendarConfig(businessCal, [...presetRules('business'), rule]);
        expect(fingerprint(withRule)).toBe(fingerprint(without));
        expect(withRule.weekStart).toBe(without.weekStart);
        expect(withRule.hasNonWorkingDays).toBe(without.hasNonWorkingDays);
        expect(withRule.nonWorkingRuns(utc(2026, 1, 1), utc(2026, 3, 1))).toEqual(
            without.nonWorkingRuns(utc(2026, 1, 1), utc(2026, 3, 1)),
        );
    });
});

describe('non-finite and out-of-range input', () => {
    const base = utc(2026, 1, 5);
    const calendars: Array<[string, WorkingCalendar]> = [
        ['business (general path)', fromCalendarConfig(businessCal)],
        ['full (identity path)', fromCalendarConfig(fullCal)],
    ];

    it.each(calendars)(
        '%s returns an Invalid Date for NaN, Infinity and 1e300 indices',
        (_n, cal) => {
            for (const index of [
                Number.NaN,
                Number.POSITIVE_INFINITY,
                Number.NEGATIVE_INFINITY,
                1e300,
            ]) {
                expect(Number.isNaN(cal.dateAtWorkingIndex(base, index).getTime())).toBe(true);
            }
        },
    );

    it.each(calendars)('%s returns NaN for an invalid date or base', (_n, cal) => {
        expect(cal.workingIndexOf(base, new Date(Number.NaN))).toBeNaN();
        expect(cal.workingIndexOf(new Date(Number.NaN), base)).toBeNaN();
    });

    it.each(calendars)('%s treats an invalid date as a working day with no runs', (_n, cal) => {
        expect(cal.isWorkingDay(new Date(Number.NaN))).toBe(true);
        expect(cal.nonWorkingRuns(new Date(Number.NaN), base)).toEqual([]);
        expect(cal.nonWorkingRuns(base, new Date(Number.NaN))).toEqual([]);
    });
});
