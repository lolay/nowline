import { describe, expect, it } from 'vitest';
import { TimeScale } from '../src/time-scale.js';
import { buildHeaderTicks, resolveScale, tickBoundaryAtOrAfter } from '../src/view-preset.js';
import { fromCalendarConfig } from '../src/working-calendar.js';

const businessCal = {
    mode: 'business' as const,
    daysPerWeek: 5,
    daysPerMonth: 22,
    daysPerQuarter: 65,
    daysPerYear: 260,
};

const fullCal = {
    mode: 'full' as const,
    daysPerWeek: 7,
    daysPerMonth: 30,
    daysPerQuarter: 91,
    daysPerYear: 365,
};

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const DAY_MS = 86400 * 1000;

/**
 * Date each tick sits on, recovered from its x through the scale's own
 * `invert`. A pixels-per-day division would be wrong for a business scale,
 * whose x is linear in working days. The rounding to a whole day only
 * absorbs float noise in `invert`.
 */
function tickDates(tscale: TimeScale, xs: number[]): string[] {
    return xs.map((x) => {
        const date = tscale.invert(x);
        return new Date(Math.round(date.getTime() / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
    });
}

describe('TimeScale', () => {
    const start = new Date(Date.UTC(2026, 0, 5));
    const end = new Date(Date.UTC(2026, 1, 14));
    const scale = new TimeScale({ domain: [start, end], range: [200, 520] });

    it('forward maps domain endpoints to range endpoints', () => {
        expect(scale.forward(start)).toBe(200);
        expect(scale.forward(end)).toBe(520);
    });

    it('forward is linear in days from domain start', () => {
        const midDate = new Date(Date.UTC(2026, 0, 25));
        expect(scale.forward(midDate)).toBeCloseTo(360, 6);
    });

    it('forwardWithinDomain returns null outside the domain', () => {
        const before = new Date(Date.UTC(2026, 0, 1));
        const after = new Date(Date.UTC(2026, 2, 1));
        expect(scale.forwardWithinDomain(before)).toBeNull();
        expect(scale.forwardWithinDomain(after)).toBeNull();
        expect(scale.forwardWithinDomain(start)).toBe(200);
    });

    it('invert returns a Date close to the original on roundtrip', () => {
        const date = new Date(Date.UTC(2026, 0, 19));
        const x = scale.forward(date);
        const back = scale.invert(x);
        expect(back.getTime()).toBeCloseTo(date.getTime(), -3);
    });

    it('originX exposes the start of the range', () => {
        expect(scale.originX).toBe(200);
    });
});

describe('TimeScale with a business working calendar', () => {
    // 2026-01-05 (Mon) to 2026-02-02 (Mon) holds 20 working days; at
    // 160 px that is 8 px per working day.
    const start = utc(2026, 1, 5);
    const end = utc(2026, 2, 2);
    const calendar = fromCalendarConfig(businessCal);
    const scale = new TimeScale({ domain: [start, end], range: [200, 360], calendar });

    it('spreads the range over working days, not calendar days', () => {
        expect(scale.pixelsPerDay).toBe(8);
        expect(scale.calendar).toBe(calendar);
    });

    it('forward counts working days from the domain start', () => {
        expect(scale.forward(utc(2026, 1, 5))).toBe(200);
        expect(scale.forward(utc(2026, 1, 9))).toBe(232); // Friday, index 4
        expect(scale.forward(utc(2026, 1, 12))).toBe(240); // next Monday, index 5
        expect(scale.forward(utc(2026, 1, 30))).toBe(352); // Friday, index 19
        expect(scale.forward(end)).toBe(360);
    });

    it('forward maps a weekend date to the start of the next working day', () => {
        expect(scale.forward(utc(2026, 1, 10))).toBe(240); // Saturday
        expect(scale.forward(utc(2026, 1, 11))).toBe(240); // Sunday
    });

    it('forwardWithinDomain keeps its raw-date guard', () => {
        expect(scale.forwardWithinDomain(utc(2026, 1, 4))).toBeNull();
        expect(scale.forwardWithinDomain(utc(2026, 2, 3))).toBeNull();
        expect(scale.forwardWithinDomain(utc(2026, 1, 10))).toBe(240);
        expect(scale.forwardWithinDomain(end)).toBe(360);
    });

    it('invert returns the working day whose start is nearest x', () => {
        expect(scale.invert(200).toISOString().slice(0, 10)).toBe('2026-01-05');
        expect(scale.invert(216).toISOString().slice(0, 10)).toBe('2026-01-07');
        // A Saturday projects onto Monday's x, and that x inverts to Monday.
        const saturdayX = scale.forward(utc(2026, 1, 10));
        expect(scale.invert(saturdayX).toISOString().slice(0, 10)).toBe('2026-01-12');
        // Index 2.4 rounds down to Wednesday, 2.6 up to Thursday.
        expect(
            scale
                .invert(200 + 2.4 * 8)
                .toISOString()
                .slice(0, 10),
        ).toBe('2026-01-07');
        expect(
            scale
                .invert(200 + 2.6 * 8)
                .toISOString()
                .slice(0, 10),
        ).toBe('2026-01-08');
    });

    it('invert never returns a weekend date', () => {
        for (let x = 200; x <= 360; x += 3) {
            const day = scale.invert(x).getUTCDay();
            expect(day === 0 || day === 6, `x=${x}`).toBe(false);
        }
    });

    it('a calendar-less scale keeps calendar-day arithmetic', () => {
        const plain = new TimeScale({ domain: [start, end], range: [200, 360] });
        expect(plain.calendar).toBeUndefined();
        expect(plain.pixelsPerDay).toBeCloseTo(160 / 28, 9);
        expect(plain.forward(utc(2026, 1, 12))).toBeCloseTo(200 + 7 * (160 / 28), 9);
    });
});

describe('buildHeaderTicks', () => {
    const start = new Date(Date.UTC(2026, 0, 5));
    const cal = fromCalendarConfig(businessCal);

    it('produces one tick per scale unit, plus a closing tick', () => {
        // 8 weeks of business calendar = 40 working days, ending Mon Mar 2;
        // with a 1-week scale and 40 px/week (5 days/week -> 8 px/day) we
        // get a 320 px chart and 9 ticks, one per Monday.
        const end = new Date(Date.UTC(2026, 2, 2));
        const tscale = new TimeScale({ domain: [start, end], range: [0, 320], calendar: cal });
        const preset = { unit: 'weeks' as const, labelEvery: 1, pixelsPerUnit: 40 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(ticks).toHaveLength(9);
        expect(ticks[0].x).toBe(0);
        expect(ticks[8].x).toBe(320);
        expect(ticks.map((t) => t.x)).toEqual([0, 40, 80, 120, 160, 200, 240, 280, 320]);
        expect(ticks.map((t) => t.label)).toEqual([
            'Jan 05',
            'Jan 12',
            'Jan 19',
            'Jan 26',
            'Feb 02',
            'Feb 09',
            'Feb 16',
            'Feb 23',
            undefined,
        ]);
    });

    it('suppresses the label on the trailing tick (no following column)', () => {
        const end = new Date(Date.UTC(2026, 2, 2));
        const tscale = new TimeScale({ domain: [start, end], range: [0, 320], calendar: cal });
        const preset = { unit: 'weeks' as const, labelEvery: 1, pixelsPerUnit: 40 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(ticks[8].label).toBeUndefined();
        expect(ticks[8].labelX).toBeUndefined();
        expect(ticks[0].label).toBeDefined();
    });

    it('keeps the fixed 7-day stride under calendar:full', () => {
        // The identity path: no non-working days, so week ticks step from
        // the start exactly as before (8 weeks = 56 days).
        const fullCalendar = fromCalendarConfig(fullCal);
        const end = new Date(Date.UTC(2026, 2, 2));
        const tscale = new TimeScale({
            domain: [start, end],
            range: [0, 320],
            calendar: fullCalendar,
        });
        const preset = { unit: 'weeks' as const, labelEvery: 1, pixelsPerUnit: 40 };
        const ticks = buildHeaderTicks(tscale, preset, fullCalendar);
        expect(ticks.map((t) => t.x)).toEqual([0, 40, 80, 120, 160, 200, 240, 280, 320]);
        expect(ticks.map((t) => t.label)).toEqual([
            'Jan 05',
            'Jan 12',
            'Jan 19',
            'Jan 26',
            'Feb 02',
            'Feb 09',
            'Feb 16',
            'Feb 23',
            undefined,
        ]);
    });
});

describe('buildHeaderTicks under hide (business weeks)', () => {
    const cal = fromCalendarConfig(businessCal);
    const labels = (ticks: { label?: string }[]) => ticks.map((t) => t.label);
    const weeksPreset = { unit: 'weeks' as const, labelEvery: 1, pixelsPerUnit: 40 };

    it('puts week ticks on Mondays, one per 5 working days', () => {
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 5), utc(2026, 2, 2)],
            range: [0, 160],
            calendar: cal,
        });
        const ticks = buildHeaderTicks(tscale, weeksPreset, cal);
        expect(ticks.map((t) => t.x)).toEqual([0, 40, 80, 120, 160]);
        expect(labels(ticks)).toEqual(['Jan 05', 'Jan 12', 'Jan 19', 'Jan 26', undefined]);
        expect(ticks.slice(0, 4).map((t) => t.labelX)).toEqual([20, 60, 100, 140]);
    });

    it('opens a Wednesday start with a 24 px column whose label is dropped', () => {
        // Wed Jan 7 to Mon Jan 12 is 3 working days (24 px): narrower than a
        // 40 px week, and `Jan 07` (34.8 px) does not fit it.
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 7), utc(2026, 1, 26)],
            range: [0, 104],
            calendar: cal,
        });
        const ticks = buildHeaderTicks(tscale, weeksPreset, cal);
        expect(ticks.map((t) => t.x)).toEqual([0, 24, 64, 104]);
        expect(labels(ticks)).toEqual([undefined, 'Jan 12', 'Jan 19', undefined]);
        expect(ticks[0].major).toBe(true);
    });

    it('drops the zero-width column of a Saturday start, with its label', () => {
        // Sat Jan 10 and Mon Jan 12 share one x, so the Jan 10 column has no width.
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 10), utc(2026, 1, 26)],
            range: [0, 80],
            calendar: cal,
        });
        const ticks = buildHeaderTicks(tscale, weeksPreset, cal);
        expect(ticks.map((t) => t.x)).toEqual([0, 40, 80]);
        expect(labels(ticks)).toEqual(['Jan 12', 'Jan 19', undefined]);
    });

    it('drops the label of a short closing column, keeping its tick', () => {
        // The window ends Wed Jan 14: the last column (Mon-Tue) is 16 px.
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 5), utc(2026, 1, 14)],
            range: [0, 56],
            calendar: cal,
        });
        const ticks = buildHeaderTicks(tscale, weeksPreset, cal);
        expect(ticks.map((t) => t.x)).toEqual([0, 40, 56]);
        expect(labels(ticks)).toEqual(['Jan 05', undefined, undefined]);
    });

    it('keeps a label wider than its column when the column is a full week', () => {
        // fr `janv. 05` is 46.4 px, wider than a 40 px week; a full week
        // column keeps it (the narrow-column rule needs a column narrower
        // than a full unit).
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 5), utc(2026, 2, 2)],
            range: [0, 160],
            calendar: cal,
        });
        const ticks = buildHeaderTicks(tscale, weeksPreset, cal, 'fr');
        expect(labels(ticks)).toEqual(['janv. 05', 'janv. 12', 'janv. 19', 'janv. 26', undefined]);
    });

    it('counts kept columns when thinning labels', () => {
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 5), utc(2026, 3, 2)],
            range: [0, 320],
            calendar: cal,
        });
        const preset = { unit: 'weeks' as const, labelEvery: 2, pixelsPerUnit: 40 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(labels(ticks)).toEqual([
            'Jan 05',
            undefined,
            'Jan 19',
            undefined,
            'Feb 02',
            undefined,
            'Feb 16',
            undefined,
            undefined,
        ]);
        expect(ticks.slice(0, 8).map((t) => t.major)).toEqual([
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
        ]);
    });

    it('never labels the closing tick, even when it would be a major', () => {
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 5), utc(2026, 2, 2)],
            range: [0, 160],
            calendar: cal,
        });
        const ticks = buildHeaderTicks(tscale, weeksPreset, cal);
        const closing = ticks[ticks.length - 1];
        expect(closing.label).toBeUndefined();
        expect(closing.labelX).toBeUndefined();
    });
});

describe('buildHeaderTicks under hide (business days)', () => {
    const cal = fromCalendarConfig(businessCal);
    // Jan 5 - Jan 26: 15 working days at 5 px per day.
    const tscale = new TimeScale({
        domain: [utc(2026, 1, 5), utc(2026, 1, 26)],
        range: [0, 75],
        calendar: cal,
    });

    it('drops every weekend day and majors on every second kept column', () => {
        const preset = { unit: 'days' as const, labelEvery: 2, pixelsPerUnit: 5 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(ticks).toHaveLength(16);
        expect(ticks.map((t) => t.x)).toEqual(Array.from({ length: 16 }, (_, i) => i * 5));
        expect(ticks.filter((t) => t.major).map((t) => t.x)).toEqual([
            0, 10, 20, 30, 40, 50, 60, 70,
        ]);
        expect(ticks.filter((t) => t.label !== undefined).map((t) => t.label)).toEqual([
            '1/5',
            '1/7',
            '1/9',
            '1/13',
            '1/15',
            '1/19',
            '1/21',
            '1/23',
        ]);
    });

    it('under default thinning majors are week starts, and the first only when it is one', () => {
        const preset = {
            unit: 'days' as const,
            labelEvery: 7,
            labelEveryDefault: true as const,
            pixelsPerUnit: 5,
        };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        const columns = ticks.slice(0, -1); // the closing tick is not a column
        expect(columns.filter((t) => t.major).map((t) => t.label)).toEqual(['1/5', '1/12', '1/19']);
        expect(columns.filter((t) => t.major).map((t) => t.x)).toEqual([0, 25, 50]);

        // A Wednesday start is not a week start: its first tick stays minor.
        const wed = new TimeScale({
            domain: [utc(2026, 1, 7), utc(2026, 1, 19)],
            range: [0, 40],
            calendar: cal,
        });
        const wedTicks = buildHeaderTicks(wed, preset, cal);
        expect(wedTicks[0].major).toBe(false);
        expect(
            wedTicks
                .slice(0, -1)
                .filter((t) => t.major)
                .map((t) => t.label),
        ).toEqual(['1/12']);
    });
});

describe('buildHeaderTicks under hide (business months)', () => {
    const cal = fromCalendarConfig(businessCal);

    it('starts the Feb column at the x of Monday Feb 2, since Feb 1 is a Sunday', () => {
        // Jan 5 - Apr 1 2026 is 62 working days at 80/22 px per day.
        const ppd = 80 / 22;
        const tscale = new TimeScale({
            domain: [utc(2026, 1, 5), utc(2026, 4, 1)],
            range: [0, 62 * ppd],
            calendar: cal,
        });
        const preset = { unit: 'months' as const, labelEvery: 1, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(ticks.map((t) => t.label)).toEqual(['Jan', 'Feb', 'Mar', undefined]);
        expect(ticks[1].x).toBeCloseTo(20 * ppd, 6);
        expect(ticks[1].x).toBeCloseTo(tscale.forward(utc(2026, 2, 2)), 6);
        // Mar 1 is a Sunday too: the Mar column opens at Monday Mar 2 (index 40).
        expect(ticks[2].x).toBeCloseTo(40 * ppd, 6);
    });
});

describe('buildHeaderTicks on calendar-aligned units', () => {
    // Mirrors RoadmapNode: ppd = pixelsPerUnit / days-per-unit, range =
    // span * ppd. Only the domain and ppd matter to the generator.
    function scaleFor(
        start: Date,
        end: Date,
        ppd: number,
        calendar?: ReturnType<typeof fromCalendarConfig>,
    ): TimeScale {
        // A business scale spans working days, so its range does too.
        const span = calendar
            ? calendar.workingIndexOf(start, end)
            : Math.round((end.getTime() - start.getTime()) / DAY_MS);
        return new TimeScale({
            domain: [start, end],
            range: [100, 100 + span * ppd],
            ...(calendar ? { calendar } : {}),
        });
    }
    const labels = (ticks: { label?: string }[]) =>
        ticks.map((t) => t.label).filter((l): l is string => l !== undefined);

    it('labels a 17-month calendar:full span with each real month, no repeats or skips', () => {
        // Regression: a fixed 30-day stride drifted a day or two per month
        // and labelled the 13th-17th columns `Dec Jan Mar Mar Apr`.
        const tscale = scaleFor(utc(2026, 1, 5), utc(2027, 6, 1), 80 / 30);
        const preset = { unit: 'months' as const, labelEvery: 1, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(fullCal));
        expect(labels(ticks)).toEqual([
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
        ]);
        // Left edge, then the 1st of every month through the closing edge.
        const dates = tickDates(
            tscale,
            ticks.map((t) => t.x),
        );
        expect(dates[0]).toBe('2026-01-05');
        expect(dates.slice(1).every((d) => d.endsWith('-01'))).toBe(true);
        expect(dates.at(-1)).toBe('2027-06-01');
        expect(ticks).toHaveLength(18);
        // Each label sits in the middle of its own (variable-width) column.
        for (let i = 0; i < ticks.length - 1; i++) {
            expect(ticks[i].labelX).toBeCloseTo((ticks[i].x + ticks[i + 1].x) / 2, 6);
        }
    });

    it('ignores the business days-per-month stride (22d) for month ticks', () => {
        const business = fromCalendarConfig(businessCal);
        const tscale = scaleFor(utc(2026, 1, 5), utc(2027, 2, 1), 80 / 22, business);
        const preset = { unit: 'months' as const, labelEvery: 1, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, business);
        expect(labels(ticks)).toEqual([
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
            'Jan',
        ]);
    });

    it('puts quarter ticks on real quarter starts under calendar:business', () => {
        const business = fromCalendarConfig(businessCal);
        const tscale = scaleFor(utc(2026, 1, 5), utc(2027, 4, 1), 160 / 65, business);
        const preset = { unit: 'quarters' as const, labelEvery: 1, pixelsPerUnit: 160 };
        const ticks = buildHeaderTicks(tscale, preset, business);
        expect(labels(ticks)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027']);
        expect(
            tickDates(
                tscale,
                ticks.map((t) => t.x),
            ),
        ).toEqual([
            '2026-01-05',
            '2026-04-01',
            '2026-07-01',
            '2026-10-01',
            '2027-01-01',
            '2027-04-01',
        ]);
    });

    it('puts year ticks on January 1', () => {
        const tscale = scaleFor(utc(2026, 1, 5), utc(2029, 1, 1), 320 / 365);
        const preset = { unit: 'years' as const, labelEvery: 1, pixelsPerUnit: 320 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(fullCal));
        expect(labels(ticks)).toEqual(['2026', '2027', '2028']);
        expect(
            tickDates(
                tscale,
                ticks.map((t) => t.x),
            ),
        ).toEqual(['2026-01-05', '2027-01-01', '2028-01-01', '2029-01-01']);
    });

    it('thins labels by tick index from the left edge', () => {
        const tscale = scaleFor(utc(2026, 1, 5), utc(2027, 1, 1), 80 / 30);
        const preset = { unit: 'months' as const, labelEvery: 3, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(fullCal));
        expect(labels(ticks)).toEqual(['Jan', 'Apr', 'Jul', 'Oct']);
        expect(ticks.map((t) => t.major).filter(Boolean)).toHaveLength(5);
    });

    it('drops the label of a sliver edge column too narrow to hold it', () => {
        // Starts Mar 29: the leading Mar column is 3 days (8 px). The
        // trailing Jul 1-3 column (a `length:` that ends past a month
        // start) is just as thin. Both keep their ticks.
        const tscale = scaleFor(utc(2026, 3, 29), utc(2026, 7, 4), 80 / 30);
        const preset = { unit: 'months' as const, labelEvery: 1, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(fullCal));
        expect(labels(ticks)).toEqual(['Apr', 'May', 'Jun']);
        expect(ticks[0].label).toBeUndefined();
        expect(ticks[0].labelX).toBeDefined();
        expect(ticks[0].major).toBe(true);
        expect(ticks).toHaveLength(6);
    });

    it('keeps the label of a partial edge column that is wide enough', () => {
        // Jan 5 - Feb 1 is 27 days: partial, but plenty for "Jan".
        const tscale = scaleFor(utc(2026, 1, 5), utc(2026, 1, 19), 80 / 30);
        const preset = { unit: 'months' as const, labelEvery: 1, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(fullCal));
        expect(labels(ticks)).toEqual(['Jan']);
        expect(ticks).toHaveLength(2);
    });
});

describe('tickBoundaryAtOrAfter', () => {
    const start = utc(2026, 1, 5);

    it('rounds day and week units up to a multiple of the fixed stride', () => {
        expect(tickBoundaryAtOrAfter(start, 22, 'weeks', 5)).toBe(25);
        expect(tickBoundaryAtOrAfter(start, 20, 'weeks', 5)).toBe(20);
        expect(tickBoundaryAtOrAfter(start, 3.5, 'days', 1)).toBe(4);
    });

    it('rounds month, quarter, and year units up to the next real start', () => {
        // 510d from 2026-01-05 is 2027-05-30.
        expect(tickBoundaryAtOrAfter(start, 510, 'months', 30)).toBe(512); // 2027-06-01
        expect(tickBoundaryAtOrAfter(start, 510, 'quarters', 91)).toBe(542); // 2027-07-01
        expect(tickBoundaryAtOrAfter(start, 510, 'years', 365)).toBe(726); // 2028-01-01
    });

    it('stays put when the target already sits on a boundary, despite float noise', () => {
        // 27d from 2026-01-05 is 2026-02-01.
        expect(tickBoundaryAtOrAfter(start, 27, 'months', 30)).toBe(27);
        expect(tickBoundaryAtOrAfter(start, 27 + 1e-9, 'months', 30)).toBe(27);
    });

    describe('with a business calendar (indices count working days)', () => {
        const business = fromCalendarConfig(businessCal);

        it('returns the index of Feb 1 for content ending Fri Jan 30, not March', () => {
            // 20 working days from Mon Jan 5 end on Fri Jan 30; the next month
            // start is Sunday Feb 1, which sits at index 20 (Monday Feb 2).
            expect(tickBoundaryAtOrAfter(start, 20, 'months', 22, business)).toBe(20);
        });

        it('moves on to the next month start once content runs past Feb 2', () => {
            // 21 days end Tue Feb 3, so the next month start is Sunday Mar 1: index 40.
            expect(tickBoundaryAtOrAfter(start, 21, 'months', 22, business)).toBe(40);
        });

        it('absorbs float noise before rounding up', () => {
            expect(tickBoundaryAtOrAfter(start, 20 + 1e-9, 'months', 22, business)).toBe(20);
        });

        it('rounds a week count up to the next Monday', () => {
            // 12 days end Tue Jan 20; the next Monday is Jan 26 (index 15).
            expect(tickBoundaryAtOrAfter(start, 12, 'weeks', 5, business)).toBe(15);
            // 10 days end Fri Jan 16; Monday Jan 19 is index 10.
            expect(tickBoundaryAtOrAfter(start, 10, 'weeks', 5, business)).toBe(10);
        });

        it('counts from a Wednesday start to the next Monday', () => {
            // Wed Jan 7 + 10 working days ends Tue Jan 20; Monday Jan 26 is index 13.
            expect(tickBoundaryAtOrAfter(utc(2026, 1, 7), 10, 'weeks', 5, business)).toBe(13);
        });

        it('returns the day count itself at the days unit', () => {
            expect(tickBoundaryAtOrAfter(start, 3.5, 'days', 1, business)).toBe(4);
            expect(tickBoundaryAtOrAfter(start, 15, 'days', 1, business)).toBe(15);
        });

        it('returns 0 for days and weeks when the count is zero or negative', () => {
            expect(tickBoundaryAtOrAfter(start, 0, 'weeks', 5, business)).toBe(0);
            expect(tickBoundaryAtOrAfter(start, -3, 'weeks', 5, business)).toBe(0);
            expect(tickBoundaryAtOrAfter(start, 0, 'days', 1, business)).toBe(0);
            expect(tickBoundaryAtOrAfter(start, -3, 'days', 1, business)).toBe(0);
            expect(tickBoundaryAtOrAfter(start, 1e-9, 'weeks', 5, business)).toBe(0);
        });

        it('behaves like the calendar-day code under calendar:full', () => {
            const full = fromCalendarConfig(fullCal);
            expect(tickBoundaryAtOrAfter(start, 22, 'weeks', 7, full)).toBe(
                tickBoundaryAtOrAfter(start, 22, 'weeks', 7),
            );
            expect(tickBoundaryAtOrAfter(start, 510, 'months', 30, full)).toBe(512);
            expect(tickBoundaryAtOrAfter(start, 27, 'months', 30, full)).toBe(27);
        });
    });
});

describe('resolveScale', () => {
    it('reads the unit + label-every from a `1w` literal', () => {
        const file = {
            roadmapDecl: { properties: [{ key: 'scale:', value: '1w' }] },
        } as unknown as Parameters<typeof resolveScale>[0];
        const preset = resolveScale(file, undefined);
        expect(preset.unit).toBe('weeks');
        expect(preset.labelEvery).toBe(1);
        expect(preset.pixelsPerUnit).toBe(40);
    });

    it('defaults to weeks with thinned labels when no scale is set', () => {
        const file = { roadmapDecl: { properties: [] } } as unknown as Parameters<
            typeof resolveScale
        >[0];
        const preset = resolveScale(file, undefined);
        expect(preset.unit).toBe('weeks');
        expect(preset.pixelsPerUnit).toBe(40);
    });

    describe('labelEveryDefault', () => {
        type File = Parameters<typeof resolveScale>[0];
        type Block = Parameters<typeof resolveScale>[1];
        const fileWith = (value?: string) =>
            ({
                roadmapDecl: { properties: value ? [{ key: 'scale:', value }] : [] },
            }) as unknown as File;
        const blockWith = (props: Record<string, string>) =>
            ({
                properties: Object.entries(props).map(([key, value]) => ({ key, value })),
            }) as unknown as Block;

        it('is set when labelEvery comes from the default thinning', () => {
            const preset = resolveScale(fileWith(), undefined);
            expect(preset.labelEvery).toBe(4);
            expect(preset.labelEveryDefault).toBe(true);
            expect(resolveScale(fileWith('days'), undefined).labelEveryDefault).toBe(true);
            expect(resolveScale(fileWith('months'), undefined).labelEveryDefault).toBe(true);
        });

        it('is absent for a duration literal, which names every unit', () => {
            const preset = resolveScale(fileWith('1w'), undefined);
            expect(preset.labelEvery).toBe(1);
            expect('labelEveryDefault' in preset).toBe(false);
        });

        it('is absent when a scale block sets label-every', () => {
            const preset = resolveScale(fileWith(), blockWith({ 'label-every': '2' }));
            expect(preset.labelEvery).toBe(2);
            expect('labelEveryDefault' in preset).toBe(false);
        });

        it('is set when a scale block switches unit and inherits the default', () => {
            const preset = resolveScale(fileWith(), blockWith({ unit: 'days' }));
            expect(preset.unit).toBe('days');
            expect(preset.labelEveryDefault).toBe(true);
        });

        it('is absent when a block switches unit but the literal fixed labelEvery', () => {
            const preset = resolveScale(fileWith('1w'), blockWith({ unit: 'days' }));
            expect(preset.unit).toBe('days');
            expect('labelEveryDefault' in preset).toBe(false);
        });

        it('is absent when the block sets label-every along with a unit', () => {
            const preset = resolveScale(
                fileWith(),
                blockWith({ unit: 'days', 'label-every': '2' }),
            );
            expect(preset.labelEvery).toBe(2);
            expect('labelEveryDefault' in preset).toBe(false);
        });
    });
});
