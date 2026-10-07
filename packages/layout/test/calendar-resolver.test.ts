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
    type ResolvedCalendar,
    resolveWorkingCalendar,
    scheduleRoadmap,
    type WorkingCalendar,
} from '../src/index.js';
import { continuousCalendar, fromCalendarConfig } from '../src/working-calendar.js';
import { parseAndResolve } from './helpers.js';

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
