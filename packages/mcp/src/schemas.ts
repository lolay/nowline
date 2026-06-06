// Shared Zod output schemas for @nowline/mcp tools.
// Each tool's outputSchema is defined here so server.ts stays readable.

import { z } from 'zod';

// ---- Shared building blocks ------------------------------------------------

export const DiagnosticSchema = z.object({
    file: z.string(),
    line: z.number(),
    column: z.number(),
    severity: z.enum(['error', 'warning']),
    code: z.string(),
    message: z.string(),
});

// ---- Tool output schemas ---------------------------------------------------

export const ValidateOutputSchema = z.object({
    ok: z.boolean(),
    diagnostics: z.array(DiagnosticSchema),
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
    shareUrl: z.string().optional(),
});

export const ExportOutputSchema = z.object({
    format: z.string(),
    path: z.string().optional(),
    bytes: z.number().optional(),
    shareUrl: z.string().optional(),
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
