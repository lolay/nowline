// Shared Zod output schemas for @nowline/mcp tools.
// Each tool's outputSchema is defined here so server.ts stays readable.

import { z } from 'zod';

// ---- Shared building blocks ------------------------------------------------

export const DiagnosticSchema = z.object({
    file: z.string(),
    line: z.number(),
    column: z.number(),
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string(),
    message: z.string(),
    suggestion: z.string().optional(),
});

export const InsightSchema = z.object({
    severity: z.enum(['info', 'warning']),
    code: z.string(),
    message: z.string(),
    entityId: z.string().optional(),
});

// ---- Tool output schemas ---------------------------------------------------

export const ValidateOutputSchema = z.object({
    ok: z.boolean(),
    diagnostics: z.array(DiagnosticSchema),
    insights: z.array(InsightSchema).optional(),
});

export const ReadOutputSchema = z.object({
    path: z.string(),
    source: z.string(),
});

export const CreateOutputSchema = z.object({
    ok: z.boolean(),
    path: z.string(),
    diagnostics: z.array(DiagnosticSchema).optional(),
});

export const UpdateOutputSchema = z.object({
    ok: z.boolean(),
    path: z.string(),
    diagnostics: z.array(DiagnosticSchema).optional(),
});

export const DeleteOutputSchema = z.object({
    path: z.string(),
});

export const ListOutputSchema = z.object({
    paths: z.array(z.string()),
});

export const RenderOutputSchema = z.object({
    format: z.string(),
    /** Set when the output was written to disk. */
    path: z.string().optional(),
    bytes: z.number().optional(),
    insights: z.array(InsightSchema).optional(),
});

export const ExportOutputSchema = z.object({
    format: z.string(),
    path: z.string().optional(),
    bytes: z.number().optional(),
});

export const ShareOutputSchema = z.object({
    shareUrl: z.string(),
});

export const ConvertOutputSchema = z.object({
    to: z.enum(['json', 'nowline']),
    result: z.string(),
});

export const CapabilitiesOutputSchema = z.object({
    themes: z.array(z.string()),
    icons: z.array(z.string()),
    locales: z.array(z.string()),
    formats: z.array(z.string()),
    templates: z.array(z.string()),
});

export const ListItemsOutputSchema = z.object({
    items: z.array(z.string()),
});

export const ReferenceOutputSchema = z.object({
    format: z.enum(['condensed', 'full']),
    text: z.string(),
});

export const ExamplesOutputSchema = z.object({
    names: z.array(z.string()).optional(),
    name: z.string().optional(),
    source: z.string().optional(),
});

export const SchemaOutputSchema = z.object({
    directiveKeys: z.array(z.string()),
    entityTypes: z.array(z.string()),
    itemPropertyKeys: z.array(z.string()),
});
