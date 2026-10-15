// The `non-working` and `working` config declarations reach the layout and
// engine C (specs/working-calendar.md §4, §10 Examples A, B and C; m2p phase
// 5a). Every expectation is a literal produced in the planning probe with the
// equivalent `CalendarRule`s injected into the calendar resolver, so the
// declarations must reproduce them exactly.
//
// Pixels are relative to `timeline.originX`, at `scale:1w` (8 px per day):
// 40 px per business week under hide, 56 under show. An item box sits 6 px
// inside its logical extent, with an 8 px minimum width. Engine C ends are
// exclusive. `(guard)` marks a case that is green before and after the change.

import { describe, expect, it } from 'vitest';
import {
    type LayoutOptions,
    layoutRoadmap,
    type PositionedItem,
    type PositionedNonWorkingRun,
    type PositionedRoadmap,
    type PositionedTrackChild,
    resolveWorkingCalendar,
    scheduleRoadmap,
} from '../src/index.js';
import { parseAndResolve, parseAndResolveFiles } from './helpers.js';

type Display = 'hide' | 'show';
type Run = PositionedNonWorkingRun & { band?: true };

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** `body` (the roadmap and everything after it) behind a config block holding `declarations`. */
function withDeclarations(body: string, declarations: string[]): string {
    if (declarations.length === 0) return `nowline v1\n\n${body}`;
    return `nowline v1\n\nconfig\n\n${declarations.join('\n')}\n\n${body}`;
}

async function lay(source: string, nonWorking: Display) {
    const { file, resolved } = await parseAndResolve(source);
    const options: LayoutOptions & { nonWorking?: Display } = {
        theme: 'light',
        today: utc(2026, 2, 9),
        nonWorking,
    };
    const model = layoutRoadmap(file, resolved, options);
    return { file, resolved, model };
}

async function schedule(source: string) {
    const { file, resolved } = await parseAndResolve(source);
    return { file, resolved, schedule: scheduleRoadmap(file, resolved) };
}

/** Engine C's `[id, start, end]` for each item id, in the order given. */
function spans(
    s: ReturnType<typeof scheduleRoadmap>,
    ids: string[],
): Array<[string, string, string]> {
    return ids.map((id) => {
        const item = s.items.get(id);
        expect(item, `scheduled item ${id}`).toBeDefined();
        return [id, iso(item!.start), iso(item!.end)];
    });
}

function ticksOf(model: PositionedRoadmap): Array<[number, string | undefined]> {
    return model.timeline.ticks.map((t) => [t.x - model.timeline.originX, t.label]);
}

interface RunSummary {
    x: number;
    width: number;
    from: string;
    through: string;
    titles?: string[];
    band?: true;
}

/** A run as `{ x, width, from, through }`, plus `titles` / `band` only when the run has them. */
function runsOf(model: PositionedRoadmap): RunSummary[] {
    return ((model.timeline.nonWorking ?? []) as Run[]).map((run) => ({
        x: run.x - model.timeline.originX,
        width: run.width,
        from: iso(run.from),
        through: iso(run.through),
        ...('titles' in run ? { titles: run.titles } : {}),
        ...(run.band ? { band: true as const } : {}),
    }));
}

function walk(children: PositionedTrackChild[], out: PositionedTrackChild[] = []) {
    for (const child of children) {
        out.push(child);
        if (child.kind !== 'item') walk(child.children, out);
    }
    return out;
}

function item(model: PositionedRoadmap, id: string): PositionedItem {
    const found = walk(model.swimlanes[0].children).find(
        (n): n is PositionedItem => n.kind === 'item' && n.id === id,
    );
    expect(found, `item ${id}`).toBeDefined();
    return found as PositionedItem;
}

/** The box `[left, right]` of item `id`, relative to the origin. */
function box(model: PositionedRoadmap, id: string): [number, number] {
    const i = item(model, id);
    const left = i.box.x - model.timeline.originX;
    return [left, left + i.box.width];
}

function milestoneX(model: PositionedRoadmap, id: string) {
    const m = model.milestones.find((x) => x.id === id);
    expect(m, `milestone ${id}`).toBeDefined();
    return m!;
}

// ---------------------------------------------------------------------------
// Example B: Thanksgiving, a holiday inside a bar
// ---------------------------------------------------------------------------

const THANKSGIVING = 'non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27';
const THANKSGIVING_DATES = 'non-working thanksgiving "Thanksgiving" date:[2026-11-26, 2026-11-27]';

const EXAMPLE_B_BODY = `roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
`;

const exampleB = (declarations: string[] = [THANKSGIVING]) =>
    withDeclarations(EXAMPLE_B_BODY, declarations);

describe('Example B under hide: a holiday inside a bar pushes its end out', () => {
    it('Checkout is 6-34 (logical 0-40) and QA 46-54, the 8 px minimum width', async () => {
        const { model } = await lay(exampleB(), 'hide');
        expect(box(model, 'checkout')).toEqual([6, 34]);
        expect(box(model, 'qa')).toEqual([46, 54]);
    });

    it('puts the Saturday milestone at 24 with its hidden date', async () => {
        const { model } = await lay(exampleB(), 'hide');
        const m = milestoneX(model, 'launch');
        expect(m.center.x - model.timeline.originX).toBe(24);
        expect(m.hiddenDate).toBe('2026-11-28');
    });

    it('ticks [0, none], [24, Nov 30], [64, Dec 07], [104, none]; width 104, ending 2026-12-14', async () => {
        const { model } = await lay(exampleB(), 'hide');
        // QA's caption spills past the content end at 64, so the axis gains
        // the labelled Dec 07 column (rendering.md § "Caption cap at the
        // chart's end").
        expect(ticksOf(model)).toEqual([
            [0, undefined],
            [24, 'Nov 30'],
            [64, 'Dec 07'],
            [104, undefined],
        ]);
        expect(model.timeline.box.width).toBe(104);
        expect(iso(model.timeline.endDate)).toBe('2026-12-14');
    });

    it('carries the titled holiday run, and a plain weekend run with no titles key', async () => {
        const { model } = await lay(exampleB(), 'hide');
        expect(runsOf(model)).toEqual([
            {
                x: 24,
                width: 0,
                from: '2026-11-26',
                through: '2026-11-29',
                titles: ['Thanksgiving'],
            },
            { x: 64, width: 0, from: '2026-12-05', through: '2026-12-06' },
            { x: 104, width: 0, from: '2026-12-12', through: '2026-12-13' },
        ]);
    });
});

describe('Example B under show: the bar crosses the holiday', () => {
    it('Checkout is 6-66 (logical 0-72) and QA 78-86 (logical 72-88)', async () => {
        const { model } = await lay(exampleB(), 'show');
        expect(box(model, 'checkout')).toEqual([6, 66]);
        expect(box(model, 'qa')).toEqual([78, 86]);
    });

    it('puts the Saturday milestone at 40 on its own date, with no hidden date', async () => {
        const { model } = await lay(exampleB(), 'show');
        const m = milestoneX(model, 'launch');
        expect(m.center.x - model.timeline.originX).toBe(40);
        expect('hiddenDate' in m).toBe(false);
    });

    it('ticks [0, Nov 23], [56, Nov 30], [112, Dec 07], [168, none]; width 168, ending 2026-12-14', async () => {
        const { model } = await lay(exampleB(), 'show');
        // QA's spilled caption adds the Dec 07 column, as under hide.
        expect(ticksOf(model)).toEqual([
            [0, 'Nov 23'],
            [56, 'Nov 30'],
            [112, 'Dec 07'],
            [168, undefined],
        ]);
        expect(model.timeline.box.width).toBe(168);
        expect(iso(model.timeline.endDate)).toBe('2026-12-14');
    });

    it('draws the titled run as a band at every scale, and the weekend as a band', async () => {
        const { model } = await lay(exampleB(), 'show');
        expect(runsOf(model)).toEqual([
            {
                x: 24,
                width: 32,
                from: '2026-11-26',
                through: '2026-11-29',
                titles: ['Thanksgiving'],
                band: true,
            },
            { x: 96, width: 16, from: '2026-12-05', through: '2026-12-06', band: true },
            { x: 152, width: 16, from: '2026-12-12', through: '2026-12-13', band: true },
        ]);
    });
});

describe('Example B on engine C', () => {
    const expected: Array<[string, string, string]> = [
        ['checkout', '2026-11-23', '2026-12-02'],
        ['qa', '2026-12-02', '2026-12-04'],
    ];

    it('schedules Checkout over 5 working days and QA over 2, ends exclusive', async () => {
        const { schedule: s } = await schedule(exampleB());
        expect(spans(s, ['checkout', 'qa'])).toEqual(expected);
        expect(iso(s.milestones.get('launch')!)).toBe('2026-11-28');
    });

    it('is the same with the file key show: the schedule takes no display input', async () => {
        const source = withDeclarations(EXAMPLE_B_BODY, [
            'default roadmap non-working:show',
            THANKSGIVING,
        ]);
        const { schedule: s } = await schedule(source);
        expect(spans(s, ['checkout', 'qa'])).toEqual(expected);
        expect(iso(s.milestones.get('launch')!)).toBe('2026-11-28');
    });
});

describe('Example B with date: in place of start: and end:', () => {
    it('gives a deep-equal hide model', async () => {
        const range = await lay(exampleB(), 'hide');
        const dates = await lay(exampleB([THANKSGIVING_DATES]), 'hide');
        expect(runsOf(dates.model)[0]).toEqual({
            x: 24,
            width: 0,
            from: '2026-11-26',
            through: '2026-11-29',
            titles: ['Thanksgiving'],
        });
        expect(runsOf(dates.model)).toEqual(runsOf(range.model));
        expect(dates.model.timeline).toEqual(range.model.timeline);
        expect(dates.model.swimlanes).toEqual(range.model.swimlanes);
        expect(dates.model.milestones).toEqual(range.model.milestones);
    });

    it('gives the same engine C', async () => {
        const range = await schedule(exampleB());
        const dates = await schedule(exampleB([THANKSGIVING_DATES]));
        expect(spans(dates.schedule, ['checkout', 'qa'])).toEqual(
            spans(range.schedule, ['checkout', 'qa']),
        );
        expect(spans(dates.schedule, ['checkout', 'qa'])).toEqual([
            ['checkout', '2026-11-23', '2026-12-02'],
            ['qa', '2026-12-02', '2026-12-04'],
        ]);
    });
});

describe('Example B without the declaration (guard)', () => {
    it('lays out exactly as before: Checkout 6-34, QA 46-54, a Saturday milestone with a hidden date, no titled run', async () => {
        const { model } = await lay(exampleB([]), 'hide');
        expect(box(model, 'checkout')).toEqual([6, 34]);
        expect(box(model, 'qa')).toEqual([46, 54]);
        const m = milestoneX(model, 'launch');
        expect(m.hiddenDate).toBe('2026-11-28');
        expect(m.center.x - model.timeline.originX).toBe(40);
        for (const run of runsOf(model)) expect('titles' in run).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Example C: a Friday and Saturday weekend
// ---------------------------------------------------------------------------

const EXAMPLE_C = withDeclarations(
    `roadmap r "R" start:2026-01-04 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
`,
    ['non-working weekend "Weekend" every:[fri, sat]'],
);

describe('Example C: non-working weekend every:[fri, sat] replaces the preset weekend', () => {
    it('hide: boxes 6-34, 46-74, 86-114', async () => {
        const { model } = await lay(EXAMPLE_C, 'hide');
        expect(['w1', 'w2', 'w3'].map((id) => box(model, id))).toEqual([
            [6, 34],
            [46, 74],
            [86, 114],
        ]);
    });

    it('hide: weekly ticks from Jan 04, 40 px apart, to a label-less end', async () => {
        const { model } = await lay(EXAMPLE_C, 'hide');
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 04'],
            [40, 'Jan 11'],
            [80, 'Jan 18'],
            [120, 'Jan 25'],
            [160, 'Feb 01'],
            [200, 'Feb 08'],
            [240, undefined],
        ]);
    });

    it('hide: the first run is Fri-Sat Jan 9-10 at 40, and no run is a Saturday-Sunday', async () => {
        const { model } = await lay(EXAMPLE_C, 'hide');
        const runs = runsOf(model);
        expect(runs[0]).toEqual({ x: 40, width: 0, from: '2026-01-09', through: '2026-01-10' });
        expect(runs.some((r) => r.from === '2026-01-10')).toBe(false);
    });

    it('show: boxes 6-34, 62-90, 118-146', async () => {
        const { model } = await lay(EXAMPLE_C, 'show');
        expect(['w1', 'w2', 'w3'].map((id) => box(model, id))).toEqual([
            [6, 34],
            [62, 90],
            [118, 146],
        ]);
    });

    it('show: weekly ticks every 56 px from Jan 04', async () => {
        const { model } = await lay(EXAMPLE_C, 'show');
        const ticks = ticksOf(model);
        expect(ticks.slice(0, 4)).toEqual([
            [0, 'Jan 04'],
            [56, 'Jan 11'],
            [112, 'Jan 18'],
            [168, 'Jan 25'],
        ]);
        const gaps = ticks.slice(1).map(([x], i) => x - ticks[i][0]);
        expect(gaps.every((gap) => gap === 56)).toBe(true);
    });

    it('engine C: w1 Jan 4-9, w2 Jan 11-16, w3 Jan 18-23, ends exclusive', async () => {
        const { schedule: s } = await schedule(EXAMPLE_C);
        expect(spans(s, ['w1', 'w2', 'w3'])).toEqual([
            ['w1', '2026-01-04', '2026-01-09'],
            ['w2', '2026-01-11', '2026-01-16'],
            ['w3', '2026-01-18', '2026-01-23'],
        ]);
    });

    it('the validator is quiet: no NL.W0705 for 5 days a week against 5 working days', async () => {
        const { file } = await parseAndResolve(EXAMPLE_C);
        const codes = (file.$document?.diagnostics ?? []).map(
            (d) => (d.data as { code?: string } | undefined)?.code,
        );
        expect(codes).not.toContain('NL.W0705');
    });

    it('the calendar works Sunday to Thursday, and the week starts on Sunday', async () => {
        const { file, resolved } = await parseAndResolve(EXAMPLE_C);
        const { working } = resolveWorkingCalendar(file, resolved);
        expect([...working.workingWeekdays].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
        expect(working.weekStart).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// A working exception: Example A plus `working crunch ... date:2026-01-10`
// ---------------------------------------------------------------------------

const EXAMPLE_A_BODY = `roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;

const exampleA = (declarations: string[] = []) => withDeclarations(EXAMPLE_A_BODY, declarations);

const CRUNCH = 'working crunch "Crunch Saturday" date:2026-01-10';

describe('a working exception: Saturday Jan 10 works', () => {
    it('hide: the item boxes keep their x', async () => {
        const { model } = await lay(exampleA([CRUNCH]), 'hide');
        expect(['w1', 'w2', 'w3', 'w4'].map((id) => box(model, id))).toEqual([
            [6, 34],
            [46, 74],
            [86, 114],
            [126, 154],
        ]);
    });

    it('hide: the Friday milestone moves from 152 to 160 (guard for 152)', async () => {
        const before = await lay(exampleA(), 'hide');
        expect(milestoneX(before.model, 'fri').center.x - before.model.timeline.originX).toBe(152);
        const { model } = await lay(exampleA([CRUNCH]), 'hide');
        expect(milestoneX(model, 'fri').center.x - model.timeline.originX).toBe(160);
    });

    it('hide: ticks shift by the extra working day, and the first run is Sunday Jan 11', async () => {
        const { model } = await lay(exampleA([CRUNCH]), 'hide');
        expect(ticksOf(model)).toEqual([
            [0, 'Jan 05'],
            [48, 'Jan 12'],
            [88, 'Jan 19'],
            [128, 'Jan 26'],
            [168, 'Feb 02'],
            [208, undefined],
        ]);
        expect(runsOf(model)[0]).toEqual({
            x: 48,
            width: 0,
            from: '2026-01-11',
            through: '2026-01-11',
        });
    });

    it('show: W2 is 46-82, W3 94-138 and W4 150-194; W4 was 174-202', async () => {
        const before = await lay(exampleA(), 'show');
        expect(box(before.model, 'w4')).toEqual([174, 202]);
        const { model } = await lay(exampleA([CRUNCH]), 'show');
        expect(['w2', 'w3', 'w4'].map((id) => box(model, id))).toEqual([
            [46, 82],
            [94, 138],
            [150, 194],
        ]);
    });

    it('show: the first run is the Sunday, a band 8 wide at 48', async () => {
        const { model } = await lay(exampleA([CRUNCH]), 'show');
        expect(runsOf(model)[0]).toEqual({
            x: 48,
            width: 8,
            from: '2026-01-11',
            through: '2026-01-11',
            band: true,
        });
    });

    it('engine C: w2 Jan 10-16, w3 Jan 16-23, w4 Jan 23-30 (it was Jan 26-31)', async () => {
        const before = await schedule(exampleA());
        expect(spans(before.schedule, ['w4'])).toEqual([['w4', '2026-01-26', '2026-01-31']]);
        const { schedule: s } = await schedule(exampleA([CRUNCH]));
        expect(spans(s, ['w2', 'w3', 'w4'])).toEqual([
            ['w2', '2026-01-10', '2026-01-16'],
            ['w3', '2026-01-16', '2026-01-23'],
            ['w4', '2026-01-23', '2026-01-30'],
        ]);
    });
});

// ---------------------------------------------------------------------------
// Precedence: dated beats bounded beats open-ended; working wins ties
// ---------------------------------------------------------------------------

describe('precedence (specs/working-calendar.md §5)', () => {
    it('a bounded Friday closure beats the open-ended week', async () => {
        const source = exampleA(['non-working every:fri start:2026-01-12 end:2026-01-25']);
        const { schedule: s } = await schedule(source);
        expect(spans(s, ['w2', 'w3', 'w4'])).toEqual([
            ['w2', '2026-01-12', '2026-01-20'],
            ['w3', '2026-01-20', '2026-01-28'],
            ['w4', '2026-01-28', '2026-02-04'],
        ]);
        const { model } = await lay(source, 'hide');
        expect(runsOf(model)).toEqual(
            expect.arrayContaining([
                { x: 72, width: 0, from: '2026-01-16', through: '2026-01-18' },
                { x: 104, width: 0, from: '2026-01-23', through: '2026-01-25' },
            ]),
        );
    });

    it('a dated closure beats a bounded working Saturday', async () => {
        const source = exampleA([
            'working every:sat start:2026-01-12 end:2026-01-25',
            'non-working date:2026-01-17',
        ]);
        const { schedule: s } = await schedule(source);
        expect(spans(s, ['w4'])).toEqual([['w4', '2026-01-24', '2026-01-30']]);
        const { model } = await lay(source, 'hide');
        expect(runsOf(model)).toEqual(
            expect.arrayContaining([
                { x: 80, width: 0, from: '2026-01-17', through: '2026-01-18' },
                { x: 128, width: 0, from: '2026-01-25', through: '2026-01-25' },
            ]),
        );
    });

    // Both tie cases equal Example A, which is also what an ignored declaration
    // gives, so they are guards for working winning the tie.
    const ties: Array<[string, string[]]> = [
        ['a dated tie (guard)', ['non-working date:2026-01-14', 'working date:2026-01-14']],
        [
            'a bounded tie (guard)',
            [
                'non-working every:wed start:2026-01-12 end:2026-01-25',
                'working every:wed start:2026-01-12 end:2026-01-25',
            ],
        ],
    ];
    for (const [name, declarations] of ties) {
        it(`working wins ${name}: engine C and the hide runs equal Example A`, async () => {
            const base = await schedule(exampleA());
            const tied = await schedule(exampleA(declarations));
            const ids = ['w1', 'w2', 'w3', 'w4'];
            expect(spans(tied.schedule, ids)).toEqual(spans(base.schedule, ids));
            const baseModel = await lay(exampleA(), 'hide');
            const tiedModel = await lay(exampleA(declarations), 'hide');
            expect(runsOf(tiedModel.model)).toEqual(runsOf(baseModel.model));
        });
    }
});

// ---------------------------------------------------------------------------
// Isolated regions keep their declarations out of the host calendar
// ---------------------------------------------------------------------------

describe('config:isolate', () => {
    it("the host's calendar ignores an isolated include's declarations (guard)", async () => {
        const { file, resolved } = await parseAndResolveFiles({
            'main.nowline': `nowline v1\n\ninclude "./child.nowline" config:isolate roadmap:isolate\n\nroadmap r "R" start:2026-01-05 calendar:business\n\nswimlane s "S"\n  item x "X" duration:1w\n`,
            'child.nowline': `nowline v1\n\nconfig\n\nnon-working weekend every:[fri, sat]\n\nroadmap child "Child" start:2026-01-05\n\nswimlane cs "CS"\n  item y "Y" duration:1w\n`,
        });
        expect(resolved.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(resolved.content.isolatedRegions).toHaveLength(1);
        const { working } = resolveWorkingCalendar(file, resolved);
        expect([...working.workingWeekdays].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });
});

// ---------------------------------------------------------------------------
// Phase 5b: a titled run carries a label, packed into the marker row
// (specs/working-calendar.md §7.4, §10 Example B; plan decisions 1-3)
// ---------------------------------------------------------------------------
//
// Widths are `estimateTextWidth`: characters x 10 x 0.58, so `Thanksgiving · 2d`
// (17 characters) is 98.6 px and `Launch` (bold) 36.54 px. A label box's `y` is
// its marker-row centre minus 4, and rows are 26 px apart. Values marked
// "probed" were measured at a758c72 before the change; "derived" values follow
// from the probed bounds and the decisions, and a derived literal that
// disagrees after an honest implementation is a decision to escalate, never a
// silent edit.

/** A run with the fields 5b adds; `undefined` until the layout sets them. */
type LabelledRun = Run & {
    label?: string;
    labelBox?: { x: number; y: number; width: number; height: number };
    labelSide?: 'left' | 'right';
    cut?: true;
};

function labelledRuns(model: PositionedRoadmap): LabelledRun[] {
    return (model.timeline.nonWorking ?? []) as LabelledRun[];
}

/** The titled run: the first run that has titles. */
function titledRun(model: PositionedRoadmap): LabelledRun {
    const run = labelledRuns(model).find((r) => 'titles' in r);
    expect(run, 'a titled run').toBeDefined();
    return run as LabelledRun;
}

/** The weekend run (no titles): Saturday and Sunday Dec 5-6. */
function weekendRun(model: PositionedRoadmap): LabelledRun {
    const run = labelledRuns(model).find((r) => iso(r.from) === '2026-12-05');
    expect(run, 'the Dec 5-6 weekend run').toBeDefined();
    return run as LabelledRun;
}

/** The label box of `run`, relative to the origin. */
function labelBoxOf(model: PositionedRoadmap, run: LabelledRun) {
    expect(run.labelBox, 'labelBox').toBeDefined();
    return { ...run.labelBox!, x: run.labelBox!.x - model.timeline.originX };
}

const LABEL_KEYS = ['label', 'labelBox', 'labelSide', 'cut'] as const;

describe('Example B labels (5b)', () => {
    describe('under hide', () => {
        it('labels the titled run `Thanksgiving · 2d` and cuts the seam', async () => {
            const { model } = await lay(exampleB(), 'hide');
            const run = titledRun(model);
            expect(run.label).toBe('Thanksgiving · 2d');
            expect(run.cut).toBe(true);
            expect(run.labelSide).toBe('right');
        });

        it('puts the label box at x 30, 98.6 wide and 12 high, on row 0', async () => {
            const { model } = await lay(exampleB(), 'hide');
            const box = labelBoxOf(model, titledRun(model));
            expect(box.x).toBeCloseTo(30, 5);
            expect(box.width).toBeCloseTo(98.6, 5);
            expect(box.height).toBe(12);
            expect(box.y).toBe(model.timeline.markerRow.y - 4);
        });

        it('places Launch after the run on the same x: row 1, label to its right', async () => {
            const { model } = await lay(exampleB(), 'hide');
            const m = milestoneX(model, 'launch');
            expect(m.center.x - model.timeline.originX).toBe(24);
            expect(m.hiddenDate).toBe('2026-11-28');
            expect(m.labelSide).toBe('right');
            expect(m.labelBox.x - model.timeline.originX).toBeCloseTo(36, 5);
            expect(m.labelBox.width).toBeCloseTo(36.54, 5);
            expect(m.center.y).toBe(model.timeline.markerRow.y + 26);
        });

        it('grows the marker row to two rows', async () => {
            const { model } = await lay(exampleB(), 'hide');
            expect(model.timeline.markerRow.height).toBe(52);
        });

        it('grows the canvas to 272.6 so the label sits on the right (it was 250.32)', async () => {
            const { model } = await lay(exampleB(), 'hide');
            expect(model.width).toBeCloseTo(272.6, 5);
        });

        it('never falls back to the left over the header card (regression pin)', async () => {
            const { model } = await lay(exampleB(), 'hide');
            const run = titledRun(model);
            expect(run.labelSide).toBe('right');
            const box = run.labelBox!;
            // The beside header card ends at the origin less the 12 px gutter (chartLeftX 120).
            expect(box.x).toBeGreaterThanOrEqual(model.timeline.originX - 12);
            // The fallback would put it at -80.6 relative to the origin.
            expect(box.x - model.timeline.originX).toBeGreaterThan(0);
            expect(box.x + box.width + 12).toBeLessThanOrEqual(model.width + 0.001);
        });

        it('keeps the weekend run free of label keys', async () => {
            const { model } = await lay(exampleB(), 'hide');
            const weekend = weekendRun(model);
            for (const key of LABEL_KEYS) expect(key in weekend, key).toBe(false);
        });
    });

    describe('under show', () => {
        it('labels the titled run `Thanksgiving · 2d` with no cut', async () => {
            const { model } = await lay(exampleB(), 'show');
            const run = titledRun(model);
            expect(run.label).toBe('Thanksgiving · 2d');
            expect('cut' in run).toBe(false);
            expect(run.labelSide).toBe('right');
        });

        it('puts the label box at x 30 and 98.6 wide, on row 1', async () => {
            const { model } = await lay(exampleB(), 'show');
            const box = labelBoxOf(model, titledRun(model));
            expect(box.x).toBeCloseTo(30, 5);
            expect(box.width).toBeCloseTo(98.6, 5);
            expect(box.y).toBe(model.timeline.markerRow.y + 22);
        });

        it('keeps Launch on row 0 at x 40, its label at 52', async () => {
            const { model } = await lay(exampleB(), 'show');
            const m = milestoneX(model, 'launch');
            expect(m.center.x - model.timeline.originX).toBe(40);
            expect(m.labelSide).toBe('right');
            expect(m.labelBox.x - model.timeline.originX).toBeCloseTo(52, 5);
            expect(m.labelBox.width).toBeCloseTo(36.54, 5);
            expect(m.center.y).toBe(model.timeline.markerRow.y);
        });

        it('has a two-row marker row and keeps the 312 canvas', async () => {
            const { model } = await lay(exampleB(), 'show');
            expect(model.timeline.markerRow.height).toBe(52);
            expect(model.width).toBeCloseTo(312, 5);
        });

        it('keeps the weekend band free of label keys', async () => {
            const { model } = await lay(exampleB(), 'show');
            const weekend = weekendRun(model);
            for (const key of LABEL_KEYS) expect(key in weekend, key).toBe(false);
        });
    });

    it('leaves the 5a model values untouched: runs, ticks and boxes (guard)', async () => {
        for (const display of ['hide', 'show'] as const) {
            const { model } = await lay(exampleB(), display);
            const run = runsOf(model)[0];
            expect(run).toMatchObject({
                x: 24,
                from: '2026-11-26',
                through: '2026-11-29',
                titles: ['Thanksgiving'],
            });
            expect(model.timeline.endDate.toISOString().slice(0, 10)).toBe('2026-12-14');
        }
    });

    it('draws no label and keeps one marker row without the declaration (guard)', async () => {
        const { model } = await lay(exampleB([]), 'hide');
        for (const run of labelledRuns(model)) {
            for (const key of LABEL_KEYS) expect(key in run, key).toBe(false);
        }
        expect(model.timeline.markerRow.height).toBe(26);
        expect(model.width).toBeCloseTo(264, 5);
    });
});

describe('titled run labels: text (5b decision 1)', () => {
    // Example E's titles: two titled dated rules that start the same day, in either order.
    const ITEM = '  item w1 "W1" duration:1w\n';
    const exampleE = (declarations: string[]) =>
        withDeclarations(
            `roadmap r "R" start:2026-12-21 scale:1w\n\nswimlane s "S"\n${ITEM}`,
            declarations,
        );
    const beta = 'non-working "Beta" start:2026-12-24 end:2026-12-25';
    const alpha = 'non-working "Alpha" date:2026-12-24';

    it('joins the titles with a comma and counts the 2 working days: `Alpha, Beta · 2d`', async () => {
        for (const order of [
            [beta, alpha],
            [alpha, beta],
        ]) {
            const { model } = await lay(exampleE(order), 'hide');
            expect(titledRun(model).label, order.join(' / ')).toBe('Alpha, Beta · 2d');
        }
    });

    it('drops the day count when the run holds no working day: `Sat off`', async () => {
        const source = exampleB(['non-working "Sat off" date:2026-11-28']);
        for (const display of ['hide', 'show'] as const) {
            const { model } = await lay(source, display);
            const run = titledRun(model);
            expect(run.label, display).toBe('Sat off');
            expect(iso(run.from)).toBe('2026-11-28');
            expect(iso(run.through)).toBe('2026-11-29');
        }
    });
});

describe('a file whose only marker-row content is a titled run (5b decision 3)', () => {
    const noMilestone = (declarations: string[]) =>
        withDeclarations(
            `roadmap r "R" start:2026-11-23 scale:1w calendar:business\n\nswimlane a "A"\n  item checkout "Checkout" duration:1w\n  item qa "QA" duration:2d\n`,
            declarations,
        );

    it('gets a marker row of one row (26) where it would have none', async () => {
        for (const display of ['hide', 'show'] as const) {
            const { model } = await lay(noMilestone([THANKSGIVING]), display);
            expect(model.timeline.markerRow.height, display).toBe(26);
            expect(titledRun(model).label, display).toBe('Thanksgiving · 2d');
        }
    });

    it('has no marker row without the declaration (guard)', async () => {
        const { model } = await lay(noMilestone([]), 'hide');
        expect(model.timeline.markerRow.height).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Working exceptions: a titled dated `working` rule is labelled `· +Nd`
// (specs/working-calendar.md §7.4, §10 Example D)
// ---------------------------------------------------------------------------
//
// `Crunch Saturday · +1d` (21 characters) is 121.8 px and `Make-up day · +1d`
// 98.6 px. Every value here was probed with the layout API after the change;
// before it, `timeline.workingExceptions` did not exist, so each test fails on
// the old code at its first expectation.

type Exception = NonNullable<PositionedRoadmap['timeline']['workingExceptions']>[number];

function exceptionsOf(model: PositionedRoadmap): Exception[] {
    return model.timeline.workingExceptions ?? [];
}

function onlyException(model: PositionedRoadmap): Exception {
    const exceptions = exceptionsOf(model);
    expect(exceptions, 'one working exception').toHaveLength(1);
    return exceptions[0];
}

describe('Example D: a titled working Saturday is labelled', () => {
    for (const display of ['hide', 'show'] as const) {
        it(`${display}: labels Sat Jan 10 \`Crunch Saturday · +1d\` at x 40, its label to the right`, async () => {
            const { model } = await lay(exampleA([CRUNCH]), display);
            const exception = onlyException(model);
            expect(exception.label).toBe('Crunch Saturday · +1d');
            expect(exception.titles).toEqual(['Crunch Saturday']);
            expect(iso(exception.from)).toBe('2026-01-10');
            expect(iso(exception.through)).toBe('2026-01-10');
            expect(exception.x - model.timeline.originX).toBe(40);
            expect(exception.labelSide).toBe('right');
            const box = exception.labelBox!;
            expect(box.x - model.timeline.originX).toBeCloseTo(46, 5);
            expect(box.width).toBeCloseTo(121.8, 5);
            expect(box.height).toBe(12);
        });

        it(`${display}: draws no cut line, band or width: the entry has only its seven keys`, async () => {
            const { model } = await lay(exampleA([CRUNCH]), display);
            expect(Object.keys(onlyException(model)).sort()).toEqual([
                'from',
                'label',
                'labelBox',
                'labelSide',
                'through',
                'titles',
                'x',
            ]);
            // No non-working run gains a cut or a title from the working day either.
            for (const run of labelledRuns(model)) {
                expect('cut' in run).toBe(false);
                expect('titles' in run).toBe(false);
            }
        });
    }

    it('hide: the label packs under the Friday milestone, which keeps row 0 (two rows)', async () => {
        const { model } = await lay(exampleA([CRUNCH]), 'hide');
        expect(onlyException(model).labelBox!.y).toBe(model.timeline.markerRow.y + 22);
        expect(milestoneX(model, 'fri').center.y).toBe(model.timeline.markerRow.y);
        expect(model.timeline.markerRow.height).toBe(52);
    });

    it('show: the label shares row 0 with the Friday milestone (one row)', async () => {
        const { model } = await lay(exampleA([CRUNCH]), 'show');
        expect(onlyException(model).labelBox!.y).toBe(model.timeline.markerRow.y - 4);
        expect(model.timeline.markerRow.height).toBe(26);
    });
});

describe('a working exception packs against a nearby milestone', () => {
    // `Ship` on Fri Jan 9 sits at x 32, one day left of the crunch Saturday at 40.
    const SHIP_BODY = EXAMPLE_A_BODY.replace(
        'milestone fri "Fri Jan 30" date:2026-01-30',
        'milestone ship "Ship" date:2026-01-09',
    );
    const ship = (declarations: string[]) => withDeclarations(SHIP_BODY, declarations);

    for (const display of ['hide', 'show'] as const) {
        it(`${display}: Ship keeps the bottom row and the label takes a new top row`, async () => {
            const { model } = await lay(ship([CRUNCH]), display);
            const m = milestoneX(model, 'ship');
            expect(m.center.x - model.timeline.originX).toBe(32);
            expect(m.center.y).toBe(model.timeline.markerRow.y + 26);
            expect(m.labelSide).toBe('right');
            const exception = onlyException(model);
            expect(exception.labelBox!.y).toBe(model.timeline.markerRow.y - 4);
            expect(exception.labelSide).toBe('right');
            expect(model.timeline.markerRow.height).toBe(52);
        });
    }

    it('without the declaration Ship has the one row to itself (guard)', async () => {
        for (const display of ['hide', 'show'] as const) {
            const { model } = await lay(ship([]), display);
            expect(milestoneX(model, 'ship').center.y).toBe(model.timeline.markerRow.y);
            expect(model.timeline.markerRow.height, display).toBe(26);
        }
    });
});

describe('a weekday make-up day inside a titled closure is labelled', () => {
    // Wed Dec 30 works inside Winter break (Thu Dec 24 to Fri Jan 1), which
    // splits the closure into two titled runs. The open week works a Wednesday,
    // so `calendarExceptions` sees nothing to report: the label comes from
    // precedence, where the dated working rule beats the dated closure.
    const source = withDeclarations(
        `roadmap r "R" start:2026-12-21 scale:1w calendar:business\n\nswimlane s "S"\n  item w1 "W1" duration:3w\n`,
        [
            'non-working winter-break "Winter break" start:2026-12-24 end:2027-01-01',
            'working makeup "Make-up day" date:2026-12-30',
        ],
    );
    const expected = { hide: { x: 24, runs: [24, 32] }, show: { x: 72, runs: [24, 80] } };

    for (const display of ['hide', 'show'] as const) {
        it(`${display}: labels Dec 30 \`Make-up day · +1d\` between the two Winter break runs`, async () => {
            const { model } = await lay(source, display);
            const exception = onlyException(model);
            expect(exception.label).toBe('Make-up day · +1d');
            expect(iso(exception.from)).toBe('2026-12-30');
            expect(iso(exception.through)).toBe('2026-12-30');
            expect(exception.x - model.timeline.originX).toBe(expected[display].x);
            const titled = labelledRuns(model).filter((run) => run.label !== undefined);
            expect(titled.map((run) => [run.x - model.timeline.originX, run.label])).toEqual([
                [expected[display].runs[0], 'Winter break · 4d'],
                [expected[display].runs[1], 'Winter break · 2d'],
            ]);
            expect(model.timeline.markerRow.height).toBe(78);
        });
    }
});

describe('working rules that turn no titled day draw nothing', () => {
    const cases: Array<[string, string[]]> = [
        ['an untitled working Saturday', ['working crunch date:2026-01-10']],
        [
            'a titled working rule on a day the week already works',
            ['working "Tuesday" date:2026-01-06'],
        ],
        [
            'a titled working Saturday a bounded working recurrence already opens',
            [
                'working "Saturdays" every:sat start:2026-01-05 end:2026-01-18',
                'working "Crunch" date:2026-01-10',
            ],
        ],
    ];
    for (const [name, declarations] of cases) {
        it(`${name}: no workingExceptions key, one marker row (guard)`, async () => {
            for (const display of ['hide', 'show'] as const) {
                const { model } = await lay(exampleA(declarations), display);
                expect('workingExceptions' in model.timeline, display).toBe(false);
                expect(model.timeline.markerRow.height, display).toBe(26);
                const hasNoRunLabel = labelledRuns(model).every((run) => run.label === undefined);
                expect(hasNoRunLabel, display).toBe(true);
            }
        });
    }
});
