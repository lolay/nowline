/**
 * Single import chokepoint for the LSP type/value surface the Nowline providers
 * use. It exists to dodge a CJS-interop bug: `vscode-languageserver` v10 ships a
 * CommonJS entry, so vite/vitest can't see its named runtime exports — e.g.
 * `import { CompletionItemKind } from 'vscode-languageserver'` throws "does not
 * provide an export named 'CompletionItemKind'" when the @nowline/lsp test suite
 * runs under vitest. Sourcing runtime values from the pure-ESM
 * `vscode-languageserver-types`, and param types (erased at compile time) from
 * `vscode-languageserver-protocol`, resolves cleanly across tsc, vitest, and the
 * extension's esbuild bundle. Providers must import LSP symbols from here, never
 * from `vscode-languageserver` directly.
 */
export type {
    CancellationToken,
    DefinitionParams,
    DocumentSymbolParams,
    HoverParams,
    PrepareRenameParams,
    ReferenceParams,
    RenameParams,
    TextDocumentPositionParams,
} from 'vscode-languageserver-protocol';

export type {
    CompletionItem,
    DocumentSymbol,
    Hover,
    Position,
    Range,
    TextEdit,
    WorkspaceEdit,
} from 'vscode-languageserver-types';

export {
    CompletionItemKind,
    Location,
    LocationLink,
    MarkupKind,
    SymbolKind,
} from 'vscode-languageserver-types';
