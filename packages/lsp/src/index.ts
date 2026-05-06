export {
    createNowlineLspServices,
    type NowlineLspServices,
    type CreateNowlineLspServicesContext,
} from './nowline-lsp-module.js';
export { NowlineCompletionProvider } from './providers/completion.js';
export { NowlineDefinitionProvider } from './providers/definition.js';
export { NowlineDocumentSymbolProvider } from './providers/document-symbols.js';
export { NowlineHoverProvider } from './providers/hover.js';
export { NowlineReferencesProvider } from './providers/references.js';
export { NowlineRenameProvider } from './providers/rename.js';
export {
    BUILTIN_STATUSES,
    REFERENCE_PROP_KEYS,
    buildEntityIndex,
    collectNamedEntities,
    declarationAt,
    entityKind,
    fileFromDocument,
    leafAt,
    propKey,
    propertyValueAt,
    visitAllProperties,
    visitProperties,
    type NamedEntity,
} from './references/ast-utils.js';
