// The business calendar (the default) puts the axis, the date window, the
// ticks, the now-line and engines B and C on working days, and `hide`s the
// weekends (specs/working-calendar.md §5, §7.1, §7.2, §7.5, §10 A).
//
// Every expectation here is a literal date or pixel, derived by hand from the
// rules (Mon-Fri week, 8 px per working day at `scale:1w`, 40 px a week), never
// computed with the calendar under test. Positions are relative to
// `timeline.originX`. `calendar:full` and blockful `calendar:custom` have no
// non-working days and must keep today's numbers (the identity path); the
// byte-level check is in non-working-identity.test.ts.

import type { NowlineFile } from '@nowline/core';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    collectLayoutInsights,
    type LayoutOptions,
    layoutRoadmap,
    type PositionedItem,
    type PositionedRoadmap,
    scheduleRoadmap,
} from '../src/index.js';
import { continuousCalendar, fromCalendarConfig, spanEndDate } from '../src/working-calendar.js';
import { getServices, parseAndResolve } from './helpers.js';

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

const business = fromCalendarConfig({
    mode: 'business',
    daysPerWeek: 5,
    daysPerMonth: 22,
    daysPerQuarter: 65,
    daysPerYear: 260,
});
const full = fromCalendarConfig({
    mode: 'full',
    daysPerWeek: 7,
    daysPerMonth: 30,
    daysPerQuarter: 91,
    daysPerYear: 365,
});

async function lay(source: string, options: LayoutOptions = {}) {
    const { file, resolved } = await parseAndResolve(source);
    const model = layoutRoadmap(file, resolved, { theme: 'light', ...options });
    return { file, resolved, model };
}

/** Tick x relative to the origin, and its label. */
function ticksOf(model: PositionedRoadmap): Array<[number, string | undefined]> {
    return model.timeline.ticks.map((t) => [t.x - model.timeline.originX, t.label]);
}

function laneItems(model: PositionedRoadmap, lane = 0): PositionedItem[] {
    return model.swimlanes[lane].children.filter((c): c is PositionedItem => c.kind === 'item');
}

let validated = 0;

/** Error-severity validator diagnostics for `source`. */
async function validatorErrors(source: string): Promise<string[]> {
    const { shared } = getServices();
    const uri = URI.parse(`memory:///working-day-schedule-${++validated}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    return (doc.diagnostics ?? []).filter((d) => d.severity === 1).map((d) => d.message);
}

function insightsOf(model: PositionedRoadmap, code: string, locale = 'en-US') {
    return collectLayoutInsights(model, { locale }).filter((i) => i.code === code);
}

// --- spanEndDate (specs/working-calendar.md §5.2) ---

describe('spanEndDate', () => {
    const base = utc(2026, 1, 5); // Monday

    it('ends a Mon-Fri item on Saturday (exclusive end)', () => {
        expect(iso(spanEndDate(business, base, 0, 5))).toBe('2026-01-10');
    });

    it('ends the day after the last working day, skipping a weekend inside the span', () => {
        // Index 6 is Tue Jan 13, so seven working days end Wed Jan 14.
        expect(iso(spanEndDate(business, base, 0, 7))).toBe('2026-01-14');
        // A successor starts Monday while its predecessor ends Saturday.
        expect(iso(spanEndDate(business, base, 5, 10))).toBe('2026-01-17');
    });

    it('floors a fractional end: 2.5 working days cover two whole days', () => {
        // floor(2.5) = 2, so the last whole working day is index 1 (Tue Jan 6).
        expect(iso(spanEndDate(business, base, 0, 2.5))).toBe('2026-01-07');
    });

    it('returns the start date when the span covers no whole working day', () => {
        expect(iso(spanEndDate(business, base, 5, 5))).toBe('2026-01-12');
        expect(iso(spanEndDate(business, base, 5, 5.5))).toBe('2026-01-12');
    });

    it('counts index 0 from the first working day at or after a Saturday base', () => {
        // Base Sat Jan 10: index 0 is Mon Jan 12, index 4 is Fri Jan 16.
        expect(iso(spanEndDate(business, utc(2026, 1, 10), 0, 5))).toBe('2026-01-17');
    });

    it('is addDays on the identity path, truncation included', () => {
        const jan1 = utc(2026, 1, 1);
        expect(iso(spanEndDate(full, jan1, 0, 7))).toBe('2026-01-08');
        expect(iso(spanEndDate(full, jan1, 2, 5.5))).toBe('2026-01-06');
        // Truncation toward zero: addDays(Jan 1, -1.5) is Dec 31. The
        // business formula, addDays(dateAt(floor(e) - 1), 1), would say Dec 30.
        expect(iso(spanEndDate(full, jan1, -3, -1.5))).toBe('2025-12-31');
        expect(iso(spanEndDate(continuousCalendar(), jan1, -3, -1.5))).toBe('2025-12-31');
    });
});

// --- Example A of specs/working-calendar.md §10: the probe, hide view ---

describe('the probe (§10 A): four chained 1w items and a Friday milestone', () => {
    const source = (calendar: string) => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:${calendar}

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;

    it('business: W4 is 126-154 (logical 120-160) and the milestone is at 152', async () => {
        const { model } = await lay(source('business'));
        const o = model.timeline.originX;
        const items = laneItems(model);
        expect(items.map((i) => i.id)).toEqual(['w1', 'w2', 'w3', 'w4']);
        const w4 = items[3];
        expect(w4.box.x - o).toBe(126);
        expect(w4.box.x - o + w4.box.width).toBe(154);
        expect(model.milestones).toHaveLength(1);
        expect(model.milestones[0].center.x - o).toBe(152);
    });

    it('business: week ticks at 0/40/80/120/160 labelled Jan 05, Jan 12, Jan 19, Jan 26', async () => {
        const { model } = await lay(source('business'));
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 05'],
            [40, 'Jan 12'],
            [80, 'Jan 19'],
            [120, 'Jan 26'],
            [160, undefined],
        ]);
        expect(iso(model.timeline.endDate)).toBe('2026-02-02');
        expect(model.timeline.pixelsPerDay).toBe(8);
        expect(model.timeline.box.width).toBe(160);
    });

    it('business: the model carries the hidden weekends as zero-width runs', async () => {
        const { model } = await lay(source('business'));
        const t = model.timeline;
        expect(t.nonWorkingDisplay).toBe('hide');
        const runs = t.nonWorking ?? [];
        expect(runs.map((r) => [r.x - t.originX, r.width, iso(r.from), iso(r.through)])).toEqual([
            [40, 0, '2026-01-10', '2026-01-11'],
            [80, 0, '2026-01-17', '2026-01-18'],
            [120, 0, '2026-01-24', '2026-01-25'],
            [160, 0, '2026-01-31', '2026-02-01'],
        ]);
        // Optional keys appear only when present: a plain weekend has no
        // titles, and no seam is marked at the week scale.
        for (const run of runs) {
            expect('titles' in run).toBe(false);
            expect('seam' in run).toBe(false);
        }
    });

    it('business engine C: W1 Jan 5-10, W4 Jan 26-31 (exclusive ends), milestone Jan 30', async () => {
        const { file, resolved } = await parseAndResolve(source('business'));
        const sched = scheduleRoadmap(file, resolved);
        const span = (id: string): [string, string] => {
            const s = sched.items.get(id);
            expect(s, id).toBeDefined();
            return [iso(s!.start), iso(s!.end)];
        };
        expect(span('w1')).toEqual(['2026-01-05', '2026-01-10']);
        expect(span('w2')).toEqual(['2026-01-12', '2026-01-17']);
        expect(span('w3')).toEqual(['2026-01-19', '2026-01-24']);
        expect(span('w4')).toEqual(['2026-01-26', '2026-01-31']);
        expect(iso(sched.milestones.get('fri')!)).toBe('2026-01-30');
    });

    it('calendar:full keeps today numbers: same ticks and bars, milestone at 25 calendar days', async () => {
        const { model } = await lay(source('full'));
        const o = model.timeline.originX;
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 05'],
            [40, 'Jan 12'],
            [80, 'Jan 19'],
            [120, 'Jan 26'],
            [160, undefined],
        ]);
        const w4 = laneItems(model)[3];
        expect(w4.box.x - o).toBe(126);
        expect(w4.box.width).toBe(28);
        // 25 days at 40/7 px a day.
        expect(model.milestones[0].center.x - o).toBeCloseTo(142.857, 2);
        expect(iso(model.timeline.endDate)).toBe('2026-02-02');
        expect(model.timeline.nonWorking).toBeUndefined();
        expect(model.timeline.nonWorkingDisplay).toBeUndefined();
    });

    it('calendar:full engine C keeps calendar days: W1 Jan 5-12, W4 Jan 26-Feb 2', async () => {
        const { file, resolved } = await parseAndResolve(source('full'));
        const sched = scheduleRoadmap(file, resolved);
        expect([iso(sched.items.get('w1')!.start), iso(sched.items.get('w1')!.end)]).toEqual([
            '2026-01-05',
            '2026-01-12',
        ]);
        expect([iso(sched.items.get('w4')!.start), iso(sched.items.get('w4')!.end)]).toEqual([
            '2026-01-26',
            '2026-02-02',
        ]);
        expect(iso(sched.milestones.get('fri')!)).toBe('2026-01-30');
    });
});

// --- Edges ---

describe('hide edges', () => {
    it('a Saturday start opens at the Monday seam: first label Jan 12, nothing left of originX', async () => {
        const { model } = await lay(`nowline v1

roadmap r "R" start:2026-01-10 scale:1w

swimlane a "A"
  item a1 "A1" duration:2w
`);
        const o = model.timeline.originX;
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 12'],
            [40, 'Jan 19'],
            [80, undefined],
        ]);
        expect(model.timeline.ticks.every((t) => t.x >= o)).toBe(true);
        expect(iso(model.timeline.endDate)).toBe('2026-01-26');
        expect(laneItems(model)[0].box.x - o).toBe(6);
    });

    it('today on a Sunday puts the now-line at working-day index 25', async () => {
        // Sun Feb 8 maps to the seam, the start of Monday Feb 9: index 25.
        const { model } = await lay(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item a1 "A1" duration:1w
`,
            { today: utc(2026, 2, 8) },
        );
        expect(model.nowline).not.toBeNull();
        expect(model.nowline!.x - model.timeline.originX).toBe(200);
        expect(iso(model.timeline.endDate)).toBe('2026-02-09');
    });

    it('a Wednesday start has a 24 px first column with Jan 07 dropped, then Monday ticks', async () => {
        const { model } = await lay(`nowline v1

roadmap r "R" start:2026-01-07 scale:1w

swimlane a "A"
  item a1 "A1" duration:2w
`);
        expect(ticksOf(model)).toEqual([
            [0, undefined],
            [24, 'Jan 12'],
            [64, 'Jan 19'],
            [104, undefined],
        ]);
        expect(iso(model.timeline.endDate)).toBe('2026-01-26');
    });

    it('a Wednesday-ending length: drops the closing column label, keeping its tick', async () => {
        // length:7d ends Wed Jan 14 (index 7); the last column is 16 px.
        const { model } = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w length:7d

swimlane a "A"
  item a1 "A1" duration:1w
`);
        expect(iso(model.timeline.endDate)).toBe('2026-01-14');
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 05'],
            [40, undefined],
            [56, undefined],
        ]);
    });

    it('fr-CA business scale:1w keeps every week label, though wider than a 40 px column', async () => {
        const { model } = await lay(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`,
            { locale: 'fr-CA' },
        );
        expect(model.timeline.ticks.map((t) => t.label)).toEqual([
            'janv. 05',
            'janv. 12',
            'janv. 19',
            'janv. 26',
            undefined,
        ]);
    });
});

describe('hide months', () => {
    it('the Feb column starts at the x of Mon Feb 2, since Feb 1 is a Sunday', async () => {
        // 2m = 44 working days; the window pads to Apr 1 (index 62).
        const { model } = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1m

milestone feb "Feb 2" date:2026-02-02

swimlane a "A"
  item a1 "A1" duration:2m
`);
        const o = model.timeline.originX;
        const ticks = model.timeline.ticks;
        expect(ticks.map((t) => t.label)).toEqual(['Jan', 'Feb', 'Mar', undefined]);
        // 20 working days at 80/22 px each.
        expect(ticks[1].x - o).toBeCloseTo(72.727, 2);
        expect(model.milestones[0].center.x).toBeCloseTo(ticks[1].x, 6);
        // Mar 1 is a Sunday too: Monday Mar 2 is index 40.
        expect(ticks[2].x - o).toBeCloseTo(145.455, 2);
        expect(iso(model.timeline.endDate)).toBe('2026-04-01');
    });

    it('content ending Fri Jan 30 pads to Feb 1, not March', async () => {
        const { model } = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1m

swimlane a "A"
  item a1 "A1" duration:4w
`);
        expect(iso(model.timeline.endDate)).toBe('2026-02-02');
        expect(model.timeline.ticks.map((t) => t.label)).toEqual(['Jan', undefined]);
    });
});

// --- Days scale ---

describe('hide at the days scale', () => {
    // `scale:1d` on the roadmap line, with the config `scale` block holding
    // only `label-every` (its validator field list has no `unit`). With no
    // scale lines the block is left out and the roadmap says `scale:days`:
    // a literal fixes one label per unit, so only the unit name reaches the
    // default thinning. Layout reads it, but the validator accepts only
    // literals (NL.E0406), so that one variant is not validator-clean.
    const source = (extra = '', scaleLines = '  label-every: 2\n') => {
        const scaleBlock = scaleLines ? `scale\n${scaleLines}` : '';
        const config = scaleBlock || extra ? `config\n\n${scaleBlock}${extra}\n` : '';
        const scale = scaleLines ? '1d' : 'days';
        return `nowline v1

${config}roadmap r "R" start:2026-01-05 scale:${scale}

swimlane a "A"
  item a1 "A1" duration:3w
`;
    };

    it('uses fixtures the validator accepts, except scale:days for the default thinning', async () => {
        expect(await validatorErrors(source())).toEqual([]);
        expect(await validatorErrors(source('default roadmap minor-grid:true\n'))).toEqual([]);
        expect(await validatorErrors(source('', ''))).toEqual([
            'Invalid scale "days". Use a raw duration literal like 1w, 2w, 1q (no name lookup).',
        ]);
    });

    it('drops the weekends and majors on every second kept column', async () => {
        const { model } = await lay(source());
        const ticks = model.timeline.ticks;
        // 15 working days, 5 px each, plus the closing tick.
        expect(model.timeline.pixelsPerDay).toBe(5);
        expect(ticks.map((t) => t.x - model.timeline.originX)).toEqual(
            Array.from({ length: 16 }, (_, i) => i * 5),
        );
        expect(
            ticks.filter((t) => t.major).map((t) => [t.x - model.timeline.originX, t.label]),
        ).toEqual([
            [0, '1/5'],
            [10, '1/7'],
            [20, '1/9'],
            [30, '1/13'],
            [40, '1/15'],
            [50, '1/19'],
            [60, '1/21'],
            [70, '1/23'],
        ]);
        expect(ticks[15].label).toBeUndefined();
        expect(iso(model.timeline.endDate)).toBe('2026-01-26');
    });

    it('marks the seam at Jan 10-11 (Mon Jan 12 is a minor column) but not at Jan 17-18 (major)', async () => {
        const { model } = await lay(source());
        const o = model.timeline.originX;
        const runs = model.timeline.nonWorking ?? [];
        expect(runs.map((r) => [r.x - o, iso(r.from), iso(r.through)])).toEqual([
            [25, '2026-01-10', '2026-01-11'],
            [50, '2026-01-17', '2026-01-18'],
            [75, '2026-01-24', '2026-01-25'],
        ]);
        // Seam only where the run is strictly inside the chart and no grid
        // line falls at its x: column 5 (Jan 12) is minor, column 10 is
        // major, and the third run sits on the right edge.
        expect(runs.map((r) => r.seam)).toEqual([true, undefined, undefined]);
        expect('seam' in runs[1]).toBe(false);
        expect('seam' in runs[2]).toBe(false);
    });

    it('marks no seam with minor-grid:true, which draws a line at every column', async () => {
        const { model } = await lay(source('default roadmap minor-grid:true\n'));
        const runs = model.timeline.nonWorking ?? [];
        expect(runs).toHaveLength(3);
        for (const run of runs) expect('seam' in run).toBe(false);
    });

    it('marks no seam under default thinning, whose majors are the Mondays', async () => {
        const { model } = await lay(source('', ''));
        const o = model.timeline.originX;
        const columns = model.timeline.ticks.slice(0, -1);
        expect(columns.filter((t) => t.major).map((t) => [t.x - o, t.label])).toEqual([
            [0, '1/5'],
            [25, '1/12'],
            [50, '1/19'],
        ]);
        const runs = model.timeline.nonWorking ?? [];
        expect(runs).toHaveLength(3);
        for (const run of runs) expect('seam' in run).toBe(false);
    });
});

// --- Hidden-day markers, overrun dates ---

describe('markers dated on a non-working day', () => {
    const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor sun "Sunday anchor" date:2026-01-11
milestone sat "Saturday gate" date:2026-01-10
milestone mon "Monday gate" date:2026-01-12

swimlane a "A"
  item a1 "A1" duration:2w
milestone done "Done" after:[a1]
`;

    it('carries hiddenDate on a milestone and an anchor on a weekend, at the seam x', async () => {
        const { model } = await lay(source);
        const o = model.timeline.originX;
        const ms = new Map(model.milestones.map((m) => [m.id, m]));
        expect(ms.get('sat')!.hiddenDate).toBe('2026-01-10');
        expect(model.anchors[0].hiddenDate).toBe('2026-01-11');
        // Saturday, Sunday and Monday all sit at the start of Monday: index 5.
        expect(ms.get('sat')!.center.x - o).toBe(40);
        expect(model.anchors[0].center.x - o).toBe(40);
        expect(ms.get('mon')!.center.x - o).toBe(40);
    });

    it('omits hiddenDate for a working-day milestone and for an after-only one', async () => {
        const { model } = await lay(source);
        const ms = new Map(model.milestones.map((m) => [m.id, m]));
        expect('hiddenDate' in ms.get('mon')!).toBe(false);
        expect('hiddenDate' in ms.get('done')!).toBe(false);
    });

    it('carries no hiddenDate under calendar:full, even on a Saturday', async () => {
        const { model } = await lay(source.replace('scale:1w', 'scale:1w calendar:full'));
        for (const m of model.milestones) expect('hiddenDate' in m).toBe(false);
        expect('hiddenDate' in model.anchors[0]).toBe(false);
    });
});

describe('NL.I1007 on the business calendar', () => {
    const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:1w wave:w2

milestone sat "Saturday gate" date:2026-01-10 after:w1
milestone wed "Wednesday gate" date:2026-01-14 after:w1
`;

    it('reports a Saturday milestone under its own date, not the Monday its x reads back to', async () => {
        const { model } = await lay(source);
        expect(insightsOf(model, 'NL.I1007').map((i) => i.message)).toEqual([
            'Milestone "sat" (2026-01-10) is overrun: wave "w1" ends 2026-01-17.',
            'Milestone "wed" (2026-01-14) is overrun: wave "w1" ends 2026-01-17.',
        ]);
    });

    it('carries overrunDate on dated milestones a wave overruns, and on no others', async () => {
        const { model } = await lay(source);
        const ms = new Map(model.milestones.map((m) => [m.id, m]));
        expect(ms.get('sat')!.overrunDate).toBe('2026-01-10');
        expect(ms.get('wed')!.overrunDate).toBe('2026-01-14');
        const later = await lay(source.replace('date:2026-01-14', 'date:2026-01-30'));
        const mWed = later.model.milestones.find((m) => m.id === 'wed')!;
        expect('overrunByWave' in mWed).toBe(false);
        expect('overrunDate' in mWed).toBe(false);
    });
});

// --- Waves ---

describe('business waves: engines A and C agree on wave dates', () => {
    // w1 holds a 3d item (last day Wed Jan 7); w2 waits for after:Saturday.
    // a2 is a full week: a bar narrower than its insets plus MIN_ITEM_WIDTH
    // (a 2d bar is 16 px) widens engine A's logical end (specs/waves.md
    // §8.4), which engine C does not model.
    const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two" after:2026-01-10

swimlane a
  item a1 duration:3d wave:w1
  item a2 duration:1w wave:w2
`;

    it('opens wave 2 on Monday Jan 12 in engine A', async () => {
        const { model } = await lay(source);
        const spans = (model.waves ?? []).map((w) => [w.id, iso(w.startDate), iso(w.endDate)]);
        expect(spans).toEqual([
            ['w1', '2026-01-05', '2026-01-08'],
            ['w2', '2026-01-12', '2026-01-17'],
        ]);
        expect(model.waves?.[1].floorRef).toBe('2026-01-10');
        expect(model.waves![1].startDate.getUTCDay()).toBe(1);
    });

    it('opens wave 2 on Monday Jan 12 in engine C', async () => {
        const { file, resolved } = await parseAndResolve(source);
        const sched = scheduleRoadmap(file, resolved);
        const spans = [...(sched.waves ?? new Map())].map(([id, w]) => [
            id,
            iso(w.start),
            iso(w.end),
        ]);
        expect(spans).toEqual([
            ['w1', '2026-01-05', '2026-01-08'],
            ['w2', '2026-01-12', '2026-01-17'],
        ]);
        expect(sched.waves!.get('w2')!.floorRef).toBe('2026-01-10');
    });

    it('the two engines report equal wave dates', async () => {
        const { file, resolved, model } = await lay(source);
        const sched = scheduleRoadmap(file, resolved);
        const a = (model.waves ?? []).map((w) => [w.id, iso(w.startDate), iso(w.endDate)]);
        const c = [...(sched.waves ?? new Map())].map(([id, w]) => [id, iso(w.start), iso(w.end)]);
        expect(a).toEqual(c);
        // And the bars sit where the dates say: w2 opens at index 5 (40 px).
        const o = model.timeline.originX;
        expect((model.waves![1].startX - o) / 8).toBe(5);
        expect((model.waves![0].endX - o) / 8).toBe(3);
    });

    it('a1 ends Thu Jan 8 and the Saturday floor, not that end, sets wave 2', async () => {
        const { file, resolved } = await parseAndResolve(source);
        const sched = scheduleRoadmap(file, resolved);
        expect(iso(sched.items.get('a1')!.end)).toBe('2026-01-08');
        expect(iso(sched.items.get('a2')!.start)).toBe('2026-01-12');
        expect(iso(sched.items.get('a2')!.end)).toBe('2026-01-17');
    });
});

// --- NL.I1008: a pin on a non-working day ---

describe('NL.I1008 and PositionedItem.nonWorkingPin', () => {
    const lanes = (body: string, props = '') => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w${props}

${body}`;

    it('reports a date: pin on a Saturday (Mon Jan 12)', async () => {
        const { model } = await lay(
            lanes('swimlane s "S"\n  item d "D" duration:1w date:2026-01-10\n'),
        );
        expect(laneItems(model)[0].nonWorkingPin).toEqual({
            key: 'date',
            pin: '2026-01-10',
            start: '2026-01-12',
        });
        const [insight] = insightsOf(model, 'NL.I1008');
        expect(insight.severity).toBe('info');
        expect(insight.lspSeverity).toBe(3);
        expect(insight.entityId).toBe('d');
        expect(insight.message).toBe(
            'Item "d" is pinned to 2026-01-10 (date:), a non-working day; it starts on 2026-01-12.',
        );
        expect(insight.data.args).toEqual({
            name: 'd',
            pin: '2026-01-10',
            key: 'date',
            start: '2026-01-12',
        });
    });

    it('reports a start: pin on a Sunday', async () => {
        const { model } = await lay(
            lanes('swimlane s "S"\n  item st "St" duration:1w start:2026-01-11\n'),
        );
        expect(laneItems(model)[0].nonWorkingPin).toEqual({
            key: 'start',
            pin: '2026-01-11',
            start: '2026-01-12',
        });
        expect(insightsOf(model, 'NL.I1008').map((i) => i.message)).toEqual([
            'Item "st" is pinned to 2026-01-11 (start:), a non-working day; it starts on 2026-01-12.',
        ]);
    });

    it('reports an after:DATE pin on a Saturday that set the start (Mon Jan 19)', async () => {
        const { model } = await lay(
            lanes('swimlane s "S"\n  item af "Af" duration:1w after:2026-01-17\n'),
        );
        expect(laneItems(model)[0].nonWorkingPin).toEqual({
            key: 'after',
            pin: '2026-01-17',
            start: '2026-01-19',
        });
        expect(insightsOf(model, 'NL.I1008').map((i) => i.data.args)).toEqual([
            { name: 'af', pin: '2026-01-17', key: 'after', start: '2026-01-19' },
        ]);
    });

    it('translates the message into French', async () => {
        const { model } = await lay(
            lanes('swimlane s "S"\n  item d "D" duration:1w date:2026-01-10\n'),
        );
        const [insight] = insightsOf(model, 'NL.I1008', 'fr');
        expect(insight.message).toBe(
            "L'élément «\u00A0d\u00A0» est épinglé à 2026-01-10 (date:), un jour non ouvré\u00A0; il démarre le 2026-01-12.",
        );
    });

    it('says nothing when a later after: ref set the start, even with a Sunday in the list', async () => {
        // b starts at a's end (index 10); the Sunday (index 5) never bound it.
        const { model } = await lay(
            lanes(
                'swimlane s "S"\n  item a "A" duration:2w\nswimlane t "T"\n  item b "B" duration:1w after:[a, 2026-01-11]\n',
            ),
        );
        expect('nonWorkingPin' in laneItems(model, 1)[0]).toBe(false);
        expect(insightsOf(model, 'NL.I1008')).toEqual([]);
    });

    it('says nothing when the lane cursor set the start', async () => {
        // The parallel opens at the lane cursor, a's end (index 10), and x
        // starts there; its Saturday pin (index 5) is earlier. (A lane item
        // with `after:` alone is not held by the cursor in engine A: it
        // starts at the pin, on a new row.)
        const { model } = await lay(
            lanes(
                'swimlane s "S"\n  item a "A" duration:2w\n  parallel p\n    item x "X" duration:1w after:2026-01-10\n    item y "Y" duration:1w\n',
            ),
        );
        const parallel = model.swimlanes[0].children.find((c) => c.kind === 'parallel');
        const x = parallel?.kind === 'parallel' ? parallel.children[0] : undefined;
        expect(x?.kind === 'item' ? x.id : undefined).toBe('x');
        expect(x && x.box.x - model.timeline.originX).toBe(86);
        expect(x !== undefined && 'nonWorkingPin' in x).toBe(false);
        expect(insightsOf(model, 'NL.I1008')).toEqual([]);
    });

    it('says nothing for pins on working days', async () => {
        const { model } = await lay(
            lanes(
                'swimlane s "S"\n  item d "D" duration:1w date:2026-01-12\nswimlane t "T"\n  item af "Af" duration:1w after:2026-01-16\n',
            ),
        );
        expect('nonWorkingPin' in laneItems(model)[0]).toBe(false);
        expect('nonWorkingPin' in laneItems(model, 1)[0]).toBe(false);
        expect(insightsOf(model, 'NL.I1008')).toEqual([]);
    });

    it('says nothing under calendar:full, where Saturday is a working day', async () => {
        const { model } = await lay(
            lanes(
                'swimlane s "S"\n  item d "D" duration:1w date:2026-01-10\n  item st "St" duration:1w start:2026-01-24\n',
                ' calendar:full',
            ),
        );
        for (const item of laneItems(model)) expect('nonWorkingPin' in item).toBe(false);
        expect(insightsOf(model, 'NL.I1008')).toEqual([]);
    });

    it('defers to NL.W1001 when a wave floor moved the pin', async () => {
        // a2 is pinned to Saturday Jan 10 (index 5), but w2 cannot start before
        // w1 ends (index 10, Mon Jan 19): the wave floor, not the pin, set it.
        const { model } = await lay(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "One"
wave w2 "Two"

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:1w wave:w2 date:2026-01-10
`);
        const a2 = laneItems(model).find((i) => i.id === 'a2')!;
        expect(a2.wavePinOverride).toEqual({
            wave: 'w2',
            key: 'date',
            pin: '2026-01-10',
            start: '2026-01-19',
        });
        expect('nonWorkingPin' in a2).toBe(false);
        const codes = collectLayoutInsights(model, {}).map((i) => i.code);
        expect(codes.filter((c) => c === 'NL.I1008')).toEqual([]);
        expect(codes.filter((c) => c === 'NL.W1001')).toEqual(['NL.W1001']);
    });
});
