// What makes finalize step f2 (`extendTimeline`) grow the axis
// (specs/layout-phases.md §9, F3). The date window is engine C's extent and
// every bar is drawn on its dates, so no placed bar ends past the window: f2
// grows the axis for a spilled caption's one column and for the right half
// of a diamond on the window's last day, nothing else. The trace names the
// cause of each firing; a bar among them means the window and the placement
// disagree.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWavePlan } from '@nowline/core';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { sequenceOne } from '../src/nodes/sequence-one.js';
import { resolveDateWindow, resolveScope } from '../src/phases/date-window.js';
import {
    FINALIZE_STEPS,
    FinalizeContext,
    type FinalizeStep,
    finalizeRoadmap,
    setFinalizeTrace,
} from '../src/phases/finalize.js';
import { measureRoadmap } from '../src/phases/measure.js';
import { placeChart } from '../src/phases/place.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { generateRoadmap, mulberry32 } from './generated-roadmaps.js';
import { parseAndResolve, parseAndResolveFiles } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/** The `--now` the G1 gate renders every sample with. */
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

/**
 * The causes f2 names when it grows the axis of `source`; `undefined` when
 * it leaves the axis alone.
 */
function causesOf(run: () => void): readonly string[] | undefined {
    let causes: readonly string[] | undefined;
    setFinalizeTrace((step, changed, why) => {
        if (step === 'extendTimeline' && changed) causes = why ?? [];
    });
    try {
        run();
    } finally {
        setFinalizeTrace(undefined);
    }
    return causes;
}

async function causesOfSource(source: string): Promise<readonly string[] | undefined> {
    const { file, resolved } = await parseAndResolve(source);
    return causesOf(() => layoutRoadmap(file, resolved, { today: TODAY }));
}

async function causesOfFiles(
    files: Record<string, string>,
): Promise<readonly string[] | undefined> {
    const { file, resolved } = await parseAndResolveFiles(files);
    return causesOf(() => layoutRoadmap(file, resolved, { today: TODAY }));
}

afterEach((): void => {
    setFinalizeTrace(undefined);
});

describe('timeline extension causes on the corpus (F3)', () => {
    it('names a cause for every firing, and none is a bar', async (): Promise<void> => {
        const fired: Record<string, readonly string[]> = {};
        for (const rel of sampleFiles()) {
            const abs = path.join(REPO, rel);
            const source = await readFile(abs, 'utf8');
            const { file, resolved } = await parseAndResolve(source, abs, (p) =>
                readFile(p, 'utf8'),
            );
            const causes = causesOf(() => layoutRoadmap(file, resolved, { today: TODAY }));
            if (causes) fired[rel] = causes;
        }
        expect(Object.keys(fired).length).toBeGreaterThan(0);
        for (const [rel, causes] of Object.entries(fired)) {
            expect(causes.length, rel).toBeGreaterThan(0);
            expect(causes, rel).not.toContain('bar');
        }
    }, 120_000);

    it('never names a bar on the 60 generated wave roadmaps', async (): Promise<void> => {
        // Same seed and count as waves.test.ts, so the same roadmaps.
        const rand = mulberry32(0x5eed);
        for (let i = 0; i < 60; i++) {
            const gen = generateRoadmap(rand, i);
            expect((await causesOfSource(gen.source)) ?? [], gen.source).not.toContain('bar');
        }
    });
});

describe('timeline extension causes, one per fixture (F3)', () => {
    // Every roadmap starts Mon 2026-01-05 at `scale:1w`; a 6w item ends on
    // Mon 2026-02-16, the W7 boundary, which is where the natural window
    // ends (today, Mon 2026-02-09, falls inside it).

    it('leaves the axis alone when everything ends inside the window', async () => {
        expect(
            await causesOfSource(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item a1 "A1" duration:6w
  item a2 "A2" duration:2w
`),
        ).toBeUndefined();
    });

    it('names a caption that spills past the window end', async () => {
        expect(
            await causesOfSource(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item a1 "A caption far too long for one week" duration:1w after:a0
  item a0 "Lead" duration:5w
`),
        ).toEqual(['caption']);
    });

    it('names a dated anchor on the last day', async () => {
        expect(
            await causesOfSource(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor cutoff "Cutoff" date:2026-02-16

swimlane a "A"
  item a1 "A1" duration:6w
`),
        ).toEqual(['datedMarker']);
    });

    it('names an after-only milestone on the window end', async () => {
        expect(
            await causesOfSource(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

milestone ship "Ship" after:a1

swimlane a "A"
  item a1 "A1" duration:6w
`),
        ).toEqual(['afterMilestone']);
    });

    it('names a bar the placement draws past the window', async () => {
        // No sample can produce this: it is the bug F3 looks for, so a step
        // moved in front of f2 pushes the bar two weeks past the window.
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item a1 "A1" duration:6w
`);
        const options = { today: TODAY };
        const schedule = scheduleRoadmap(file, resolved, {
            today: TODAY,
            plan: buildWavePlan(resolved) ?? null,
        });
        const scope = resolveScope(file, resolved, options);
        const window = resolveDateWindow(file, resolved, options, scope, schedule);
        const measured = measureRoadmap(file, resolved, options, scope, window);
        const chart = placeChart(resolved, scope, window, measured, { sequenceOne });
        const fx = new FinalizeContext(file, resolved, options, scope, window, measured, chart);
        const pushBar: FinalizeStep = {
            name: 'pushBar',
            reads: [],
            writes: [],
            run: (ctx) => {
                const bar = ctx.chart.swimlanes[0].children[0];
                bar.box.x += 2 * 5 * ctx.measured.axis.ppd;
                return true;
            },
        };
        const steps = [FINALIZE_STEPS[0], pushBar, ...FINALIZE_STEPS.slice(1)];
        expect(causesOf(() => finalizeRoadmap(fx, steps))).toEqual(['bar']);
    });
});

describe('timeline extension for the markers of an isolated region', () => {
    // The host and its region share one axis, and the window reaches the
    // region's marker days (engine C counts them), so a region diamond on
    // the last day grows the axis exactly as a host one does.
    const host = `nowline v1

include "./region.nowline" roadmap:isolate

roadmap main "Main" start:2026-01-05 scale:1w

swimlane a "A"
  item a1 "A1" duration:2w
`;

    it('names a region anchor on the last day', async () => {
        expect(
            await causesOfFiles({
                'main.nowline': host,
                'region.nowline': `nowline v1

roadmap region "Region" start:2026-01-05

anchor cutoff "Cutoff" date:2026-02-16

swimlane r "R"
  item r1 "R1" duration:6w
`,
            }),
        ).toEqual(['datedMarker']);
    });

    it('names a region after-only milestone on the window end', async () => {
        expect(
            await causesOfFiles({
                'main.nowline': host,
                'region.nowline': `nowline v1

roadmap region "Region" start:2026-01-05

milestone ship "Ship" after:r1

swimlane r "R"
  item r1 "R1" duration:6w
`,
            }),
        ).toEqual(['afterMilestone']);
    });

    it('keeps a nested region anchor inside the axis', async () => {
        // The F3 repro: the anchor is the region's, two includes down, and
        // falls on the window's last day (Mon 2026-05-04).
        const { file, resolved } = await parseAndResolveFiles({
            'main.nowline': `nowline v1

include "./region2.nowline" roadmap:isolate

roadmap main "Main" start:2026-01-05 scale:1w

swimlane a "A"
  item x "X" duration:1w
`,
            'region2.nowline': `nowline v1

include "./region.nowline" roadmap:isolate

roadmap region2 "Region 2" start:2026-01-05

anchor late date:2026-05-04

swimlane r2 "R2"
  item r2a "R2" duration:2w
milestone rm "RM" after:r2a
`,
            'region.nowline': `nowline v1

roadmap region "Region" start:2026-01-05

size big effort:6w

swimlane r "R"
  item ra "Region long" size:big
  item rb "Region tail" duration:3w
`,
        });
        let model: ReturnType<typeof layoutRoadmap> | undefined;
        const causes = causesOf(() => {
            model = layoutRoadmap(file, resolved, { today: TODAY });
        });
        expect(causes).toEqual(['datedMarker']);
        const { timeline, includes } = model!;
        const late = includes.flatMap((inc) => inc.anchors ?? []).find((a) => a.id === 'late');
        expect(late).toBeDefined();
        expect(late!.center.x + late!.radius).toBeLessThanOrEqual(
            timeline.box.x + timeline.box.width,
        );
    });
});
