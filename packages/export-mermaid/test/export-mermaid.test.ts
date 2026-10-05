import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scheduleRoadmap } from '@nowline/layout';
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

    it('collapses an explicit line break in a task name to a space (line-oriented format)', async () => {
        const fixture = `nowline v1

roadmap r "R"

swimlane lane "Lane"
  item tech "Technology\\nSelection" duration:2w
`;
        const inputs = await buildExportInputs(fixture);
        const md = exportMermaid(inputs);
        const taskLine = md.split('\n').find((l) => l.includes('Technology'));
        expect(taskLine).toBeDefined();
        expect(taskLine).toContain('Technology Selection');
        // A raw newline would split the gantt task over two lines.
        expect(md).not.toMatch(/^\s*Selection/m);
    });
});

describe('exportMermaid — waves', () => {
    const SAMPLE = readFileSync(
        fileURLToPath(new URL('../../../examples/waves.nowline', import.meta.url)),
        'utf8',
    );

    // specs/waves.md Example 11: a start floor on `execute`.
    const FLOOR_FIXTURE = `nowline v1

roadmap budget-floor "Budget-held rollout" start:2026-01-05 scale:1w calendar:full

anchor fy-budget "FY budget release" date:2026-02-02

wave plan "Plan"
wave execute "Execute" after:fy-budget

swimlane a
  item a1 duration:2w wave:plan
  item a2 duration:5w wave:execute
swimlane b
  item b1 duration:3w wave:plan
  item b2 duration:7w wave:execute

milestone exec-done "Execute complete" date:2026-03-16 after:execute
`;

    function lineFor(md: string, id: string): string {
        const line = md.split('\n').find((l) => new RegExp(`:[^,]*,? ?${id},`).test(l));
        expect(line, `task ${id}`).toBeDefined();
        return line!;
    }

    it('emits section Waves after the anchors and before the lanes, dated E_k', async () => {
        const inputs = await buildExportInputs(SAMPLE);
        const md = exportMermaid(inputs);
        const lines = md.split('\n');
        const waves = lines.indexOf('    section Waves');
        expect(waves).toBeGreaterThan(0);
        expect(lines.slice(waves + 1, waves + 4)).toEqual([
            '    Foundations (wave end) :milestone, foundations, 2026-02-16, 0d',
            '    Build (wave end) :milestone, build, 2026-04-13, 0d',
            '    Launch (wave end) :milestone, launch, 2026-05-11, 0d',
        ]);
        expect(lines[waves + 4]).toBe('    section platform');
        // The dates are engine C's exclusive wave ends.
        const schedule = scheduleRoadmap(inputs.ast, inputs.resolved, {});
        for (const [id, w] of schedule.waves!) {
            expect(md).toContain(`, ${id}, ${w.end.toISOString().slice(0, 10)}, 0d`);
        }
    });

    it('places section Waves after section Anchors', async () => {
        const inputs = await buildExportInputs(FLOOR_FIXTURE);
        const lines = exportMermaid(inputs).split('\n');
        const anchors = lines.indexOf('    section Anchors');
        const waves = lines.indexOf('    section Waves');
        expect(anchors).toBeGreaterThan(0);
        expect(waves).toBe(anchors + 2);
        expect(lines[waves + 3]).toBe('    section a');
    });

    it('makes members of wave k >= 2 wait for wave k-1, and leaves others alone', async () => {
        const md = exportMermaid(await buildExportInputs(SAMPLE));
        expect(lineFor(md, 'auth')).toContain(', auth, 2026-01-05, 4w');
        expect(lineFor(md, 'payments-api')).toContain('after auth foundations');
        expect(lineFor(md, 'rate-limits')).toContain('after payments-api build');
        // Inherited from the group's wave:build.
        expect(lineFor(md, 'checkout-v2')).toContain('after ux-research foundations');
        expect(lineFor(md, 'a11y')).toContain('after checkout-v2 foundations');
        expect(lineFor(md, 'launch-page')).toContain('after a11y build');
        // Background work gets no barrier.
        expect(lineFor(md, 'on-call')).toContain(':on-call, 2026-01-05, 18w');
        // after:<wave> maps onto the wave-end milestone id.
        expect(md).toContain('Beta :milestone, beta, after build, 0d');
        expect(md).toContain('GA :milestone, ga, after launch, 0d');
    });

    it('replaces a lane leader start date with the barrier', async () => {
        const md = exportMermaid(await buildExportInputs(FLOOR_FIXTURE));
        expect(lineFor(md, 'a2')).toContain('after a1 plan');
        const leader = exportMermaid(
            await buildExportInputs(`nowline v1
roadmap r "R" start:2026-01-05
wave one "One"
wave two "Two"
swimlane x
  item x1 duration:1w wave:one
swimlane y
  item y1 duration:1w wave:two
`),
        );
        expect(lineFor(leader, 'y1')).toContain(':y1, after one, 1w');
    });

    it('only references ids defined earlier in the output', async () => {
        for (const src of [SAMPLE, FLOOR_FIXTURE]) {
            const md = exportMermaid(await buildExportInputs(src));
            const defined = new Set<string>();
            for (const line of md.split('\n')) {
                const colon = line.indexOf(' :');
                if (!line.startsWith('    ') || colon < 0) continue;
                const fields = line
                    .slice(colon + 2)
                    .split(',')
                    .map((f) => f.trim());
                const startField = fields.find((f) => f.startsWith('after '));
                if (startField) {
                    for (const ref of startField.slice('after '.length).split(/\s+/)) {
                        expect(defined.has(ref), `${ref} in "${line.trim()}"`).toBe(true);
                    }
                }
                const id = fields.length >= 3 ? fields[fields.length - 3] : undefined;
                if (id) defined.add(id);
            }
            expect(defined.size).toBeGreaterThan(0);
        }
    });

    it('drops and counts wave start floors', async () => {
        const md = exportMermaid(await buildExportInputs(FLOOR_FIXTURE));
        expect(md).toContain('    Execute (wave end) :milestone, execute, 2026-03-23, 0d');
        expect(md).toContain('    Plan (wave end) :milestone, plan, 2026-01-26, 0d');
        const summary = md.split('\n').find((l) => l.startsWith('%%') && l.includes('('));
        expect(summary).toContain('wave-floor (1)');
        // The floor itself leaves no trace in the gantt block.
        expect(lineFor(md, 'a2')).not.toContain('fy-budget');
    });

    // `parallel wave:build` with two tracks, one a group holding two items.
    const PARALLEL_FIXTURE = `nowline v1

roadmap par "Parallel waves" start:2026-01-05

wave plan "Plan"
wave build "Build"

swimlane eng "Eng"
  item spec duration:1w wave:plan
  parallel tracks wave:build
    item api duration:2w
    group ui-track "UI track"
      item ui duration:1w
      item polish duration:1w
  item ship duration:1w

swimlane web "Web"
  parallel web-tracks wave:build
    item web-a duration:1w
    item web-b duration:1w
`;

    it('gives every track of a parallel wave:build the previous-wave token', async () => {
        const md = exportMermaid(await buildExportInputs(PARALLEL_FIXTURE));
        expect(lineFor(md, 'spec')).toContain(':spec, 2026-01-05, 1w');
        // Both tracks anchor at the block entry, plus the barrier.
        expect(lineFor(md, 'api')).toContain(':api, after spec plan, 2w');
        expect(lineFor(md, 'ui')).toContain(':ui, after spec plan, 1w');
        // An item inside a track inherits the wave too.
        expect(lineFor(md, 'polish')).toContain(':polish, after ui plan, 1w');
        // Leaders of a lane-opening parallel replace the start date.
        expect(lineFor(md, 'web-a')).toContain(':web-a, after plan, 1w');
        expect(lineFor(md, 'web-b')).toContain(':web-b, after plan, 1w');
        // Background work after the block gets no barrier.
        expect(lineFor(md, 'ship')).toContain(':ship, after polish, 1w');
    });

    it('emits no wave output and no wave-floor kind without waves', async () => {
        const md = exportMermaid(await buildExportInputs(LOSSY_FIXTURE));
        expect(md).not.toContain('section Waves');
        expect(md).not.toContain('wave-floor');
    });
});
