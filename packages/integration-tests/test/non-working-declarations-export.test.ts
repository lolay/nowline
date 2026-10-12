// The declarations reach the exporters through the one calendar
// (specs/working-calendar.md §8, §10 Example C; m2p phase 5a). A file whose
// open-ended week is Sunday to Thursday writes that week into the Mermaid
// `excludes` line and the MS Project base calendar, with no exporter change.
// The XLSX Calendar row and the dated Checkout row are in
// export-xlsx/test/non-working-declarations.test.ts, which owns `exceljs`.
//
// Dated rules move engine C's dates in every exporter. The open-ended week
// goes into the base calendar and the `excludes` line (phase 5a); a named
// closure adds an MS Project `<Exceptions>` entry and Mermaid's dated
// `excludes` (phase 5b, Example B at the bottom).

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

// Example B (specs/working-calendar.md §10): Thanksgiving inside a bar.
const EXAMPLE_B = `nowline v1

config

non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27

roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d after:checkout
`;

describe('Example B through the export kernel (phase 5b)', () => {
    it('Mermaid names the two holiday dates after the weekend', async () => {
        const md = await text(EXAMPLE_B, 'mermaid');
        expect(md).toContain('    excludes saturday, sunday, 2026-11-26, 2026-11-27');
        expect(md.match(/excludes/g)).toHaveLength(1);
        expect(md).toContain('Checkout :checkout, 2026-11-23, 5d');
        expect(md).toContain('QA :qa, after checkout, 2d');
        expect(md).toContain('Launch :milestone, launch, 2026-11-28, 0d');
        expect(md).not.toContain('Mermaid lossy export');
    });

    it('MS Project writes one Thanksgiving exception and keeps the weekend', async () => {
        const xml = await text(EXAMPLE_B, 'msproj');
        expect(xml).toContain(`      </WeekDays>
      <Exceptions>
      <Exception>
        <EnteredByOccurrences>0</EnteredByOccurrences>
        <TimePeriod>
          <FromDate>2026-11-26T00:00:00</FromDate>
          <ToDate>2026-11-27T23:59:00</ToDate>
        </TimePeriod>
        <Occurrences>1</Occurrences>
        <Name>Thanksgiving</Name>
        <Type>1</Type>
        <DayWorking>0</DayWorking>
      </Exception>
      </Exceptions>
    </Calendar>`);
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
