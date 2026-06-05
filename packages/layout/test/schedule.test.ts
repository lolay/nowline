// Unit tests for scheduleRoadmap — verifies that floating start/end dates
// match the rendered chart's sequencing rules.

import {
    createNowlineServices,
    type NowlineFile,
    type NowlineServices,
    type ResolveResult,
    resolveIncludes,
} from '@nowline/core';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { scheduleRoadmap } from '../src/schedule.js';

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
        // b starts where a ended
        expect(b!.start.toISOString().slice(0, 10)).toBe(a!.end.toISOString().slice(0, 10));
        // 2w = 10 days → end is 10 days after start
        const expectedEnd = new Date(b!.start.getTime() + 10 * 86400000);
        expect(b!.end.toISOString().slice(0, 10)).toBe(expectedEnd.toISOString().slice(0, 10));
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
        expect(b!.start.toISOString().slice(0, 10)).toBe('2026-02-01');
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
        // milestone floats to a's end
        expect(m!.toISOString().slice(0, 10)).toBe(a!.end.toISOString().slice(0, 10));
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
