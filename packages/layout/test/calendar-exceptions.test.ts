// `calendarExceptions` is the one derivation the MS Project and Mermaid
// exporters share (specs/working-calendar.md §8; m2p phase 5b): the days on
// which the file's calendar differs from its open-ended week, as maximal runs
// split wherever the working state flips. Examples A to E are the spec's §10.
// `(guard)` marks a case that is green before and after the change.

import { describe, expect, it } from 'vitest';
import {
    type CalendarException,
    calendarExceptions,
    layoutRoadmap,
    resolveWorkingCalendar,
} from '../src/index.js';
import { parseAndResolve } from './helpers.js';

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

interface IsoException {
    from: string;
    through: string;
    working: boolean;
    titles?: string[];
}

/** `body` (the roadmap and everything after it) behind a config block holding `declarations`. */
function withDeclarations(body: string, declarations: string[]): string {
    if (declarations.length === 0) return `nowline v1\n\n${body}`;
    return `nowline v1\n\nconfig\n\n${declarations.join('\n')}\n\n${body}`;
}

async function exceptionsOf(source: string): Promise<{
    raw: CalendarException[];
    exceptions: IsoException[];
    endDate: Date;
}> {
    const { file, resolved } = await parseAndResolve(source);
    const { working } = resolveWorkingCalendar(file, resolved);
    const model = layoutRoadmap(file, resolved, { theme: 'light', today: utc(2026, 2, 9) });
    const raw = calendarExceptions(working, model.timeline.startDate, model.timeline.endDate);
    return {
        raw,
        endDate: model.timeline.endDate,
        exceptions: raw.map((e) => ({
            from: iso(e.from),
            through: iso(e.through),
            working: e.working,
            ...(e.titles === undefined ? {} : { titles: e.titles }),
        })),
    };
}

const EXAMPLE_A_BODY = `roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;

const EXAMPLE_B_BODY = `roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
`;

const exampleA = (declarations: string[] = []) => withDeclarations(EXAMPLE_A_BODY, declarations);
const exampleB = (declarations: string[]) => withDeclarations(EXAMPLE_B_BODY, declarations);

const THANKSGIVING = 'non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27';
const CRUNCH = 'working crunch "Crunch Saturday" date:2026-01-10';

describe('calendarExceptions', () => {
    it('Example B: Thanksgiving is one titled non-working exception', async () => {
        const { exceptions } = await exceptionsOf(exampleB([THANKSGIVING]));
        expect(exceptions).toEqual([
            { from: '2026-11-26', through: '2026-11-27', working: false, titles: ['Thanksgiving'] },
        ]);
    });

    it('returns UTC midnight dates', async () => {
        const { raw } = await exceptionsOf(exampleB([THANKSGIVING]));
        expect(raw[0].from.getTime()).toBe(Date.UTC(2026, 10, 26));
        expect(raw[0].through.getTime()).toBe(Date.UTC(2026, 10, 27));
    });

    it('Example D: a working Saturday is one working exception', async () => {
        const { exceptions } = await exceptionsOf(exampleA([CRUNCH]));
        expect(exceptions).toEqual([
            {
                from: '2026-01-10',
                through: '2026-01-10',
                working: true,
                titles: ['Crunch Saturday'],
            },
        ]);
    });

    it('Example E row 1: a bounded Friday closure is one exception per Friday, untitled', async () => {
        const { exceptions } = await exceptionsOf(
            exampleA(['non-working every:fri start:2026-01-12 end:2026-01-25']),
        );
        expect(exceptions).toEqual([
            { from: '2026-01-16', through: '2026-01-16', working: false },
            { from: '2026-01-23', through: '2026-01-23', working: false },
        ]);
        for (const e of exceptions) expect('titles' in e).toBe(false);
    });

    it('Example E row 2: a dated closure on a weekend matches the open week, so it is no exception', async () => {
        const { exceptions } = await exceptionsOf(
            exampleA([
                'working every:sat start:2026-01-12 end:2026-01-25',
                'non-working date:2026-01-17',
            ]),
        );
        expect(exceptions).toEqual([{ from: '2026-01-24', through: '2026-01-24', working: true }]);
    });

    describe("Example E's titles", () => {
        const beta = 'non-working "Beta" start:2026-12-24 end:2026-12-25';
        const alpha = 'non-working "Alpha" date:2026-12-24';
        const body = `roadmap r "R" start:2026-12-21 scale:1w

swimlane a "A"
  item one "One" duration:1w
`;

        it('lists Alpha before Beta, whichever is written first', async () => {
            for (const order of [
                [beta, alpha],
                [alpha, beta],
            ]) {
                const { exceptions } = await exceptionsOf(withDeclarations(body, order));
                expect(exceptions).toEqual([
                    {
                        from: '2026-12-24',
                        through: '2026-12-25',
                        working: false,
                        titles: ['Alpha', 'Beta'],
                    },
                ]);
            }
        });
    });

    it('also lists a declared holiday outside the roadmap window', async () => {
        const { exceptions, endDate } = await exceptionsOf(
            exampleB([THANKSGIVING, 'non-working newyear "New Year" date:2027-01-01']),
        );
        expect(endDate.getTime()).toBeLessThan(Date.UTC(2027, 0, 1));
        expect(exceptions).toEqual([
            { from: '2026-11-26', through: '2026-11-27', working: false, titles: ['Thanksgiving'] },
            { from: '2027-01-01', through: '2027-01-01', working: false, titles: ['New Year'] },
        ]);
    });

    it('expands a half-open recurrence only inside the window', async () => {
        const { exceptions, endDate } = await exceptionsOf(
            exampleA(['non-working every:wed start:2026-01-20']),
        );
        const wednesdays: IsoException[] = [];
        for (let t = Date.UTC(2026, 0, 21); t < endDate.getTime(); t += 7 * 86_400_000) {
            const day = iso(new Date(t));
            wednesdays.push({ from: day, through: day, working: false });
        }
        expect(wednesdays.length).toBeGreaterThan(1);
        expect(exceptions).toEqual(wednesdays);
    });

    it.each([
        ['business', 'roadmap r "R" start:2026-01-05 calendar:business'],
        ['full', 'roadmap r "R" start:2026-01-05 calendar:full'],
    ])('%s with no declaration has no exceptions (guard)', async (_name, header) => {
        const { exceptions } = await exceptionsOf(
            `nowline v1\n\n${header}\n\nswimlane a "A"\n  item one "One" duration:2w\n`,
        );
        expect(exceptions).toEqual([]);
    });

    it('custom with no declaration has no exceptions (guard)', async () => {
        const { exceptions } = await exceptionsOf(`nowline v1

config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312

roadmap r "R" start:2026-01-05 calendar:custom

swimlane a "A"
  item one "One" duration:2w
`);
        expect(exceptions).toEqual([]);
    });

    it('a weekend the preset already closes is no exception (guard)', async () => {
        const { exceptions } = await exceptionsOf(
            exampleB(['non-working "Sat off" date:2026-11-28']),
        );
        expect(exceptions).toEqual([]);
    });
});
