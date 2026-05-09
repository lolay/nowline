// Minimal Standard base calendar emitted on every MS Project XML export.
//
// Spec: specs/handoffs/m2c.md § 8 + Resolution 6.
//   - One base calendar (UID=1, Name=Standard) — Mon–Fri working
//     08:00–12:00 / 13:00–17:00, Sat/Sun non-working. Matches Microsoft's
//     default project template; reliably accepted across MSProject versions.
//   - One resource calendar (UID=2, Name=Standard, BaseCalendarUID=1).
//
// Calendar UIDs are fixed (1 / 2). No timestamps in the calendar block →
// deterministic across runs.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayBlock(dayIndex: number): string {
    const isWeekend = dayIndex === 0 || dayIndex === 6;
    if (isWeekend) {
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

export function buildCalendarsBlock(): string {
    const weekDays = [0, 1, 2, 3, 4, 5, 6].map(dayBlock).join('\n');
    return `  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
${weekDays}
      </WeekDays>
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
