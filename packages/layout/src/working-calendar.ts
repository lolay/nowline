// WorkingCalendar: the two jobs a calendar does (specs/working-calendar.md
// §3.1).
//
// 1. Duration arithmetic. `daysPerUnit` turns `1w` / `1m` / `1q` / `1y` into
//    a count of working days from the `CalendarConfig` preset. The
//    non-working rules never change it.
// 2. Non-working days. A list of `CalendarRule`s (the preset weekend plus
//    holidays, closures, recurring windows and working exceptions) decides
//    which UTC dates consume no work. `workingIndexOf` and
//    `dateAtWorkingIndex` map between dates and a working-day index;
//    `nonWorkingRuns` lists the maximal non-working stretches to draw.
//
// Precedence is resolved once, at construction, into a sorted list of
// disjoint pieces covering every day: a weekly mask (the open-ended week or
// a bounded recurrence pattern) or an all-working / all-non-working dated
// stretch. Queries cost O(pieces in the span) with whole-week arithmetic
// inside a piece; nothing walks day by day.
//
// Identity guarantee: a calendar with no non-working day (`calendar:full`,
// `calendar:custom`, `continuousCalendar()`, or rules that cancel out)
// delegates to `daysBetween` / `addDays`, so its answers, including the
// rounding and `addDays`' truncation of fractional days, match continuous
// calendar-day time exactly.

import type { CalendarConfig, CalendarMode } from './calendar.js';
import { addDays, daysBetween } from './calendar.js';
import type { ScaleUnit } from './view-preset.js';

/**
 * One `non-working` (or working-exception) declaration. Kinds:
 * `dates`, or `start` + `end` without `every`, is a dated rule; `every` with
 * `start` and/or `end` is a bounded recurrence (open on an omitted side);
 * `every` alone is the open-ended week. All dates are UTC midnight.
 */
export interface CalendarRule {
    /** False: weekend, holiday, closure. True: a working exception. */
    working: boolean;
    /** Recurring UTC weekdays (0 = Sunday … 6 = Saturday). */
    every?: ReadonlySet<number>;
    /** Specific dates (`date:` single or list); excludes `every` / `start` / `end`. */
    dates?: ReadonlyArray<Date>;
    /** Range start, or recurrence window start; inclusive. */
    start?: Date;
    /** Range end, or recurrence window end; inclusive. */
    end?: Date;
    id?: string;
    title?: string;
}

/** A maximal run of consecutive non-working dates. */
export interface NonWorkingRun {
    /** First non-working date of the run (UTC midnight). */
    from: Date;
    /** Last non-working date of the run, inclusive. */
    through: Date;
    /** Titles of the dated non-working rules inside it; empty for a plain weekend. */
    titles: string[];
}

export interface WorkingCalendar {
    /** Days per `1<unit>` literal (e.g. `1w` → 5 for business). */
    daysPerUnit(unit: ScaleUnit): number;
    /** `dateAtWorkingIndex(date, count × daysPerUnit(unit))`. */
    addUnits(date: Date, count: number, unit: ScaleUnit): Date;
    /** False: every function below is plain calendar-day math. */
    readonly hasNonWorkingDays: boolean;
    /** True when the given date is a working day; an invalid date counts as working. */
    isWorkingDay(date: Date): boolean;
    /**
     * Working days in [base, date), signed. A non-working `date` counts as the
     * next working day. `base` must be UTC midnight.
     */
    workingIndexOf(base: Date, date: Date): number;
    /**
     * UTC midnight of the working day with this index from `base` (fractions
     * floor). Index 0 is the first working day at or after `base`, which must
     * be UTC midnight.
     */
    dateAtWorkingIndex(base: Date, index: number): Date;
    /** Maximal non-working runs intersecting [from, to), extended past both ends. */
    nonWorkingRuns(from: Date, to: Date): NonWorkingRun[];
    /**
     * First working weekday after the longest recurring non-working run of the
     * open-ended week (Sat–Sun → Monday); undefined without one.
     */
    readonly weekStart: number | undefined;
    /**
     * Weekdays the open-ended week works (0 = Sunday … 6 = Saturday): the
     * weekly pattern an exporter writes as its base calendar. Dated rules and
     * bounded recurrences are exceptions to it and never change it.
     */
    readonly workingWeekdays: ReadonlySet<number>;
    /** Normalized copies of the valid rules, in input order. */
    readonly rules: ReadonlyArray<CalendarRule>;
}

/** The rules a calendar preset implies: the weekend for business, nothing otherwise. */
export function presetRules(mode: CalendarMode): CalendarRule[] {
    if (mode !== 'business') return [];
    return [{ working: false, every: new Set([0, 6]), id: 'weekend', title: 'Weekend' }];
}

/**
 * Build the working calendar for a resolved `CalendarConfig`. `rules`
 * defaults to the preset's (the weekend for business). Malformed rules are
 * dropped silently because included files are parsed without validation;
 * throws `RangeError` for a weekday outside 0..6 or an unbounded stretch
 * with no working weekday.
 */
export function fromCalendarConfig(
    cal: CalendarConfig,
    rules: ReadonlyArray<CalendarRule> = presetRules(cal.mode),
): WorkingCalendar {
    return buildCalendar((unit) => daysPerUnitForCalendar(unit, cal), rules);
}

/** Every day is a working day; units use the full-calendar day counts. */
export function continuousCalendar(): WorkingCalendar {
    return buildCalendar(continuousDaysPerUnit, []);
}

/**
 * The exclusive end date of a span of working-day indices [s, e) from
 * `base` (specs/working-calendar.md §5.2): the day after the last whole
 * working day the span covers, so a Mon–Fri item ends on Saturday. A span
 * covering no whole working day ends on its start date. Indices floor, as
 * in `dateAtWorkingIndex`.
 *
 * On the identity path it is `addDays(base, e)`, truncation included, so
 * calendar-day spans keep their exact dates.
 */
export function spanEndDate(calendar: WorkingCalendar, base: Date, s: number, e: number): Date {
    if (!calendar.hasNonWorkingDays) return addDays(base, e);
    const last = Math.floor(e);
    if (last <= Math.floor(s)) return calendar.dateAtWorkingIndex(base, s);
    return addDays(calendar.dateAtWorkingIndex(base, last - 1), 1);
}

export function daysPerUnit(unit: ScaleUnit, cal: CalendarConfig): number {
    return daysPerUnitForCalendar(unit, cal);
}

function daysPerUnitForCalendar(unit: ScaleUnit, cal: CalendarConfig): number {
    switch (unit) {
        case 'days':
            return 1;
        case 'weeks':
            return cal.daysPerWeek;
        case 'months':
            return cal.daysPerMonth;
        case 'quarters':
            return cal.daysPerQuarter;
        case 'years':
            return cal.daysPerYear;
    }
}

/** Calendar days per `1<unit>` when every day counts (`calendar:full`). */
export function continuousDaysPerUnit(unit: ScaleUnit): number {
    switch (unit) {
        case 'days':
            return 1;
        case 'weeks':
            return 7;
        case 'months':
            return 30;
        case 'quarters':
            return 91;
        case 'years':
            return 365;
    }
}

// ---------------------------------------------------------------------------
// Construction.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
/** Day 0 (1970-01-01) is a Thursday. */
const EPOCH_WEEKDAY = 4;
/** Beyond this many working days every result is outside the Date range. */
const MAX_WORKING_INDEX = 1e8;
/** A remainder scan inside one weekly piece needs at most 7 steps. */
const MAX_REMAINDER_STEPS = 14;

type UnitDays = (unit: ScaleUnit) => number;

/** A day span [start, end) in UTC day numbers; either side may be infinite. */
interface DaySpan {
    start: number;
    end: number;
}

interface RecurringSpan extends DaySpan {
    working: boolean;
    mask: number;
}

interface TitledRule {
    title: string;
    spans: DaySpan[];
}

interface NormalizedRule {
    copy: CalendarRule;
    working: boolean;
    /** Weekday bitmask; undefined for a dated rule. */
    mask?: number;
    spans: DaySpan[];
}

type Piece =
    | (DaySpan & { kind: 'mask'; off: readonly boolean[]; workingPerWeek: number })
    | (DaySpan & { kind: 'working' | 'non-working' });

interface MaskSegment extends DaySpan {
    mask: number;
}

interface DatedSegment extends DaySpan {
    kind: 'working' | 'non-working';
}

function buildCalendar(unitDays: UnitDays, input: ReadonlyArray<CalendarRule>): WorkingCalendar {
    const normalized: NormalizedRule[] = [];
    for (const rule of input) {
        const result = normalizeRule(rule);
        if (result) normalized.push(result);
    }
    const rules = normalized.map((rule) => rule.copy);

    const openMask = openWeekMask(normalized);
    const pieces = overlay(
        recurringSegments(openMask, boundedSpans(normalized)),
        datedSegments(normalized),
    );
    const first = pieces[0];
    const last = pieces[pieces.length - 1];
    for (const piece of [first, last]) {
        if (piece.kind !== 'mask' || piece.workingPerWeek === 0) {
            throw new RangeError('working calendar: an unbounded stretch has no working weekday');
        }
    }
    const hasNonWorkingDays = pieces.some(
        (piece) =>
            piece.kind === 'non-working' ||
            (piece.kind === 'mask' && piece.workingPerWeek < DAYS_PER_WEEK),
    );
    const workingWeekdays = weekdaysOutside(openMask);
    if (!hasNonWorkingDays) return identityCalendar(unitDays, rules, workingWeekdays);

    const index = new WorkingDayIndex(pieces, titledRules(normalized));
    const dateAtWorkingIndex = (base: Date, workingIndex: number): Date =>
        index.dateAt(base, workingIndex);
    return {
        rules,
        hasNonWorkingDays: true,
        weekStart: weekStartOf(openMask),
        workingWeekdays,
        daysPerUnit: unitDays,
        addUnits: (date, count, unit) => dateAtWorkingIndex(date, count * unitDays(unit)),
        isWorkingDay: (date) => index.isWorkingDay(date),
        workingIndexOf: (base, date) => index.indexOf(base, date),
        dateAtWorkingIndex,
        nonWorkingRuns: (from, to) => index.runs(from, to),
    };
}

function identityCalendar(
    unitDays: UnitDays,
    rules: ReadonlyArray<CalendarRule>,
    workingWeekdays: ReadonlySet<number>,
): WorkingCalendar {
    return {
        rules,
        hasNonWorkingDays: false,
        weekStart: undefined,
        workingWeekdays,
        daysPerUnit: unitDays,
        addUnits: (date, count, unit) => addDays(date, count * unitDays(unit)),
        isWorkingDay: () => true,
        workingIndexOf: (base, date) => daysBetween(base, date),
        dateAtWorkingIndex: (base, index) => addDays(base, index),
        nonWorkingRuns: () => [],
    };
}

/** Validate and deep-copy one rule; undefined drops it. */
function normalizeRule(rule: CalendarRule): NormalizedRule | undefined {
    const mask = rule.every === undefined ? undefined : weekdayMask(rule.every);
    const hasBound = rule.start !== undefined || rule.end !== undefined;
    if (mask === 0) return undefined;
    if (rule.dates !== undefined && (mask !== undefined || hasBound)) return undefined;
    const isRange = mask === undefined && rule.dates === undefined;
    if (isRange && (rule.start === undefined || rule.end === undefined)) return undefined;

    const start = rule.start === undefined ? -Infinity : dayNumber(rule.start);
    const end = rule.end === undefined ? Infinity : dayNumber(rule.end);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
    const dates = rule.dates?.map(dayNumber);
    if (dates?.some(Number.isNaN)) return undefined;

    const spans = dates
        ? dates.map((day) => ({ start: day, end: day + 1 }))
        : [{ start, end: end + 1 }];
    return { copy: copyRule(rule), working: rule.working, mask, spans };
}

function copyRule(rule: CalendarRule): CalendarRule {
    const copy: CalendarRule = { working: rule.working };
    if (rule.every !== undefined) copy.every = new Set(rule.every);
    if (rule.dates !== undefined) copy.dates = rule.dates.map((date) => new Date(date.getTime()));
    if (rule.start !== undefined) copy.start = new Date(rule.start.getTime());
    if (rule.end !== undefined) copy.end = new Date(rule.end.getTime());
    if (rule.id !== undefined) copy.id = rule.id;
    if (rule.title !== undefined) copy.title = rule.title;
    return copy;
}

function weekdayMask(every: ReadonlySet<number>): number {
    let mask = 0;
    for (const weekday of every) {
        if (!Number.isInteger(weekday) || weekday < 0 || weekday >= DAYS_PER_WEEK) {
            throw new RangeError(`working calendar: weekday ${weekday} is outside 0..6`);
        }
        mask |= 1 << weekday;
    }
    return mask;
}

/** The open-ended week: non-working weekdays minus open-ended working ones. */
function openWeekMask(rules: ReadonlyArray<NormalizedRule>): number {
    let off = 0;
    let working = 0;
    for (const rule of rules) {
        if (rule.mask === undefined || !isOpenEnded(rule.spans[0])) continue;
        if (rule.working) working |= rule.mask;
        else off |= rule.mask;
    }
    return off & ~working;
}

/** The weekdays a mask leaves working. */
function weekdaysOutside(mask: number): ReadonlySet<number> {
    const out = new Set<number>();
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday++) {
        if ((mask & (1 << weekday)) === 0) out.add(weekday);
    }
    return out;
}

function isOpenEnded(span: DaySpan): boolean {
    return span.start === -Infinity && span.end === Infinity;
}

function boundedSpans(rules: ReadonlyArray<NormalizedRule>): RecurringSpan[] {
    const out: RecurringSpan[] = [];
    for (const rule of rules) {
        if (rule.mask === undefined || isOpenEnded(rule.spans[0])) continue;
        out.push({ ...rule.spans[0], working: rule.working, mask: rule.mask });
    }
    return out;
}

/**
 * Split the line into segments with one weekly mask each: the open-ended
 * week, overridden by every active bounded recurrence (working wins ties).
 */
function recurringSegments(openMask: number, bounded: ReadonlyArray<RecurringSpan>): MaskSegment[] {
    const offCount = new Array<number>(DAYS_PER_WEEK).fill(0);
    const workingCount = new Array<number>(DAYS_PER_WEEK).fill(0);
    const apply = (span: RecurringSpan, delta: number) => {
        const counts = span.working ? workingCount : offCount;
        for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday++) {
            if (span.mask & (1 << weekday)) counts[weekday] += delta;
        }
    };
    const currentMask = () => {
        let mask = openMask;
        for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday++) {
            if (offCount[weekday] > 0) mask |= 1 << weekday;
            if (workingCount[weekday] > 0) mask &= ~(1 << weekday);
        }
        return mask;
    };

    const events: Array<{ at: number; span: RecurringSpan; delta: number }> = [];
    for (const span of bounded) {
        if (span.start === -Infinity) apply(span, 1);
        else events.push({ at: span.start, span, delta: 1 });
        if (span.end !== Infinity) events.push({ at: span.end, span, delta: -1 });
    }
    events.sort((a, b) => a.at - b.at);

    const segments: MaskSegment[] = [];
    let start = -Infinity;
    let next = 0;
    for (;;) {
        const end = next < events.length ? events[next].at : Infinity;
        if (start < end) pushMaskSegment(segments, { start, end, mask: currentMask() });
        if (end === Infinity) return segments;
        while (next < events.length && events[next].at === end) {
            apply(events[next].span, events[next].delta);
            next++;
        }
        start = end;
    }
}

function pushMaskSegment(segments: MaskSegment[], segment: MaskSegment): void {
    const previous = segments[segments.length - 1];
    if (previous && previous.mask === segment.mask) previous.end = segment.end;
    else segments.push(segment);
}

/** Disjoint dated stretches, each all-working or all-non-working (working wins ties). */
function datedSegments(rules: ReadonlyArray<NormalizedRule>): DatedSegment[] {
    const events: Array<{ at: number; working: boolean; delta: number }> = [];
    for (const rule of rules) {
        if (rule.mask !== undefined) continue;
        for (const span of rule.spans) {
            events.push({ at: span.start, working: rule.working, delta: 1 });
            events.push({ at: span.end, working: rule.working, delta: -1 });
        }
    }
    events.sort((a, b) => a.at - b.at);

    const segments: DatedSegment[] = [];
    let working = 0;
    let off = 0;
    let next = 0;
    while (next < events.length) {
        const start = events[next].at;
        while (next < events.length && events[next].at === start) {
            if (events[next].working) working += events[next].delta;
            else off += events[next].delta;
            next++;
        }
        if (next === events.length || (working === 0 && off === 0)) continue;
        const kind = working > 0 ? 'working' : 'non-working';
        const end = events[next].at;
        const previous = segments[segments.length - 1];
        if (previous && previous.kind === kind && previous.end === start) previous.end = end;
        else segments.push({ start, end, kind });
    }
    return segments;
}

/** Lay the dated stretches over the weekly segments; dated rules beat recurring ones. */
function overlay(
    segments: ReadonlyArray<MaskSegment>,
    dated: ReadonlyArray<DatedSegment>,
): Piece[] {
    const pieces: Piece[] = [];
    let first = 0;
    for (const segment of segments) {
        while (first < dated.length && dated[first].end <= segment.start) first++;
        let cursor = segment.start;
        for (let i = first; i < dated.length && dated[i].start < segment.end; i++) {
            const start = Math.max(dated[i].start, segment.start);
            const end = Math.min(dated[i].end, segment.end);
            if (cursor < start) pieces.push(maskPiece(cursor, start, segment.mask));
            pieces.push({ start, end, kind: dated[i].kind });
            cursor = end;
        }
        if (cursor < segment.end) pieces.push(maskPiece(cursor, segment.end, segment.mask));
    }
    return pieces;
}

function maskPiece(start: number, end: number, mask: number): Piece {
    const off: boolean[] = [];
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday++) {
        off.push((mask & (1 << weekday)) !== 0);
    }
    const workingPerWeek = off.filter((isOff) => !isOff).length;
    return { start, end, kind: 'mask', off, workingPerWeek };
}

/** Titled dated non-working rules, by first date then input order. */
function titledRules(rules: ReadonlyArray<NormalizedRule>): TitledRule[] {
    const titled: Array<TitledRule & { first: number; order: number }> = [];
    for (const [order, rule] of rules.entries()) {
        const title = rule.copy.title;
        if (rule.mask !== undefined || rule.working || title === undefined) continue;
        if (rule.spans.length === 0) continue;
        const first = rule.spans.reduce((min, span) => Math.min(min, span.start), Infinity);
        titled.push({ title, spans: rule.spans, first, order });
    }
    titled.sort((a, b) => a.first - b.first || a.order - b.order);
    return titled.map(({ title, spans }) => ({ title, spans }));
}

/** First working weekday after the longest cyclic non-working run; ties go Sunday-first. */
function weekStartOf(openMask: number): number | undefined {
    const isOff = (weekday: number) => (openMask & (1 << weekday)) !== 0;
    let best: number | undefined;
    let bestLength = 0;
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday++) {
        if (isOff(weekday) || !isOff((weekday + 6) % DAYS_PER_WEEK)) continue;
        let length = 0;
        while (length < DAYS_PER_WEEK && isOff((weekday + 6 - length) % DAYS_PER_WEEK)) length++;
        if (length > bestLength) {
            best = weekday;
            bestLength = length;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Queries over the resolved pieces (integer UTC day numbers).
// ---------------------------------------------------------------------------

function dayNumber(date: Date): number {
    return Math.round(date.getTime() / DAY_MS);
}

function dateOfDay(day: number): Date {
    return new Date(day * DAY_MS);
}

function weekdayOf(day: number): number {
    return (((day + EPOCH_WEEKDAY) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
}

function remainderScanError(): Error {
    return new Error('working calendar: remainder scan exceeded its cap (internal error)');
}

/** Working days in [from, to), both finite and inside `piece`. */
function workingDaysIn(piece: Piece, from: number, to: number): number {
    if (piece.kind !== 'mask') return piece.kind === 'working' ? to - from : 0;
    const weeks = Math.floor((to - from) / DAYS_PER_WEEK);
    let count = weeks * piece.workingPerWeek;
    for (let day = from + weeks * DAYS_PER_WEEK; day < to; day++) {
        if (!piece.off[weekdayOf(day)]) count++;
    }
    return count;
}

/** The working day `rank` (0-based) at or after `from`; it lies inside `piece`. */
function nthWorkingIn(piece: Piece, from: number, rank: number): number {
    if (piece.kind !== 'mask') return from + rank;
    let day = from + Math.floor(rank / piece.workingPerWeek) * DAYS_PER_WEEK;
    let left = rank % piece.workingPerWeek;
    for (let step = 0; step < MAX_REMAINDER_STEPS; step++, day++) {
        if (piece.off[weekdayOf(day)]) continue;
        if (left === 0) return day;
        left--;
    }
    throw remainderScanError();
}

/** The `rank`-th (1-based) working day before `end`; it lies inside `piece`. */
function nthWorkingBackIn(piece: Piece, end: number, rank: number): number {
    if (piece.kind !== 'mask') return end - rank;
    const weeks = Math.floor((rank - 1) / piece.workingPerWeek);
    let day = end - weeks * DAYS_PER_WEEK;
    let left = rank - weeks * piece.workingPerWeek;
    for (let step = 0; step < MAX_REMAINDER_STEPS; step++) {
        day--;
        if (piece.off[weekdayOf(day)]) continue;
        left--;
        if (left === 0) return day;
    }
    throw remainderScanError();
}

class WorkingDayIndex {
    constructor(
        private readonly pieces: ReadonlyArray<Piece>,
        private readonly titled: ReadonlyArray<TitledRule>,
    ) {}

    isWorkingDay(date: Date): boolean {
        const day = dayNumber(date);
        return Number.isNaN(day) || !this.isNonWorking(day);
    }

    indexOf(base: Date, date: Date): number {
        const baseDay = dayNumber(base);
        const dateDay = dayNumber(date);
        if (Number.isNaN(baseDay) || Number.isNaN(dateDay)) return Number.NaN;
        const snapped = this.nthFrom(dateDay, 0);
        return snapped >= baseDay ? this.count(baseDay, snapped) : -this.count(snapped, baseDay);
    }

    dateAt(base: Date, index: number): Date {
        const baseDay = dayNumber(base);
        const rank = Math.floor(index);
        if (Number.isNaN(baseDay) || !Number.isFinite(rank) || Math.abs(rank) > MAX_WORKING_INDEX) {
            return new Date(Number.NaN);
        }
        return dateOfDay(rank >= 0 ? this.nthFrom(baseDay, rank) : this.nthBefore(baseDay, -rank));
    }

    runs(fromDate: Date, toDate: Date): NonWorkingRun[] {
        const from = dayNumber(fromDate);
        const to = dayNumber(toDate);
        if (Number.isNaN(from) || Number.isNaN(to) || from >= to) return [];
        const out: NonWorkingRun[] = [];
        let day = this.isNonWorking(from)
            ? this.nthBefore(from, 1) + 1
            : this.nextNonWorking(from, to);
        while (day < to) {
            const through = this.nthFrom(day, 0) - 1;
            out.push({
                from: dateOfDay(day),
                through: dateOfDay(through),
                titles: this.titlesIn(day, through),
            });
            day = this.nextNonWorking(through + 1, to);
        }
        return out;
    }

    private pieceAt(day: number): number {
        let low = 0;
        let high = this.pieces.length - 1;
        while (low < high) {
            const middle = (low + high) >> 1;
            if (day >= this.pieces[middle].end) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    private isNonWorking(day: number): boolean {
        const piece = this.pieces[this.pieceAt(day)];
        if (piece.kind === 'mask') return piece.off[weekdayOf(day)];
        return piece.kind === 'non-working';
    }

    /** Working days in [from, to), from <= to. */
    private count(from: number, to: number): number {
        let total = 0;
        for (let i = this.pieceAt(from); i < this.pieces.length && this.pieces[i].start < to; i++) {
            const piece = this.pieces[i];
            total += workingDaysIn(piece, Math.max(from, piece.start), Math.min(to, piece.end));
        }
        return total;
    }

    /** The working day `rank` (0-based) at or after `day`. */
    private nthFrom(day: number, rank: number): number {
        let position = day;
        let left = rank;
        for (let i = this.pieceAt(day); i < this.pieces.length; i++) {
            const piece = this.pieces[i];
            if (piece.end === Infinity) return nthWorkingIn(piece, position, left);
            const available = workingDaysIn(piece, position, piece.end);
            if (left < available) return nthWorkingIn(piece, position, left);
            left -= available;
            position = piece.end;
        }
        throw new Error('working calendar: forward walk left the last piece (internal error)');
    }

    /** The `rank`-th (1-based) working day before `day`. */
    private nthBefore(day: number, rank: number): number {
        let position = day;
        let left = rank;
        for (let i = this.pieceAt(day - 1); i >= 0; i--) {
            const piece = this.pieces[i];
            if (piece.start === -Infinity) return nthWorkingBackIn(piece, position, left);
            const available = workingDaysIn(piece, piece.start, position);
            if (left <= available) return nthWorkingBackIn(piece, position, left);
            left -= available;
            position = piece.start;
        }
        throw new Error('working calendar: backward walk left the first piece (internal error)');
    }

    /** First non-working day in [day, limit), or `limit`. */
    private nextNonWorking(day: number, limit: number): number {
        for (
            let i = this.pieceAt(day);
            i < this.pieces.length && this.pieces[i].start < limit;
            i++
        ) {
            const piece = this.pieces[i];
            const from = Math.max(day, piece.start);
            if (piece.kind === 'non-working') return from;
            if (piece.kind !== 'mask' || piece.workingPerWeek === DAYS_PER_WEEK) continue;
            for (let offset = 0; offset < DAYS_PER_WEEK && from + offset < piece.end; offset++) {
                if (piece.off[weekdayOf(from + offset)]) return from + offset;
            }
        }
        return limit;
    }

    /** Titles of the titled dated non-working rules with a day in [from, through]. */
    private titlesIn(from: number, through: number): string[] {
        const titles: string[] = [];
        for (const rule of this.titled) {
            if (rule.spans.some((span) => span.start <= through && span.end > from)) {
                titles.push(rule.title);
            }
        }
        return titles;
    }
}
