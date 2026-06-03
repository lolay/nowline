// @nowline/mcp server factory.
//
// Creates and configures an McpServer instance with all eight tools and two
// resources (nowline://reference + nowline://examples).  The factory is shared
// by the entry-point bin (npx @nowline/mcp) and the CLI's --mcp flag so both
// paths expose an identical surface.
//
// Spec: specs/mcp.md.  Plan: export_determinism s8 + s9.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { collectDocumentDiagnostics, createNowlineServices, type NowlineFile } from '@nowline/core';
import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
} from '@nowline/export';
import { resolveFonts } from '@nowline/export-core';
import { URI } from 'langium';
import { z } from 'zod';
import { EXAMPLES, REFERENCE_MAN_PAGE } from './generated/resources.js';

// ---- Diagnostic helpers -----------------------------------------------------

interface McpDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    code: string;
    message: string;
}

function collectMcpDiagnostics(
    doc: Awaited<ReturnType<typeof buildDocument>>,
    filePath: string,
): McpDiagnostic[] {
    const raw = collectDocumentDiagnostics(doc);
    const out: McpDiagnostic[] = [];
    for (const d of raw) {
        if (d.origin === 'lexer' || d.origin === 'parser') {
            out.push({
                file: filePath,
                line: 1,
                column: 1,
                severity: 'error',
                code: d.origin === 'lexer' ? 'lexing-error' : 'parsing-error',
                message: d.error.message,
            });
        } else {
            const diag = d.diagnostic;
            const range = diag.range;
            out.push({
                file: filePath,
                line: (range?.start.line ?? 0) + 1,
                column: (range?.start.character ?? 0) + 1,
                severity: diag.severity === 1 ? 'error' : 'warning',
                code: String(diag.code ?? 'unknown'),
                message: diag.message,
            });
        }
    }
    return out;
}

// ---- Langium services -------------------------------------------------------

let cachedServices: ReturnType<typeof createNowlineServices> | undefined;
let docCounter = 0;

function getServices() {
    if (!cachedServices) cachedServices = createNowlineServices();
    return cachedServices;
}

async function buildDocument(source: string) {
    const services = getServices();
    const uri = URI.parse(`memory:///mcp-${++docCounter}.nowline`);
    const doc = services.shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(
        source,
        uri,
    );
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
    return doc;
}

// ---- Allowed-root enforcement -----------------------------------------------

function resolveAndGuard(filePath: string, allowedRoot: string): string {
    const abs = path.resolve(allowedRoot, filePath);
    const guard = path.resolve(allowedRoot);
    if (!abs.startsWith(guard + path.sep) && abs !== guard) {
        throw new Error(`Path ${filePath} is outside the allowed root ${allowedRoot}`);
    }
    return abs;
}

// ---- Node HostEnv for export ------------------------------------------------

function createNodeHostEnv(sourcePath: string): HostEnv {
    const assetRoot = path.resolve(path.dirname(sourcePath));
    return {
        async readSource(p: string): Promise<string> {
            return fs.readFile(p, 'utf-8');
        },
        async readAsset(ref: string): Promise<Uint8Array> {
            const abs = path.resolve(assetRoot, ref);
            if (!abs.startsWith(assetRoot + path.sep) && abs !== assetRoot) {
                throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
            }
            const bytes = await fs.readFile(abs);
            return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        },
        async loadWasm(): Promise<ArrayBuffer> {
            // Resolve resvg.wasm relative to @nowline/export-png/dist/ at runtime.
            const { createRequire } = await import('node:module');
            const req = createRequire(import.meta.url);
            const entry = req.resolve('@resvg/resvg-wasm');
            const { dirname } = await import('node:path');
            const wasmPath = `${dirname(entry)}/index_bg.wasm`;
            const bytes = await fs.readFile(wasmPath);
            return bytes.buffer as ArrayBuffer;
        },
    };
}

// ---- Helpers ----------------------------------------------------------------

function todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function sourceAndPath(
    args: { source?: string; path?: string },
    allowedRoot: string,
): Promise<{ source: string; filePath: string }> {
    if (args.source !== undefined && args.path === undefined) {
        return { source: args.source, filePath: path.join(allowedRoot, 'unnamed.nowline') };
    }
    if (args.path !== undefined) {
        const abs = resolveAndGuard(args.path, allowedRoot);
        const source = args.source ?? (await fs.readFile(abs, 'utf-8'));
        return { source, filePath: abs };
    }
    throw new Error('At least one of `source` or `path` is required.');
}

// ---- Server factory ---------------------------------------------------------

export interface McpServerOptions {
    /** Working directory — all file paths are resolved relative to this root. Defaults to process.cwd(). */
    allowedRoot?: string;
    /** Server name shown in the MCP client. Defaults to 'nowline'. */
    name?: string;
    /** Server version. Defaults to package version. */
    version?: string;
}

export function createMcpServer(opts: McpServerOptions = {}): McpServer {
    const allowedRoot = opts.allowedRoot ?? process.cwd();
    const server = new McpServer({
        name: opts.name ?? 'nowline',
        version: opts.version ?? '0.5.1',
    });

    // ---- Resources ----------------------------------------------------------

    server.registerResource(
        'nowline-reference',
        'nowline://reference',
        {
            description:
                'Full DSL reference (nowline.5 man page): syntax, directives, and examples.',
            mimeType: 'text/plain',
        },
        async () => ({
            contents: [
                { uri: 'nowline://reference', text: REFERENCE_MAN_PAGE, mimeType: 'text/plain' },
            ],
        }),
    );

    server.registerResource(
        'nowline-examples',
        'nowline://examples',
        {
            description: 'Canonical example .nowline files from the official examples/ directory.',
            mimeType: 'text/plain',
        },
        async () => ({
            contents: EXAMPLES.map((ex) => ({
                uri: `nowline://examples/${ex.name}`,
                text: `# ${ex.name}\n\n${ex.content}`,
                mimeType: 'text/plain',
            })),
        }),
    );

    // ---- validate -----------------------------------------------------------

    server.registerTool(
        'validate',
        {
            description:
                'Parse and validate a .nowline roadmap. Returns ok=true and an empty diagnostics array if valid, or ok=false with structured diagnostics.',
            inputSchema: z.object({
                source: z.string().optional().describe('Inline .nowline source text to validate.'),
                path: z
                    .string()
                    .optional()
                    .describe('Absolute or relative path to a .nowline file to validate.'),
            }),
        },
        async (args) => {
            const { source, filePath } = await sourceAndPath(args, allowedRoot);
            const doc = await buildDocument(source);
            const diagnostics = collectMcpDiagnostics(doc, filePath);
            const ok = diagnostics.every((d) => d.severity !== 'error');
            return {
                content: [{ type: 'text', text: JSON.stringify({ ok, diagnostics }, null, 2) }],
            };
        },
    );

    // ---- read ---------------------------------------------------------------

    server.registerTool(
        'read',
        {
            description: 'Read a local .nowline file.',
            inputSchema: z.object({
                path: z
                    .string()
                    .describe('Absolute or relative path to the .nowline file to read.'),
            }),
        },
        async (args) => {
            const abs = resolveAndGuard(args.path, allowedRoot);
            const source = await fs.readFile(abs, 'utf-8');
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ path: abs, source }, null, 2),
                    },
                ],
            };
        },
    );

    // ---- create -------------------------------------------------------------

    server.registerTool(
        'create',
        {
            description:
                'Write a new .nowline file after validation. Overwrites if the path already exists.',
            inputSchema: z.object({
                path: z.string().describe('Absolute or relative path to write the .nowline file.'),
                source: z.string().describe('The .nowline source text to write.'),
            }),
        },
        async (args) => {
            const abs = resolveAndGuard(args.path, allowedRoot);
            const doc = await buildDocument(args.source);
            const diagnostics = collectMcpDiagnostics(doc, abs);
            const errors = diagnostics.filter((d) => d.severity === 'error');
            if (errors.length > 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ ok: false, path: abs, diagnostics }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
            await fs.mkdir(path.dirname(abs), { recursive: true });
            await fs.writeFile(abs, args.source, 'utf-8');
            return {
                content: [{ type: 'text', text: JSON.stringify({ ok: true, path: abs }, null, 2) }],
            };
        },
    );

    // ---- update -------------------------------------------------------------

    server.registerTool(
        'update',
        {
            description: 'Replace an existing .nowline file after validation.',
            inputSchema: z.object({
                path: z
                    .string()
                    .describe('Absolute or relative path of the .nowline file to update.'),
                source: z.string().describe('The new .nowline source text.'),
            }),
        },
        async (args) => {
            const abs = resolveAndGuard(args.path, allowedRoot);
            const doc = await buildDocument(args.source);
            const diagnostics = collectMcpDiagnostics(doc, abs);
            const errors = diagnostics.filter((d) => d.severity === 'error');
            if (errors.length > 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ ok: false, path: abs, diagnostics }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
            await fs.writeFile(abs, args.source, 'utf-8');
            return {
                content: [{ type: 'text', text: JSON.stringify({ ok: true, path: abs }, null, 2) }],
            };
        },
    );

    // ---- delete -------------------------------------------------------------

    server.registerTool(
        'delete',
        {
            description: 'Delete a local .nowline file.',
            inputSchema: z.object({
                path: z
                    .string()
                    .describe('Absolute or relative path of the .nowline file to delete.'),
            }),
        },
        async (args) => {
            const abs = resolveAndGuard(args.path, allowedRoot);
            await fs.unlink(abs);
            return {
                content: [{ type: 'text', text: JSON.stringify({ path: abs }, null, 2) }],
            };
        },
    );

    // ---- list ---------------------------------------------------------------

    server.registerTool(
        'list',
        {
            description: 'List .nowline files under a directory.',
            inputSchema: z.object({
                directory: z
                    .string()
                    .optional()
                    .describe(
                        'Directory to scan. Defaults to the allowed root (cwd or --root). Absolute or relative.',
                    ),
                recursive: z
                    .boolean()
                    .optional()
                    .describe('Whether to scan subdirectories. Defaults to false.'),
            }),
        },
        async (args) => {
            const dir = args.directory ? resolveAndGuard(args.directory, allowedRoot) : allowedRoot;
            const recursive = args.recursive ?? false;
            const paths = await listNowlineFiles(dir, recursive);
            return {
                content: [{ type: 'text', text: JSON.stringify({ paths }, null, 2) }],
            };
        },
    );

    // ---- render -------------------------------------------------------------

    server.registerTool(
        'render',
        {
            description:
                'Render a .nowline roadmap to SVG or PNG using the shared export kernel. Byte-identical to `nowline -f svg/png` for the same source and inputs.',
            inputSchema: z.object({
                source: z.string().optional().describe('Inline .nowline source text.'),
                path: z.string().optional().describe('Path to the .nowline file.'),
                format: z
                    .enum(['svg', 'png'])
                    .optional()
                    .describe('Output format. Defaults to svg.'),
                theme: z
                    .enum(['light', 'dark', 'grayscale'])
                    .optional()
                    .describe('Color theme. Defaults to light.'),
                now: z
                    .string()
                    .optional()
                    .describe('Now-line date as YYYY-MM-DD (UTC). Omit to suppress.'),
                width: z.number().optional().describe('Canvas width in px.'),
                scale: z
                    .number()
                    .optional()
                    .describe('PNG pixel-density multiplier. Defaults to 2.'),
                output: z
                    .string()
                    .optional()
                    .describe('Write output to this path instead of returning inline.'),
            }),
        },
        async (args) => {
            const { source, filePath } = await sourceAndPath(args, allowedRoot);
            const format: ExportFormat = args.format ?? 'svg';
            const today = args.now ? new Date(`${args.now}T00:00:00Z`) : todayUtc();
            const inputs: RenderInputs = {
                sourcePath: filePath,
                today,
                locale: 'en-US',
                theme: args.theme ?? 'light',
                width: args.width,
                pngScale: args.scale,
            };
            if (format === 'png') {
                const result = await resolveFonts({ headless: true });
                inputs.fonts = { sans: result.sans, mono: result.mono };
            }
            const host = createNodeHostEnv(filePath);
            const bytes = await exportDocument(source, format, inputs, host);

            if (args.output) {
                const outAbs = resolveAndGuard(args.output, allowedRoot);
                await fs.mkdir(path.dirname(outAbs), { recursive: true });
                await fs.writeFile(outAbs, bytes);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ path: outAbs, bytes: bytes.byteLength }),
                        },
                    ],
                };
            }

            if (format === 'png') {
                return {
                    content: [
                        {
                            type: 'image',
                            data: Buffer.from(bytes).toString('base64'),
                            mimeType: 'image/png',
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: new TextDecoder('utf-8').decode(bytes),
                        mimeType: 'image/svg+xml',
                    },
                ],
            };
        },
    );

    // ---- export -------------------------------------------------------------

    const EXPORT_FORMATS = ['pdf', 'html', 'mermaid', 'xlsx', 'msproj', 'png'] as const;
    type NonRenderFormat = (typeof EXPORT_FORMATS)[number];

    server.registerTool(
        'export',
        {
            description:
                'Export a .nowline roadmap to any of the eight canonical formats. Byte-identical to `nowline -f <format>` for the same source and inputs.',
            inputSchema: z.object({
                source: z.string().optional().describe('Inline .nowline source text.'),
                path: z.string().optional().describe('Path to the .nowline file.'),
                format: z
                    .enum(EXPORT_FORMATS)
                    .describe('Export format: pdf, html, mermaid, xlsx, msproj, or png.'),
                output: z
                    .string()
                    .optional()
                    .describe('Path to write the output file. Required for binary formats.'),
                now: z.string().optional().describe('Now-line date as YYYY-MM-DD (UTC).'),
                theme: z.enum(['light', 'dark', 'grayscale']).optional(),
                scale: z.number().optional().describe('PNG scale factor.'),
                pageSize: z.string().optional().describe('PDF page size.'),
                orientation: z
                    .enum(['portrait', 'landscape', 'auto'])
                    .optional()
                    .describe('PDF orientation.'),
                marginPt: z.number().optional().describe('PDF margin in points.'),
                msprojStart: z
                    .string()
                    .optional()
                    .describe('MS Project start date override (YYYY-MM-DD).'),
            }),
        },
        async (args) => {
            const { source, filePath } = await sourceAndPath(args, allowedRoot);
            const format: ExportFormat = args.format as NonRenderFormat;
            const today = args.now ? new Date(`${args.now}T00:00:00Z`) : todayUtc();
            const inputs: RenderInputs = {
                sourcePath: filePath,
                today,
                locale: 'en-US',
                theme: args.theme ?? 'light',
                pngScale: args.scale,
                pageSize: args.pageSize,
                orientation: args.orientation,
                marginPt: args.marginPt,
                msprojStart: args.msprojStart,
            };
            if (format === 'png' || format === 'pdf') {
                const result = await resolveFonts({ headless: true });
                inputs.fonts = { sans: result.sans, mono: result.mono };
            }
            const host = createNodeHostEnv(filePath);
            const bytes = await exportDocument(source, format, inputs, host);

            const BINARY_FORMATS = new Set<ExportFormat>(['png', 'pdf', 'xlsx']);
            const isBinary = BINARY_FORMATS.has(format);

            if (args.output) {
                const outAbs = resolveAndGuard(args.output, allowedRoot);
                await fs.mkdir(path.dirname(outAbs), { recursive: true });
                await fs.writeFile(outAbs, bytes);
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ path: outAbs, bytes: bytes.byteLength }),
                        },
                    ],
                };
            }

            if (isBinary) {
                const mimeMap: Record<string, string> = {
                    png: 'image/png',
                    pdf: 'application/pdf',
                    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                };
                return {
                    content: [
                        {
                            type: 'image',
                            data: Buffer.from(bytes).toString('base64'),
                            mimeType: mimeMap[format] ?? 'application/octet-stream',
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: 'text',
                        text: new TextDecoder('utf-8').decode(bytes),
                    },
                ],
            };
        },
    );

    return server;
}

// ---- Helpers ----------------------------------------------------------------

async function listNowlineFiles(dir: string, recursive: boolean): Promise<string[]> {
    const results: string[] = [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && recursive) {
                results.push(...(await listNowlineFiles(fullPath, true)));
            } else if (entry.isFile() && entry.name.endsWith('.nowline')) {
                results.push(fullPath);
            }
        }
    } catch {
        // Directory not accessible — return empty
    }
    return results.sort();
}
