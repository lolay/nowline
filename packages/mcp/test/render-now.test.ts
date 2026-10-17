// An omitted `now` is today's civil date in the `timezone` argument's zone, or
// the local zone, not UTC (specs/surface-options.md §7, decision 2). The
// roadmap has no `start:`, so its axis starts on the now-line date and the
// picture shows which date was chosen. `calendar:full` keeps every day a
// working day: under `calendar:business` a Saturday and a Sunday both start
// the axis on Monday, and the two zones below rendered alike every weekend.

import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

const SOURCE = [
    'nowline v1',
    '',
    'roadmap nows "Nows" scale:1w calendar:full',
    '',
    'swimlane lane "Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

let tmpDir: string;
let client: Client;
let serverTransport: InMemoryTransport;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-now-'));
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

function call(name: 'render' | 'export' | 'validate', extra: Record<string, unknown>) {
    const base: Record<string, unknown> = { source: SOURCE };
    if (name === 'render') Object.assign(base, { format: 'svg', preview: false });
    if (name === 'export') Object.assign(base, { format: 'svg' });
    return client.callTool({ name, arguments: { ...base, ...extra } });
}

function text(result: Awaited<ReturnType<typeof call>>): string {
    return result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
}

describe('@nowline/mcp: default now', () => {
    it('draws the now-line at the date in the timezone argument', async () => {
        // 26 hours apart, so the two zones never share a civil date.
        const east = await call('render', { timezone: '+14:00' });
        const west = await call('render', { timezone: '-12:00' });
        expect(east.isError).toBeFalsy();
        expect(west.isError).toBeFalsy();
        expect(text(east)).not.toBe(text(west));
    });

    it('lets an explicit now win over the timezone', async () => {
        const east = await call('render', { now: '2025-01-08', timezone: '+14:00' });
        const west = await call('render', { now: '2025-01-08', timezone: '-12:00' });
        expect(text(east)).toBe(text(west));
    });

    it('rejects an unknown timezone as an input error on render, export and validate', async () => {
        for (const name of ['render', 'export', 'validate'] as const) {
            const result = await call(name, { timezone: 'Mars/Olympus' });
            expect(result.isError, name).toBe(true);
            const { error } = JSON.parse(text(result)) as {
                error: { code: string; message: string };
            };
            expect(error.code).toBe('NL.MCP.INPUT');
            expect(error.message).toContain('Invalid timezone');
        }
    });

    it('accepts now and timezone on validate', async () => {
        const result = await call('validate', { now: '2025-01-08', timezone: 'UTC' });
        expect(result.isError).toBeFalsy();
    });
});
