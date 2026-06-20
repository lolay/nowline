import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';
import { type ExportSettings, runExportCommand } from './export/cli-runner.js';
import { exportInProcess, initExportRuntime } from './export/in-process.js';
import { runNewRoadmapCommand } from './export/new-roadmap.js';
import { DisagreementTracker } from './io/disagreement-check.js';
import { RcConfigCache } from './io/rc-config.js';
import { resolveTodayAnchor } from './preview/option-resolver.js';
import { PreviewManager } from './preview/preview-manager.js';
import type {
    DefaultFit,
    NowlinePreview,
    PreviewSettings,
    PreviewWebviewMessage,
    RefreshTrigger,
    ThemeMode,
} from './preview/preview-panel.js';

let client: LanguageClient | undefined;
let previewManager: PreviewManager | undefined;
let rcCache: RcConfigCache | undefined;
let disagreementTracker: DisagreementTracker | undefined;
let exportOutputChannel: vscode.OutputChannel | undefined;
// Drives the `nowline.previewMaximized` when-context that swaps the preview
// tab's expand/collapse title-bar icon. See togglePreviewFullscreen.
let previewMaximized = false;

// Mirrors the URL terminal in packages/core/src/language/nowline.langium —
// `https?://` followed by any non-whitespace, non-list-punctuation chars.
const URL_RE = /https?:\/\/[^\s[\],]+/g;

export function activate(context: vscode.ExtensionContext): void {
    startLanguageClient(context);

    rcCache = new RcConfigCache();
    rcCache.setDisabled(readIgnoreRcFile());
    disagreementTracker = new DisagreementTracker();
    exportOutputChannel = vscode.window.createOutputChannel('Nowline Export');

    // Register the dist/ path so in-process PNG export can load resvg.wasm.
    initExportRuntime(path.join(context.extensionPath, 'dist'));

    // Seed the title-bar toggle to its "expand" state. A fresh window is
    // never maximized, and a window reload also resets the editor layout, so
    // false is always correct at activation.
    setPreviewMaximized(false);

    previewManager = new PreviewManager(context, {
        readSettings: readPreviewSettings,
        rcCache,
        vscodeLanguage: () => vscode.env.language,
        onMessage: handleWebviewMessage,
        // Clearing on dispose keeps the expand/collapse icon honest when a
        // maximized preview is closed (VS Code restores the layout for us).
        onDispose: () => setPreviewMaximized(false),
    });

    context.subscriptions.push(
        {
            dispose: () => {
                void client?.stop();
            },
        },
        { dispose: () => previewManager?.dispose() },
        { dispose: () => rcCache?.dispose() },
        { dispose: () => exportOutputChannel?.dispose() },
        vscode.commands.registerCommand('nowline.openLinkInSideBrowser', openLinkInSideBrowser),
        vscode.commands.registerCommand('nowline.openPreview', (uri?: vscode.Uri) =>
            openPreview(uri, vscode.ViewColumn.Active),
        ),
        vscode.commands.registerCommand('nowline.openPreviewToSide', (uri?: vscode.Uri) =>
            openPreview(uri, vscode.ViewColumn.Beside),
        ),
        vscode.commands.registerCommand('nowline.showSource', () => showSource()),
        vscode.commands.registerCommand('nowline.preview.expand', () => togglePreviewFullscreen()),
        vscode.commands.registerCommand('nowline.preview.collapse', () =>
            togglePreviewFullscreen(),
        ),
        vscode.commands.registerCommand('nowline.export', (uri?: vscode.Uri) => handleExport(uri)),
        vscode.commands.registerCommand('nowline.newRoadmap', () => runNewRoadmapCommand()),
        rcCache.onDidChange(() => {
            previewManager?.refreshAll();
        }),
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
            if (e.affectsConfiguration('nowline.ignoreRcFile')) {
                rcCache?.setDisabled(readIgnoreRcFile());
                disagreementTracker?.reset();
            }
            if (
                e.affectsConfiguration('nowline.preview') ||
                e.affectsConfiguration('nowline.ignoreRcFile')
            ) {
                disagreementTracker?.reset();
                const settings = readPreviewSettings();
                previewManager?.propagateSettings(settings, /*themeChanged*/ false);
            }
        }),
    );
}

export function deactivate(): Thenable<void> | undefined {
    previewManager?.dispose();
    rcCache?.dispose();
    exportOutputChannel?.dispose();
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
        outputChannel: vscode.window.createOutputChannel('Nowline Language Server', { log: true }),
    };

    client = new LanguageClient('nowline', 'Nowline Language Server', serverOptions, clientOptions);

    client.start().catch((err) => {
        vscode.window.showErrorMessage(
            `Nowline language server failed to start: ${err instanceof Error ? err.message : String(err)}`,
        );
    });
}

async function openPreview(
    uri: vscode.Uri | undefined,
    viewColumn: vscode.ViewColumn,
): Promise<void> {
    if (!previewManager) return;
    const target = uri ?? activeNowlineUri();
    if (!target) {
        vscode.window.showInformationMessage('Open a .nowline file to use Nowline preview.');
        return;
    }
    await previewManager.openOrReveal(target, viewColumn);
    // Fire-and-forget shadow-warning check; rcCache hit is cached after the
    // first preview render, so this is a cheap second lookup.
    if (rcCache && disagreementTracker) {
        const dir = path.dirname(target.fsPath);
        const rc = await rcCache.resolveFor(dir);
        disagreementTracker.check(rc.config, rc.rcPath, target);
    }
}

/**
 * Reverse of `openPreviewToSide`: from the preview's title-bar button, jump
 * back to the source. If a visible editor already shows the source, reveal
 * that editor in place; otherwise open it beside the active preview so we
 * don't blow the preview away.
 */
async function showSource(): Promise<void> {
    const active = previewManager?.getActive();
    if (!active) {
        vscode.window.showInformationMessage('No active Nowline preview.');
        return;
    }
    const uri = active.sourceUri;
    const existing = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === uri.toString(),
    );
    if (existing) {
        await vscode.window.showTextDocument(existing.document, {
            viewColumn: existing.viewColumn,
            preserveFocus: false,
        });
        return;
    }
    await vscode.window.showTextDocument(uri, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
    });
}

/**
 * Title-bar toggle that mirrors the free app's fullscreen button: expand the
 * preview to fill VS Code's editor area, then restore it. We piggy-back on the
 * built-in "Toggle Maximize Editor Group" so the action stays a clean,
 * reversible primitive — no fragile sidebar/panel state to remember. The
 * expand (`$(screen-full)`) ↔ restore (`$(screen-normal)`) icon swap is driven
 * by the `nowline.previewMaximized` context key we maintain here.
 *
 * VS Code doesn't surface editor-group maximize state to extensions, so if the
 * user un-maximizes another way (double-clicking the tab, the command palette)
 * the icon can briefly disagree; one more click re-syncs it.
 */
async function togglePreviewFullscreen(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
    setPreviewMaximized(!previewMaximized);
}

function setPreviewMaximized(value: boolean): void {
    previewMaximized = value;
    void vscode.commands.executeCommand('setContext', 'nowline.previewMaximized', value);
}

function activeNowlineUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'nowline') return editor.document.uri;
    const open = vscode.workspace.textDocuments.find((d) => d.languageId === 'nowline');
    return open?.uri;
}

function readIgnoreRcFile(): boolean {
    return vscode.workspace.getConfiguration('nowline').get<boolean>('ignoreRcFile') ?? false;
}

function readPreviewSettings(): PreviewSettings {
    const cfg = vscode.workspace.getConfiguration('nowline.preview');
    const refreshOn = (cfg.get<string>('refreshOn') ?? 'keystroke') as RefreshTrigger;
    const debounceMs = cfg.get<number>('debounceMs') ?? 200;
    const theme = (cfg.get<string>('theme') ?? 'auto') as ThemeMode;
    const defaultFit = (cfg.get<string>('defaultFit') ?? 'fitPage') as DefaultFit;
    const showMinimap = cfg.get<boolean>('showMinimap') ?? true;
    const locale = cfg.get<string>('locale') ?? '';
    const now = cfg.get<string>('now') ?? 'auto';
    const timezone = cfg.get<string>('timezone') ?? '';
    const strict = cfg.get<boolean>('strict') ?? false;
    const showLinks = cfg.get<boolean>('showLinks') ?? true;
    const width = cfg.get<number>('width') ?? 0;
    const assetRoot = cfg.get<string>('assetRoot') ?? '';
    return {
        refreshOn,
        debounceMs,
        theme,
        defaultFit,
        showMinimap,
        locale,
        now,
        timezone,
        strict,
        showLinks,
        width,
        assetRoot,
    };
}

/**
 * Resolve the theme to use for an export of `sourceUri`.
 *
 * Priority chain:
 *  1. An open preview for this file: its current resolved theme wins, including
 *     any toolbar overrides (e.g. the user switched to greyscale in the panel).
 *  2. No preview open: apply the same `auto` logic the preview would use —
 *     read `nowline.preview.theme` and resolve `auto` against the active VS
 *     Code color theme.
 *
 * This ensures every export surface (toolbar save, Export… command, file
 * context menu) produces an artifact that matches the preview.
 */
function resolveThemeForExport(sourceUri: vscode.Uri): 'light' | 'dark' | 'grayscale' {
    const preview = previewManager?.getForSource(sourceUri);
    if (preview) return preview.resolvedTheme();
    // No preview open — fall back to the preview setting + VS Code color theme.
    const setting = readPreviewSettings().theme;
    if (setting === 'light') return 'light';
    if (setting === 'dark') return 'dark';
    if (setting === 'grayscale') return 'grayscale';
    // 'auto': match the active VS Code color theme.
    const kind = vscode.window.activeColorTheme?.kind;
    const isDark =
        kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
    return isDark ? 'dark' : 'light';
}

/**
 * Resolve the now-line anchor to use for an export of `sourceUri`.
 *
 * Precedence (same as the preview's own resolution):
 *  1. `NowlinePreview.resolvedToday()` when a preview is open — respects
 *     toolbar overrides (pinned date, "Today", "Hide").
 *  2. `nowline.preview.now` + `nowline.preview.timezone` settings, resolved
 *     via `resolveTodayAnchor` (defaults to local civil date).
 */
function resolveNowForExport(sourceUri: vscode.Uri): Date | null {
    const preview = previewManager?.getForSource(sourceUri);
    if (preview) return preview.resolvedToday();
    // No preview open — fall back to the preview setting.
    const settings = readPreviewSettings();
    return resolveTodayAnchor(undefined, settings.now, settings.timezone);
}

/**
 * Resolve the operator-chain locale to use for an export of `sourceUri`.
 *
 *  1. `NowlinePreview.resolvedLocale()` when a preview is open.
 *  2. `nowline.preview.locale` setting → `vscode.env.language`.
 *
 * `undefined` lets the export default to `en-US`. (The file's own
 * `nowline v1 locale:` directive still wins inside the layout regardless.)
 */
function resolveLocaleForExport(sourceUri: vscode.Uri): string | undefined {
    const preview = previewManager?.getForSource(sourceUri);
    if (preview) return preview.resolvedLocale();
    const fromSettings = readPreviewSettings().locale;
    if (fromSettings.length > 0) return fromSettings;
    const lang = vscode.env.language;
    return typeof lang === 'string' && lang.length > 0 ? lang : undefined;
}

/**
 * Resolve link-icon visibility to use for an export of `sourceUri`.
 *
 *  1. `NowlinePreview.resolvedShowLinks()` when a preview is open (respects
 *     the toolbar toggle).
 *  2. `nowline.preview.showLinks` setting (default true).
 */
function resolveShowLinksForExport(sourceUri: vscode.Uri): boolean {
    const preview = previewManager?.getForSource(sourceUri);
    if (preview) return preview.resolvedShowLinks();
    return readPreviewSettings().showLinks;
}

function readExportSettings(): ExportSettings {
    const cfg = vscode.workspace.getConfiguration('nowline.export');
    return {
        cliPath: cfg.get<string>('cliPath') ?? 'nowline',
        pdfPageSize: cfg.get<string>('pdf.pageSize') ?? 'letter',
        pdfOrientation: cfg.get<string>('pdf.orientation') ?? 'auto',
        pdfMargin: cfg.get<string>('pdf.margin') ?? '36pt',
        fontSans: cfg.get<string>('fonts.sans') ?? '',
        fontMono: cfg.get<string>('fonts.mono') ?? '',
        headlessFonts: cfg.get<boolean>('fonts.headless') ?? false,
        pngScale: cfg.get<number>('png.scale') ?? 1,
        msprojStart: cfg.get<string>('msproj.start') ?? '',
        width: cfg.get<number>('width') ?? 0,
    };
}

function handleWebviewMessage(msg: PreviewWebviewMessage, source: NowlinePreview): void {
    switch (msg.type) {
        case 'goto':
            void handleGoto(msg.file, msg.line, msg.column);
            return;
        case 'openProblems':
            void vscode.commands.executeCommand('workbench.actions.view.problems');
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
        case 'viewOptions':
            // Toolbar overrides are handled inside NowlinePreview; the
            // external dispatcher should never see them.
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

    let bytes: Uint8Array;
    // Use the same render options the preview is currently showing so the
    // saved file matches what the user sees — theme, now-line, locale, and
    // link visibility all respect toolbar overrides.
    const overrides = {
        theme: source.resolvedTheme(),
        today: source.resolvedToday(),
        locale: source.resolvedLocale(),
        noLinks: !source.resolvedShowLinks(),
    };

    if (format === 'png') {
        // Re-rasterize via the kernel (WASM) so the saved file matches
        // "Nowline: Export... → PNG" byte-for-byte (plan s7).
        try {
            const result = await exportInProcess(
                source.sourceUri.fsPath,
                'png',
                readExportSettings(),
                overrides,
            );
            bytes = result.rendered as Uint8Array;
        } catch (err) {
            vscode.window.showErrorMessage(
                `Nowline: PNG rasterization failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return;
        }
    } else {
        // Re-render via the kernel rather than persisting the webview's SVG:
        // the preview SVG pins the bundled family (paired with an injected
        // @font-face), which a standalone .svg file cannot resolve. The kernel
        // emits the portable FONT_STACK so the saved file renders anywhere and
        // matches "Nowline: Export... → SVG" byte-for-byte. `body` is ignored.
        void body;
        try {
            const result = await exportInProcess(
                source.sourceUri.fsPath,
                'svg',
                readExportSettings(),
                overrides,
            );
            bytes = new TextEncoder().encode(result.rendered as string);
        } catch (err) {
            vscode.window.showErrorMessage(
                `Nowline: SVG export failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            return;
        }
    }

    try {
        await vscode.workspace.fs.writeFile(target, bytes);
        vscode.window.setStatusBarMessage(`Nowline: saved ${path.basename(target.fsPath)}`, 4000);
    } catch (err) {
        vscode.window.showErrorMessage(
            `Nowline: failed to save ${ext.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

async function handleCopyPngFallback(_body: Uint8Array, source: NowlinePreview): Promise<void> {
    // Re-rasterize via the kernel (WASM) so the temp file is canonical —
    // matches "Nowline: Export... → PNG" byte-for-byte (plan s7).
    let pngBytes: Uint8Array;
    try {
        const result = await exportInProcess(source.sourceUri.fsPath, 'png', readExportSettings(), {
            today: source.resolvedToday(),
            theme: source.resolvedTheme(),
            locale: source.resolvedLocale(),
            noLinks: !source.resolvedShowLinks(),
        });
        pngBytes = result.rendered as Uint8Array;
    } catch (err) {
        vscode.window.showErrorMessage(
            `Nowline: failed to write PNG fallback: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
    }

    const tmpFile = path.join(os.tmpdir(), `nowline-${source.sourceBasename()}-${Date.now()}.png`);
    const target = vscode.Uri.file(tmpFile);
    try {
        await vscode.workspace.fs.writeFile(target, pngBytes);
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

async function handleExport(uri: vscode.Uri | undefined): Promise<void> {
    const target = uri ?? activeNowlineUri();
    if (!target) {
        vscode.window.showInformationMessage('Open a .nowline file to use Nowline export.');
        return;
    }
    if (!exportOutputChannel) return;
    await runExportCommand({
        sourceUri: target,
        settings: readExportSettings(),
        outputChannel: exportOutputChannel,
        theme: resolveThemeForExport(target),
        today: resolveNowForExport(target),
        locale: resolveLocaleForExport(target),
        showLinks: resolveShowLinksForExport(target),
    });
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
            validateInput: (value) =>
                /^https?:\/\//.test(value) ? null : 'Must start with http:// or https://',
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
        const distance =
            cursorChar < start ? start - cursorChar : cursorChar > end ? cursorChar - end : 0;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestUrl = match[0];
        }
    }
    return bestUrl;
}
