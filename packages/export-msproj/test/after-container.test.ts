import { scheduleRoadmap } from '@nowline/layout';
import { describe, expect, it } from 'vitest';
import { exportMsProjXml } from '../src/index.js';
import { msProjectStarts, parseTasks, startMismatches } from './forward-pass.js';
import { buildExportInputs } from './helpers.js';

// `after:` a parallel or a group (specs/scheduler-unification.md, Known open
// gaps). A group is a summary task, which MS Project finishes with its last
// child; a parallel has no task, so `after:<parallel>` links to every track's
// task. Each track's own order comes from the export's lane sequencing links.

const FIXTURE = `nowline v1

roadmap containers "Containers" start:2026-03-02

swimlane build "Build"
  parallel p "P"
    item fast "Fast" duration:1w
    group slow "Slow"
      item s1 "S1" duration:1w
      item s2 "S2" duration:3w
    item mid "Mid" duration:2w

swimlane polish "Polish"
  group g "G"
    item g1 "G1" duration:1w
    item g2 "G2" duration:1w

swimlane follow "Follow"
  item wait-p "Wait P" duration:1w after:p

swimlane later "Later"
  item wait-g "Wait G" duration:1w after:g

milestone mp "MP" after:p
`;

async function exportFixture(source: string) {
    const inputs = await buildExportInputs(source);
    const xml = exportMsProjXml(inputs, { onLossy: () => {} });
    const schedule = scheduleRoadmap(inputs.ast, inputs.resolved, { today: inputs.today });
    return { inputs, xml, schedule, tasks: parseTasks(xml) };
}

describe('exportMsProjXml — after: a parallel or a group', () => {
    it('links after:<parallel> to every track end, a group track by its summary task', async () => {
        const { tasks } = await exportFixture(FIXTURE);
        const uidOf = (name: string) => tasks.find((t) => t.name === name)!.uid;
        const tracks = [uidOf('Fast'), uidOf('Slow'), uidOf('Mid')];
        expect(tasks.find((t) => t.name === 'Wait P')!.preds).toEqual(tracks);
        expect(tasks.find((t) => t.name === 'MP')!.preds).toEqual(tracks);
    });

    it('links after:<group> to its summary task', async () => {
        const { tasks } = await exportFixture(FIXTURE);
        const g = tasks.find((t) => t.name === 'G')!;
        expect(g.summary).toBe(true);
        expect(tasks.find((t) => t.name === 'Wait G')!.preds).toEqual([g.uid]);
    });

    it("lands every task on engine C's start, the date the xlsx export writes", async () => {
        const { inputs, xml, tasks, schedule } = await exportFixture(FIXTURE);
        expect(startMismatches(xml, inputs.ast, schedule)).toEqual([]);
        const starts = msProjectStarts(tasks);
        const { working } = schedule.calendar;
        const msDate = (name: string) =>
            working
                .dateAtWorkingIndex(
                    schedule.startDate,
                    starts.get(tasks.find((t) => t.name === name)!.uid)!,
                )
                .toISOString();
        expect(msDate('Wait P')).toBe(schedule.items.get('wait-p')!.start.toISOString());
        expect(msDate('Wait G')).toBe(schedule.items.get('wait-g')!.start.toISOString());
        expect(msDate('MP')).toBe(schedule.milestones.get('mp')!.toISOString());
        // The slow group track sets the parallel's end: S1 then S2, 4 weeks.
        expect(msDate('Wait P')).toBe('2026-03-30T00:00:00.000Z');
    });

    it('writes each link once when after: names a parallel and one of its tracks', async () => {
        const { tasks } = await exportFixture(
            FIXTURE.replace('after:p\n\nswimlane later', 'after:[mid, p]\n\nswimlane later'),
        );
        const preds = tasks.find((t) => t.name === 'Wait P')!.preds;
        expect(new Set(preds).size).toBe(preds.length);
        expect(preds).toHaveLength(3);
    });

    it('writes the group track of a parallel nested in a group', async () => {
        const { tasks } = await exportFixture(`nowline v1

roadmap nested "Nested" start:2026-03-02

swimlane build "Build"
  group outer "Outer"
    parallel p "P"
      item a "A" duration:1w
      group inner "Inner"
        item b "B" duration:2w

swimlane follow "Follow"
  item wait "Wait" duration:1w after:p
`);
        const inner = tasks.find((t) => t.name === 'Inner');
        expect(inner?.summary).toBe(true);
        expect(tasks.find((t) => t.name === 'B')?.outlineLevel).toBe(inner!.outlineLevel + 1);
        const uidOf = (name: string) => tasks.find((t) => t.name === name)!.uid;
        expect(tasks.find((t) => t.name === 'Wait')!.preds).toEqual([uidOf('A'), uidOf('Inner')]);
    });
});
