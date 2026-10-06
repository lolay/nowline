// The MS Project XML reads the file's calendar and engine C's durations
// (specs/working-calendar.md §8): the base calendar's working weekdays follow
// the file's calendar, and a task's Duration is the chart's own day count for
// the item times an 8-hour day.
//
// Every expectation is a literal, derived by hand from the presets
// (business 5/22/65/260, full 7/30/91/365) and the custom block below
// (6/26/78/312), at 480 minutes a working day. `(guard)` marks a case that is
// green before and after the change.

import { describe, expect, it } from 'vitest';
import { exportMsProjXml } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

type CalendarName = 'business' | 'full' | 'custom';

const CUSTOM_BLOCK = `config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312

`;

const HEADERS: Record<CalendarName, string> = {
    business: 'nowline v1\n\nroadmap r "R" start:2026-01-05\n',
    full: 'nowline v1\n\nroadmap r "R" start:2026-01-05 calendar:full\n',
    custom: `nowline v1\n\n${CUSTOM_BLOCK}roadmap r "R" start:2026-01-05 calendar:custom\n`,
};

function source(calendar: CalendarName, lanes: string): string {
    return `${HEADERS[calendar]}
size med effort:1w
size xl effort:1m

swimlane s "S"
${lanes}
`;
}

async function exportOf(calendar: CalendarName, lanes: string): Promise<string> {
    const inputs = await buildExportInputs(source(calendar, lanes));
    return exportMsProjXml(inputs, { onLossy: () => {} });
}

/** The `<Duration>` of the task named `name`. */
function durationOf(xml: string, name: string): string {
    const tasks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
    const task = tasks.find((t) => t.includes(`<Name>${name}</Name>`));
    expect(task, `task ${name}`).toBeDefined();
    const m = /<Duration>([^<]*)<\/Duration>/.exec(task!);
    expect(m, `Duration of ${name}`).not.toBeNull();
    return m![1];
}

/** The base calendar's `<WeekDays>` block. */
function weekDaysOf(xml: string): string {
    const m = / {6}<WeekDays>[\s\S]*? {6}<\/WeekDays>/.exec(xml);
    expect(m).not.toBeNull();
    return m![0];
}

const BUSINESS_WEEK_DAYS = `      <WeekDays>
      <WeekDay>
        <DayType>1</DayType>
        <DayWorking>0</DayWorking>
      </WeekDay>
      <WeekDay>
        <DayType>2</DayType>
        <DayWorking>1</DayWorking>
        <WorkingTimes>
          <WorkingTime>
            <FromTime>08:00:00</FromTime>
            <ToTime>12:00:00</ToTime>
          </WorkingTime>
          <WorkingTime>
            <FromTime>13:00:00</FromTime>
            <ToTime>17:00:00</ToTime>
          </WorkingTime>
        </WorkingTimes>
      </WeekDay>
      <WeekDay>
        <DayType>3</DayType>
        <DayWorking>1</DayWorking>
        <WorkingTimes>
          <WorkingTime>
            <FromTime>08:00:00</FromTime>
            <ToTime>12:00:00</ToTime>
          </WorkingTime>
          <WorkingTime>
            <FromTime>13:00:00</FromTime>
            <ToTime>17:00:00</ToTime>
          </WorkingTime>
        </WorkingTimes>
      </WeekDay>
      <WeekDay>
        <DayType>4</DayType>
        <DayWorking>1</DayWorking>
        <WorkingTimes>
          <WorkingTime>
            <FromTime>08:00:00</FromTime>
            <ToTime>12:00:00</ToTime>
          </WorkingTime>
          <WorkingTime>
            <FromTime>13:00:00</FromTime>
            <ToTime>17:00:00</ToTime>
          </WorkingTime>
        </WorkingTimes>
      </WeekDay>
      <WeekDay>
        <DayType>5</DayType>
        <DayWorking>1</DayWorking>
        <WorkingTimes>
          <WorkingTime>
            <FromTime>08:00:00</FromTime>
            <ToTime>12:00:00</ToTime>
          </WorkingTime>
          <WorkingTime>
            <FromTime>13:00:00</FromTime>
            <ToTime>17:00:00</ToTime>
          </WorkingTime>
        </WorkingTimes>
      </WeekDay>
      <WeekDay>
        <DayType>6</DayType>
        <DayWorking>1</DayWorking>
        <WorkingTimes>
          <WorkingTime>
            <FromTime>08:00:00</FromTime>
            <ToTime>12:00:00</ToTime>
          </WorkingTime>
          <WorkingTime>
            <FromTime>13:00:00</FromTime>
            <ToTime>17:00:00</ToTime>
          </WorkingTime>
        </WorkingTimes>
      </WeekDay>
      <WeekDay>
        <DayType>7</DayType>
        <DayWorking>0</DayWorking>
      </WeekDay>
      </WeekDays>`;

describe('exportMsProjXml — base calendar follows the file calendar', () => {
    it('business: the <WeekDays> block is byte-identical to the Mon-Fri block (guard)', async () => {
        const xml = await exportOf('business', '  item a "A" duration:1w');
        expect(weekDaysOf(xml)).toBe(BUSINESS_WEEK_DAYS);
    });

    it.each<CalendarName>(['full', 'custom'])(
        '%s: all seven days are working days, each with WorkingTimes',
        async (calendar) => {
            const xml = await exportOf(calendar, '  item a "A" duration:1w');
            const weekDays = weekDaysOf(xml);
            expect(weekDays.match(/<DayWorking>1<\/DayWorking>/g)).toHaveLength(7);
            expect(weekDays).not.toContain('<DayWorking>0</DayWorking>');
            expect(weekDays.match(/<WorkingTimes>/g)).toHaveLength(7);
            const dayTypes = [...weekDays.matchAll(/<DayType>(\d)<\/DayType>/g)].map((m) => m[1]);
            expect(dayTypes).toEqual(['1', '2', '3', '4', '5', '6', '7']);
        },
    );

    it('every WorkingTimes block is 08:00-12:00 and 13:00-17:00', async () => {
        const xml = await exportOf('full', '  item a "A" duration:1w');
        const weekDays = weekDaysOf(xml);
        expect(weekDays.match(/<FromTime>08:00:00<\/FromTime>/g)).toHaveLength(7);
        expect(weekDays.match(/<ToTime>12:00:00<\/ToTime>/g)).toHaveLength(7);
        expect(weekDays.match(/<FromTime>13:00:00<\/FromTime>/g)).toHaveLength(7);
        expect(weekDays.match(/<ToTime>17:00:00<\/ToTime>/g)).toHaveLength(7);
    });
});

describe('exportMsProjXml — Duration comes from the file calendar and engine C', () => {
    it('business 1w is PT2400M0S, 5 days of 480 minutes (guard)', async () => {
        const xml = await exportOf('business', '  item a "A" duration:1w');
        expect(durationOf(xml, 'A')).toBe('PT2400M0S');
    });

    it('business 1q is PT31200M0S, 65 days', async () => {
        const xml = await exportOf('business', '  item a "A" duration:1q');
        expect(durationOf(xml, 'A')).toBe('PT31200M0S');
    });

    it('business 1y is PT124800M0S, 260 days', async () => {
        const xml = await exportOf('business', '  item a "A" duration:1y');
        expect(durationOf(xml, 'A')).toBe('PT124800M0S');
    });

    it('business 1.5w is PT3600M0S, 7.5 days (guard)', async () => {
        const xml = await exportOf('business', '  item a "A" duration:1.5w');
        expect(durationOf(xml, 'A')).toBe('PT3600M0S');
    });

    it('size med effort:1w is PT2400M0S, 5 days', async () => {
        const xml = await exportOf('business', '  item a "A" size:med');
        expect(durationOf(xml, 'A')).toBe('PT2400M0S');
    });

    it('size xl (1m) with capacity:2 is PT5280M0S, 11 days', async () => {
        const xml = await exportOf('business', '  item a "A" size:xl capacity:2');
        expect(durationOf(xml, 'A')).toBe('PT5280M0S');
    });

    it('full 1w is PT3360M0S, 7 days', async () => {
        const xml = await exportOf('full', '  item a "A" duration:1w');
        expect(durationOf(xml, 'A')).toBe('PT3360M0S');
    });

    it('custom 1w is PT2880M0S, 6 days', async () => {
        const xml = await exportOf('custom', '  item a "A" duration:1w');
        expect(durationOf(xml, 'A')).toBe('PT2880M0S');
    });

    it('an unsized item stays one day, PT480M0S, so it is not a milestone (guard)', async () => {
        const xml = await exportOf('business', '  item a "A"');
        expect(durationOf(xml, 'A')).toBe('PT480M0S');
        const tasks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
        const task = tasks.find((t) => t.includes('<Name>A</Name>'))!;
        expect(task).not.toContain('<Milestone>1</Milestone>');
    });

    it('an item with an undeclared size is one day, PT480M0S (guard)', async () => {
        const xml = await exportOf('business', '  item a "A" size:ghost');
        expect(durationOf(xml, 'A')).toBe('PT480M0S');
    });
});
