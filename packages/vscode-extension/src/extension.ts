import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

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

    context.subscriptions.push({
        dispose: () => {
            void client?.stop();
        },
    });

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
