// Regression gate: the kernel's `json` export delegates to core's
// `serializeToJson`, but keeps its own envelope `file.uri`. The kernel parses
// from a synthetic `memory:///kernel-N.nowline` URI, so it passes the raw
// `file://${sourcePath}` string through the `uri` option. That string must
// reach the output verbatim (no percent-encoding, no `memory:` URI), since the
// determinism gate hashes these bytes.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNowlineServices, type NowlineFile, serializeToJson } from '@nowline/core';
import { exportDocument, type HostEnv } from '@nowline/export';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MINIMAL = path.resolve(HERE, '..', '..', '..', 'examples', 'minimal.nowline');

const host: HostEnv = {
    readSource: (absPath) => fs.readFile(absPath, 'utf-8'),
    readAsset: () => {
        throw new Error('json export must not read assets');
    },
    loadWasm: () => {
        throw new Error('json export must not need the raster wasm');
    },
};

async function kernelJson(source: string, sourcePath: string): Promise<string> {
    const bytes = await exportDocument(
        source,
        'json',
        { sourcePath, locale: 'en-US', theme: 'light' },
        host,
    );
    return new TextDecoder().decode(bytes);
}

describe('json export envelope', () => {
    it('writes file.uri as the raw file:// + sourcePath string', async () => {
        const source = await fs.readFile(MINIMAL, 'utf-8');
        const sourcePath = '/tmp/a dir/é#%/min imal.nowline';
        const json = await kernelJson(source, sourcePath);
        expect(json.startsWith('{\n  "$nowlineSchema": "1",\n  "file": {\n')).toBe(true);
        expect(json.endsWith('\n}')).toBe(true);
        const parsed = JSON.parse(json);
        expect(parsed.file).toEqual({ uri: `file://${sourcePath}`, source });
    });

    it('matches core serializeToJson byte-for-byte given the same uri', async () => {
        const source = await fs.readFile(MINIMAL, 'utf-8');
        const { shared } = createNowlineServices();
        const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
            source,
            URI.parse('memory:///envelope-core.nowline'),
        );
        await shared.workspace.DocumentBuilder.build([doc], { validation: true });
        const expected = JSON.stringify(
            serializeToJson(doc, source, { uri: `file://${MINIMAL}` }),
            null,
            2,
        );
        expect(await kernelJson(source, MINIMAL)).toBe(expected);
    });
});
