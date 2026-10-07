// The non-working display through the export kernel (specs/working-calendar.md
// §4.2, §7.5; m2p phase 4). `RenderInputs.nonWorking` is the render-time
// option every surface forwards. Precedence: the option, then the file's
// `default roadmap non-working:` key, then `hide`.
//
// Engines B and C take no display input, so the schedule and every exporter
// built on it (Mermaid, MS Project, XLSX) produce the same bytes in both views.

import * as path from 'node:path';
import { exportDocument, type HostEnv, type RenderInputs } from '@nowline/export';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve('/nowline-kernel');

const BODY = `roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
`;

const PLAIN = `nowline v1\n\n${BODY}`;
const FILE_SHOW = `nowline v1\n\nconfig\n\ndefault roadmap non-working:show\n\n${BODY}`;

const LAYER = 'data-layer="non-working"';

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

function inputs(nonWorking?: 'hide' | 'show'): RenderInputs {
    return {
        sourcePath: path.join(ROOT, 'program.nowline'),
        today: new Date(Date.UTC(2026, 0, 5)),
        locale: 'en-US',
        theme: 'light',
        ...(nonWorking === undefined ? {} : { nonWorking }),
    };
}

async function svg(source: string, nonWorking?: 'hide' | 'show'): Promise<string> {
    const bytes = await exportDocument(source, 'svg', inputs(nonWorking), host);
    return new TextDecoder().decode(bytes);
}

describe('export kernel: RenderInputs.nonWorking', () => {
    it('the option show adds the non-working layer', async () => {
        expect(await svg(PLAIN, 'show')).toContain(LAYER);
    });

    it('a file key show with no option has the layer (unset stays undefined)', async () => {
        expect(await svg(FILE_SHOW)).toContain(LAYER);
    });

    it('a file key show with the option hide has no layer', async () => {
        expect(await svg(FILE_SHOW, 'hide')).not.toContain(LAYER);
    });

    it('no key and no option stays hide, byte for byte', async () => {
        const base = await svg(PLAIN);
        expect(base).not.toContain(LAYER);
        expect(await svg(PLAIN, 'hide')).toBe(base);
    });
});

describe('export kernel: the schedule exporters ignore the display', () => {
    for (const format of ['mermaid', 'msproj', 'xlsx'] as const) {
        it(`${format} bytes are identical for show and hide`, async () => {
            const show = await exportDocument(PLAIN, format, inputs('show'), host);
            const hide = await exportDocument(PLAIN, format, inputs('hide'), host);
            expect(show.byteLength).toBeGreaterThan(0);
            expect(Buffer.from(show).equals(Buffer.from(hide))).toBe(true);
        });
    }
});
