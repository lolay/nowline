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

describe('exportMermaid — task start anchoring (regression)', () => {
    // Mermaid strips a leading status keyword then reads the remaining comma
    // fields positionally. A task that emits `status, id, duration` (no start)
    // collapses to two fields, so Mermaid mis-reads the id as a start date and
    // throws `Invalid date: <id>` at render time. Every task that names an id
    // MUST therefore carry an explicit start token (a date or `after ...`).
    const STATUS_KEYWORDS = new Set(['done', 'active', 'crit', 'milestone']);
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    function taskLines(md: string): string[] {
        return md
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.includes(' :') && !l.startsWith('section') && !l.startsWith('title'));
    }

    function startField(line: string): string {
        const meta = line.slice(line.indexOf(':') + 1);
        const fields = meta.split(',').map((f) => f.trim());
        if (fields.length > 0 && STATUS_KEYWORDS.has(fields[0])) fields.shift();
        // Remaining is [id, start, duration] for our id-bearing tasks.
        return fields.length >= 3 ? fields[1] : (fields[1] ?? fields[0] ?? '');
    }

    const FIXTURE = `nowline v1

roadmap r "Anchoring" start:2026-04-06

swimlane platform "Platform"
  item "Technology Selection" duration:2w status:done
  item api "API" duration:3w status:done
  item "Agent Instructions" duration:3w status:in-progress

milestone "Release" after:[technology-selection, api]
`;

    it('anchors the lane leader at the roadmap start date', async () => {
        const md = exportMermaid(await buildExportInputs(FIXTURE));
        expect(md).toContain(':done, technology-selection, 2026-04-06, 2w');
    });

    it('chains followers without after: onto the previous lane item', async () => {
        const md = exportMermaid(await buildExportInputs(FIXTURE));
        expect(md).toContain(':done, api, after technology-selection, 3w');
        expect(md).toContain(':active, agent-instructions, after api, 3w');
    });

    it('emits milestone predecessors from after: (not depends:)', async () => {
        const md = exportMermaid(await buildExportInputs(FIXTURE));
        expect(md).toContain(':milestone, release, after technology-selection api, 0d');
    });

    it('never emits a task whose start field is mis-read as a date', async () => {
        const md = exportMermaid(await buildExportInputs(FIXTURE));
        for (const line of taskLines(md)) {
            const start = startField(line);
            const ok = start.startsWith('after ') || DATE_RE.test(start);
            expect(ok, `start token "${start}" in line: ${line}`).toBe(true);
        }
    });

    it('anchors lane leaders even when the roadmap omits start:', async () => {
        const noStart = `nowline v1

roadmap r "No Start"

swimlane build "Build"
  item alpha "Alpha" duration:1w status:done
  item beta "Beta" duration:1w status:done
`;
        const md = exportMermaid(await buildExportInputs(noStart));
        const alpha = md.split('\n').find((l) => l.includes('Alpha'))!;
        // Leader falls back to the layout-computed timeline start (a real date).
        expect(alpha).toMatch(/:done, alpha, \d{4}-\d{2}-\d{2}, 1w/);
        expect(md).toContain(':done, beta, after alpha, 1w');
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
