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
//       axisFormat ...
//       section <swimlane>
//       <Task name>: <status>, <id>, <after-or-date>, <duration>
//   ```
//
//   <%% lossy comment %%>

import type { ExportInputs } from '@nowline/export-core';
import {
    displayLabel,
    getProp,
    getProps,
    hasProp,
    roadmapTitle,
} from '@nowline/export-core';
import type {
    AnchorDeclaration,
    GroupBlock,
    GroupContent,
    ItemDeclaration,
    MilestoneDeclaration,
    NowlineFile,
    ParallelBlock,
    SwimlaneContent,
    SwimlaneDeclaration,
} from '@nowline/core';

import { durationToMermaid } from './duration.js';

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
    };
}

export function exportMermaid(
    inputs: ExportInputs,
    options: MermaidOptions = {},
): string {
    const ast = inputs.ast;
    const title = roadmapTitle(ast.roadmapDecl ?? undefined);
    const drops = emptyCounts();

    const out: string[] = [];
    out.push(`# ${title}`);
    out.push('');
    out.push('```mermaid');
    out.push('gantt');
    out.push(`    title ${escapeMermaidText(title)}`);
    out.push('    dateFormat YYYY-MM-DD');

    // Footnotes are file-level; counted once.
    drops.footnote += ast.roadmapEntries.filter((e) => e.$type === 'FootnoteDeclaration').length;

    // Anchors → milestone entries (Mermaid doesn't support standalone anchors).
    const anchors = ast.roadmapEntries.filter((e): e is AnchorDeclaration => e.$type === 'AnchorDeclaration');
    if (anchors.length > 0) {
        out.push('    section Anchors');
        for (const anchor of anchors) {
            const date = getProp(anchor, 'date');
            const id = anchor.name ?? slugify(displayLabel(anchor));
            if (date) {
                out.push(`    ${escapeTaskName(displayLabel(anchor))} :milestone, ${id}, ${date}, 0d`);
            } else {
                out.push(`    ${escapeTaskName(displayLabel(anchor))} :milestone, ${id}, after , 0d`);
            }
        }
    }

    // Swimlanes → sections; their items become tasks.
    const swimlanes = ast.roadmapEntries.filter(
        (e): e is SwimlaneDeclaration => e.$type === 'SwimlaneDeclaration',
    );
    for (const lane of swimlanes) {
        emitSwimlane(lane, [lane.name ?? slugify(displayLabel(lane))], drops, out);
    }

    // Top-level milestones.
    const milestones = ast.roadmapEntries.filter(
        (e): e is MilestoneDeclaration => e.$type === 'MilestoneDeclaration',
    );
    if (milestones.length > 0) {
        out.push('    section Milestones');
        for (const m of milestones) {
            emitMilestone(m, drops, out);
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

function emitSwimlane(
    lane: SwimlaneDeclaration,
    breadcrumb: readonly string[],
    drops: DropCounts,
    out: string[],
): void {
    const sectionLabel = breadcrumb.join('.');
    out.push(`    section ${escapeMermaidText(sectionLabel)}`);
    for (const child of lane.content) {
        emitSwimlaneChild(child, breadcrumb, drops, out);
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
): void {
    if (child.$type === 'ItemDeclaration') {
        emitItem(child, drops, out);
        return;
    }
    if (child.$type === 'GroupBlock') {
        drops.group += 1;
        emitGroup(child, breadcrumb, drops, out);
        return;
    }
    if (child.$type === 'ParallelBlock') {
        drops.parallel += 1;
        emitParallel(child, breadcrumb, drops, out);
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
): void {
    for (const child of group.content as GroupContent[]) {
        if (child.$type === 'ItemDeclaration') {
            emitItem(child, drops, out);
        } else if (child.$type === 'GroupBlock') {
            drops.group += 1;
            emitGroup(child, breadcrumb, drops, out);
        } else if (child.$type === 'ParallelBlock') {
            drops.parallel += 1;
            emitParallel(child, breadcrumb, drops, out);
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
): void {
    for (const child of parallel.content) {
        if (child.$type === 'ItemDeclaration') {
            emitItem(child, drops, out);
        } else if (child.$type === 'GroupBlock') {
            drops.group += 1;
            emitGroup(child, breadcrumb, drops, out);
        } else if (child.$type === 'DescriptionDirective') {
            drops.description += 1;
        }
    }
}

function emitItem(item: ItemDeclaration, drops: DropCounts, out: string[]): void {
    countDrops(item, drops);
    const id = item.name ?? slugify(displayLabel(item));
    const status = mapStatus(getProp(item, 'status'));
    const after = getProps(item, 'after');
    const duration = durationToMermaid(getProp(item, 'duration')) ?? '1d';
    const ref = after.length > 0
        ? `after ${after.join(' ')}`
        : 'after , 0d'.replace(', 0d', '');

    const meta = [status, id, after.length > 0 ? `after ${after.join(' ')}` : '', duration]
        .filter((s) => s !== '')
        .join(', ');
    out.push(`    ${escapeTaskName(displayLabel(item))} :${meta}`);
}

function emitMilestone(milestone: MilestoneDeclaration, drops: DropCounts, out: string[]): void {
    const id = milestone.name ?? slugify(displayLabel(milestone));
    const date = getProp(milestone, 'date');
    if (date) {
        out.push(`    ${escapeTaskName(displayLabel(milestone))} :milestone, ${id}, ${date}, 0d`);
    } else {
        const after = getProps(milestone, 'depends');
        if (after.length > 0) {
            out.push(`    ${escapeTaskName(displayLabel(milestone))} :milestone, ${id}, after ${after.join(' ')}, 0d`);
        } else {
            out.push(`    ${escapeTaskName(displayLabel(milestone))} :milestone, ${id}, 0d`);
        }
    }
    if (hasProp(milestone, 'style')) drops.style += 1;
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
        case 'done': return 'done';
        case 'in-progress': return 'active';
        case 'blocked':
        case 'at-risk': return 'crit';
        default: return '';
    }
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'item';
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
    return key;
}
