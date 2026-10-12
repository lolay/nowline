// Minimal Standard base calendar emitted on every MS Project XML export.
//
// Spec: specs/handoffs/m2c.md § 8 + Resolution 6, specs/working-calendar.md §8.
//   - One base calendar (UID=1, Name=Standard). Its working weekdays are the
//     file calendar's open week (`WorkingCalendar.workingWeekdays`), each
//     08:00–12:00 / 13:00–17:00: Mon–Fri for business, which matches
//     Microsoft's default project template, and all seven days for
//     `calendar:full` and `calendar:custom`.
//   - One resource calendar (UID=2, Name=Standard, BaseCalendarUID=1).
//
//   - `<Exceptions>` in the base calendar (UID=1), right after `</WeekDays>`,
//     one per `CalendarException`: a named closure, a bounded recurrence's
//     closed days, or a working day the open week closes (m2p phase 5b).
//     There is no `<WorkWeeks>`: a bounded recurrence becomes one exception
//     per run of days it changes, and the exceptions never overlap.
//
// Calendar UIDs are fixed (1 / 2). No timestamps in the calendar block →
// deterministic across runs.

import type { CalendarException } from '@nowline/layout';
import { escapeXml } from './xml.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayBlock(dayIndex: number, isWorking: boolean): string {
    if (!isWorking) {
        return `      <WeekDay>
        <DayType>${dayIndex + 1}</DayType>
        <DayWorking>0</DayWorking>
      </WeekDay>`;
    }
    return `      <WeekDay>
        <DayType>${dayIndex + 1}</DayType>
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
      </WeekDay>`;
}

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** One `<Exception>`: element order follows the MSPDI schema. */
function exceptionBlock(exception: CalendarException): string {
    const lines = [
        '      <Exception>',
        '        <EnteredByOccurrences>0</EnteredByOccurrences>',
        '        <TimePeriod>',
        `          <FromDate>${isoDate(exception.from)}T00:00:00</FromDate>`,
        `          <ToDate>${isoDate(exception.through)}T23:59:00</ToDate>`,
        '        </TimePeriod>',
        '        <Occurrences>1</Occurrences>',
    ];
    if (exception.titles && exception.titles.length > 0) {
        lines.push(`        <Name>${escapeXml(exception.titles.join(', '))}</Name>`);
    }
    lines.push('        <Type>1</Type>');
    lines.push(`        <DayWorking>${exception.working ? 1 : 0}</DayWorking>`);
    if (exception.working) {
        lines.push(
            '        <WorkingTimes>',
            '          <WorkingTime>',
            '            <FromTime>08:00:00</FromTime>',
            '            <ToTime>12:00:00</ToTime>',
            '          </WorkingTime>',
            '          <WorkingTime>',
            '            <FromTime>13:00:00</FromTime>',
            '            <ToTime>17:00:00</ToTime>',
            '          </WorkingTime>',
            '        </WorkingTimes>',
        );
    }
    lines.push('      </Exception>');
    return lines.join('\n');
}

function exceptionsBlock(exceptions: readonly CalendarException[]): string {
    if (exceptions.length === 0) return '';
    return `\n      <Exceptions>\n${exceptions.map(exceptionBlock).join('\n')}\n      </Exceptions>`;
}

/**
 * `workingWeekdays`: 0 = Sunday … 6 = Saturday. `exceptions`: the days the
 * file's calendar differs from that week (`calendarExceptions`), ascending.
 */
export function buildCalendarsBlock(
    workingWeekdays: ReadonlySet<number>,
    exceptions: readonly CalendarException[],
): string {
    const weekDays = [0, 1, 2, 3, 4, 5, 6]
        .map((dayIndex) => dayBlock(dayIndex, workingWeekdays.has(dayIndex)))
        .join('\n');
    return `  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
${weekDays}
      </WeekDays>${exceptionsBlock(exceptions)}
    </Calendar>
    <Calendar>
      <UID>2</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>0</IsBaseCalendar>
      <BaseCalendarUID>1</BaseCalendarUID>
    </Calendar>
  </Calendars>`;
}

/** Resource and base calendar UIDs surfaced for cross-references. */
export const STANDARD_BASE_CALENDAR_UID = 1;
export const STANDARD_RESOURCE_CALENDAR_UID = 2;

export { DAY_NAMES };
