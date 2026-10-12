// The XLSX reads the declarations through the file's calendar (specs/
// working-calendar.md §8, §10 Examples B and C; m2p phase 5a): the Roadmap
// sheet's Calendar row follows the open-ended week, and a holiday inside an
// item moves its exclusive End. The Mermaid and MS Project halves of Example C
// are in integration-tests/test/non-working-declarations-export.test.ts.

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportXlsx } from '../src/index.js';
import { buildExportInputs, PINNED_DATE } from './helpers.js';

const EXAMPLE_B = `nowline v1

config

non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27

roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
`;

const EXAMPLE_C = `nowline v1

config

non-working weekend "Weekend" every:[fri, sat]

roadmap r "R" start:2026-01-04 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
`;

async function readSheets(source: string): Promise<ExcelJS.Workbook> {
    const inputs = await buildExportInputs(source, { today: PINNED_DATE });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await exportXlsx(inputs)));
    return wb;
}

/** The Items sheet cell of `column` on the row whose ID is `id`. */
function itemCell(wb: ExcelJS.Workbook, id: string, column: string): ExcelJS.CellValue {
    const sheet = wb.getWorksheet('Items')!;
    const headers = sheet.getRow(1).values as unknown as string[];
    const idCol = headers.indexOf('ID');
    const col = headers.indexOf(column);
    expect(col, `column ${column}`).toBeGreaterThan(0);
    let found: ExcelJS.CellValue | undefined;
    sheet.eachRow((row, n) => {
        if (n > 1 && row.getCell(idCol).value === id) found = row.getCell(col).value;
    });
    expect(found, `row ${id}`).toBeDefined();
    return found as ExcelJS.CellValue;
}

describe('exportXlsx with declarations', () => {
    it('Example C: the Calendar row says Friday and Saturday are off', async () => {
        const wb = await readSheets(EXAMPLE_C);
        const sheet = wb.getWorksheet('Roadmap')!;
        expect(sheet.getCell('A5').value).toBe('Calendar');
        expect(sheet.getCell('B5').value).toBe(
            'business (Friday and Saturday off; 5/22/65/260 days per week/month/quarter/year)',
        );
    });

    it('Example B: the Checkout row ends 2026-12-02, exclusive, across Thanksgiving', async () => {
        const wb = await readSheets(EXAMPLE_B);
        const end = itemCell(wb, 'checkout', 'End (exclusive)');
        expect(end).toBeInstanceOf(Date);
        expect((end as Date).toISOString().slice(0, 10)).toBe('2026-12-02');
        const start = itemCell(wb, 'checkout', 'Start');
        expect((start as Date).toISOString().slice(0, 10)).toBe('2026-11-23');
    });

    it('Example B: the QA row runs 2026-12-02 to 2026-12-04', async () => {
        const wb = await readSheets(EXAMPLE_B);
        expect((itemCell(wb, 'qa', 'Start') as Date).toISOString().slice(0, 10)).toBe('2026-12-02');
        expect((itemCell(wb, 'qa', 'End (exclusive)') as Date).toISOString().slice(0, 10)).toBe(
            '2026-12-04',
        );
    });

    it('a file with no declaration keeps the Saturday and Sunday Calendar row (guard)', async () => {
        const wb = await readSheets(EXAMPLE_C.replace(/config\n\nnon-working[^\n]*\n\n/, ''));
        expect(wb.getWorksheet('Roadmap')!.getCell('B5').value).toBe(
            'business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)',
        );
    });
});
