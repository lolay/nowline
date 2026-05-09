import { describe, expect, it } from 'vitest';
import { TimeScale } from '../src/time-scale.js';
import { buildHeaderTicks, resolveScale } from '../src/view-preset.js';
import { fromCalendarConfig } from '../src/working-calendar.js';

const businessCal = {
    mode: 'business' as const,
    daysPerWeek: 5,
    daysPerMonth: 22,
    daysPerQuarter: 65,
    daysPerYear: 260,
};

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
