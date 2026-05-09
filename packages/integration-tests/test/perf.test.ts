import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import { layoutRoadmap } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const longPath = path.join(repoRoot, 'examples', 'long.nowline');

describe('performance', () => {
    it('lays out a dense roadmap under 100ms', async () => {
        const { shared, Nowline } = createNowlineServices();
        const text = await fs.readFile(longPath, 'utf-8');
        const uri = URI.parse('memory:///perf.nowline');
        const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
        await shared.workspace.DocumentBuilder.build([doc], { validation: false });
        const resolved = await resolveIncludes(doc.parseResult.value, longPath, {
            services: Nowline,
        });

        // Warm-up
        layoutRoadmap(doc.parseResult.value, resolved, { theme: 'light' });
        const started = performance.now();
        const model = layoutRoadmap(doc.parseResult.value, resolved, { theme: 'light' });
        const layoutMs = performance.now() - started;
        expect(layoutMs).toBeLessThan(100);

        const svgStart = performance.now();
        await renderSvg(model);
        const renderMs = performance.now() - svgStart;
        expect(renderMs).toBeLessThan(100);
    });
});
