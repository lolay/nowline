import { describe, expect, it } from 'vitest';
import {
    buildHeaderRows,
    defaultThinEvery,
    presetByName,
    weekPreset,
    monthPreset,
    dayPreset,
} from '../src/view-preset.js';

const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('presetByName', () => {
    it('week aliases all map to weekPreset', () => {
        expect(presetByName('1w')).toBe(weekPreset);
        expect(presetByName('weeks')).toBe(weekPreset);
        expect(presetByName('week')).toBe(weekPreset);
    });
    it('day aliases map to dayPreset', () => {
        expect(presetByName('1d')).toBe(dayPreset);
        expect(presetByName('days')).toBe(dayPreset);
    });
    it('month aliases map to monthPreset', () => {
        expect(presetByName('1m')).toBe(monthPreset);
        expect(presetByName('months')).toBe(monthPreset);
    });
    it('unknown defaults to week', () => {
        expect(presetByName(undefined)).toBe(weekPreset);
        expect(presetByName('quarters')).toBe(weekPreset);
    });
});

describe('defaultThinEvery', () => {
    it('matches the existing LABEL_THINNING table values', () => {
        expect(defaultThinEvery('day')).toBe(7);
        expect(defaultThinEvery('week')).toBe(4);
        expect(defaultThinEvery('month')).toBe(3);
        expect(defaultThinEvery('quarter')).toBe(4);
        expect(defaultThinEvery('year')).toBe(5);
    });
});

describe('buildHeaderRows', () => {
    it('weekPreset over 8 weeks yields a single week row anchored at chart start with no year on any label', () => {
        const { rows, resolutionTicks } = buildHeaderRows(
            weekPreset,
            D('2026-01-05'),
            D('2026-03-02'),
        );
        expect(rows).toHaveLength(1);
        const [weekRow] = rows;
        expect(weekRow.unit).toBe('week');

        // Ticks anchor to chart start (Jan 05), not to d3-time week boundaries
        // (Sundays). First label is "Jan 05".
        expect(weekRow.ticks[0].label).toBe('Jan 05');
        // No tick crosses a year boundary, so no label carries a year.
        for (const t of weekRow.ticks) {
            const lab = t.label ?? '';
            expect(lab).toBeTruthy();
            expect(lab).not.toMatch(/2026|2027/);
        }

        // 8 weekly columns → 7 boundaries between them (resolution ticks
        // are emitted at column boundaries, not at the chart edges).
        expect(resolutionTicks.length).toBeGreaterThanOrEqual(7);
    });

    it('weekPreset shows the year on the first tick after a year change', () => {
        const { rows } = buildHeaderRows(
            weekPreset,
            D('2025-12-22'),
            D('2026-01-26'),
        );
        const [weekRow] = rows;
        // Anchor: Dec 22 2025, +7d = Dec 29, +7d = Jan 05 2026.
        const labels = weekRow.ticks.map((t) => t.label);
        expect(labels[0]).toBe('Dec 22'); // first tick: prev=undefined, no year
        expect(labels[1]).toBe('Dec 29'); // same year as prev
        expect(labels[2]).toBe('Jan 05 2026'); // year changed → year shown
    });

    it('dayPreset thinning: month row labels every 1, day row labels every 1', () => {
        // Span chosen to cross Feb 1 so the month row has at least one tick.
        const { rows } = buildHeaderRows(dayPreset, D('2026-01-25'), D('2026-02-08'));
        const [monthRow, dayRow] = rows;
        expect(monthRow.ticks.length).toBeGreaterThan(0);
        expect(monthRow.ticks[0].label).toBeTruthy();
        for (const t of dayRow.ticks) {
            expect(t.label).toBeTruthy();
        }
    });

    it('monthPreset over a 5-month span produces 1 year-row label and one month label per tick', () => {
        const { rows } = buildHeaderRows(monthPreset, D('2026-01-01'), D('2026-06-01'));
        const [yearRow, monthRow] = rows;
        expect(yearRow.unit).toBe('year');
        // d3-time utcYear.range over Jan-Jun 2026 returns just the 2026 year boundary.
        expect(yearRow.ticks.length).toBe(1);
        expect(yearRow.ticks[0].label).toBe('2026');
        // Month row with thinEvery=1.
        for (const t of monthRow.ticks) {
            expect(t.label).toBeTruthy();
        }
    });
});
