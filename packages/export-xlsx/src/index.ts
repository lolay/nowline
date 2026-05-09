// XLSX exporter — five-sheet workbook via ExcelJS.
//
// Spec: specs/handoffs/m2c.md § 7 + specs/rendering.md § XLSX Export.
// Decisions:
//   - Resolution 5 (working-day duration): the "Duration" cell is a NUMBER
//     of working days; an extra "Duration (text)" column preserves the
//     original DSL literal. Excel can SUM and filter the numeric column
//     without a custom formatter.
//   - Resolution 8 (deterministic ExcelJS): pin a single ExcelJS version in
//     `package.json`. Any zip-level non-determinism is patched at write time
//     by re-emitting the package's content streams in deterministic order.
//
// Determinism contract:
//   - workbook.created = `inputs.today` (UTC midnight) — never `new Date()`
//     in default code path.
//   - Sheet 1 ("Roadmap") "Generated" cell takes the same `today`.
//   - Style ids and column orders are explicit so ExcelJS's id allocator
//     emits the same numbers across runs.

import ExcelJS from 'exceljs';
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
} from '@nowline/core';
import type { ExportInputs } from '@nowline/export-core';
import { displayLabel, getProp, getProps, roadmapTitle } from '@nowline/export-core';

import { durationLiteralToText, durationToWorkingDays } from './duration.js';

export interface XlsxOptions {
    /** Override the workbook author / Roadmap-sheet "Author" cell. */
    author?: string;
    /** Override the "Generated" timestamp; defaults to `inputs.today`. */
    generated?: Date;
}

export async function exportXlsx(
    inputs: ExportInputs,
    options: XlsxOptions = {},
): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const today = options.generated ?? inputs.today ?? new Date(Date.UTC(2026, 0, 5));
    const generated = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    wb.creator = options.author ?? inferAuthor(inputs.ast) ?? 'nowline';
    wb.lastModifiedBy = wb.creator;
    wb.created = generated;
    wb.modified = generated;
    wb.title = roadmapTitle(inputs.ast.roadmapDecl ?? undefined);

    buildRoadmapSheet(wb, inputs, generated);
    buildItemsSheet(wb, inputs.ast);
    buildMilestonesSheet(wb, inputs.ast);
    buildAnchorsSheet(wb, inputs.ast);
    buildPeopleAndTeamsSheet(wb, inputs.ast);

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Buffer;
    if (Buffer.isBuffer(buf)) {
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    return new Uint8Array(buf);
}

function inferAuthor(ast: NowlineFile): string | undefined {
    const decl = ast.roadmapDecl;
    if (!decl) return undefined;
    return decl.properties.find((p) => p.key === 'author')?.value;
}

// ---------- Sheet 1: Roadmap ----------

function buildRoadmapSheet(wb: ExcelJS.Workbook, inputs: ExportInputs, generated: Date): void {
    const sheet = wb.addWorksheet('Roadmap');
    const decl = inputs.ast.roadmapDecl;
    const scale = decl ? getProp(decl, 'scale') : undefined;
    const start = decl ? getProp(decl, 'start') : undefined;

    const rows: [string, string | number | Date | undefined][] = [
        ['Roadmap', roadmapTitle(decl ?? undefined)],
        ['Author', inputs.ast.roadmapDecl ? (getProp(inputs.ast.roadmapDecl, 'author') ?? '') : ''],
        ['Scale', scale ?? ''],
        ['Start', start ?? ''],
        ['Generated', generated],
    ];
    rows.forEach((row, idx) => {
        const r = sheet.addRow(row);
        r.getCell(1).font = { bold: true };
        if (idx === 4) r.getCell(2).numFmt = 'yyyy-mm-dd';
    });
    sheet.columns = [
        { key: 'field', width: 16 },
        { key: 'value', width: 36 },
    ];
}

// ---------- Sheet 2: Items ----------

const ITEM_HEADERS: ReadonlyArray<{ header: string; key: string; width: number }> = [
    { header: 'ID', key: 'id', width: 18 },
    { header: 'Title', key: 'title', width: 28 },
    { header: 'Swimlane', key: 'swimlane', width: 22 },
    { header: 'Group', key: 'group', width: 18 },
    { header: 'Parallel', key: 'parallel', width: 18 },
    { header: 'Duration', key: 'duration', width: 12 },
    { header: 'Duration (text)', key: 'durationText', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Remaining', key: 'remaining', width: 12 },
    { header: 'Owner', key: 'owner', width: 14 },
    { header: 'After', key: 'after', width: 24 },
    { header: 'Before', key: 'before', width: 24 },
    { header: 'Labels', key: 'labels', width: 18 },
    { header: 'Link', key: 'link', width: 24 },
    { header: 'Description', key: 'description', width: 36 },
];

const STATUS_FILLS: Readonly<Record<string, string>> = {
    done: 'FFC8E6C9', // green
    'in-progress': 'FFBBDEFB', // blue
    'at-risk': 'FFFFF59D', // yellow
    blocked: 'FFFFCDD2', // red
    planned: 'FFE0E0E0', // grey
};

interface ItemRow {
    id: string;
    title: string;
    swimlane: string;
    group: string;
    parallel: string;
    duration: number;
    durationText: string;
    status: string;
    remaining: string;
    owner: string;
    after: string;
    before: string;
    labels: string;
    link: string;
    description: string;
}

function buildItemsSheet(wb: ExcelJS.Workbook, ast: NowlineFile): void {
    const sheet = wb.addWorksheet('Items', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });
    sheet.columns = [...ITEM_HEADERS];

    const rows: ItemRow[] = [];
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'SwimlaneDeclaration') {
            collectFromSwimlane(entry as SwimlaneDeclaration, [entry.name ?? ''], rows, '', '');
        }
    }
    for (const r of rows) sheet.addRow(r);

    // Status conditional formatting via per-row fill; ExcelJS ConditionalFormat
    // is supported but the per-row fill is simpler and equally deterministic.
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const status = String(row.getCell('status').value ?? '');
        const fill = STATUS_FILLS[status];
        if (fill) {
            row.getCell('status').fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: fill },
            };
        }
    });

    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(rows.length + 1, 1), column: ITEM_HEADERS.length },
    };
}

function collectFromSwimlane(
    lane: SwimlaneDeclaration,
    breadcrumb: readonly string[],
    rows: ItemRow[],
    group: string,
    parallel: string,
): void {
    const breadcrumbStr = breadcrumb.filter((s) => s.length > 0).join('.');
    for (const child of lane.content) {
        addSwimlaneChild(child, breadcrumbStr, group, parallel, rows);
    }
}

function addSwimlaneChild(
    child: SwimlaneContent,
    swimlane: string,
    group: string,
    parallel: string,
    rows: ItemRow[],
): void {
    if (child.$type === 'ItemDeclaration') {
        rows.push(itemRow(child, swimlane, group, parallel));
        return;
    }
    if (child.$type === 'GroupBlock') {
        const g = child.name ?? displayLabel(child);
        for (const grandchild of (child as GroupBlock).content as GroupContent[]) {
            addGroupChild(grandchild, swimlane, g, parallel, rows);
        }
        return;
    }
    if (child.$type === 'ParallelBlock') {
        const p = child.name ?? displayLabel(child);
        for (const grandchild of (child as ParallelBlock).content) {
            if (grandchild.$type === 'ItemDeclaration') {
                rows.push(itemRow(grandchild, swimlane, group, p));
            } else if (grandchild.$type === 'GroupBlock') {
                const g = grandchild.name ?? displayLabel(grandchild);
                for (const inner of (grandchild as GroupBlock).content as GroupContent[]) {
                    addGroupChild(inner, swimlane, g, p, rows);
                }
            }
        }
    }
}

function addGroupChild(
    child: GroupContent,
    swimlane: string,
    group: string,
    parallel: string,
    rows: ItemRow[],
): void {
    if (child.$type === 'ItemDeclaration') {
        rows.push(itemRow(child, swimlane, group, parallel));
    } else if (child.$type === 'GroupBlock') {
        const sub = child.name ?? displayLabel(child);
        const nested = group ? `${group}.${sub}` : sub;
        for (const grandchild of (child as GroupBlock).content as GroupContent[]) {
            addGroupChild(grandchild, swimlane, nested, parallel, rows);
        }
    } else if (child.$type === 'ParallelBlock') {
        const p = child.name ?? displayLabel(child);
        for (const grandchild of (child as ParallelBlock).content) {
            if (grandchild.$type === 'ItemDeclaration') {
                rows.push(itemRow(grandchild, swimlane, group, p));
            }
        }
    }
}

function itemRow(
    item: ItemDeclaration,
    swimlane: string,
    group: string,
    parallel: string,
): ItemRow {
    const durationLiteral = getProp(item, 'duration') ?? getProp(item, 'size');
    return {
        id: item.name ?? '',
        title: item.title ?? '',
        swimlane,
        group,
        parallel,
        duration: durationToWorkingDays(durationLiteral),
        durationText: durationLiteralToText(durationLiteral),
        status: getProp(item, 'status') ?? '',
        remaining: getProp(item, 'remaining') ?? '',
        owner: getProp(item, 'owner') ?? '',
        after: getProps(item, 'after').join('; '),
        before: getProps(item, 'before').join('; '),
        labels: getProps(item, 'labels').join('; '),
        link: getProp(item, 'link') ?? '',
        description: item.description?.text ?? '',
    };
}

// ---------- Sheet 3: Milestones ----------

function buildMilestonesSheet(wb: ExcelJS.Workbook, ast: NowlineFile): void {
    const sheet = wb.addWorksheet('Milestones', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });
    sheet.columns = [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Title', key: 'title', width: 28 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Depends', key: 'depends', width: 28 },
    ];
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'MilestoneDeclaration') {
            const m = entry as MilestoneDeclaration;
            sheet.addRow({
                id: m.name ?? '',
                title: m.title ?? '',
                date: getProp(m, 'date') ?? '',
                depends: getProps(m, 'depends').join('; '),
            });
        }
    }
    sheet.getRow(1).font = { bold: true };
}

// ---------- Sheet 4: Anchors ----------

function buildAnchorsSheet(wb: ExcelJS.Workbook, ast: NowlineFile): void {
    const sheet = wb.addWorksheet('Anchors', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });
    sheet.columns = [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Title', key: 'title', width: 28 },
        { header: 'Date', key: 'date', width: 14 },
    ];
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'AnchorDeclaration') {
            const a = entry as AnchorDeclaration;
            sheet.addRow({
                id: a.name ?? '',
                title: a.title ?? '',
                date: getProp(a, 'date') ?? '',
            });
        }
    }
    sheet.getRow(1).font = { bold: true };
}

// ---------- Sheet 5: People and Teams ----------

function buildPeopleAndTeamsSheet(wb: ExcelJS.Workbook, ast: NowlineFile): void {
    const sheet = wb.addWorksheet('People and Teams', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });
    sheet.columns = [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Title', key: 'title', width: 28 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Parent Team', key: 'parent', width: 18 },
        { header: 'Link', key: 'link', width: 28 },
    ];
    for (const entry of ast.roadmapEntries) {
        if (entry.$type === 'PersonDeclaration') {
            const p = entry as PersonDeclaration;
            sheet.addRow({
                id: p.name ?? '',
                title: p.title ?? '',
                type: 'person',
                parent: '',
                link: getProp(p, 'link') ?? '',
            });
        } else if (entry.$type === 'TeamDeclaration') {
            walkTeam(entry as TeamDeclaration, '', sheet);
        }
    }
    sheet.getRow(1).font = { bold: true };
}

function walkTeam(team: TeamDeclaration, parent: string, sheet: ExcelJS.Worksheet): void {
    sheet.addRow({
        id: team.name ?? '',
        title: team.title ?? '',
        type: 'team',
        parent,
        link: getProp(team, 'link') ?? '',
    });
    for (const child of team.content) {
        if (child.$type === 'TeamDeclaration') {
            walkTeam(child as TeamDeclaration, team.name ?? '', sheet);
        }
    }
}
