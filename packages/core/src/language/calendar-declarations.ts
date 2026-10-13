// What a `non-working` or `working` declaration says, read once
// (specs/core-ast-utilities.md §3.4, specs/working-calendar.md §4.1): its
// shape (a dated list, a range, or a weekly recurrence, bounded or not),
// its real dates and known weekdays, and whether the calendar resolver can
// use it. The validator picks its codes from these facts, layout maps them to
// a `CalendarRule`, and LSP hover reads the shape. Exported only through
// `@nowline/core/internal`. A leaf module: it imports nothing but the
// generated AST types and `util/props.ts`.

import type {
    EntityProperty,
    NonWorkingDeclaration,
    WorkingDeclaration,
} from '../generated/ast.js';
import { isRealIsoDate, propKey } from '../util/props.js';

/** The weekday names `every:` takes, Sunday first (the order of `Date#getUTCDay`). */
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** UTC weekday number (Sunday is 0), the numbering of `CalendarRule.every`. */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};

/** True for one of the seven weekday names (not an inherited key such as `constructor`). */
export function isWeekday(name: string): name is Weekday {
    return Object.hasOwn(WEEKDAY_INDEX, name);
}

export type CalendarShape =
    | 'dated' // date: alone
    | 'range' // start: + end:, no every:
    | 'open-recurrence' // every: alone
    | 'half-bounded-recurrence' // every: + exactly one of start: / end:
    | 'bounded-recurrence' // every: + start: + end:
    | 'malformed'; // any other combination

export type CalendarDeclarationKey = 'date' | 'start' | 'end' | 'every';

export interface CalendarDeclarationFacts {
    /** First occurrence of each of `date`, `start`, `end`, `every`; other keys are NL.E0901's. */
    own: ReadonlyMap<CalendarDeclarationKey, EntityProperty>;
    shape: CalendarShape;
    /** Real dates of `date:`, or undefined when any is not a real day. */
    dates?: string[];
    /** The single real date of `start:` / `end:`, or undefined. */
    start?: string;
    end?: string;
    /** Weekday numbers of `every:`, or undefined when any name is unknown. */
    weekdays?: number[];
    /** The resolver uses it: not malformed, every value real or known, and end not before start. */
    wellFormed: boolean;
}

const OWN_KEYS: ReadonlySet<string> = new Set<CalendarDeclarationKey>([
    'date',
    'start',
    'end',
    'every',
]);

/** Everything the validator, layout and hover need to know about one declaration. */
export function classifyCalendarDeclaration(
    decl: NonWorkingDeclaration | WorkingDeclaration,
): CalendarDeclarationFacts {
    const own = new Map<CalendarDeclarationKey, EntityProperty>();
    for (const prop of decl.properties) {
        const key = propKey(prop);
        if (OWN_KEYS.has(key) && !own.has(key as CalendarDeclarationKey)) {
            own.set(key as CalendarDeclarationKey, prop);
        }
    }

    const shape = shapeOf(own);
    const facts: CalendarDeclarationFacts = { own, shape, wellFormed: false };

    const date = own.get('date');
    if (date) {
        const values = valuesOf(date);
        if (values.every(isRealIsoDate)) facts.dates = values;
    }
    const start = singleDate(own.get('start'));
    if (start !== undefined) facts.start = start;
    const end = singleDate(own.get('end'));
    if (end !== undefined) facts.end = end;
    const every = own.get('every');
    if (every) {
        const names = valuesOf(every);
        if (names.every(isWeekday)) facts.weekdays = names.map((name) => WEEKDAY_INDEX[name]);
    }

    facts.wellFormed =
        shape !== 'malformed' &&
        (!date || (facts.dates !== undefined && facts.dates.length > 0)) &&
        (!own.has('start') || facts.start !== undefined) &&
        (!own.has('end') || facts.end !== undefined) &&
        !(facts.start !== undefined && facts.end !== undefined && facts.end < facts.start) &&
        (!every || (facts.weekdays !== undefined && facts.weekdays.length > 0));
    return facts;
}

/** A preset weekend applies unless a `non-working` declaration is named `weekend`. */
export function replacesPresetWeekend(
    declarations: ReadonlyArray<NonWorkingDeclaration | WorkingDeclaration>,
): boolean {
    return declarations.some(
        (decl) => decl.$type === 'NonWorkingDeclaration' && decl.name === 'weekend',
    );
}

/** Exactly one of: `date:` alone; `start:` + `end:`; `every:` with optional `start:` / `end:`. */
function shapeOf(own: ReadonlyMap<CalendarDeclarationKey, EntityProperty>): CalendarShape {
    const hasStart = own.has('start');
    const hasEnd = own.has('end');
    if (own.has('date')) return own.has('every') || hasStart || hasEnd ? 'malformed' : 'dated';
    if (own.has('every')) {
        if (hasStart && hasEnd) return 'bounded-recurrence';
        return hasStart || hasEnd ? 'half-bounded-recurrence' : 'open-recurrence';
    }
    return hasStart && hasEnd ? 'range' : 'malformed';
}

/** A scalar as one value, or a bracket list. */
function valuesOf(prop: EntityProperty): string[] {
    return prop.value !== undefined ? [prop.value] : [...prop.values];
}

/** The one real date a `start:` / `end:` names; a one-element bracket is that date. */
function singleDate(prop: EntityProperty | undefined): string | undefined {
    if (!prop) return undefined;
    const values = valuesOf(prop);
    return values.length === 1 && isRealIsoDate(values[0]) ? values[0] : undefined;
}
