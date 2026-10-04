// Regression gate: a PDF export must not depend on where its source lives.
//
// The PDF exporter used to write the absolute `sourcePath` into the Info
// dict's `Subject`. The `/ID` is an MD5 over that dict and every xref offset
// shifts with the string's length, so the same roadmap exported from two
// checkouts differed byte-wise and the determinism gate's pdf goldens only
// matched at CI's checkout path. This renders the same sources through the
// kernel from two working directories of different depth and asserts the
// bytes are identical. `isolate-include` is in the set so include resolution,
// which does need the real path, is exercised too.

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDocument, type HostEnv } from '@nowline/export';
import { type ResolvedFontPair, resolveFonts } from '@nowline/export-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.resolve(HERE, '..', '..', '..', 'examples');

// Every file the fixtures below read, including include targets.
const SOURCES = ['minimal.nowline', 'isolate-include.nowline', 'partner.nowline'];
const FIXTURES = ['minimal.nowline', 'isolate-include.nowline'];

let tmp: string;
let dirA: string;
let dirB: string;
let fonts: ResolvedFontPair;

function hostAt(root: string): HostEnv {
    return {
        readSource: (absPath) => fs.readFile(absPath, 'utf-8'),
        readAsset: async (ref) => {
            const bytes = await fs.readFile(path.resolve(root, ref));
            return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        },
        loadWasm: () => {
            throw new Error('pdf export must not need the raster wasm');
        },
    };
}

async function pdfFrom(dir: string, file: string): Promise<Buffer> {
    const sourcePath = path.join(dir, file);
    const source = await fs.readFile(sourcePath, 'utf-8');
    const bytes = await exportDocument(
        source,
        'pdf',
        {
            sourcePath,
            today: new Date(Date.UTC(2026, 1, 9)),
            locale: 'en-US',
            theme: 'light',
            fonts,
        },
        hostAt(dir),
    );
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

beforeAll(async () => {
    const result = await resolveFonts({ headless: true });
    fonts = { sans: result.sans, mono: result.mono };
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-pdf-path-'));
    dirA = path.join(tmp, 'a');
    dirB = path.join(tmp, 'a-much-longer', 'checkout', 'location');
    for (const dir of [dirA, dirB]) {
        await fs.mkdir(dir, { recursive: true });
        for (const file of SOURCES) {
            await fs.copyFile(path.join(EXAMPLES, file), path.join(dir, file));
        }
    }
});

afterAll(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('pdf export is independent of the source directory', () => {
    for (const file of FIXTURES) {
        it(file, async () => {
            const a = await pdfFrom(dirA, file);
            const b = await pdfFrom(dirB, file);
            expect(b.equals(a), `${file}: PDF bytes changed with the checkout path`).toBe(true);
            expect(a.includes(tmp), `${file}: PDF embeds the source directory`).toBe(false);
        });
    }
});
