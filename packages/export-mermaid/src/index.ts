// Markdown+Mermaid exporter.
//
// Spec: specs/handoffs/m2c.md § 6 "Markdown+Mermaid".
// Decisions:
//   - Resolution 4 (Mermaid loss discipline): drops are silent in the gantt
//     block; a trailing `%%` comment enumerates dropped features with stable
//     counts; `--strict` does NOT escalate.
//   - Lossy export policy: succeeds on any valid AST regardless of `--strict`.
//
// Output shape:
//   # <Roadmap title>
//
//   <description paragraph if any>
//
//   ```mermaid
//   gantt
//       title <title>
//       dateFormat YYYY-MM-DD
//       excludes saturday, sunday     (only when the open week has days off)
//       section <swimlane>
//       <Task name>: <status>, <id>, <after-or-date>, <duration>
//   ```
//
//   <%% lossy comment %%>
//
// Calendar (specs/working-calendar.md §8): the file's calendar comes from
// engine C (`scheduleRoadmap`, built once per export). `excludes` lists the
// open week's non-working days, Monday first, so Mermaid counts `Nd` in
// working days; every duration is engine C's `days` written as `Nd` (a
// full-calendar `4w` is `28d`). Mermaid never checks a task's explicit start
// against `excludes`, so the dates this exporter derives are working days:
// the roadmap start is snapped to its first working day, and a wave-end
// milestone is the first working day at or after the wave's exclusive end.
// Declared anchor and milestone dates are written as given.
//
// Every emitted task carries an explicit start token (`after <id>` or an
// absolute `YYYY-MM-DD` date). Mermaid's positional task parser strips a
// leading status keyword (`done`/`active`/`crit`/`milestone`) and then reads
// the remaining comma fields as `[start, duration]` (2 fields) or
// `[id, start, duration]` (3 fields). A task that named an id but omitted the
// start (`:done, my-id, 2w`) collapses to two fields after the status strip,
// so Mermaid mis-reads the id as a start date and throws `Invalid date: my-id`
// at render time. To keep an explicit id we therefore MUST emit a start token:
//   - `after <ids>`: the declared `after:` deps (a group or parallel id
//     expanded to the tasks that end it; neither is a Mermaid task), then the
//     lane chain: the previous item in the lane, or every track end when it
//     follows a parallel; a first child also gets its group's or parallel's
//     own `after:`. Engine C starts an item at `max(prevEnd, ...after)`.
//   - with none of those, a lane/track leader -> the roadmap start date
//   - a member of wave k >= 2 also gets `after <wave k-1 id>`: appended to
//     its `after` token, or replacing a lane/track leader's start date
//     (specs/waves.md §10)
// This mirrors Nowline's default "each item starts after the preceding item in
// its lane" semantics (specs/rendering.md § Item Bars).

import type {
    AnchorDeclaration,
    GroupBlock,
    GroupContent,
    ItemDeclaration,
    MilestoneDeclaration,
    ParallelBlock,
    SwimlaneContent,
    SwimlaneDeclaration,
    WavePlan,
} from '@nowline/core';
import { isGroupBlock, isParallelBlock } from '@nowline/core';
import { parseIsoDate, type TrackNode, trackChildren, trackNodes } from '@nowline/core/internal';
import type { ExportInputs } from '@nowline/export-core';
import { displayLabel, getProp, getProps, hasProp, roadmapTitle } from '@nowline/export-core';
import {
    type CalendarException,
    calendarExceptions,
    type RoadmapSchedule,
    scheduleRoadmap,
    type WorkingCalendar,
} from '@nowline/layout';

import { daysToMermaid } from './duration.js';

export interface MermaidOptions {
    /** Append the trailing `%%` lossy comment. Defaults to true. */
    lossyComment?: boolean;
}

interface DropCounts {
    labels: number;
    footnote: number;
    remaining: number;
    owner: number;
    before: number;
    parallel: number;
    group: number;
    nestedSwimlanes: number;
    description: number;
    style: number;
    /** Wave start floors (a wave's `after:`); Mermaid has no "no earlier than". */
    waveFloor: number;
    /** Days a `working` exception opens inside a closed week; Mermaid has no `includes`. */
    workingDay: number;
}

function emptyCounts(): DropCounts {
    return {
        labels: 0,
        footnote: 0,
        remaining: 0,
        owner: 0,
        before: 0,
        parallel: 0,
        group: 0,
        nestedSwimlanes: 0,
        description: 0,
        style: 0,
        waveFloor: 0,
        workingDay: 0,
    };
}

/**
 * Mutable per-lane chaining cursor. `prevIds` are the ids the NEXT sequential
 * task should start after: one item, or every track end after a parallel.
 * Empty means "anchor at the roadmap start date" (lane / parallel-track leader).
 */
interface Chain {
    prevIds: string[];
}

/**
 * Wave barrier context (specs/waves.md §10): the plan, for membership, and
 * each wave's end milestone id by 1-based index. Undefined without waves.
 */
interface WaveCtx {
    plan: WavePlan;
    /** `ids[k - 1]` is wave k's id, which is also its end milestone's id. */
    ids: readonly string[];
}

/** What every item line reads besides its own lane chain. */
interface EmitCtx {
    /** The roadmap start, on a working day (`YYYY-MM-DD`). */
    startDate: string;
    schedule: RoadmapSchedule;
    waves: WaveCtx | undefined;
    /** Each named group and parallel, which `after:` expands to its end tasks. */
    containers: ReadonlyMap<string, GroupBlock | ParallelBlock>;
}

export function exportMermaid(inputs: ExportInputs, options: MermaidOptions = {}): string {
    const ast = inputs.ast;
    const title = roadmapTitle(ast.roadmapDecl ?? undefined);
    const schedule =
        inputs.schedule ?? scheduleRoadmap(ast, inputs.resolved, { today: inputs.today });
    const { working } = schedule.calendar;
    const startDate = formatIsoDate(working.dateAtWorkingIndex(resolveStartDate(inputs), 0));
    const drops = emptyCounts();

    const out: string[] = [];
    out.push(`# ${title}`);
    out.push('');
    out.push('```mermaid');
    out.push('gantt');
    out.push(`    title ${escapeMermaidText(title)}`);
    out.push('    dateFormat YYYY-MM-DD');
    const exceptions = calendarExceptions(
        working,
        inputs.model.timeline.startDate,
        inputs.model.timeline.endDate,
    );
    const excludes = [...excludedWeekdays(working), ...excludedDates(exceptions)];
    if (excludes.length > 0) out.push(`    excludes ${excludes.join(', ')}`);
    drops.workingDay += workingDayCount(exceptions);

    // Footnotes are file-level; counted once.
    drops.footnote += ast.roadmapEntries.filter((e) => e.$type === 'FootnoteDeclaration').length;

    // Anchors → milestone entries (Mermaid doesn't support standalone anchors).
    const anchors = ast.roadmapEntries.filter(
        (e): e is AnchorDeclaration => e.$type === 'AnchorDeclaration',
    );
    if (anchors.length > 0) {
        out.push('    section Anchors');
        for (const anchor of anchors) {
            // Anchors are date markers; fall back to the roadmap start when an
            // anchor omits `date:` so Mermaid always sees a valid start token.
            const date = getProp(anchor, 'date') ?? startDate;
            const id = anchor.name ?? slugify(displayLabel(anchor));
            out.push(`    ${escapeTaskName(displayLabel(anchor))} :milestone, ${id}, ${date}, 0d`);
        }
    }

    // Waves → one end milestone per wave, dated from the day schedule.
    const waves = emitWaves(inputs, schedule, drops, out, startDate);

    // Swimlanes → sections; their items become tasks.
    const swimlanes = ast.roadmapEntries.filter(
        (e): e is SwimlaneDeclaration => e.$type === 'SwimlaneDeclaration',
    );
    const ctx: EmitCtx = { startDate, schedule, waves, containers: namedContainers(swimlanes) };
    for (const lane of swimlanes) {
        emitSwimlane(lane, [lane.name ?? slugify(displayLabel(lane))], drops, out, ctx);
    }

    // Top-level milestones.
    const milestones = ast.roadmapEntries.filter(
        (e): e is MilestoneDeclaration => e.$type === 'MilestoneDeclaration',
    );
    if (milestones.length > 0) {
        out.push('    section Milestones');
        for (const m of milestones) {
            emitMilestone(m, drops, out, ctx);
        }
    }

    out.push('```');

    if (options.lossyComment !== false) {
        const summary = formatDrops(drops);
        if (summary) {
            out.push('');
            out.push(summary);
        }
    }

    return out.join('\n');
}

/**
 * `section Waves` (specs/waves.md §10): `{title} (wave end) :milestone, {id},
 * {date}, 0d` per wave, in declaration order. The date is the first working
 * day at or after `E_k`, the wave's exclusive end from the day schedule: the
 * instant Mermaid starts a task `after` the milestone, so `after:build` and
 * the barrier tokens both open on the barrier, and on a working day, since
 * Mermaid never moves an explicit date off an excluded day. Start floors
 * cannot be expressed and are counted as drops. Returns undefined, emitting
 * nothing, when the roadmap has no waves.
 */
function emitWaves(
    inputs: ExportInputs,
    schedule: RoadmapSchedule,
    drops: DropCounts,
    out: string[],
    startDate: string,
): WaveCtx | undefined {
    const plan = schedule.plan;
    if (!plan) return undefined;
    const { working } = schedule.calendar;
    const ids = plan.waves.map((w) => w.name as string);
    out.push('    section Waves');
    plan.waves.forEach((w, i) => {
        const end = schedule.waves?.get(ids[i]!)?.end;
        const date = end ? formatIsoDate(working.dateAtWorkingIndex(end, 0)) : startDate;
        out.push(
            `    ${escapeTaskName(displayLabel(w))} (wave end) :milestone, ${ids[i]}, ${date}, 0d`,
        );
        if (getProps(w, 'after').length > 0) drops.waveFloor += 1;
    });
    return { plan, ids };
}

function emitSwimlane(
    lane: SwimlaneDeclaration,
    breadcrumb: readonly string[],
    drops: DropCounts,
    out: string[],
    ctx: EmitCtx,
): void {
    const sectionLabel = breadcrumb.join('.');
    out.push(`    section ${escapeMermaidText(sectionLabel)}`);
    // Each lane starts its own sequential chain; the first non-`after` item
    // anchors at the roadmap start date.
    const chain: Chain = { prevIds: [] };
    for (const child of lane.content) {
        emitSwimlaneChild(child, breadcrumb, drops, out, chain, ctx);
    }
    // Nested swimlanes — count for the lossy report.
    // SwimlaneContent doesn't include nested swimlanes per the grammar, so
    // there's nothing to recurse into here. If `nested` lives on the
    // roadmap-level layout model, that's a separate count tracked elsewhere.
}

function emitSwimlaneChild(
    child: SwimlaneContent,
    breadcrumb: readonly string[],
    drops: DropCounts,
    out: string[],
    chain: Chain,
    ctx: EmitCtx,
): void {
    if (child.$type === 'ItemDeclaration') {
        emitItem(child, drops, out, chain, ctx);
        return;
    }
    if (child.$type === 'GroupBlock') {
        drops.group += 1;
        emitGroup(child, breadcrumb, drops, out, chain, ctx);
        return;
    }
    if (child.$type === 'ParallelBlock') {
        drops.parallel += 1;
        emitParallel(child, breadcrumb, drops, out, chain, ctx);
        return;
    }
    if (child.$type === 'DescriptionDirective') {
        drops.description += 1;
        return;
    }
}

function emitGroup(
    group: GroupBlock,
    breadcrumb: readonly string[],
    drops: DropCounts,
    out: string[],
    chain: Chain,
    ctx: EmitCtx,
): void {
    // A group is a visual container within a lane — its items continue the
    // lane's sequential chain, which its own `after:` joins for the first child.
    joinContainerAfter(group, chain, ctx);
    for (const child of group.content as GroupContent[]) {
        if (child.$type === 'ItemDeclaration') {
            emitItem(child, drops, out, chain, ctx);
        } else if (child.$type === 'GroupBlock') {
            drops.group += 1;
            emitGroup(child, breadcrumb, drops, out, chain, ctx);
        } else if (child.$type === 'ParallelBlock') {
            drops.parallel += 1;
            emitParallel(child, breadcrumb, drops, out, chain, ctx);
        } else if (child.$type === 'DescriptionDirective') {
            drops.description += 1;
        }
    }
}

function emitParallel(
    parallel: ParallelBlock,
    breadcrumb: readonly string[],
    drops: DropCounts,
    out: string[],
    chain: Chain,
    ctx: EmitCtx,
): void {
    // Tracks run concurrently: each starts from the parallel's entry point
    // (the lane cursor as it was on entry, joined by the parallel's own
    // `after:`), not after the previous track.
    joinContainerAfter(parallel, chain, ctx);
    const entryIds = chain.prevIds;
    for (const child of parallel.content) {
        if (child.$type === 'ItemDeclaration') {
            emitItem(child, drops, out, { prevIds: entryIds }, ctx);
        } else if (child.$type === 'GroupBlock') {
            drops.group += 1;
            emitGroup(child, breadcrumb, drops, out, { prevIds: entryIds }, ctx);
        } else if (child.$type === 'DescriptionDirective') {
            drops.description += 1;
        }
    }
    // After the block, the lane continues after every track's end: Mermaid's
    // `after a b` starts at the latest of them, where engine C ends a parallel.
    chain.prevIds = endTaskIds(parallel);
}

/**
 * Adds a group's or parallel's own `after:` ids to the chain its first children
 * start from. Engine C starts a container at `max(prevEnd, ...after)`, and
 * neither container is a Mermaid task, so its first children carry both. An
 * inline date stays dropped: as an id it would name no task, and a leader with
 * no other id would start on the day the chart renders.
 */
function joinContainerAfter(
    container: GroupBlock | ParallelBlock,
    chain: Chain,
    ctx: EmitCtx,
): void {
    const refs = getProps(container, 'after').filter((raw) => !parseIsoDate(raw));
    chain.prevIds = union(chain.prevIds, expandAfter(refs, ctx.containers));
}

function emitItem(
    item: ItemDeclaration,
    drops: DropCounts,
    out: string[],
    chain: Chain,
    ctx: EmitCtx,
): void {
    countDrops(item, drops);
    const id = taskIdOf(item);
    const status = mapStatus(getProp(item, 'status'));
    const after = expandAfter(getProps(item, 'after'), ctx.containers);
    const duration = daysToMermaid(ctx.schedule.byNode.get(item)?.days) ?? '1d';
    const start = startTokenFor(after, chain, ctx.startDate, previousWaveOf(item, ctx.waves));

    const meta = [status, id, start, duration].filter((s) => s !== '').join(', ');
    out.push(`    ${escapeTaskName(displayLabel(item))} :${meta}`);
    // Advance the lane cursor so the next sequential item chains after this one.
    chain.prevIds = [id];
}

function emitMilestone(
    milestone: MilestoneDeclaration,
    drops: DropCounts,
    out: string[],
    ctx: EmitCtx,
): void {
    const id = milestone.name ?? slugify(displayLabel(milestone));
    const date = getProp(milestone, 'date');
    const after = expandAfter(getProps(milestone, 'after'), ctx.containers);
    let start: string;
    if (date) {
        start = date;
    } else if (after.length > 0) {
        start = `after ${after.join(' ')}`;
    } else {
        // A milestone with neither a date nor predecessors still needs a start
        // token; anchor it at the roadmap start so Mermaid renders it.
        start = ctx.startDate;
    }
    out.push(`    ${escapeTaskName(displayLabel(milestone))} :milestone, ${id}, ${start}, 0d`);
    if (hasProp(milestone, 'style')) drops.style += 1;
}

/**
 * Start token for a task: `after` its declared `after:` deps and the lane chain
 * (the previous item, every track end after a parallel), deduplicated, as
 * engine C starts it at `max(prevEnd, ...after)`. A member of wave k >= 2 also
 * waits for wave k-1's end milestone (`barrier`). Mermaid's `after a b` starts
 * at the latest of them. With none, a lane or track leader anchors at the
 * roadmap start date. Always non-empty so Mermaid never mis-reads the task id
 * as a start date; a leader's start date gives way to the barrier, which is
 * never earlier.
 */
function startTokenFor(
    after: readonly string[],
    chain: Chain,
    startDate: string,
    barrier?: string,
): string {
    const deps = union(union(after, chain.prevIds), barrier ? [barrier] : []);
    return deps.length > 0 ? `after ${deps.join(' ')}` : startDate;
}

/** `a` then the ids of `b` it lacks, in order. */
function union(a: readonly string[], b: readonly string[]): string[] {
    return [...a, ...b.filter((id) => !a.includes(id))];
}

/** An item's Mermaid task id: its own id, else a slug of its title. */
function taskIdOf(item: ItemDeclaration): string {
    return item.name ?? slugify(displayLabel(item));
}

/** Every named group and parallel under `lanes`, by id. */
function namedContainers(
    lanes: readonly SwimlaneDeclaration[],
): Map<string, GroupBlock | ParallelBlock> {
    const out = new Map<string, GroupBlock | ParallelBlock>();
    for (const node of trackNodes(lanes)) {
        if ((isGroupBlock(node) || isParallelBlock(node)) && node.name) out.set(node.name, node);
    }
    return out;
}

/**
 * `after:` ids with each group and parallel replaced by the tasks that end it,
 * without duplicates. Neither container is a Mermaid task, and Mermaid starts
 * a task with an unknown `after` id on the day it renders. Engine C ends a
 * group at its last child's end and a parallel at its latest track end;
 * Mermaid's `after a b` starts at the latest end of the tasks it names, so the
 * expansion lands on the same day.
 */
function expandAfter(
    after: readonly string[],
    containers: ReadonlyMap<string, GroupBlock | ParallelBlock>,
): string[] {
    const out: string[] = [];
    for (const ref of after) {
        const container = containers.get(ref);
        for (const id of container ? endTaskIds(container) : [ref]) {
            if (!out.includes(id)) out.push(id);
        }
    }
    return out;
}

/** The task ids that end a track node: an item, a group's last child, or every parallel track. */
function endTaskIds(node: TrackNode): string[] {
    if (isGroupBlock(node)) {
        const last = trackChildren(node).at(-1);
        return last ? endTaskIds(last) : [];
    }
    if (isParallelBlock(node)) return trackChildren(node).flatMap(endTaskIds);
    return [taskIdOf(node)];
}

/** The previous wave's id for a member of wave k >= 2; undefined otherwise. */
function previousWaveOf(item: ItemDeclaration, waves: WaveCtx | undefined): string | undefined {
    if (!waves) return undefined;
    const k = waves.plan.memberWave(item);
    return k !== undefined && k >= 2 ? waves.ids[k - 2] : undefined;
}

/**
 * Absolute anchor date for lane leaders. Prefers the roadmap's declared
 * `start:`, falling back to the layout-computed timeline start (always
 * present) so the export renders even when the source omits `start:`. An
 * impossible `start:` (`2026-02-30`, NL.E0405) falls back the same way,
 * as layout treats it, rather than rolling over to March 2.
 */
function resolveStartDate(inputs: ExportInputs): Date {
    const decl = inputs.ast.roadmapDecl;
    const declared = decl ? getProp(decl, 'start') : undefined;
    return parseIsoDate(declared?.trim()) ?? inputs.model.timeline.startDate;
}

/** Monday first, as Mermaid's docs write `excludes`. */
const WEEKDAY_NAMES_MONDAY_FIRST: ReadonlyArray<[number, string]> = [
    [1, 'monday'],
    [2, 'tuesday'],
    [3, 'wednesday'],
    [4, 'thursday'],
    [5, 'friday'],
    [6, 'saturday'],
    [0, 'sunday'],
];

/** The open week's non-working days, as Mermaid `excludes` names. */
function excludedWeekdays(working: WorkingCalendar): string[] {
    return WEEKDAY_NAMES_MONDAY_FIRST.filter(
        ([weekday]) => !working.workingWeekdays.has(weekday),
    ).map(([, name]) => name);
}

const DAY_MS = 86_400_000;

/** The ISO date of every day in every non-working exception, ascending. */
function excludedDates(exceptions: readonly CalendarException[]): string[] {
    const dates: string[] = [];
    for (const exception of exceptions) {
        if (exception.working) continue;
        for (let t = exception.from.getTime(); t <= exception.through.getTime(); t += DAY_MS) {
            dates.push(formatIsoDate(new Date(t)));
        }
    }
    return dates;
}

/** Days across the working exceptions. */
function workingDayCount(exceptions: readonly CalendarException[]): number {
    let days = 0;
    for (const exception of exceptions) {
        if (!exception.working) continue;
        days += Math.round((exception.through.getTime() - exception.from.getTime()) / DAY_MS) + 1;
    }
    return days;
}

function formatIsoDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function countDrops(item: ItemDeclaration, drops: DropCounts): void {
    if (getProps(item, 'labels').length > 0) drops.labels += 1;
    if (hasProp(item, 'remaining')) drops.remaining += 1;
    if (hasProp(item, 'owner')) drops.owner += 1;
    if (getProps(item, 'before').length > 0) drops.before += 1;
    if (hasProp(item, 'style')) drops.style += 1;
    if (item.description) drops.description += 1;
}

function mapStatus(status: string | undefined): string {
    switch (status) {
        case 'done':
            return 'done';
        case 'in-progress':
            return 'active';
        case 'blocked':
        case 'at-risk':
            return 'crit';
        default:
            return '';
    }
}

function slugify(s: string): string {
    return (
        s
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'item'
    );
}

function escapeMermaidText(s: string): string {
    return s.replace(/[\r\n]+/g, ' ').replace(/"/g, '\u201c');
}

function escapeTaskName(s: string): string {
    // Mermaid splits the task line on `:` and `,` — strip them from the name.
    return s.replace(/[\r\n]+/g, ' ').replace(/[:,]+/g, ' ');
}

function formatDrops(drops: DropCounts): string | null {
    const order: (keyof DropCounts)[] = [
        'labels',
        'footnote',
        'remaining',
        'owner',
        'before',
        'parallel',
        'group',
        'nestedSwimlanes',
        'description',
        'style',
        'waveFloor',
        'workingDay',
    ];
    const parts = order
        .filter((key) => drops[key] > 0)
        .map((key) => `${formatDropKey(key)} (${drops[key]})`);
    if (parts.length === 0) return null;
    const lines: string[] = [];
    lines.push('%% Mermaid lossy export — Nowline features dropped:');
    lines.push(`%% ${parts.join(', ')}`);
    return lines.join('\n');
}

function formatDropKey(key: keyof DropCounts): string {
    if (key === 'nestedSwimlanes') return 'nested-swimlanes';
    if (key === 'waveFloor') return 'wave-floor';
    if (key === 'workingDay') return 'working-day';
    return key;
}
