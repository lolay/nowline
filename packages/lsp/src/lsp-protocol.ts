/**
 * Stable LSP type/value surface for Nowline providers. Runtime values come from
 * the ESM build of vscode-languageserver-types; param types from protocol
 * (type-only, erased at compile time).
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
