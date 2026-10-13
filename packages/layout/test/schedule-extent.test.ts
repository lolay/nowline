// `RoadmapSchedule.extent.contentEndDay` against the frozen engine B
// (specs/scheduler-unification.md §3.2, §4 m1.s2, §6 "Oracle"): the schedule
// must reach exactly the content day `computeContentEndDay` reached, without
// `today`, on every sample, the generated wave roadmaps of the barrier
// theorem, and one fixture per scope rule B had. m3.s2 retires the oracle
// and keeps the fixtures as direct `extent` expectations.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWavePlan, type NowlineFile, type ResolveResult } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { resolveSizes } from '../src/calendar.js';
import { resolveWorkingCalendar } from '../src/calendar-resolver.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { computeContentEndDay } from './content-end-day-oracle.js';
import { generateRoadmap, mulberry32 } from './generated-roadmaps.js';
import { parseAndResolve, parseAndResolveFiles } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The `--now` the G1 gate renders with; it only sets an undated start. */
const TODAY = new Date(Date.UTC(2026, 1, 9));

/** Every `examples/**.nowline` and `tests/*.nowline`, repo-relative, sorted. */
function sampleFiles(): string[] {
    const out: string[] = [];
    const walk = (rel: string, recurse: boolean): void => {
        for (const entry of readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
            const child = `${rel}/${entry.name}`;
            if (entry.isDirectory() && recurse) walk(child, true);
            else if (entry.isFile() && entry.name.endsWith('.nowline')) out.push(child);
        }
    };
    walk('examples', true);
    walk('tests', false);
    return out.sort();
}

/** The schedule's extent and the frozen engine B's day, for the same start. */
function bothEngines(
    file: NowlineFile,
    resolved: ResolveResult,
): { extent: number; oracle: number } {
    const schedule = scheduleRoadmap(file, resolved, { today: TODAY });
    const { config: cal, working: calendar } = resolveWorkingCalendar(file, resolved);
    const oracle = computeContentEndDay(
        resolved,
        { cal, sizes: resolveSizes(resolved.content.sizes, cal), calendar },
        schedule.startDate,
        undefined,
        buildWavePlan(resolved),
    );
    return { extent: schedule.extent.contentEndDay, oracle };
}

async function expectExtent(source: string, expected: number): Promise<void> {
    const { file, resolved } = await parseAndResolve(source);
    const { extent, oracle } = bothEngines(file, resolved);
    expect(extent).toBe(oracle);
    expect(extent).toBe(expected);
}

describe('schedule extent equals engine B on the samples', () => {
    const samples = sampleFiles();

    it('finds the samples', () => {
        expect(samples.length).toBeGreaterThan(50);
    });

    it.each(samples)('%s', async (sample) => {
        const abs = path.join(REPO, sample);
        const source = await readFile(abs, 'utf8');
        const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
        const { extent, oracle } = bothEngines(file, resolved);
        expect(extent).toBe(oracle);
    });
});

describe('schedule extent equals engine B on generated wave roadmaps', () => {
    it('the 60 roadmaps of the barrier theorem', async () => {
        // Same seed and count as waves.test.ts, so the same roadmaps.
        const rand = mulberry32(0x5eed);
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            const { extent, oracle } = bothEngines(file, resolved);
            expect(extent, gen.source).toBe(oracle);
        }
    });
});

// One fixture per scope rule. Every roadmap starts Mon 2026-01-05 under the
// default business calendar: a week is 5 working days.
describe('schedule extent: scope rules', () => {
    it('an empty group with after: reaches its start', async () => {
        // Nothing ends on Apr 6, but the lane cursor does: 13 weeks.
        await expectExtent(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a
  item a1 duration:1w
  group g "Later" after:2026-04-06
    description "Nothing scheduled yet"
`,
            65,
        );
    });

    it('a nested isolated region extends the extent', async () => {
        const { file, resolved } = await parseAndResolveFiles({
            'main.nowline': `nowline v1

include "./mid.nowline" roadmap:isolate

roadmap main "Main" start:2026-01-05 scale:1w

swimlane a
  item a1 duration:1w
`,
            'mid.nowline': `nowline v1

include "./deep.nowline" roadmap:isolate

roadmap mid "Mid" start:2026-01-05 scale:1w

swimlane m
  item m1 duration:2w
`,
            'deep.nowline': `nowline v1

roadmap deep "Deep" start:2026-01-05 scale:1w

swimlane d
  item d1 duration:20w
`,
        });
        expect(resolved.diagnostics).toEqual([]);
        const { extent, oracle } = bothEngines(file, resolved);
        expect(extent).toBe(oracle);
        expect(extent).toBe(100);
    });

    it("a region milestone extends the extent but stays out of the schedule's milestones", async () => {
        const { file, resolved } = await parseAndResolveFiles({
            'main.nowline': `nowline v1

include "./team.nowline" roadmap:isolate

roadmap main "Main" start:2026-01-05 scale:1w

swimlane a
  item a1 duration:1w
`,
            'team.nowline': `nowline v1

roadmap squad "Squad" start:2026-01-05 scale:1w

swimlane t
  item t1 duration:2w

milestone ga "GA" date:2026-06-01
`,
        });
        expect(resolved.diagnostics).toEqual([]);
        const { extent, oracle } = bothEngines(file, resolved);
        expect(extent).toBe(oracle);
        // Jun 1 is 21 weeks after Jan 5.
        expect(extent).toBe(105);
        expect(scheduleRoadmap(file, resolved).milestones.has('ga')).toBe(false);
    });

    it('an undated anchor does not extend the extent and resolves after: to day 0', async () => {
        // The anchor lacks its required date: (a validation error), but the
        // engines still schedule the file: a2 follows a1 as if unanchored.
        await expectExtent(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor gate "Gate"

swimlane a
  item a1 duration:2w
  item a2 duration:1w after:gate
`,
            15,
        );
    });

    it('an empty trailing wave held by a floor keeps its start in the extent', async () => {
        // S_3 = E_3 = Mar 2 (8 weeks); the content ends at 3 weeks.
        await expectExtent(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "Wave 1"
wave w2 "Wave 2"
wave w3 "Later" after:2026-03-02

swimlane a
  item a1 duration:2w wave:w1
  item a2 duration:1w wave:w2
`,
            40,
        );
    });
});

describe('scheduleRoadmap scope', () => {
    it('schedules first-level region items without waves into byNode, not items', async () => {
        const { file, resolved } = await parseAndResolveFiles({
            'main.nowline': `nowline v1

include "./team.nowline" roadmap:isolate

roadmap main "Main" start:2026-01-05 scale:1w

swimlane a
  item a1 duration:1w
`,
            'team.nowline': `nowline v1

include "./deep.nowline" roadmap:isolate

roadmap squad "Squad" start:2026-01-05 scale:1w

swimlane t
  item a1 duration:2w
  item t2 duration:1w after:a1
`,
            'deep.nowline': `nowline v1

roadmap deep "Deep" start:2026-01-05 scale:1w

swimlane d
  item d1 duration:4w
`,
        });
        expect(resolved.diagnostics).toEqual([]);
        const schedule = scheduleRoadmap(file, resolved);
        const region = resolved.content.isolatedRegions[0].content;
        const [ra1, rt2] = [...region.swimlanes.values()][0].content;
        const days = (d: Date): number =>
            schedule.calendar.working.workingIndexOf(schedule.startDate, d);
        // The region resolves a1 against its own a1 (2w), not the root's (1w).
        const t2 = schedule.byNode.get(rt2 as never);
        expect(t2 && [days(t2.start), days(t2.end)]).toEqual([10, 15]);
        expect(schedule.byNode.get(ra1 as never)?.days).toBe(10);
        // The root's a1 keeps its id; region ids stay out of `items`.
        expect(schedule.items.get('a1')?.days).toBe(5);
        expect(schedule.items.has('t2')).toBe(false);
        // A nested region counts in the extent only.
        const deep = region.isolatedRegions[0].content;
        const [d1] = [...deep.swimlanes.values()][0].content;
        expect(schedule.byNode.get(d1 as never)).toBeUndefined();
        expect(schedule.extent.contentEndDay).toBe(20);
    });

    it('records the resolve result and the wave plan it ran with', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

wave w1 "Wave 1"

swimlane a
  item a1 duration:1w wave:w1
`);
        const built = scheduleRoadmap(file, resolved);
        expect(built.resolved).toBe(resolved);
        expect(built.plan?.waves.map((w) => w.name)).toEqual(['w1']);
        // A caller's plan is used as given; `null` means "no waves".
        const plan = buildWavePlan(resolved);
        expect(scheduleRoadmap(file, resolved, { plan }).plan).toBe(plan);
        const none = scheduleRoadmap(file, resolved, { plan: null });
        expect(none.plan).toBeUndefined();
        expect(none.waves).toBeUndefined();
    });
});
