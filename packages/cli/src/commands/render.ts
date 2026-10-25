import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IncludePolicy, ResolveDiagnostic } from '@nowline/core';
import {
    acceptStagedRoadmap,
    type ExportFormat,
    exportStaged,
    type HostEnv,
    type RenderInputs,
    type StageResult,
    stageForExport,
} from '@nowline/export';
import type { PdfPageSize } from '@nowline/export-core';
import type { NonWorkingDisplay, ThemeName } from '@nowline/layout';
import type { AssetResolver } from '@nowline/renderer';
import type { ParsedArgs } from '../cli/args.js';
import {
    FormatResolutionError,
    isInputFormat,
    type OutputFormat,
    resolveFormat,
} from '../cli/formats.js';
import { resolveIncludeSetup } from '../cli/include-policy.js';
import { type PdfOrientation, resolveCliOptions } from '../cli/options.js';
import { resolveRenderOutputPath } from '../cli/output-path.js';
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
import { type LoadConfigResult, loadConfig } from '../io/config.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { createLog, type Log } from '../io/log.js';
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
    const log = createLog(args.logLevel);
    const { config, path: rcPath } = await loadConfigFor(args.positional, cwd);
    // Every rc-backed setting resolves flag > .nowlinerc > default; a bad
    // value is reported by `assertValid` below, where it always has been.
    const cliOptions = resolveCliOptions(args, config, { rcPath });

    const format = resolveFormatOrThrow({
        flag: args.format,
        outputPath: args.output,
        configFormat: cliOptions.defaultFormat,
        isStdout: isStdoutOutput,
    });

    log.verbose(`nowline: format=${format} (resolved)`);

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
    const includes = await resolveIncludeSetup(args, input.isStdin ? undefined : input.path, cwd);

    const resolved = resolveLocaleOverride({
        flag: args.locale,
        env: process.env,
        rc: cliOptions.rcLocale,
    });
    const locale = resolved.tag;
    const opLocale = operatorLocale(resolved);
    cliOptions.assertValid();

    const { rendered, isBinary } = await produce({
        format,
        inputFormat,
        contents: input.contents,
        displayPath: input.displayPath,
        absInputPath: includes.inputPath,
        isStdin: input.isStdin,
        includePolicy: includes.policy,
        includeRoot: includes.root,
        theme: cliOptions.surface.theme,
        today: cliOptions.surface.today,
        width: cliOptions.surface.width,
        nonWorking: cliOptions.surface.nonWorking,
        noLinks: args.noLinks,
        strict: args.strict,
        assetRoot: cliOptions.assetRoot,
        // m2c format-specific options. The PDF settings parse in `produce`,
        // after validation, for every format.
        pageSize: cliOptions.surface.pageSize,
        orientation: cliOptions.orientation,
        marginPt: cliOptions.margin,
        assertPdfSettingsValid: () => cliOptions.assertPdfSettingsValid(),
        fontSans: cliOptions.fontSans,
        fontMono: cliOptions.fontMono,
        headless: cliOptions.headless,
        useSystemFonts: cliOptions.useSystemFonts,
        scale: args.scale,
        start: args.start,
        locale,
        operatorLocale: opLocale,
        resolvedLocale: resolved,
        log,
        diagnosticFormat: resolveDiagnosticFormat(args),
    });

    if (args.dryRun) {
        log.verbose('nowline: --dry-run; skipping write');
        return;
    }

    await writeOutput(
        resolvedOutput.isStdout ? '-' : resolvedOutput.path,
        rendered,
        isBinary ? 'binary' : 'text',
        { cwd },
    );

    if (!resolvedOutput.isStdout) {
        log.verbose(`nowline: wrote ${resolvedOutput.path}`);
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
    includePolicy?: IncludePolicy;
    /** `--include-root` as a real path: included files are named relative to it. */
    includeRoot?: string;
    theme: ThemeName;
    today?: Date;
    width?: number;
    nonWorking?: NonWorkingDisplay;
    noLinks: boolean;
    strict: boolean;
    assetRoot?: string;
    // m2c format-specific
    pageSize?: PdfPageSize;
    orientation?: PdfOrientation;
    /** Page margin in points. */
    marginPt?: number;
    /** Reports a bad PDF setting; run after validation so its error follows any diagnostics. */
    assertPdfSettingsValid: () => void;
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
    /** `-v` / `-q` gate: verbose lines, warnings, and text-mode warning diagnostics. */
    log: Log;
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

    const assetRoot = args.assetRoot
        ? path.resolve(args.assetRoot)
        : path.dirname(args.absInputPath);

    // Included files' text, kept for the code frames of routed diagnostics.
    const included = new Map<string, string>();
    const nodeHost = createNodeHostEnv(assetRoot);
    const host: HostEnv = {
        ...nodeHost,
        readSource: async (absPath) => {
            const text = await nodeHost.readSource(absPath);
            included.set(absPath, text);
            return text;
        },
    };

    // What the stage lays out with; the export below must ask for the same.
    const layoutInputs: RenderInputs = {
        sourcePath: args.absInputPath,
        today: args.today,
        locale: args.locale ?? 'und',
        theme: args.theme,
        width: args.width,
        nonWorking: args.nonWorking,
    };

    // Parse and stage once. Validation diagnostics come out in the operator's
    // locale, and routed include-resolver diagnostics join the validator's
    // here, so they are reported at the same point and in the same report.
    const { stage, stageFailure } = await parseAndValidate(sourceText, args, {
        stage: { inputs: layoutInputs, host, included },
    });

    // Resolve fonts lazily — only for formats that rasterize or embed them.
    let fonts: RenderInputs['fonts'];
    if (FONT_FORMATS.has(args.format)) {
        fonts = await resolveNodeFonts(args);
    }

    args.assertPdfSettingsValid();

    const kernelInputs: RenderInputs = {
        ...layoutInputs,
        fonts,
        noLinks: args.noLinks,
        strict: args.strict,
        pageSize: args.pageSize,
        orientation: args.orientation,
        marginPt: args.marginPt,
        pngScale: parseScale(args.scale),
        msprojStart: args.start,
        onNotice: (message) => args.log.notice(message),
        onWarning: (message) => args.log.notice(`warning: ${message}`),
    };

    try {
        // A stage failure or an uncoded include error was held back until
        // here, so a bad font or PDF setting is still reported first.
        if (!stage) throw stageFailure;
        const staged = acceptStagedRoadmap(stage, kernelInputs);
        const bytes = await exportStaged(staged, args.format as ExportFormat, kernelInputs, host);
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
 * How an included file is named in diagnostics: relative to the include root
 * when one is set, else to the input's display path, so `examples/a.nowline`
 * including `./teams/b.nowline` prints `examples/teams/b.nowline` (absolute
 * when the input was given absolute).
 */
function includeDisplayPath(absPath: string, args: ProduceArgs): string {
    if (args.includeRoot) return path.relative(args.includeRoot, absPath);
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
        args.log.notice(`warning: ${message}`);
    }

    // Bundled fallback after an opted-in probe found no usable system font.
    // Only meaningful when --use-system-fonts is set; warn under --strict.
    if (args.strict) {
        if (result.sansFellBackToBundled) {
            args.log.notice(
                'warning: sans font fell back to bundled DejaVu (no platform font found)',
            );
        }
        if (result.monoFellBackToBundled) {
            args.log.notice(
                'warning: mono font fell back to bundled DejaVu (no platform font found)',
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

/** What `parseAndValidate` stages with, once the source validates. */
interface StageRequest {
    /** The layout inputs the export that follows will ask for. */
    inputs: RenderInputs;
    host: HostEnv;
    /** Collects the text of each file the stage reads, for code frames. */
    included: Map<string, string>;
}

/**
 * Parse and validate; on errors, report them and throw. With `stage`, the
 * validated document is also staged (include resolution, logo, layout) and a
 * file that has includes reports the routed (wave-rule) diagnostics of that
 * stage with the validator's, in the same report (specs/waves.md §6.1). The
 * stage is returned for the export to reuse. Every other include error, and a
 * stage that throws, is left for the caller to report where the kernel always
 * did (exit 3).
 */
async function parseAndValidate(
    contents: string,
    args: ProduceArgs,
    options: { stage?: StageRequest } = {},
) {
    const result = await parseSource(contents, args.displayPath, { validate: true });
    const diagnostics = [...result.diagnostics];
    const sources = new Map<string, DiagnosticSource>([[args.displayPath, result.source]]);
    let failed = result.hasErrors;
    let stage: StageResult | undefined;
    let stageFailure: unknown;
    if (!failed && options.stage) {
        const { inputs, host, included } = options.stage;
        try {
            stage = await stageForExport(contents, inputs, host, {
                document: result.document,
                services: getServices(),
                includePolicy: args.includePolicy,
            });
        } catch (err) {
            stageFailure = err;
        }
        if (stage && result.ast.includes.length > 0) {
            for (const d of routedDiagnostics(stage)) {
                const isRoot = d.sourcePath === args.absInputPath;
                const file = isRoot ? args.displayPath : includeDisplayPath(d.sourcePath, args);
                const text = isRoot ? result.source.contents : included.get(d.sourcePath);
                if (text !== undefined) sources.set(file, { file, contents: text });
                diagnostics.push(adaptResolveDiagnostic(d, file, text));
                if (d.severity === 'error') failed = true;
            }
        }
    }
    // Text mode prints only when the run fails. JSON mode prints one document
    // whenever any diagnostic exists, warnings included, so a warnings-only
    // run still exits 0 with the document on stderr.
    if (failed || (args.diagnosticFormat === 'json' && diagnostics.length > 0)) {
        emitDiagnostics(diagnostics, sources, args.operatorLocale, args.diagnosticFormat, args.log);
    }
    if (failed) {
        throw new CliError(ExitCode.ValidationError, '');
    }
    const directive = readDirectiveLocale(result.ast);
    const { tag, source } = describeContentLocaleSource(directive, args.resolvedLocale);
    args.log.verbose(`nowline: locale=${tag} (${source})`);
    return { ...result, stage, stageFailure };
}

/**
 * The routed (wave-rule) diagnostics of a stage's include resolution. Empty
 * when the resolver reports any other include error: that one is more
 * fundamental, and the export reports it as before (exit 3).
 */
function routedDiagnostics(stage: StageResult): ResolveDiagnostic[] {
    if (stage.kind === 'staged' || (stage.kind === 'include-error' && !stage.legacy)) {
        return stage.routed;
    }
    return [];
}

// Walk up from the input (or `cwd` for stdin) to the nearest `.nowlinerc`.
// No rc file is not an error. One that exists but cannot be read or parsed is
// a usage error (specs/cli.md, `.nowlinerc`): silently ignoring it would
// render with settings the user believes they changed. The loader's reason
// already names the file, so it is passed through. `--serve` shares this.
export async function loadConfigFor(inputArg: string, cwd: string): Promise<LoadConfigResult> {
    try {
        if (inputArg === '-') return await loadConfig(cwd);
        const abs = path.resolve(cwd, inputArg);
        return await loadConfig(path.dirname(abs));
    } catch (err) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: invalid .nowlinerc: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
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
    log: Log,
): void {
    // JSON is machine output and always prints whole; text drops warnings under -q.
    const shown = format === 'text' ? errorsOnlyWhenQuiet(diagnostics, log) : diagnostics;
    const rendered = formatDiagnostics(shown, format, sources, {
        color: process.stderr.isTTY === true,
        operatorLocale,
    });
    if (rendered) process.stderr.write(`${rendered}\n`);
}

/** Under `-q`, text-mode diagnostics keep only errors. Shared with serve. */
export function errorsOnlyWhenQuiet<T extends { severity: string }>(
    diagnostics: T[],
    log: Log,
): T[] {
    return log.quiet ? diagnostics.filter((d) => d.severity === 'error') : diagnostics;
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
