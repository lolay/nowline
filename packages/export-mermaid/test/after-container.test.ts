import { scheduleRoadmap } from '@nowline/layout';
import { describe, expect, it } from 'vitest';
import { exportMermaid } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

// `after:` a group or a parallel (specs/scheduler-unification.md, Known open
// gaps). Neither is a Mermaid task, and Mermaid starts a task whose `after`
// names an unknown id on the day the chart renders, so the exporter writes
// the tasks that end the container: a group's last child, every parallel
// track. Mermaid's `after a b` starts at the latest of them.

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
    parallel q "Q"
      item q1 "Q1" duration:1w
      item "Q Two" duration:2w

swimlane follow "Follow"
  item wait-p "Wait P" duration:1w after:p

swimlane later "Later"
  item wait-g "Wait G" duration:1w after:g

swimlane last "Last"
  item wait-both "Wait Both" duration:1w after:[g, mid]

milestone mp "MP" after:p
milestone mg "MG" after:g
`;

const STATUS_KEYWORDS = new Set(['done', 'active', 'crit', 'milestone']);

interface MermaidTask {
    id: string;
    start: string;
    days: number;
}

/** Every `id, start, duration` task line of the gantt block. */
function parseTasks(md: string): MermaidTask[] {
    const out: MermaidTask[] = [];
    for (const line of md.split('\n')) {
        const m = /^ {4}[^:]* :(.*)$/.exec(line);
        if (!m) continue;
        const fields = m[1].split(',').map((f) => f.trim());
        while (fields.length > 0 && STATUS_KEYWORDS.has(fields[0])) fields.shift();
        if (fields.length !== 3) continue;
        out.push({ id: fields[0], start: fields[1], days: Number.parseFloat(fields[2]) });
    }
    return out;
}

/** Every id named in an `after` start token. */
function afterIds(tasks: readonly MermaidTask[]): string[] {
    return tasks.flatMap((t) => (t.start.startsWith('after ') ? t.start.slice(6).split(' ') : []));
}

describe('exportMermaid — after: a group or a parallel', () => {
    it('references only declared task ids', async () => {
        const tasks = parseTasks(exportMermaid(await buildExportInputs(FIXTURE)));
        const declared = new Set(tasks.map((t) => t.id));
        expect(afterIds(tasks).filter((id) => !declared.has(id))).toEqual([]);
    });

    it("expands a parallel to every track's end and a group to its last child's", async () => {
        const tasks = parseTasks(exportMermaid(await buildExportInputs(FIXTURE)));
        const startOf = (id: string) => tasks.find((t) => t.id === id)!.start;
        expect(startOf('wait-p')).toBe('after fast s2 mid');
        expect(startOf('mp')).toBe('after fast s2 mid');
        // g's last child is the parallel q: its tracks, an unnamed one by slug.
        expect(startOf('wait-g')).toBe('after q1 q-two');
        expect(startOf('mg')).toBe('after q1 q-two');
        expect(startOf('wait-both')).toBe('after q1 q-two mid');
    });

    it("starts the dependents on engine C's day, the date the xlsx export writes", async () => {
        const inputs = await buildExportInputs(FIXTURE);
        const tasks = parseTasks(exportMermaid(inputs));
        const schedule = scheduleRoadmap(inputs.ast, inputs.resolved, { today: inputs.today });
        const { working } = schedule.calendar;
        // Mermaid's own reading, in working days (the chart excludes weekends):
        // a date starts on its day, `after a b` at the latest end it names.
        const byId = new Map(tasks.map((t) => [t.id, t]));
        const end = (t: MermaidTask): number => start(t) + t.days;
        const start = (t: MermaidTask): number =>
            t.start.startsWith('after ')
                ? Math.max(...afterIds([t]).map((id) => end(byId.get(id)!)))
                : working.workingIndexOf(schedule.startDate, new Date(`${t.start}T00:00:00Z`));
        const mermaidDate = (id: string) =>
            working.dateAtWorkingIndex(schedule.startDate, start(byId.get(id)!)).toISOString();
        for (const id of ['wait-p', 'wait-g', 'wait-both']) {
            expect(mermaidDate(id)).toBe(schedule.items.get(id)!.start.toISOString());
        }
        for (const id of ['mp', 'mg']) {
            expect(mermaidDate(id)).toBe(schedule.milestones.get(id)!.toISOString());
        }
        expect(mermaidDate('wait-p')).toBe('2026-03-30T00:00:00.000Z');
    });
});
