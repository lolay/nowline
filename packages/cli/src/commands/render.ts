import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { readInput } from '../io/read.js';
import { writeOutput } from '../io/write.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { parseSource, getServices } from '../core/parse.js';
import { resolveIncludes } from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg, type AssetResolver } from '@nowline/renderer';
import { parseLength, lengthToPoints } from '@nowline/export-core';
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
import {
    describeContentLocaleSource,
    operatorLocale,
    readDirectiveLocale,
    resolveLocaleOverride,
} from '../i18n/locale.js';

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

    const resolved = resolveLocaleOverride({
        flag: args.locale,
        env: process.env,
        rc: stringFromConfig(config, 'locale'),
    });
    const locale = resolved.tag;
    const opLocale = operatorLocale(resolved);

    const { rendered, isBinary } = await produce({
        format,
        inputFormat,
        contents: input.contents,
        displayPath: input.displayPath,
        absInputPath: input.isStdin ? path.resolve(cwd, 'stdin.nowline') : input.path,
        isStdin: input.isStdin,
        theme: parseTheme(args.theme),
        today: resolveNowArg(args),
        width: parseWidthArg(args.width),
        noLinks: args.noLinks,
        strict: args.strict,
        assetRoot: args.assetRoot,
        // m2c format-specific options. Strings get parsed inside the format
        // dispatch; the CLI just passes them through.
        pageSize: args.pageSize ?? stringFromConfig(config, 'pdfPageSize'),
        orientation: args.orientation ?? stringFromConfig(config, 'pdfOrientation'),
        margin: args.margin ?? stringFromConfig(config, 'pdfMargin'),
        fontSans: args.fontSans ?? stringFromConfig(config, 'fontSans'),
        fontMono: args.fontMono ?? stringFromConfig(config, 'fontMono'),
        headless: args.headless || boolFromConfig(config, 'headlessFonts'),
        scale: args.scale,
        start: args.start,
        locale,
        operatorLocale: opLocale,
        resolvedLocale: resolved,
        verbose: args.logLevel === 'verbose',
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
    // m2c format-specific
    pageSize?: string;
    orientation?: string;
    margin?: string;
    fontSans?: string;
    fontMono?: string;
    headless: boolean;
    scale?: string;
    start?: string;
    /** Resolved locale override (CLI flag or env-var fallback); undefined falls through to the directive. */
    locale?: string;
    /** Operator locale used to format CLI message output (validator diagnostics on stderr). */
    operatorLocale: string;
    /** Resolved locale override metadata, used for the verbose-mode source line. */
    resolvedLocale: import('../i18n/locale.js').ResolvedLocale;
    /** True for `--verbose`. Gates the `nowline: locale=...` source-line emission. */
    verbose: boolean;
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

    // The remaining formats all start from a positioned model + (sometimes) an
    // SVG. Build them once and dispatch to the format-specific exporter via
    // dynamic import — keeps each exporter's heavy deps off cold paths and
    // leaves room to re-extract a package later if a future build profile
    // wants to slim down.
    const stage = await stageRoadmap(args);

    if (args.format === 'svg') {
        return { rendered: stage.svg, isBinary: false };
    }
    try {
        if (args.format === 'html') {
            const mod = await import('@nowline/export-html');
            const html = await mod.exportHtml(stage.exportInputs, stage.svg);
            return { rendered: html, isBinary: false };
        }
        if (args.format === 'mermaid') {
            const mod = await import('@nowline/export-mermaid');
            const md = mod.exportMermaid(stage.exportInputs);
            return { rendered: md, isBinary: false };
        }
        if (args.format === 'msproj') {
            const mod = await import('@nowline/export-msproj');
            const xml = mod.exportMsProjXml(stage.exportInputs, {
                startDate: args.start,
            });
            return { rendered: xml, isBinary: false };
        }
        if (args.format === 'png') {
            const fonts = await stage.fontPair();
            const mod = await import('@nowline/export-png');
            const png = await mod.exportPng(stage.exportInputs, stage.svg, {
                scale: parseScale(args.scale),
                fonts,
            });
            return { rendered: png, isBinary: true };
        }
        if (args.format === 'pdf') {
            const fonts = await stage.fontPair();
            const mod = await import('@nowline/export-pdf');
            const pdf = await mod.exportPdf(stage.exportInputs, stage.svg, {
                pageSize: args.pageSize,
                orientation: parseOrientation(args.orientation),
                marginPt: parseMargin(args.margin),
                fonts,
            });
            return { rendered: pdf, isBinary: true };
        }
        if (args.format === 'xlsx') {
            const mod = await import('@nowline/export-xlsx');
            const xlsx = await mod.exportXlsx(stage.exportInputs, {
                generated: args.today,
            });
            return { rendered: xlsx, isBinary: true };
        }
    } catch (err) {
        if (err instanceof CliError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(
            ExitCode.OutputError,
            `nowline: ${args.format} export failed: ${message}`,
        );
    }

    throw new CliError(ExitCode.InputError, `nowline: unsupported format "${args.format}".`);
}

async function produceJson(args: ProduceArgs): Promise<string> {
    if (args.inputFormat === 'json') {
        // Re-parse JSON → DSL → JSON to canonicalize through @nowline/core.
        const { ast } = parseNowlineJson(args.contents, args.displayPath);
        const text = printNowlineFile(ast);
        const parsed = await parseAndValidate(text, args);
        return JSON.stringify(serializeToJson(parsed.document, text), null, 2);
    }
    const parsed = await parseAndValidate(args.contents, args);
    return JSON.stringify(serializeToJson(parsed.document, args.contents), null, 2);
}

async function produceCanonicalNowline(args: ProduceArgs): Promise<string> {
    if (args.inputFormat === 'json') {
        const { ast } = parseNowlineJson(args.contents, args.displayPath);
        return printNowlineFile(ast);
    }
    const parsed = await parseAndValidate(args.contents, args);
    const doc = serializeToJson(parsed.document, args.contents);
    return printNowlineFile(doc.ast);
}

interface StagedRoadmap {
    svg: string;
    exportInputs: import('@nowline/export-core').ExportInputs;
    /** Lazy: only loads the resolved font pair when a format actually needs it. */
    fontPair: () => Promise<import('@nowline/export-core').ResolvedFontPair>;
}

async function stageRoadmap(args: ProduceArgs): Promise<StagedRoadmap> {
    const parsed = await parseAndValidate(
        args.inputFormat === 'json' ? jsonToNowlineText(args.contents, args.displayPath) : args.contents,
        args,
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
        locale: args.locale,
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

    let cachedFonts: import('@nowline/export-core').ResolvedFontPair | undefined;
    const fontPair = async () => {
        if (cachedFonts) return cachedFonts;
        const mod = await import('@nowline/export-core');
        const result = await mod.resolveFonts({
            fontSans: args.fontSans,
            fontMono: args.fontMono,
            headless: args.headless,
        });
        if (args.strict) {
            if (result.sansFellBackToBundled) {
                process.stderr.write(
                    'warning: sans font fell back to bundled DejaVu (no platform font found)\n',
                );
            }
            if (result.monoFellBackToBundled) {
                process.stderr.write(
                    'warning: mono font fell back to bundled DejaVu (no platform font found)\n',
                );
            }
        }
        cachedFonts = { sans: result.sans, mono: result.mono };
        return cachedFonts;
    };

    return {
        svg,
        exportInputs: {
            ast: parsed.ast,
            resolved,
            model,
            sourcePath: args.displayPath,
            today: args.today,
        },
        fontPair,
    };
}

function jsonToNowlineText(contents: string, displayPath: string): string {
    const { ast } = parseNowlineJson(contents, displayPath);
    return printNowlineFile(ast);
}

async function parseAndValidate(contents: string, args: ProduceArgs) {
    const result = await parseSource(contents, args.displayPath, { validate: true });
    if (result.hasErrors) {
        emitDiagnostics(result.diagnostics, result.source, args.displayPath, args.operatorLocale);
        throw new CliError(ExitCode.ValidationError, '');
    }
    if (args.verbose) {
        const directive = readDirectiveLocale(result.ast);
        const { tag, source } = describeContentLocaleSource(directive, args.resolvedLocale);
        process.stderr.write(`nowline: locale=${tag} (${source})\n`);
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

// Resolve the now-line date from the CLI flag.
//
// Precedence:
//   1. `--now -`            → undefined  (suppresses the now-line)
//   2. `--now <YYYY-MM-DD>` → that date
//   3. flag omitted          → today (UTC calendar date)
//
// The "default to today" behavior matches what the tool's name promises —
// you should see a "now" line by default. Use `--now -` to opt out (Unix
// `-` sentinel, mirroring `-o -` for stdout), or `--now <date>` for
// deterministic snapshots / planning a hypothetical date.
function resolveNowArg(args: { now?: string }): Date | undefined {
    if (args.now === '-') return undefined;
    if (args.now) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(args.now);
        if (!m) {
            throw new CliError(
                ExitCode.InputError,
                `nowline: invalid --now "${args.now}". Expected YYYY-MM-DD or "-".`,
            );
        }
        return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    }
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function parseScale(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --scale "${raw}". Must be a positive number.`,
        );
    }
    return value;
}

function parseOrientation(raw: string | undefined): 'portrait' | 'landscape' | 'auto' | undefined {
    if (!raw) return undefined;
    const lower = raw.toLowerCase();
    if (lower === 'portrait' || lower === 'landscape' || lower === 'auto') return lower;
    throw new CliError(
        ExitCode.InputError,
        `nowline: invalid --orientation "${raw}". Expected portrait, landscape, or auto.`,
    );
}

function parseMargin(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw); // bare number → points
    try {
        return lengthToPoints(parseLength(raw));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --margin "${raw}": ${message}`,
        );
    }
}

function stringFromConfig(
    config: { [key: string]: unknown } | null,
    key: string,
): string | undefined {
    if (!config) return undefined;
    const value = config[key];
    return typeof value === 'string' ? value : undefined;
}

function boolFromConfig(
    config: { [key: string]: unknown } | null,
    key: string,
): boolean {
    if (!config) return false;
    const value = config[key];
    return value === true;
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
    operatorLocale: string,
): void {
    const sources = new Map<string, DiagnosticSource>([[displayPath, source]]);
    const rendered = formatDiagnostics(diagnostics, 'text', sources, {
        color: process.stderr.isTTY === true,
        operatorLocale,
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
