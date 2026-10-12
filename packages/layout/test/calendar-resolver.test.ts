// One resolver for the file's calendar (specs/working-calendar.md §8): the
// layout, engine C and the three exporters all read the same `CalendarConfig`
// and `WorkingCalendar` through `resolveWorkingCalendar`, so the chart, the
// XLSX, the MS Project XML and the Mermaid gantt agree on what `1w` means.
//
// Every expectation is a literal, derived by hand from the presets
// (business 5/22/65/260, full 7/30/91/365) and from the custom block below
// (6/26/78/312), never computed with the code under test.

import { describe, expect, it } from 'vitest';
import {
    type CalendarConfig,
    type CalendarMode,
    layoutRoadmap,
    type PositionedNonWorkingRun,
    type ResolvedCalendar,
    resolveWorkingCalendar,
    scheduleRoadmap,
    type WorkingCalendar,
} from '../src/index.js';
import { continuousCalendar, fromCalendarConfig } from '../src/working-calendar.js';
import { parseAndResolve, parseAndResolveFiles } from './helpers.js';

const CUSTOM_BLOCK = `config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312
`;

const SOURCES: Record<CalendarMode, string> = {
    business: `nowline v1

roadmap r "R" start:2026-01-05

swimlane s "S"
  item a "A" duration:1w
`,
    full: `nowline v1

roadmap r "R" start:2026-01-05 calendar:full

swimlane s "S"
  item a "A" duration:1w
`,
    custom: `nowline v1

${CUSTOM_BLOCK}
roadmap r "R" start:2026-01-05 calendar:custom

swimlane s "S"
  item a "A" duration:1w
`,
};

const CONFIGS: Record<CalendarMode, CalendarConfig> = {
    business: {
        mode: 'business',
        daysPerWeek: 5,
        daysPerMonth: 22,
        daysPerQuarter: 65,
        daysPerYear: 260,
    },
    full: {
        mode: 'full',
        daysPerWeek: 7,
        daysPerMonth: 30,
        daysPerQuarter: 91,
        daysPerYear: 365,
    },
    custom: {
        mode: 'custom',
        daysPerWeek: 6,
        daysPerMonth: 26,
        daysPerQuarter: 78,
        daysPerYear: 312,
    },
};

/** The weekday numbers of a set, ascending (0 = Sunday). */
function sorted(weekdays: ReadonlySet<number>): number[] {
    return [...weekdays].sort((a, b) => a - b);
}

async function resolve(mode: CalendarMode): Promise<ResolvedCalendar> {
    const { file, resolved } = await parseAndResolve(SOURCES[mode]);
    return resolveWorkingCalendar(file, resolved);
}

describe('resolveWorkingCalendar', () => {
    it.each<CalendarMode>(['business', 'full', 'custom'])(
        'resolves the %s config from the roadmap declaration and calendar block',
        async (mode) => {
            const { config } = await resolve(mode);
            expect(config).toEqual(CONFIGS[mode]);
        },
    );

    it('business: the working calendar has a weekend, 5/22/65/260 days a unit', async () => {
        const { working } = await resolve('business');
        expect(working.hasNonWorkingDays).toBe(true);
        expect(working.isWorkingDay(new Date(Date.UTC(2026, 0, 9)))).toBe(true); // Friday
        expect(working.isWorkingDay(new Date(Date.UTC(2026, 0, 10)))).toBe(false); // Saturday
        expect(working.daysPerUnit('weeks')).toBe(5);
        expect(working.daysPerUnit('months')).toBe(22);
        expect(working.daysPerUnit('quarters')).toBe(65);
        expect(working.daysPerUnit('years')).toBe(260);
    });

    it('full: the working calendar has no days off, 7/30/91/365 days a unit', async () => {
        const { working } = await resolve('full');
        expect(working.hasNonWorkingDays).toBe(false);
        expect(working.isWorkingDay(new Date(Date.UTC(2026, 0, 10)))).toBe(true);
        expect(working.daysPerUnit('weeks')).toBe(7);
        expect(working.daysPerUnit('months')).toBe(30);
        expect(working.daysPerUnit('quarters')).toBe(91);
        expect(working.daysPerUnit('years')).toBe(365);
    });

    it('custom: the working calendar has no days off, 6/26/78/312 days a unit', async () => {
        const { working } = await resolve('custom');
        expect(working.hasNonWorkingDays).toBe(false);
        expect(working.isWorkingDay(new Date(Date.UTC(2026, 0, 10)))).toBe(true);
        expect(working.daysPerUnit('weeks')).toBe(6);
        expect(working.daysPerUnit('months')).toBe(26);
        expect(working.daysPerUnit('quarters')).toBe(78);
        expect(working.daysPerUnit('years')).toBe(312);
    });

    it('defaults to business when the roadmap declares no calendar', async () => {
        const { file, resolved } = await parseAndResolve(
            'nowline v1\n\nroadmap r "R"\n\nswimlane s "S"\n  item a "A" duration:1w\n',
        );
        const { config, working } = resolveWorkingCalendar(file, resolved);
        expect(config).toEqual(CONFIGS.business);
        expect(working.hasNonWorkingDays).toBe(true);
    });

    it('agrees with fromCalendarConfig on the same config', async () => {
        for (const mode of ['business', 'full', 'custom'] as const) {
            const { config, working } = await resolve(mode);
            const direct = fromCalendarConfig(config);
            expect(working.hasNonWorkingDays).toBe(direct.hasNonWorkingDays);
            expect(sorted(working.workingWeekdays)).toEqual(sorted(direct.workingWeekdays));
        }
    });
});

describe('WorkingCalendar.workingWeekdays', () => {
    it('is Monday to Friday for the business preset', async () => {
        const { working } = await resolve('business');
        expect(sorted(working.workingWeekdays)).toEqual([1, 2, 3, 4, 5]);
        expect(sorted(fromCalendarConfig(CONFIGS.business).workingWeekdays)).toEqual([
            1, 2, 3, 4, 5,
        ]);
    });

    it('is all seven days for calendar:full', async () => {
        const { working } = await resolve('full');
        expect(sorted(working.workingWeekdays)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(sorted(fromCalendarConfig(CONFIGS.full).workingWeekdays)).toEqual([
            0, 1, 2, 3, 4, 5, 6,
        ]);
    });

    it('is all seven days for calendar:custom', async () => {
        const { working } = await resolve('custom');
        expect(sorted(working.workingWeekdays)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(sorted(fromCalendarConfig(CONFIGS.custom).workingWeekdays)).toEqual([
            0, 1, 2, 3, 4, 5, 6,
        ]);
    });

    it('is all seven days for continuousCalendar()', () => {
        expect(sorted(continuousCalendar().workingWeekdays)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('follows an open-ended week rule: a Friday and Saturday weekend works Sunday to Thursday', () => {
        const cal: WorkingCalendar = fromCalendarConfig(CONFIGS.business, [
            { working: false, every: new Set([5, 6]) },
        ]);
        expect(sorted(cal.workingWeekdays)).toEqual([0, 1, 2, 3, 4]);
    });

    it('ignores dated rules and bounded recurrences, which are not the open-ended week', () => {
        const cal: WorkingCalendar = fromCalendarConfig(CONFIGS.business, [
            { working: false, every: new Set([0, 6]) },
            { working: false, dates: [new Date(Date.UTC(2026, 11, 25))] },
            {
                working: true,
                every: new Set([6]),
                start: new Date(Date.UTC(2026, 0, 1)),
                end: new Date(Date.UTC(2026, 2, 31)),
            },
        ]);
        expect(sorted(cal.workingWeekdays)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe('RoadmapSchedule.calendar', () => {
    it.each<CalendarMode>(['business', 'full', 'custom'])(
        'carries the %s calendar the schedule was built with',
        async (mode) => {
            const { file, resolved } = await parseAndResolve(SOURCES[mode]);
            const schedule = scheduleRoadmap(file, resolved, {});
            expect(schedule.calendar.config).toEqual(CONFIGS[mode]);
            expect(schedule.calendar.working.hasNonWorkingDays).toBe(mode === 'business');
            expect(sorted(schedule.calendar.working.workingWeekdays)).toEqual(
                mode === 'business' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
            );
        },
    );

    it('is the same calendar the resolver returns for the file', async () => {
        const { file, resolved } = await parseAndResolve(SOURCES.custom);
        const schedule = scheduleRoadmap(file, resolved, {});
        expect(schedule.calendar.config).toEqual(resolveWorkingCalendar(file, resolved).config);
    });
});

// ---------------------------------------------------------------------------
// Declarations (m2p phase 5a): `non-working` and `working` in `config` become
// the calendar's rules (specs/working-calendar.md §4, §5). `(guard)` marks a
// case that is green before and after the change.
// ---------------------------------------------------------------------------

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

const ITEM = 'swimlane s "S"\n  item a "A" duration:1w\n';

/** A file whose config block holds `declarations`, on the given roadmap properties. */
const declared = (declarations: string[], roadmapProps = ''): string =>
    `nowline v1\n\nconfig\n\n${declarations.join('\n')}\n\nroadmap r "R" start:2026-01-05${roadmapProps}\n\n${ITEM}`;

async function weekdaysOf(source: string): Promise<number[]> {
    const { file, resolved } = await parseAndResolve(source);
    return sorted(resolveWorkingCalendar(file, resolved).working.workingWeekdays);
}

describe('weekend replacement (decision 14)', () => {
    it('adds: business with non-working fridays every:fri works Monday to Thursday', async () => {
        expect(await weekdaysOf(declared(['non-working fridays every:fri']))).toEqual([1, 2, 3, 4]);
    });

    it('replaces: business with non-working weekend every:[fri, sat] works Sunday to Thursday', async () => {
        expect(await weekdaysOf(declared(['non-working weekend every:[fri, sat]']))).toEqual([
            0, 1, 2, 3, 4,
        ]);
    });

    it('replaces on any preset: full with non-working weekend every:[sat, sun] works Monday to Friday', async () => {
        expect(
            await weekdaysOf(declared(['non-working weekend every:[sat, sun]'], ' calendar:full')),
        ).toEqual([1, 2, 3, 4, 5]);
    });

    it("a config:merge child's non-working weekend replaces the preset in the parent", async () => {
        const { file, resolved } = await parseAndResolveFiles({
            'main.nowline': `nowline v1\n\ninclude "./child.nowline" config:merge\n\nroadmap r "R" start:2026-01-05 calendar:business\n\n${ITEM}`,
            'child.nowline': 'nowline v1\n\nconfig\n\nnon-working weekend every:[fri, sat]\n',
        });
        expect(resolved.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(sorted(resolveWorkingCalendar(file, resolved).working.workingWeekdays)).toEqual([
            0, 1, 2, 3, 4,
        ]);
    });

    it('a working declaration named weekend leaves the preset in place', async () => {
        expect(await weekdaysOf(declared(['working weekend every:sat']))).toEqual([
            1, 2, 3, 4, 5, 6,
        ]);
    });

    it('with no declarations each preset keeps its rules and workingWeekdays (guard)', async () => {
        const rulesOf = async (mode: CalendarMode) => {
            const { working } = await resolve(mode);
            return working.rules.map((r) => ({
                id: r.id,
                title: r.title,
                working: r.working,
                every: [...(r.every ?? [])].sort((a, b) => a - b),
            }));
        };
        expect(await rulesOf('business')).toEqual([
            { id: 'weekend', title: 'Weekend', working: false, every: [0, 6] },
        ]);
        expect(await rulesOf('full')).toEqual([]);
        expect(await rulesOf('custom')).toEqual([]);
        expect(sorted((await resolve('business')).working.workingWeekdays)).toEqual([
            1, 2, 3, 4, 5,
        ]);
        expect(sorted((await resolve('full')).working.workingWeekdays)).toEqual([
            0, 1, 2, 3, 4, 5, 6,
        ]);
    });
});

describe('reorder invariance (decision 18)', () => {
    // Example A (four chained 1w items and a Friday milestone) plus declarations.
    const exampleA = (config: string, include = '') =>
        `nowline v1\n\n${include}${config}roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;
    const inFile = (declarations: string[]) => exampleA(`config\n\n${declarations.join('\n')}\n\n`);

    // Each pair of declarations in its source order and the reverse, with engine C's W4.
    const cases: Array<{ name: string; declarations: [string, string]; w4: [string, string] }> = [
        {
            name: 'a dated closure over a bounded working Saturday',
            declarations: [
                'working every:sat start:2026-01-12 end:2026-01-25',
                'non-working date:2026-01-17',
            ],
            w4: ['2026-01-24', '2026-01-30'],
        },
        {
            name: 'a dated working tie (guard)',
            declarations: ['non-working date:2026-01-14', 'working date:2026-01-14'],
            w4: ['2026-01-26', '2026-01-31'],
        },
        {
            name: 'a bounded working tie (guard)',
            declarations: [
                'non-working every:wed start:2026-01-12 end:2026-01-25',
                'working every:wed start:2026-01-12 end:2026-01-25',
            ],
            w4: ['2026-01-26', '2026-01-31'],
        },
    ];

    async function results(source: string, files?: Record<string, string>) {
        const { file, resolved } = files
            ? await parseAndResolveFiles({ 'main.nowline': source, ...files })
            : await parseAndResolve(source);
        const model = layoutRoadmap(file, resolved, {
            theme: 'light',
            today: utc(2026, 2, 9),
            nonWorking: 'hide',
        } as Parameters<typeof layoutRoadmap>[2]);
        const schedule = scheduleRoadmap(file, resolved);
        const w4 = schedule.items.get('w4')!;
        return {
            model,
            w4: [iso(w4.start), iso(w4.end)],
            items: [...schedule.items].map(([id, i]) => [id, iso(i.start), iso(i.end)]),
            rules: schedule.calendar.working.rules,
        };
    }

    for (const { name, declarations, w4 } of cases) {
        const reversed = [...declarations].reverse();

        it(`${name}: either order gives the same layout and engine C`, async () => {
            const forward = await results(inFile(declarations));
            const backward = await results(inFile(reversed));
            expect(forward.w4).toEqual(w4);
            expect(backward.w4).toEqual(w4);
            expect(backward.items).toEqual(forward.items);
            expect(backward.model).toEqual(forward.model);
            expect(backward.rules).toEqual(forward.rules);
        });

        it(`${name}: the same declarations in a config:merge include give the same results`, async () => {
            const direct = await results(inFile(declarations));
            for (const order of [declarations, reversed]) {
                const merged = await results(
                    exampleA('', 'include "./cal.nowline" config:merge\n\n'),
                    { 'cal.nowline': `config\n\n${order.join('\n')}\n` },
                );
                expect(merged.w4).toEqual(w4);
                expect(merged.items).toEqual(direct.items);
                expect(merged.model).toEqual(direct.model);
            }
        });
    }

    describe('two titled dated rules that start the same day', () => {
        const beta = 'non-working "Beta" start:2026-12-24 end:2026-12-25';
        const alpha = 'non-working "Alpha" date:2026-12-24';
        const file = (declarations: string[]) =>
            `nowline v1\n\nconfig\n\n${declarations.join('\n')}\n\nroadmap r "R" start:2026-12-21 scale:1w\n\n${ITEM}`;

        async function calendarOf(declarations: string[]) {
            const { file: ast, resolved } = await parseAndResolve(file(declarations));
            const { working } = resolveWorkingCalendar(ast, resolved);
            const model = layoutRoadmap(ast, resolved, {
                theme: 'light',
                today: utc(2026, 2, 9),
            });
            return { working, model };
        }

        it('lists Alpha before Beta in the run titles, whichever is written first', async () => {
            for (const order of [
                [beta, alpha],
                [alpha, beta],
            ]) {
                const { working } = await calendarOf(order);
                const run = working
                    .nonWorkingRuns(utc(2026, 12, 21), utc(2026, 12, 29))
                    .find((r) => iso(r.from) === '2026-12-24');
                expect(run, 'the holiday run').toBeDefined();
                expect(iso(run!.through)).toBe('2026-12-27');
                expect(run!.titles).toEqual(['Alpha', 'Beta']);
            }
        });

        it('draws the same titles in the layout run, whichever is written first', async () => {
            for (const order of [
                [beta, alpha],
                [alpha, beta],
            ]) {
                const { model } = await calendarOf(order);
                const run = ((model.timeline.nonWorking ?? []) as PositionedNonWorkingRun[]).find(
                    (r) => iso(r.from) === '2026-12-24',
                );
                expect(run?.titles).toEqual(['Alpha', 'Beta']);
            }
        });

        it('keeps working.rules in one order for either file order', async () => {
            const forward = await calendarOf([beta, alpha]);
            const backward = await calendarOf([alpha, beta]);
            expect(forward.working.rules.map((r) => r.title)).toEqual(
                backward.working.rules.map((r) => r.title),
            );
            expect(forward.working.rules.map((r) => r.title)).toContain('Alpha');
        });
    });
});

describe('an included file that closes the whole week', () => {
    const closeAll = 'non-working every:[sun, mon, tue, wed, thu, fri, sat]';
    const files = {
        'main.nowline': `nowline v1\n\ninclude "./closed.nowline"\n\nroadmap r "R" start:2026-01-05 calendar:business\n\n${ITEM}`,
        'closed.nowline': `nowline v1\n\nconfig\n\n${closeAll}\n`,
    };

    it('neither layoutRoadmap nor scheduleRoadmap throws (guard until the resolver reads declarations)', async () => {
        const { file, resolved } = await parseAndResolveFiles(files);
        expect(() =>
            layoutRoadmap(file, resolved, { theme: 'light', today: utc(2026, 2, 9) }),
        ).not.toThrow();
        expect(() => scheduleRoadmap(file, resolved)).not.toThrow();
    });

    it('falls back to the preset calendar', async () => {
        const { file, resolved } = await parseAndResolveFiles(files);
        const { working } = resolveWorkingCalendar(file, resolved);
        expect(sorted(working.workingWeekdays)).toEqual([1, 2, 3, 4, 5]);
        expect(working.hasNonWorkingDays).toBe(true);
        expect(working.isWorkingDay(utc(2026, 1, 9))).toBe(true);
        expect(working.isWorkingDay(utc(2026, 1, 10))).toBe(false);
    });

    it('the include really is parsed: its declaration reaches the resolved config', async () => {
        const { resolved } = await parseAndResolveFiles(files);
        expect(resolved.config.calendarDeclarations).toHaveLength(1);
    });

    it('a root file that closes every day is also kept off the engine: the preset stands', async () => {
        const source = declared([closeAll]);
        const { file, resolved } = await parseAndResolve(source);
        expect(() => resolveWorkingCalendar(file, resolved)).not.toThrow();
        expect(() => scheduleRoadmap(file, resolved)).not.toThrow();
    });
});
