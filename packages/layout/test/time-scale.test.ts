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

/** Date each tick sits on, recovered from its x via the scale's ppd. */
function tickDates(tscale: TimeScale, xs: number[]): string[] {
    return xs.map((x) => {
        const days = Math.round((x - tscale.originX) / tscale.pixelsPerDay);
        return new Date(tscale.domain[0].getTime() + days * DAY_MS).toISOString().slice(0, 10);
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

describe('buildHeaderTicks', () => {
    const start = new Date(Date.UTC(2026, 0, 5));
    const cal = fromCalendarConfig(businessCal);

    it('produces one tick per scale unit, plus a closing tick', () => {
        // 8 weeks of business calendar = 40 days; with 1-week scale and 40 px/week
        // (5 days/week → 8 px/day) we get a 320 px chart and 9 ticks.
        const end = new Date(Date.UTC(2026, 1, 14));
        const tscale = new TimeScale({ domain: [start, end], range: [0, 320] });
        const preset = { unit: 'weeks' as const, labelEvery: 1, pixelsPerUnit: 40 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(ticks).toHaveLength(9);
        expect(ticks[0].x).toBe(0);
        expect(ticks[8].x).toBe(320);
    });

    it('suppresses the label on the trailing tick (no following column)', () => {
        const end = new Date(Date.UTC(2026, 1, 14));
        const tscale = new TimeScale({ domain: [start, end], range: [0, 320] });
        const preset = { unit: 'weeks' as const, labelEvery: 1, pixelsPerUnit: 40 };
        const ticks = buildHeaderTicks(tscale, preset, cal);
        expect(ticks[8].label).toBeUndefined();
        expect(ticks[8].labelX).toBeUndefined();
        expect(ticks[0].label).toBeDefined();
    });
});

describe('buildHeaderTicks on calendar-aligned units', () => {
    // Mirrors RoadmapNode: ppd = pixelsPerUnit / days-per-unit, range =
    // span * ppd. Only the domain and ppd matter to the generator.
    function scaleFor(start: Date, end: Date, ppd: number): TimeScale {
        const span = Math.round((end.getTime() - start.getTime()) / DAY_MS);
        return new TimeScale({ domain: [start, end], range: [100, 100 + span * ppd] });
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
        const tscale = scaleFor(utc(2026, 1, 5), utc(2027, 2, 1), 80 / 22);
        const preset = { unit: 'months' as const, labelEvery: 1, pixelsPerUnit: 80 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(businessCal));
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
        const tscale = scaleFor(utc(2026, 1, 5), utc(2027, 4, 1), 160 / 65);
        const preset = { unit: 'quarters' as const, labelEvery: 1, pixelsPerUnit: 160 };
        const ticks = buildHeaderTicks(tscale, preset, fromCalendarConfig(businessCal));
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
});
