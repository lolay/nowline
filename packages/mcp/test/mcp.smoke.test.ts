// In-process MCP server tests for @nowline/mcp.
//
// Tests use an InMemoryTransport pair so every tool, resource, and prompt
// is exercised via the real JSON-RPC protocol without spawning a subprocess.
// A separate suite uses direct @nowline/export calls to assert byte-identity
// (the export-determinism spec: same source + inputs → same bytes from the
// MCP render tool and the kernel).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NOWLINE_MCP_ICONS } from '../src/branding.js';
import { createMcpServer, PREVIEW_UI_URI } from '../src/server.js';
import { parsePreviewFromArguments, parsePreviewFromContent } from '../src/ui/payload.js';

// ---- Fixtures ---------------------------------------------------------------

// Minimal valid .nowline source (matches DSL grammar from examples/minimal.nowline).
const MINIMAL = [
    'nowline v1',
    '',
    'roadmap smoke-test "Smoke Test" start:2025-01-06 scale:1w',
    '',
    'swimlane test-lane "Test Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

// Source with invalid tokens — guaranteed to produce lexer errors.
const INVALID_SOURCE = 'nowline v1\n\n@@@@';

const NO_SWIMLANE = ['nowline v1', '', 'roadmap r "Title" start:2026-01-05'].join('\n');

const ITEM_NO_DURATION = [
    'nowline v1',
    '',
    'roadmap r "Title" start:2026-01-05',
    '',
    'swimlane eng "Engineering"',
    '  item build "Build"',
].join('\n');

// ---- Shared client/server setup ---------------------------------------------

let tmpDir: string;
let client: Client;
let serverTransport: InMemoryTransport;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-test-'));
    writeFileSync(path.join(tmpDir, 'smoke.nowline'), MINIMAL, 'utf-8');
    mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'sub', 'nested.nowline'), MINIMAL, 'utf-8');

    const server = createMcpServer({ allowedRoot: tmpDir });
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
});

afterAll(async () => {
    try {
        await clientTransport.close();
    } catch {
        /* best-effort */
    }
    try {
        await serverTransport.close();
    } catch {
        /* best-effort */
    }
    try {
        rmSync(tmpDir, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});

// ---- Tool list + annotations ------------------------------------------------

describe('@nowline/mcp — server branding', () => {
    it('initialize response includes serverInfo.icons', async () => {
        const serverInfo = client.getServerVersion();
        expect(serverInfo?.icons).toBeDefined();
        expect(serverInfo!.icons!.length).toBeGreaterThanOrEqual(1);
        const png = serverInfo!.icons!.find((i) => i.mimeType === 'image/png');
        expect(png?.src).toMatch(/^data:image\/png;base64,/);
        expect(png?.sizes).toContain('128x128');
        expect(NOWLINE_MCP_ICONS[0].src).toBe(png?.src);
    });
});

describe('@nowline/mcp — tool list and annotations', () => {
    it('lists the expected set of tools', async () => {
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual(
            [
                'capabilities',
                'convert',
                'create',
                'delete',
                'examples',
                'export',
                'list',
                'list-formats',
                'list-icons',
                'list-locales',
                'list-templates',
                'list-themes',
                'read',
                'reference',
                'render',
                'schema',
                'update',
                'validate',
            ].sort(),
        );
    });

    it('read-only tools carry readOnlyHint + idempotentHint + title + openWorldHint', async () => {
        const { tools } = await client.listTools();
        const readOnly = [
            'validate',
            'read',
            'list',
            'render',
            'export',
            'convert',
            'capabilities',
        ];
        for (const name of readOnly) {
            const tool = tools.find((t) => t.name === name);
            expect(tool, `tool ${name} missing`).toBeDefined();
            expect(tool!.annotations?.readOnlyHint, `${name} readOnlyHint`).toBe(true);
            expect(tool!.annotations?.idempotentHint, `${name} idempotentHint`).toBe(true);
            expect(typeof tool!.annotations?.title, `${name} title`).toBe('string');
            expect(tool!.annotations!.title!.length, `${name} title`).toBeGreaterThan(0);
            expect(tool!.annotations?.openWorldHint, `${name} openWorldHint`).toBe(false);
        }
    });

    it('list-* tools carry readOnlyHint + idempotentHint + title + openWorldHint', async () => {
        const { tools } = await client.listTools();
        const listTools = [
            'list-themes',
            'list-icons',
            'list-locales',
            'list-formats',
            'list-templates',
        ];
        for (const name of listTools) {
            const tool = tools.find((t) => t.name === name);
            expect(tool, `tool ${name} missing`).toBeDefined();
            expect(tool!.annotations?.readOnlyHint, `${name} readOnlyHint`).toBe(true);
            expect(tool!.annotations?.idempotentHint, `${name} idempotentHint`).toBe(true);
            expect(typeof tool!.annotations?.title, `${name} title`).toBe('string');
            expect(tool!.annotations!.title!.length, `${name} title`).toBeGreaterThan(0);
            expect(tool!.annotations?.openWorldHint, `${name} openWorldHint`).toBe(false);
        }
    });

    it('discovery tools carry title + openWorldHint', async () => {
        const { tools } = await client.listTools();
        for (const name of ['reference', 'examples', 'schema']) {
            const tool = tools.find((t) => t.name === name);
            expect(tool, `tool ${name} missing`).toBeDefined();
            expect(typeof tool!.annotations?.title, `${name} title`).toBe('string');
            expect(tool!.annotations!.title!.length, `${name} title`).toBeGreaterThan(0);
            expect(tool!.annotations?.openWorldHint, `${name} openWorldHint`).toBe(false);
        }
    });

    it('create carries destructiveHint + idempotentHint + title + openWorldHint', async () => {
        const { tools } = await client.listTools();
        const create = tools.find((t) => t.name === 'create');
        expect(create).toBeDefined();
        expect(create!.annotations?.destructiveHint).toBe(true);
        expect(create!.annotations?.idempotentHint).toBe(true);
        expect(create!.annotations?.title).toBe('Create Roadmap');
        expect(create!.annotations?.openWorldHint).toBe(false);
    });

    it('delete carries destructiveHint + title + openWorldHint', async () => {
        const { tools } = await client.listTools();
        const del = tools.find((t) => t.name === 'delete');
        expect(del).toBeDefined();
        expect(del!.annotations?.destructiveHint).toBe(true);
        expect(del!.annotations?.title).toBe('Delete Roadmap');
        expect(del!.annotations?.openWorldHint).toBe(false);
    });

    it('update carries destructiveHint + idempotentHint + title + openWorldHint', async () => {
        const { tools } = await client.listTools();
        const update = tools.find((t) => t.name === 'update');
        expect(update).toBeDefined();
        expect(update!.annotations?.destructiveHint).toBe(true);
        expect(update!.annotations?.idempotentHint).toBe(true);
        expect(update!.annotations?.title).toBe('Update Roadmap');
        expect(update!.annotations?.openWorldHint).toBe(false);
    });

    it('tools declare an outputSchema', async () => {
        const { tools } = await client.listTools();
        for (const tool of tools) {
            expect(tool.outputSchema, `${tool.name} missing outputSchema`).toBeDefined();
        }
    });

    it('render declares MCP Apps _meta.ui.resourceUri and openai/outputTemplate alias', async () => {
        const { tools } = await client.listTools();
        const render = tools.find((t) => t.name === 'render');
        expect(render).toBeDefined();
        const meta = render!._meta as Record<string, unknown>;
        const ui = meta.ui as { resourceUri?: string } | undefined;
        expect(ui?.resourceUri).toBe(PREVIEW_UI_URI);
        expect(meta['openai/outputTemplate']).toBe(PREVIEW_UI_URI);
    });

    it('resources declare a human-readable title', async () => {
        const { resources } = await client.listResources();
        for (const resource of resources) {
            expect(typeof resource.title, `${resource.uri} title`).toBe('string');
            expect(resource.title!.length, `${resource.uri} title`).toBeGreaterThan(0);
        }
    });

    it('prompts declare a human-readable title', async () => {
        const { prompts } = await client.listPrompts();
        for (const prompt of prompts) {
            expect(typeof prompt.title, `${prompt.name} title`).toBe('string');
            expect(prompt.title!.length, `${prompt.name} title`).toBeGreaterThan(0);
        }
    });
});

// ---- structured path / fs errors --------------------------------------------

describe('@nowline/mcp — structured path and fs errors', () => {
    function errorPayload(result: Awaited<ReturnType<Client['callTool']>>) {
        const textBlock = result.content.find((c) => c.type === 'text') as
            | { type: 'text'; text: string }
            | undefined;
        expect(textBlock).toBeDefined();
        return JSON.parse(textBlock!.text) as {
            ok: boolean;
            error: { code: string; message: string };
        };
    }

    it('read on a missing path returns isError with NL.MCP.NOT_FOUND', async () => {
        const result = await client.callTool({
            name: 'read',
            arguments: { path: 'missing.nowline' },
        });
        expect(result.isError).toBe(true);
        const payload = errorPayload(result);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe('NL.MCP.NOT_FOUND');
    });

    it('read on a path outside the allowed root returns isError with NL.MCP.OUT_OF_ROOT', async () => {
        const result = await client.callTool({
            name: 'read',
            arguments: { path: path.join('..', 'outside-root.nowline') },
        });
        expect(result.isError).toBe(true);
        const payload = errorPayload(result);
        expect(payload.error.code).toBe('NL.MCP.OUT_OF_ROOT');
    });

    it('delete on a missing path returns isError with NL.MCP.NOT_FOUND', async () => {
        const result = await client.callTool({
            name: 'delete',
            arguments: { path: 'missing.nowline' },
        });
        expect(result.isError).toBe(true);
        const payload = errorPayload(result);
        expect(payload.error.code).toBe('NL.MCP.NOT_FOUND');
    });

    it('delete on a path outside the allowed root returns isError with NL.MCP.OUT_OF_ROOT', async () => {
        const result = await client.callTool({
            name: 'delete',
            arguments: { path: path.join('..', 'outside-root.nowline') },
        });
        expect(result.isError).toBe(true);
        const payload = errorPayload(result);
        expect(payload.error.code).toBe('NL.MCP.OUT_OF_ROOT');
    });
});

// ---- validate ---------------------------------------------------------------

describe('@nowline/mcp — validate', () => {
    it('returns ok=true + empty diagnostics for valid source', async () => {
        const result = await client.callTool({ name: 'validate', arguments: { source: MINIMAL } });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as { ok: boolean; diagnostics: unknown[] };
        expect(structured.ok).toBe(true);
        expect(structured.diagnostics).toEqual([]);
    });

    it('returns ok=false + diagnostics for invalid source', async () => {
        const result = await client.callTool({
            name: 'validate',
            arguments: { source: INVALID_SOURCE },
        });
        const structured = result.structuredContent as { ok: boolean; diagnostics: unknown[] };
        expect(structured.ok).toBe(false);
        expect(structured.diagnostics.length).toBeGreaterThan(0);
    });

    it('returns NL.E0004 for swimlane-less source', async () => {
        const result = await client.callTool({
            name: 'validate',
            arguments: { source: NO_SWIMLANE },
        });
        const structured = result.structuredContent as {
            ok: boolean;
            diagnostics: Array<{ code: string }>;
        };
        expect(structured.diagnostics.some((d) => d.code === 'NL.E0004')).toBe(true);
    });

    it('returns NL.E0600 for item without duration or size', async () => {
        const result = await client.callTool({
            name: 'validate',
            arguments: { source: ITEM_NO_DURATION },
        });
        const structured = result.structuredContent as {
            diagnostics: Array<{ code: string }>;
        };
        expect(structured.diagnostics.some((d) => d.code === 'NL.E0600')).toBe(true);
    });

    it('structuredContent matches text content', async () => {
        const result = await client.callTool({ name: 'validate', arguments: { source: MINIMAL } });
        const textBlock = result.content.find((c) => c.type === 'text') as
            | { type: 'text'; text: string }
            | undefined;
        expect(textBlock).toBeDefined();
        const fromText = JSON.parse(textBlock!.text) as { ok: boolean; diagnostics: unknown[] };
        const structured = result.structuredContent as typeof fromText;
        expect(structured.ok).toBe(fromText.ok);
        expect(structured.diagnostics).toEqual(fromText.diagnostics);
    });
});

// ---- render/export validation errors ----------------------------------------

describe('@nowline/mcp — render/export structured errors', () => {
    it('render returns isError with structured diagnostics on invalid source', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { source: INVALID_SOURCE, format: 'svg', now: '2025-01-15' },
        });
        expect(result.isError).toBe(true);
        const textBlock = result.content.find((c) => c.type === 'text') as
            | { type: 'text'; text: string }
            | undefined;
        expect(textBlock).toBeDefined();
        const parsed = JSON.parse(textBlock!.text) as {
            ok: boolean;
            diagnostics: Array<{ code: string }>;
        };
        expect(parsed.ok).toBe(false);
        expect(parsed.diagnostics.length).toBeGreaterThan(0);
        expect(parsed.diagnostics[0].code).not.toBe('unknown');
    });

    it('export returns isError with structured diagnostics on invalid source', async () => {
        const result = await client.callTool({
            name: 'export',
            arguments: { source: INVALID_SOURCE, format: 'html' },
        });
        expect(result.isError).toBe(true);
        const textBlock = result.content.find((c) => c.type === 'text') as
            | { type: 'text'; text: string }
            | undefined;
        expect(textBlock).toBeDefined();
        const parsed = JSON.parse(textBlock!.text) as { ok: boolean; diagnostics: unknown[] };
        expect(parsed.ok).toBe(false);
        expect(parsed.diagnostics.length).toBeGreaterThan(0);
    });

    function errorPayload(result: Awaited<ReturnType<Client['callTool']>>) {
        const textBlock = result.content.find((c) => c.type === 'text') as
            | { type: 'text'; text: string }
            | undefined;
        expect(textBlock).toBeDefined();
        return JSON.parse(textBlock!.text) as {
            ok: boolean;
            error: { code: string; message: string };
        };
    }

    it('render with an out-of-root output returns OUT_OF_ROOT naming the output path', async () => {
        const outside = path.join('..', 'escape.svg');
        const result = await client.callTool({
            name: 'render',
            arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15', output: outside },
        });
        expect(result.isError).toBe(true);
        const payload = errorPayload(result);
        expect(payload.error.code).toBe('NL.MCP.OUT_OF_ROOT');
        // The guard must reference the offending output path, not the input.
        expect(payload.error.message).toContain('escape.svg');
    });

    it('export with an out-of-root output returns OUT_OF_ROOT naming the output path', async () => {
        const outside = path.join('..', 'escape.pdf');
        const result = await client.callTool({
            name: 'export',
            arguments: { source: MINIMAL, format: 'pdf', output: outside },
        });
        expect(result.isError).toBe(true);
        const payload = errorPayload(result);
        expect(payload.error.code).toBe('NL.MCP.OUT_OF_ROOT');
        expect(payload.error.message).toContain('escape.pdf');
    });
});

// ---- discovery tools --------------------------------------------------------

describe('@nowline/mcp — discovery tools', () => {
    it('reference returns non-empty text for condensed and full', async () => {
        for (const format of ['condensed', 'full'] as const) {
            const result = await client.callTool({
                name: 'reference',
                arguments: { format },
            });
            expect(result.isError).toBeFalsy();
            const structured = result.structuredContent as { format: string; text: string };
            expect(structured.format).toBe(format);
            expect(structured.text.length).toBeGreaterThan(50);
        }
    });

    it('examples returns catalog without name and specific source by name', async () => {
        const catalog = await client.callTool({ name: 'examples', arguments: {} });
        expect(catalog.isError).toBeFalsy();
        const cat = catalog.structuredContent as { names: string[]; source: string };
        expect(cat.names.length).toBeGreaterThan(0);
        expect(cat.source).toContain('nowline v1');

        const named = await client.callTool({
            name: 'examples',
            arguments: { name: 'minimal' },
        });
        expect(named.isError).toBeFalsy();
        const one = named.structuredContent as { name: string; source: string };
        expect(one.name).toBe('minimal');
        expect(one.source).toContain('nowline v1');
    });

    it('schema returns expected key slices', async () => {
        const result = await client.callTool({ name: 'schema', arguments: {} });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as {
            directiveKeys: string[];
            entityTypes: string[];
            itemPropertyKeys: string[];
        };
        expect(structured.directiveKeys).toContain('start');
        expect(structured.entityTypes).toContain('swimlane');
        expect(structured.itemPropertyKeys).toContain('duration');
    });
});

// ---- render review + insights -----------------------------------------------

describe('@nowline/mcp — render review and insights', () => {
    it('render with review:true adds a review nudge on valid source', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15', review: true },
        });
        expect(result.isError).toBeFalsy();
        const textBlock = result.content.find(
            (c) => c.type === 'text' && 'text' in c && c.text.includes('Review this raster'),
        );
        expect(textBlock).toBeDefined();
    });

    it('validate on valid source can return insights and hint for spill-prone source', async () => {
        const longTitle = [
            'nowline v1',
            '',
            'roadmap r "R" start:2026-01-05 scale:1w',
            '',
            'swimlane eng "Engineering"',
            '  item x "This title is far too long to fit inside a one-week bar" duration:1w',
        ].join('\n');
        const result = await client.callTool({
            name: 'validate',
            arguments: { source: longTitle },
        });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as {
            ok: boolean;
            insights?: Array<{ code: string }>;
        };
        expect(structured.ok).toBe(true);
        expect(structured.insights?.some((i) => i.code === 'NL.I1000')).toBe(true);
        const hintBlock = result.content.find(
            (c) => c.type === 'text' && 'text' in c && c.text.includes('review:true'),
        );
        expect(hintBlock).toBeDefined();
    });
});

// ---- create / update validation gating -------------------------------------

describe('@nowline/mcp — create/update validation gating', () => {
    it('create rejects invalid source with isError=true', async () => {
        const result = await client.callTool({
            name: 'create',
            arguments: { path: 'bad.nowline', source: INVALID_SOURCE },
        });
        expect(result.isError).toBe(true);
    });

    it('create writes a valid file', async () => {
        const result = await client.callTool({
            name: 'create',
            arguments: { path: 'created.nowline', source: MINIMAL },
        });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as { ok: boolean; path: string };
        expect(structured.ok).toBe(true);
        expect(structured.path).toContain('created.nowline');
    });

    it('update rejects invalid source with isError=true', async () => {
        const result = await client.callTool({
            name: 'update',
            arguments: { path: 'smoke.nowline', source: INVALID_SOURCE },
        });
        expect(result.isError).toBe(true);
    });

    it('update accepts valid source', async () => {
        const result = await client.callTool({
            name: 'update',
            arguments: { path: 'smoke.nowline', source: MINIMAL },
        });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as { ok: boolean; path: string };
        expect(structured.ok).toBe(true);
    });
});

// ---- convert round-trip -----------------------------------------------------

describe('@nowline/mcp — convert round-trip', () => {
    it('convert to:json returns a JSON string with AST structure', async () => {
        const result = await client.callTool({
            name: 'convert',
            arguments: { source: MINIMAL, to: 'json' },
        });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as { to: string; result: string };
        expect(structured.to).toBe('json');
        const parsed = JSON.parse(structured.result) as Record<string, unknown>;
        expect(typeof parsed).toBe('object');
    });

    it('convert to:json then to:nowline round-trips without error', async () => {
        const toJson = await client.callTool({
            name: 'convert',
            arguments: { source: MINIMAL, to: 'json' },
        });
        const jsonResult = (toJson.structuredContent as { to: string; result: string }).result;

        const toNowline = await client.callTool({
            name: 'convert',
            arguments: { source: jsonResult, to: 'nowline' },
        });
        expect(toNowline.isError).toBeFalsy();
        const structured = toNowline.structuredContent as { to: string; result: string };
        expect(structured.to).toBe('nowline');
        expect(structured.result).toContain('nowline v1');
        expect(structured.result).toContain('roadmap');
    });
});

// ---- capabilities + list-* --------------------------------------------------

describe('@nowline/mcp — capabilities', () => {
    it('returns all five capability slices', async () => {
        const result = await client.callTool({ name: 'capabilities', arguments: {} });
        expect(result.isError).toBeFalsy();
        const structured = result.structuredContent as {
            themes: string[];
            icons: string[];
            locales: string[];
            formats: string[];
            templates: string[];
        };
        expect(Array.isArray(structured.themes)).toBe(true);
        expect(Array.isArray(structured.icons)).toBe(true);
        expect(Array.isArray(structured.locales)).toBe(true);
        expect(Array.isArray(structured.formats)).toBe(true);
        expect(Array.isArray(structured.templates)).toBe(true);
    });

    it('themes includes light, dark, grayscale', async () => {
        const result = await client.callTool({ name: 'capabilities', arguments: {} });
        const structured = result.structuredContent as { themes: string[] };
        expect(structured.themes).toContain('light');
        expect(structured.themes).toContain('dark');
        expect(structured.themes).toContain('grayscale');
    });

    it('formats includes all eight export formats', async () => {
        const result = await client.callTool({ name: 'capabilities', arguments: {} });
        const structured = result.structuredContent as { formats: string[] };
        for (const fmt of ['svg', 'png', 'pdf', 'html', 'mermaid', 'xlsx', 'msproj', 'json']) {
            expect(structured.formats, `format ${fmt}`).toContain(fmt);
        }
    });

    it('list-themes matches capabilities.themes', async () => {
        const [capResult, listResult] = await Promise.all([
            client.callTool({ name: 'capabilities', arguments: {} }),
            client.callTool({ name: 'list-themes', arguments: {} }),
        ]);
        const caps = capResult.structuredContent as { themes: string[] };
        const list = listResult.structuredContent as { items: string[] };
        expect(list.items).toEqual(caps.themes);
    });

    it('list-icons matches capabilities.icons', async () => {
        const [capResult, listResult] = await Promise.all([
            client.callTool({ name: 'capabilities', arguments: {} }),
            client.callTool({ name: 'list-icons', arguments: {} }),
        ]);
        const caps = capResult.structuredContent as { icons: string[] };
        const list = listResult.structuredContent as { items: string[] };
        expect(list.items).toEqual(caps.icons);
    });

    it('list-locales matches capabilities.locales', async () => {
        const [capResult, listResult] = await Promise.all([
            client.callTool({ name: 'capabilities', arguments: {} }),
            client.callTool({ name: 'list-locales', arguments: {} }),
        ]);
        const caps = capResult.structuredContent as { locales: string[] };
        const list = listResult.structuredContent as { items: string[] };
        expect(list.items).toEqual(caps.locales);
    });

    it('list-formats matches capabilities.formats', async () => {
        const [capResult, listResult] = await Promise.all([
            client.callTool({ name: 'capabilities', arguments: {} }),
            client.callTool({ name: 'list-formats', arguments: {} }),
        ]);
        const caps = capResult.structuredContent as { formats: string[] };
        const list = listResult.structuredContent as { items: string[] };
        expect(list.items).toEqual(caps.formats);
    });

    it('list-templates matches capabilities.templates', async () => {
        const [capResult, listResult] = await Promise.all([
            client.callTool({ name: 'capabilities', arguments: {} }),
            client.callTool({ name: 'list-templates', arguments: {} }),
        ]);
        const caps = capResult.structuredContent as { templates: string[] };
        const list = listResult.structuredContent as { items: string[] };
        expect(list.items).toEqual(caps.templates);
    });
});

// ---- prompts list/get -------------------------------------------------------

describe('@nowline/mcp — prompts', () => {
    it('lists three prompts', async () => {
        const { prompts } = await client.listPrompts();
        const names = prompts.map((p) => p.name).sort();
        expect(names).toEqual(['convert-to-nowline', 'create-roadmap', 'fix-diagnostics']);
    });

    it('create-roadmap prompt returns messages with resource + text', async () => {
        const result = await client.getPrompt({
            name: 'create-roadmap',
            arguments: { description: 'Q3 platform migration roadmap' },
        });
        expect(result.messages.length).toBeGreaterThanOrEqual(2);
        const resourceMsg = result.messages.find((m) => m.content.type === 'resource');
        expect(resourceMsg).toBeDefined();
    });

    it('fix-diagnostics prompt includes source in user message text', async () => {
        const result = await client.getPrompt({
            name: 'fix-diagnostics',
            arguments: { source: MINIMAL },
        });
        const textMsgs = result.messages.filter((m) => m.content.type === 'text');
        const combined = textMsgs
            .map((m) => (m.content as { type: 'text'; text: string }).text)
            .join('');
        expect(combined).toContain(MINIMAL);
    });

    it('convert-to-nowline prompt with from arg includes format hint', async () => {
        const result = await client.getPrompt({
            name: 'convert-to-nowline',
            arguments: {
                source: 'gantt\nsection A\n  Task1: 2024-01-01, 7d',
                from: 'mermaid-gantt',
            },
        });
        const textMsgs = result.messages.filter((m) => m.content.type === 'text');
        const combined = textMsgs
            .map((m) => (m.content as { type: 'text'; text: string }).text)
            .join('');
        expect(combined).toContain('mermaid-gantt');
    });
});

// ---- resources --------------------------------------------------------------

describe('@nowline/mcp — resources', () => {
    it('lists reference, examples, conversions, and preview UI resources', async () => {
        const { resources } = await client.listResources();
        const uris = resources.map((r) => r.uri);
        expect(uris).toContain('nowline://reference');
        expect(uris).toContain('nowline://examples');
        expect(uris).toContain('nowline://conversions');
        expect(uris).toContain(PREVIEW_UI_URI);
        const preview = resources.find((r) => r.uri === PREVIEW_UI_URI);
        expect(preview?.mimeType).toBe('text/html;profile=mcp-app');
    });

    it('nowline://reference returns non-empty text content', async () => {
        const result = await client.readResource({ uri: 'nowline://reference' });
        expect(result.contents.length).toBeGreaterThan(0);
        const text = result.contents.find((c) => 'text' in c);
        expect(text).toBeDefined();
        expect((text as { text: string }).text.length).toBeGreaterThan(100);
    });

    it('nowline://conversions returns non-empty text content', async () => {
        const result = await client.readResource({ uri: 'nowline://conversions' });
        expect(result.contents.length).toBeGreaterThan(0);
        const text = result.contents.find((c) => 'text' in c);
        expect(text).toBeDefined();
        expect((text as { text: string }).text.length).toBeGreaterThan(50);
    });

    it('nowline://examples returns at least one entry', async () => {
        const result = await client.readResource({ uri: 'nowline://examples' });
        expect(result.contents.length).toBeGreaterThan(0);
    });

    it('preview UI resource returns static HTML with the bundled script', async () => {
        const result = await client.readResource({ uri: PREVIEW_UI_URI });
        expect(result.contents.length).toBeGreaterThan(0);
        const html = result.contents.find((c) => 'text' in c) as { text: string } | undefined;
        expect(html?.text).toContain('<!doctype html>');
        expect(html?.text).toContain('id="nl-preview-root"');
        expect(html?.text).toContain('<script>');
    });
});

// ---- structuredContent shapes -----------------------------------------------

describe('@nowline/mcp — structuredContent shapes', () => {
    it('validate structuredContent has ok (boolean) + diagnostics (array)', async () => {
        const result = await client.callTool({ name: 'validate', arguments: { source: MINIMAL } });
        const sc = result.structuredContent as Record<string, unknown>;
        expect(typeof sc.ok).toBe('boolean');
        expect(Array.isArray(sc.diagnostics)).toBe(true);
    });

    it('read structuredContent has path (string) + source (string)', async () => {
        const result = await client.callTool({
            name: 'read',
            arguments: { path: 'smoke.nowline' },
        });
        const sc = result.structuredContent as Record<string, unknown>;
        expect(typeof sc.path).toBe('string');
        expect(typeof sc.source).toBe('string');
    });

    it('list structuredContent has paths (array)', async () => {
        const result = await client.callTool({ name: 'list', arguments: {} });
        const sc = result.structuredContent as Record<string, unknown>;
        expect(Array.isArray(sc.paths)).toBe(true);
    });

    it('render (svg) structuredContent has format field', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15' },
        });
        expect(result.isError).toBeFalsy();
        const sc = result.structuredContent as Record<string, unknown>;
        expect(sc.format).toBe('svg');
    });

    it('render with share=true includes shareUrl pointing to free.nowline.io/open', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15', share: true },
        });
        const sc = result.structuredContent as { format: string; shareUrl?: string };
        expect(typeof sc.shareUrl).toBe('string');
        expect(sc.shareUrl).toContain('free.nowline.io/open');
    });

    it('capabilities structuredContent has 5 array fields', async () => {
        const result = await client.callTool({ name: 'capabilities', arguments: {} });
        const sc = result.structuredContent as Record<string, unknown>;
        for (const field of ['themes', 'icons', 'locales', 'formats', 'templates']) {
            expect(Array.isArray(sc[field]), `${field} should be array`).toBe(true);
        }
    });
});

// ---- Determinism parity (export-determinism spec) ---------------------------

describe('@nowline/mcp — determinism parity', () => {
    it('render SVG via MCP equals exportDocument directly for the same inputs', async () => {
        const { exportDocument } = await import('@nowline/export');
        const fixedDate = '2025-01-15';
        const today = new Date(`${fixedDate}T00:00:00Z`);
        const dummyPath = path.join(tmpDir, 'unnamed.nowline');

        // Direct kernel call
        const host = {
            async readSource(p: string): Promise<string> {
                const { readFile } = await import('node:fs/promises');
                return readFile(p, 'utf-8');
            },
            async readAsset(ref: string): Promise<Uint8Array> {
                const { readFile } = await import('node:fs/promises');
                const bytes = await readFile(path.resolve(path.dirname(dummyPath), ref));
                return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            },
            async loadWasm(): Promise<ArrayBuffer> {
                throw new Error('loadWasm not needed for SVG');
            },
        };

        const directBytes = await exportDocument(
            MINIMAL,
            'svg',
            {
                sourcePath: dummyPath,
                today,
                locale: 'en-US',
                theme: 'light',
            },
            host,
        );
        const directSvg = new TextDecoder('utf-8').decode(directBytes);

        // MCP tool call
        const mcpResult = await client.callTool({
            name: 'render',
            arguments: { source: MINIMAL, format: 'svg', now: fixedDate },
        });
        expect(mcpResult.isError).toBeFalsy();
        const svgBlock = mcpResult.content.find((c) => c.type === 'text') as
            | { type: 'text'; text: string }
            | undefined;
        expect(svgBlock).toBeDefined();
        expect(svgBlock!.text).toBe(directSvg);
    });
});

// ---- MCP Apps preview (lean vs full result) ---------------------------------

const MCP_UI_EXTENSION = 'io.modelcontextprotocol/ui';

async function connectUiClient(
    uiCaps: Record<string, unknown>,
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
    const server = createMcpServer({ allowedRoot: tmpDir });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const uiClient = new Client({ name: 'ui-test-client', version: '1.0.0' });
    uiClient.registerCapabilities({ extensions: uiCaps });
    await uiClient.connect(clientTransport);
    return {
        client: uiClient,
        cleanup: async () => {
            try {
                await clientTransport.close();
            } catch {
                /* best-effort */
            }
            try {
                await serverTransport.close();
            } catch {
                /* best-effort */
            }
        },
    };
}

describe('@nowline/mcp — MCP Apps preview', () => {
    it('default client (no UI capability) returns full SVG inline', async () => {
        const result = await client.callTool({
            name: 'render',
            arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15' },
        });
        expect(result.isError).toBeFalsy();
        const svgBlock = result.content.find(
            (c) => c.type === 'text' && 'text' in c && c.text.trimStart().startsWith('<svg'),
        );
        expect(svgBlock).toBeDefined();
        const previewBlock = result.content.find(
            (c) => c.type === 'text' && 'text' in c && c.text.includes('"kind":"nowline.preview"'),
        );
        expect(previewBlock).toBeUndefined();
    });

    it('client with extensions[io.modelcontextprotocol/ui] returns lean nowline.preview JSON', async () => {
        const { client: uiClient, cleanup } = await connectUiClient({
            [MCP_UI_EXTENSION]: { mimeTypes: ['text/html;profile=mcp-app'] },
        });
        try {
            const result = await uiClient.callTool({
                name: 'render',
                arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15' },
            });
            expect(result.isError).toBeFalsy();
            const previewBlock = result.content.find(
                (c) =>
                    c.type === 'text' && 'text' in c && c.text.includes('"kind":"nowline.preview"'),
            ) as { type: 'text'; text: string } | undefined;
            expect(previewBlock).toBeDefined();
            const parsed = JSON.parse(previewBlock!.text) as {
                kind: string;
                source: string;
            };
            expect(parsed.kind).toBe('nowline.preview');
            expect(parsed.source).toBe(MINIMAL);
            const svgBlock = result.content.find(
                (c) => c.type === 'text' && 'text' in c && c.text.trimStart().startsWith('<svg'),
            );
            expect(svgBlock).toBeUndefined();
        } finally {
            await cleanup();
        }
    });

    it('client with experimental extension entry returns lean nowline.preview JSON', async () => {
        const server = createMcpServer({ allowedRoot: tmpDir });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const uiClient = new Client({ name: 'ui-test-client', version: '1.0.0' });
        uiClient.registerCapabilities({
            experimental: { [MCP_UI_EXTENSION]: { mimeTypes: ['text/html;profile=mcp-app'] } },
        });
        await uiClient.connect(clientTransport);
        try {
            const result = await uiClient.callTool({
                name: 'render',
                arguments: { source: MINIMAL, format: 'svg', now: '2025-01-15' },
            });
            expect(result.isError).toBeFalsy();
            const previewBlock = result.content.find(
                (c) =>
                    c.type === 'text' && 'text' in c && c.text.includes('"kind":"nowline.preview"'),
            );
            expect(previewBlock).toBeDefined();
            const svgBlock = result.content.find(
                (c) => c.type === 'text' && 'text' in c && c.text.trimStart().startsWith('<svg'),
            );
            expect(svgBlock).toBeUndefined();
        } finally {
            try {
                await clientTransport.close();
            } catch {
                /* best-effort */
            }
            try {
                await serverTransport.close();
            } catch {
                /* best-effort */
            }
        }
    });
});

// ---- preview widget payload extraction (ontoolinput + ontoolresult) ---------

// The in-chat widget paints from two ext-apps signals: the LLM's tool arguments
// (ontoolinput, the fast primary path mirroring the official examples) and the
// server's tool result (ontoolresult, authoritative). These pure helpers back
// both paths; the bug was the widget listening to ontoolresult only.
describe('@nowline/mcp — preview payload extraction', () => {
    it('parsePreviewFromArguments maps inline source + view options', () => {
        const payload = parsePreviewFromArguments({
            source: MINIMAL,
            theme: 'dark',
            now: '2025-01-15',
            width: 1200,
            // extra render-only args the widget ignores
            format: 'svg',
            review: true,
        });
        expect(payload).toEqual({
            source: MINIMAL,
            theme: 'dark',
            now: '2025-01-15',
            width: 1200,
            locale: 'en-US',
        });
    });

    it('parsePreviewFromArguments returns undefined for a path-only call', () => {
        // No inline `source` — the file can't be read in the iframe, so the
        // widget must wait for ontoolresult instead of rendering from input.
        expect(
            parsePreviewFromArguments({ path: 'smoke.nowline', theme: 'light' }),
        ).toBeUndefined();
        expect(parsePreviewFromArguments(undefined)).toBeUndefined();
    });

    it('parsePreviewFromArguments drops mistyped optional fields', () => {
        const payload = parsePreviewFromArguments({
            source: MINIMAL,
            theme: 42,
            width: '1200',
        });
        expect(payload).toEqual({
            source: MINIMAL,
            theme: undefined,
            now: undefined,
            width: undefined,
            locale: 'en-US',
        });
    });

    it('parsePreviewFromContent finds the lean nowline.preview block', () => {
        const lean = JSON.stringify({
            kind: 'nowline.preview',
            source: MINIMAL,
            theme: 'light',
        });
        const payload = parsePreviewFromContent([
            { type: 'text', text: 'These are layout consequences, not errors.' },
            { type: 'text', text: lean },
        ]);
        expect(payload?.kind).toBe('nowline.preview');
        expect(payload?.source).toBe(MINIMAL);
    });

    it('parsePreviewFromContent ignores non-preview and non-JSON blocks', () => {
        expect(parsePreviewFromContent(undefined)).toBeUndefined();
        expect(
            parsePreviewFromContent([
                { type: 'text', text: 'not json' },
                { type: 'text', text: JSON.stringify({ kind: 'something-else', source: 'x' }) },
            ]),
        ).toBeUndefined();
    });
});

// ---- Legacy smoke tests (kept for regression coverage) ----------------------

describe('@nowline/mcp — server creation', () => {
    it('createMcpServer() returns an McpServer instance', () => {
        const server = createMcpServer({ allowedRoot: process.cwd() });
        expect(server).toBeDefined();
        expect(typeof server.connect).toBe('function');
    });
});

describe('@nowline/mcp — resource content (generated)', () => {
    it('REFERENCE_MAN_PAGE is non-empty text', async () => {
        const { REFERENCE_MAN_PAGE } = await import('../src/generated/resources.js');
        expect(typeof REFERENCE_MAN_PAGE).toBe('string');
        expect(REFERENCE_MAN_PAGE.length).toBeGreaterThan(100);
    });

    it('EXAMPLES contains at least one entry with name and content', async () => {
        const { EXAMPLES } = await import('../src/generated/resources.js');
        expect(Array.isArray(EXAMPLES)).toBe(true);
        expect(EXAMPLES.length).toBeGreaterThan(0);
        expect(typeof EXAMPLES[0].name).toBe('string');
        expect(typeof EXAMPLES[0].content).toBe('string');
    });

    it('CONVERSIONS_GUIDE is non-empty text', async () => {
        const { CONVERSIONS_GUIDE } = await import('../src/generated/resources.js');
        expect(typeof CONVERSIONS_GUIDE).toBe('string');
        expect(CONVERSIONS_GUIDE.length).toBeGreaterThan(50);
    });
});
