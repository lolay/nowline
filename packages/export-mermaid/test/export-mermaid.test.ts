import { describe, expect, it } from 'vitest';
import { exportMermaid } from '../src/index.js';
import { buildExportInputs, LOSSY_FIXTURE, SIMPLE_FIXTURE } from './helpers.js';

describe('exportMermaid — basic shape', () => {
    it('emits a Markdown heading + fenced gantt block', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const md = exportMermaid(inputs);
        expect(md.startsWith('# Simple Example')).toBe(true);
        expect(md).toContain('```mermaid');
        expect(md).toContain('gantt');
        expect(md).toContain('    title Simple Example');
        expect(md).toContain('    dateFormat YYYY-MM-DD');
        expect(md).toContain('```\n'); // fence closes
    });

    it('maps swimlanes to section blocks', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const md = exportMermaid(inputs);
        expect(md).toContain('section build');
    });

    it('maps items to tasks with status + id + duration', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const md = exportMermaid(inputs);
        expect(md).toMatch(/Design :done, design/);
        expect(md).toMatch(/Implement :active, implement/);
    });

    it('preserves after-dependencies', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const md = exportMermaid(inputs);
        expect(md).toContain('after design');
    });

    it('emits milestones with explicit dates', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const md = exportMermaid(inputs);
        expect(md).toContain('Done :milestone, done, 2026-03-15, 0d');
    });

    it('is deterministic for the same input', async () => {
        const a = exportMermaid(await buildExportInputs(SIMPLE_FIXTURE));
        const b = exportMermaid(await buildExportInputs(SIMPLE_FIXTURE));
        expect(a).toBe(b);
    });
});

describe('exportMermaid — lossy comment', () => {
    it('appends a stable %% comment listing dropped feature kinds', async () => {
        const inputs = await buildExportInputs(LOSSY_FIXTURE);
        const md = exportMermaid(inputs);
        expect(md).toContain('%% Mermaid lossy export — Nowline features dropped:');
        // Stable order — labels first, then footnote, then remaining, then owner, then before, etc.
        const summaryLine = md.split('\n').find((l) => l.startsWith('%%') && l.includes('('));
        expect(summaryLine).toBeDefined();
        expect(summaryLine!).toContain('labels (1)');
        expect(summaryLine!).toContain('footnote (1)');
        expect(summaryLine!).toContain('remaining (1)');
        expect(summaryLine!).toContain('owner (1)');
        expect(summaryLine!).toContain('before (1)');
        expect(summaryLine!).toContain('group (1)');
        expect(summaryLine!).toContain('parallel (1)');
        expect(summaryLine!).toContain('description (1)');
    });

    it('omits the comment when nothing was dropped', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const md = exportMermaid(inputs);
        // Simple fixture has labels:[release] on `ship`, so labels should appear.
        expect(md).toContain('labels (1)');
    });

    it('respects lossyComment: false', async () => {
        const inputs = await buildExportInputs(LOSSY_FIXTURE);
        const md = exportMermaid(inputs, { lossyComment: false });
        expect(md).not.toContain('%% Mermaid lossy export');
    });
});

describe('exportMermaid — escaping', () => {
    it('strips colons / commas from task names', async () => {
        const fixture = `nowline v1

roadmap r "R"

swimlane lane "Lane"
  item bad "Title: with, problematic chars" duration:1w
`;
        const inputs = await buildExportInputs(fixture);
        const md = exportMermaid(inputs);
        // Mermaid task syntax splits on `:` — the rendered task name must not
        // carry a literal colon before the first `:` separator.
        const taskLine = md.split('\n').find((l) => l.includes('Title'));
        expect(taskLine).toBeDefined();
        const headPart = taskLine!.split(':', 1)[0];
        expect(headPart).not.toContain(',');
    });
});
