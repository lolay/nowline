import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { readInput } from '../io/read.js';
import { writeOutput } from '../io/write.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { parseSource, getServices } from '../core/parse.js';
import { resolveIncludes } from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg, type AssetResolver } from '@nowline/renderer';
import { formatDiagnostics, type DiagnosticSource } from '../diagnostics/index.js';
import {
    isBinaryFormat,
    isInputFormat,
    resolveFormat,
    FormatResolutionError,
    type OutputFormat,
} from '../cli/formats.js';
import { resolveRenderOutputPath } from '../cli/output-path.js';
import { loadConfig } from '../io/config.js';
import { serializeToJson } from '../convert/schema.js';
import { printNowlineFile } from '../convert/printer.js';
import { parseNowlineJson } from '../convert/parse-json.js';
import type { ParsedArgs } from '../cli/args.js';

export interface RenderHandlerOptions {
    args: ParsedArgs;
    /** Test seam: cwd override. Defaults to `process.cwd()`. */
    cwd?: string;
}

/**
 * Default render handler. Produces output in the resolved format and writes
 * it to the resolved path (file or stdout). Honors `--dry-run` (skip write
 * step), `--input-format`, and `.json` AST input.
 */
export async function renderHandler(options: RenderHandlerOptions): Promise<void> {
    const { args } = options;
    const cwd = options.cwd ?? process.cwd();

    if (!args.positional) {
        throw new CliError(
            ExitCode.InputError,
            'nowline: missing input file. Pass a path, "-" for stdin, or run `nowline --help`.',
        );
    }

    const isStdoutOutput = args.output === '-';
    const config = await loadConfigFor(args.positional, cwd);

    const format = resolveFormatOrThrow({
        flag: args.format,
        outputPath: args.output,
        configFormat: typeof config?.defaultFormat === 'string' ? config.defaultFormat : undefined,
        isStdout: isStdoutOutput,
    });

    if (args.logLevel === 'verbose') {
        process.stderr.write(`nowline: format=${format} (resolved)\n`);
    }

    const resolvedOutput = resolveRenderOutputPath({
        outputArg: args.output,
        isStdout: isStdoutOutput,
        inputArg: args.positional,
        isStdin: args.positional === '-',
        format,
        cwd,
    });

    const inputFormat = resolveInputFormat(args.positional, args.inputFormat);

    const input = await readInput(args.positional, { cwd });

    const { rendered, isBinary } = await produce({
        format,
        inputFormat,
        contents: input.contents,
        displayPath: input.displayPath,
        absInputPath: input.isStdin ? path.resolve(cwd, 'stdin.nowline') : input.path,
        isStdin: input.isStdin,
        theme: parseTheme(args.theme),
        today: parseTodayArg(args.today),
        width: parseWidthArg(args.width),
        noLinks: args.noLinks,
        strict: args.strict,
        assetRoot: args.assetRoot,
    });

    if (args.dryRun) {
        if (args.logLevel === 'verbose') {
            process.stderr.write('nowline: --dry-run; skipping write\n');
        }
        return;
    }

    await writeOutput(
        resolvedOutput.isStdout ? '-' : resolvedOutput.path,
        rendered,
        isBinary ? 'binary' : 'text',
        { cwd },
    );

    if (args.logLevel === 'verbose' && !resolvedOutput.isStdout) {
        process.stderr.write(`nowline: wrote ${resolvedOutput.path}\n`);
    }
}

function resolveFormatOrThrow(inputs: {
    flag?: string;
    outputPath?: string;
    configFormat?: string;
    isStdout: boolean;
}): OutputFormat {
    try {
        return resolveFormat({
            flagFormat: inputs.flag,
            outputPath: inputs.outputPath,
            configFormat: inputs.configFormat,
            isStdout: inputs.isStdout,
        }).format;
    } catch (err) {
        if (err instanceof FormatResolutionError) {
            throw new CliError(ExitCode.InputError, `nowline: ${err.message}`);
        }
        throw err;
    }
}

function resolveInputFormat(inputArg: string, override: string | undefined): 'nowline' | 'json' {
    if (override) {
        const lower = override.toLowerCase();
        if (!isInputFormat(lower)) {
            throw new CliError(
                ExitCode.InputError,
                `nowline: invalid --input-format "${override}". Expected nowline or json.`,
            );
        }
        return lower;
    }
    if (inputArg === '-') return 'nowline';
    const ext = path.extname(inputArg).toLowerCase();
    if (ext === '.json') return 'json';
    return 'nowline';
}

interface ProduceArgs {
    format: OutputFormat;
    inputFormat: 'nowline' | 'json';
    contents: string;
    displayPath: string;
    absInputPath: string;
    isStdin: boolean;
    theme: ThemeName;
    today?: Date;
    width?: number;
    noLinks: boolean;
    strict: boolean;
    assetRoot?: string;
}

interface ProduceResult {
    rendered: string | Uint8Array;
    isBinary: boolean;
}

async function produce(args: ProduceArgs): Promise<ProduceResult> {
    if (args.format === 'json') {
        return { rendered: await produceJson(args), isBinary: false };
    }
    if (args.format === 'nowline') {
        return { rendered: await produceCanonicalNowline(args), isBinary: false };
    }
    if (args.format === 'svg') {
        return { rendered: await produceSvg(args), isBinary: false };
    }

    if (isBinaryFormat(args.format) || args.format === 'html' || args.format === 'mermaid' || args.format === 'msproj') {
        throw new CliError(
            ExitCode.InputError,
            `nowline: format "${args.format}" is not yet available in this release (ships in m2c). Use -f svg.`,
        );
    }

    throw new CliError(ExitCode.InputError, `nowline: unsupported format "${args.format}".`);
}

async function produceJson(args: ProduceArgs): Promise<string> {
    if (args.inputFormat === 'json') {
        // Re-parse JSON → DSL → JSON to canonicalize through @nowline/core.
        const { ast } = parseNowlineJson(args.contents, args.displayPath);
        const text = printNowlineFile(ast);
        const parsed = await parseAndValidate(text, args.displayPath);
        return JSON.stringify(serializeToJson(parsed.document, text), null, 2);
    }
    const parsed = await parseAndValidate(args.contents, args.displayPath);
    return JSON.stringify(serializeToJson(parsed.document, args.contents), null, 2);
}

async function produceCanonicalNowline(args: ProduceArgs): Promise<string> {
    if (args.inputFormat === 'json') {
        const { ast } = parseNowlineJson(args.contents, args.displayPath);
        return printNowlineFile(ast);
    }
    const parsed = await parseAndValidate(args.contents, args.displayPath);
    const doc = serializeToJson(parsed.document, args.contents);
    return printNowlineFile(doc.ast);
}

async function produceSvg(args: ProduceArgs): Promise<string> {
    const parsed = await parseAndValidate(
        args.inputFormat === 'json' ? jsonToNowlineText(args.contents, args.displayPath) : args.contents,
        args.displayPath,
    );
    const resolved = await resolveIncludes(parsed.ast, args.absInputPath, {
        services: getServices().Nowline,
    });
    for (const diag of resolved.diagnostics) {
        if (diag.severity === 'error') {
            process.stderr.write(`${diag.sourcePath}: ${diag.message}\n`);
        }
    }
    if (resolved.diagnostics.some((d) => d.severity === 'error')) {
        throw new CliError(ExitCode.ValidationError, '');
    }

    const model = layoutRoadmap(parsed.ast, resolved, {
        theme: args.theme,
        today: args.today,
        width: args.width,
    });

    const assetRoot = args.assetRoot
        ? path.resolve(args.assetRoot)
        : path.dirname(args.absInputPath);
    const resolver: AssetResolver = createAssetResolver(assetRoot);

    const warnings: string[] = [];
    const svg = await renderSvg(model, {
        assetResolver: resolver,
        noLinks: args.noLinks,
        strict: args.strict,
        warn: (msg) => warnings.push(msg),
    });

    for (const w of warnings) {
        process.stderr.write(`warning: ${w}\n`);
    }
    return svg;
}

function jsonToNowlineText(contents: string, displayPath: string): string {
    const { ast } = parseNowlineJson(contents, displayPath);
    return printNowlineFile(ast);
}

async function parseAndValidate(contents: string, displayPath: string) {
    const result = await parseSource(contents, displayPath, { validate: true });
    if (result.hasErrors) {
        emitDiagnostics(result.diagnostics, result.source, displayPath);
        throw new CliError(ExitCode.ValidationError, '');
    }
    return result;
}

async function loadConfigFor(inputArg: string, cwd: string): Promise<{ defaultFormat?: string } | null> {
    try {
        if (inputArg === '-') {
            const { config } = await loadConfig(cwd);
            return config;
        }
        const abs = path.resolve(cwd, inputArg);
        const dir = path.dirname(abs);
        const { config } = await loadConfig(dir);
        return config;
    } catch {
        return null;
    }
}

function parseTheme(raw: string | undefined): ThemeName {
    if (!raw) return 'light';
    const lower = raw.toLowerCase();
    if (lower !== 'light' && lower !== 'dark') {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --theme "${raw}". Expected light or dark.`,
        );
    }
    return lower;
}

function parseTodayArg(raw: string | undefined): Date | undefined {
    if (!raw) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --today "${raw}". Expected YYYY-MM-DD.`,
        );
    }
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
}

function parseWidthArg(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 320) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --width "${raw}". Must be an integer ≥ 320.`,
        );
    }
    return value;
}

function emitDiagnostics(
    diagnostics: Parameters<typeof formatDiagnostics>[0],
    source: DiagnosticSource,
    displayPath: string,
): void {
    const sources = new Map<string, DiagnosticSource>([[displayPath, source]]);
    const rendered = formatDiagnostics(diagnostics, 'text', sources, {
        color: process.stderr.isTTY === true,
    });
    if (rendered) process.stderr.write(`${rendered}\n`);
}

export function createAssetResolver(assetRoot: string): AssetResolver {
    const root = path.resolve(assetRoot);
    return async (ref: string) => {
        const absPath = path.resolve(root, ref);
        if (!absPath.startsWith(root + path.sep) && absPath !== root) {
            throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
        }
        const bytes = await fs.readFile(absPath);
        const mime = guessMime(absPath);
        return { bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), mime };
    };
}

function guessMime(p: string): string {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}
