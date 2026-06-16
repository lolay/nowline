// @nowline/mcp server factory.
//
// Creates and configures an McpServer instance with all tools, resources, and
// prompts.  The factory is shared by the entry-point bin (npx @nowline/mcp)
// and the CLI's --mcp flag so both paths expose an identical surface.
//
// Spec: specs/mcp.md.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
    getUiCapability,
    RESOURCE_MIME_TYPE,
    registerAppResource,
    registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseNowlineJson, printNowlineFile } from '@nowline/core';
import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
} from '@nowline/export';
import { resolveFonts } from '@nowline/export-core';
import { buildShareLink } from '@nowline/share-link';
import { z } from 'zod';
import { NOWLINE_MCP_ICONS } from './branding.js';
import { CAPABILITIES } from './capabilities.js';
import {
    buildDocument,
    collectMcpDiagnostics,
    collectMcpLayoutInsights,
    DEFAULT_RENDER_WIDTH,
    diagnosticsErrorBlock,
    LAYOUT_INSIGHT_HINT,
    REVIEW_MAX_WIDTH,
    toolDescriptionWithSyntax,
} from './diagnostics.js';
import {
    CONVERSIONS_GUIDE,
    EXAMPLES,
    type ExampleFile,
    REFERENCE_MAN_PAGE,
} from './generated/resources.js';
import { PREVIEW_HTML } from './generated/ui-bundle.js';
import { registerPrompts } from './prompts.js';
import { REFERENCE_CHEATSHEET } from './reference-cheatsheet.js';
import { SCHEMA_VOCABULARY } from './schema-vocab.js';
import {
    CapabilitiesOutputSchema,
    ConvertOutputSchema,
    CreateOutputSchema,
    DeleteOutputSchema,
    ExamplesOutputSchema,
    ExportOutputSchema,
    ListItemsOutputSchema,
    ListOutputSchema,
    ReadOutputSchema,
    ReferenceOutputSchema,
    RenderOutputSchema,
    SchemaOutputSchema,
    UpdateOutputSchema,
    ValidateOutputSchema,
} from './schemas.js';

// ---- MCP Apps UI (in-chat live preview) -------------------------------------
//
// Official MCP Apps model (SEP-1865): a pre-declared ui:// resource serves
// static HTML; the render tool declares _meta.ui.resourceUri; per-call data
// flows through the ontoolresult handshake. When an MCP Apps host is active,
// render returns a lean nowline.preview JSON payload (no inline SVG/PNG) so
// results stay under the host's ~150K inline cap. Non-apps hosts still get
// the full SVG/PNG inline (graceful degradation).

/** SEP-1865 UI extension capability id; also probed under common short keys. */
const MCP_APPS_UI_CAPABILITY = 'io.modelcontextprotocol/ui';
/** Versioned URI doubles as a cache key — bump suffix on bundle changes. */
export const PREVIEW_UI_URI = 'ui://nowline/preview-v3';

function clientSupportsAppsUi(server: McpServer): boolean {
    // SEP-1724 negotiated extensions: canonical id under `extensions`.
    const caps = server.server.getClientCapabilities() as
        | {
              experimental?: Record<string, unknown>;
              extensions?: Record<string, unknown>;
          }
        | undefined;
    if (!caps) return false;
    if (getUiCapability(caps as Parameters<typeof getUiCapability>[0])) return true;

    // Hosts also advertise under `experimental` or short `ui` / `apps` aliases.
    const buckets = [caps.extensions, caps.experimental].filter(
        (bucket): bucket is Record<string, unknown> => Boolean(bucket),
    );
    return buckets.some((bucket) =>
        Boolean(bucket[MCP_APPS_UI_CAPABILITY] || bucket.ui || bucket.apps),
    );
}

interface PreviewPayload {
    source: string;
    theme?: string;
    now?: string;
    width?: number;
    locale?: string;
}

function leanPreviewBlock(payload: PreviewPayload) {
    return {
        type: 'text' as const,
        text: JSON.stringify({
            kind: 'nowline.preview',
            source: payload.source,
            theme: payload.theme,
            now: payload.now,
            width: payload.width,
            locale: payload.locale,
        }),
    };
}

// ---- Server factory ---------------------------------------------------------

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

function exampleShortName(fullName: string): string {
    return fullName.endsWith('.nowline') ? fullName.slice(0, -'.nowline'.length) : fullName;
}

function findExample(name: string): ExampleFile | undefined {
    const withExt = name.endsWith('.nowline') ? name : `${name}.nowline`;
    return EXAMPLES.find((e) => e.name === withExt || e.name === name);
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
            icons: [...NOWLINE_MCP_ICONS],
        },
        {
            instructions:
                'Nowline manages roadmaps written in the .nowline plain-text DSL — NOT JSON or any other ' +
                'structured format. All `source` parameters expect `.nowline` DSL text (starts with `nowline v1`). ' +
                'Workflow: 1. call `reference` or `examples` to learn syntax → 2. write `.nowline` → ' +
                '3. call `render` (validates + renders; or `validate` alone) → 4. fix errors keyed on `NL.E####` ' +
                'and re-render → 5. review returned layout `insights` (what reflowed) → 6. when uncertain, ' +
                'call `render` with `review:true` for a final visual check. JSON in `convert` is AST conversion only.',
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

    registerAppResource(
        server,
        'nowline-preview',
        PREVIEW_UI_URI,
        {
            description:
                'Interactive in-chat roadmap preview (MCP Apps). Hydrates via ontoolresult.',
        },
        async () => ({
            contents: [
                {
                    uri: PREVIEW_UI_URI,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: PREVIEW_HTML,
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
            description: toolDescriptionWithSyntax(
                'Parse and validate a .nowline roadmap. Returns ok=true with optional layout insights when valid, or ok=false with structured diagnostics.',
            ),
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
            const insights = ok
                ? await collectMcpLayoutInsights({
                      source,
                      filePath,
                      today: todayUtc(),
                      locale: 'en-US',
                      readFile: createNodeHostEnv(filePath).readSource,
                      doc,
                  })
                : [];
            const structured = { ok, diagnostics, ...(insights.length > 0 ? { insights } : {}) };
            return {
                content: [
                    { type: 'text', text: JSON.stringify(structured, null, 2) },
                    ...(insights.length > 0
                        ? [{ type: 'text' as const, text: LAYOUT_INSIGHT_HINT }]
                        : []),
                ],
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
            description: toolDescriptionWithSyntax(
                'Write a new .nowline file after validation. Overwrites if the path already exists.',
            ),
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
            const blocked = await diagnosticsErrorBlock(args.source, abs);
            if (!blocked.ok) return blocked.response;
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
            description: toolDescriptionWithSyntax(
                'Replace an existing .nowline file after validation.',
            ),
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
            const blocked = await diagnosticsErrorBlock(args.source, abs);
            if (!blocked.ok) return blocked.response;
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

    registerAppTool(
        server,
        'render',
        {
            description: toolDescriptionWithSyntax(
                'Validate then render a .nowline roadmap to SVG or PNG (combined validate+render+share). ' +
                    'Returns structured diagnostics on error-severity input instead of a raw kernel error.',
            ),
            inputSchema: z.object({
                source: z.string().optional().describe('Inline .nowline source text.'),
                path: z
                    .string()
                    .optional()
                    .describe(
                        'Real local filesystem path to the .nowline file (e.g. /Users/name/Desktop/foo.nowline). ' +
                            'Never pass a virtual or sandbox path such as /mnt/user-data/… — ' +
                            'those do not exist on the host filesystem. Pass `source` instead.',
                    ),
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
                    .describe(
                        'Real local filesystem path to write the output file (e.g. /Users/name/Desktop/roadmap.svg). ' +
                            'Never pass a virtual or sandbox path such as /mnt/user-data/… — ' +
                            'omit this parameter to receive output inline instead.',
                    ),
                share: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, include a shareUrl pointing to https://free.nowline.io/open.',
                    ),
                review: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, also attach a downscaled PNG so a multimodal model can visually check layout (label overflow, lane crowding, off-range now-line). Off by default.',
                    ),
                preview: z
                    .boolean()
                    .optional()
                    .describe(
                        'When true, force the in-chat MCP Apps preview. On MCP Apps hosts the preview auto-renders via _meta.ui without this flag.',
                    ),
            }),
            outputSchema: RenderOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
            _meta: {
                ui: { resourceUri: PREVIEW_UI_URI },
                'openai/outputTemplate': PREVIEW_UI_URI,
            },
        },
        async (args) => {
            const { source, filePath } = await sourceAndPath(args, allowedRoot);
            const blocked = await diagnosticsErrorBlock(source, filePath);
            if (!blocked.ok) return blocked.response;

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
            const host = createNodeHostEnv(filePath);
            const appActive = args.preview === true || clientSupportsAppsUi(server);
            // Skip the full render when the bytes won't be used: apps host with
            // no write-to-disk path and no review attachment requested.
            const needsRender = !appActive || !!args.output || args.review === true;
            if (needsRender && (format === 'png' || args.review === true)) {
                const result = await resolveFonts({ headless: true });
                inputs.fonts = { sans: result.sans, mono: result.mono };
            }
            const bytes = needsRender
                ? await exportDocument(source, format, inputs, host)
                : new Uint8Array(0);
            const shareUrl = args.share
                ? (buildShareLink({ source, share: true }) ?? undefined)
                : undefined;

            const insights = await collectMcpLayoutInsights({
                source,
                filePath,
                today,
                theme: args.theme ?? 'light',
                width: args.width,
                locale: 'en-US',
                readFile: host.readSource,
                doc: blocked.doc,
            });

            const previewPayload: PreviewPayload = {
                source,
                theme: args.theme,
                now: args.now,
                width: args.width,
                locale: 'en-US',
            };

            const reviewBlocks =
                args.review === true
                    ? await buildReviewContentBlocks(source, format, bytes, inputs, host)
                    : [];

            const insightHintBlocks =
                insights.length > 0 ? [{ type: 'text' as const, text: LAYOUT_INSIGHT_HINT }] : [];
            const insightsField = insights.length > 0 ? { insights } : {};

            if (args.output) {
                const outAbs = resolveAndGuard(args.output, allowedRoot);
                await fs.mkdir(path.dirname(outAbs), { recursive: true });
                await fs.writeFile(outAbs, bytes);
                const structured = {
                    format,
                    path: outAbs,
                    bytes: bytes.byteLength,
                    shareUrl,
                    ...insightsField,
                };
                return {
                    content: [
                        ...(appActive ? [leanPreviewBlock(previewPayload)] : []),
                        { type: 'text' as const, text: JSON.stringify(structured, null, 2) },
                        ...insightHintBlocks,
                        ...reviewBlocks,
                    ],
                    structuredContent: structured,
                };
            }

            if (appActive) {
                const structured = {
                    format,
                    shareUrl,
                    ...insightsField,
                };
                return {
                    content: [
                        leanPreviewBlock(previewPayload),
                        ...insightHintBlocks,
                        ...reviewBlocks,
                    ],
                    structuredContent: structured,
                };
            }

            if (format === 'png') {
                const structured = { format, bytes: bytes.byteLength, shareUrl, ...insightsField };
                return {
                    content: [
                        {
                            type: 'image',
                            data: Buffer.from(bytes).toString('base64'),
                            mimeType: 'image/png',
                        },
                        ...insightHintBlocks,
                        ...reviewBlocks,
                    ],
                    structuredContent: structured,
                };
            }
            const svgText = new TextDecoder('utf-8').decode(bytes);
            const structured = { format, shareUrl, ...insightsField };
            return {
                content: [
                    { type: 'text', text: svgText, mimeType: 'image/svg+xml' },
                    ...insightHintBlocks,
                    ...reviewBlocks,
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
                path: z
                    .string()
                    .optional()
                    .describe(
                        'Real local filesystem path to the .nowline file (e.g. /Users/name/Desktop/foo.nowline). ' +
                            'Never pass a virtual or sandbox path such as /mnt/user-data/… — ' +
                            'those do not exist on the host filesystem. Pass `source` instead.',
                    ),
                format: z
                    .enum(EXPORT_FORMATS)
                    .describe('Export format: pdf, html, mermaid, xlsx, msproj, or png.'),
                output: z
                    .string()
                    .optional()
                    .describe(
                        'Real local filesystem path to write the output (e.g. /Users/name/Desktop/roadmap.pdf). ' +
                            'Required for binary formats (pdf, xlsx, msproj, png). ' +
                            'Never pass a virtual or sandbox path such as /mnt/user-data/… — ' +
                            'those do not exist on the host filesystem.',
                    ),
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
            const blocked = await diagnosticsErrorBlock(source, filePath);
            if (!blocked.ok) return blocked.response;

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
                path: z
                    .string()
                    .optional()
                    .describe(
                        'Real local filesystem path to the source file. ' +
                            'Never pass a virtual or sandbox path such as /mnt/user-data/… — ' +
                            'pass `source` instead.',
                    ),
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

    // ---- reference / examples / schema (discovery tools) --------------------

    server.registerTool(
        'reference',
        {
            description:
                'Return the Nowline DSL reference (condensed cheatsheet or full man page). Callable alternative to the nowline://reference resource.',
            inputSchema: z.object({
                format: z
                    .enum(['condensed', 'full'])
                    .optional()
                    .describe('Reference format. Defaults to condensed.'),
            }),
            outputSchema: ReferenceOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const format = args.format ?? 'condensed';
            const text = format === 'full' ? REFERENCE_MAN_PAGE : REFERENCE_CHEATSHEET;
            const structured = { format, text };
            return {
                content: [{ type: 'text', text }],
                structuredContent: structured,
            };
        },
    );

    server.registerTool(
        'examples',
        {
            description:
                'Return canonical .nowline example sources. Callable alternative to the nowline://examples resource.',
            inputSchema: z.object({
                name: z
                    .string()
                    .optional()
                    .describe('Example name. Omit for the catalog plus minimal inline.'),
            }),
            outputSchema: ExamplesOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const exampleNames = EXAMPLES.map((e) => exampleShortName(e.name));
            if (args.name) {
                const ex = findExample(args.name);
                if (!ex) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    error: `Unknown example "${args.name}".`,
                                    names: exampleNames,
                                }),
                            },
                        ],
                        isError: true,
                    };
                }
                const structured = { name: exampleShortName(ex.name), source: ex.content };
                return {
                    content: [{ type: 'text', text: ex.content }],
                    structuredContent: structured,
                };
            }
            const minimal = findExample('minimal') ?? EXAMPLES[0];
            const structured = {
                names: exampleNames,
                name: exampleShortName(minimal.name),
                source: minimal.content,
            };
            return {
                content: [
                    {
                        type: 'text',
                        text: `# Examples\n\n${exampleNames.map((n) => `- ${n}`).join('\n')}\n\n## ${structured.name}\n\n${minimal.content}`,
                    },
                ],
                structuredContent: structured,
            };
        },
    );

    server.registerTool(
        'schema',
        {
            description:
                'Return the structured Nowline DSL key vocabulary (directive keys, entity types, item properties).',
            inputSchema: z.object({}),
            outputSchema: SchemaOutputSchema,
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const structured = {
                directiveKeys: [...SCHEMA_VOCABULARY.directiveKeys],
                entityTypes: [...SCHEMA_VOCABULARY.entityTypes],
                itemPropertyKeys: [...SCHEMA_VOCABULARY.itemPropertyKeys],
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
                structuredContent: structured,
            };
        },
    );

    return server;
}

// ---- Helpers ----------------------------------------------------------------

type ContentBlock =
    | { type: 'text'; text: string; mimeType?: string }
    | { type: 'image'; data: string; mimeType: string };

async function buildReviewContentBlocks(
    source: string,
    format: ExportFormat,
    artifactBytes: Uint8Array,
    inputs: RenderInputs,
    host: HostEnv,
): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = [
        {
            type: 'text',
            text:
                'Review this raster for layout issues (truncated labels, crowded lanes, ' +
                'now-line position) before finalizing.',
        },
    ];

    const artifactWidth = inputs.width ?? DEFAULT_RENDER_WIDTH;
    let inspectionBytes: Uint8Array;

    if (format === 'png' && artifactWidth <= REVIEW_MAX_WIDTH) {
        inspectionBytes = artifactBytes;
    } else {
        const reviewInputs: RenderInputs = {
            ...inputs,
            width: Math.min(artifactWidth, REVIEW_MAX_WIDTH),
            pngScale: 1,
        };
        if (!reviewInputs.fonts) {
            const fonts = await resolveFonts({ headless: true });
            reviewInputs.fonts = { sans: fonts.sans, mono: fonts.mono };
        }
        inspectionBytes = await exportDocument(source, 'png', reviewInputs, host);
    }

    if (format !== 'png' || inspectionBytes.byteLength !== artifactBytes.byteLength) {
        blocks.push({
            type: 'image',
            data: Buffer.from(inspectionBytes).toString('base64'),
            mimeType: 'image/png',
        });
    }

    return blocks;
}

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
