import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
    isRoutedResolveDiagnostic,
    type NowlineFile,
    type ResolveDiagnostic,
    resolveIncludes,
} from '@nowline/core';
import {
    type ExportFormat,
    exportDocument,
    type HostEnv,
    type RenderInputs,
} from '@nowline/export';
import { lengthToPoints, parseLength } from '@nowline/export-core';
import {
    type NonWorkingDisplay,
    type NormalizedZone,
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
import { parseNonWorkingArg } from '../cli/non-working.js';
import { resolveRenderOutputPath } from '../cli/output-path.js';
import { resolveTheme } from '../cli/theme.js';
import { parseNowlineJson } from '../convert/parse-json.js';
import { printNowlineFile } from '../convert/printer.js';
import { serializeToJson } from '../convert/schema.js';
import { getServices, parseSource } from '../core/parse.js';
import {
    adaptResolveDiagnostic,
    type CliDiagnostic,
    type DiagnosticFormat,
    type DiagnosticSource,
    formatDiagnostics,
} from '../diagnostics/index.js';
import {
    describeContentLocaleSource,
    operatorLocale,
    readDirectiveLocale,
    resolveLocaleOverride,
} from '../i18n/locale.js';
import { loadConfig, type NowlineRc } from '../io/config.js';
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
    const rc = await loadConfigFor(args.positional, cwd);
    const { config } = rc;

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

    const assetRoot = resolveAssetRoot({
        flag: args.assetRoot,
        cwd,
        rc,
        inputDir: input.isStdin ? cwd : path.dirname(input.path),
    });

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
        // Every rc-backed setting resolves flag > .nowlinerc > default.
        theme: resolveTheme(args.theme, config?.theme),
        today: resolveNowCli(args),
        width: parseWidth(pickSetting(args.width, '--width', config, 'width')),
        nonWorking: parseNonWorkingArg(args.nonWorking),
        noLinks: args.noLinks,
        strict: args.strict,
        assetRoot,
        // m2c format-specific options. Strings get parsed inside the format
        // dispatch; the CLI just passes them through.
        pageSize: args.pageSize ?? stringFromConfig(config, 'pdfPageSize'),
        orientation: pickSetting(args.orientation, '--orientation', config, 'pdfOrientation'),
        margin: pickSetting(args.margin, '--margin', config, 'pdfMargin'),
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
        diagnosticFormat: resolveDiagnosticFormat(args),
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
    nonWorking?: NonWorkingDisplay;
    noLinks: boolean;
    strict: boolean;
    assetRoot: ResolvedAssetRoot;
    // m2c format-specific
    pageSize?: string;
    /** Parsed after validation, so its error follows any diagnostics. */
    orientation?: Setting;
    margin?: Setting;
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
    /** True for `--verbose`. Gates the `nowline: locale=...` and `asset-root=...` source lines. */
    verbose: boolean;
    /** How diagnostics are written to stderr. See `resolveDiagnosticFormat`. */
    diagnosticFormat: DiagnosticFormat;
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
    // stderr output. Routed include-resolver diagnostics join the validator's
    // here, so they are reported at the same point and in the same report.
    await parseAndValidate(sourceText, args, { resolveIncludes: true });

    // After validation, like the locale line, so diagnostics lead stderr.
    if (args.verbose) {
        process.stderr.write(
            `nowline: asset-root=${args.assetRoot.dir} (${args.assetRoot.source})\n`,
        );
    }
    const host = createNodeHostEnv(args.assetRoot.dir);

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
        nonWorking: args.nonWorking,
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

/**
 * How an included file is named in diagnostics: relative to the input's
 * display path, so `examples/a.nowline` including `./teams/b.nowline` prints
 * `examples/teams/b.nowline` (absolute when the input was given absolute).
 */
function includeDisplayPath(absPath: string, args: ProduceArgs): string {
    const rel = path.relative(path.dirname(args.absInputPath), absPath);
    if (path.isAbsolute(rel)) return rel;
    const base = args.isStdin ? '' : path.dirname(args.displayPath);
    return path.join(base, rel);
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

/**
 * Parse and validate; on errors, report them and throw. With
 * `resolveIncludes`, a file that has includes is also run through the
 * include resolver, and its routed (wave-rule) diagnostics are reported with
 * the validator's, in the same report (specs/waves.md §6.1). Every other
 * resolver diagnostic is left to the kernel, which re-resolves.
 */
async function parseAndValidate(
    contents: string,
    args: ProduceArgs,
    options: { resolveIncludes?: boolean } = {},
) {
    const result = await parseSource(contents, args.displayPath, { validate: true });
    const diagnostics = [...result.diagnostics];
    const sources = new Map<string, DiagnosticSource>([[args.displayPath, result.source]]);
    let failed = result.hasErrors;
    if (!failed && options.resolveIncludes && result.ast.includes.length > 0) {
        const included = new Map<string, string>();
        for (const d of await resolveRoutedDiagnostics(result.ast, args, included)) {
            const isRoot = d.sourcePath === args.absInputPath;
            const file = isRoot ? args.displayPath : includeDisplayPath(d.sourcePath, args);
            const text = isRoot ? result.source.contents : included.get(d.sourcePath);
            if (text !== undefined) sources.set(file, { file, contents: text });
            diagnostics.push(adaptResolveDiagnostic(d, file, text));
            if (d.severity === 'error') failed = true;
        }
    }
    // Text mode prints only when the run fails. JSON mode prints one document
    // whenever any diagnostic exists, warnings included, so a warnings-only
    // run still exits 0 with the document on stderr.
    if (failed || (args.diagnosticFormat === 'json' && diagnostics.length > 0)) {
        emitDiagnostics(diagnostics, sources, args.operatorLocale, args.diagnosticFormat);
    }
    if (failed) {
        throw new CliError(ExitCode.ValidationError, '');
    }
    if (args.verbose) {
        const directive = readDirectiveLocale(result.ast);
        const { tag, source } = describeContentLocaleSource(directive, args.resolvedLocale);
        process.stderr.write(`nowline: locale=${tag} (${source})\n`);
    }
    return result;
}

/**
 * The routed (wave-rule) diagnostics of resolving `ast`'s includes, reading
 * files as the kernel does; `included` collects each read file's text for
 * code frames. Empty when the resolver reports any other include error: that
 * one is more fundamental, and the kernel reports it as before (exit 3).
 */
async function resolveRoutedDiagnostics(
    ast: NowlineFile,
    args: ProduceArgs,
    included: Map<string, string>,
): Promise<ResolveDiagnostic[]> {
    let diagnostics: ResolveDiagnostic[];
    try {
        ({ diagnostics } = await resolveIncludes(ast, args.absInputPath, {
            services: getServices().Nowline,
            readFile: async (absPath) => {
                const text = await fs.readFile(absPath, 'utf-8');
                included.set(absPath, text);
                return text;
            },
        }));
    } catch {
        // The kernel resolves again and reports the failure.
        return [];
    }
    const legacyError = diagnostics.some(
        (d) => d.severity === 'error' && !isRoutedResolveDiagnostic(d),
    );
    return legacyError ? [] : diagnostics.filter(isRoutedResolveDiagnostic);
}

/** A discovered `.nowlinerc`: `config` is null when the file failed to parse. */
export interface LoadedRc {
    config: NowlineRc | null;
    /** Absolute path of the rc file, when one was found. */
    path?: string;
}

export async function loadConfigFor(inputArg: string, cwd: string): Promise<LoadedRc> {
    try {
        const startDir = inputArg === '-' ? cwd : path.dirname(path.resolve(cwd, inputArg));
        return await loadConfig(startDir);
    } catch {
        return { config: null };
    }
}

export interface ResolvedAssetRoot {
    /** Absolute directory assets resolve against. */
    dir: string;
    /** Where `dir` came from, for the `--verbose` source line. */
    source: '--asset-root' | '.nowlinerc assetRoot' | 'input directory';
}

/**
 * Resolve the asset root: `--asset-root` (relative to cwd), then the
 * `.nowlinerc` `assetRoot` (relative to the rc file's directory), then the
 * input file's directory. The rc value is anchored to the rc file so a
 * project's rc means the same thing from any working directory and in the
 * editor preview, which reads the same key.
 */
export function resolveAssetRoot(inputs: {
    flag: string | undefined;
    cwd: string;
    rc: LoadedRc;
    inputDir: string;
}): ResolvedAssetRoot {
    const { flag, cwd, rc, inputDir } = inputs;
    if (flag) return { dir: path.resolve(cwd, flag), source: '--asset-root' };
    const raw = rc.config?.assetRoot;
    if (raw !== undefined && raw !== null && raw !== '' && rc.path) {
        if (typeof raw !== 'string') {
            throw new CliError(
                ExitCode.InputError,
                `nowline: invalid .nowlinerc assetRoot "${String(raw)}". Expected a directory path.`,
            );
        }
        return { dir: path.resolve(path.dirname(rc.path), raw), source: '.nowlinerc assetRoot' };
    }
    return { dir: inputDir, source: 'input directory' };
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

/**
 * A raw setting and the name to report it under: the flag when one was
 * passed, else the `.nowlinerc` key, so an error points at what the user
 * actually wrote.
 */
interface Setting {
    raw: unknown;
    name: string;
}

function pickSetting(
    flag: string | undefined,
    flagName: string,
    config: NowlineRc | null,
    rcKey: string,
): Setting | undefined {
    if (flag !== undefined) return { raw: flag, name: flagName };
    const raw = config?.[rcKey];
    if (raw === undefined || raw === null) return undefined;
    return { raw, name: `.nowlinerc ${rcKey}` };
}

function parseOrientation(
    setting: Setting | undefined,
): 'portrait' | 'landscape' | 'auto' | undefined {
    if (!setting || setting.raw === '') return undefined;
    const lower = typeof setting.raw === 'string' ? setting.raw.toLowerCase() : undefined;
    if (lower === 'portrait' || lower === 'landscape' || lower === 'auto') return lower;
    throw new CliError(
        ExitCode.InputError,
        `nowline: invalid ${setting.name} "${String(setting.raw)}". Expected portrait, landscape, or auto.`,
    );
}

function parseMargin(setting: Setting | undefined): number | undefined {
    if (!setting || setting.raw === '') return undefined;
    // A bare number is points; YAML and JSON hand the rc one over as a number.
    if (typeof setting.raw === 'number' && Number.isFinite(setting.raw) && setting.raw >= 0) {
        return setting.raw;
    }
    const raw = String(setting.raw);
    if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    try {
        return lengthToPoints(parseLength(raw));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid ${setting.name} "${raw}": ${message}`,
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

function boolFromConfig(config: { [key: string]: unknown } | null, key: string): boolean {
    if (!config) return false;
    const value = config[key];
    return value === true;
}

function parseWidth(setting: Setting | undefined): number | undefined {
    if (!setting || setting.raw === '') return undefined;
    const { raw } = setting;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    if (!Number.isInteger(value) || value < 320) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid ${setting.name} "${String(raw)}". Must be an integer ≥ 320.`,
        );
    }
    return value;
}

/**
 * `--diagnostic-format` is the explicit switch. Left unset, a `--dry-run` that
 * asks for `--format=json` gets JSON diagnostics (the machine-consumer shape
 * in `specs/cli.md`); every other run keeps the text frames.
 */
function resolveDiagnosticFormat(args: ParsedArgs): DiagnosticFormat {
    if (args.diagnosticFormat) return args.diagnosticFormat;
    if (args.dryRun && args.format?.toLowerCase() === 'json') return 'json';
    return 'text';
}

function emitDiagnostics(
    diagnostics: CliDiagnostic[],
    sources: Map<string, DiagnosticSource>,
    operatorLocale: string,
    format: DiagnosticFormat,
): void {
    const rendered = formatDiagnostics(diagnostics, format, sources, {
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
