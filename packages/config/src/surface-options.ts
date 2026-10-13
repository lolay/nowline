// The options every render surface shares: theme, width, now, page size and
// non-working display (specs/surface-options.md §3.1). Each option is parsed
// once, here, from whatever layers a surface stacks (flags, MCP arguments,
// editor settings, `.nowlinerc`), so a value accepted by one surface is
// accepted by all of them. Errors come back as fields, not text: each surface
// keeps its own message templates.

import { PageSizeParseError, type PdfPageSize, parsePageSize } from '@nowline/export-core';
import {
    hasImpossibleNowDate,
    isNonWorkingDisplay,
    NON_WORKING_DISPLAYS,
    type NonWorkingDisplay,
    type NormalizedZone,
    normalizeThemeName,
    resolveToday,
    THEME_NAMES,
    type ThemeName,
} from '@nowline/layout';

// ---- Public types -----------------------------------------------------------

export type SurfaceOptionKey = 'theme' | 'width' | 'now' | 'pageSize' | 'nonWorking';

export interface SurfaceOptions {
    theme: ThemeName;
    /** Integer ≥ 320; undefined fits the content. */
    width?: number;
    /** The now-line date (UTC midnight); undefined suppresses it. */
    today?: Date;
    pageSize?: PdfPageSize;
    /** Undefined lets the file's `default roadmap non-working:` key apply. */
    nonWorking?: NonWorkingDisplay;
}

/** Where a raw value came from: what an error must name. */
export type OptionSource =
    | { kind: 'flag'; name: string } // --width
    | { kind: 'rc'; key: string } // .nowlinerc width
    | { kind: 'argument'; name: string } // MCP width
    | { kind: 'setting'; name: string }; // nowline.preview.width

/**
 * One source's raw values. Layers are passed highest precedence first. `K`
 * widens past the shared keys when a surface registers its own specs, and a
 * layer over the union serves both resolutions.
 */
export interface OptionLayer<K extends string = SurfaceOptionKey> {
    source: (key: K) => OptionSource;
    values: Partial<Record<K, unknown>>;
}

export interface OptionError<K extends string = SurfaceOptionKey> {
    key: K;
    source: OptionSource;
    raw: unknown;
    /** What was wrong, without a lead: `must be an integer ≥ 320`. */
    detail: string;
    /** The accepted values, for an enum option. */
    expected?: readonly string[];
}

export interface NowPolicy {
    /** Zone for "today" when no layer sets `now`; local when omitted. */
    zone?: NormalizedZone;
    clock?: () => Date;
}

/**
 * A parser's verdict on the winning raw value. `value: undefined` is an
 * explicit "unset" (an empty `--width ""`): the option stays at its default
 * and lower layers are not consulted.
 */
export type OptionParse<T> =
    | { ok: true; value: T | undefined }
    | { ok: false; detail: string; expected?: readonly string[] };

/** How one option is read: its `.nowlinerc` key, when it has one, and its parser. */
export interface OptionSpec<T> {
    rcKey?: string;
    parse: (raw: unknown) => OptionParse<T>;
}

/**
 * A set of option specs keyed by option name. The shared table is
 * {@link SURFACE_OPTION_SPECS}; a surface registers its own keys (the CLI's
 * `defaultFormat`, `pdfMargin`, ...) by passing its own table to
 * {@link resolveOptions} and {@link rcLayer} over the same layers.
 */
export type OptionSpecTable<S> = { readonly [K in keyof S]: OptionSpec<unknown> };

/** The parsed values of a spec table; a key is absent when no layer set it. */
export type OptionValues<S extends OptionSpecTable<S>> = {
    [K in keyof S]?: S[K] extends OptionSpec<infer V> ? V : never;
};

/** The string keys of a spec table. */
export type OptionKeyOf<S> = Extract<keyof S, string>;

// ---- `.nowlinerc` keys ------------------------------------------------------

/**
 * The `.nowlinerc` key of every setting the schema owns; `undefined` means
 * the option has no rc key. `assetRoot` is the default for `--asset-root`
 * (specs/surface-options.md §7, decision 5). It is not a shared option (a
 * path means something different to each surface), so it has its own spec,
 * {@link ASSET_ROOT_SPEC}, that a surface adds to its table.
 */
export const SURFACE_RC_KEYS = Object.freeze({
    theme: 'theme',
    width: 'width',
    now: undefined,
    pageSize: 'pdfPageSize',
    nonWorking: undefined,
    assetRoot: 'assetRoot',
} as const satisfies Record<SurfaceOptionKey | 'assetRoot', string | undefined>);

/**
 * The value types of the `.nowlinerc` keys the schema owns, as a file may
 * hold them before parsing. `NowlineRc` extends this.
 */
export interface SurfaceRcValues {
    /** A theme name, case-insensitive; `greyscale` is accepted. */
    theme?: string;
    /** Integer ≥ 320. A string is read with `parseInt`, as the CLI always has. */
    width?: number | string;
    /** A preset name, `content`, or `<W>x<H><unit>`. */
    pdfPageSize?: string;
    /** Base directory for `logo:` assets. */
    assetRoot?: string;
}

// ---- Option specs -----------------------------------------------------------

/** The narrowest width a surface accepts, in px. */
export const MIN_WIDTH = 320;

const NOW_DETAIL = 'must be YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-"';
// `2026-02-30` has the right shape but names no day; it is an error, not March 2.
const NOW_REAL_DAY_DETAIL = 'must be a real calendar date';

function parseTheme(raw: unknown): OptionParse<ThemeName> {
    const theme = typeof raw === 'string' ? normalizeThemeName(raw) : undefined;
    if (theme) return { ok: true, value: theme };
    return { ok: false, detail: 'must be a theme name', expected: THEME_NAMES };
}

// The CLI's rule, kept exactly: a string goes through `parseInt`, so
// `"1200px"` reads as 1200; anything else must already be a number.
function parseWidth(raw: unknown): OptionParse<number> {
    if (raw === '') return { ok: true, value: undefined };
    const value =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string'
              ? Number.parseInt(raw, 10)
              : Number.NaN;
    if (Number.isInteger(value) && value >= MIN_WIDTH) return { ok: true, value };
    return { ok: false, detail: `must be an integer ≥ ${MIN_WIDTH}` };
}

// `null` is a parsed `-`: the now-line is suppressed.
function parseNow(raw: unknown): OptionParse<Date | null> {
    if (raw instanceof Date) {
        if (!Number.isNaN(raw.getTime())) return { ok: true, value: raw };
    } else if (raw === '-') {
        return { ok: true, value: null };
    } else if (typeof raw === 'string') {
        const today = resolveToday({ now: raw });
        if (today) return { ok: true, value: today };
        if (hasImpossibleNowDate(raw)) return { ok: false, detail: NOW_REAL_DAY_DETAIL };
    }
    return { ok: false, detail: NOW_DETAIL };
}

function parsePageSizeOption(raw: unknown): OptionParse<PdfPageSize> {
    if (raw === '') return { ok: true, value: undefined };
    try {
        return { ok: true, value: parsePageSize(String(raw)) };
    } catch (err) {
        if (!(err instanceof PageSizeParseError)) throw err;
        // The parser names a generic "page size"; the surface supplies the lead.
        return { ok: false, detail: err.message.replace(/^invalid page size "[^"]*": /, '') };
    }
}

function parseNonWorking(raw: unknown): OptionParse<NonWorkingDisplay> {
    if (raw === '') return { ok: true, value: undefined };
    if (isNonWorkingDisplay(raw)) return { ok: true, value: raw };
    return { ok: false, detail: 'must be a non-working display', expected: NON_WORKING_DISPLAYS };
}

function parseAssetRoot(raw: unknown): OptionParse<string> {
    if (raw === '') return { ok: true, value: undefined };
    if (typeof raw === 'string') return { ok: true, value: raw };
    return { ok: false, detail: 'must be a directory path' };
}

/**
 * How `assetRoot` is read: a path, kept as written. Resolving a relative one
 * is the surface's job, because the base differs: a flag or setting resolves
 * against the working directory, an rc value against the `.nowlinerc`'s own
 * directory. Empty means unset.
 */
export const ASSET_ROOT_SPEC: Readonly<OptionSpec<string>> = Object.freeze({
    rcKey: SURFACE_RC_KEYS.assetRoot,
    parse: parseAssetRoot,
});

export interface SurfaceOptionSpecs {
    theme: OptionSpec<ThemeName>;
    width: OptionSpec<number>;
    /** `null` is the parsed `-` (suppress the now-line). */
    now: OptionSpec<Date | null>;
    pageSize: OptionSpec<PdfPageSize>;
    nonWorking: OptionSpec<NonWorkingDisplay>;
}

/** The shared option specs, in the order their errors are reported. */
export const SURFACE_OPTION_SPECS: Readonly<SurfaceOptionSpecs> = Object.freeze({
    theme: { rcKey: SURFACE_RC_KEYS.theme, parse: parseTheme },
    width: { rcKey: SURFACE_RC_KEYS.width, parse: parseWidth },
    now: { parse: parseNow },
    pageSize: { rcKey: SURFACE_RC_KEYS.pageSize, parse: parsePageSizeOption },
    nonWorking: { parse: parseNonWorking },
});

// ---- Resolution -------------------------------------------------------------

/**
 * Resolve every option in `specs` over `layers` (highest precedence first).
 * For each option the first layer holding a value other than `undefined` or
 * `null` wins and is parsed; lower layers are never read for it, so a bad
 * value below a valid one is not reported. A bad winning value is reported
 * and the option is left unset. Errors follow the table's key order.
 */
export function resolveOptions<S extends OptionSpecTable<S>>(
    specs: S,
    layers: readonly OptionLayer<OptionKeyOf<S>>[],
): { values: OptionValues<S>; errors: OptionError<OptionKeyOf<S>>[] } {
    const values: OptionValues<S> = {};
    const errors: OptionError<OptionKeyOf<S>>[] = [];
    for (const key of Object.keys(specs) as OptionKeyOf<S>[]) {
        const layer = layers.find((candidate) => isGiven(candidate.values[key]));
        if (!layer) continue;
        const raw = layer.values[key];
        const parsed = specs[key].parse(raw);
        if (!parsed.ok) {
            const error: OptionError<OptionKeyOf<S>> = {
                key,
                source: layer.source(key),
                raw,
                detail: parsed.detail,
            };
            if (parsed.expected) error.expected = parsed.expected;
            errors.push(error);
        } else if (parsed.value !== undefined) {
            values[key] = parsed.value as OptionValues<S>[OptionKeyOf<S>];
        }
    }
    return { values, errors };
}

/**
 * Resolve the shared options. With no `now` from any layer (or a bad one),
 * the now-line is today's civil date in `now.zone`; a `-` suppresses it.
 */
export function resolveSurfaceOptions(
    layers: readonly OptionLayer[],
    defaults: { theme: ThemeName },
    now: NowPolicy,
): { options: SurfaceOptions; errors: OptionError[] } {
    const { values, errors } = resolveOptions(SURFACE_OPTION_SPECS, layers);
    const today =
        values.now === undefined
            ? resolveToday({ zone: now.zone, clock: now.clock })
            : (values.now ?? undefined);
    const options: SurfaceOptions = { theme: values.theme ?? defaults.theme };
    if (values.width !== undefined) options.width = values.width;
    if (today !== undefined) options.today = today;
    if (values.pageSize !== undefined) options.pageSize = values.pageSize;
    if (values.nonWorking !== undefined) options.nonWorking = values.nonWorking;
    return { options, errors };
}

/**
 * Turn a loaded `.nowlinerc` into a layer: each spec with an `rcKey` reads
 * that key, and an error names it. Pass a surface's own spec table to read
 * its keys; with none, the shared specs are read.
 */
export function rcLayer(config: Readonly<Record<string, unknown>>): OptionLayer;
export function rcLayer<S extends OptionSpecTable<S>>(
    config: Readonly<Record<string, unknown>>,
    specs: S,
): OptionLayer<OptionKeyOf<S>>;
export function rcLayer(
    config: Readonly<Record<string, unknown>>,
    specs: Readonly<Record<string, OptionSpec<unknown>>> = SURFACE_OPTION_SPECS,
): OptionLayer<string> {
    const values: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(specs)) {
        if (spec.rcKey !== undefined) values[key] = config[spec.rcKey];
    }
    return {
        source: (key) => ({ kind: 'rc', key: specs[key]?.rcKey ?? key }),
        values,
    };
}

function isGiven(value: unknown): boolean {
    return value !== undefined && value !== null;
}
