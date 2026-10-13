import * as path from 'node:path';
import type { DiagnosticRow } from '@nowline/browser';
import {
    ASSET_ROOT_SPEC,
    type NowlineRc,
    type OptionError,
    type OptionLayer,
    rcLayer,
    resolveOptions,
    SURFACE_OPTION_SPECS,
} from '@nowline/config';
import {
    type NonWorkingDisplay,
    type NormalizedZone,
    normalizeThemeName,
    normalizeZone,
    resolveToday,
    type ThemeName,
} from '@nowline/layout';
import type { PreviewSettings, ToolbarOverrides } from './preview-panel.js';
import type { RenderOutcome } from './render-pipeline.js';

/**
 * Render-affecting options after the precedence chain has been
 * collapsed. Mirrors `RenderInputs` minus the per-document fields
 * (`text` / `fsPath`) — callers stitch those in.
 */
export interface ResolvedRenderOptions {
    theme: ThemeName;
    /**
     * Resolved now-line anchor: an explicit UTC-midnight `Date` to draw the
     * now-line, or `null` to suppress it. Never `undefined` — the default
     * (`'auto'`) resolves to today's date so the preview shows a now-line out
     * of the box, matching the CLI and the rasterized export.
     */
    today: Date | null;
    locale: string | undefined;
    width: number | undefined;
    /**
     * The render-time non-working display, or `undefined` to let the file's
     * `default roadmap non-working:` key apply (then `hide`). Never carries
     * `'file'`.
     */
    nonWorking: NonWorkingDisplay | undefined;
    showLinks: boolean;
    strict: boolean;
    assetRoot: string | undefined;
    /**
     * Options whose value was rejected and replaced by the default, as rows
     * for the preview's diagnostic table (specs/surface-options.md §7,
     * decision 4). Today only `width`; a theme from `.nowlinerc` that the
     * schema rejects is still ignored without a row.
     */
    problems: DiagnosticRow[];
}

export interface ResolveContext {
    settings: PreviewSettings;
    rc: NowlineRc;
    /** `vscode.env.language`. Stand-in for the CLI's `LC_*`/`LANG` env vars. */
    vscodeLanguage: string | undefined;
    /** VS Code color theme (so `theme: 'auto'` can pick light/dark). */
    isDarkTheme: boolean;
    /** Per-panel toolbar overrides; not persisted. */
    toolbarOverrides?: ToolbarOverrides;
    /** The `.nowlinerc` the config came from, so a bad rc value's row can open it. */
    rcPath?: string;
}

// The options the preview reads through the shared schema, so a value reads
// the same here as in `nowline <file>`. A theme the schema rejects is ignored
// (the chain moves on to the editor theme); a bad width is reported (below).
const SCHEMA_SPECS = {
    theme: SURFACE_OPTION_SPECS.theme,
    width: SURFACE_OPTION_SPECS.width,
    assetRoot: ASSET_ROOT_SPEC,
};
type SchemaKey = keyof typeof SCHEMA_SPECS;

const WIDTH_SETTING = 'nowline.preview.width';

/**
 * The width setting as a layer. `0` is the setting's "unset" (its default), so
 * it is left out and the rc width can apply; any other value goes through the
 * schema's rule, so `100` is an error rather than a silent ignore.
 */
function settingLayer(settings: PreviewSettings): OptionLayer<SchemaKey> {
    return {
        source: (key) => ({ kind: 'setting', name: `nowline.preview.${key}` }),
        values: { width: settings.width === 0 ? undefined : settings.width },
    };
}

/** A row for the diagnostic table; the preview still renders, so it is a warning. */
function widthProblemRow(error: OptionError<SchemaKey>, rcPath: string | undefined): DiagnosticRow {
    const name = error.source.kind === 'rc' ? '.nowlinerc width' : WIDTH_SETTING;
    return {
        severity: 'warning',
        code: 'invalid-option',
        message: `Invalid ${name} "${String(error.raw)}": ${error.detail}. The preview fits its content instead.`,
        // A bad rc value opens the rc file; a setting has no file to open.
        file: error.source.kind === 'rc' ? (rcPath ?? '') : '',
        line: 1,
        column: 1,
    };
}

/**
 * Put option problems in front of an outcome's own rows. A rendered diagram
 * carries them as warnings, which the shell shows without dimming it.
 */
export function withOptionProblems(
    outcome: RenderOutcome,
    problems: DiagnosticRow[],
): RenderOutcome {
    if (problems.length === 0) return outcome;
    if (outcome.kind === 'svg') return { ...outcome, warnings: problems };
    return { kind: 'diagnostics', rows: [...problems, ...outcome.rows] };
}

/**
 * Collapse the resolution chain (toolbar > settings > rc > env > defaults)
 * into a single bag the renderer can consume. Pure function so the panel
 * stays trivially testable and we can re-use it from the export runner.
 */
export function resolvePreviewOptions(ctx: ResolveContext): ResolvedRenderOptions {
    const { values, errors } = resolveOptions(SCHEMA_SPECS, [
        settingLayer(ctx.settings),
        rcLayer(ctx.rc, SCHEMA_SPECS),
    ]);
    return {
        theme: resolveTheme(ctx, values.theme),
        today: resolveTodayForPreview(ctx),
        locale: resolveLocale(ctx),
        width: values.width,
        nonWorking: resolveNonWorkingDisplay(
            ctx.toolbarOverrides?.nonWorking,
            ctx.settings.nonWorking,
        ),
        showLinks: resolveShowLinks(ctx),
        strict: ctx.settings.strict,
        assetRoot: resolveAssetRoot(ctx, values.assetRoot),
        problems: errors
            .filter((error) => error.key === 'width')
            .map((error) => widthProblemRow(error, ctx.rcPath)),
    };
}

function resolveTheme(ctx: ResolveContext, rcTheme: ThemeName | undefined): ThemeName {
    const override = ctx.toolbarOverrides?.theme;
    const setting = override ?? ctx.settings.theme;
    // An explicit Theme token (light / dark / grayscale; `greyscale` accepted
    // as an alias) wins outright. `auto` and any unrecognized token fall
    // through to the rc override, then the active VS Code Mode (chrome).
    if (setting && setting !== 'auto') {
        const explicit = normalizeThemeName(setting);
        if (explicit) return explicit;
    }
    if (rcTheme) return rcTheme;
    return ctx.isDarkTheme ? 'dark' : 'light';
}

/**
 * Resolve the now-line anchor for a preview render. Thin wrapper over the
 * shared {@link resolveTodayAnchor} so the live render and the export
 * (`NowlinePreview.resolvedToday()`) can never drift.
 */
function resolveTodayForPreview(ctx: ResolveContext): Date | null {
    return resolveTodayAnchor(ctx.toolbarOverrides?.now, ctx.settings.now, ctx.settings.timezone);
}

/**
 * Resolve the now-line anchor from the toolbar override + persistent setting.
 *
 * Precedence:
 *  - toolbar override wins (`'today'` / `'hide'` / pinned Date)
 *  - then setting (`'auto'` / `'none'` / YYYY-MM-DD or ISO 8601)
 *  - default (`'auto'` / empty / unparseable) = today's local civil date
 *    (or the zone from `settingTimezone` if set)
 *
 * Returns an explicit `Date` to draw the now-line, or `null` to suppress it
 * (mirrors the CLI's `--now -`). Never returns `undefined`: the browser
 * pipeline treats `undefined` as "no anchor" and the layout then omits the
 * now-line, so the default must be a concrete date for the line to appear —
 * matching the CLI default and the rasterized export.
 *
 * Shared by both the live preview render ({@link resolveTodayForPreview}) and
 * the export path (`NowlinePreview.resolvedToday()`).
 */
export function resolveTodayAnchor(
    nowOverride: ToolbarOverrides['now'],
    settingNow: string,
    settingTimezone?: string,
): Date | null {
    if (nowOverride !== undefined) {
        if (nowOverride === 'today') {
            // 'today' toolbar override: use local civil date (or setting zone).
            return resolveTodayWithZone(undefined, settingTimezone) ?? null;
        }
        if (nowOverride === 'hide') return null;
        return nowOverride; // pinned Date
    }
    if (settingNow === 'auto' || settingNow === '') {
        return resolveTodayWithZone(undefined, settingTimezone) ?? null;
    }
    if (settingNow === 'none') return null;
    // Pinned date string (YYYY-MM-DD or ISO 8601): pass to resolveToday.
    return (
        resolveTodayWithZone(settingNow, settingTimezone) ??
        resolveTodayWithZone(undefined, settingTimezone) ??
        null
    );
}

/**
 * Resolve the now-line date using the shared helper.
 * Returns `null` on suppress, or today as fallback when parsing fails.
 */
function resolveTodayWithZone(
    nowStr: string | undefined,
    timezoneStr: string | undefined,
): Date | null | undefined {
    let zone: NormalizedZone | undefined;
    if (timezoneStr) {
        try {
            zone = normalizeZone(timezoneStr);
        } catch {
            // Silently fall back to local if the zone setting is invalid.
            zone = undefined;
        }
    }
    return resolveToday({ now: nowStr, zone }) ?? null;
}

/**
 * Locale uses a two-chain model (see `specs/ide.md` § Configuration).
 * This function resolves the **operator chain**; the file's
 * `nowline v1 locale:` directive wins over this for the rendered SVG
 * (handled inside `@nowline/layout`).
 */
function resolveLocale(ctx: ResolveContext): string | undefined {
    if (nonEmpty(ctx.settings.locale)) return ctx.settings.locale;
    const fromRc = ctx.rc.locale;
    if (typeof fromRc === 'string' && fromRc !== '') return fromRc;
    if (nonEmpty(ctx.vscodeLanguage)) return ctx.vscodeLanguage;
    return undefined;
}

/**
 * Resolve the non-working display from the toolbar override and the persistent
 * setting. Precedence: toolbar, setting, then the file's own key (which is the
 * `undefined` result), then `hide`. The toolbar's `'file'` is an explicit
 * choice to follow the file, so it beats a `show` or `hide` setting, the way
 * the theme toolbar's `'auto'` beats a forced theme setting. There is no
 * `.nowlinerc` key.
 *
 * Shared by the live render and the export path
 * (`NowlinePreview.resolvedNonWorking()`).
 */
export function resolveNonWorkingDisplay(
    toolbar: ToolbarOverrides['nonWorking'],
    setting: PreviewSettings['nonWorking'],
): NonWorkingDisplay | undefined {
    const effective = toolbar ?? setting;
    return effective === 'hide' || effective === 'show' ? effective : undefined;
}

function resolveShowLinks(ctx: ResolveContext): boolean {
    const override = ctx.toolbarOverrides?.showLinks;
    if (override !== undefined) return override;
    return ctx.settings.showLinks;
}

/**
 * The asset root: the setting, else the rc `assetRoot`. A relative rc value is
 * relative to the `.nowlinerc` that holds it, as for `nowline --asset-root`'s
 * default, so it means the same directory for every source file below it.
 */
function resolveAssetRoot(
    ctx: ResolveContext,
    rcAssetRoot: string | undefined,
): string | undefined {
    if (nonEmpty(ctx.settings.assetRoot)) return ctx.settings.assetRoot;
    if (rcAssetRoot === undefined) return undefined;
    return ctx.rcPath ? path.resolve(path.dirname(ctx.rcPath), rcAssetRoot) : rcAssetRoot;
}

function nonEmpty(value: string | undefined): value is string {
    return typeof value === 'string' && value.length > 0;
}
