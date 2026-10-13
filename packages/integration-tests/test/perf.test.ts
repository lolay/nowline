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
// Shared CI runners (Windows especially) occasionally stall a single call past
// the budget; the median of several warm runs ignores one slow sample while a
// real regression still moves every sample and fails.
const SAMPLES = 5;

async function medianMs(fn: () => unknown): Promise<number> {
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const started = performance.now();
        await fn();
        samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(SAMPLES / 2)];
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

        const layoutMs = await medianMs(() =>
            layoutRoadmap(doc.parseResult.value, resolved, { theme: 'light' }),
        );
        expect(layoutMs).toBeLessThan(BUDGET_MS);

        const renderMs = await medianMs(() => renderSvg(model));
        expect(renderMs).toBeLessThan(BUDGET_MS);
    });
});
