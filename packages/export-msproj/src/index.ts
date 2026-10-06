// MS Project XML exporter — lossy projection of the Nowline AST onto
// Microsoft Project's import schema.
//
// Spec: specs/handoffs/m2c.md § 8.
// Decisions:
//   - Resolution 6: Standard calendar block (Mon–Fri, 8h, fixed UIDs 1/2).
//   - Resolution 9: single stderr summary line on lossy drops; never an error.
//   - Lossy export policy: `--strict` does not escalate.
//   - Waves (specs/waves.md §10): one wave-end milestone task per wave,
//     appended after every other task so existing UIDs never renumber.
//
// Determinism: no `new Date()`. Anchoring date comes from `options.startDate`
// or `inputs.today`; calendar UIDs are fixed; Tasks numbered sequentially.

import type {
    AnchorDeclaration,
    GroupBlock,
    GroupContent,
    ItemDeclaration,
    MilestoneDeclaration,
    NowlineFile,
    ParallelBlock,
    PersonDeclaration,
    SwimlaneContent,
    SwimlaneDeclaration,
    TeamDeclaration,
    WavePlan,
} from '@nowline/core';
import { buildWavePlan } from '@nowline/core';
import type { ExportInputs } from '@nowline/export-core';
import { displayLabel, getProp, getProps, hasProp, roadmapTitle } from '@nowline/export-core';

import { buildCalendarsBlock, STANDARD_RESOURCE_CALENDAR_UID } from './calendar.js';
import { durationToMsProjMinutes, minutesToMsProjDuration } from './duration.js';
import { escapeXml, singleLine, tag } from './xml.js';

export interface MsProjOptions {
    /** Project name attribute. Defaults to roadmap title. */
    projectName?: string;
    /**
     * Anchor date (YYYY-MM-DD). MS Project needs absolute Start dates;
     * relative-only Nowline roadmaps anchor every task here. Falls back to
     * `inputs.today` (UTC midnight) if absent; and if that is also absent,
     * to `2026-01-05` (a deterministic Monday) so tests are stable.
     *
     * Documented as not round-trippable.
     */
    startDate?: string;
    /** Test seam: receives the lossy summary instead of stderr. */
    onLossy?: (message: string) => void;
}

interface DropCounts {
    labels: number;
    footnote: number;
    bracket: number;
    style: number;
    progress: number;
    before: number;
    description: number;
    /** Wave members without an id: no link to their wave-end task. */
    waveNoId: number;
    /** Inline-date wave floors: MS Project links tasks, not dates. */
    waveFloor: number;
}

interface TaskRow {
    uid: number;
    id: number;
    name: string;
    outlineLevel: number;
    isSummary: boolean;
    isMilestone: boolean;
    durationMinutes: number;
    predecessors: string[];
    nowlineId?: string;
    ownerRefs: string[];
    startsAt?: string;
    /** The source item, for wave membership. */
    node?: ItemDeclaration;
    /** Links by UID, added after `predecessors`, skipping UIDs already linked. */
    extraPredecessorUids?: number[];
}

interface ResourceRow {
    uid: number;
    id: number;
    name: string;
    nowlineId?: string;
}

const PROJECT_XMLNS = 'http://schemas.microsoft.com/project';

export function exportMsProjXml(inputs: ExportInputs, options: MsProjOptions = {}): string {
    const ast = inputs.ast;
    const drops: DropCounts = {
        labels: 0,
        footnote: ast.roadmapEntries.filter((e) => e.$type === 'FootnoteDeclaration').length,
        bracket: 0,
        style: 0,
        progress: 0,
        before: 0,
        description: 0,
        waveNoId: 0,
        waveFloor: 0,
    };

    const projectName = escapeXml(
        options.projectName ?? roadmapTitle(ast.roadmapDecl ?? undefined),
    );
    const startDate = resolveStartDate(options.startDate, inputs.today);

    // Resources
    const resources = collectResources(ast);

    // Tasks (walk roadmap entries in source order)
    const tasks = collectTasks(ast, drops, startDate);

    // Predecessor lookup uses Nowline ids → task UIDs.
    const idToUid = new Map<string, number>();
    for (const t of tasks) {
        if (t.nowlineId) idToUid.set(t.nowlineId, t.uid);
    }
    // Undefined when the roadmap declares no waves: nothing below changes.
    const wavePlan = buildWavePlan(inputs.resolved);
    if (wavePlan) {
        addWaveTasks(ast, wavePlan, tasks, idToUid, drops);
    }
    const idToUidResource = new Map<string, number>();
    for (const r of resources) {
        if (r.nowlineId) idToUidResource.set(r.nowlineId, r.uid);
    }

    // Emit XML
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    lines.push(`<Project xmlns="${PROJECT_XMLNS}">`);
    lines.push(`  <Name>${projectName}</Name>`);
    lines.push(`  <Title>${projectName}</Title>`);
    lines.push(`  <StartDate>${startDate}T08:00:00</StartDate>`);
    lines.push('  <ScheduleFromStart>1</ScheduleFromStart>');
    lines.push('  <CalendarUID>1</CalendarUID>');
    lines.push(buildCalendarsBlock());

    // Tasks block
    lines.push('  <Tasks>');
    for (const t of tasks) {
        emitTask(t, idToUid, lines);
    }
    lines.push('  </Tasks>');

    // Resources block
    if (resources.length > 0) {
        lines.push('  <Resources>');
        for (const r of resources) {
            emitResource(r, lines);
        }
        lines.push('  </Resources>');

        // Assignments — owners on items.
        const assignments = collectAssignments(tasks, idToUidResource);
        if (assignments.length > 0) {
            lines.push('  <Assignments>');
            for (const a of assignments) {
                emitAssignment(a, lines);
            }
            lines.push('  </Assignments>');
        }
    }

    lines.push('</Project>');

    // Lossy summary
    const summary = formatDrops(drops);
    if (summary) {
        const sink = options.onLossy ?? ((msg) => process.stderr.write(`${msg}\n`));
        sink(summary);
    }

    return lines.join('\n');
}

// ---------- Tasks ----------

function collectTasks(ast: NowlineFile, drops: DropCounts, startDate: string): TaskRow[] {
    const tasks: TaskRow[] = [];
    const ctx = { uid: 1, id: 1 };

    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'SwimlaneDeclaration') {
            const lane = entry as SwimlaneDeclaration;
            const summaryUid = ctx.uid;
            tasks.push({
                uid: ctx.uid++,
                id: ctx.id++,
                name: displayLabel(lane),
                outlineLevel: 1,
                isSummary: true,
                isMilestone: false,
                durationMinutes: 0,
                predecessors: [],
                nowlineId: lane.name,
                ownerRefs: getProps(lane, 'owner') as string[],
            });
            for (const child of lane.content) {
                walkSwimlaneChild(child, 2, ctx, drops, tasks, startDate);
            }
            // Summary spans all child rows — implicit in MSProject by id ranges,
            // but we don't bother computing FinishDate / actuals.
            void summaryUid;
        } else if (entry.$type === 'MilestoneDeclaration') {
            const m = entry as MilestoneDeclaration;
            tasks.push({
                uid: ctx.uid++,
                id: ctx.id++,
                name: displayLabel(m),
                outlineLevel: 1,
                isSummary: false,
                isMilestone: true,
                durationMinutes: 0,
                predecessors: getProps(m, 'after') as string[],
                nowlineId: m.name,
                ownerRefs: [],
                startsAt: getProp(m, 'date'),
            });
            if (hasProp(m, 'style')) drops.style += 1;
        } else if (entry.$type === 'AnchorDeclaration') {
            const a = entry as AnchorDeclaration;
            tasks.push({
                uid: ctx.uid++,
                id: ctx.id++,
                name: displayLabel(a),
                outlineLevel: 1,
                isSummary: false,
                isMilestone: true, // Anchors → milestones in MS Project
                durationMinutes: 0,
                predecessors: [],
                nowlineId: a.name,
                ownerRefs: [],
                startsAt: getProp(a, 'date'),
            });
        }
    }
    return tasks;
}

function walkSwimlaneChild(
    child: SwimlaneContent,
    outline: number,
    ctx: { uid: number; id: number },
    drops: DropCounts,
    tasks: TaskRow[],
    startDate: string,
): void {
    if (child.$type === 'ItemDeclaration') {
        emitTaskRow(child, outline, ctx, drops, tasks);
    } else if (child.$type === 'GroupBlock') {
        const group = child as GroupBlock;
        tasks.push({
            uid: ctx.uid++,
            id: ctx.id++,
            name: displayLabel(group),
            outlineLevel: outline,
            isSummary: true,
            isMilestone: false,
            durationMinutes: 0,
            predecessors: [],
            nowlineId: group.name,
            ownerRefs: [],
        });
        for (const grandchild of group.content as GroupContent[]) {
            walkGroupChild(grandchild, outline + 1, ctx, drops, tasks, startDate);
        }
    } else if (child.$type === 'ParallelBlock') {
        const parallel = child as ParallelBlock;
        for (const grandchild of parallel.content) {
            if (grandchild.$type === 'ItemDeclaration') {
                emitTaskRow(grandchild, outline, ctx, drops, tasks);
            } else if (grandchild.$type === 'GroupBlock') {
                walkSwimlaneChild(
                    grandchild as unknown as SwimlaneContent,
                    outline,
                    ctx,
                    drops,
                    tasks,
                    startDate,
                );
            }
        }
    } else if (child.$type === 'DescriptionDirective') {
        drops.description += 1;
    }
}

function walkGroupChild(
    child: GroupContent,
    outline: number,
    ctx: { uid: number; id: number },
    drops: DropCounts,
    tasks: TaskRow[],
    startDate: string,
): void {
    if (child.$type === 'ItemDeclaration') {
        emitTaskRow(child, outline, ctx, drops, tasks);
    } else if (child.$type === 'GroupBlock') {
        const group = child as GroupBlock;
        tasks.push({
            uid: ctx.uid++,
            id: ctx.id++,
            name: displayLabel(group),
            outlineLevel: outline,
            isSummary: true,
            isMilestone: false,
            durationMinutes: 0,
            predecessors: [],
            nowlineId: group.name,
            ownerRefs: [],
        });
        for (const grandchild of group.content as GroupContent[]) {
            walkGroupChild(grandchild, outline + 1, ctx, drops, tasks, startDate);
        }
    } else if (child.$type === 'ParallelBlock') {
        const parallel = child as ParallelBlock;
        for (const grandchild of parallel.content) {
            if (grandchild.$type === 'ItemDeclaration') {
                emitTaskRow(grandchild, outline, ctx, drops, tasks);
            }
        }
    } else if (child.$type === 'DescriptionDirective') {
        drops.description += 1;
    }
}

function emitTaskRow(
    item: ItemDeclaration,
    outline: number,
    ctx: { uid: number; id: number },
    drops: DropCounts,
    tasks: TaskRow[],
): void {
    countDrops(item, drops);
    tasks.push({
        uid: ctx.uid++,
        id: ctx.id++,
        name: displayLabel(item),
        outlineLevel: outline,
        isSummary: false,
        isMilestone: false,
        durationMinutes: durationToMsProjMinutes(
            getProp(item, 'duration') ?? getProp(item, 'size'),
        ),
        predecessors: getProps(item, 'after') as string[],
        nowlineId: item.name,
        ownerRefs: getProps(item, 'owner') as string[],
        node: item,
    });
}

function countDrops(item: ItemDeclaration, drops: DropCounts): void {
    if (getProps(item, 'labels').length > 0) drops.labels += 1;
    if (hasProp(item, 'style')) drops.style += 1;
    if (hasProp(item, 'remaining')) drops.progress += 1;
    if (getProps(item, 'before').length > 0) drops.before += 1;
    if (item.description) drops.description += 1;
}

function emitTask(t: TaskRow, idToUid: Map<string, number>, lines: string[]): void {
    lines.push('    <Task>');
    lines.push(`      ${tag('UID', t.uid)}`);
    lines.push(`      ${tag('ID', t.id)}`);
    lines.push(`      ${tag('Name', singleLine(t.name))}`);
    if (t.isSummary) lines.push(`      <Summary>1</Summary>`);
    if (t.isMilestone) {
        lines.push('      <Milestone>1</Milestone>');
        lines.push('      <Duration>PT0H0M0S</Duration>');
    } else {
        lines.push(`      <Duration>${minutesToMsProjDuration(t.durationMinutes)}</Duration>`);
    }
    lines.push(`      <OutlineLevel>${t.outlineLevel}</OutlineLevel>`);
    if (t.startsAt) {
        lines.push(`      <Start>${t.startsAt}T08:00:00</Start>`);
    }
    const linked = new Set<number>();
    for (const pred of t.predecessors) {
        const uid = idToUid.get(pred);
        if (uid !== undefined) {
            emitPredecessorLink(uid, lines);
            linked.add(uid);
        }
    }
    for (const uid of t.extraPredecessorUids ?? []) {
        if (linked.has(uid)) continue;
        emitPredecessorLink(uid, lines);
        linked.add(uid);
    }
    lines.push('    </Task>');
}

function emitPredecessorLink(uid: number, lines: string[]): void {
    lines.push('      <PredecessorLink>');
    lines.push(`        ${tag('PredecessorUID', uid)}`);
    lines.push('        <Type>1</Type>'); // FS
    lines.push('      </PredecessorLink>');
}

// ---------- Waves ----------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Waves (specs/waves.md §10). Appends one zero-duration milestone task per
 * wave, `{title} (wave end)`, after every other task (so existing UIDs and
 * IDs never renumber), and wires the barrier as FS links:
 *   - wave-end task k <- every member of wave k with an id, and wave k-1's end;
 *   - every member of wave k >= 2 <- wave k-1's end task;
 *   - a floor (`after:` on the wave naming an anchor or a dated milestone)
 *     <- every member of wave k and wave k's end task (the end task covers an
 *     empty wave); an inline-date floor is dropped and counted.
 * Wave ids join `idToUid`, so `after:<wave>` links to the wave-end task.
 * Background work gets nothing.
 */
function addWaveTasks(
    ast: NowlineFile,
    plan: WavePlan,
    tasks: TaskRow[],
    idToUid: Map<string, number>,
    drops: DropCounts,
): void {
    const datedTargets = new Set<string>();
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'AnchorDeclaration') {
            const a = entry as AnchorDeclaration;
            if (a.name) datedTargets.add(a.name);
        } else if (entry.$type === 'MilestoneDeclaration') {
            const m = entry as MilestoneDeclaration;
            if (m.name && getProp(m, 'date') !== undefined) datedTargets.add(m.name);
        }
    }

    const last = tasks[tasks.length - 1];
    let uid = (last?.uid ?? 0) + 1;
    let id = (last?.id ?? 0) + 1;
    const endUids = plan.waves.map(() => uid++);

    const floorUids = plan.waves.map((wave) => {
        const out: number[] = [];
        for (const ref of getProps(wave, 'after') as string[]) {
            if (ISO_DATE_RE.test(ref)) {
                drops.waveFloor += 1;
                continue;
            }
            const target = datedTargets.has(ref) ? idToUid.get(ref) : undefined;
            if (target !== undefined) out.push(target);
        }
        return out;
    });

    const memberUids: number[][] = plan.waves.map(() => []);
    for (const t of tasks) {
        const k = t.node ? plan.memberWave(t.node) : undefined;
        if (k === undefined) continue;
        const extra = [...floorUids[k - 1]];
        if (k >= 2) extra.unshift(endUids[k - 2]);
        if (extra.length > 0) t.extraPredecessorUids = extra;
        if (t.nowlineId) memberUids[k - 1].push(t.uid);
        else drops.waveNoId += 1;
    }

    plan.waves.forEach((wave, i) => {
        const preds = [...memberUids[i], ...floorUids[i]];
        if (i > 0) preds.push(endUids[i - 1]);
        tasks.push({
            uid: endUids[i],
            id: id++,
            name: `${displayLabel(wave)} (wave end)`,
            outlineLevel: 1,
            isSummary: false,
            isMilestone: true,
            durationMinutes: 0,
            predecessors: [],
            ownerRefs: [],
            extraPredecessorUids: preds,
        });
        if (wave.name && !idToUid.has(wave.name)) idToUid.set(wave.name, endUids[i]);
    });
}

// ---------- Resources ----------

function collectResources(ast: NowlineFile): ResourceRow[] {
    const out: ResourceRow[] = [];
    const ctx = { uid: 1, id: 1 };
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'PersonDeclaration') {
            const p = entry as PersonDeclaration;
            out.push({
                uid: ctx.uid++,
                id: ctx.id++,
                name: displayLabel(p),
                nowlineId: p.name,
            });
        } else if (entry.$type === 'TeamDeclaration') {
            collectTeam(entry as TeamDeclaration, out, ctx);
        }
    }
    return out;
}

function collectTeam(
    team: TeamDeclaration,
    out: ResourceRow[],
    ctx: { uid: number; id: number },
): void {
    out.push({
        uid: ctx.uid++,
        id: ctx.id++,
        name: displayLabel(team),
        nowlineId: team.name,
    });
    for (const child of team.content) {
        if (child.$type === 'TeamDeclaration') {
            collectTeam(child as TeamDeclaration, out, ctx);
        }
    }
}

function emitResource(r: ResourceRow, lines: string[]): void {
    lines.push('    <Resource>');
    lines.push(`      ${tag('UID', r.uid)}`);
    lines.push(`      ${tag('ID', r.id)}`);
    lines.push(`      ${tag('Name', singleLine(r.name))}`);
    lines.push(`      <CalendarUID>${STANDARD_RESOURCE_CALENDAR_UID}</CalendarUID>`);
    lines.push('    </Resource>');
}

// ---------- Assignments ----------

interface AssignmentRow {
    taskUid: number;
    resourceUid: number;
}

function collectAssignments(tasks: TaskRow[], idToUid: Map<string, number>): AssignmentRow[] {
    const out: AssignmentRow[] = [];
    const assignmentUid = 1;
    void assignmentUid;
    for (const t of tasks) {
        for (const owner of t.ownerRefs) {
            const uid = idToUid.get(owner);
            if (uid !== undefined) {
                out.push({ taskUid: t.uid, resourceUid: uid });
            }
        }
    }
    return out;
}

function emitAssignment(a: AssignmentRow, lines: string[]): void {
    lines.push('    <Assignment>');
    lines.push(`      ${tag('TaskUID', a.taskUid)}`);
    lines.push(`      ${tag('ResourceUID', a.resourceUid)}`);
    lines.push('      <Units>1</Units>');
    lines.push('    </Assignment>');
}

// ---------- Lossy summary ----------

function formatDrops(drops: DropCounts): string | null {
    const order: (keyof DropCounts)[] = [
        'labels',
        'footnote',
        'bracket',
        'style',
        'progress',
        'before',
        'description',
        'waveNoId',
        'waveFloor',
    ];
    const parts = order.filter((k) => drops[k] > 0).map((k) => `${formatDropKey(k)} (${drops[k]})`);
    if (parts.length === 0) return null;
    return `nowline: msproj export dropped ${parts.length} feature kinds: ${parts.join(', ')}`;
}

function formatDropKey(key: keyof DropCounts): string {
    if (key === 'waveNoId') return 'wave-member-no-id';
    if (key === 'waveFloor') return 'wave-floor';
    return key;
}

// ---------- helpers ----------

function resolveStartDate(option: string | undefined, today: Date | undefined): string {
    if (option) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(option)) {
            throw new Error(`invalid msproj startDate "${option}": expected YYYY-MM-DD`);
        }
        return option;
    }
    if (today) {
        return today.toISOString().slice(0, 10);
    }
    return '2026-01-05'; // a deterministic Monday for tests
}
