import { describe, expect, it } from 'vitest';
import {
    continuousCalendar,
    weekendsOff,
    withHolidays,
} from '../src/working-calendar.js';

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('continuousCalendar', () => {
    const cal = continuousCalendar();

    it('every day is working', () => {
        for (let i = 0; i < 14; i++) {
            const d = new Date(D('2026-01-01').getTime() + i * 86_400_000);
            expect(cal.isWorkingTime(d)).toBe(true);
        }
    });

    it('workingDaysBetween equals raw day count', () => {
        expect(cal.workingDaysBetween(D('2026-01-01'), D('2026-01-15'))).toBe(14);
    });

    it('dateAtWorkingIndex offsets from start by N days', () => {
        const result = cal.dateAtWorkingIndex(D('2026-01-01'), 7);
        expect(result.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    });
});

describe('weekendsOff', () => {
    const cal = weekendsOff();

    it('Saturdays and Sundays are not working', () => {
        // 2026-01-03 is Saturday, 2026-01-04 is Sunday.
        expect(cal.isWorkingTime(D('2026-01-03'))).toBe(false);
        expect(cal.isWorkingTime(D('2026-01-04'))).toBe(false);
    });

    it('Weekdays are working', () => {
        expect(cal.isWorkingTime(D('2026-01-05'))).toBe(true); // Monday
        expect(cal.isWorkingTime(D('2026-01-09'))).toBe(true); // Friday
    });

    it('workingDaysBetween Mon → next Mon is 5 (no weekends)', () => {
        expect(cal.workingDaysBetween(D('2026-01-05'), D('2026-01-12'))).toBe(5);
    });

    it('dateAtWorkingIndex skips weekends', () => {
        // 0 → Mon Jan 5; 1 → Tue Jan 6; ... 4 → Fri Jan 9; 5 → Mon Jan 12.
        expect(cal.dateAtWorkingIndex(D('2026-01-05'), 0).toISOString()).toBe(
            '2026-01-05T00:00:00.000Z',
        );
        expect(cal.dateAtWorkingIndex(D('2026-01-05'), 5).toISOString()).toBe(
            '2026-01-12T00:00:00.000Z',
        );
    });
});

describe('withHolidays', () => {
    it('skips holidays in addition to the inner calendar', () => {
        const cal = withHolidays(weekendsOff(), ['2026-01-19']); // MLK Day, a Monday
        expect(cal.isWorkingTime(D('2026-01-19'))).toBe(false);
        // Mon Jan 5 → Mon Jan 26 normally has 3 working weeks = 15 working days.
        // Subtract MLK Day → 14.
        expect(cal.workingDaysBetween(D('2026-01-05'), D('2026-01-26'))).toBe(14);
    });

    it('a holiday that is already non-working (Sat) does not double-count', () => {
        const cal = withHolidays(weekendsOff(), ['2026-01-03']); // a Saturday
        expect(cal.workingDaysBetween(D('2026-01-05'), D('2026-01-12'))).toBe(5);
    });

    it('dateAtWorkingIndex skips holiday dates', () => {
        const cal = withHolidays(weekendsOff(), ['2026-01-19']);
        // Working days: Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Mon 12, Tue 13, Wed 14, Thu 15, Fri 16,
        //               (Mon 19 is the holiday, skipped), Tue 20, Wed 21, ...
        const idx10 = cal.dateAtWorkingIndex(D('2026-01-05'), 10); // 11th working day
        expect(idx10.toISOString()).toBe('2026-01-20T00:00:00.000Z');
    });
});
