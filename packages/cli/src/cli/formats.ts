import * as path from 'node:path';

export type OutputFormat =
    | 'svg'
    | 'png'
    | 'pdf'
    | 'html'
    | 'mermaid'
    | 'xlsx'
    | 'msproj'
    | 'json'
    | 'nowline';

export type InputFormat = 'nowline' | 'json';

const TEXT_FORMATS: ReadonlySet<OutputFormat> = new Set([
    'svg',
    'html',
    'mermaid',
    'msproj',
    'json',
    'nowline',
]);

const BINARY_FORMATS: ReadonlySet<OutputFormat> = new Set(['png', 'pdf', 'xlsx']);

export const ALL_OUTPUT_FORMATS: readonly OutputFormat[] = [
    'svg', 'png', 'pdf', 'html', 'mermaid', 'xlsx', 'msproj', 'json', 'nowline',
];

export function isOutputFormat(value: string): value is OutputFormat {
    return (ALL_OUTPUT_FORMATS as readonly string[]).includes(value);
}

/**
 * User-facing format aliases. The canonical token is `msproj` (matches the
 * package name `@nowline/export-msproj`); `ms-project` and `mspx` are
 * accepted shorthands documented in `specs/handoffs/m2c.md` § 8.
 */
const FORMAT_ALIASES: Readonly<Record<string, OutputFormat>> = {
    'ms-project': 'msproj',
    msproject: 'msproj',
    mspx: 'msproj',
    md: 'mermaid',
    markdown: 'mermaid',
    excel: 'xlsx',
    'ms-excel': 'xlsx',
};

export function normalizeFormatAlias(raw: string): string {
    const lower = raw.toLowerCase();
    return FORMAT_ALIASES[lower] ?? lower;
}

export function isInputFormat(value: string): value is InputFormat {
    return value === 'nowline' || value === 'json';
}

export function isBinaryFormat(format: OutputFormat): boolean {
    return BINARY_FORMATS.has(format);
}

export function isTextFormat(format: OutputFormat): boolean {
    return TEXT_FORMATS.has(format);
}

const EXTENSION_MAP: ReadonlyMap<string, OutputFormat> = new Map<string, OutputFormat>([
    ['.svg', 'svg'],
    ['.png', 'png'],
    ['.pdf', 'pdf'],
    ['.html', 'html'],
    ['.htm', 'html'],
    ['.md', 'mermaid'],
    ['.markdown', 'mermaid'],
    ['.xlsx', 'xlsx'],
    ['.json', 'json'],
    ['.nowline', 'nowline'],
]);

const CANONICAL_EXTENSION: Readonly<Record<OutputFormat, string>> = {
    svg: '.svg',
    png: '.png',
    pdf: '.pdf',
    html: '.html',
    mermaid: '.md',
    xlsx: '.xlsx',
    msproj: '.xml',
    json: '.json',
    nowline: '.nowline',
};

/**
 * Maps a recognized output extension to its canonical format.
 *
 * `.xml` is intentionally absent — it is ambiguous (MS Project XML vs generic
 * XML) and requires `-f msproj` to disambiguate.
 */
export function formatFromExtension(extension: string): OutputFormat | undefined {
    return EXTENSION_MAP.get(extension.toLowerCase());
}

export function canonicalExtension(format: OutputFormat): string {
    return CANONICAL_EXTENSION[format];
}

export interface FormatResolutionInputs {
    /** `-f / --format` flag value (already lower-cased). */
    flagFormat?: string;
    /** `-o / --output` path; the literal string the user wrote. */
    outputPath?: string;
    /** `defaultFormat` from `.nowlinerc`. */
    configFormat?: string;
    /** True when output is `-` (stdout); skips extension inference. */
    isStdout?: boolean;
}

export interface FormatResolution {
    format: OutputFormat;
    /** Where the format came from. Useful for `-v` diagnostics. */
    source: 'flag' | 'output-extension' | 'config' | 'fallback';
}

/**
 * Resolves the output format using the documented precedence chain:
 *
 *   1. `-f / --format` flag
 *   2. `-o <path>` recognized extension (skipped for `-` / stdout)
 *   3. `.nowlinerc` `defaultFormat`
 *   4. Built-in fallback `svg`
 *
 * Returns the resolved format and the precedence step that produced it. May
 * throw a `FormatResolutionError` for unsupported / ambiguous inputs (caller
 * is expected to surface this as an exit-2 usage error).
 */
export function resolveFormat(inputs: FormatResolutionInputs): FormatResolution {
    if (inputs.flagFormat) {
        const flag = normalizeFormatAlias(inputs.flagFormat);
        if (!isOutputFormat(flag)) {
            throw new FormatResolutionError(
                `Unknown --format "${inputs.flagFormat}". Expected one of: ${ALL_OUTPUT_FORMATS.join(', ')}.`,
            );
        }
        return { format: flag, source: 'flag' };
    }

    if (!inputs.isStdout && inputs.outputPath) {
        const ext = path.extname(inputs.outputPath);
        if (ext) {
            if (ext.toLowerCase() === '.xml') {
                throw new FormatResolutionError(
                    'Cannot infer format from .xml extension; use -f msproj for MS Project XML output.',
                );
            }
            const inferred = formatFromExtension(ext);
            if (inferred) {
                return { format: inferred, source: 'output-extension' };
            }
        }
    }

    if (inputs.configFormat) {
        const cfg = normalizeFormatAlias(inputs.configFormat);
        if (!isOutputFormat(cfg)) {
            throw new FormatResolutionError(
                `Invalid .nowlinerc defaultFormat "${inputs.configFormat}". Expected one of: ${ALL_OUTPUT_FORMATS.join(', ')}.`,
            );
        }
        return { format: cfg, source: 'config' };
    }

    return { format: 'svg', source: 'fallback' };
}

/**
 * Applies the documented output-extension auto-add rule:
 *
 * - If `<path>` ends in no extension, append the canonical extension for the
 *   resolved format (`-o report -f pdf` → `report.pdf`).
 * - If `<path>` ends in the canonical extension for the resolved format, leave
 *   it alone.
 * - If `<path>` ends in any *other* extension, leave it alone (no auto-rename).
 *   The user wrote literal bytes; we trust them.
 *
 * Stdout (`-`) is never rewritten; callers should bypass this helper for stdout.
 */
export function autoAddExtension(outputPath: string, format: OutputFormat): string {
    const ext = path.extname(outputPath);
    if (!ext) {
        return outputPath + canonicalExtension(format);
    }
    return outputPath;
}

export class FormatResolutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FormatResolutionError';
    }
}
