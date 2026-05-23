// Default export of `@nowline/lsp-worker` is the main-thread client
// adapter. Consumers spawning the worker import the worker entry
// explicitly via `@nowline/lsp-worker/worker`.

export {
    type CreateNowlineLanguageClientOptions,
    createNowlineLanguageClient,
    type NowlineLanguageClient,
} from './client.js';
export {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageReader,
    type MessageWriter,
} from './message-bridge.js';
