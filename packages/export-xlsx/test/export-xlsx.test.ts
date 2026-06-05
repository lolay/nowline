import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { durationToWorkingDays } from '../src/duration.js';
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
    it('lists Roadmap title, author, scale, start, generated', async () => {
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
        expect(sheet.getCell('A5').value).toBe('Generated');
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
        expect(headers).toContain('End');
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
        // auth item: after:kickoff (2026-01-06), duration:2w (10 business days)
        //   → start 2026-01-06, end 2026-01-16
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
            if (cell.value === 'End') endCol = col;
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
                // end = start + 10 business days (2w) = 2026-01-16
                expect((end as Date).toISOString().slice(0, 10)).toBe('2026-01-16');
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
        // a starts 2026-01-06, duration 2w (10 days) → end 2026-01-16
        // milestone floats to a's end
        expect(dateVal).toBeInstanceOf(Date);
        expect((dateVal as Date).toISOString().slice(0, 10)).toBe('2026-01-16');
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

describe('durationToWorkingDays', () => {
    it.each([
        ['1d', 1],
        ['1w', 5],
        ['2w', 10],
        ['1m', 22],
        ['xs', 1],
        ['sm', 3],
        ['md', 5],
        ['lg', 10],
        ['xl', 15],
        ['', 0],
        [undefined, 0],
        ['nonsense', 0],
    ] as const)('parses %s → %d days', (input, expected) => {
        expect(durationToWorkingDays(input as string | undefined)).toBe(expected);
    });
});
