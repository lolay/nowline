// The declarations reach the exporters through the one calendar
// (specs/working-calendar.md §8, §10 Example C; m2p phase 5a). A file whose
// open-ended week is Sunday to Thursday writes that week into the Mermaid
// `excludes` line and the MS Project base calendar, with no exporter change.
// The XLSX Calendar row and the dated Checkout row are in
// export-xlsx/test/non-working-declarations.test.ts, which owns `exceljs`.
//
// Dated rules move engine C's dates in every exporter, but the MS Project
// `<Exceptions>` and Mermaid's dated `excludes` are phase 5b, so only the
// open-ended week is asserted here.

import * as path from 'node:path';
import { exportDocument, type HostEnv, type RenderInputs } from '@nowline/export';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('/nowline-kernel');

const EXAMPLE_C = `nowline v1

config

non-working weekend "Weekend" every:[fri, sat]

roadmap r "R" start:2026-01-04 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
`;

// The same roadmap with no declaration: the business week, Monday to Friday.
const BUSINESS = EXAMPLE_C.replace(/config\n\nnon-working[^\n]*\n\n/, '');

const host: HostEnv = {
    readSource: async (absPath) => {
        throw new Error(`ENOENT: ${absPath}`);
    },
    readAsset: async () => {
        throw new Error('no assets');
    },
    loadWasm: () => {
        throw new Error('this export must not need the raster wasm');
    },
};

const inputs: RenderInputs = {
    sourcePath: path.join(ROOT, 'program.nowline'),
    today: new Date(Date.UTC(2026, 0, 5)),
    locale: 'en-US',
    theme: 'light',
};

async function text(source: string, format: 'mermaid' | 'msproj'): Promise<string> {
    const bytes = await exportDocument(source, format, inputs, host);
    return new TextDecoder().decode(bytes);
}

/** `DayType` (1 = Sunday ... 7 = Saturday) to `DayWorking` for the base calendar's weekdays. */
function weekDays(xml: string): Record<string, string> {
    const block = / {6}<WeekDays>[\s\S]*? {6}<\/WeekDays>/.exec(xml);
    expect(block, 'the base calendar <WeekDays>').not.toBeNull();
    const out: Record<string, string> = {};
    for (const day of block![0].matchAll(/<WeekDay>([\s\S]*?)<\/WeekDay>/g)) {
        const type = /<DayType>(\d)<\/DayType>/.exec(day[1])![1];
        out[type] = /<DayWorking>(\d)<\/DayWorking>/.exec(day[1])![1];
    }
    return out;
}

describe('Example C through the export kernel', () => {
    it('Mermaid excludes friday, saturday', async () => {
        const md = await text(EXAMPLE_C, 'mermaid');
        expect(md).toContain('    excludes friday, saturday');
        expect(md.match(/excludes/g)).toHaveLength(1);
        expect(md).not.toContain('excludes saturday, sunday');
    });

    it('MS Project marks Friday and Saturday non-working and Sunday working', async () => {
        const xml = await text(EXAMPLE_C, 'msproj');
        expect(weekDays(xml)).toEqual({
            '1': '1', // Sunday
            '2': '1',
            '3': '1',
            '4': '1',
            '5': '1',
            '6': '0', // Friday
            '7': '0', // Saturday
        });
    });
});

describe('the same roadmap with no declaration (guard)', () => {
    it('Mermaid keeps excludes saturday, sunday', async () => {
        const md = await text(BUSINESS, 'mermaid');
        expect(md).toContain('    excludes saturday, sunday');
    });

    it('MS Project keeps Saturday and Sunday non-working', async () => {
        const xml = await text(BUSINESS, 'msproj');
        expect(weekDays(xml)).toEqual({
            '1': '0',
            '2': '1',
            '3': '1',
            '4': '1',
            '5': '1',
            '6': '1',
            '7': '0',
        });
    });
});
