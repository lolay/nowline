// The XLSX reads the file's calendar and engine C's durations
// (specs/working-calendar.md §8): the Duration column is the chart's own day
// count for the item, and the Roadmap sheet says which calendar produced it.
//
// Every expectation is a literal, derived by hand from the presets
// (business 5/22/65/260, full 7/30/91/365) and the custom block below
// (6/26/78/312). `(guard)` marks a case that is green before and after.

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportXlsx } from '../src/index.js';
import { buildExportInputs, PINNED_DATE } from './helpers.js';

type CalendarName = 'business' | 'full' | 'custom';

const CUSTOM_BLOCK = `config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312

`;

const HEADERS: Record<CalendarName, string> = {
    business: 'nowline v1\n\nroadmap r "R" start:2026-01-05\n',
    full: 'nowline v1\n\nroadmap r "R" start:2026-01-05 calendar:full\n',
    custom: `nowline v1\n\n${CUSTOM_BLOCK}roadmap r "R" start:2026-01-05 calendar:custom\n`,
};

function source(calendar: CalendarName, lanes: string): string {
    return `${HEADERS[calendar]}
size med effort:1w
size xl effort:1m

swimlane s "S"
${lanes}
`;
}

async function readSheets(src: string): Promise<ExcelJS.Workbook> {
    const inputs = await buildExportInputs(src, { today: PINNED_DATE });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await exportXlsx(inputs)));
    return wb;
}

/** The Items sheet as {ID, Duration, Duration (text)} rows. */
async function itemRows(
    calendar: CalendarName,
    lanes: string,
): Promise<Record<string, { duration: unknown; text: unknown }>> {
    const wb = await readSheets(source(calendar, lanes));
    const sheet = wb.getWorksheet('Items')!;
    const headers = sheet.getRow(1).values as unknown as string[];
    const col = (name: string): number => headers.indexOf(name);
    const rows: Record<string, { duration: unknown; text: unknown }> = {};
    sheet.eachRow((row, n) => {
        if (n === 1) return;
        rows[String(row.getCell(col('ID')).value)] = {
            duration: row.getCell(col('Duration')).value,
            text: row.getCell(col('Duration (text)')).value,
        };
    });
    return rows;
}

describe('exportXlsx — Duration comes from the file calendar and engine C', () => {
    it.each<[CalendarName, string, number]>([
        ['business', 'duration:1w', 5], // (guard)
        ['business', 'duration:2w', 10], // (guard)
        ['business', 'duration:1q', 65],
        ['business', 'duration:1y', 260],
        ['business', 'duration:1.5w', 7.5], // (guard)
        ['full', 'duration:1w', 7],
        ['full', 'duration:4w', 28],
        ['full', 'duration:1q', 91],
        ['full', 'duration:1y', 365],
        ['custom', 'duration:1w', 6],
        ['custom', 'duration:1q', 78],
    ])('%s calendar: %s is %s days', async (calendar, props, expected) => {
        const rows = await itemRows(calendar, `  item a "A" ${props}`);
        expect(rows.a.duration).toBe(expected);
    });

    it('a declared size takes its effort: size med effort:1w is 5 days', async () => {
        const rows = await itemRows('business', '  item a "A" size:med');
        expect(rows.a.duration).toBe(5);
    });

    it('capacity divides the effort: size xl (1m) with capacity:2 is 11 days', async () => {
        const rows = await itemRows('business', '  item a "A" size:xl capacity:2');
        expect(rows.a.duration).toBe(11);
    });

    it('size effort follows the calendar: xl with capacity:2 is 15 days on calendar:full', async () => {
        const rows = await itemRows('full', '  item a "A" size:xl capacity:2');
        expect(rows.a.duration).toBe(15);
    });

    it('an item with no size or duration is 0 days (guard)', async () => {
        const rows = await itemRows('business', '  item a "A"');
        expect(rows.a.duration).toBe(0);
    });

    it('an undeclared size is 0 days (guard)', async () => {
        const rows = await itemRows('business', '  item a "A" size:ghost');
        expect(rows.a.duration).toBe(0);
    });

    it('Duration (text) keeps the source literal (guard)', async () => {
        const rows = await itemRows(
            'business',
            '  item a "A" duration:1q\n  item b "B" size:med\n  item c "C" duration:1.5w',
        );
        expect(rows.a.text).toBe('1q');
        expect(rows.b.text).toBe('med');
        expect(rows.c.text).toBe('1.5w');
    });
});

describe('exportXlsx — Roadmap sheet Calendar row', () => {
    it.each<[CalendarName, string]>([
        [
            'business',
            'business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)',
        ],
        ['full', 'full (no days off; 7/30/91/365 days per week/month/quarter/year)'],
        ['custom', 'custom (no days off; 6/26/78/312 days per week/month/quarter/year)'],
    ])('%s calendar: B5 reads "%s"', async (calendar, expected) => {
        const wb = await readSheets(source(calendar, '  item a "A" duration:1w'));
        const sheet = wb.getWorksheet('Roadmap')!;
        expect(sheet.getCell('A5').value).toBe('Calendar');
        expect(sheet.getCell('B5').value).toBe(expected);
    });

    it('puts Calendar right after Start and moves Generated to row 6', async () => {
        const wb = await readSheets(source('business', '  item a "A" duration:1w'));
        const sheet = wb.getWorksheet('Roadmap')!;
        const labels = [1, 2, 3, 4, 5, 6].map((r) => sheet.getCell(`A${r}`).value);
        expect(labels).toEqual(['Roadmap', 'Author', 'Scale', 'Start', 'Calendar', 'Generated']);
        expect(sheet.getCell('B4').value).toBe('2026-01-05');
        expect(sheet.getCell('A7').value).toBeNull();
    });

    it('formats only the Generated cell as a date, keyed to the label', async () => {
        const wb = await readSheets(source('business', '  item a "A" duration:1w'));
        const sheet = wb.getWorksheet('Roadmap')!;
        expect(sheet.getCell('B6').value).toBeInstanceOf(Date);
        expect(sheet.getCell('B6').numFmt).toBe('yyyy-mm-dd');
        expect(sheet.getCell('B5').numFmt).not.toBe('yyyy-mm-dd');
    });

    it('labels the calendar even when the roadmap declares none: business is the default', async () => {
        const wb = await readSheets(
            'nowline v1\n\nroadmap r "R"\n\nswimlane s "S"\n  item a "A" duration:1w\n',
        );
        const sheet = wb.getWorksheet('Roadmap')!;
        expect(sheet.getCell('B5').value).toBe(
            'business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)',
        );
    });
});

describe('exportXlsx — Items End header', () => {
    it('names the exclusive end: End (exclusive), not End', async () => {
        const wb = await readSheets(source('business', '  item a "A" duration:1w'));
        const sheet = wb.getWorksheet('Items')!;
        const headers = (sheet.getRow(1).values as unknown as string[]).filter(Boolean);
        expect(headers).toContain('End (exclusive)');
        expect(headers).not.toContain('End');
        expect(headers.indexOf('End (exclusive)')).toBe(headers.indexOf('Start') + 1);
    });
});
