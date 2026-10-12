// The file's calendar, resolved once for every consumer (specs/working-
// calendar.md §8): the layout, engine C and the three exporters read the
// same `CalendarConfig` (duration arithmetic) and `WorkingCalendar`
// (non-working days), so the chart and every export agree on what `1w` is.
//
// It is also the one place the file's `non-working` and `working`
// declarations (its own and its merged includes', specs/working-calendar.md
// §4) become `CalendarRule`s, so every consumer picks them up unchanged.
//
// It lives apart from `calendar.ts` because `working-calendar.ts` already
// imports values from there; building a `WorkingCalendar` in `calendar.ts`
// would close a value-import cycle.

import type {
    EntityProperty,
    NonWorkingDeclaration,
    NowlineFile,
    ResolveResult,
    WorkingDeclaration,
} from '@nowline/core';
import { type CalendarConfig, resolveCalendar } from './calendar.js';
import { formatIsoDate, parseDate, propValues } from './dsl-utils.js';
import {
    type CalendarRule,
    fromCalendarConfig,
    presetRules,
    type WorkingCalendar,
} from './working-calendar.js';

export interface ResolvedCalendar {
    /** The preset or `calendar` block day counts. */
    config: CalendarConfig;
    /**
     * The working calendar of the preset and the file's declarations (its
     * own and its merged includes'). A `non-working` declaration named
     * `weekend` replaces the preset's rules. Its `rules` are in a canonical
     * order, so nothing downstream depends on file or include order.
     */
    working: WorkingCalendar;
}

/**
 * Resolve the calendar a roadmap declares (`calendar:` on the roadmap plus
 * the `config` block's `calendar` section, business when it declares none)
 * and the non-working days its declarations add or take away.
 *
 * A malformed declaration is left out (the validator reports it in the root
 * file; includes are not validated). Rules that leave an unbounded stretch
 * with no working day (an include that closes the whole week; the root file
 * would have had NL.E0906) fall back to the preset calendar rather than
 * failing layout or export.
 */
export function resolveWorkingCalendar(
    file: NowlineFile,
    resolved: ResolveResult,
): ResolvedCalendar {
    const config = resolveCalendar(file, resolved.config.calendar);
    const rules = calendarRules(config, resolved.config.calendarDeclarations);
    try {
        return { config, working: fromCalendarConfig(config, rules) };
    } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        return { config, working: fromCalendarConfig(config) };
    }
}

type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

/** UTC weekday numbers (Sunday is 0) of the names `every:` takes. */
const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};

/**
 * The preset's rules, unless a `non-working` declaration is named `weekend`
 * (decision 14), plus one rule per well-formed declaration, in canonical
 * order.
 */
function calendarRules(
    config: CalendarConfig,
    declarations: ReadonlyArray<CalendarDeclaration>,
): CalendarRule[] {
    const replacesWeekend = declarations.some(
        (decl) => decl.$type === 'NonWorkingDeclaration' && decl.name === 'weekend',
    );
    const rules = replacesWeekend ? [] : presetRules(config.mode);
    for (const decl of declarations) {
        const rule = declarationRule(decl);
        if (rule) rules.push(rule);
    }
    return rules.sort(compareRules);
}

/**
 * The rule one declaration stands for, or undefined when its shape or a
 * value is malformed. Only the first `date:`, `start:`, `end:` and `every:`
 * count; any other key is the validator's NL.E0901 and changes nothing here.
 */
function declarationRule(decl: CalendarDeclaration): CalendarRule | undefined {
    const props = decl.properties;
    const has = (key: string) => props.some((p) => stripColon(p.key) === key);
    const rule: CalendarRule = { working: decl.$type === 'WorkingDeclaration' };
    if (decl.name) rule.id = decl.name;
    if (decl.title !== undefined) rule.title = decl.title;

    if (has('date')) {
        if (has('every') || has('start') || has('end')) return undefined;
        const dates = propValues(props, 'date').map(realDate);
        if (dates.length === 0 || dates.some((date) => date === undefined)) return undefined;
        rule.dates = dates as Date[];
        return rule;
    }
    if (!has('every') && !(has('start') && has('end'))) return undefined;

    for (const key of ['start', 'end'] as const) {
        if (!has(key)) continue;
        const date = singleDate(props, key);
        if (!date) return undefined;
        rule[key] = date;
    }
    if (rule.start && rule.end && rule.end < rule.start) return undefined;

    if (has('every')) {
        const weekdays = propValues(props, 'every').map((name) => WEEKDAY_INDEX[name]);
        if (weekdays.length === 0 || weekdays.some((day) => day === undefined)) return undefined;
        rule.every = new Set(weekdays);
    }
    return rule;
}

/** The one date a `start:` / `end:` names; a one-element bracket is that date. */
function singleDate(props: EntityProperty[], key: 'start' | 'end'): Date | undefined {
    const values = propValues(props, key);
    return values.length === 1 ? realDate(values[0]) : undefined;
}

/**
 * A `YYYY-MM-DD` that names a real calendar day, at UTC midnight. `parseDate`
 * rolls `2026-02-30` over to March 2; the validator rejects it (NL.E0405), so
 * the resolver does too.
 */
function realDate(raw: string): Date | undefined {
    const date = parseDate(raw);
    return date && formatIsoDate(date) === raw ? date : undefined;
}

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

/**
 * Canonical rule order (decision 18): first date (none first), then title,
 * id, `working`, the `every` mask, start and end, then the remaining dates.
 * The engine breaks ties between titled runs by input order, so sorting
 * here keeps `rules`, run titles and every downstream list independent of
 * file and include order.
 */
function compareRules(a: CalendarRule, b: CalendarRule): number {
    return (
        compareOptional(firstDay(a), firstDay(b)) ||
        compareOptional(a.title, b.title) ||
        compareOptional(a.id, b.id) ||
        Number(a.working) - Number(b.working) ||
        compareOptional(everyMask(a), everyMask(b)) ||
        compareOptional(a.start?.getTime(), b.start?.getTime()) ||
        compareOptional(a.end?.getTime(), b.end?.getTime()) ||
        compareDates(a.dates ?? [], b.dates ?? [])
    );
}

/** The earliest date a rule names (its first `date:` or its `start:`); undefined for none. */
function firstDay(rule: CalendarRule): number | undefined {
    if (rule.dates) return Math.min(...rule.dates.map((date) => date.getTime()));
    return rule.start?.getTime();
}

function everyMask(rule: CalendarRule): number | undefined {
    if (!rule.every) return undefined;
    let mask = 0;
    for (const weekday of rule.every) mask |= 1 << weekday;
    return mask;
}

/** Undefined sorts first; strings compare by code unit, never by locale. */
function compareOptional<T extends number | string>(a: T | undefined, b: T | undefined): number {
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return a < b ? -1 : 1;
}

function compareDates(a: ReadonlyArray<Date>, b: ReadonlyArray<Date>): number {
    const left = a.map((date) => date.getTime()).sort((x, y) => x - y);
    const right = b.map((date) => date.getTime()).sort((x, y) => x - y);
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
        if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
}
