// Mermaid keeps one task per id, so a repeated id sends `after` to whichever
// task came last (r1.f9). Every task id must be unique within an export.

import { describe, expect, it } from 'vitest';
import { exportMermaid } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

const STATUS_KEYWORDS = new Set(['done', 'active', 'crit', 'milestone']);

interface Task {
    name: string;
    id: string;
    start: string;
}

/** Each task line of the gantt block: its name, id and start token. */
function tasks(md: string): Task[] {
    const out: Task[] = [];
    for (const line of md.split('\n')) {
        const match = /^ {4}(.+?) :(.+)$/.exec(line);
        if (!match) continue;
        const fields = match[2]!.split(', ').filter((f) => !STATUS_KEYWORDS.has(f));
        out.push({ name: match[1]!, id: fields[0]!, start: fields[1]! });
    }
    return out;
}

async function exportTasks(source: string): Promise<Task[]> {
    return tasks(exportMermaid(await buildExportInputs(source), { lossyComment: false }));
}

function expectUniqueIds(list: readonly Task[]): void {
    const ids = list.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
}

describe('exportMermaid — unique task ids', () => {
    it('keeps a lane chain on its own lane when titles repeat across lanes', async () => {
        const list = await exportTasks(`nowline v1

roadmap r "R" start:2026-01-05

swimlane web "Web"
  item "Design" duration:1w
  item "Build" duration:1w

swimlane ios "iOS"
  item "Design" duration:4w
  item "Build" duration:1w
`);
        expect(list).toEqual([
            { name: 'Design', id: 'design', start: '2026-01-05' },
            { name: 'Build', id: 'build', start: 'after design' },
            { name: 'Design', id: 'design-2', start: '2026-01-05' },
            { name: 'Build', id: 'build-2', start: 'after design-2' },
        ]);
    });

    it('gives titles with no ASCII letters distinct ids across tasks, anchors and milestones', async () => {
        const list = await exportTasks(`nowline v1

roadmap r "R" start:2026-01-05

anchor "起動" date:2026-01-05

swimlane a "A"
  item "設計" duration:1w
  item "構築" duration:1w
  item "テスト" duration:1w

milestone "完了" date:2026-03-02
`);
        expectUniqueIds(list);
        expect(list.map((t) => [t.id, t.start])).toEqual([
            ['item', '2026-01-05'],
            ['item-2', '2026-01-05'],
            ['item-3', 'after item-2'],
            ['item-4', 'after item-3'],
            ['item-5', '2026-03-02'],
        ]);
    });

    it('never gives a title-only task an explicit id, wherever the explicit one is declared', async () => {
        const list = await exportTasks(`nowline v1

roadmap r "R" start:2026-01-05

swimlane a "A"
  item "Design" duration:1w
  item "Design" duration:1w

swimlane b "B"
  item design "Design spec" duration:2w
  item design-2 "Design review" duration:1w
  item ship "Ship" duration:1w after:design
`);
        expectUniqueIds(list);
        expect(list.map((t) => t.id)).toEqual([
            'design-3',
            'design-4',
            'design',
            'design-2',
            'ship',
        ]);
        expect(list.find((t) => t.id === 'ship')?.start).toBe('after design design-2');
    });

    it('expands a container after: to the unique ids of the tasks that end it', async () => {
        const list = await exportTasks(`nowline v1

roadmap r "R" start:2026-01-05

swimlane a "A"
  item "Build" duration:1w
  parallel tracks
    item "Build" duration:1w
    item "Build" duration:2w
  item "Ship" duration:1w

swimlane b "B"
  item "Launch" duration:1w after:tracks
`);
        expectUniqueIds(list);
        expect(list.map((t) => [t.id, t.start])).toEqual([
            ['build', '2026-01-05'],
            ['build-2', 'after build'],
            ['build-3', 'after build'],
            ['ship', 'after build-2 build-3'],
            ['launch', 'after build-2 build-3'],
        ]);
    });

    it('does not let a title-only task take a wave id', async () => {
        const list = await exportTasks(`nowline v1

roadmap r "R" start:2026-01-05

wave alpha "Alpha"

swimlane a "A"
  item "Alpha" duration:1w wave:alpha
`);
        expectUniqueIds(list);
        expect(list.map((t) => t.id)).toEqual(['alpha', 'alpha-2']);
    });
});
