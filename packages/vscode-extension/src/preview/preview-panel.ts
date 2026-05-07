import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ThemeName } from '@nowline/layout';
import { renderDocument, type RenderOutcome } from './render-pipeline.js';
import { getShellHtml } from './shell-html.js';

export type RefreshTrigger = 'keystroke' | 'save';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type DefaultFit = 'fitPage' | 'fitWidth' | 'actual';

export interface PreviewSettings {
    refreshOn: RefreshTrigger;
    debounceMs: number;
    theme: ThemeMode;
    defaultFit: DefaultFit;
    showMinimap: boolean;
}

/**
 * Messages posted from the webview back to the extension host. The host
 * doesn't care about the shape beyond the discriminator — `extension.ts`
 * handles dispatch via the `onMessage` callback supplied at construction.
 */
export type PreviewWebviewMessage =
    | { type: 'goto'; file: string; line: number; column: number }
    | { type: 'openProblems' }
    | { type: 'toggleMaximize' }
    | { type: 'save'; format: 'svg' | 'png'; body: string | Uint8Array }
    | { type: 'copyPngFallback'; body: Uint8Array }
    | { type: 'fatal'; message: string };

export interface NowlinePreviewOptions {
    panel: vscode.WebviewPanel;
    sourceUri: vscode.Uri;
    settings: PreviewSettings;
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
 *  - Clean up on close.
 */
export class NowlinePreview {
    private readonly panel: vscode.WebviewPanel;
    readonly sourceUri: vscode.Uri;
    private settings: PreviewSettings;
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;
    /** Monotonic counter so a slow render can't overwrite a newer one. */
    private renderSeq = 0;
    private disposed = false;

    constructor(opts: NowlinePreviewOptions) {
        this.panel = opts.panel;
        this.sourceUri = opts.sourceUri;
        this.settings = opts.settings;

        this.panel.webview.html = getShellHtml(this.panel.webview);
        this.postInit();

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((msg) =>
                opts.onMessage(msg as PreviewWebviewMessage, this),
            ),
            this.panel.onDidDispose(() => {
                this.disposed = true;
                this.cancelDebounce();
                opts.onDispose(this);
                for (const d of this.disposables) {
                    try { d.dispose(); } catch { /* swallow */ }
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
        const oldTheme = this.resolveTheme(this.settings);
        this.settings = settings;
        const newTheme = this.resolveTheme(settings);

        this.postConfigChange();

        if (themeChanged || oldTheme !== newTheme) {
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
            const outcome = await renderDocument({
                text,
                fsPath: this.sourceUri.fsPath,
                theme: this.resolveTheme(this.settings),
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
        try { this.panel.dispose(); } catch { /* swallow */ }
    }

    /** Default file basename for save dialogs (without extension). */
    sourceBasename(): string {
        const base = path.basename(this.sourceUri.fsPath);
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
    }

    private cancelDebounce(): void {
        if (this.debounceTimer !== undefined) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
    }

    /**
     * Pull document text from VS Code's in-memory model when the source is
     * open (so unsaved edits show in the preview), falling back to the
     * filesystem when the document isn't currently in the editor.
     */
    private async readSourceText(): Promise<string> {
        const open = vscode.workspace.textDocuments.find((d) =>
            d.uri.toString() === this.sourceUri.toString(),
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
        });
    }

    private postConfigChange(): void {
        void this.panel.webview.postMessage({
            type: 'configChange',
            defaultFit: this.settings.defaultFit,
            showMinimap: this.settings.showMinimap,
        });
    }

    private resolveTheme(settings: PreviewSettings): ThemeName {
        if (settings.theme === 'light') return 'light';
        if (settings.theme === 'dark') return 'dark';
        const kind = vscode.window.activeColorTheme?.kind;
        if (
            kind === vscode.ColorThemeKind.Dark ||
            kind === vscode.ColorThemeKind.HighContrast
        ) {
            return 'dark';
        }
        return 'light';
    }
}
