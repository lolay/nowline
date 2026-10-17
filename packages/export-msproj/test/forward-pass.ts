import type { ItemDeclaration, NowlineFile } from '@nowline/core';
import type { RoadmapSchedule } from '@nowline/layout';

// MS Project's own scheduling, enough of it to check that an export puts
// every task where engine C (`scheduleRoadmap`) does: finish-to-start links,
// summary tasks that hold their subtasks back and finish with them, and a
// `<Start>` on a milestone (an anchor or a dated milestone) kept as written.

export interface ParsedTask {
    uid: number;
    name: string;
    outlineLevel: number;
    summary: boolean;
    milestone: boolean;
    workingDays: number;
    /** The `<Start>` date (YYYY-MM-DD), when the export writes one. */
    start?: string;
    preds: number[];
}

export function parseTasks(xml: string): ParsedTask[] {
    const block = xml.slice(xml.indexOf('<Tasks>'), xml.indexOf('</Tasks>'));
    return [...block.matchAll(/<Task>([\s\S]*?)<\/Task>/g)].map(([, body]) => ({
        uid: Number(/<UID>(\d+)<\/UID>/.exec(body)?.[1]),
        name: /<Name>([^<]*)<\/Name>/.exec(body)?.[1] ?? '',
        outlineLevel: Number(/<OutlineLevel>(\d+)<\/OutlineLevel>/.exec(body)?.[1]),
        summary: body.includes('<Summary>1</Summary>'),
        milestone: body.includes('<Milestone>1</Milestone>'),
        workingDays: Number(/<Duration>PT(?:0H)?(\d+)M/.exec(body)?.[1] ?? 0) / 480,
        start: /<Start>(\d{4}-\d{2}-\d{2})T/.exec(body)?.[1],
        preds: [...body.matchAll(/<PredecessorUID>(\d+)<\/PredecessorUID>/g)].map((m) =>
            Number(m[1]),
        ),
    }));
}

/**
 * MS Project's forward pass, in working days from the project start, keyed
 * by UID: a task starts at the latest finish of its finish-to-start
 * predecessors and no earlier than its summary task, and a summary task
 * finishes with the latest of the tasks under it. `dayOf` turns a written
 * `<Start>` into a working-day index.
 */
export function msProjectStarts(
    tasks: readonly ParsedTask[],
    dayOf: (iso: string) => number = () => 0,
): Map<number, number> {
    const byUid = new Map(tasks.map((t) => [t.uid, t]));
    const parent = new Map<number, ParsedTask>();
    const children = new Map<number, ParsedTask[]>();
    const open: ParsedTask[] = [];
    for (const t of tasks) {
        while (open.length > 0 && open[open.length - 1].outlineLevel >= t.outlineLevel) open.pop();
        const up = open[open.length - 1];
        if (up) {
            parent.set(t.uid, up);
            children.get(up.uid)!.push(t);
        }
        if (t.summary) {
            children.set(t.uid, []);
            open.push(t);
        }
    }
    const starts = new Map<number, number>();
    const start = (t: ParsedTask): number => {
        const known = starts.get(t.uid);
        if (known !== undefined) return known;
        const up = parent.get(t.uid);
        const day =
            t.milestone && t.start !== undefined
                ? dayOf(t.start)
                : Math.max(0, up ? start(up) : 0, ...t.preds.map((uid) => finish(byUid.get(uid)!)));
        starts.set(t.uid, day);
        return day;
    };
    const finish = (t: ParsedTask): number =>
        t.summary
            ? Math.max(start(t), ...children.get(t.uid)!.map(finish))
            : start(t) + t.workingDays;
    for (const t of tasks) start(t);
    return starts;
}

/** Every item in the root file's lanes, in the order the export writes their tasks. */
export function itemsInTaskOrder(ast: NowlineFile): ItemDeclaration[] {
    const out: ItemDeclaration[] = [];
    const walk = (nodes: readonly { $type: string }[]): void => {
        for (const node of nodes) {
            if (node.$type === 'ItemDeclaration') out.push(node as ItemDeclaration);
            else if (node.$type === 'GroupBlock' || node.$type === 'ParallelBlock') {
                walk((node as unknown as { content: { $type: string }[] }).content);
            }
        }
    };
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'SwimlaneDeclaration') walk(entry.content);
    }
    return out;
}

export interface StartMismatch {
    task: string;
    msProject: string;
    engineC: string;
}

/**
 * Runs MS Project's forward pass over an export and returns every item task
 * whose start is not engine C's, as dates.
 */
export function startMismatches(
    xml: string,
    ast: NowlineFile,
    schedule: RoadmapSchedule,
): StartMismatch[] {
    const tasks = parseTasks(xml);
    const { working } = schedule.calendar;
    const starts = msProjectStarts(tasks, (iso) =>
        working.workingIndexOf(schedule.startDate, new Date(`${iso}T00:00:00Z`)),
    );
    const itemTasks = tasks.filter((t) => !t.summary && !t.milestone);
    const items = itemsInTaskOrder(ast);
    if (itemTasks.length !== items.length) {
        throw new Error(`${itemTasks.length} item tasks for ${items.length} items`);
    }
    const out: StartMismatch[] = [];
    itemTasks.forEach((t, i) => {
        const msProject = working
            .dateAtWorkingIndex(schedule.startDate, starts.get(t.uid)!)
            .toISOString()
            .slice(0, 10);
        const engineC = schedule.byNode.get(items[i])!.start.toISOString().slice(0, 10);
        if (msProject !== engineC) out.push({ task: t.name, msProject, engineC });
    });
    return out;
}
