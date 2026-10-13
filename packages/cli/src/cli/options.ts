// How the CLI turns flags and `.nowlinerc` keys into render options. The five
// shared options (theme, width, now, page size, non-working display) come from
// `@nowline/config`'s schema; the CLI-only keys are registered here as option
// specs over the same two layers, so adding an rc key is one entry in
// `CLI_OPTION_SPECS` rather than a hand-written merge in each command
// (specs/surface-options.md §3.1).

import * as path from 'node:path';
import {
    ASSET_ROOT_SPEC,
    type NowlineRc,
    type OptionError,
    type OptionLayer,
    type OptionParse,
    type OptionSpec,
    type OptionValues,
    rcLayer,
    resolveOptions,
    resolveSurfaceOptions,
    SURFACE_OPTION_SPECS,
    type SurfaceOptions,
} from '@nowline/config';
import { lengthToPoints, parseLength } from '@nowline/export-core';
import { type NormalizedZone, normalizeZone, TimezoneError } from '@nowline/layout';
import { CliError, ExitCode } from '../io/exit-codes.js';
import type { ParsedArgs } from './args.js';

// ---- CLI-only option specs --------------------------------------------------

export type PdfOrientation = 'portrait' | 'landscape' | 'auto';

const ORIENTATIONS: readonly PdfOrientation[] = ['portrait', 'landscape', 'auto'];

/** An rc key the CLI reads as a string; any other type is ignored, as it always was. */
function lenientString(raw: unknown): OptionParse<string> {
    return { ok: true, value: typeof raw === 'string' ? raw : undefined };
}

/** An rc or flag switch: only a literal `true` turns it on. */
function lenientSwitch(raw: unknown): OptionParse<boolean> {
    return { ok: true, value: raw === true ? true : undefined };
}

function parseOrientation(raw: unknown): OptionParse<PdfOrientation> {
    if (raw === '') return { ok: true, value: undefined };
    const lower = typeof raw === 'string' ? raw.toLowerCase() : undefined;
    const found = ORIENTATIONS.find((orientation) => orientation === lower);
    if (found) return { ok: true, value: found };
    return { ok: false, detail: 'must be an orientation', expected: ORIENTATIONS };
}

function parseMargin(raw: unknown): OptionParse<number> {
    if (raw === '') return { ok: true, value: undefined };
    // A bare number is points; YAML and JSON hand the rc one over as a number.
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
        return { ok: true, value: raw };
    }
    const text = String(raw);
    if (/^\d+(?:\.\d+)?$/.test(text)) return { ok: true, value: Number(text) };
    try {
        return { ok: true, value: lengthToPoints(parseLength(text)) };
    } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
}

/** Every option the CLI resolves over its flag and rc layers: the shared five, then its own. */
export const CLI_OPTION_SPECS = Object.freeze({
    ...SURFACE_OPTION_SPECS,
    orientation: { rcKey: 'pdfOrientation', parse: parseOrientation } as OptionSpec<PdfOrientation>,
    margin: { rcKey: 'pdfMargin', parse: parseMargin } as OptionSpec<number>,
    defaultFormat: { rcKey: 'defaultFormat', parse: lenientString } as OptionSpec<string>,
    fontSans: { rcKey: 'fontSans', parse: lenientString } as OptionSpec<string>,
    fontMono: { rcKey: 'fontMono', parse: lenientString } as OptionSpec<string>,
    headless: { rcKey: 'headlessFonts', parse: lenientSwitch } as OptionSpec<boolean>,
    useSystemFonts: { rcKey: 'useSystemFonts', parse: lenientSwitch } as OptionSpec<boolean>,
    locale: { rcKey: 'locale', parse: lenientString } as OptionSpec<string>,
    assetRoot: ASSET_ROOT_SPEC as OptionSpec<string>,
});

type CliSpecs = typeof CLI_OPTION_SPECS;
export type CliOptionKey = Extract<keyof CliSpecs, string>;
type CliValues = OptionValues<CliSpecs>;

/** The flag each option is passed as, for an error that names its source. */
const FLAG_NAMES: Readonly<Partial<Record<CliOptionKey, string>>> = {
    theme: '--theme',
    width: '--width',
    now: '--now',
    pageSize: '--page-size',
    nonWorking: '--non-working',
    orientation: '--orientation',
    margin: '--margin',
    fontSans: '--font-sans',
    fontMono: '--font-mono',
    headless: '--headless',
    useSystemFonts: '--use-system-fonts',
    assetRoot: '--asset-root',
};

// ---- Resolution -------------------------------------------------------------

export interface CliOptions {
    /** Theme, width, now-line date and non-working display; page size when set. */
    surface: SurfaceOptions;
    orientation?: PdfOrientation;
    /** Page margin in points. */
    margin?: number;
    /** The rc `defaultFormat`; the `--format` flag is resolved by `resolveFormat`. */
    defaultFormat?: string;
    fontSans?: string;
    fontMono?: string;
    headless: boolean;
    useSystemFonts: boolean;
    /**
     * Where `logo:` assets are read from, as an absolute path: `--asset-root`,
     * else the rc `assetRoot`. Unset means the input file's directory.
     */
    assetRoot?: string;
    /** The rc `locale`; the flag and `NOWLINE_LOCALE` rank above it (`resolveLocaleOverride`). */
    rcLocale?: string;
    /**
     * Throw the first invalid option as a usage error, in the order the CLI
     * has always reported them: theme, timezone, now, width, non-working.
     */
    assertValid(): void;
    /**
     * Throw the first invalid PDF setting (page size, orientation, margin).
     * Run after validation, so these errors follow any diagnostics.
     */
    assertPdfSettingsValid(): void;
}

/**
 * Resolve the CLI's options over the flag layer, then the `.nowlinerc` layer.
 * Nothing throws here: a caller reads `defaultFormat` early and reports bad
 * values at the point it always did, through `assertValid`.
 */
export function resolveCliOptions(
    args: ParsedArgs,
    config: NowlineRc | null,
    context: { rcPath?: string; clock?: () => Date } = {},
): CliOptions {
    const { rcPath, clock } = context;
    const layers = [flagLayer(args), rcLayer(config ?? {}, CLI_OPTION_SPECS)];

    // `--timezone` is validated even when `--now` is explicit, as it always was.
    const zone = readZone(args.timezone);
    const { options, errors: surfaceErrors } = resolveSurfaceOptions(
        layers,
        { theme: 'light' },
        { zone: zone.zone, clock },
    );
    const { values, errors: cliErrors } = resolveOptions(CLI_OPTION_SPECS, layers);
    const failures = new Map<string, OptionError<CliOptionKey>>(
        [...surfaceErrors, ...cliErrors].map((error) => [error.key, error]),
    );
    const failure = (key: CliOptionKey): CliError | undefined => {
        const error = failures.get(key);
        return error && new CliError(ExitCode.InputError, formatOptionError(error));
    };

    return {
        surface: options,
        orientation: values.orientation,
        margin: values.margin,
        defaultFormat: values.defaultFormat,
        fontSans: values.fontSans,
        fontMono: values.fontMono,
        headless: values.headless ?? false,
        useSystemFonts: values.useSystemFonts ?? false,
        assetRoot: absoluteAssetRoot(values.assetRoot, args.assetRoot !== undefined, rcPath),
        rcLocale: values.locale,
        assertValid: () =>
            throwFirst([
                failure('theme'),
                zone.error,
                failure('now'),
                failure('width'),
                failure('nonWorking'),
                failure('assetRoot'),
            ]),
        assertPdfSettingsValid: () =>
            throwFirst([failure('pageSize'), failure('orientation'), failure('margin')]),
    };
}

function throwFirst(candidates: readonly (CliError | undefined)[]): void {
    for (const candidate of candidates) {
        if (candidate) throw candidate;
    }
}

function flagLayer(args: ParsedArgs): OptionLayer<CliOptionKey> {
    return {
        source: (key) => ({ kind: 'flag', name: FLAG_NAMES[key] ?? `--${key}` }),
        values: {
            // An empty `--theme ""` has always meant "not passed", so the rc theme applies.
            theme: args.theme || undefined,
            width: args.width,
            now: args.now,
            pageSize: args.pageSize,
            nonWorking: args.nonWorking,
            orientation: args.orientation,
            margin: args.margin,
            fontSans: args.fontSans,
            fontMono: args.fontMono,
            assetRoot: args.assetRoot,
            // A switch flag is absent or on; absent leaves the rc to decide.
            headless: args.headless || undefined,
            useSystemFonts: args.useSystemFonts || undefined,
        },
    };
}

function readZone(raw: string | undefined): { zone?: NormalizedZone; error?: CliError } {
    if (!raw) return {};
    try {
        return { zone: normalizeZone(raw) };
    } catch (err) {
        if (err instanceof TimezoneError) {
            return { error: new CliError(ExitCode.InputError, err.message) };
        }
        throw err;
    }
}

// ---- Asset root -------------------------------------------------------------

/**
 * The asset root as an absolute path. A flag resolves against `cwd` (the
 * process's, unless a caller passes its own); an rc value against the
 * directory of the `.nowlinerc` it came from, so a checked-in `assetRoot:
 * assets` means the same directory wherever `nowline` is run from.
 */
function absoluteAssetRoot(
    value: string | undefined,
    fromFlag: boolean,
    rcPath: string | undefined,
    cwd?: string,
): string | undefined {
    if (value === undefined) return undefined;
    if (fromFlag || rcPath === undefined) return path.resolve(cwd ?? '.', value);
    return path.resolve(path.dirname(rcPath), value);
}

/**
 * Resolve just the asset root, for `--serve`, which does not read the other
 * rc-backed options yet. Same precedence and errors as `render`: the flag,
 * then the rc `assetRoot`, with a non-string rc value a usage error.
 */
export function resolveAssetRootOption(
    flag: string | undefined,
    config: NowlineRc | null,
    context: { rcPath?: string; cwd: string },
): string | undefined {
    const specs = { assetRoot: CLI_OPTION_SPECS.assetRoot };
    const { values, errors } = resolveOptions(specs, [
        {
            source: () => ({ kind: 'flag', name: '--asset-root' }),
            values: { assetRoot: flag },
        },
        rcLayer(config ?? {}, specs),
    ]);
    if (errors[0]) throw new CliError(ExitCode.InputError, formatOptionError(errors[0]));
    return absoluteAssetRoot(values.assetRoot, flag !== undefined, context.rcPath, context.cwd);
}

// ---- Error text -------------------------------------------------------------

/**
 * An {@link OptionError} in the CLI's wording, naming the flag or `.nowlinerc`
 * key the value came from: `nowline: invalid --width "abc". Must be an integer
 * ≥ 320.` The templates are the ones the CLI used before the schema, so
 * scripts that match them keep working.
 */
export function formatOptionError(error: OptionError<string>): string {
    const lead = `nowline: invalid ${describeSource(error.source)} "${String(error.raw)}"`;
    if (error.expected) return `${lead}. Expected ${formatChoices(error.expected)}.`;
    switch (error.key) {
        // Detail reads "must be YYYY-MM-DD, ...": the CLI says "Expected".
        case 'now':
            return `${lead}. Expected ${error.detail.replace(/^must be /, '')}.`;
        // These two carry the parser's own message after a colon.
        case 'pageSize':
        case 'margin':
            return `${lead}: ${error.detail}`;
        default:
            return `${lead}. ${error.detail.charAt(0).toUpperCase()}${error.detail.slice(1)}.`;
    }
}

function describeSource(source: OptionError['source']): string {
    switch (source.kind) {
        case 'flag':
        case 'argument':
        case 'setting':
            return source.name;
        case 'rc':
            return `.nowlinerc ${source.key}`;
    }
}

// `a`, `a or b`, `a, b, or c`.
export function formatChoices(names: readonly string[]): string {
    if (names.length <= 2) return names.join(' or ');
    return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}
