import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

// Mirrors the URL terminal in packages/core/src/language/nowline.langium —
// `https?://` followed by any non-whitespace, non-list-punctuation chars.
const URL_RE = /https?:\/\/[^\s\[\],]+/g;

export function activate(context: vscode.ExtensionContext): void {
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

    context.subscriptions.push(
        { dispose: () => { void client?.stop(); } },
        vscode.commands.registerCommand('nowline.openLinkInSideBrowser', openLinkInSideBrowser),
    );

    client.start().catch((err) => {
        vscode.window.showErrorMessage(
            `Nowline language server failed to start: ${err instanceof Error ? err.message : String(err)}`,
        );
    });
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
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
