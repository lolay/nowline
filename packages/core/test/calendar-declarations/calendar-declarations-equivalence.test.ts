// `classifyCalendarDeclaration` against the validator's copy
// (specs/core-ast-utilities.md §5): the same own keys, shape, single dates,
// weekdays and well-formedness over every declaration in the samples and the
// test fixtures. The test goes with the copy, which m2.s3 replaces.

import { describe, expect, it } from 'vitest';
import {
    classifyCalendarDeclaration,
    isWeekday,
} from '../../src/language/calendar-declarations.js';
import {
    calendarOwnProps,
    hasCalendarShape,
    isHalfBoundedRecurrence,
    isOpenEndedRecurrence,
    isWellFormedCalendarDeclaration,
    scalarDate,
    weekdaysOf,
} from '../../src/language/nowline-validator.js';
import { calendarDeclarationCorpus } from './corpus.js';

const corpus = await calendarDeclarationCorpus();

// The validator's copy tests weekday names with `in`, so it also takes a name
// `Object.prototype` holds (`every:constructor`); the classifier does not.
const inheritedName = (names: string[]): boolean =>
    names.some((name) => !isWeekday(name) && name in {});

describe('classifyCalendarDeclaration agrees with the validator', () => {
    it('covers the samples and the fixtures', (): void => {
        expect(corpus.filter((e) => e.label.endsWith('.nowline')).length).toBeGreaterThan(5);
        expect(corpus.length).toBeGreaterThan(60);
    });

    it.each(corpus.map((entry) => [entry.label, entry] as const))(
        '%s',
        (_label, { decl }): void => {
            const facts = classifyCalendarDeclaration(decl);
            const own = calendarOwnProps(decl);
            expect([...facts.own.entries()]).toEqual([...own.entries()]);
            expect(facts.shape !== 'malformed').toBe(hasCalendarShape(own));
            // The validator asks these two of well-shaped declarations only (`usable`);
            // they ignore `date:`, which makes any recurrence malformed.
            if (hasCalendarShape(own)) {
                expect(facts.shape === 'open-recurrence').toBe(isOpenEndedRecurrence(decl));
                expect(facts.shape === 'half-bounded-recurrence').toBe(
                    isHalfBoundedRecurrence(decl),
                );
            }
            expect(facts.start).toBe(scalarDate(own.get('start')));
            expect(facts.end).toBe(scalarDate(own.get('end')));

            const every = own.get('every');
            const names = every ? (every.value !== undefined ? [every.value] : every.values) : [];
            if (inheritedName(names)) {
                expect(facts.wellFormed).toBe(false);
                return;
            }
            expect(facts.wellFormed).toBe(isWellFormedCalendarDeclaration(decl));
            if (facts.wellFormed) expect(facts.weekdays ?? []).toEqual(weekdaysOf(decl));
        },
    );
});
