import type { NowlineRc } from '@nowline/config';
import { normalizeThemeName, type ThemeName } from '@nowline/layout';
import type { PreviewSettings, ToolbarOverrides } from './preview-panel.js';

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
    showLinks: boolean;
    strict: boolean;
    assetRoot: string | undefined;
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
}

/**
 * Collapse the resolution chain (toolbar > settings > rc > env > defaults)
 * into a single bag the renderer can consume. Pure function so the panel
 * stays trivially testable and we can re-use it from the export runner.
 */
export function resolvePreviewOptions(ctx: ResolveContext): ResolvedRenderOptions {
    return {
        theme: resolveTheme(ctx),
        today: resolveToday(ctx),
        locale: resolveLocale(ctx),
        width: resolveWidth(ctx),
        showLinks: resolveShowLinks(ctx),
        strict: ctx.settings.strict,
        assetRoot: resolveAssetRoot(ctx),
    };
}

function resolveTheme(ctx: ResolveContext): ThemeName {
    const override = ctx.toolbarOverrides?.theme;
    const setting = override ?? ctx.settings.theme;
    // An explicit Theme token (light / dark / grayscale; `greyscale` accepted
    // as an alias) wins outright. `auto` and any unrecognized token fall
    // through to the rc override, then the active VS Code Mode (chrome).
    if (setting && setting !== 'auto') {
        const explicit = normalizeThemeName(setting);
        if (explicit) return explicit;
    }
    const rc = rcThemeOverride(ctx.rc);
    if (rc) return rc;
    return ctx.isDarkTheme ? 'dark' : 'light';
}

function rcThemeOverride(rc: NowlineRc): ThemeName | undefined {
    return typeof rc.theme === 'string' ? normalizeThemeName(rc.theme) : undefined;
}

/**
 * Resolve the now-line anchor for a preview render. Thin wrapper over the
 * shared {@link resolveTodayAnchor} so the live render and the export
 * (`NowlinePreview.resolvedToday()`) can never drift.
 */
function resolveToday(ctx: ResolveContext): Date | null {
    return resolveTodayAnchor(ctx.toolbarOverrides?.now, ctx.settings.now);
}

/**
 * Resolve the now-line anchor from the toolbar override + persistent setting.
 *
 * Precedence:
 *  - toolbar override wins (`'today'` / `'hide'` / pinned Date)
 *  - then setting (`'auto'` / `'none'` / YYYY-MM-DD)
 *  - default (`'auto'` / empty / unparseable) = today's UTC-midnight date
 *
 * Returns an explicit `Date` to draw the now-line, or `null` to suppress it
 * (mirrors the CLI's `--now -`). Never returns `undefined`: the browser
 * pipeline treats `undefined` as "no anchor" and the layout then omits the
 * now-line, so the default must be a concrete date for the line to appear —
 * matching the CLI default and the rasterized export.
 *
 * Shared by both the live preview render ({@link resolveToday}) and the
 * export path (`NowlinePreview.resolvedToday()`).
 */
export function resolveTodayAnchor(
    nowOverride: ToolbarOverrides['now'],
    settingNow: string,
): Date | null {
    if (nowOverride !== undefined) {
        if (nowOverride === 'today') return todayUtc();
        if (nowOverride === 'hide') return null;
        return nowOverride; // pinned Date
    }
    if (settingNow === 'auto' || settingNow === '') return todayUtc();
    if (settingNow === 'none') return null;
    return parseIsoDate(settingNow) ?? todayUtc();
}

/** Today at UTC midnight — matches the CLI's `resolveNowArg` default. */
function todayUtc(): Date {
    const t = new Date();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function parseIsoDate(value: string): Date | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return undefined;
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
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

function resolveWidth(ctx: ResolveContext): number | undefined {
    if (typeof ctx.settings.width === 'number' && ctx.settings.width > 0) {
        return ctx.settings.width;
    }
    if (typeof ctx.rc.width === 'number' && ctx.rc.width > 0) return ctx.rc.width;
    return undefined;
}

function resolveShowLinks(ctx: ResolveContext): boolean {
    const override = ctx.toolbarOverrides?.showLinks;
    if (override !== undefined) return override;
    return ctx.settings.showLinks;
}

function resolveAssetRoot(ctx: ResolveContext): string | undefined {
    if (nonEmpty(ctx.settings.assetRoot)) return ctx.settings.assetRoot;
    const rcAssetRoot = ctx.rc.assetRoot;
    if (typeof rcAssetRoot === 'string' && rcAssetRoot !== '') return rcAssetRoot;
    return undefined;
}

function nonEmpty(value: string | undefined): value is string {
    return typeof value === 'string' && value.length > 0;
}
