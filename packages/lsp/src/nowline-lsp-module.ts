import {
    inject,
    type LangiumSharedCoreServices,
    type FileSystemProvider,
    type Module,
} from 'langium';
import {
    createDefaultModule,
    createDefaultSharedModule,
    type DefaultSharedModuleContext,
    type LangiumServices,
    type LangiumSharedServices,
    type PartialLangiumServices,
} from 'langium/lsp';
import {
    NowlineGeneratedSharedModule,
    NowlineGeneratedModule,
    NowlineModule,
    registerValidationChecks,
    type NowlineAddedServices,
} from '@nowline/core';
import { NowlineCompletionProvider } from './providers/completion.js';
import { NowlineDefinitionProvider } from './providers/definition.js';
import { NowlineDocumentSymbolProvider } from './providers/document-symbols.js';
import { NowlineHoverProvider } from './providers/hover.js';
import { NowlineReferencesProvider } from './providers/references.js';
import { NowlineRenameProvider } from './providers/rename.js';

/**
 * Combined Langium LSP services + Nowline-specific additions.
 *
 * `LangiumServices` already covers parser, validation, and the LSP service
 * slots (`lsp.DefinitionProvider`, `lsp.HoverProvider`, …). We layer the
 * Nowline validator on top via `NowlineAddedServices`.
 */
export type NowlineLspServices = LangiumServices & NowlineAddedServices;

/**
 * Language-specific module. Carries the Nowline LSP provider overrides on top
 * of whatever the cross-package `NowlineModule` (parser config + validator
 * factory, lifted from `@nowline/core`) already contributes.
 *
 * Keeping the parser/validation slots on the core-side `NowlineModule` means
 * the LSP and the headless `@nowline/cli` parse path stay byte-identical.
 */
const NowlineLspProviderModule: Module<
    NowlineLspServices,
    PartialLangiumServices
> = {
    lsp: {
        CompletionProvider: (services) => new NowlineCompletionProvider(services),
        DefinitionProvider: (services) => new NowlineDefinitionProvider(services),
        DocumentSymbolProvider: (services) => new NowlineDocumentSymbolProvider(services),
        HoverProvider: (services) => new NowlineHoverProvider(services),
        ReferencesProvider: (services) => new NowlineReferencesProvider(services),
        RenameProvider: (services) => new NowlineRenameProvider(services),
    },
};

export interface CreateNowlineLspServicesContext {
    /** Optional shared services container (e.g. when reusing across languages). */
    shared?: LangiumSharedServices;
    /** Either a `NodeFileSystem` (real disk) or `EmptyFileSystem` (tests). */
    fileSystemProvider: (services: LangiumSharedCoreServices) => FileSystemProvider;
    /** Optional LSP connection (omit for headless / in-memory usage). */
    connection?: DefaultSharedModuleContext['connection'];
}

/**
 * Build the full Langium LSP service container plus the Nowline language
 * services. Returns the shared container (used to start the language server)
 * and the language-specific services (used by tests + provider call sites).
 */
export function createNowlineLspServices(
    context: CreateNowlineLspServicesContext,
): {
    shared: LangiumSharedServices;
    Nowline: NowlineLspServices;
} {
    const shared =
        context.shared ??
        inject(
            createDefaultSharedModule({
                connection: context.connection,
                fileSystemProvider: context.fileSystemProvider,
            }),
            NowlineGeneratedSharedModule,
        );

    const Nowline = inject(
        createDefaultModule({ shared }),
        NowlineGeneratedModule,
        // `NowlineModule` is typed against `NowlineServices` (core only); cast
        // through `unknown` because the LSP injector is strictly broader and
        // Langium's `inject()` accepts that at runtime. See
        // `packages/core/src/language/nowline-module.ts` for the source.
        NowlineModule as unknown as Module<NowlineLspServices, PartialLangiumServices & NowlineAddedServices>,
        NowlineLspProviderModule,
    );

    shared.ServiceRegistry.register(Nowline);
    registerValidationChecks(Nowline);
    return { shared, Nowline };
}
