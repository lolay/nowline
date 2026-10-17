import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scheduleRoadmap } from '@nowline/layout';
import { describe, expect, it } from 'vitest';
import { exportMsProjXml } from '../src/index.js';
import { msProjectStarts, parseTasks, startMismatches } from './forward-pass.js';
import { buildExportInputs } from './helpers.js';

// Implicit lane sequencing as finish-to-start links (specs/rendering.md § MS
// Project XML Export): engine C starts each node where the one before it in
// its lane or group ended, so the export links each node to that one and MS
// Project's own forward pass lands every task on engine C's start.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** The `--now` the render gates use. */
const TODAY = new Date(Date.UTC(2026, 1, 9));

async function exportSource(source: string, sourcePath?: string) {
    const inputs = await buildExportInputs(source, { today: TODAY, sourcePath });
    const xml = exportMsProjXml(inputs, { onLossy: () => {} });
    const schedule = scheduleRoadmap(inputs.ast, inputs.resolved, { today: inputs.today });
    const tasks = parseTasks(xml);
    const task = (name: string) => {
        const found = tasks.find((t) => t.name === name);
        if (!found) throw new Error(`no task ${name}`);
        return found;
    };
    return { inputs, xml, schedule, tasks, task };
}

const LANES = `nowline v1

roadmap lanes "Lanes" start:2026-03-02

swimlane other "Other"
  item gate "Gate" duration:4w

swimlane build "Build"
  item a "A" duration:1w
  item b "B" duration:2w
  parallel p "P" after:gate
    item fast "Fast" duration:1w
    group slow "Slow"
      item s1 "S1" duration:1w
      item s2 "S2" duration:3w
    item mid "Mid" duration:2w
  item join "Join" duration:1w
  group g "G"
    item g1 "G1" duration:1w
    item g2 "G2" duration:1w
  item tail "Tail" duration:1w

swimlane third "Third"
  item lead "Lead" duration:1w
  group late "Late" after:b
    item l1 "L1" duration:1w
`;

describe('exportMsProjXml — lane sequencing', () => {
    it('links each item to the previous item in its lane, and the leader to nothing', async () => {
        const { task } = await exportSource(LANES);
        expect(task('A').preds).toEqual([]);
        expect(task('B').preds).toEqual([task('A').uid]);
        expect(task('Gate').preds).toEqual([]);
    });

    it("gives each track of a parallel the parallel's entry link and its after:", async () => {
        const { task } = await exportSource(LANES);
        const entry = [task('B').uid, task('Gate').uid].sort();
        expect([...task('Fast').preds].sort()).toEqual(entry);
        expect([...task('Slow').preds].sort()).toEqual(entry);
        expect([...task('Mid').preds].sort()).toEqual(entry);
    });

    it('chains inside a group track from its summary task', async () => {
        const { task } = await exportSource(LANES);
        expect(task('S1').preds).toEqual([]);
        expect(task('S2').preds).toEqual([task('S1').uid]);
    });

    it('links the item after a parallel to every track end', async () => {
        const { task } = await exportSource(LANES);
        expect(task('Join').preds).toEqual([task('Fast').uid, task('Slow').uid, task('Mid').uid]);
    });

    it("puts a group's entry link and its after: on the summary task", async () => {
        const { task } = await exportSource(LANES);
        expect(task('G').summary).toBe(true);
        expect(task('G').preds).toEqual([task('Join').uid]);
        expect(task('G1').preds).toEqual([]);
        expect(task('G2').preds).toEqual([task('G1').uid]);
        expect(task('Late').preds).toEqual([task('B').uid, task('Lead').uid]);
    });

    it("links the item after a group to the group's summary task", async () => {
        const { task } = await exportSource(LANES);
        expect(task('Tail').preds).toEqual([task('G').uid]);
    });

    it('writes a link once when after: names the previous item', async () => {
        const { task } = await exportSource(
            LANES.replace('"B" duration:2w', '"B" duration:2w after:a'),
        );
        expect(task('B').preds).toEqual([task('A').uid]);
    });

    it("lands every task on engine C's start", async () => {
        const { xml, inputs, schedule, task, tasks } = await exportSource(LANES);
        expect(startMismatches(xml, inputs.ast, schedule)).toEqual([]);
        // The parallel waits for Gate (2026-03-30), and the slow group track,
        // S1 then S2, sets its end 4 weeks later.
        const starts = msProjectStarts(tasks);
        const { working } = schedule.calendar;
        const date = (name: string) =>
            working.dateAtWorkingIndex(schedule.startDate, starts.get(task(name).uid)!);
        expect(date('Join').toISOString()).toBe('2026-04-27T00:00:00.000Z');
    });

    it('keeps task UIDs and IDs', async () => {
        const { xml } = await exportSource(LANES);
        const ids = [...xml.matchAll(/<UID>(\d+)<\/UID>\s*<ID>(\d+)<\/ID>/g)].map((m) => [
            Number(m[1]),
            Number(m[2]),
        ]);
        expect(ids).toEqual(ids.map((_, i) => [i + 1, i + 1]));
    });
});

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

/**
 * Samples whose starts the export cannot reach, each for a loss rendering.md
 * already documents. Each must still differ, so a fix shrinks the list.
 */
const KNOWN_LOSSES: Record<string, string> = {
    'examples/inline-date-pins.nowline': 'inline-date after: (no link, no constraint)',
    'tests/inline-date-corners.nowline': 'inline-date after: (no link, no constraint)',
    'tests/late-row-shifts.nowline': 'inline-date after: (no link, no constraint)',
    'tests/weekends-show.nowline': 'inline-date after: (no link, no constraint)',
    'examples/waves-program.nowline': 'inline-date wave floor (wave-floor)',
    'examples/waves-program/api.nowline': 'inline-date wave floor (wave-floor)',
    'examples/waves-program/web.nowline': 'inline-date wave floor (wave-floor)',
    'tests/waves-coarse.nowline': 'inline-date wave floor (wave-floor)',
    'tests/waves-gap-deadline.nowline': 'inline-date wave floor (wave-floor)',
    'tests/waves-isolate.nowline': 'isolated region wave members (root file only)',
};

describe("exportMsProjXml — every sample lands on engine C's starts", () => {
    for (const rel of sampleFiles()) {
        const loss = KNOWN_LOSSES[rel];
        it(loss ? `${rel} (differs: ${loss})` : rel, async () => {
            const file = path.join(REPO, rel);
            const { xml, inputs, schedule } = await exportSource(readFileSync(file, 'utf8'), file);
            const mismatches = startMismatches(xml, inputs.ast, schedule);
            if (loss) expect(mismatches).not.toEqual([]);
            else expect(mismatches).toEqual([]);
        });
    }

    it('lists only samples that exist', () => {
        const samples = new Set(sampleFiles());
        expect(Object.keys(KNOWN_LOSSES).filter((rel) => !samples.has(rel))).toEqual([]);
    });
});
