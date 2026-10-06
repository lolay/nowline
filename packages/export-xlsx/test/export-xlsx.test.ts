import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scheduleRoadmap } from '@nowline/layout';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportXlsx } from '../src/index.js';
import { buildExportInputs, FIXTURE, PINNED_DATE } from './helpers.js';

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04 (zip)

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes));
    return wb;
}

function sha256(b: Uint8Array): string {
    return createHash('sha256').update(b).digest('hex');
}

describe('exportXlsx — output shape', () => {
    it('emits a zip-format XLSX (PK magic header)', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        expect(xlsx.byteLength).toBeGreaterThan(1000);
        const head = Buffer.from(xlsx.slice(0, 4));
        expect(head.equals(XLSX_MAGIC)).toBe(true);
    });

    it('contains all five sheets in the documented order for a full fixture', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const names = wb.worksheets.map((s) => s.name);
        expect(names).toEqual(['Roadmap', 'Items', 'Milestones', 'Anchors', 'People and Teams']);
    });

    it('omits Milestones sheet when roadmap has no milestones', async () => {
        const fixture = `nowline v1
roadmap sparse "Sparse"
anchor kickoff date:2026-01-06
swimlane work "Work"
  item t1 "Task 1" duration:1w
person alice "Alice"
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const names = wb.worksheets.map((s) => s.name);
        expect(names).not.toContain('Milestones');
        expect(names).toContain('Anchors');
        expect(names).toContain('People and Teams');
    });

    it('omits Anchors sheet when roadmap has no anchors', async () => {
        const fixture = `nowline v1
roadmap sparse "Sparse"
swimlane work "Work"
  item t1 "Task 1" duration:1w
milestone m1 "M1" date:2026-06-01
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const names = wb.worksheets.map((s) => s.name);
        expect(names).not.toContain('Anchors');
        expect(names).toContain('Milestones');
    });

    it('omits People and Teams sheet when roadmap has no people or teams', async () => {
        const fixture = `nowline v1
roadmap sparse "Sparse"
swimlane work "Work"
  item t1 "Task 1" duration:1w
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const names = wb.worksheets.map((s) => s.name);
        expect(names).not.toContain('People and Teams');
    });
});

describe('exportXlsx — Roadmap sheet (metadata)', () => {
    it('lists Roadmap title, author, scale, start, calendar, generated', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Roadmap')!;
        expect(sheet.getCell('A1').value).toBe('Roadmap');
        expect(sheet.getCell('B1').value).toBe('Demo Roadmap');
        expect(sheet.getCell('A2').value).toBe('Author');
        expect(sheet.getCell('B2').value).toBe('Acme');
        expect(sheet.getCell('A3').value).toBe('Scale');
        expect(sheet.getCell('B3').value).toBe('weeks');
        expect(sheet.getCell('A4').value).toBe('Start');
        expect(sheet.getCell('B4').value).toBe('2026-01-05');
        expect(sheet.getCell('A5').value).toBe('Calendar');
        expect(sheet.getCell('B5').value).toBe(
            'business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)',
        );
        expect(sheet.getCell('A6').value).toBe('Generated');
    });
});

describe('exportXlsx — explicit line breaks in titles (lolay/nowline#60)', () => {
    it('keeps a line break in the Title cell as an in-cell break (no collapse)', async () => {
        const fixture = `nowline v1

roadmap r "R" start:2026-04-06

swimlane lane "Lane"
  item tech "Technology\\nSelection" duration:2w
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const wb = await readBack(await exportXlsx(inputs));
        const sheet = wb.getWorksheet('Items')!;
        let titleCol = 0;
        sheet.getRow(1).eachCell((cell, colNumber) => {
            if (cell.value === 'Title') titleCol = colNumber;
        });
        expect(titleCol).toBeGreaterThan(0);
        expect(sheet.getRow(2).getCell(titleCol).value).toBe('Technology\nSelection');
    });
});

describe('exportXlsx — Items sheet', () => {
    it('header row includes ID, Title, Duration (numeric + text), Status, Owner', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        const headers = (sheet.getRow(1).values as unknown as string[]).filter(Boolean);
        expect(headers).toContain('ID');
        expect(headers).toContain('Title');
        expect(headers).toContain('Duration');
        expect(headers).toContain('Duration (text)');
        expect(headers).toContain('Start');
        expect(headers).toContain('End (exclusive)');
        expect(headers).not.toContain('End');
        expect(headers).toContain('Status');
        expect(headers).toContain('Owner');
        expect(headers).toContain('After');
        expect(headers).toContain('Labels');
    });

    it('Duration column is numeric working days', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        // Find the Auth refactor row (duration:2w → 10 working days).
        const headerRow = sheet.getRow(1);
        let durationCol = 0;
        let titleCol = 0;
        headerRow.eachCell((cell, colNumber) => {
            if (cell.value === 'Duration') durationCol = colNumber;
            if (cell.value === 'Title') titleCol = colNumber;
        });
        expect(durationCol).toBeGreaterThan(0);
        let found = false;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            if (row.getCell(titleCol).value === 'Auth refactor') {
                expect(row.getCell(durationCol).value).toBe(10);
                found = true;
            }
        });
        expect(found).toBe(true);
    });

    it('Start and End are Date objects for named items', async () => {
        // auth item: after:kickoff (2026-01-06), duration:2w (10 working days)
        //   → start Tue 2026-01-06, last working day Mon 2026-01-19, so the
        //   exclusive end is Tue 2026-01-20 (the weekend is skipped).
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        let titleCol = 0;
        let startCol = 0;
        let endCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Title') titleCol = col;
            if (cell.value === 'Start') startCol = col;
            if (cell.value === 'End (exclusive)') endCol = col;
        });
        expect(startCol).toBeGreaterThan(0);
        expect(endCol).toBeGreaterThan(0);

        let foundAuth = false;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            if (row.getCell(titleCol).value === 'Auth refactor') {
                const start = row.getCell(startCol).value;
                const end = row.getCell(endCol).value;
                expect(start).toBeInstanceOf(Date);
                expect(end).toBeInstanceOf(Date);
                // start = 2026-01-06 (kickoff anchor date)
                expect((start as Date).toISOString().slice(0, 10)).toBe('2026-01-06');
                // end = 10 working days after the start, exclusive = 2026-01-20
                expect((end as Date).toISOString().slice(0, 10)).toBe('2026-01-20');
                foundAuth = true;
            }
        });
        expect(foundAuth).toBe(true);
    });

    it('Swimlane column uses id when present', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        let swimlaneCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Swimlane') swimlaneCol = col;
        });
        // all items in the fixture are in the "platform" swimlane (name=platform)
        let found = false;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            const sv = row.getCell(swimlaneCol).value;
            if (sv) {
                expect(sv).toBe('platform');
                found = true;
            }
        });
        expect(found).toBe(true);
    });

    it('Swimlane column falls back to title for title-only swimlane', async () => {
        const fixture = `nowline v1
roadmap r "R"
swimlane "The Lane"
  item t1 "Task" duration:1w
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        let swimlaneCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Swimlane') swimlaneCol = col;
        });
        let swimlaneValue: unknown;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            swimlaneValue = row.getCell(swimlaneCol).value;
        });
        expect(swimlaneValue).toBe('The Lane');
    });

    it('group + parallel breadcrumbs propagate to rows', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        let titleCol = 0;
        let groupCol = 0;
        let parallelCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Title') titleCol = col;
            if (cell.value === 'Group') groupCol = col;
            if (cell.value === 'Parallel') parallelCol = col;
        });
        const groupRows: { title: unknown; group: unknown; parallel: unknown }[] = [];
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            groupRows.push({
                title: row.getCell(titleCol).value,
                group: row.getCell(groupCol).value,
                parallel: row.getCell(parallelCol).value,
            });
        });
        const linting = groupRows.find((r) => r.title === 'Linting');
        expect(linting?.group).toBe('cleanup');
        const alpha = groupRows.find((r) => r.title === 'Alpha');
        expect(alpha?.parallel).toBe('sprint');
    });

    it('Labels are joined with "; "', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        let titleCol = 0;
        let labelsCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Title') titleCol = col;
            if (cell.value === 'Labels') labelsCol = col;
        });
        let labelsValue: unknown;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            if (row.getCell(titleCol).value === 'Auth refactor') {
                labelsValue = row.getCell(labelsCol).value;
            }
        });
        expect(labelsValue).toBe('security');
    });

    it('Status column conditional formatting fills colored cells', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Items')!;
        let statusCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Status') statusCol = col;
        });
        // At least one status cell carries a fill
        let filledCount = 0;
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            const cell = row.getCell(statusCol);
            if (cell.fill && cell.fill.type === 'pattern') filledCount += 1;
        });
        expect(filledCount).toBeGreaterThan(0);
    });
});

describe('exportXlsx — Milestones / Anchors / People sheets', () => {
    it('Milestones sheet captures id, title, date and after', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Milestones')!;
        // Header row
        const headers = (sheet.getRow(1).values as unknown as string[]).filter(Boolean);
        expect(headers).toContain('After');
        expect(headers).not.toContain('Depends');
        // Data row for "done" milestone
        expect(sheet.getCell('A2').value).toBe('done');
        // Date column should be a Date object (2026-12-15)
        const dateVal = sheet.getCell('C2').value;
        expect(dateVal).toBeInstanceOf(Date);
        expect((dateVal as Date).toISOString().slice(0, 10)).toBe('2026-12-15');
        // After column: after:[auth, api-v2]
        expect(sheet.getCell('D2').value).toBe('auth; api-v2');
    });

    it('Milestones Date is computed from after: for floating milestones', async () => {
        // A milestone with after: but no date: should have a computed Date.
        const fixture = `nowline v1
roadmap r "R" start:2026-01-05
anchor kickoff date:2026-01-06
swimlane s "S"
  item a "A" duration:2w after:kickoff
milestone floating "Float" after:[a]
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Milestones')!;
        const dateVal = sheet.getCell('C2').value;
        // a starts Tue 2026-01-06, duration 2w (10 working days) → ends
        // (exclusive) Tue 2026-01-20. The milestone is a point at a's end:
        // the first working day it can start on, 2026-01-20 (a Tuesday).
        expect(dateVal).toBeInstanceOf(Date);
        expect((dateVal as Date).toISOString().slice(0, 10)).toBe('2026-01-20');
    });

    it('Start and End skip the weekend through the public scheduleRoadmap', async () => {
        // a: Mon-Fri (exclusive end Sat 01-10); b opens the next working day,
        // Monday 01-12, and its exclusive end is Saturday 01-17.
        const fixture = `nowline v1
roadmap r "R" start:2026-01-05
swimlane s "S"
  item a "A" duration:1w
  item b "B" duration:1w
`;
        const inputs = await buildExportInputs(fixture, { today: PINNED_DATE });
        const wb = await readBack(await exportXlsx(inputs));
        const sheet = wb.getWorksheet('Items')!;
        let startCol = 0;
        let endCol = 0;
        sheet.getRow(1).eachCell((cell, col) => {
            if (cell.value === 'Start') startCol = col;
            if (cell.value === 'End (exclusive)') endCol = col;
        });
        const days: Array<[string, string]> = [];
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            days.push([
                (row.getCell(startCol).value as Date).toISOString().slice(0, 10),
                (row.getCell(endCol).value as Date).toISOString().slice(0, 10),
            ]);
        });
        expect(days).toEqual([
            ['2026-01-05', '2026-01-10'],
            ['2026-01-12', '2026-01-17'],
        ]);
    });

    it('Anchors sheet lists every anchor with Date objects', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Anchors')!;
        expect(sheet.getCell('A2').value).toBe('kickoff');
        const kickoffDate = sheet.getCell('C2').value;
        expect(kickoffDate).toBeInstanceOf(Date);
        expect((kickoffDate as Date).toISOString().slice(0, 10)).toBe('2026-01-06');
        expect(sheet.getCell('A3').value).toBe('mid-year');
    });

    it('People and Teams sheet flattens nested teams', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('People and Teams')!;
        const ids: unknown[] = [];
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            ids.push(row.getCell(1).value); // column A holds the id
        });
        expect(ids).toContain('sam');
        expect(ids).toContain('jen');
        expect(ids).toContain('eng');
        expect(ids).toContain('platform');
        expect(ids).toContain('mobile');
    });
});

describe('exportXlsx — determinism', () => {
    it('two consecutive calls with the same inputs produce identical bytes', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const a = await exportXlsx(inputs);
        const b = await exportXlsx(inputs);
        expect(sha256(a)).toBe(sha256(b));
    });

    // Guards against per-entry ZIP timestamps leaking wall-clock drift into
    // the output. Without normalization JSZip stamps every entry with
    // `new Date()`, so two calls separated by >2s differ in dozens of bytes.
    it('two calls separated by a wall-clock gap still produce identical bytes', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const a = await exportXlsx(inputs);
        await new Promise((resolve) => setTimeout(resolve, 2100));
        const b = await exportXlsx(inputs);
        expect(sha256(a)).toBe(sha256(b));
    }, 10000);
});

describe('exportXlsx — waves', () => {
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

    const OLD_ITEM_HEADERS = [
        'ID',
        'Title',
        'Swimlane',
        'Group',
        'Parallel',
        'Duration',
        'Duration (text)',
        'Start',
        'End (exclusive)',
        'Status',
        'Remaining',
        'Owner',
        'After',
        'Before',
        'Labels',
        'Link',
        'Description',
    ];

    function headersOf(sheet: ExcelJS.Worksheet): string[] {
        return (sheet.getRow(1).values as unknown as string[]).filter(Boolean);
    }

    /** Rows below the header as objects keyed by header text. */
    function rowsOf(sheet: ExcelJS.Worksheet): Array<Record<string, unknown>> {
        const headers = headersOf(sheet);
        const rows: Array<Record<string, unknown>> = [];
        sheet.eachRow((row, n) => {
            if (n === 1) return;
            const rec: Record<string, unknown> = {};
            headers.forEach((h, i) => {
                rec[h] = row.getCell(i + 1).value;
            });
            rows.push(rec);
        });
        return rows;
    }

    function iso(v: unknown): string {
        expect(v).toBeInstanceOf(Date);
        return (v as Date).toISOString().slice(0, 10);
    }

    it('adds a Wave column after Parallel with each item effective wave id', async () => {
        const wb = await readBack(await exportXlsx(await buildExportInputs(SAMPLE)));
        const items = wb.getWorksheet('Items')!;
        const headers = headersOf(items);
        expect(headers).toEqual([
            ...OLD_ITEM_HEADERS.slice(0, 5),
            'Wave',
            ...OLD_ITEM_HEADERS.slice(5),
        ]);
        const waveOf = Object.fromEntries(rowsOf(items).map((r) => [r.ID, r.Wave ?? '']));
        expect(waveOf).toEqual({
            auth: 'foundations',
            'payments-api': 'build',
            'rate-limits': 'launch',
            'ux-research': 'foundations',
            // Inherited from `group wave:build`.
            'checkout-v2': 'build',
            a11y: 'build',
            'launch-page': 'launch',
            'wallet-spike': 'foundations',
            wallet: 'build',
            'store-release': 'launch',
            // Background work.
            'on-call': '',
        });
    });

    it('appends a Waves sheet whose dates match engines A and C', async () => {
        const inputs = await buildExportInputs(SAMPLE);
        const wb = await readBack(await exportXlsx(inputs));
        expect(wb.worksheets.map((s) => s.name)).toEqual([
            'Roadmap',
            'Items',
            'Milestones',
            'Waves',
        ]);
        const sheet = wb.getWorksheet('Waves')!;
        expect(headersOf(sheet)).toEqual([
            'ID',
            'Title',
            'Order',
            'Start',
            'End (exclusive)',
            'Items',
            'Held by',
            'After',
            'Description',
        ]);
        const rows = rowsOf(sheet);
        expect(rows.map((r) => [r.ID, r.Title, r.Order, r.Items])).toEqual([
            ['foundations', 'Foundations', 1, 3],
            ['build', 'Build', 2, 4],
            ['launch', 'Launch', 3, 3],
        ]);
        expect(rows.map((r) => [iso(r.Start), iso(r['End (exclusive)'])])).toEqual([
            ['2026-01-05', '2026-02-16'],
            ['2026-02-16', '2026-04-13'],
            ['2026-04-13', '2026-05-11'],
        ]);
        expect(rows.map((r) => r['Held by'])).toEqual([
            'wallet-spike',
            'payments-api',
            'store-release',
        ]);

        const schedule = scheduleRoadmap(inputs.ast, inputs.resolved, { today: inputs.today });
        const positioned = inputs.model.waves!;
        rows.forEach((r, i) => {
            const c = schedule.waves!.get(r.ID as string)!;
            expect(r.Start).toEqual(c.start);
            expect(r['End (exclusive)']).toEqual(c.end);
            expect(r.Start).toEqual(positioned[i]!.startDate);
            expect(r['End (exclusive)']).toEqual(positioned[i]!.endDate);
        });
    });

    it('reports a start floor in After and the binding member in Held by', async () => {
        const wb = await readBack(await exportXlsx(await buildExportInputs(FLOOR_FIXTURE)));
        expect(wb.worksheets.map((s) => s.name)).toEqual([
            'Roadmap',
            'Items',
            'Milestones',
            'Anchors',
            'Waves',
        ]);
        const rows = rowsOf(wb.getWorksheet('Waves')!);
        expect(rows).toHaveLength(2);
        expect(iso(rows[0]!.Start)).toBe('2026-01-05');
        expect(iso(rows[0]!['End (exclusive)'])).toBe('2026-01-26');
        expect(rows[0]!['Held by']).toBe('b1');
        expect(rows[0]!.After ?? '').toBe('');
        // The gap: execute opens on the floor, not on plan's end.
        expect(iso(rows[1]!.Start)).toBe('2026-02-02');
        expect(iso(rows[1]!['End (exclusive)'])).toBe('2026-03-23');
        expect(rows[1]!['Held by']).toBe('b2');
        expect(rows[1]!.After).toBe('fy-budget');
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

    it('fills the Wave column for items in parallel tracks and groups', async () => {
        const wb = await readBack(await exportXlsx(await buildExportInputs(PARALLEL_FIXTURE)));
        const rows = rowsOf(wb.getWorksheet('Items')!);
        const waveOf = Object.fromEntries(rows.map((r) => [r.ID, r.Wave ?? '']));
        expect(waveOf).toEqual({
            spec: 'plan',
            api: 'build',
            ui: 'build',
            polish: 'build',
            ship: '',
            'web-a': 'build',
            'web-b': 'build',
        });
    });

    it('keeps the old columns and sheets for a roadmap without waves', async () => {
        const wb = await readBack(await exportXlsx(await buildExportInputs(FIXTURE)));
        expect(wb.worksheets.map((s) => s.name)).toEqual([
            'Roadmap',
            'Items',
            'Milestones',
            'Anchors',
            'People and Teams',
        ]);
        expect(headersOf(wb.getWorksheet('Items')!)).toEqual(OLD_ITEM_HEADERS);
    });
});
