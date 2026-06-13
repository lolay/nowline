// @nowline/mcp server factory.
//
// Creates and configures an McpServer instance with all tools, resources, and
// prompts.  The factory is shared by the entry-point bin (npx @nowline/mcp)
// and the CLI's --mcp flag so both paths expose an identical surface.
//
// Spec: specs/mcp.md.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    collectDocumentDiagnostics,
    createNowlineServices,
    type NowlineFile,
    parseNowlineJson,
    printNowlineFile,
} from '@nowline/core';
import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
} from '@nowline/export';
import { resolveFonts } from '@nowline/export-core';
import { buildShareLink } from '@nowline/share-link';
import { URI } from 'langium';
import { z } from 'zod';
import { CAPABILITIES } from './capabilities.js';
import { CONVERSIONS_GUIDE, EXAMPLES, REFERENCE_MAN_PAGE } from './generated/resources.js';
import { UI_BUNDLE } from './generated/ui-bundle.js';
import { registerPrompts } from './prompts.js';
import {
    CapabilitiesOutputSchema,
    ConvertOutputSchema,
    CreateOutputSchema,
    DeleteOutputSchema,
    ExportOutputSchema,
    ListItemsOutputSchema,
    ListOutputSchema,
    ReadOutputSchema,
    RenderOutputSchema,
    UpdateOutputSchema,
    ValidateOutputSchema,
} from './schemas.js';

// ---- MCP Apps UI (in-chat live preview) -------------------------------------
//
// The MCP Apps extension (SEP-1865) lets a tool return an interactive HTML
// resource the host renders in a sandboxed iframe. We use the embedded-resource
// form: `render` returns a self-contained text/html resource that inlines the
// browser preview bundle (UI_BUNDLE, the @nowline/browser + @nowline/preview-
// shell pipeline) plus the injected source. It is emitted only when the client
// advertises the UI extension capability or the caller passes `preview: true`,
// so plain stdio operation is unchanged and non-UI hosts still receive the
// SVG/PNG content block alongside it (graceful degradation).

/** SEP-1865 UI extension capability id; also probed under common short keys. */
const MCP_APPS_UI_CAPABILITY = 'io.modelcontextprotocol/ui';
const PREVIEW_UI_URI = 'ui://nowline/preview';
/** SEP-1865 mandates the text/html;profile=mcp-app media type for UI resources. */
const PREVIEW_UI_MIME = 'text/html;profile=mcp-app';

function clientSupportsAppsUi(server: McpServer): boolean {
    // Extension capabilities are negotiated under `experimental` in SDK 1.29
    // (it does not yet model SEP-1724 extensions as a first-class field), so
    // probe the canonical id plus the short `ui` / `apps` aliases some hosts use.
    const experimental = server.server.getClientCapabilities()?.experimental as
        | Record<string, unknown>
        | undefined;
    if (!experimental) return false;
    return Boolean(experimental[MCP_APPS_UI_CAPABILITY] || experimental.ui || experimental.apps);
}

interface PreviewPayload {
    source: string;
    theme?: string;
    now?: string;
    width?: number;
    locale?: string;
    showLinks?: boolean;
}

function buildPreviewHtml(payload: PreviewPayload): string {
    // The payload (including the .nowline source) is injected as a JSON
    // <script> block rather than interpolated into executable JS, so source
    // text with quotes/backticks can't break out. Escaping `<` as \u003c keeps
    // any embedded "</script>" from closing the block early; JSON.parse in the
    // bundle decodes it back. The bundle injects its own stylesheet at runtime,
    // so only the root-element sizing CSS is inlined here.
    const data = JSON.stringify(payload).replace(/</g, '\\u003c');
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<title>Nowline preview</title>',
        '<style>html,body,#nl-preview-root{margin:0;padding:0;height:100%;width:100%;overflow:hidden;}</style>',
        '</head>',
        '<body>',
        '<div id="nl-preview-root"></div>',
        `<script id="nl-preview-data" type="application/json">${data}</script>`,
        `<script>${UI_BUNDLE}</script>`,
        '</body>',
        '</html>',
        '',
    ].join('\n');
}

function previewResourceBlock(payload: PreviewPayload) {
    return {
        type: 'resource' as const,
        resource: {
            uri: PREVIEW_UI_URI,
            mimeType: PREVIEW_UI_MIME,
            text: buildPreviewHtml(payload),
        },
    };
}

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
    const server = new McpServer(
        {
            name: opts.name ?? 'nowline',
            version: opts.version ?? '0.6.0',
        },
        {
            instructions:
                'Nowline manages roadmaps written in the .nowline plain-text DSL — ' +
                'NOT JSON or any other structured format. All `source` parameters expect ' +
                '.nowline DSL text (a UTF-8 text file that starts with `nowline v1`). ' +
                'Use the `create-roadmap` prompt when generating a new roadmap from scratch; ' +
                'it injects the full DSL reference and canonical examples before asking you ' +
                'to write. Read the `nowline://reference` resource to learn the syntax. ' +
                'The `json` value in the `formats` capability and the `convert` tool are ' +
                'for converting an existing .nowline roadmap to/from its JSON AST; ' +
                'JSON is not an authoring format.',
        },
    );

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

    server.registerResource(
        'nowline-conversions',
        'nowline://conversions',
        {
            description:
                'LLM-mediated conversion guide: how to translate Mermaid gantt, MS Project, Excel, Google Sheets timeline, and generic CSV into Nowline DSL.',
            mimeType: 'text/plain',
        },
        async () => ({
            contents: [
                {
                    uri: 'nowline://conversions',
                    text: CONVERSIONS_GUIDE,
                    mimeType: 'text/plain',
                },
            ],
        }),
    );

    // ---- Prompts ------------------------------------------------------------

    registerPrompts(server);

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
            outputSchema: ValidateOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const { source, filePath } = await sourceAndPath(args, allowedRoot);
            const doc = await buildDocument(source);
            const diagnostics = collectMcpDiagnostics(doc, filePath);
            const ok = diagnostics.every((d) => d.severity !== 'error');
            const structured = { ok, diagnostics };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
            outputSchema: ReadOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const abs = resolveAndGuard(args.path, allowedRoot);
            const source = await fs.readFile(abs, 'utf-8');
            const structured = { path: abs, source };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
            outputSchema: CreateOutputSchema,
            // Overwrites silently → destructive; same source always produces same file → idempotent.
            annotations: { destructiveHint: true, idempotentHint: true },
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
            const structured = { ok: true, path: abs };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
            outputSchema: UpdateOutputSchema,
            annotations: { idempotentHint: true },
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
            const structured = { ok: true, path: abs };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
            outputSchema: DeleteOutputSchema,
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const abs = resolveAndGuard(args.path, allowedRoot);
            await fs.unlink(abs);
            const structured = { path: abs };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
            outputSchema: ListOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const dir = args.directory ? resolveAndGuard(args.directory, allowedRoot) : allowedRoot;
            const recursive = args.recursive ?? false;
            const paths = await listNowlineFiles(dir, recursive);
            const structured = { paths };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
                share: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, include a shareUrl pointing to https://free.nowline.io/open.',
                    ),
                preview: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, also return an interactive in-chat HTML preview (MCP Apps UI). Auto-enabled when the client advertises MCP Apps UI support. The preview is view-only (zoom, theme, now-line); export via the export/render tools.',
                    ),
            }),
            outputSchema: RenderOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            const shareUrl = args.share
                ? (buildShareLink({ source, share: true }) ?? undefined)
                : undefined;

            // Optional MCP Apps in-chat preview. Emitted alongside the normal
            // content so non-UI hosts still get the SVG/PNG; the bundle renders
            // the live SVG itself, so the preview is format-agnostic. Toolbar
            // export/copy is hidden (exportControls: hide) — artifacts come
            // from the render/export tools, not the iframe sandbox.
            const wantPreview = args.preview === true || clientSupportsAppsUi(server);
            const previewBlocks = wantPreview
                ? [
                      previewResourceBlock({
                          source,
                          theme: args.theme,
                          now: args.now,
                          width: args.width,
                          locale: 'en-US',
                      }),
                  ]
                : [];

            if (args.output) {
                const outAbs = resolveAndGuard(args.output, allowedRoot);
                await fs.mkdir(path.dirname(outAbs), { recursive: true });
                await fs.writeFile(outAbs, bytes);
                const structured = { format, path: outAbs, bytes: bytes.byteLength, shareUrl };
                return {
                    content: [
                        { type: 'text', text: JSON.stringify(structured, null, 2) },
                        ...previewBlocks,
                    ],
                    structuredContent: structured,
                };
            }

            if (format === 'png') {
                const structured = { format, bytes: bytes.byteLength, shareUrl };
                return {
                    content: [
                        {
                            type: 'image',
                            data: Buffer.from(bytes).toString('base64'),
                            mimeType: 'image/png',
                        },
                        ...previewBlocks,
                    ],
                    structuredContent: structured,
                };
            }
            const svgText = new TextDecoder('utf-8').decode(bytes);
            const structured = { format, shareUrl };
            return {
                content: [
                    { type: 'text', text: svgText, mimeType: 'image/svg+xml' },
                    ...previewBlocks,
                ],
                structuredContent: structured,
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
                share: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, include a shareUrl pointing to https://free.nowline.io/open.',
                    ),
            }),
            outputSchema: ExportOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            const shareUrl = args.share
                ? (buildShareLink({ source, share: true }) ?? undefined)
                : undefined;

            const BINARY_FORMATS = new Set<ExportFormat>(['png', 'pdf', 'xlsx']);
            const isBinary = BINARY_FORMATS.has(format);

            if (args.output) {
                const outAbs = resolveAndGuard(args.output, allowedRoot);
                await fs.mkdir(path.dirname(outAbs), { recursive: true });
                await fs.writeFile(outAbs, bytes);
                const structured = { format, path: outAbs, bytes: bytes.byteLength, shareUrl };
                return {
                    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                    structuredContent: structured,
                };
            }

            if (isBinary) {
                const mimeMap: Record<string, string> = {
                    png: 'image/png',
                    pdf: 'application/pdf',
                    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                };
                const structured = { format, bytes: bytes.byteLength, shareUrl };
                return {
                    content: [
                        {
                            type: 'image',
                            data: Buffer.from(bytes).toString('base64'),
                            mimeType: mimeMap[format] ?? 'application/octet-stream',
                        },
                    ],
                    structuredContent: structured,
                };
            }
            const text = new TextDecoder('utf-8').decode(bytes);
            const structured = { format, shareUrl };
            return {
                content: [{ type: 'text', text }],
                structuredContent: structured,
            };
        },
    );

    // ---- convert ------------------------------------------------------------

    server.registerTool(
        'convert',
        {
            description:
                'Convert between .nowline source text and its JSON AST representation. `to:json` serializes a .nowline file to the JSON AST; `to:nowline` pretty-prints a JSON AST back to canonical .nowline source.',
            inputSchema: z.object({
                source: z.string().optional().describe('Inline source text to convert.'),
                path: z.string().optional().describe('Path to the source file.'),
                to: z
                    .enum(['json', 'nowline'])
                    .describe(
                        '"json" — serialize .nowline text to JSON AST. "nowline" — pretty-print a JSON AST back to .nowline source.',
                    ),
            }),
            outputSchema: ConvertOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            if (args.to === 'json') {
                const { source, filePath } = await sourceAndPath(args, allowedRoot);
                const host = createNodeHostEnv(filePath);
                const jsonBytes = await exportDocument(
                    source,
                    'json',
                    {
                        sourcePath: filePath,
                        today: todayUtc(),
                        locale: 'en-US',
                        theme: 'light',
                    },
                    host,
                );
                const result = new TextDecoder('utf-8').decode(jsonBytes);
                const structured = { to: 'json' as const, result };
                return {
                    content: [{ type: 'text', text: result }],
                    structuredContent: structured,
                };
            }

            // to: 'nowline' — input is a JSON AST string
            const jsonSource =
                args.source ??
                (args.path
                    ? await fs.readFile(resolveAndGuard(args.path, allowedRoot), 'utf-8')
                    : null);
            if (!jsonSource) {
                throw new Error('At least one of `source` or `path` is required.');
            }
            const { ast } = parseNowlineJson(jsonSource, args.path ?? 'input.json');
            const result = printNowlineFile(ast);
            const structured = { to: 'nowline' as const, result };
            return {
                content: [{ type: 'text', text: result }],
                structuredContent: structured,
            };
        },
    );

    // ---- capabilities -------------------------------------------------------

    server.registerTool(
        'capabilities',
        {
            description:
                'Return all supported themes, icons, locales, export formats, and template names in a single response.',
            inputSchema: z.object({}),
            outputSchema: CapabilitiesOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = {
                themes: [...CAPABILITIES.themes],
                icons: [...CAPABILITIES.icons],
                locales: [...CAPABILITIES.locales],
                formats: [...CAPABILITIES.formats],
                templates: [...CAPABILITIES.templates],
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
            };
        },
    );

    // ---- list-themes --------------------------------------------------------

    server.registerTool(
        'list-themes',
        {
            description: 'List supported color themes: light, dark, grayscale.',
            inputSchema: z.object({}),
            outputSchema: ListItemsOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = { items: [...CAPABILITIES.themes] };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
            };
        },
    );

    // ---- list-icons ---------------------------------------------------------

    server.registerTool(
        'list-icons',
        {
            description:
                'List built-in capacity-icon names usable in the `capacity-icon:` style property.',
            inputSchema: z.object({}),
            outputSchema: ListItemsOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = { items: [...CAPABILITIES.icons] };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
            };
        },
    );

    // ---- list-locales -------------------------------------------------------

    server.registerTool(
        'list-locales',
        {
            description: 'List supported BCP-47 locale tags.',
            inputSchema: z.object({}),
            outputSchema: ListItemsOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = { items: [...CAPABILITIES.locales] };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
            };
        },
    );

    // ---- list-formats -------------------------------------------------------

    server.registerTool(
        'list-formats',
        {
            description:
                'List all supported export formats (svg, png, pdf, html, mermaid, xlsx, msproj, json).',
            inputSchema: z.object({}),
            outputSchema: ListItemsOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = { items: [...CAPABILITIES.formats] };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
            };
        },
    );

    // ---- list-templates -----------------------------------------------------

    server.registerTool(
        'list-templates',
        {
            description: 'List built-in template names usable with `nowline --init --template`.',
            inputSchema: z.object({}),
            outputSchema: ListItemsOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = { items: [...CAPABILITIES.templates] };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
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
