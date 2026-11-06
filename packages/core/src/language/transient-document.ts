import type { BuildOptions, LangiumDocument, LangiumSharedCoreServices, URI } from 'langium';
import type { NowlineFile } from '../generated/ast.js';

/**
 * Parse and build `source` as a one-off document on `uri`, then drop it
 * from the Langium workspace before handing it back.
 *
 * `DocumentBuilder.build` leaves every document it builds in the shared
 * `IndexManager` and in the builder's build state, keyed by URI. A caller
 * that mints a fresh URI per parse (a preview re-rendering on every
 * keystroke, a long-running MCP server) would otherwise keep one AST, CST
 * and source text per call for the life of its services.
 *
 * The returned document keeps everything the build gave it: AST, CST,
 * text, parse errors and validation diagnostics. Only the workspace's
 * references to it go. Nothing downstream needs them: linking has already
 * run, and include files are built on their own file URIs. Don't pass the
 * document to `DocumentBuilder` again; build a new one instead.
 *
 * `uri` must be unique among documents in flight on the same services, or
 * concurrent builds would share build state.
 */
export async function buildTransientDocument(
    shared: LangiumSharedCoreServices,
    source: string,
    uri: URI,
    options: BuildOptions = { validation: true },
): Promise<LangiumDocument<NowlineFile>> {
    const { DocumentBuilder, LangiumDocumentFactory, LangiumDocuments } = shared.workspace;
    const document = LangiumDocumentFactory.fromString<NowlineFile>(source, uri);
    try {
        await DocumentBuilder.build([document], options);
    } finally {
        // `update` cleans up only documents it can find in LangiumDocuments,
        // which `build` never adds them to. Adding and deleting happen in the
        // same synchronous run, so no other build observes the entry.
        if (!LangiumDocuments.hasDocument(uri)) LangiumDocuments.addDocument(document);
        await DocumentBuilder.update([], [uri]);
    }
    return document;
}
