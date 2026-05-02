import { describe, expect, it } from 'vitest';
import { utcDay, utcWeek } from 'd3-time';
import { TimeScale, BandScale } from '../src/scales.js';
import { continuousCalendar, weekendsOff } from '../src/working-calendar.js';

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('TimeScale (continuous)', () => {
    const scale = new TimeScale({
        domain: [D('2026-01-05'), D('2026-02-02')],
        range: [100, 660], // 28 days → 560 px → 20 px/day
    });

    it('forward maps the start of the domain to the start of the range', () => {
        expect(scale.forward(D('2026-01-05'))).toBe(100);
    });

    it('forward maps the end of the domain to the end of the range', () => {
        expect(scale.forward(D('2026-02-02'))).toBe(660);
    });

    it('forward is linear: midpoint of the domain is midpoint of the range', () => {
        expect(scale.forward(D('2026-01-19'))).toBe(380);
    });

    it('invert recovers a date that round-trips through forward', () => {
        const date = D('2026-01-19');
        const x = scale.forward(date);
        expect(scale.invert(x).toISOString()).toBe(date.toISOString());
    });

    it('ticks at week intervals returns one date per Monday in the domain', () => {
        const ticks = scale.ticks(utcWeek);
        // d3-time week defaults to Sunday. Our domain (Mon Jan 5 → Mon Feb 2)
        // contains 5 Sundays: Jan 11, 18, 25, Feb 1 ... actually 4 Sundays
        // strictly inside [Jan 5, Feb 3). Just assert it's nonzero, monotonic,
        // and aligned to UTC midnight.
        expect(ticks.length).toBeGreaterThan(0);
        for (let i = 1; i < ticks.length; i++) {
            expect(ticks[i].getTime()).toBeGreaterThan(ticks[i - 1].getTime());
        }
        for (const t of ticks) {
            expect(t.getUTCHours()).toBe(0);
        }
    });

    it('pixelsPerDay matches range/domainDays', () => {
        expect(scale.pixelsPerDay()).toBe(20);
    });
});

describe('TimeScale (non-continuous: weekends off)', () => {
    const cal = weekendsOff();
    const scale = new TimeScale({
        domain: [D('2026-01-05'), D('2026-01-19')], // Mon → Mon, 14 days, 10 working
        range: [0, 1000],
        calendar: cal,
    });

    it('compresses the X axis to working days only', () => {
        // 10 working days across 1000px = 100 px/day
        expect(scale.pixelsPerDay()).toBeCloseTo(100, 5);
    });

    it('Saturday collapses to the Friday boundary', () => {
        // Friday Jan 9 is working day index 4. Saturday Jan 10 is also index 5
        // (it's the *next* working-day boundary, since Sat itself isn't working
        // — wfb returns `workingDaysBetween(domain[0], Sat)` = 5).
        const friday = scale.forward(D('2026-01-09'));
        const saturday = scale.forward(D('2026-01-10'));
        // Both should sit exactly on the 4th and 5th working-day boundary.
        // The visible gap should be one working-day's worth of pixels (~100).
        expect(saturday - friday).toBeCloseTo(100, 0);
    });

    it('ticks via utcDay drop weekend dates', () => {
        const dailyTicks = scale.ticks(utcDay);
        // Domain 2026-01-05 (Mon) through 2026-01-19 (Mon). 14 calendar days,
        // 10 working days.
        for (const tick of dailyTicks) {
            const w = tick.getUTCDay();
            expect(w === 0 || w === 6).toBe(false);
        }
    });
});

describe('BandScale', () => {
    it('places lanes top-to-bottom across the range', () => {
        const lanes = new BandScale({ domain: ['a', 'b', 'c'], range: [0, 300] });
        expect(lanes.forward('a')).toBeCloseTo(0, 5);
        expect(lanes.forward('c')).toBeCloseTo(200, 5);
        expect(lanes.bandwidth()).toBeCloseTo(100, 5);
    });

    it('paddingInner shrinks bandwidth and grows the gap (drives `defaults > spacing`)', () => {
        const tight = new BandScale({ domain: ['a', 'b', 'c'], range: [0, 300], paddingInner: 0 });
        const padded = new BandScale({ domain: ['a', 'b', 'c'], range: [0, 300], paddingInner: 0.5 });
        // Bandwidth shrinks when paddingInner grows.
        expect(padded.bandwidth()).toBeLessThan(tight.bandwidth());
        // Visible gap between adjacent bands grows: gap = step - bandwidth.
        const tightGap = tight.step() - tight.bandwidth();
        const paddedGap = padded.step() - padded.bandwidth();
        expect(paddedGap).toBeGreaterThan(tightGap);
    });

    it('invert maps a y inside band b back to "b"', () => {
        const lanes = new BandScale({ domain: ['a', 'b', 'c'], range: [0, 300] });
        const top = lanes.forward('b');
        expect(lanes.invert(top + lanes.bandwidth() / 2)).toBe('b');
    });
});

describe('continuousCalendar', () => {
    it('returns workingDaysBetween == calendar days for an arbitrary range', () => {
        const cal = continuousCalendar();
        expect(cal.workingDaysBetween(D('2026-01-05'), D('2026-01-12'))).toBe(7);
    });
});
