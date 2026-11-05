// The stdio MCP server is long-lived: every validate, render and export
// builds a document on a fresh URI, and the Langium workspace must not keep
// one entry per call (r1.f7).

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { langiumRetention } from '@nowline/core/internal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMcpServices } from '../src/diagnostics.js';
import { createMcpServer } from '../src/server.js';

const ROADMAP = `nowline v1

include "./shared.nowline"

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item build "Build" duration:2w
`;

const SHARED = `nowline v1

swimlane shared "Shared"
  item s1 "Shared work" duration:1w
`;

let tmpDir: string;
let client: Client;
let serverTransport: InMemoryTransport;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-retention-'));
    writeFileSync(path.join(tmpDir, 'main.nowline'), ROADMAP, 'utf-8');
    writeFileSync(path.join(tmpDir, 'shared.nowline'), SHARED, 'utf-8');
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

describe('@nowline/mcp: Langium retention', () => {
    it.each([
        ['validate', {}],
        ['render', { format: 'svg', preview: false }],
        ['export', { format: 'mermaid', delivery: 'inline' }],
    ])('%s stays constant across calls', async (tool, extra) => {
        const call = async () => {
            const result = await client.callTool({
                name: tool,
                arguments: { path: path.join(tmpDir, 'main.nowline'), now: '2026-01-07', ...extra },
            });
            expect(result.isError).toBeFalsy();
        };
        await call();
        const before = langiumRetention(getMcpServices().shared);
        for (let i = 0; i < 20; i++) await call();
        expect(langiumRetention(getMcpServices().shared)).toStrictEqual(before);
        // Only the include file, keyed by its path, stays indexed.
        expect(before.buildState).toBe(1);
    });

    it('a source that fails validation leaves nothing new behind', async () => {
        const before = langiumRetention(getMcpServices().shared);
        for (let i = 0; i < 20; i++) {
            const result = await client.callTool({
                name: 'validate',
                arguments: { source: 'nowline v1\n\n@@@@' },
            });
            expect(result.structuredContent).toBeDefined();
        }
        expect(langiumRetention(getMcpServices().shared)).toStrictEqual(before);
    });
});
