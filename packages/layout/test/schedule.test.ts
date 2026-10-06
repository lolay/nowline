// Unit tests for scheduleRoadmap — verifies that floating start/end dates
// match the rendered chart's sequencing rules.

import * as path from 'node:path';
import {
    createNowlineServices,
    isItemDeclaration,
    type NowlineFile,
    type NowlineServices,
    type ResolveResult,
    resolveIncludes,
} from '@nowline/core';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { type RoadmapSchedule, scheduleRoadmap } from '../src/schedule.js';
import { continuousCalendar, fromCalendarConfig } from '../src/working-calendar.js';
import { parseAndResolve } from './helpers.js';

let services:
    | { shared: ReturnType<typeof createNowlineServices>['shared']; Nowline: NowlineServices }
    | undefined;
let counter = 0;

function getServices() {
    if (!services) services = createNowlineServices();
    return services;
}

async function buildSchedule(source: string, today?: Date) {
    const { shared, Nowline } = getServices();
    const uri = URI.parse(`memory:///sched-${++counter}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const ast = doc.parseResult.value;
    const resolved: ResolveResult = await resolveIncludes(ast, '/virtual/f.nowline', {
        services: Nowline,
    });
    return scheduleRoadmap(ast, resolved, { today });
}

const PINNED = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05 Monday

describe('scheduleRoadmap — sequential items', () => {
    it('first item starts at roadmap start date', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w
`,
            PINNED,
        );
        expect(sched.startDate.toISOString().slice(0, 10)).toBe('2026-01-05');
        const a = sched.items.get('a');
        expect(a).toBeDefined();
        expect(a!.start.toISOString().slice(0, 10)).toBe('2026-01-05');
        // 1w = 5 business days → end 2026-01-10
        expect(a!.end.toISOString().slice(0, 10)).toBe('2026-01-10');
    });

    it('second item starts where first ends (sequential chain)', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w
  item b "B" duration:2w
`,
            PINNED,
        );
        const a = sched.items.get('a');
        const b = sched.items.get('b');
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        // a is Mon-Fri, so its exclusive end is Saturday; b starts on the
        // next working day (rule 4), Monday.
        expect(a!.end.toISOString().slice(0, 10)).toBe('2026-01-10');
        expect(b!.start.toISOString().slice(0, 10)).toBe('2026-01-12');
        // 2w = 10 working days → Mon Jan 12 to Fri Jan 23, exclusive end Saturday Jan 24.
        expect(b!.end.toISOString().slice(0, 10)).toBe('2026-01-24');
    });

    it('after: chain overrides sequential default', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
anchor kickoff date:2026-01-12
swimlane s "S"
  item a "A" duration:1w after:kickoff
`,
            PINNED,
        );
        const a = sched.items.get('a');
        expect(a).toBeDefined();
        expect(a!.start.toISOString().slice(0, 10)).toBe('2026-01-12');
        expect(a!.end.toISOString().slice(0, 10)).toBe('2026-01-17');
    });

    it('date: property pins the item start absolutely', async () => {
        // 2026-02-01 is a Sunday: rule 1 moves the start to the next working
        // day, Monday 02-02 (the end is Saturday 02-07, exclusive).
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w
  item b "B" duration:1w date:2026-02-01
`,
            PINNED,
        );
        const b = sched.items.get('b');
        expect(b).toBeDefined();
        expect(b!.start.toISOString().slice(0, 10)).toBe('2026-02-02');
        expect(b!.end.toISOString().slice(0, 10)).toBe('2026-02-07');
    });

    it('a date: pin on a working day keeps its date', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w
  item b "B" duration:1w date:2026-02-02
`,
            PINNED,
        );
        const b = sched.items.get('b');
        expect(b!.start.toISOString().slice(0, 10)).toBe('2026-02-02');
        expect(b!.end.toISOString().slice(0, 10)).toBe('2026-02-07');
    });

    it('a start: pin on a Saturday starts the item on Monday', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w start:2026-01-10
`,
            PINNED,
        );
        const a = sched.items.get('a');
        expect(a!.start.toISOString().slice(0, 10)).toBe('2026-01-12');
        expect(a!.end.toISOString().slice(0, 10)).toBe('2026-01-17');
    });

    it('an after:DATE on a Saturday opens the dependent on the next Monday', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w after:2026-01-17
`,
            PINNED,
        );
        const a = sched.items.get('a');
        expect(a!.start.toISOString().slice(0, 10)).toBe('2026-01-19');
    });

    it('a roadmap start on a Saturday begins on the Monday after', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-10
swimlane s "S"
  item a "A" duration:1w
`,
            PINNED,
        );
        const a = sched.items.get('a');
        expect(a!.start.toISOString().slice(0, 10)).toBe('2026-01-12');
        expect(a!.end.toISOString().slice(0, 10)).toBe('2026-01-17');
    });

    it('a sequence across a weekend skips it: 3d + 3d from Monday', async () => {
        // a: Mon-Wed (end Thu 01-08), b: Thu-Mon, exclusive end Tue 01-13.
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:3d
  item b "B" duration:3d
`,
            PINNED,
        );
        expect(sched.items.get('a')!.end.toISOString().slice(0, 10)).toBe('2026-01-08');
        expect(sched.items.get('b')!.start.toISOString().slice(0, 10)).toBe('2026-01-08');
        expect(sched.items.get('b')!.end.toISOString().slice(0, 10)).toBe('2026-01-13');
    });

    it('calendar:full keeps calendar-day arithmetic', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05 calendar:full
swimlane s "S"
  item a "A" duration:1w
  item b "B" duration:1w date:2026-02-01
`,
            PINNED,
        );
        expect(sched.items.get('a')!.end.toISOString().slice(0, 10)).toBe('2026-01-12');
        expect(sched.items.get('b')!.start.toISOString().slice(0, 10)).toBe('2026-02-01');
        expect(sched.items.get('b')!.end.toISOString().slice(0, 10)).toBe('2026-02-08');
    });
});

describe('scheduleRoadmap — milestones', () => {
    it('date-pinned milestone resolves to its date:', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
milestone m1 "M1" date:2026-06-15
swimlane s "S"
  item a "A" duration:1w
`,
            PINNED,
        );
        const m = sched.milestones.get('m1');
        expect(m).toBeDefined();
        expect(m!.toISOString().slice(0, 10)).toBe('2026-06-15');
    });

    it('after-only milestone floats to the latest predecessor end', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:2w
milestone done "Done" after:[a]
`,
            PINNED,
        );
        const a = sched.items.get('a');
        const m = sched.milestones.get('done');
        expect(a).toBeDefined();
        expect(m).toBeDefined();
        // a is Mon-Fri x 2 (exclusive end Sat 01-17); the milestone is a
        // point, so it floats to the next working day, Monday 01-19.
        expect(a!.end.toISOString().slice(0, 10)).toBe('2026-01-17');
        expect(m!.toISOString().slice(0, 10)).toBe('2026-01-19');
    });

    it('a dated milestone keeps its own date, even on a Saturday', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
milestone sat "Sat" date:2026-01-10
swimlane s "S"
  item a "A" duration:1w
`,
            PINNED,
        );
        expect(sched.milestones.get('sat')!.toISOString().slice(0, 10)).toBe('2026-01-10');
    });
});

describe('scheduleRoadmap — anchors', () => {
    it('anchor date is recorded', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
anchor kickoff date:2026-01-12
swimlane s "S"
  item a "A" duration:1w
`,
            PINNED,
        );
        const k = sched.anchors.get('kickoff');
        expect(k).toBeDefined();
        expect(k!.toISOString().slice(0, 10)).toBe('2026-01-12');
    });
});

describe('scheduleRoadmap — parallel blocks', () => {
    it('parallel items all start at the same baseline', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  parallel p "P"
    item a "A" duration:1w
    item b "B" duration:2w
`,
            PINNED,
        );
        const a = sched.items.get('a');
        const b = sched.items.get('b');
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        // Both start at the same x (the lane baseline = 0 days from start)
        expect(a!.start.toISOString().slice(0, 10)).toBe(b!.start.toISOString().slice(0, 10));
    });
});

// --- Wave barriers (specs/waves.md §5.1, §8.5, §11) ---
//
// Engine C works in working-day indices from the start: under the default
// `calendar:business` one week is 5 working days, under `calendar:full` it is
// 7 calendar days. The tables below are the spec's week offsets; `weeks`
// converts a date back through the matching calendar (a business week is
// five working days of seven calendar days).

async function buildWaveSchedule(source: string) {
    const { shared, Nowline } = getServices();
    const uri = URI.parse(`memory:///sched-${++counter}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const errors = (doc.diagnostics ?? []).filter((d) => d.severity === 1).map((d) => d.message);
    expect(errors).toEqual([]);
    const ast = doc.parseResult.value;
    const resolved = await resolveIncludes(ast, '/virtual/f.nowline', { services: Nowline });
    return { sched: scheduleRoadmap(ast, resolved), resolved };
}

// Resolves `files[main]` under `/root` with an in-memory file system.
async function buildIncludeSchedule(files: Record<string, string>, main: string) {
    const readFile = async (abs: string): Promise<string> => {
        const rel = path.relative('/root', abs).split(path.sep).join('/');
        if (!(rel in files)) throw new Error(`File not found: ${rel}`);
        return files[rel];
    };
    const { file, resolved } = await parseAndResolve(
        files[main],
        path.resolve('/root', main),
        readFile,
    );
    expect(resolved.diagnostics).toEqual([]);
    return { sched: scheduleRoadmap(file, resolved), resolved };
}

const BUSINESS_WEEK = 5;
const FULL_WEEK = 7;

const BUSINESS_CALENDAR = fromCalendarConfig({
    mode: 'business',
    daysPerWeek: 5,
    daysPerMonth: 22,
    daysPerQuarter: 65,
    daysPerYear: 260,
});
const FULL_CALENDAR = continuousCalendar();

function weeks(sched: RoadmapSchedule, d: Date, perWeek: number): number {
    const calendar = perWeek === BUSINESS_WEEK ? BUSINESS_CALENDAR : FULL_CALENDAR;
    return calendar.workingIndexOf(sched.startDate, d) / perWeek;
}

function itemWeeks(
    sched: RoadmapSchedule,
    perWeek: number,
    ids: string[],
): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    for (const id of ids) {
        const it = sched.items.get(id);
        expect(it, id).toBeDefined();
        if (it) out[id] = [weeks(sched, it.start, perWeek), weeks(sched, it.end, perWeek)];
    }
    return out;
}

function expectItems(
    sched: RoadmapSchedule,
    perWeek: number,
    table: Record<string, [number, number]>,
): void {
    expect(itemWeeks(sched, perWeek, Object.keys(table))).toEqual(table);
}

interface WaveRow {
    span: [number, number];
    members: number;
    heldBy?: string;
    floorRef?: string;
}

function expectWaves(
    sched: RoadmapSchedule,
    perWeek: number,
    table: Record<string, WaveRow>,
): void {
    expect(sched.waves).toBeDefined();
    const got: Record<string, WaveRow> = {};
    let index = 0;
    for (const [id, w] of sched.waves ?? []) {
        expect(w.index).toBe(++index);
        got[id] = {
            span: [weeks(sched, w.start, perWeek), weeks(sched, w.end, perWeek)],
            members: w.memberCount,
            ...(w.heldBy !== undefined ? { heldBy: w.heldBy } : {}),
            ...(w.floorRef !== undefined ? { floorRef: w.floorRef } : {}),
        };
        // Omitted, never present as undefined.
        if (w.heldBy === undefined) expect('heldBy' in w).toBe(false);
        if (w.floorRef === undefined) expect('floorRef' in w).toBe(false);
    }
    expect(got).toStrictEqual(table);
}

describe('scheduleRoadmap — no waves', () => {
    it('omits the waves key', async () => {
        const sched = await buildSchedule(
            `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w
`,
            PINNED,
        );
        expect('waves' in sched).toBe(false);
    });
});

describe('scheduleRoadmap — wave barriers (§11 worked examples)', () => {
    it('Example 1: three lanes, three waves', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap launch-plan "Launch plan" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"
wave launch "Launch"

swimlane web "Web"
  item web-research "UX research" duration:2w wave:discover
  item web-build "Checkout v2" duration:3w wave:build
  item web-launch "Launch page" duration:1w wave:launch
swimlane api "API"
  item api-spike "API spike" duration:1w wave:discover
  item api-build "Payments API" duration:4w wave:build
  item api-launch "Rate limits" duration:1w wave:launch
swimlane data "Data"
  item data-audit "Data audit" duration:3w wave:discover
  item data-build "Pipeline" duration:2w wave:build
  item data-launch "Dashboards" duration:2w wave:launch
`);
        expectItems(sched, BUSINESS_WEEK, {
            'web-research': [0, 2],
            'api-spike': [0, 1],
            'data-audit': [0, 3],
            'web-build': [3, 6],
            'api-build': [3, 7],
            'data-build': [3, 5],
            'web-launch': [7, 8],
            'api-launch': [7, 8],
            'data-launch': [7, 9],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            discover: { span: [0, 3], members: 3, heldBy: 'data-audit' },
            build: { span: [3, 7], members: 3, heldBy: 'api-build' },
            launch: { span: [7, 9], members: 3, heldBy: 'data-launch' },
        });
    });

    it('Example 2: a lane with no work in the middle wave', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap gap-lane "Gap lane" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"
wave w3 "Wave 3"

swimlane platform
  item auth duration:2w wave:w1
  item sso duration:2w wave:w2
  item audit duration:1w wave:w3
swimlane mobile
  item offline duration:3w wave:w1
  item push duration:2w wave:w3
`);
        expectItems(sched, BUSINESS_WEEK, {
            auth: [0, 2],
            offline: [0, 3],
            sso: [3, 5],
            audit: [5, 6],
            push: [5, 7],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 3], members: 2, heldBy: 'offline' },
            w2: { span: [3, 5], members: 1, heldBy: 'sso' },
            w3: { span: [5, 7], members: 2, heldBy: 'push' },
        });
    });

    it('Example 3: background work is not floored and never extends a wave', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap background "Background work" start:2026-01-05 scale:1w

wave w1 "Foundations"
wave w2 "Rollout"

swimlane core
  item schema duration:2w wave:w1
  item docs "Docs refresh" duration:2w
  item migrate duration:2w wave:w2
swimlane ops
  item oncall "On-call rotation" duration:6w
swimlane infra
  item infra-prep duration:3w wave:w1
  item cutover duration:1w wave:w2
`);
        expectItems(sched, BUSINESS_WEEK, {
            schema: [0, 2],
            docs: [2, 4],
            migrate: [4, 6],
            oncall: [0, 6],
            'infra-prep': [0, 3],
            cutover: [3, 4],
        });
        // oncall ends at W6 but is background: w1 still closes at W3.
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 3], members: 2, heldBy: 'infra-prep' },
            w2: { span: [3, 6], members: 2, heldBy: 'migrate' },
        });
    });

    it('Example 3 contrast: oncall in w1 holds the barrier', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap background "Background work" start:2026-01-05 scale:1w

wave w1 "Foundations"
wave w2 "Rollout"

swimlane core
  item schema duration:2w wave:w1
  item docs "Docs refresh" duration:2w
  item migrate duration:2w wave:w2
swimlane ops
  item oncall "On-call rotation" duration:6w wave:w1
swimlane infra
  item infra-prep duration:3w wave:w1
  item cutover duration:1w wave:w2
`);
        expectItems(sched, BUSINESS_WEEK, { migrate: [6, 8], cutover: [6, 7] });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 6], members: 3, heldBy: 'oncall' },
            w2: { span: [6, 8], members: 2, heldBy: 'migrate' },
        });
    });

    it('Example 4: parallel tracks in different waves', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap split "Split parallel" start:2026-01-05 scale:1w

wave w1 "Foundations"
wave w2 "Features"

swimlane platform
  item kickoff-work duration:1w wave:w1
  parallel streams
    group api-track wave:w1
      item api-v2 duration:2w
      item api-docs duration:1w
    item sdk-update duration:2w wave:w2
  item integration duration:1w wave:w2
swimlane mobile
  item mobile-spike duration:5w wave:w1
`);
        expectItems(sched, BUSINESS_WEEK, {
            'kickoff-work': [0, 1],
            'api-v2': [1, 3],
            'api-docs': [3, 4],
            'sdk-update': [5, 7],
            integration: [7, 8],
            'mobile-spike': [0, 5],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 5], members: 4, heldBy: 'mobile-spike' },
            w2: { span: [5, 8], members: 2, heldBy: 'integration' },
        });
    });

    it('Example 5: a group that spans waves, and inheritance from a group', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap spanning "Spanning group" start:2026-01-05 scale:1w

wave w1 "Design"
wave w2 "Build"

swimlane checkout
  group checkout-v2 "Checkout v2"
    item flows duration:2w wave:w1
    item ui duration:3w wave:w2
  item polish duration:1w wave:w2
swimlane payments
  item vendor-eval duration:4w wave:w1
  group wave:w2
    item integrate duration:2w
    item certify duration:1w
`);
        expectItems(sched, BUSINESS_WEEK, {
            flows: [0, 2],
            ui: [4, 7],
            polish: [7, 8],
            'vendor-eval': [0, 4],
            integrate: [4, 6],
            certify: [6, 7],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 4], members: 2, heldBy: 'vendor-eval' },
            w2: { span: [4, 8], members: 4, heldBy: 'polish' },
        });
    });

    it('Example 6: a cross-lane after: inside one wave lengthens it', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap same-wave "Same-wave dependency" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
swimlane frontend
  item mocks duration:1w wave:w1
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
`);
        expectItems(sched, BUSINESS_WEEK, {
            schema: [0, 2],
            mocks: [0, 1],
            forms: [2, 3],
            api: [3, 6],
            'wire-up': [6, 8],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 3], members: 3, heldBy: 'forms' },
            w2: { span: [3, 8], members: 2, heldBy: 'wire-up' },
        });
    });

    it('Example 8: after:<wave> on background work and milestones', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap wave-refs "Wave references" start:2026-01-05 scale:1w

wave alpha "Alpha"
wave beta "Beta"

swimlane eng
  item core duration:3w wave:alpha
  item hardening duration:2w wave:beta
swimlane gtm "Go-to-market"
  item pricing duration:2w wave:alpha
  item press-kit duration:2w after:alpha
  item launch-event duration:1w after:beta

milestone alpha-done "Alpha complete" after:alpha
milestone ga "GA" after:[beta, launch-event]
`);
        expectItems(sched, BUSINESS_WEEK, {
            core: [0, 3],
            pricing: [0, 2],
            hardening: [3, 5],
            'press-kit': [3, 5],
            'launch-event': [5, 6],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            alpha: { span: [0, 3], members: 2, heldBy: 'core' },
            beta: { span: [3, 5], members: 1, heldBy: 'hardening' },
        });
        // A floating milestone after:alpha sits at E_alpha.
        expect(weeks(sched, sched.milestones.get('alpha-done')!, BUSINESS_WEEK)).toBe(3);
        expect(weeks(sched, sched.milestones.get('ga')!, BUSINESS_WEEK)).toBe(6);
    });

    it('Example 9: an anchor and an inline date combine with the barrier by max', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap dates "Dates vs barriers" start:2026-01-05 scale:1w calendar:full

anchor budget "Budget release" date:2026-02-09

wave w1 "Integrate"
wave w2 "Launch"

swimlane infra
  item i1 duration:4w wave:w1
  item i2 duration:2w wave:w2 after:budget
swimlane apps
  item a1 duration:1w wave:w1
  item a2 duration:2w wave:w2 after:2026-01-19
`);
        expectItems(sched, FULL_WEEK, {
            i1: [0, 4],
            a1: [0, 1],
            i2: [5, 7],
            a2: [4, 6],
        });
        expectWaves(sched, FULL_WEEK, {
            w1: { span: [0, 4], members: 2, heldBy: 'i1' },
            w2: { span: [4, 7], members: 2, heldBy: 'i2' },
        });
        const w2 = sched.waves?.get('w2');
        expect(w2?.start.toISOString().slice(0, 10)).toBe('2026-02-02');
        expect(w2?.end.toISOString().slice(0, 10)).toBe('2026-02-23');
    });

    it('Example 9 pin variant: a date: pin becomes max(pin, F)', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap dates "Dates vs barriers" start:2026-01-05 scale:1w calendar:full

anchor budget "Budget release" date:2026-02-09

wave w1 "Integrate"
wave w2 "Launch"

swimlane infra
  item i1 duration:4w wave:w1
  item i2 duration:2w wave:w2 after:budget
swimlane apps
  item a1 duration:1w wave:w1
  item a2 duration:2w wave:w2 date:2026-01-19
`);
        expectItems(sched, FULL_WEEK, { a2: [4, 6] });
    });

    it('Example 10: a before: deadline does not move the item', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap deadline "Deadline vs barrier" start:2026-01-05 scale:1w calendar:full

anchor freeze "Code freeze" date:2026-02-16

wave w1 "Build"
wave w2 "Harden"

swimlane web
  item web-a duration:2w wave:w1
  item web-b duration:2w wave:w2 before:freeze
swimlane api
  item api-a duration:5w wave:w1
`);
        expectItems(sched, FULL_WEEK, {
            'web-a': [0, 2],
            'api-a': [0, 5],
            'web-b': [5, 7],
        });
        expectWaves(sched, FULL_WEEK, {
            w1: { span: [0, 5], members: 2, heldBy: 'api-a' },
            w2: { span: [5, 7], members: 1, heldBy: 'web-b' },
        });
    });

    it('Example 11: a start floor opens a gap; a dated milestone stays pinned', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap budget-floor "Budget-held rollout" start:2026-01-05 scale:1w calendar:full

anchor fy-budget "FY budget release" date:2026-02-02

wave plan "Plan"
wave execute "Execute" after:fy-budget

swimlane a
  item a1 duration:2w wave:plan
  item a2 duration:5w wave:execute
swimlane b
  item b1 duration:3w wave:plan
  item b2 duration:7w wave:execute

milestone exec-done "Execute complete" date:2026-03-16 after:execute
`);
        expectItems(sched, FULL_WEEK, {
            a1: [0, 2],
            b1: [0, 3],
            a2: [4, 9],
            b2: [4, 11],
        });
        expectWaves(sched, FULL_WEEK, {
            plan: { span: [0, 3], members: 2, heldBy: 'b1' },
            execute: { span: [4, 11], members: 2, heldBy: 'b2', floorRef: 'fy-budget' },
        });
        expect(sched.waves?.get('execute')?.end.toISOString().slice(0, 10)).toBe('2026-03-23');
        expect(sched.milestones.get('exec-done')?.toISOString().slice(0, 10)).toBe('2026-03-16');
    });

    it('Example 12: an empty wave has zero width and no holder', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap placeholder "Placeholder" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Hardening (TBD)"
wave w3 "Wave 3"

swimlane a
  item a1 duration:2w wave:w1
  item a3 duration:1w wave:w3
swimlane b
  item b1 duration:1w wave:w1
  item b3 duration:2w wave:w3
`);
        expectItems(sched, BUSINESS_WEEK, {
            a1: [0, 2],
            b1: [0, 1],
            a3: [2, 3],
            b3: [2, 4],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 2], members: 2, heldBy: 'a1' },
            w2: { span: [2, 2], members: 0 },
            w3: { span: [2, 4], members: 2, heldBy: 'b3' },
        });
    });

    // Example 16.
    const teamFile = (team: string, design: string, build: string) =>
        [
            'nowline v1',
            '',
            `roadmap ${team}-plan "${team}" start:2026-01-05 scale:1w calendar:full`,
            '',
            'wave plan "Plan"',
            'wave execute "Execute" after:2026-02-02',
            '',
            `swimlane ${team} "${team}"`,
            `  item ${team}-design duration:${design} wave:plan`,
            `  item ${team}-build duration:${build} wave:execute`,
            '',
        ].join('\n');
    const example16 = {
        'teams/web.nowline': teamFile('web', '2w', '3w'),
        'teams/api.nowline': teamFile('api', '3w', '4w'),
        'program.nowline': [
            'nowline v1',
            '',
            'include "./teams/web.nowline"',
            'include "./teams/api.nowline"',
            '',
            'roadmap program "Program" start:2026-01-05 scale:1w calendar:full',
            '',
            'wave plan "Plan"',
            'wave execute "Execute" after:2026-02-02',
            '',
            'swimlane pmo "PMO"',
            '  item kickoff duration:1w wave:plan',
            '  item comms "Launch comms" duration:2w after:execute',
            '',
            'milestone done "Execute complete" after:execute',
            '',
        ].join('\n'),
    };

    it('Example 16: re-declared waves with a shared floor across merged includes', async () => {
        const { sched } = await buildIncludeSchedule(example16, 'program.nowline');
        expectItems(sched, FULL_WEEK, {
            kickoff: [0, 1],
            'web-design': [0, 2],
            'api-design': [0, 3],
            'web-build': [4, 7],
            'api-build': [4, 8],
            comms: [8, 10],
        });
        expectWaves(sched, FULL_WEEK, {
            plan: { span: [0, 3], members: 3, heldBy: 'api-design' },
            execute: { span: [4, 8], members: 2, heldBy: 'api-build', floorRef: '2026-02-02' },
        });
        expect(weeks(sched, sched.milestones.get('done')!, FULL_WEEK)).toBe(8);
    });

    it('Example 16 standalone: a team file renders on its own', async () => {
        const { sched } = await buildWaveSchedule(example16['teams/web.nowline']);
        expectWaves(sched, FULL_WEEK, {
            plan: { span: [0, 2], members: 1, heldBy: 'web-design' },
            execute: { span: [4, 7], members: 1, heldBy: 'web-build', floorRef: '2026-02-02' },
        });
    });

    it('Example 18: a vocabulary-only child does not participate', async () => {
        const { sched } = await buildIncludeSchedule(
            {
                'people.nowline': [
                    'nowline v1',
                    '',
                    'person sam "Sam Chen"',
                    'team platform-team "Platform"',
                    '  person sam',
                    'label risky "Risky"',
                    '',
                ].join('\n'),
                'plan.nowline': [
                    'nowline v1',
                    '',
                    'include "./people.nowline"',
                    '',
                    'roadmap plan "Plan" start:2026-01-05 scale:1w',
                    '',
                    'wave w1 "Wave 1"',
                    'wave w2 "Wave 2"',
                    '',
                    'swimlane platform owner:platform-team',
                    '  item auth duration:2w wave:w1 owner:sam',
                    '  item sso duration:1w wave:w2 labels:risky',
                    '',
                ].join('\n'),
            },
            'plan.nowline',
        );
        expectItems(sched, BUSINESS_WEEK, { auth: [0, 2], sso: [2, 3] });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 2], members: 1, heldBy: 'auth' },
            w2: { span: [2, 3], members: 1, heldBy: 'sso' },
        });
    });

    // Example 19.
    const example19 = {
        'ios.nowline': [
            'nowline v1',
            '',
            'roadmap ios-app "iOS" start:2026-01-05 scale:1w',
            '',
            'wave w1 "Wave 1"',
            'wave w2 "Wave 2"',
            '',
            'swimlane ios',
            '  item ios-offline duration:4w wave:w1',
            '  item ios-push duration:1w wave:w2',
            '',
        ].join('\n'),
        'portfolio.nowline': [
            'nowline v1',
            '',
            'include "./ios.nowline" roadmap:isolate',
            '',
            'roadmap portfolio "Portfolio" start:2026-01-05 scale:1w',
            '',
            'wave w1 "Wave 1"',
            'wave w2 "Wave 2"',
            '',
            'swimlane platform',
            '  item pf-api duration:2w wave:w1',
            '  item pf-scale duration:2w wave:w2',
            '',
        ].join('\n'),
    };

    it('Example 19: an isolated region item holds the barrier', async () => {
        const { sched, resolved } = await buildIncludeSchedule(example19, 'portfolio.nowline');
        expectItems(sched, BUSINESS_WEEK, { 'pf-api': [0, 2], 'pf-scale': [4, 6] });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 4], members: 2, heldBy: 'ios-offline' },
            w2: { span: [4, 6], members: 2, heldBy: 'pf-scale' },
        });
        // Region ids stay out of the id-keyed results; byNode still has them.
        expect(sched.items.has('ios-offline')).toBe(false);
        expect(sched.items.has('ios-push')).toBe(false);
        const regionLane = [...resolved.content.isolatedRegions[0].content.swimlanes.values()][0];
        const regionItems = regionLane.content.filter(isItemDeclaration);
        const spans = regionItems.map((it) => {
            const s = sched.byNode.get(it);
            expect(s).toBeDefined();
            return [
                it.name,
                weeks(sched, s!.start, BUSINESS_WEEK),
                weeks(sched, s!.end, BUSINESS_WEEK),
            ];
        });
        expect(spans).toEqual([
            ['ios-offline', 0, 4],
            ['ios-push', 4, 5],
        ]);
    });

    it('Example 19 standalone: the region file schedules on its own', async () => {
        const { sched } = await buildWaveSchedule(example19['ios.nowline']);
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 4], members: 1, heldBy: 'ios-offline' },
            w2: { span: [4, 5], members: 1, heldBy: 'ios-push' },
        });
    });
});

describe('scheduleRoadmap — wave barrier details', () => {
    it('Example 7: forward references stay ignored across passes', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap lane-order "Lane order" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"

swimlane frontend
  item forms duration:1w wave:w1 after:schema
  item wire-up duration:2w wave:w2 after:api
swimlane backend
  item schema duration:2w wave:w1
  item api duration:3w wave:w2
`);
        expectItems(sched, BUSINESS_WEEK, {
            forms: [0, 1],
            'wire-up': [2, 4],
            schema: [0, 2],
            api: [2, 5],
        });
        expectWaves(sched, BUSINESS_WEEK, {
            w1: { span: [0, 2], members: 2, heldBy: 'schema' },
            w2: { span: [2, 5], members: 2, heldBy: 'api' },
        });
    });

    it('a dated milestone can be a wave floor', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap ms-floor "Milestone floor" start:2026-01-05 scale:1w calendar:full

milestone m date:2026-02-02

wave w1 "Wave 1"
wave w2 "Wave 2" after:m

swimlane a
  item a1 duration:1w wave:w1
  item a2 duration:1w wave:w2
`);
        const w2 = sched.waves?.get('w2');
        expect(w2?.floorRef).toBe('m');
        expect(weeks(sched, w2!.start, FULL_WEEK)).toBe(4);
    });

    it('ties go to the first member in placement order', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap ties "Ties" start:2026-01-05 scale:1w

wave w1 "Wave 1"

swimlane a
  item a1 duration:2w wave:w1
swimlane b
  item b1 duration:2w wave:w1
`);
        expect(sched.waves?.get('w1')?.heldBy).toBe('a1');
    });

    it('heldBy falls back to the title of an item without an id', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap untitled "Untitled" start:2026-01-05 scale:1w

wave w1 "Wave 1"

swimlane a
  item "Long migration" duration:3w wave:w1
  item short duration:1w
`);
        expect(sched.waves?.get('w1')?.heldBy).toBe('Long migration');
    });

    it('a wave whose members all end before its floor has no holder', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap floor "Floor" start:2026-01-05 scale:1w calendar:full

wave w1 "Wave 1"
wave w2 "Wave 2" after:2026-03-02

swimlane a
  item a1 duration:1w wave:w1
swimlane b
  item b1 duration:1w
  item b2 duration:1w after:w2
`);
        // S_2 = W8 from the floor; w2 has no members, so E_2 = S_2.
        expectWaves(sched, FULL_WEEK, {
            w1: { span: [0, 1], members: 1, heldBy: 'a1' },
            w2: { span: [8, 8], members: 0, floorRef: '2026-03-02' },
        });
        expectItems(sched, FULL_WEEK, { b2: [8, 9] });
    });

    it('a first-wave floor delays every member of that wave', async () => {
        const { sched } = await buildWaveSchedule(`nowline v1

roadmap first "First floor" start:2026-01-05 scale:1w calendar:full

anchor go "Go" date:2026-01-19

wave w1 "Wave 1" after:go

swimlane a
  item a1 duration:1w wave:w1
  item a0 duration:1w
`);
        expectItems(sched, FULL_WEEK, { a1: [2, 3], a0: [3, 4] });
        expectWaves(sched, FULL_WEEK, {
            w1: { span: [2, 3], members: 1, heldBy: 'a1', floorRef: 'go' },
        });
    });
});

// ScheduledItem.days is engine C's own per-item duration in working days (the
// number of working days the bar spans), so every exporter reads the chart's
// duration instead of re-deriving it. Literals are derived by hand from the
// presets (business 5/22/65/260, full 7/30/91/365) and the custom block below
// (6/26/78/312).
describe('scheduleRoadmap — ScheduledItem.days', () => {
    const CUSTOM_BLOCK = `config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312
`;

    const HEADERS: Record<'business' | 'full' | 'custom', string> = {
        business: `nowline v1

roadmap r "R" start:2026-01-05
`,
        full: `nowline v1

roadmap r "R" start:2026-01-05 calendar:full
`,
        custom: `nowline v1

${CUSTOM_BLOCK}
roadmap r "R" start:2026-01-05 calendar:custom
`,
    };

    async function daysOf(
        calendar: 'business' | 'full' | 'custom',
        lane: string,
        id: string,
    ): Promise<number | undefined> {
        const sched = await buildSchedule(
            `${HEADERS[calendar]}
size xl effort:1m

swimlane s "S"
${lane}
`,
            PINNED,
        );
        return sched.items.get(id)?.days;
    }

    it.each([
        ['business', '1w', 5],
        ['full', '1w', 7],
        ['custom', '1w', 6],
        ['business', '1q', 65],
        ['full', '1q', 91],
        ['custom', '1q', 78],
        ['business', '1y', 260],
        ['full', '1y', 365],
        ['custom', '1y', 312],
        ['business', '1m', 22],
        ['full', '1m', 30],
        ['custom', '1m', 26],
        ['business', '1.5w', 7.5],
        ['business', '3d', 3],
    ] as const)('%s calendar: duration:%s is %s days', async (calendar, literal, expected) => {
        expect(await daysOf(calendar, `  item a "A" duration:${literal}`, 'a')).toBe(expected);
    });

    it.each([
        ['business', 11],
        ['full', 15],
        ['custom', 13],
    ] as const)(
        '%s calendar: size xl (effort 1m) with capacity:2 is %s days',
        async (calendar, expected) => {
            expect(await daysOf(calendar, '  item a "A" size:xl capacity:2', 'a')).toBe(expected);
        },
    );

    it('a declared size without capacity is its full effort in days', async () => {
        expect(await daysOf('business', '  item a "A" size:xl', 'a')).toBe(22);
    });

    it('capacity:3 divides the effort without rounding', async () => {
        expect(await daysOf('business', '  item a "A" size:xl capacity:3', 'a')).toBeCloseTo(
            22 / 3,
            10,
        );
    });

    it('an explicit duration wins over the size', async () => {
        expect(await daysOf('business', '  item a "A" size:xl duration:2w', 'a')).toBe(10);
    });

    it('an undeclared size is 0 days', async () => {
        expect(await daysOf('business', '  item a "A" size:ghost', 'a')).toBe(0);
    });

    it('an item with neither size nor duration is 0 days', async () => {
        expect(await daysOf('business', '  item a "A"', 'a')).toBe(0);
    });

    it('days is the length of the span the dates describe on a full calendar', async () => {
        const sched = await buildSchedule(
            `${HEADERS.full}
swimlane s "S"
  item a "A" duration:4w
`,
            PINNED,
        );
        const a = sched.items.get('a')!;
        expect(a.days).toBe(28);
        expect(a.start.toISOString().slice(0, 10)).toBe('2026-01-05');
        expect(a.end.toISOString().slice(0, 10)).toBe('2026-02-02');
    });
});
