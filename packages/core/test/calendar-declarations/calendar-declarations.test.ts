import { describe, expect, it } from 'vitest';
import {
    isNonWorkingDeclaration,
    isWorkingDeclaration,
    type NonWorkingDeclaration,
    type WorkingDeclaration,
} from '../../src/generated/ast.js';
import {
    type CalendarDeclarationFacts,
    classifyCalendarDeclaration,
    isWeekday,
    replacesPresetWeekend,
    WEEKDAY_INDEX,
    WEEKDAYS,
} from '../../src/language/calendar-declarations.js';
import { parse } from '../helpers.js';

// specs/core-ast-utilities.md §3.4: one reading of a `non-working` / `working`
// declaration for the validator, layout and LSP hover.

type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

async function declarationsOf(lines: string): Promise<CalendarDeclaration[]> {
    const { ast } = await parse(
        `config\n\n${lines}\n\nroadmap r start:2026-01-05\nswimlane s\n  item x duration:1w\n`,
        { validate: false },
    );
    return ast.configEntries.filter(
        (e): e is CalendarDeclaration => isNonWorkingDeclaration(e) || isWorkingDeclaration(e),
    );
}

async function classify(line: string): Promise<CalendarDeclarationFacts> {
    const [decl] = await declarationsOf(line);
    if (!decl) throw new Error(`no calendar declaration in: ${line}`);
    return classifyCalendarDeclaration(decl);
}

/** The facts without the property nodes, for exact comparison. */
async function summary(line: string): Promise<Record<string, unknown>> {
    const { own, ...rest } = await classify(line);
    return { own: [...own.keys()], ...rest };
}

describe('weekday tables', () => {
    it('numbers the weekdays the way Date#getUTCDay does', (): void => {
        expect(WEEKDAYS.map((day) => WEEKDAY_INDEX[day])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('knows the seven names and nothing inherited', (): void => {
        expect(WEEKDAYS.every(isWeekday)).toBe(true);
        expect(isWeekday('monday')).toBe(false);
        expect(isWeekday('constructor')).toBe(false);
        expect(isWeekday('toString')).toBe(false);
    });
});

describe('classifyCalendarDeclaration', () => {
    it('reads a dated declaration', async (): Promise<void> => {
        expect(await summary('non-working h date:[2026-01-01, 2026-12-25]')).toEqual({
            own: ['date'],
            shape: 'dated',
            dates: ['2026-01-01', '2026-12-25'],
            wellFormed: true,
        });
    });

    it('reads a range', async (): Promise<void> => {
        expect(await summary('non-working h start:2026-08-03 end:2026-08-14')).toEqual({
            own: ['start', 'end'],
            shape: 'range',
            start: '2026-08-03',
            end: '2026-08-14',
            wellFormed: true,
        });
    });

    it('reads a one-element bracket as the single date', async (): Promise<void> => {
        const facts = await classify('non-working h start:[2026-08-03] end:2026-08-14');
        expect(facts.start).toBe('2026-08-03');
        expect(facts.wellFormed).toBe(true);
    });

    it('reads an open recurrence', async (): Promise<void> => {
        expect(await summary('non-working fridays every:fri')).toEqual({
            own: ['every'],
            shape: 'open-recurrence',
            weekdays: [5],
            wellFormed: true,
        });
    });

    it.each([
        ['non-working h every:[sat, sun] start:2026-01-12', 'half-bounded-recurrence'],
        ['non-working h every:[sat, sun] end:2026-01-12', 'half-bounded-recurrence'],
        ['working h every:sat start:2026-01-12 end:2026-01-25', 'bounded-recurrence'],
    ])('reads %s as a %s', async (line, shape): Promise<void> => {
        const facts = await classify(line);
        expect(facts.shape).toBe(shape);
        expect(facts.wellFormed).toBe(true);
    });

    it.each([
        'non-working h date:2026-01-01 every:fri',
        'non-working h date:2026-01-01 start:2026-01-01',
        'non-working h start:2026-01-01',
        'non-working h end:2026-01-01',
        'non-working h',
        'non-working h style:x',
    ])('reads %s as malformed', async (line): Promise<void> => {
        const facts = await classify(line);
        expect(facts.shape).toBe('malformed');
        expect(facts.wellFormed).toBe(false);
    });

    it('counts only the first occurrence of each own key', async (): Promise<void> => {
        const facts = await classify('non-working h date:2026-01-01 date:2026-02-30 style:x');
        expect([...facts.own.keys()]).toEqual(['date']);
        expect(facts.dates).toEqual(['2026-01-01']);
        expect(facts.wellFormed).toBe(true);
    });

    it('leaves dates undefined when one is not a real day', async (): Promise<void> => {
        const facts = await classify('non-working h date:[2026-01-01, 2026-02-30]');
        expect(facts.shape).toBe('dated');
        expect(facts.dates).toBeUndefined();
        expect(facts.wellFormed).toBe(false);
    });

    it('rejects a start: or end: that rolls over or is a list', async (): Promise<void> => {
        const rolled = await classify('non-working h start:2026-02-30 end:2026-03-05');
        expect(rolled.start).toBeUndefined();
        expect(rolled.end).toBe('2026-03-05');
        expect(rolled.wellFormed).toBe(false);
        const list = await classify('non-working h start:[2026-01-01, 2026-01-02] end:2026-03-05');
        expect(list.start).toBeUndefined();
        expect(list.wellFormed).toBe(false);
    });

    it('rejects an end before the start, and accepts an equal one', async (): Promise<void> => {
        expect((await classify('non-working h start:2026-03-05 end:2026-03-04')).wellFormed).toBe(
            false,
        );
        expect((await classify('non-working h start:2026-03-05 end:2026-03-05')).wellFormed).toBe(
            true,
        );
    });

    it('leaves weekdays undefined when a name is unknown', async (): Promise<void> => {
        for (const line of [
            'non-working h every:[fri, funday]',
            'non-working h every:constructor',
        ]) {
            const facts = await classify(line);
            expect(facts.weekdays).toBeUndefined();
            expect(facts.wellFormed).toBe(false);
        }
    });

    it('keeps a weekday listed twice', async (): Promise<void> => {
        const facts = await classify('non-working h every:[sat, sat]');
        expect(facts.weekdays).toEqual([6, 6]);
        expect(facts.wellFormed).toBe(true);
    });
});

describe('replacesPresetWeekend', () => {
    it('is true only for a non-working declaration named weekend', async (): Promise<void> => {
        expect(replacesPresetWeekend(await declarationsOf('non-working weekend every:fri'))).toBe(
            true,
        );
        expect(replacesPresetWeekend(await declarationsOf('working weekend every:sat'))).toBe(
            false,
        );
        expect(replacesPresetWeekend(await declarationsOf('non-working fridays every:fri'))).toBe(
            false,
        );
        expect(replacesPresetWeekend([])).toBe(false);
    });
});
