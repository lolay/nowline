// Main-thread client for the Nowline LSP worker. Wraps `vscode-jsonrpc`'s
// `MessageConnection` into a tiny imperative API that browser editors
// (CodeMirror, Monaco, raw textareas, etc.) can drive without depending
// on `vscode-languageclient` (which assumes a VS Code host).
//
// The adapter exposes the LSP surface specified in `specs/lsp.md`
// (publishDiagnostics, completion, hover, definition, references) plus
// the lifecycle bits a browser IDE needs (initialize, didOpen,
// didChange, didClose, shutdown / dispose).

import {
    type CompletionItem,
    CompletionRequest,
    type Definition,
    DefinitionRequest,
    DidChangeTextDocumentNotification,
    DidCloseTextDocumentNotification,
    DidOpenTextDocumentNotification,
    type Hover,
    HoverRequest,
    InitializedNotification,
    type InitializeParams,
    InitializeRequest,
    type InitializeResult,
    type Location,
    type Position,
    type ProtocolConnection,
    PublishDiagnosticsNotification,
    type PublishDiagnosticsParams,
    type ReferenceParams,
    ReferencesRequest,
    type ServerCapabilities,
    type TextDocumentContentChangeEvent,
    TextDocumentSyncKind,
} from 'vscode-languageserver-protocol';
import { createProtocolConnection } from 'vscode-languageserver-protocol/browser.js';
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageReader,
    type MessageWriter,
} from './message-bridge.js';

export interface CreateNowlineLanguageClientOptions {
    /**
     * Worker handle (or anything matching the
     * `BrowserMessageReader/Writer` shape — `MessagePort`,
     * `DedicatedWorkerGlobalScope`). The client wires both the
     * incoming reader and the outgoing writer against this single
     * port, matching the dedicated-worker / message-channel pattern.
     */
    worker: Worker | MessagePort;
    /**
     * Caller can pre-build a transport and skip the default
     * `BrowserMessageReader/Writer` (useful for tests + alternate
     * transports like SharedWorker). When supplied, `worker` is
     * ignored.
     */
    transport?: { reader: MessageReader; writer: MessageWriter };
    /**
     * Optional root URI for the workspace. Browser IDEs usually leave
     * this as the synthetic default; only set if a virtual workspace
     * is genuinely backed by a hierarchy worth advertising.
     */
    rootUri?: string;
}

export interface NowlineLanguageClient {
    /** Open a document with the server. Must be called before any other request. */
    didOpen(params: { uri: string; languageId?: string; version?: number; text: string }): void;
    /**
     * Push an incremental change. Per spec, callers must send a
     * `range` + `text` pair — whole-document `text` updates are
     * rejected by the underlying server because it advertises
     * `TextDocumentSyncKind.Incremental`.
     */
    didChange(params: {
        uri: string;
        version: number;
        changes: TextDocumentContentChangeEvent[];
    }): void;
    didClose(uri: string): void;
    onDiagnostics(listener: (params: PublishDiagnosticsParams) => void): { dispose(): void };
    completion(uri: string, position: Position): Promise<CompletionItem[]>;
    hover(uri: string, position: Position): Promise<Hover | null>;
    definition(uri: string, position: Position): Promise<Definition | null>;
    references(uri: string, position: Position): Promise<Location[]>;
    /** Discard listeners and close the underlying connection. */
    dispose(): Promise<void>;
}

/**
 * Build a Nowline LSP client bound to the supplied Worker (or
 * MessagePort). The client autonegotiates the LSP `initialize`
 * handshake on construction and resolves the returned object once the
 * server has reported its capabilities.
 *
 * The returned `Promise` rejects if the server reports a
 * non-incremental `textDocument/sync` capability — the wire-protocol
 * guard from `specs/lsp.md` § Browser worker packaging.
 */
export async function createNowlineLanguageClient(
    options: CreateNowlineLanguageClientOptions,
): Promise<NowlineLanguageClient> {
    const transport = options.transport ?? {
        reader: new BrowserMessageReader(options.worker),
        writer: new BrowserMessageWriter(options.worker),
    };
    const connection: ProtocolConnection = createProtocolConnection(
        transport.reader,
        transport.writer,
    );
    connection.listen();

    const initParams: InitializeParams = {
        processId: null,
        rootUri: options.rootUri ?? null,
        capabilities: {
            textDocument: {
                synchronization: { dynamicRegistration: false, willSave: false, didSave: false },
                publishDiagnostics: { relatedInformation: false },
                completion: { completionItem: { snippetSupport: false } },
                hover: { contentFormat: ['markdown', 'plaintext'] },
                definition: {},
                references: {},
            },
        },
        workspaceFolders: null,
    };
    const initResult: InitializeResult = await connection.sendRequest(
        InitializeRequest.type,
        initParams,
    );

    const capabilities: ServerCapabilities = initResult.capabilities;
    const sync = capabilities.textDocumentSync;
    const kind = typeof sync === 'object' && sync !== null ? sync.change : sync;
    if (kind !== TextDocumentSyncKind.Incremental) {
        await connection.dispose();
        throw new Error(
            `@nowline/lsp-worker: server advertised textDocument/sync = ${kind ?? 'undefined'}, ` +
                `expected Incremental (${TextDocumentSyncKind.Incremental}). ` +
                'Whole-document didChange semantics are not supported by this client.',
        );
    }

    // sendNotification returns a Promise that resolves when the writer
    // flushes; we deliberately fire-and-forget here. The init handshake
    // is already awaited above, so any subsequent notify is timing-only.
    void connection.sendNotification(InitializedNotification.type, {});

    const diagListeners = new Set<(params: PublishDiagnosticsParams) => void>();
    connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
        for (const l of diagListeners) {
            try {
                l(params);
            } catch (err) {
                console.error('[nowline-lsp-worker] diagnostics listener threw:', err);
            }
        }
    });

    return {
        didOpen({ uri, languageId = 'nowline', version = 1, text }) {
            // Fire-and-forget: notifications have no response, and the
            // wire ordering between sendNotification calls is preserved
            // by the underlying MessageWriter, so awaiting the flush
            // would only stall callers without adding correctness.
            void connection.sendNotification(DidOpenTextDocumentNotification.type, {
                textDocument: { uri, languageId, version, text },
            });
        },
        didChange({ uri, version, changes }) {
            for (const change of changes) {
                if (!('range' in change)) {
                    throw new Error(
                        '@nowline/lsp-worker: didChange requires a range + text delta — ' +
                            'whole-document updates are rejected per TextDocumentSyncKind.Incremental.',
                    );
                }
            }
            void connection.sendNotification(DidChangeTextDocumentNotification.type, {
                textDocument: { uri, version },
                contentChanges: changes,
            });
        },
        didClose(uri) {
            void connection.sendNotification(DidCloseTextDocumentNotification.type, {
                textDocument: { uri },
            });
        },
        onDiagnostics(listener) {
            diagListeners.add(listener);
            return {
                dispose() {
                    diagListeners.delete(listener);
                },
            };
        },
        async completion(uri, position) {
            const result = await connection.sendRequest(CompletionRequest.type, {
                textDocument: { uri },
                position,
            });
            if (!result) return [];
            return Array.isArray(result) ? result : result.items;
        },
        async hover(uri, position) {
            return (await connection.sendRequest(HoverRequest.type, {
                textDocument: { uri },
                position,
            })) as Hover | null;
        },
        async definition(uri, position) {
            return (await connection.sendRequest(DefinitionRequest.type, {
                textDocument: { uri },
                position,
            })) as Definition | null;
        },
        async references(uri, position) {
            const params: ReferenceParams = {
                textDocument: { uri },
                position,
                context: { includeDeclaration: true },
            };
            return ((await connection.sendRequest(ReferencesRequest.type, params)) ??
                []) as Location[];
        },
        async dispose() {
            diagListeners.clear();
            try {
                await connection.sendRequest('shutdown', undefined);
                await connection.sendNotification('exit', undefined);
            } catch {
                // Best-effort; the worker may have already terminated.
            }
            connection.dispose();
        },
    };
}
