import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import { layoutRoadmap } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const longPath = path.join(repoRoot, 'examples', 'long.nowline');

const BUDGET_MS = 100;
// The budget is checked against the fastest of several warm runs, not a
// typical one. Everything that perturbs a single run (another job on a shared
// CI runner, a GC pause, V8 still tiering the layout code up to optimized
// machine code) only adds time; nothing makes a run faster than the code
// allows. So the fastest sample is the best estimate of the code's own cost,
// and a median can sit at the budget on a busy macOS runner while the code is
// well inside it. A real regression is different: layout is deterministic, so
// added work slows every run, the fastest one included, and the test still
// fails. Fifteen samples give the runner room for a quiet moment and carry
// the later samples past V8's tier-up, which the first few are still in.
const SAMPLES = 15;

async function timeRuns(fn: () => unknown): Promise<{ fastestMs: number; samplesMs: string }> {
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const started = performance.now();
        await fn();
        samples.push(performance.now() - started);
    }
    return {
        fastestMs: Math.min(...samples),
        samplesMs: samples.map((ms) => ms.toFixed(1)).join(', '),
    };
}

describe('performance', () => {
    it(`lays out a dense roadmap under ${BUDGET_MS}ms`, async () => {
        const { shared, Nowline } = createNowlineServices();
        const text = await fs.readFile(longPath, 'utf-8');
        const uri = URI.parse('memory:///perf.nowline');
        const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
        await shared.workspace.DocumentBuilder.build([doc], { validation: false });
        const resolved = await resolveIncludes(doc.parseResult.value, longPath, {
            services: Nowline,
        });

        // Warm-up
        const model = layoutRoadmap(doc.parseResult.value, resolved, { theme: 'light' });
        await renderSvg(model);

        const layout = await timeRuns(() =>
            layoutRoadmap(doc.parseResult.value, resolved, { theme: 'light' }),
        );
        expect(layout.fastestMs, `layout samples (ms): ${layout.samplesMs}`).toBeLessThan(
            BUDGET_MS,
        );

        const render = await timeRuns(() => renderSvg(model));
        expect(render.fastestMs, `render samples (ms): ${render.samplesMs}`).toBeLessThan(
            BUDGET_MS,
        );
    });
});
