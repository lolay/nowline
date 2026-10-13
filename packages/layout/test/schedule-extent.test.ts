// `RoadmapSchedule.extent.contentEndDay` (specs/scheduler-unification.md
// §3.2): the latest working-day offset from the roadmap start that any lane
// cursor, container start, dated anchor, milestone or wave barrier reaches,
// without `today`. One fixture per scope rule, with the day derived by hand.

import { buildWavePlan } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { scheduleRoadmap } from '../src/schedule.js';
import { generateRoadmap, mulberry32 } from './generated-roadmaps.js';
import { parseAndResolve, parseAndResolveFiles } from './helpers.js';

async function expectExtent(source: string, expected: number): Promise<void> {
    const { file, resolved } = await parseAndResolve(source);
    expect(scheduleRoadmap(file, resolved).extent.contentEndDay).toBe(expected);
}

describe('schedule extent: lower bounds on generated wave roadmaps', () => {
    it('reaches every item end and every wave end of the 60 barrier-theorem roadmaps', async () => {
        // Same seed and count as waves.test.ts, so the same roadmaps.
        const rand = mulberry32(0x5eed);
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            const { file, resolved } = await parseAndResolve(gen.source);
            const sched = scheduleRoadmap(file, resolved);
            const days = (d: Date): number =>
                sched.calendar.working.workingIndexOf(sched.startDate, d);
            const ends = [
                ...[...sched.items.values()].map((it) => days(it.end)),
                ...[...(sched.waves?.values() ?? [])].map((w) => days(w.end)),
            ];
            expect(sched.extent.contentEndDay, gen.source).toBeGreaterThanOrEqual(
                Math.max(0, ...ends),
            );
        }
    });
});

// One fixture per scope rule. Every roadmap starts Mon 2026-01-05 under the
// default business calendar: a week is 5 working days.
describe('schedule extent: scope rules', () => {
    it('is the latest lane cursor of the roadmap', async () => {
        // The 3w lane ends last: 15 working days.
        await expectExtent(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a
  item a1 duration:2w
swimlane b
  item b1 duration:1w
  item b2 duration:2w
`,
            15,
        );
    });

    it('counts a dated milestone and a dated anchor past the last item', async () => {
        // Feb 2 is 4 weeks in; Mar 2 is 8 weeks in; the item ends at 1 week.
        await expectExtent(
            `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

milestone beta "Beta" date:2026-02-02

anchor go "Go" date:2026-03-02

swimlane a
  item a1 duration:1w
`,
            40,
        );
    });

    it('ends at E_n with waves, not at the unbarriered lane ends', async () => {
        // Example 1 of specs/waves.md: E_launch is W9; without waves W7.
        await expectExtent(
            `nowline v1

roadmap launch-plan "Launch plan" start:2026-01-05 scale:1w

wave discover "Discover"
wave build "Build"
wave launch "Launch"

swimlane web "Web"
  item web-research duration:2w wave:discover
  item web-build duration:3w wave:build
  item web-launch duration:1w wave:launch
swimlane api "API"
  item api-spike duration:1w wave:discover
  item api-build duration:4w wave:build
  item api-launch duration:1w wave:launch
swimlane data "Data"
  item data-audit duration:3w wave:discover
  item data-build duration:2w wave:build
  item data-launch duration:2w wave:launch
`,
            45,
        );
    });

    it('leaves today out: only the date window adds it', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a
  item a1 duration:2w
`);
        const today = new Date(Date.UTC(2026, 5, 1));
        expect(scheduleRoadmap(file, resolved, { today }).extent.contentEndDay).toBe(10);
        expect(scheduleRoadmap(file, resolved).extent.contentEndDay).toBe(10);
    });

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
        expect(scheduleRoadmap(file, resolved).extent.contentEndDay).toBe(100);
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
        const schedule = scheduleRoadmap(file, resolved);
        // Jun 1 is 21 weeks after Jan 5.
        expect(schedule.extent.contentEndDay).toBe(105);
        expect(schedule.milestones.has('ga')).toBe(false);
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
