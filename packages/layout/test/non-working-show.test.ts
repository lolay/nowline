// The `show` view of a business calendar (specs/working-calendar.md §4.2, §7.3,
// §7.5, §10 Example A; m2p phase 4): non-working days keep their full width as
// shaded bands, a bar paints across them and ends at the end of its last
// working day, and a dated marker sits on its own date.
//
// Every expectation is a literal derived by hand from the rules. Pixels are
// relative to `timeline.originX`, at `scale:1w` (8 px per day) from Mon
// 2026-01-05 with `calendar:business`. An item box sits 6 px inside its
// logical extent. Under show a week is 56 px (7 days), under hide 40 px (5
// working days). The display comes from the file's `default roadmap
// non-working:` key or from the `nonWorking` layout option; the option wins.

import { describe, expect, it } from 'vitest';
import {
    collectLayoutInsights,
    type LayoutOptions,
    layoutRoadmap,
    type PositionedGroup,
    type PositionedItem,
    type PositionedNonWorkingRun,
    type PositionedParallel,
    type PositionedRoadmap,
    type PositionedTrackChild,
    scheduleRoadmap,
} from '../src/index.js';
import { parseAndResolve } from './helpers.js';

type Display = 'hide' | 'show';

/** `LayoutOptions` plus the render-time display this phase adds. */
type DisplayOptions = LayoutOptions & { nonWorking?: Display };

/** A run with the flag this phase adds. */
type Run = PositionedNonWorkingRun & { band?: true };

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** `source` with the file key `default roadmap non-working:<key>` in a config block. */
function withKey(source: string, key: Display | undefined): string {
    if (!key) return source;
    return source.replace(
        '\nroadmap ',
        `\nconfig\n\ndefault roadmap non-working:${key}\n\nroadmap `,
    );
}

async function lay(source: string, options: DisplayOptions = {}, key?: Display) {
    const { file, resolved } = await parseAndResolve(withKey(source, key));
    const model = layoutRoadmap(file, resolved, { theme: 'light', ...options });
    return { file, resolved, model };
}

function ticksOf(model: PositionedRoadmap): Array<[number, string | undefined]> {
    return model.timeline.ticks.map((t) => [t.x - model.timeline.originX, t.label]);
}

function runsOf(model: PositionedRoadmap): Run[] {
    return (model.timeline.nonWorking ?? []) as Run[];
}

function walk(children: PositionedTrackChild[], out: PositionedTrackChild[] = []) {
    for (const child of children) {
        out.push(child);
        if (child.kind !== 'item') walk(child.children, out);
    }
    return out;
}

function nodes(model: PositionedRoadmap, lane = 0): PositionedTrackChild[] {
    return walk(model.swimlanes[lane].children);
}

function item(model: PositionedRoadmap, id: string): PositionedItem {
    const found = nodes(model).find((n): n is PositionedItem => n.kind === 'item' && n.id === id);
    expect(found, `item ${id}`).toBeDefined();
    return found as PositionedItem;
}

/** The box left edge of item `id`, relative to the origin. */
function boxLeft(model: PositionedRoadmap, id: string): number {
    return item(model, id).box.x - model.timeline.originX;
}

function boxRight(model: PositionedRoadmap, id: string): number {
    const i = item(model, id);
    return i.box.x + i.box.width - model.timeline.originX;
}

function container(model: PositionedRoadmap, kind: 'group' | 'parallel') {
    const found = nodes(model).find((n) => n.kind === kind);
    expect(found, kind).toBeDefined();
    return found as PositionedGroup | PositionedParallel;
}

function insightsOf(model: PositionedRoadmap, code: string) {
    return collectLayoutInsights(model, { locale: 'en-US' }).filter((i) => i.code === code);
}

// Example A of specs/working-calendar.md §10: four chained 1w items and a
// Friday milestone.
const EXAMPLE_A = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;

describe('Example A under show', () => {
    it('draws each week 56 px wide: boxes 1-39, 57-95, 113-151, 169-207', async () => {
        const { model } = await lay(EXAMPLE_A, { nonWorking: 'show' });
        expect(['w1', 'w2', 'w3', 'w4'].map((id) => boxLeft(model, id))).toEqual([1, 57, 113, 169]);
        expect(['w1', 'w2', 'w3', 'w4'].map((id) => boxRight(model, id))).toEqual([
            39, 95, 151, 207,
        ]);
    });

    it('puts the Friday milestone at 200, on its own date', async () => {
        const { model } = await lay(EXAMPLE_A, { nonWorking: 'show' });
        expect(model.milestones).toHaveLength(1);
        expect(model.milestones[0].center.x - model.timeline.originX).toBe(200);
    });

    it('keeps the week ticks on Mondays, 56 px apart, and the window to Feb 9', async () => {
        const { model } = await lay(EXAMPLE_A, { nonWorking: 'show' });
        // W4's caption spills past Feb 2, so the axis gains one column (the
        // caption cap, specs/rendering.md).
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 05'],
            [56, 'Jan 12'],
            [112, 'Jan 19'],
            [168, 'Jan 26'],
            [224, 'Feb 02'],
            [280, undefined],
        ]);
        expect(model.timeline.box.width).toBe(280);
        expect(iso(model.timeline.endDate)).toBe('2026-02-09');
        expect(model.timeline.pixelsPerDay).toBe(8);
    });

    it('carries each weekend as a full-width band run, with no seam or titles', async () => {
        const { model } = await lay(EXAMPLE_A, { nonWorking: 'show' });
        const t = model.timeline;
        expect(t.nonWorkingDisplay).toBe('show');
        const runs = runsOf(model);
        expect(runs.map((r) => [r.x - t.originX, r.width, iso(r.from), iso(r.through)])).toEqual([
            [40, 16, '2026-01-10', '2026-01-11'],
            [96, 16, '2026-01-17', '2026-01-18'],
            [152, 16, '2026-01-24', '2026-01-25'],
            [208, 16, '2026-01-31', '2026-02-01'],
            [264, 16, '2026-02-07', '2026-02-08'],
        ]);
        for (const run of runs) {
            expect(run.band).toBe(true);
            expect('seam' in run).toBe(false);
            expect('titles' in run).toBe(false);
        }
    });
});

describe('precedence: surface option, then the file key, then hide', () => {
    // W4's box left edge: 169 under show (3 weeks of 56, plus the 1 px
    // seam), 121 under hide (3 weeks of 40, plus the seam).
    const cases: Array<{ key?: Display; option?: Display; x: number }> = [
        { x: 121 },
        { option: 'show', x: 169 },
        { key: 'show', x: 169 },
        { key: 'show', option: 'hide', x: 121 },
        { key: 'hide', option: 'show', x: 169 },
    ];
    for (const { key, option, x } of cases) {
        it(`file key ${key ?? 'none'}, option ${option ?? 'none'}: W4 at ${x}`, async () => {
            const { model } = await lay(EXAMPLE_A, option ? { nonWorking: option } : {}, key);
            expect(boxLeft(model, 'w4')).toBe(x);
        });
    }
});

describe('engine C is the same in both views', () => {
    // Guard: the schedule takes no display input, so it is green before and
    // after the change.
    it('schedules W4 Jan 26 - Jan 31 with and without the file key', async () => {
        const span = async (key: Display | undefined) => {
            const { file, resolved } = await parseAndResolve(withKey(EXAMPLE_A, key));
            const s = scheduleRoadmap(file, resolved).items.get('w4');
            expect(s).toBeDefined();
            return [iso(s!.start), iso(s!.end)];
        };
        expect(await span(undefined)).toEqual(['2026-01-26', '2026-01-31']);
        expect(await span('show')).toEqual(['2026-01-26', '2026-01-31']);
    });
});

describe('a start inside a working day keeps its fraction', () => {
    const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item mid "Mid" duration:1w after:2026-01-07
`;

    it('Wednesday start under show: the bar crosses the weekend, 17-71', async () => {
        const { model } = await lay(source, { nonWorking: 'show' });
        expect([boxLeft(model, 'mid'), boxRight(model, 'mid')]).toEqual([17, 71]);
    });

    it('Wednesday start under hide: 17-55', async () => {
        const { model } = await lay(source, { nonWorking: 'hide' });
        expect([boxLeft(model, 'mid'), boxRight(model, 'mid')]).toEqual([17, 55]);
    });
});

describe('containers snap their left edge to a working day', () => {
    const lane = (container: string) => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane s "S"
  item a "A" duration:1w
${container}
`;
    const group = lane('  group g "G"\n    item x "X" duration:1w');
    const parallel = lane('  parallel p\n    item x "X" duration:1w\n    item y "Y" duration:1w');

    it('a group after a 1w item is at 56 under show, its child at 57', async () => {
        const { model } = await lay(group, { nonWorking: 'show' });
        expect(container(model, 'group').box.x - model.timeline.originX).toBe(56);
        expect(boxLeft(model, 'x')).toBe(57);
    });

    it('a group after a 1w item is at 40 under hide, its child at 41', async () => {
        const { model } = await lay(group, { nonWorking: 'hide' });
        expect(container(model, 'group').box.x - model.timeline.originX).toBe(40);
        expect(boxLeft(model, 'x')).toBe(41);
    });

    it('a parallel after a 1w item is at 56 under show, its tracks at 57', async () => {
        const { model } = await lay(parallel, { nonWorking: 'show' });
        expect(container(model, 'parallel').box.x - model.timeline.originX).toBe(56);
        expect([boxLeft(model, 'x'), boxLeft(model, 'y')]).toEqual([57, 57]);
    });

    it('a parallel after a 1w item is at 40 under hide, its tracks at 41', async () => {
        const { model } = await lay(parallel, { nonWorking: 'hide' });
        expect(container(model, 'parallel').box.x - model.timeline.originX).toBe(40);
        expect([boxLeft(model, 'x'), boxLeft(model, 'y')]).toEqual([41, 41]);
    });
});

describe('a Sunday window start', () => {
    const source = `nowline v1

roadmap r "R" start:2026-01-04 scale:1w

swimlane a "A"
  item a1 "A1" duration:2w
`;

    it('opens with a clamped band, the first box at 9, and a label-less first tick', async () => {
        const { model } = await lay(source, { nonWorking: 'show' });
        const t = model.timeline;
        const [first] = runsOf(model);
        // The run is Sat Jan 3 - Sun Jan 4; only the Sunday is inside the window.
        expect([first.x - t.originX, first.width, iso(first.from), iso(first.through)]).toEqual([
            0,
            8,
            '2026-01-03',
            '2026-01-04',
        ]);
        expect(boxLeft(model, 'a1')).toBe(9);
        expect(ticksOf(model).slice(0, 2)).toEqual([
            [0, undefined],
            [8, 'Jan 05'],
        ]);
    });
});

describe('month scale', () => {
    const source = `nowline v1

roadmap r "R" start:2026-01-05 scale:1m

swimlane a "A"
  item a1 "A1" duration:3w
`;

    it('draws no band and merges the weekend-only closing column under show', async () => {
        const { model } = await lay(source, { nonWorking: 'show' });
        const runs = runsOf(model);
        expect(runs.length).toBeGreaterThan(0);
        for (const run of runs) expect('band' in run).toBe(false);
        const ticks = model.timeline.ticks;
        expect(ticks).toHaveLength(2);
        expect(ticks[1].x - model.timeline.originX).toBeCloseTo(101.82, 2);
    });

    it('keeps the hide column: 2 ticks, the last at 72.73', async () => {
        const { model } = await lay(source, { nonWorking: 'hide' });
        const ticks = model.timeline.ticks;
        expect(ticks).toHaveLength(2);
        expect(ticks[1].x - model.timeline.originX).toBeCloseTo(72.73, 2);
    });
});

describe('markers and the now-line under show', () => {
    const milestone = `${EXAMPLE_A}
milestone sat "Sat Jan 31" date:2026-01-31
`;

    it('a Saturday milestone sits at 208 on its own date, with no hiddenDate, under show', async () => {
        const { model } = await lay(milestone, { nonWorking: 'show' });
        const sat = model.milestones.find((m) => m.id === 'sat');
        expect(sat).toBeDefined();
        expect(sat!.center.x - model.timeline.originX).toBe(208);
        expect('hiddenDate' in sat!).toBe(false);
    });

    it('a Saturday milestone sits at 160 with hiddenDate under hide', async () => {
        const { model } = await lay(milestone, { nonWorking: 'hide' });
        const sat = model.milestones.find((m) => m.id === 'sat');
        expect(sat).toBeDefined();
        expect(sat!.center.x - model.timeline.originX).toBe(160);
        expect(sat!.hiddenDate).toBe('2026-01-31');
    });

    it('the now-line on Sunday Jan 11 is at 48 under show', async () => {
        const { model } = await lay(EXAMPLE_A, { nonWorking: 'show', today: utc(2026, 1, 11) });
        expect(model.nowline).not.toBeNull();
        expect(model.nowline!.x - model.timeline.originX).toBe(48);
    });

    it('the now-line on Sunday Jan 11 is at 40 under hide', async () => {
        const { model } = await lay(EXAMPLE_A, { nonWorking: 'hide', today: utc(2026, 1, 11) });
        expect(model.nowline).not.toBeNull();
        expect(model.nowline!.x - model.timeline.originX).toBe(40);
    });
});

describe('NL.I1008 reads the same in both views', () => {
    const lane = (body: string) => `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane s "S"
${body}
`;
    const pin = { key: 'after', pin: '2026-01-10', start: '2026-01-12' };

    const dated = lane('  item d "D" duration:1w after:2026-01-10');

    it('an after: date on a Saturday starts on Monday Jan 12, box at 57, under show', async () => {
        const { model } = await lay(dated, { nonWorking: 'show' });
        expect(item(model, 'd').nonWorkingPin).toEqual(pin);
        expect(boxLeft(model, 'd')).toBe(57);
        expect(insightsOf(model, 'NL.I1008').map((i) => i.data.args)).toEqual([
            { name: 'd', ...pin },
        ]);
    });

    it('an after: date on a Saturday starts on Monday Jan 12, box at 41, under hide', async () => {
        const { model } = await lay(dated, { nonWorking: 'hide' });
        expect(item(model, 'd').nonWorkingPin).toEqual(pin);
        expect(boxLeft(model, 'd')).toBe(41);
        expect(insightsOf(model, 'NL.I1008').map((i) => i.data.args)).toEqual([
            { name: 'd', ...pin },
        ]);
    });

    // The lane cursor and the pin both sit at x 40, a tie. The cursor seed of
    // a group or parallel is not snapped, so the pin still reports in show.
    const tie = { key: 'after', pin: '2026-01-10', start: '2026-01-12' };

    for (const view of ['hide', 'show'] as const) {
        it(`an after:2026-01-10 tie inside a group reports under ${view}`, async () => {
            const { model } = await lay(
                lane(
                    '  item a "A" duration:1w\n  group g "G"\n    item x "X" duration:1w after:2026-01-10',
                ),
                { nonWorking: view },
            );
            expect(item(model, 'x').nonWorkingPin).toEqual(tie);
            expect(insightsOf(model, 'NL.I1008')).toHaveLength(1);
            expect(boxLeft(model, 'x')).toBe(view === 'show' ? 57 : 41);
        });

        it(`an after:2026-01-10 tie inside a parallel reports under ${view}`, async () => {
            const { model } = await lay(
                lane(
                    '  item a "A" duration:1w\n  parallel p\n    item x "X" duration:1w after:2026-01-10\n    item y "Y" duration:1w',
                ),
                { nonWorking: view },
            );
            expect(item(model, 'x').nonWorkingPin).toEqual(tie);
            expect(insightsOf(model, 'NL.I1008')).toHaveLength(1);
            expect(boxLeft(model, 'x')).toBe(view === 'show' ? 57 : 41);
        });
    }
});
