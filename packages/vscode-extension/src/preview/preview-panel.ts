import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RcConfigCache } from '../io/rc-config.js';
import { resolvePreviewOptions, resolveTodayAnchor } from './option-resolver.js';
import { type RenderOutcome, renderDocument } from './render-pipeline.js';
import { getShellHtml } from './shell-html.js';

export type RefreshTrigger = 'keystroke' | 'save';
// Theme axis (the diagram render palette), distinct from the chrome Mode
// (light/dark workbench). `'grayscale'` is a full palette; `'auto'` follows
// the active VS Code color theme.
export type ThemeMode = 'auto' | 'light' | 'dark' | 'grayscale';
export type DefaultFit = 'fitPage' | 'fitWidth' | 'actual';

export interface PreviewSettings {
    refreshOn: RefreshTrigger;
    debounceMs: number;
    theme: ThemeMode;
    defaultFit: DefaultFit;
    showMinimap: boolean;
    /** BCP-47 locale override; empty falls through the chain. */
    locale: string;
    /** `'auto'` (today) | `'none'` (suppress) | `'YYYY-MM-DD'` (snapshot). */
    now: string;
    /**
     * Timezone for the clock-based "today" default.
     * `'local'` (default) | `'UTC'` | ISO 8601 offset | IANA name.
     * Empty string means use the host local zone.
     */
    timezone: string;
    strict: boolean;
    showLinks: boolean;
    /** Canvas width in px; `0` leaves it unset. */
    width: number;
    /** Override asset-resolver root; empty uses source-file directory. */
    assetRoot: string;
}

/**
 * Per-panel ad-hoc overrides applied on top of `PreviewSettings`. Live in
 * panel state only; never persisted back to settings or `.nowlinerc`. The
 * webview owns the toolbar UI and posts these via `viewOptions` messages.
 */
export interface ToolbarOverrides {
    theme?: ThemeMode;
    /** `'today'` mirrors the default; `'hide'` mirrors `--now -`; `Date` pins. */
    now?: 'today' | 'hide' | Date;
    showLinks?: boolean;
}

/**
 * Messages posted from the webview back to the extension host. The host
 * doesn't care about the shape beyond the discriminator — `extension.ts`
 * handles dispatch via the `onMessage` callback supplied at construction.
 */
export type PreviewWebviewMessage =
    | { type: 'goto'; file: string; line: number; column: number }
    | { type: 'openProblems' }
    | { type: 'save'; format: 'svg' | 'png'; body: string | Uint8Array }
    | { type: 'copyPngFallback'; body: Uint8Array }
    | { type: 'fatal'; message: string }
    | { type: 'viewOptions'; overrides: ViewOptionsPayload };

/**
 * Wire-format for toolbar overrides. Dates serialize to ISO YYYY-MM-DD
 * because `Date` instances don't survive `postMessage` round-trips
 * cleanly across webview boundaries.
 */
export interface ViewOptionsPayload {
    theme?: ThemeMode;
    now?: 'today' | 'hide' | string;
    showLinks?: boolean;
}

export interface NowlinePreviewOptions {
    panel: vscode.WebviewPanel;
    sourceUri: vscode.Uri;
    /** Extension install root; shell-html resolves `dist/preview-webview.js` against it. */
    extensionUri: vscode.Uri;
    settings: PreviewSettings;
    /**
     * Cache for `.nowlinerc` discovery. The panel calls into it on every
     * render; the cache itself owns the file watcher + invalidation.
     */
    rcCache: RcConfigCache;
    /** `vscode.env.language` snapshot; rarely changes within a session. */
    vscodeLanguage: string | undefined;
    onMessage: (msg: PreviewWebviewMessage, source: NowlinePreview) => void;
    onDispose: (source: NowlinePreview) => void;
}

/**
 * One preview panel for one source `.nowline` document.
 *
 * Responsibilities:
 *  - Render its source document on demand (debounced for keystroke triggers,
 *    immediate for save / theme / settings changes).
 *  - Push the result (SVG or diagnostics) into the webview via postMessage.
 *  - Forward webview messages to the supplied `onMessage` callback so the
 *    extension host owns command dispatch (showSaveDialog, executeCommand,
 *    etc.).
 *  - Apply panel-local toolbar overrides on top of the resolved settings
 *    chain when collapsing options before each render.
 *  - Clean up on close.
 */
export class NowlinePreview {
    private readonly panel: vscode.WebviewPanel;
    readonly sourceUri: vscode.Uri;
    private settings: PreviewSettings;
    private readonly rcCache: RcConfigCache;
    private readonly vscodeLanguage: string | undefined;
    private toolbarOverrides: ToolbarOverrides = {};
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    /** Monotonic counter so a slow render can't overwrite a newer one. */
    private renderSeq = 0;
    private disposed = false;

    constructor(opts: NowlinePreviewOptions) {
        this.panel = opts.panel;
        this.sourceUri = opts.sourceUri;
        this.settings = opts.settings;
        this.rcCache = opts.rcCache;
        this.vscodeLanguage = opts.vscodeLanguage;

        this.panel.webview.html = getShellHtml(this.panel.webview, opts.extensionUri);
        this.postInit();

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((msg) =>
                this.handleWebviewMessage(msg, opts.onMessage),
            ),
            this.panel.onDidDispose(() => {
                this.disposed = true;
                this.cancelDebounce();
                opts.onDispose(this);
                for (const d of this.disposables) {
                    try {
                        d.dispose();
                    } catch {
                        /* swallow */
                    }
                }
            }),
        );
    }

    /** Reveal the panel; optionally move it to a different column. */
    reveal(viewColumn?: vscode.ViewColumn): void {
        this.panel.reveal(viewColumn);
    }

    /** Apply new settings; re-render if the theme effectively changed. */
    updateSettings(settings: PreviewSettings, themeChanged: boolean): void {
        const oldResolvedTheme = this.resolveThemeQuick(this.settings);
        this.settings = settings;
        const newResolvedTheme = this.resolveThemeQuick(settings);

        this.postConfigChange();

        if (themeChanged || oldResolvedTheme !== newResolvedTheme) {
            void this.refreshNow();
        } else {
            // Re-render unconditionally for any other settings change so
            // locale / now / strict / etc. propagate immediately.
            void this.refreshNow();
        }
    }

    /**
     * Schedule a debounced refresh. Used for keystroke-triggered renders so
     * fast typing collapses into one render at the trailing edge.
     */
    refreshDebounced(): void {
        if (this.disposed) return;
        if (this.settings.refreshOn === 'save') return;
        this.cancelDebounce();
        const ms = Math.max(0, this.settings.debounceMs);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            void this.refreshNow();
        }, ms);
    }

    /** Render immediately (no debounce). Used for save events and reveal. */
    async refreshNow(): Promise<void> {
        if (this.disposed) return;
        this.cancelDebounce();
        const seq = ++this.renderSeq;
        try {
            const text = await this.readSourceText();
            const sourceDir = path.dirname(this.sourceUri.fsPath);
            const rc = await this.rcCache.resolveFor(sourceDir);
            const resolved = resolvePreviewOptions({
                settings: this.settings,
                rc: rc.config,
                vscodeLanguage: this.vscodeLanguage,
                isDarkTheme: isDarkColorTheme(),
                toolbarOverrides: this.toolbarOverrides,
            });
            const outcome = await renderDocument({
                text,
                fsPath: this.sourceUri.fsPath,
                theme: resolved.theme,
                today: resolved.today,
                locale: resolved.locale,
                width: resolved.width,
                showLinks: resolved.showLinks,
                strict: resolved.strict,
                assetRoot: resolved.assetRoot,
            });
            if (this.disposed || seq !== this.renderSeq) return;
            this.postOutcome(outcome);
        } catch (err) {
            if (this.disposed || seq !== this.renderSeq) return;
            const message = err instanceof Error ? err.message : String(err);
            void this.panel.webview.postMessage({ type: 'fatal', message });
        }
    }

    /** Webview is sometimes hidden; expose for write-after-message scenarios. */
    postFatal(message: string): void {
        if (this.disposed) return;
        void this.panel.webview.postMessage({ type: 'fatal', message });
    }

    /** Public hook so the manager can dispose us programmatically (deactivate). */
    dispose(): void {
        if (this.disposed) return;
        try {
            this.panel.dispose();
        } catch {
            /* swallow */
        }
    }

    /** Default file basename for save dialogs (without extension). */
    sourceBasename(): string {
        const base = path.basename(this.sourceUri.fsPath);
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
    }

    /**
     * The theme currently shown in this preview panel — toolbar overrides win
     * over settings, and `'auto'` is resolved to `'light'`/`'dark'` using the
     * active VS Code color theme. Use this when re-exporting the document so
     * the saved file matches what the preview displayed (including greyscale
     * toolbar overrides).
     */
    resolvedTheme(): 'light' | 'dark' | 'grayscale' {
        // Toolbar override takes precedence over the persistent setting,
        // matching the chain in resolvePreviewOptions / resolveTheme.
        const effective = this.toolbarOverrides.theme ?? this.settings.theme;
        if (effective === 'light') return 'light';
        if (effective === 'dark') return 'dark';
        if (effective === 'grayscale') return 'grayscale';
        // 'auto' (or unrecognised): follow the active VS Code color theme.
        return isDarkColorTheme() ? 'dark' : 'light';
    }

    /**
     * The now-line anchor currently shown in this preview panel — toolbar
     * overrides win over settings. Returns an explicit UTC-midnight `Date`
     * so the export kernel always has an unambiguous anchor, or `null` to
     * suppress the now-line entirely (mirrors `--now -`). Shares
     * {@link resolveTodayAnchor} with the live render so export == preview.
     */
    resolvedToday(): Date | null {
        return resolveTodayAnchor(this.toolbarOverrides.now, this.settings.now);
    }

    /**
     * The operator-chain locale currently shown in this preview panel:
     * `nowline.preview.locale` setting → `vscode.env.language`. Returns
     * `undefined` to let the export default to `en-US`. (The file's own
     * `nowline v1 locale:` directive still wins inside the layout for both
     * preview and export, so it isn't reflected here.) Mirrors the sync
     * `resolvedTheme()` / `resolvedToday()` pattern: the `.nowlinerc` layer
     * is resolved asynchronously during render and not consulted here.
     */
    resolvedLocale(): string | undefined {
        const fromSettings = this.settings.locale;
        if (typeof fromSettings === 'string' && fromSettings.length > 0) return fromSettings;
        if (typeof this.vscodeLanguage === 'string' && this.vscodeLanguage.length > 0) {
            return this.vscodeLanguage;
        }
        return undefined;
    }

    /**
     * Whether link icons are currently shown in this preview panel — toolbar
     * override wins over the persistent setting. Use this when re-exporting so
     * the saved file's link visibility matches what the preview displayed.
     */
    resolvedShowLinks(): boolean {
        return this.toolbarOverrides.showLinks ?? this.settings.showLinks;
    }

    private cancelDebounce(): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
    }

    private handleWebviewMessage(
        msg: PreviewWebviewMessage,
        external: (msg: PreviewWebviewMessage, source: NowlinePreview) => void,
    ): void {
        if (msg.type === 'viewOptions') {
            this.applyToolbarOverrides(msg.overrides);
            return;
        }
        external(msg, this);
    }

    private applyToolbarOverrides(payload: ViewOptionsPayload): void {
        const next: ToolbarOverrides = {};
        if (payload.theme) next.theme = payload.theme;
        if (payload.now !== undefined) {
            if (payload.now === 'today' || payload.now === 'hide') {
                next.now = payload.now;
            } else if (typeof payload.now === 'string') {
                const parsed = parseIsoDate(payload.now);
                if (parsed) next.now = parsed;
            }
        }
        if (payload.showLinks !== undefined) next.showLinks = payload.showLinks;
        this.toolbarOverrides = next;
        void this.refreshNow();
    }

    /**
     * Pull document text from VS Code's in-memory model when the source is
     * open (so unsaved edits show in the preview), falling back to the
     * filesystem when the document isn't currently in the editor.
     */
    private async readSourceText(): Promise<string> {
        const open = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === this.sourceUri.toString(),
        );
        if (open) return open.getText();
        const bytes = await vscode.workspace.fs.readFile(this.sourceUri);
        return new TextDecoder('utf-8').decode(bytes);
    }

    private postOutcome(outcome: RenderOutcome): void {
        if (outcome.kind === 'svg') {
            void this.panel.webview.postMessage({ type: 'svg', body: outcome.svg });
        } else {
            void this.panel.webview.postMessage({ type: 'diagnostics', rows: outcome.rows });
        }
    }

    private postInit(): void {
        void this.panel.webview.postMessage({
            type: 'init',
            defaultFit: this.settings.defaultFit,
            showMinimap: this.settings.showMinimap,
            showLinks: this.settings.showLinks,
            theme: this.settings.theme,
            now: this.settings.now,
            locale: this.vscodeLanguage,
        });
    }

    private postConfigChange(): void {
        void this.panel.webview.postMessage({
            type: 'configChange',
            defaultFit: this.settings.defaultFit,
            showMinimap: this.settings.showMinimap,
            showLinks: this.settings.showLinks,
            theme: this.settings.theme,
            now: this.settings.now,
            locale: this.vscodeLanguage,
        });
    }

    /**
     * Cheap theme resolution used to detect "did the resolved theme
     * change" without touching the rc cache. The full chain runs inside
     * `resolvePreviewOptions` for actual rendering.
     */
    private resolveThemeQuick(settings: PreviewSettings): 'light' | 'dark' | 'grayscale' {
        if (settings.theme === 'light') return 'light';
        if (settings.theme === 'dark') return 'dark';
        if (settings.theme === 'grayscale') return 'grayscale';
        return isDarkColorTheme() ? 'dark' : 'light';
    }
}

function isDarkColorTheme(): boolean {
    const kind = vscode.window.activeColorTheme?.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
}

function parseIsoDate(value: string): Date | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return undefined;
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
}
