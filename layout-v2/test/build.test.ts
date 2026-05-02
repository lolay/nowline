// Validation: walk the architecture knobs from the plan's six criteria.

import { describe, expect, it } from 'vitest';
import { parseMinimal } from '../src/parse.js';
import { buildLayout } from '../src/build.js';
import { weekendsOff } from '../src/working-calendar.js';
import { dayPreset, monthPreset, weekPreset } from '../src/view-preset.js';

const SAMPLE = `nowline v1

roadmap minimal "Starter" start:2026-01-05 scale:1w author:"Engineering roadmap"

swimlane engineering "Engineering"
  item research "Research"  duration:3w status:done
  item design   "Design"    duration:2w status:in-progress remaining:50%
  item build    "Build"     duration:3w status:planned
`;

const today = new Date('2026-01-26T00:00:00Z');

describe('Validation #1 — minimal.nowline produces a recognizable model', () => {
    it('has a header, a timeline, one swimlane with three items, and a now-line', () => {
        const parsed = parseMinimal(SAMPLE);
        const { model } = buildLayout(parsed, { today });
        expect(model.header.title).toBe('Starter');
        expect(model.swimlanes).toHaveLength(1);
        expect(model.swimlanes[0].children.map((c) => c.title)).toEqual([
            'Research',
            'Design',
            'Build',
        ]);
        expect(model.timeline.rows.length).toBeGreaterThan(0);
        expect(model.nowline).not.toBeNull();
    });
});

describe('Validation #2 — TimeScale.invert returns a Date (m4 click/drag path)', () => {
    it('round-trips date → x → date', () => {
        const parsed = parseMinimal(SAMPLE);
        const { timeScale } = buildLayout(parsed, { today });
        const date = new Date('2026-02-02T00:00:00Z');
        const x = timeScale.forward(date);
        const inverted = timeScale.invert(x);
        // Round-trip is exact for continuous calendars.
        expect(inverted.toISOString()).toBe(date.toISOString());
    });
});

describe('Validation #3 — weekendsOff compresses the X axis without touching ItemNode/layout', () => {
    it('the same item bar is wider (more pixels per working day) under weekendsOff', () => {
        const parsed = parseMinimal(SAMPLE);
        const baseline = buildLayout(parsed, { today });
        const compressed = buildLayout(parsed, { today, calendar: weekendsOff() });
        // Pixels per CALENDAR day under continuous mode.
        const baselinePxPerDay = baseline.timeScale.pixelsPerDay();
        // Pixels per WORKING day under non-continuous mode.
        const compressedPxPerWorkingDay = compressed.timeScale.pixelsPerDay();
        expect(compressedPxPerWorkingDay).toBeGreaterThan(baselinePxPerDay);
    });
});

describe('Validation #4 — preset swap changes density without other code changes', () => {
    it('day preset → wider canvas, month preset → narrower canvas', () => {
        const parsed = parseMinimal(SAMPLE);
        const week = buildLayout(parsed, { today, preset: weekPreset });
        const day = buildLayout(parsed, { today, preset: dayPreset });
        const month = buildLayout(parsed, { today, preset: monthPreset });
        expect(day.model.width).toBeGreaterThan(week.model.width);
        expect(month.model.width).toBeLessThan(week.model.width);
    });
});

describe('Validation #5 — ItemNode.measure derives height from text-size + padding', () => {
    it('larger text-size yields taller bars', () => {
        const parsed = parseMinimal(SAMPLE);
        const small = buildLayout(parsed, { today, itemTextSizePx: 11, itemPaddingPx: 4 });
        const large = buildLayout(parsed, { today, itemTextSizePx: 18, itemPaddingPx: 12 });
        expect(large.model.swimlanes[0].children[0].box.height).toBeGreaterThan(
            small.model.swimlanes[0].children[0].box.height,
        );
    });
});

describe('Validation #6 — BandScale.bandwidth drives swimlane row height', () => {
    it('paddingInner reduces the band, increasing the visible vertical gap', () => {
        const parsed = parseMinimal(SAMPLE);
        const tight = buildLayout(parsed, { today, swimlanePaddingInner: 0 });
        const padded = buildLayout(parsed, { today, swimlanePaddingInner: 0.4 });
        expect(padded.bandScale.bandwidth()).toBeLessThan(tight.bandScale.bandwidth());
    });
});

// ---- Fidelity-pass assertions ---------------------------------------------

describe('Fidelity — meta text formatting', () => {
    it('done item shows just the duration ("1w") with no remaining suffix', () => {
        const parsed = parseMinimal(`nowline v1
roadmap r "R" start:2026-01-05 scale:1w
swimlane lane "L"
  item a "A" duration:1w status:done remaining:0%
`);
        const { model } = buildLayout(parsed, { today });
        expect(model.swimlanes[0].children[0].metaText).toBe('1w');
    });

    it('in-progress 50% item formats as "2w - 50% remaining"', () => {
        const parsed = parseMinimal(`nowline v1
roadmap r "R" start:2026-01-05 scale:1w
swimlane lane "L"
  item a "A" duration:2w status:in-progress remaining:50%
`);
        const { model } = buildLayout(parsed, { today });
        expect(model.swimlanes[0].children[0].metaText).toBe('2w - 50% remaining');
    });

    it('item with no `remaining` shown falls back to just the duration', () => {
        const parsed = parseMinimal(`nowline v1
roadmap r "R" start:2026-01-05 scale:1w
swimlane lane "L"
  item a "A" duration:3w status:planned
`);
        const { model } = buildLayout(parsed, { today });
        expect(model.swimlanes[0].children[0].metaText).toBe('3w');
    });
});

describe('Fidelity — full-width swimlane band', () => {
    it('band x equals canvas padding and band right equals canvas width minus padding', () => {
        const parsed = parseMinimal(SAMPLE);
        const { model } = buildLayout(parsed, { today, canvasPadding: 24 });
        const lane = model.swimlanes[0];
        expect(lane.band.x).toBe(24);
        expect(lane.band.x + lane.band.width).toBe(model.width - 24);
    });
});

describe('Fidelity — preset row counts', () => {
    it('weekPreset has exactly one header row', () => {
        expect(weekPreset.headers).toHaveLength(1);
        const parsed = parseMinimal(SAMPLE);
        const { model } = buildLayout(parsed, { today, preset: weekPreset });
        expect(model.timeline.rows).toHaveLength(1);
    });

    it('monthPreset still has two header rows (multi-row capability preserved)', () => {
        expect(monthPreset.headers).toHaveLength(2);
        const parsed = parseMinimal(SAMPLE);
        const { model } = buildLayout(parsed, { today, preset: monthPreset });
        expect(model.timeline.rows).toHaveLength(2);
    });
});
