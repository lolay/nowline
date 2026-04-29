import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { exportXlsx } from '../src/index.js';
import { durationToWorkingDays } from '../src/duration.js';
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

    it('contains all five sheets in the documented order', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const names = wb.worksheets.map((s) => s.name);
        expect(names).toEqual(['Roadmap', 'Items', 'Milestones', 'Anchors', 'People and Teams']);
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
        let labelsValue: unknown = undefined;
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
    it('Milestones sheet captures id + date + depends', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Milestones')!;
        expect(sheet.getCell('A2').value).toBe('done');
        expect(sheet.getCell('C2').value).toBe('2026-12-15');
        expect(sheet.getCell('D2').value).toBe('auth; api-v2');
    });

    it('Anchors sheet lists every anchor', async () => {
        const inputs = await buildExportInputs(FIXTURE, { today: PINNED_DATE });
        const xlsx = await exportXlsx(inputs);
        const wb = await readBack(xlsx);
        const sheet = wb.getWorksheet('Anchors')!;
        expect(sheet.getCell('A2').value).toBe('kickoff');
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
