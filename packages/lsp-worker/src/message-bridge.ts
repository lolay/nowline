// Bridge between LSP JSON-RPC and `postMessage`-style transports
// (Worker, MessagePort, DedicatedWorkerGlobalScope, MessageChannel,
// etc.). Thin re-export of the browser primitives `vscode-jsonrpc`
// already ships so consumers don't have to depend on it directly and
// so we have a single seam to swap in a custom implementation later
// if tree-shaking ever becomes a concern.

export {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageReader,
    type MessageWriter,
} from 'vscode-jsonrpc/browser';
