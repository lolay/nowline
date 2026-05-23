// Worker-side entry for the browser-packaged Nowline LSP. Boots the
// Langium-based language server, wires its transport to the worker's
// `postMessage` / `addEventListener('message', ...)` pair via
// `BrowserMessageReader` / `BrowserMessageWriter`, and locks the
// `textDocument/sync` capability to incremental (range delta) updates.
//
// Consumers spawn this worker from the main thread (e.g.
// `new Worker(workerUrl, { type: 'module' })`) and then wrap a
// `createNowlineLanguageClient({ worker })` around it from
// `./client.ts` to get a CodeMirror-friendly API.
//
// File system: `EmptyFileSystem` from `langium` — the worker can't
// read disk, and the Nowline include resolver routes through its own
// injected `readFile` callback anyway. Any LSP request that would
// trigger a default-module `FileSystemProvider.readFile` call against
// the empty provider returns `''`, which Langium treats as a missing
// document rather than crashing.

import { createNowlineLspServices } from '@nowline/lsp';
import { EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { createConnection } from 'vscode-languageserver/browser.js';
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageReader,
    type MessageWriter,
} from './message-bridge.js';

/**
 * Boot the Nowline language server inside a Dedicated Worker scope.
 * Call this from a Web Worker entry script:
 *
 * ```ts
 * import { startNowlineLspWorker } from '@nowline/lsp-worker/worker';
 * startNowlineLspWorker();
 * ```
 *
 * The worker bridge is hard-coded to `self` for the dedicated worker
 * case; multi-port / shared-worker setups can call
 * `startNowlineLspWorkerOn(reader, writer)` with their own
 * reader/writer pair instead.
 */
export function startNowlineLspWorker(): void {
    // `self` inside a worker is the DedicatedWorkerGlobalScope, which
    // `BrowserMessageReader`/`Writer` accept directly.
    const reader = new BrowserMessageReader(self as DedicatedWorkerGlobalScope);
    const writer = new BrowserMessageWriter(self as DedicatedWorkerGlobalScope);
    startNowlineLspWorkerOn(reader, writer);
}

/**
 * Lower-level entry: feed the LSP a pre-built reader/writer pair so
 * tests (and consumers that own their own transport) can drive the
 * server without spinning up a real `Worker`. Any `MessageReader` /
 * `MessageWriter` pair from `vscode-jsonrpc` works — including
 * `BrowserMessageReader`/`Writer` over a `MessageChannel` `MessagePort`.
 */
export function startNowlineLspWorkerOn(reader: MessageReader, writer: MessageWriter): void {
    const connection = createConnection(reader, writer);
    const { shared } = createNowlineLspServices({
        connection,
        fileSystemProvider: EmptyFileSystem.fileSystemProvider,
    });
    startLanguageServer(shared);
}
