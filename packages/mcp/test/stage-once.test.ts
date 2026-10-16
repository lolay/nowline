// A tool call stages a roadmap once (specs/surface-options.md §5, counting
// tests): `diagnosticsErrorBlock`'s document is reused, the insights come from
// the staged model, and the render exports that same stage. The insights see
// the drawn header, logo included.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface StageCall {
    sourcePath: string;
    /** Whether the caller passed the document it already parsed, so nothing parses again. */
    reusedDocument: boolean;
}
const stageCalls: StageCall[] = [];

vi.mock('@nowline/export', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@nowline/export')>();
    return {
        ...actual,
        stageForExport: (...args: Parameters<typeof actual.stageForExport>) => {
            stageCalls.push({
                sourcePath: args[1].sourcePath,
                reusedDocument: args[3]?.document !== undefined,
            });
            return actual.stageForExport(...args);
        },
    };
});

const { createMcpServer } = await import('../src/server.js');

const LOGO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 40" width="800" height="40">' +
    '<rect width="800" height="40" fill="#369"/></svg>';

function roadmap(logo: boolean): string {
    const items = Array.from(
        { length: 6 },
        (_, i) => `  item i${i} "Item number ${i} with long caption" duration:1w`,
    );
    return [
        'nowline v1',
        '',
        `roadmap r "R" ${logo ? 'logo:"./logo.svg" logo-size:xl ' : ''}start:2026-01-05 scale:1w`,
        '',
        'swimlane a "A"',
        ...items,
    ].join('\n');
}

let tmpDir: string;
let client: Client;
let serverTransport: InMemoryTransport;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-stage-'));
    writeFileSync(path.join(tmpDir, 'logo.svg'), LOGO_SVG, 'utf-8');
    writeFileSync(path.join(tmpDir, 'with-logo.nowline'), roadmap(true), 'utf-8');
    writeFileSync(path.join(tmpDir, 'no-logo.nowline'), roadmap(false), 'utf-8');
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

beforeEach(() => {
    stageCalls.length = 0;
});

const file = (name: string): string => path.join(tmpDir, name);

type Insight = { code: string; entityId?: string };

async function callInsights(name: string, args: Record<string, unknown>): Promise<Insight[]> {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { insights?: Insight[] };
    return structured.insights ?? [];
}

describe('@nowline/mcp: one stage per call', () => {
    // The temp directory exists only once `beforeAll` has run.
    const base = () => ({ path: file('no-logo.nowline'), now: '2026-01-07' });

    it.each([
        ['render (svg)', 'render', { format: 'svg', preview: false }],
        ['render (preview, nothing drawn)', 'render', { preview: true }],
        ['export (html)', 'export', { format: 'html' }],
        ['export (mermaid)', 'export', { format: 'mermaid', delivery: 'inline' }],
        ['validate', 'validate', {}],
    ])('%s stages once and reuses the parsed document', async (_label, tool, extra) => {
        const result = await client.callTool({ name: tool, arguments: { ...base(), ...extra } });
        expect(result.isError).toBeFalsy();
        expect(stageCalls).toStrictEqual([
            { sourcePath: file('no-logo.nowline'), reusedDocument: true },
        ]);
    });

    it('does not stage a roadmap that fails validation', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { source: 'nowline v1\n\n@@@@', format: 'svg', preview: false },
        });
        expect(result.isError).toBe(true);
        expect(stageCalls).toHaveLength(0);
    });

    it('stages a second time only for a review at a narrower width', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { ...base(), format: 'svg', preview: false, review: true },
        });
        expect(result.isError).toBeFalsy();
        expect(stageCalls).toHaveLength(2);
        expect(stageCalls.every((c) => c.reusedDocument)).toBe(true);
    });
});

describe('@nowline/mcp: insights see the drawn header', () => {
    // A wide logo takes chrome width, so under a width cap the bars shrink and
    // each item spills its marker (NL.I1002). Insights from a logo-less layout
    // miss that. 360 px leaves the logo-less bars over the 24 px a status
    // dot needs to sit inside a bar, and the logo's bars under it.
    const narrow = { now: '2026-01-07', width: 360 };

    it('render reports the spill a logo causes, which the same file without a logo lacks', async () => {
        const args = { ...narrow, format: 'svg', preview: false };
        const withLogo = await callInsights('render', { ...args, path: file('with-logo.nowline') });
        const without = await callInsights('render', { ...args, path: file('no-logo.nowline') });
        expect(withLogo.filter((i) => i.code === 'NL.I1002').map((i) => i.entityId)).toStrictEqual([
            'i0',
            'i1',
            'i2',
            'i3',
            'i4',
            'i5',
        ]);
        expect(without.some((i) => i.code === 'NL.I1002')).toBe(false);
    });

    it('draws the logo the stage loaded in the same render', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: {
                path: file('with-logo.nowline'),
                ...narrow,
                format: 'svg',
                preview: false,
            },
        });
        expect(result.isError).toBeFalsy();
        const text = result.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
        // The drawn SVG embeds the logo the stage loaded.
        expect(text).toContain('data-layer="logo"');
    });
});
