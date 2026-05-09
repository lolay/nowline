import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RcConfigCache } from '../io/rc-config.js';
import {
    NowlinePreview,
    type PreviewSettings,
    type PreviewWebviewMessage,
} from './preview-panel.js';

const VIEW_TYPE = 'nowline.preview';

export interface PreviewManagerDeps {
    /** Read the current `nowline.preview.*` settings as a snapshot. */
    readSettings(): PreviewSettings;
    /** `.nowlinerc` cache shared across all panels. */
    rcCache: RcConfigCache;
    /** `vscode.env.language` snapshot — refreshed via `readSettings` callers if it ever changes. */
    vscodeLanguage(): string | undefined;
    /** Webview message handler, owned by extension.ts. */
    onMessage(msg: PreviewWebviewMessage, source: NowlinePreview): void;
}

/**
 * Tracks one preview per source-document URI. Re-invoking an open command on
 * the same source reveals the existing panel; a new source opens a new panel.
 *
 * The manager doesn't own message dispatch — it forwards every webview message
 * to `deps.onMessage` so the extension host stays the single dispatch site
 * (lets us call `vscode.commands.executeCommand`, `showSaveDialog`, etc.).
 */
export class PreviewManager {
    private readonly previews = new Map<string, NowlinePreview>();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly deps: PreviewManagerDeps,
    ) {}

    /**
     * Open a preview for `sourceUri`, or reveal the existing one. Opening
     * the source document text first guarantees the in-memory document is
     * available to readSourceText() inside the panel.
     */
    async openOrReveal(
        sourceUri: vscode.Uri,
        viewColumn: vscode.ViewColumn,
    ): Promise<NowlinePreview> {
        const key = sourceUri.toString();
        const existing = this.previews.get(key);
        if (existing) {
            existing.reveal(viewColumn);
            void existing.refreshNow();
            return existing;
        }

        // Make sure the source document is loaded so the panel can read its
        // unsaved text via vscode.workspace.textDocuments.
        try {
            await vscode.workspace.openTextDocument(sourceUri);
        } catch {
            /* fall through; refreshNow will fall back to reading from disk */
        }

        const panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            this.titleFor(sourceUri),
            viewColumn,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: this.localResourceRoots(sourceUri),
            },
        );
        panel.iconPath = this.iconPaths();

        const preview = new NowlinePreview({
            panel,
            sourceUri,
            settings: this.deps.readSettings(),
            rcCache: this.deps.rcCache,
            vscodeLanguage: this.deps.vscodeLanguage(),
            onMessage: (msg, source) => this.deps.onMessage(msg, source),
            onDispose: (source) => this.previews.delete(source.sourceUri.toString()),
        });
        this.previews.set(key, preview);
        void preview.refreshNow();
        return preview;
    }

    /** Lookup an open preview by source URI. */
    getForSource(sourceUri: vscode.Uri): NowlinePreview | undefined {
        return this.previews.get(sourceUri.toString());
    }

    /** Iterate every open preview. Used by document-change forwarding. */
    forEach(visit: (preview: NowlinePreview) => void): void {
        for (const p of this.previews.values()) visit(p);
    }

    /** Push a new settings snapshot to every open panel. */
    propagateSettings(settings: PreviewSettings, themeChanged: boolean): void {
        for (const p of this.previews.values()) {
            p.updateSettings(settings, themeChanged);
        }
    }

    /** Trigger an immediate refresh on every open panel (e.g. on rc-file change). */
    refreshAll(): void {
        for (const p of this.previews.values()) {
            void p.refreshNow();
        }
    }

    /** Dispose all panels (called on extension deactivate). */
    dispose(): void {
        const all = [...this.previews.values()];
        this.previews.clear();
        for (const p of all) p.dispose();
    }

    private titleFor(sourceUri: vscode.Uri): string {
        return `Preview ${path.basename(sourceUri.fsPath)}`;
    }

    private localResourceRoots(sourceUri: vscode.Uri): vscode.Uri[] {
        const roots: vscode.Uri[] = [
            vscode.Uri.file(path.dirname(sourceUri.fsPath)),
            this.context.extensionUri,
        ];
        const folder = vscode.workspace.getWorkspaceFolder(sourceUri);
        if (folder) roots.push(folder.uri);
        return roots;
    }

    private iconPaths(): { light: vscode.Uri; dark: vscode.Uri } {
        return {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'icons', 'nowline-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'icons', 'nowline-dark.svg'),
        };
    }
}
