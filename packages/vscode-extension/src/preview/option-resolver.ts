import type { NowlineRc } from '@nowline/config';
import type { ThemeName } from '@nowline/layout';
import type { PreviewSettings, ToolbarOverrides } from './preview-panel.js';

/**
 * Render-affecting options after the precedence chain has been
 * collapsed. Mirrors `RenderInputs` minus the per-document fields
 * (`text` / `fsPath`) — callers stitch those in.
 */
export interface ResolvedRenderOptions {
    theme: ThemeName;
    today: Date | null | undefined;
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
    if (setting === 'light') return 'light';
    if (setting === 'dark') return 'dark';
    if (setting === 'auto' && rcThemeOverride(ctx.rc) === undefined) {
        return ctx.isDarkTheme ? 'dark' : 'light';
    }
    const rc = rcThemeOverride(ctx.rc);
    if (rc) return rc;
    return ctx.isDarkTheme ? 'dark' : 'light';
}

function rcThemeOverride(rc: NowlineRc): ThemeName | undefined {
    if (rc.theme === 'light' || rc.theme === 'dark') return rc.theme;
    return undefined;
}

/**
 * Resolve the now-line anchor:
 *  - toolbar override wins (`'today'` / `'hide'` / Date)
 *  - then setting (`'auto'` / `'none'` / YYYY-MM-DD)
 *  - default = today (matches CLI)
 *
 * Returning `null` suppresses the now-line (mirrors `--now -`); returning
 * `undefined` means "default to today" inside the render pipeline.
 */
function resolveToday(ctx: ResolveContext): Date | null | undefined {
    const override = ctx.toolbarOverrides?.now;
    if (override !== undefined) {
        if (override === 'today') return undefined;
        if (override === 'hide') return null;
        return override;
    }
    const raw = ctx.settings.now;
    if (raw === 'auto' || raw === '') return undefined;
    if (raw === 'none') return null;
    const parsed = parseIsoDate(raw);
    return parsed ?? undefined;
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
