import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportXlsx } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

// `after:<dated milestone>` (r1.f8). The schedule resolved it to day 0, so
// the Items sheet started `y` the Monday after `x` (2026-01-12) while the
// chart starts it on the milestone's date (2026-03-02).

const FIXTURE = `nowline v1

roadmap r "R" start:2026-01-05

swimlane a "A"
  item x "X" duration:1w
  item y "Y" duration:1w after:gate

milestone gate "Gate" date:2026-03-02
`;

const WAVES = `nowline v1

roadmap r "R" start:2026-01-05

wave build "Build"
wave launch "Launch"

swimlane a "A"
  item x "X" duration:1w wave:build after:gate
  item y "Y" duration:1w wave:launch

milestone gate "Gate" date:2026-03-02
`;

/** The Items sheet's ID → [Start, End (exclusive)] as ISO dates. */
async function itemDates(source: string): Promise<Record<string, [string, string]>> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await exportXlsx(await buildExportInputs(source))));
    const sheet = wb.getWorksheet('Items')!;
    const col: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, n) => {
        col[String(cell.value)] = n;
    });
    const iso = (v: unknown): string => (v as Date).toISOString().slice(0, 10);
    const out: Record<string, [string, string]> = {};
    sheet.eachRow((row, n) => {
        if (n === 1) return;
        out[String(row.getCell(col.ID).value)] = [
            iso(row.getCell(col.Start).value),
            iso(row.getCell(col['End (exclusive)']).value),
        ];
    });
    return out;
}

describe('exportXlsx — after a dated milestone (r1.f8)', () => {
    it('starts the item on the milestone date', async () => {
        expect(await itemDates(FIXTURE)).toEqual({
            x: ['2026-01-05', '2026-01-10'],
            y: ['2026-03-02', '2026-03-07'],
        });
    });

    it('with waves, floors the next wave by that item', async () => {
        expect(await itemDates(WAVES)).toEqual({
            x: ['2026-03-02', '2026-03-07'],
            y: ['2026-03-09', '2026-03-14'],
        });
    });
});
