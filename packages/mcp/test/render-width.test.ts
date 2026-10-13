// `render`'s width follows the one rule every surface shares: an integer of at
// least 320, or an input error (specs/surface-options.md §7, decision 4).

import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

const SOURCE = [
    'nowline v1',
    '',
    'roadmap widths "Widths" start:2025-01-06 scale:1w',
    '',
    'swimlane lane "Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

let tmpDir: string;
let client: Client;
let serverTransport: InMemoryTransport;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-width-'));
    const server = createMcpServer({ allowedRoot: tmpDir });
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
});

afterAll(async () => {
    await clientTransport.close().catch(() => undefined);
    await serverTransport.close().catch(() => undefined);
    rmSync(tmpDir, { recursive: true, force: true });
});

function render(width: number) {
    return client.callTool({
        name: 'render',
        arguments: { source: SOURCE, format: 'svg', now: '2025-01-08', preview: false, width },
    });
}

describe('@nowline/mcp: render width', () => {
    it('rejects a width below 320 as an input error naming the rule', async () => {
        const result = await render(100);
        expect(result.isError).toBe(true);
        const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
        const { error } = JSON.parse(text) as { error: { code: string; message: string } };
        expect(error.code).toBe('NL.MCP.INPUT');
        expect(error.message).toContain('Invalid width "100"');
        expect(error.message).toContain('integer ≥ 320');
    });

    it('rejects a width that is not an integer', async () => {
        expect((await render(640.5)).isError).toBe(true);
    });

    it('renders at a valid width', async () => {
        expect((await render(800)).isError).toBeFalsy();
    });
});
