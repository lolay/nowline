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

// ---------------------------------------------------------------------------
// <Exceptions>: named closures and working days (specs/working-calendar.md
// §8, §10; m2p phase 5b). Every case is one base-calendar <Exceptions> block.
// ---------------------------------------------------------------------------

const EXAMPLE_B_BODY = `roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
`;

const EXAMPLE_A_BODY = `roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;

function declared(body: string, declarations: string[]): string {
    if (declarations.length === 0) return `nowline v1\n\n${body}`;
    return `nowline v1\n\nconfig\n\n${declarations.join('\n')}\n\n${body}`;
}

async function xmlOf(src: string): Promise<string> {
    return exportMsProjXml(await buildExportInputs(src), { onLossy: () => {} });
}

/** The base calendar's `<Exceptions>` block, or undefined without one. */
function exceptionsOf(xml: string): string | undefined {
    return / {6}<Exceptions>[\s\S]*? {6}<\/Exceptions>/.exec(xml)?.[0];
}

const THANKSGIVING = 'non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27';

describe('exportMsProjXml — <Exceptions> carries named closures', () => {
    it('Example B: one Thanksgiving exception right after </WeekDays>, before </Calendar>', async () => {
        const xml = await xmlOf(declared(EXAMPLE_B_BODY, [THANKSGIVING]));
        const block = `      </WeekDays>
      <Exceptions>
      <Exception>
        <EnteredByOccurrences>0</EnteredByOccurrences>
        <TimePeriod>
          <FromDate>2026-11-26T00:00:00</FromDate>
          <ToDate>2026-11-27T23:59:00</ToDate>
        </TimePeriod>
        <Occurrences>1</Occurrences>
        <Name>Thanksgiving</Name>
        <Type>1</Type>
        <DayWorking>0</DayWorking>
      </Exception>
      </Exceptions>
    </Calendar>`;
        expect(xml).toContain(block);
    });

    it('Example B: <WeekDays> still marks Saturday and Sunday non-working', async () => {
        const xml = await xmlOf(declared(EXAMPLE_B_BODY, [THANKSGIVING]));
        expect(weekDaysOf(xml)).toBe(BUSINESS_WEEK_DAYS);
    });

    it('Example B: the resource calendar (UID 2) is unchanged', async () => {
        const xml = await xmlOf(declared(EXAMPLE_B_BODY, [THANKSGIVING]));
        expect(xml).toContain(`    <Calendar>
      <UID>2</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>0</IsBaseCalendar>
      <BaseCalendarUID>1</BaseCalendarUID>
    </Calendar>
  </Calendars>`);
        expect(xml.match(/<Exceptions>/g)).toHaveLength(1);
    });

    it('Example D: a working Saturday is one exception with the two WorkingTime blocks', async () => {
        const xml = await xmlOf(
            declared(EXAMPLE_A_BODY, ['working crunch "Crunch Saturday" date:2026-01-10']),
        );
        expect(exceptionsOf(xml)).toBe(`      <Exceptions>
      <Exception>
        <EnteredByOccurrences>0</EnteredByOccurrences>
        <TimePeriod>
          <FromDate>2026-01-10T00:00:00</FromDate>
          <ToDate>2026-01-10T23:59:00</ToDate>
        </TimePeriod>
        <Occurrences>1</Occurrences>
        <Name>Crunch Saturday</Name>
        <Type>1</Type>
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
      </Exception>
      </Exceptions>`);
    });

    it('Example E row 1: a bounded Friday closure is two exceptions with no <Name>', async () => {
        const xml = await xmlOf(
            declared(EXAMPLE_A_BODY, ['non-working every:fri start:2026-01-12 end:2026-01-25']),
        );
        const block = exceptionsOf(xml);
        expect(block).toBeDefined();
        expect(block!.match(/<Exception>/g)).toHaveLength(2);
        expect(block).toContain('<FromDate>2026-01-16T00:00:00</FromDate>');
        expect(block).toContain('<FromDate>2026-01-23T00:00:00</FromDate>');
        expect(block).not.toContain('<Name>');
    });

    it('escapes the title', async () => {
        const xml = await xmlOf(
            declared(EXAMPLE_B_BODY, ['non-working offsite "R&D \\"offsite\\"" date:2026-11-26']),
        );
        expect(xml).toContain('<Name>R&amp;D &quot;offsite&quot;</Name>');
    });

    it('Example C: an open-ended week alone writes no <Exceptions> (guard)', async () => {
        const xml = await xmlOf(
            declared(EXAMPLE_A_BODY, ['non-working weekend "Weekend" every:[fri, sat]']),
        );
        expect(xml).not.toContain('<Exceptions>');
    });

    it('business with no declaration writes no <Exceptions> (guard)', async () => {
        const xml = await exportOf('business', '  item a "A" duration:1w');
        expect(xml).not.toContain('<Exceptions>');
        expect(weekDaysOf(xml)).toBe(BUSINESS_WEEK_DAYS);
    });
});
