import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { PreviewManager } from './preview/preview-manager.js';
import {
    type NowlinePreview,
    type PreviewSettings,
    type PreviewWebviewMessage,
    type DefaultFit,
    type RefreshTrigger,
    type ThemeMode,
} from './preview/preview-panel.js';

let client: LanguageClient | undefined;
let previewManager: PreviewManager | undefined;

// Mirrors the URL terminal in packages/core/src/language/nowline.langium —
// `https?://` followed by any non-whitespace, non-list-punctuation chars.
const URL_RE = /https?:\/\/[^\s\[\],]+/g;

export function activate(context: vscode.ExtensionContext): void {
    startLanguageClient(context);
    previewManager = new PreviewManager(context, {
        readSettings: readPreviewSettings,
        onMessage: handleWebviewMessage,
    });

    context.subscriptions.push(
        { dispose: () => { void client?.stop(); } },
        { dispose: () => previewManager?.dispose() },
        vscode.commands.registerCommand('nowline.openLinkInSideBrowser', openLinkInSideBrowser),
        vscode.commands.registerCommand('nowline.openPreview', (uri?: vscode.Uri) =>
            openPreview(uri, vscode.ViewColumn.Active),
        ),
        vscode.commands.registerCommand('nowline.openPreviewToSide', (uri?: vscode.Uri) =>
            openPreview(uri, vscode.ViewColumn.Beside),
        ),
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.languageId !== 'nowline') return;
            previewManager?.forEach((p) => {
                if (p.sourceUri.toString() === e.document.uri.toString()) {
                    p.refreshDebounced();
                }
            });
        }),
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.languageId !== 'nowline') return;
            previewManager?.forEach((p) => {
                if (p.sourceUri.toString() === doc.uri.toString()) {
                    void p.refreshNow();
                }
            });
        }),
        vscode.window.onDidChangeActiveColorTheme(() => {
            // Theme override = 'auto' panels need to re-render with the new
            // resolved theme. updateSettings() with themeChanged=true
            // re-renders unconditionally; cheap because parses are <10ms.
            const settings = readPreviewSettings();
            previewManager?.propagateSettings(settings, /*themeChanged*/ true);
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('nowline.preview')) return;
            const settings = readPreviewSettings();
            previewManager?.propagateSettings(settings, /*themeChanged*/ false);
        }),
    );
}

export function deactivate(): Thenable<void> | undefined {
    previewManager?.dispose();
    if (!client) return undefined;
    return client.stop();
}

function startLanguageClient(context: vscode.ExtensionContext): void {
    const serverModule = context.asAbsolutePath(path.join('dist', 'server.cjs'));

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'nowline' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.nowline'),
        },
        outputChannel: vscode.window.createOutputChannel('Nowline Language Server'),
    };

    client = new LanguageClient(
        'nowline',
        'Nowline Language Server',
        serverOptions,
        clientOptions,
    );

    client.start().catch((err) => {
        vscode.window.showErrorMessage(
            `Nowline language server failed to start: ${err instanceof Error ? err.message : String(err)}`,
        );
    });
}

async function openPreview(uri: vscode.Uri | undefined, viewColumn: vscode.ViewColumn): Promise<void> {
    if (!previewManager) return;
    const target = uri ?? activeNowlineUri();
    if (!target) {
        vscode.window.showInformationMessage(
            'Open a .nowline file to use Nowline preview.',
        );
        return;
    }
    await previewManager.openOrReveal(target, viewColumn);
}

function activeNowlineUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'nowline') return editor.document.uri;
    const open = vscode.workspace.textDocuments.find((d) => d.languageId === 'nowline');
    return open?.uri;
}

function readPreviewSettings(): PreviewSettings {
    const cfg = vscode.workspace.getConfiguration('nowline.preview');
    const refreshOn = (cfg.get<string>('refreshOn') ?? 'keystroke') as RefreshTrigger;
    const debounceMs = cfg.get<number>('debounceMs') ?? 200;
    const theme = (cfg.get<string>('theme') ?? 'auto') as ThemeMode;
    const defaultFit = (cfg.get<string>('defaultFit') ?? 'fitPage') as DefaultFit;
    const showMinimap = cfg.get<boolean>('showMinimap') ?? true;
    return { refreshOn, debounceMs, theme, defaultFit, showMinimap };
}

function handleWebviewMessage(msg: PreviewWebviewMessage, source: NowlinePreview): void {
    switch (msg.type) {
        case 'goto':
            void handleGoto(msg.file, msg.line, msg.column);
            return;
        case 'openProblems':
            void vscode.commands.executeCommand('workbench.actions.view.problems');
            return;
        case 'toggleMaximize':
            void vscode.commands.executeCommand('workbench.action.maximizeEditorHideSidebar');
            return;
        case 'save':
            void handleSave(msg.format, msg.body, source);
            return;
        case 'copyPngFallback':
            void handleCopyPngFallback(msg.body, source);
            return;
        case 'fatal':
            // Webview-side rasterize / clipboard failures surface here so
            // the user sees a notification instead of a silent dead button.
            vscode.window.showErrorMessage(`Nowline preview: ${msg.message}`);
            return;
    }
}

async function handleGoto(file: string, line: number, column: number): Promise<void> {
    if (!file) return;
    const target = vscode.Uri.file(file);
    const editor = await vscode.window.showTextDocument(target, {
        preserveFocus: false,
        viewColumn: vscode.ViewColumn.One,
    });
    const lspLine = Math.max(0, line - 1);
    const lspCol = Math.max(0, column - 1);
    const range = new vscode.Range(lspLine, lspCol, lspLine, lspCol);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function handleSave(
    format: 'svg' | 'png',
    body: string | Uint8Array,
    source: NowlinePreview,
): Promise<void> {
    const ext = format === 'png' ? 'png' : 'svg';
    const defaultName = `${source.sourceBasename()}.${ext}`;
    const defaultDir = path.dirname(source.sourceUri.fsPath);
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, defaultName)),
        filters: format === 'png' ? { PNG: ['png'] } : { SVG: ['svg'] },
        saveLabel: `Save ${ext.toUpperCase()}`,
    });
    if (!target) return;
    const bytes = format === 'svg'
        ? new TextEncoder().encode(typeof body === 'string' ? body : '')
        : body instanceof Uint8Array ? body : new Uint8Array();
    try {
        await vscode.workspace.fs.writeFile(target, bytes);
        vscode.window.setStatusBarMessage(`Nowline: saved ${path.basename(target.fsPath)}`, 4000);
    } catch (err) {
        vscode.window.showErrorMessage(
            `Nowline: failed to save ${ext.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

async function handleCopyPngFallback(body: Uint8Array, source: NowlinePreview): Promise<void> {
    const tmpFile = path.join(os.tmpdir(), `nowline-${source.sourceBasename()}-${Date.now()}.png`);
    const target = vscode.Uri.file(tmpFile);
    try {
        await vscode.workspace.fs.writeFile(target, body);
    } catch (err) {
        vscode.window.showErrorMessage(
            `Nowline: failed to write PNG fallback: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
    }
    const choice = await vscode.window.showInformationMessage(
        `Clipboard PNG copy not available; saved to ${tmpFile}.`,
        'Reveal in Finder',
    );
    if (choice) {
        void vscode.commands.executeCommand('revealFileInOS', target);
    }
}

/**
 * Open the URL nearest to the cursor in the built-in Simple Browser side
 * panel. Falls back to a prompt when no URL is found on the current line.
 */
async function openLinkInSideBrowser(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    let url = editor ? findUrlNearCursor(editor) : undefined;
    if (!url) {
        url = await vscode.window.showInputBox({
            prompt: 'URL to open in the side browser',
            placeHolder: 'https://example.com',
            validateInput: (value) => /^https?:\/\//.test(value) ? null : 'Must start with http:// or https://',
        });
    }
    if (!url) return;
    await vscode.commands.executeCommand('simpleBrowser.show', url);
}

function findUrlNearCursor(editor: vscode.TextEditor): string | undefined {
    const line = editor.document.lineAt(editor.selection.active.line).text;
    const cursorChar = editor.selection.active.character;
    let bestUrl: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const match of line.matchAll(URL_RE)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        // Distance: 0 when cursor is inside the URL; otherwise distance to the
        // nearest edge.
        const distance = cursorChar < start ? start - cursorChar
            : cursorChar > end ? cursorChar - end : 0;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestUrl = match[0];
        }
    }
    return bestUrl;
}
