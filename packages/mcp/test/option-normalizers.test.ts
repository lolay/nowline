// MCP tool options go through the shared normalizers (`parsePageSize`,
// `normalizeThemeName`) the CLI uses, so a bad value fails the same way on
// every export format and the theme spellings match `nowline --theme`.

import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

const SOURCE = [
    'nowline v1',
    '',
    'roadmap normalizers "Normalizers" start:2025-01-06 scale:1w',
    '',
    'swimlane lane "Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

let tmpDir: string;
let client: Client;
let serverTransport: InMemoryTransport;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-normalizers-'));
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

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

function textOf(result: ToolResult): string {
    return result.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { text: string }).text)
        .join('\n');
}

function errorOf(result: ToolResult): { code: string; message: string } {
    expect(result.isError).toBe(true);
    const payload = JSON.parse(textOf(result)) as {
        ok: boolean;
        error: { code: string; message: string };
    };
    expect(payload.ok).toBe(false);
    return payload.error;
}

function renderSvg(theme?: string): Promise<ToolResult> {
    return client.callTool({
        name: 'render',
        // `preview: false` forces the inline SVG even if a host negotiates Apps.
        arguments: { source: SOURCE, format: 'svg', now: '2025-01-08', preview: false, theme },
    });
}

describe('@nowline/mcp: pageSize validation', () => {
    it('rejects an invalid pageSize on a non-PDF export with the parser detail', async () => {
        const result = await client.callTool({
            name: 'export',
            arguments: { source: SOURCE, format: 'svg', pageSize: 'bogus' },
        });
        const error = errorOf(result);
        expect(error.code).toBe('NL.MCP.INPUT');
        expect(error.message).toContain('Invalid pageSize "bogus"');
        expect(error.message).toContain('expected preset');
    });

    it('rejects mixed-unit page sizes on html with the parser detail', async () => {
        const result = await client.callTool({
            name: 'export',
            arguments: { source: SOURCE, format: 'html', pageSize: '8inx11cm' },
        });
        expect(errorOf(result).message).toContain('mixed units');
    });

    it('accepts a valid pageSize on a non-PDF export', async () => {
        const result = await client.callTool({
            name: 'export',
            arguments: { source: SOURCE, format: 'svg', now: '2025-01-08', pageSize: 'A4' },
        });
        expect(result.isError).toBeFalsy();
    });
});

describe('@nowline/mcp: theme normalization', () => {
    it('accepts "Greyscale" and renders it as the grayscale theme', async () => {
        const greyscale = await renderSvg('Greyscale');
        expect(greyscale.isError).toBeFalsy();
        const grayscale = await renderSvg('grayscale');
        expect(textOf(greyscale)).toBe(textOf(grayscale));
        // The theme took effect: the light default draws different colors.
        expect(textOf(greyscale)).not.toBe(textOf(await renderSvg()));
    });

    it('accepts the lowercase "greyscale" alias on export', async () => {
        const result = await client.callTool({
            name: 'export',
            arguments: { source: SOURCE, format: 'svg', now: '2025-01-08', theme: 'greyscale' },
        });
        expect(result.isError).toBeFalsy();
    });

    it('rejects an unknown theme on render and lists the theme names', async () => {
        const error = errorOf(await renderSvg('neon'));
        expect(error.code).toBe('NL.MCP.INPUT');
        expect(error.message).toContain('Unknown theme "neon"');
        expect(error.message).toContain('light, dark, grayscale');
    });

    it('rejects an unknown theme on export and lists the theme names', async () => {
        const result = await client.callTool({
            name: 'export',
            arguments: { source: SOURCE, format: 'svg', theme: 'neon' },
        });
        expect(errorOf(result).message).toContain('light, dark, grayscale');
    });
});
