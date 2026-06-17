// MCP prompt registrations for @nowline/mcp.
// Wired into the server via registerPrompts(server).

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
    // ---- create-roadmap ----------------------------------------------------

    server.registerPrompt(
        'create-roadmap',
        {
            title: 'Create Roadmap from Description',
            description:
                'Generate a new .nowline roadmap from a plain-English description. Composes the DSL reference and example files so the LLM has full context.',
            argsSchema: {
                description: z
                    .string()
                    .describe(
                        'Plain-English description of the roadmap you want to create (teams, timeline, key milestones, etc.).',
                    ),
            },
        },
        ({ description }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'resource',
                        resource: {
                            uri: 'nowline://reference',
                            mimeType: 'text/plain',
                            text: '',
                        },
                    },
                },
                {
                    role: 'user',
                    content: {
                        type: 'resource',
                        resource: {
                            uri: 'nowline://examples',
                            mimeType: 'text/plain',
                            text: '',
                        },
                    },
                },
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Using the Nowline DSL reference and examples above, generate a complete, valid .nowline roadmap file for the following description:\n\n${description}\n\nReturn only the .nowline source text with no additional explanation.`,
                    },
                },
            ],
        }),
    );

    // ---- fix-diagnostics ----------------------------------------------------

    server.registerPrompt(
        'fix-diagnostics',
        {
            title: 'Fix Roadmap Diagnostics',
            description:
                'Fix validation errors in a .nowline file. Describe the validate→fix→re-validate loop keyed on NL.E#### diagnostic codes.',
            argsSchema: {
                source: z
                    .string()
                    .describe('The .nowline source text that contains validation errors.'),
                diagnostics: z
                    .string()
                    .optional()
                    .describe(
                        'JSON array of diagnostic objects from the validate tool. Omit to let the LLM call validate itself.',
                    ),
            },
        },
        ({ source, diagnostics }) => {
            const diagSection = diagnostics
                ? `\n\nDiagnostics (JSON):\n\`\`\`json\n${diagnostics}\n\`\`\``
                : '\n\nFirst call the `validate` tool on the source to get the current diagnostics.';
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'resource',
                            resource: {
                                uri: 'nowline://reference',
                                mimeType: 'text/plain',
                                text: '',
                            },
                        },
                    },
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Fix all validation errors in the following .nowline source. Each diagnostic code (NL.E####) identifies the exact rule violation — consult the DSL reference above to understand the rule and apply the correct fix. After fixing, call the \`validate\` tool to confirm there are no remaining errors.${diagSection}\n\nSource:\n\`\`\`nowline\n${source}\n\`\`\`\n\nReturn the corrected .nowline source text.`,
                        },
                    },
                ],
            };
        },
    );

    // ---- convert-to-nowline -------------------------------------------------

    server.registerPrompt(
        'convert-to-nowline',
        {
            title: 'Convert to Nowline',
            description:
                'Convert a gantt/timeline from another format (Mermaid gantt, MS Project, Excel, Google Sheets, CSV) into Nowline DSL. Uses the conversion guide resource for format-specific rules.',
            argsSchema: {
                source: z
                    .string()
                    .describe('The source content to convert (paste the raw text/CSV/XML here).'),
                from: z
                    .enum([
                        'mermaid-gantt',
                        'ms-project',
                        'xlsx',
                        'gsheets-timeline',
                        'csv',
                        'auto',
                    ])
                    .optional()
                    .describe(
                        'Source format hint. Use "auto" (default) to let the LLM detect the format.',
                    ),
            },
        },
        ({ source, from }) => {
            const formatHint =
                from && from !== 'auto'
                    ? `The source format is: **${from}**.`
                    : 'Detect the source format automatically from the content.';
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'resource',
                            resource: {
                                uri: 'nowline://conversions',
                                mimeType: 'text/plain',
                                text: '',
                            },
                        },
                    },
                    {
                        role: 'user',
                        content: {
                            type: 'resource',
                            resource: {
                                uri: 'nowline://reference',
                                mimeType: 'text/plain',
                                text: '',
                            },
                        },
                    },
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Using the conversion guide and the Nowline DSL reference above, convert the following source content into a valid .nowline roadmap.\n\n${formatHint}\n\nSource content:\n\`\`\`\n${source}\n\`\`\`\n\nReturn only the .nowline source text. After generating it, call the \`validate\` tool to confirm there are no errors.`,
                        },
                    },
                ],
            };
        },
    );
}
