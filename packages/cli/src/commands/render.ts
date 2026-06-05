import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
} from '@nowline/export';
import { lengthToPoints, parseLength } from '@nowline/export-core';
import {
    type NormalizedZone,
    normalizeThemeName,
    normalizeZone,
    resolveToday,
    type ThemeName,
    TimezoneError,
} from '@nowline/layout';
import type { AssetResolver } from '@nowline/renderer';
import type { ParsedArgs } from '../cli/args.js';
import {
    FormatResolutionError,
    isInputFormat,
    type OutputFormat,
    resolveFormat,
} from '../cli/formats.js';
import { resolveRenderOutputPath } from '../cli/output-path.js';
import { parseNowlineJson } from '../convert/parse-json.js';
import { printNowlineFile } from '../convert/printer.js';
import { serializeToJson } from '../convert/schema.js';
import { parseSource } from '../core/parse.js';
import { type DiagnosticSource, formatDiagnostics } from '../diagnostics/index.js';
import {
    describeContentLocaleSource,
    operatorLocale,
    readDirectiveLocale,
    resolveLocaleOverride,
} from '../i18n/locale.js';
import { loadConfig } from '../io/config.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { readInput } from '../io/read.js';
import { writeOutput } from '../io/write.js';

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
        today: resolveNowCli(args),
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
        useSystemFonts: args.useSystemFonts || boolFromConfig(config, 'useSystemFonts'),
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
    /** Opt in to system-font probing for raster/PDF export (bundled-first by default). */
    useSystemFonts: boolean;
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

const BINARY_FORMATS = new Set<OutputFormat>(['png', 'pdf', 'xlsx']);
const FONT_FORMATS = new Set<OutputFormat>(['png', 'pdf']);

async function produce(args: ProduceArgs): Promise<ProduceResult> {
    // `nowline` canonical-text format is not part of ExportFormat; handle here.
    if (args.format === 'nowline') {
        return { rendered: await produceCanonicalNowline(args), isBinary: false };
    }

    // Convert JSON-AST input to DSL text before handing to the kernel.
    const sourceText =
        args.inputFormat === 'json'
            ? jsonToNowlineText(args.contents, args.displayPath)
            : args.contents;

    // Pre-validate with locale-aware diagnostic formatting so validation
    // errors reach the operator in their locale. The kernel will re-parse
    // the same source below — double work accepted in exchange for faithful
    // stderr output.
    await parseAndValidate(sourceText, args);

    const assetRoot = args.assetRoot
        ? path.resolve(args.assetRoot)
        : path.dirname(args.absInputPath);

    const host = createNodeHostEnv(assetRoot);

    // Resolve fonts lazily — only for formats that rasterize or embed them.
    let fonts: RenderInputs['fonts'];
    if (FONT_FORMATS.has(args.format)) {
        fonts = await resolveNodeFonts(args);
    }

    const kernelInputs: RenderInputs = {
        sourcePath: args.absInputPath,
        today: args.today,
        locale: args.locale ?? 'und',
        theme: args.theme,
        fonts,
        width: args.width,
        noLinks: args.noLinks,
        strict: args.strict,
        pageSize: args.pageSize,
        orientation: parseOrientation(args.orientation),
        marginPt: parseMargin(args.margin),
        pngScale: parseScale(args.scale),
        msprojStart: args.start,
    };

    try {
        const bytes = await exportDocument(
            sourceText,
            args.format as ExportFormat,
            kernelInputs,
            host,
        );
        const isBinary = BINARY_FORMATS.has(args.format);
        const rendered: string | Uint8Array = isBinary
            ? bytes
            : new TextDecoder('utf-8').decode(bytes);
        return { rendered, isBinary };
    } catch (err) {
        if (err instanceof CliError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(
            ExitCode.OutputError,
            `nowline: ${args.format} export failed: ${message}`,
        );
    }
}

// ---- Node HostEnv -----------------------------------------------------------

function createNodeHostEnv(assetRoot: string): HostEnv {
    const root = path.resolve(assetRoot);
    return {
        readSource: async (absPath: string): Promise<string> => {
            return await fs.readFile(absPath, 'utf-8');
        },
        readAsset: async (ref: string): Promise<Uint8Array> => {
            const absPath = path.resolve(root, ref);
            if (!absPath.startsWith(root + path.sep) && absPath !== root) {
                throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
            }
            const bytes = await fs.readFile(absPath);
            return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        },
        loadWasm: async (): Promise<ArrayBuffer> => {
            // Two code paths:
            //
            // 1. Bun compiled binary: scripts/bun-entry.mjs imports
            //    dist/resvg.wasm via `with { type: 'file' }` (the only Bun
            //    pattern the bundler embeds) and stashes the VFS path in
            //    globalThis.__RESVG_WASM_PATH__. Read it with Bun.file().
            //
            // 2. Plain Node.js (dev, tests, uncompiled dist/index.js run):
            //    dist/resvg.wasm is copied by scripts/copy-wasm.mjs (postbuild).
            //    Use fs.readFile via a new URL relative to this module.
            // biome-ignore lint/suspicious/noExplicitAny: Bun-specific global not in TS types
            const bunWasmPath = (globalThis as any).__RESVG_WASM_PATH__ as string | undefined;
            if (bunWasmPath) {
                // biome-ignore lint/suspicious/noExplicitAny: Bun-specific global not in TS types
                return (globalThis as any).Bun.file(
                    bunWasmPath,
                ).arrayBuffer() as Promise<ArrayBuffer>;
            }
            const wasmUrl = new URL('../resvg.wasm', import.meta.url);
            const bytes = await fs.readFile(wasmUrl);
            return bytes.buffer as ArrayBuffer;
        },
    };
}

// ---- Font resolution --------------------------------------------------------

async function resolveNodeFonts(
    args: ProduceArgs,
): Promise<import('@nowline/export-core').ResolvedFontPair> {
    const { resolveFonts } = await import('@nowline/export-core');
    const result = await resolveFonts({
        fontSans: args.fontSans,
        fontMono: args.fontMono,
        headless: args.headless,
        useSystemFonts: args.useSystemFonts,
    });

    // A variable font was explicitly requested but cannot be rasterized; we
    // substituted bundled DejaVu. Always warn — and fail under --strict, since
    // the requested font silently did not apply.
    const vfSubstituted = result.sansVariableFontSubstituted || result.monoVariableFontSubstituted;
    if (vfSubstituted) {
        const roles = [
            result.sansVariableFontSubstituted ? 'sans' : null,
            result.monoVariableFontSubstituted ? 'mono' : null,
        ].filter(Boolean) as string[];
        const message = `requested variable font(s) for ${roles.join(
            ', ',
        )} cannot be rasterized; substituted bundled DejaVu`;
        if (args.strict) {
            throw new CliError(ExitCode.InputError, `nowline: ${message}`);
        }
        process.stderr.write(`warning: ${message}\n`);
    }

    // Bundled fallback after an opted-in probe found no usable system font.
    // Only meaningful when --use-system-fonts is set; warn under --strict.
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
    return { sans: result.sans, mono: result.mono };
}

// ---- nowline canonical-text format (not part of ExportFormat) ---------------

async function produceCanonicalNowline(args: ProduceArgs): Promise<string> {
    if (args.inputFormat === 'json') {
        const { ast } = parseNowlineJson(args.contents, args.displayPath);
        return printNowlineFile(ast);
    }
    const parsed = await parseAndValidate(args.contents, args);
    const doc = serializeToJson(parsed.document, args.contents);
    return printNowlineFile(doc.ast);
}

// ---- Shared helpers ---------------------------------------------------------

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

async function loadConfigFor(
    inputArg: string,
    cwd: string,
): Promise<{ defaultFormat?: string } | null> {
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
    // `greyscale` (UK) is accepted and canonicalized to `grayscale` (US).
    const theme = normalizeThemeName(raw);
    if (!theme) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --theme "${raw}". Expected light, dark, or grayscale.`,
        );
    }
    return theme;
}

// Resolve the now-line date from the CLI flags.
//
// Precedence:
//   1. `--now -`                           → undefined (suppress now-line)
//   2. `--now YYYY-MM-DD`                  → floating date; zone ignored
//   3. `--now YYYY-MM-DDTHH:MM:SS[±HH:MM]` → civil date at embedded offset; --timezone ignored
//   4. `--now YYYY-MM-DDTHH:MM:SSZ`        → civil date in UTC; --timezone ignored
//   5. `--now YYYY-MM-DDTHH:MM:SS`         → floating; written date part; zone ignored
//   6. flag omitted                        → civil date of today in --timezone (default: local)
//
// `--timezone` is only consulted for case 6. Authored dates in the roadmap
// (bars, milestones, axis) are floating and are never affected.
function resolveNowCli(args: { now?: string; timezone?: string }): Date | undefined {
    let zone: NormalizedZone | undefined;
    if (args.timezone) {
        try {
            zone = normalizeZone(args.timezone);
        } catch (err) {
            if (err instanceof TimezoneError) {
                throw new CliError(ExitCode.InputError, err.message);
            }
            throw err;
        }
    }
    const result = resolveToday({ now: args.now, zone });
    // resolveToday returns undefined for unrecognised strings; surface that as
    // an input error so the user gets a clear message instead of a silent no-line.
    if (result === undefined && args.now !== undefined && args.now !== '-') {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid --now "${args.now}". ` +
                `Expected YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-".`,
        );
    }
    return result;
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
        throw new CliError(ExitCode.InputError, `nowline: invalid --margin "${raw}": ${message}`);
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

function boolFromConfig(config: { [key: string]: unknown } | null, key: string): boolean {
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

// ---- Asset resolver (still used by serve.ts) --------------------------------

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
