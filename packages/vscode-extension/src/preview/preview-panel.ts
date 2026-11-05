import * as path from 'node:path';
import type { ThemeName } from '@nowline/layout';
import * as vscode from 'vscode';
import type { ExportSource } from '../export/export-source.js';
import { readDocumentText } from '../io/document-text.js';
import type { RcConfigCache } from '../io/rc-config.js';
import { parseToolbarNow, resolvePreviewOptions, withOptionProblems } from './option-resolver.js';
import { type RenderOutcome, renderDocument } from './render-pipeline.js';
import { getShellHtml } from './shell-html.js';

export type RefreshTrigger = 'keystroke' | 'save';
// Theme axis (the diagram render palette), distinct from the chrome Mode
// (light/dark workbench). `'grayscale'` is a full palette; `'auto'` follows
// the active VS Code color theme.
export type ThemeMode = 'auto' | ThemeName;
export type DefaultFit = 'fitPage' | 'fitWidth' | 'actual';
// Non-working-days axis. `'file'` is "no override": the roadmap's own
// `default roadmap non-working:` key applies, then `hide`.
export type NonWorkingMode = 'file' | 'hide' | 'show';

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
    /**
     * Non-working days display: `'file'` (default) follows the roadmap's own
     * key; `'hide'` / `'show'` override it. The toolbar override wins over
     * this; there is no `.nowlinerc` key.
     */
    nonWorking: NonWorkingMode;
    strict: boolean;
    showLinks: boolean;
    /** Maximum canvas width in px; `0` leaves it unset (fit content). */
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
    /** `'file'` is an explicit "follow the file", which beats the setting. */
    nonWorking?: NonWorkingMode;
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
    nonWorking?: NonWorkingMode;
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
    /** The text and options of the latest render; what Save and Export… write. */
    private shown: ExportSource | undefined;
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

    /** Apply new settings (or a new editor color theme) and re-render. */
    updateSettings(settings: PreviewSettings): void {
        this.settings = settings;
        this.postConfigChange();
        void this.refreshNow();
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
            const text = await readDocumentText(this.sourceUri);
            const sourceDir = path.dirname(this.sourceUri.fsPath);
            const rc = await this.rcCache.resolveFor(sourceDir);
            const resolved = resolvePreviewOptions({
                settings: this.settings,
                rc: rc.config,
                vscodeLanguage: this.vscodeLanguage,
                isDarkTheme: isDarkColorTheme(),
                toolbarOverrides: this.toolbarOverrides,
                rcPath: rc.rcPath,
            });
            // Recorded before rendering, so an export taken while the render
            // runs writes this text and not an older one. A newer refresh that
            // started meanwhile owns the record instead.
            if (seq === this.renderSeq) {
                this.shown = { text, sourcePath: this.sourceUri.fsPath, options: resolved };
            }
            const outcome = await renderDocument({
                text,
                fsPath: this.sourceUri.fsPath,
                theme: resolved.theme,
                today: resolved.today,
                locale: resolved.locale,
                width: resolved.width,
                nonWorking: resolved.nonWorking,
                showLinks: resolved.showLinks,
                strict: resolved.strict,
                assetRoot: resolved.assetRoot,
            });
            if (this.disposed || seq !== this.renderSeq) return;
            this.postOutcome(withOptionProblems(outcome, resolved.problems));
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
     * The text and resolved options of the latest render, or `undefined`
     * before the first one. Save, the copy-PNG fallback and Export… use these
     * so the file they write is the diagram the preview drew: its theme,
     * now-line, locale, links, non-working days, asset root and text.
     */
    lastRender(): ExportSource | undefined {
        return this.shown;
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
            const now = parseToolbarNow(payload.now);
            if (now) next.now = now;
        }
        if (isNonWorkingMode(payload.nonWorking)) next.nonWorking = payload.nonWorking;
        if (payload.showLinks !== undefined) next.showLinks = payload.showLinks;
        this.toolbarOverrides = next;
        void this.refreshNow();
    }

    private postOutcome(outcome: RenderOutcome): void {
        if (outcome.kind === 'svg') {
            void this.panel.webview.postMessage({ type: 'svg', body: outcome.svg });
            // The shell shows warnings after the diagram, without dimming it.
            if (outcome.warnings && outcome.warnings.length > 0) {
                void this.panel.webview.postMessage({
                    type: 'diagnostics',
                    rows: outcome.warnings,
                });
            }
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
            nonWorking: this.settings.nonWorking,
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
            nonWorking: this.settings.nonWorking,
            locale: this.vscodeLanguage,
        });
    }
}

/** Whether the editor's color theme is dark, which a theme of `auto` follows. */
export function isDarkColorTheme(): boolean {
    const kind = vscode.window.activeColorTheme?.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
}

function isNonWorkingMode(value: unknown): value is NonWorkingMode {
    return value === 'file' || value === 'hide' || value === 'show';
}
