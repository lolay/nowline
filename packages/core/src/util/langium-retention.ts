import type { LangiumSharedCoreServices } from 'langium';

/** Per-URI entries a Langium workspace holds, for leak tests. */
export interface LangiumRetention {
    /** `DefaultIndexManager.symbolIndex` entries. */
    symbolIndex: number;
    /** `DefaultIndexManager.referenceIndex` entries. */
    referenceIndex: number;
    /** `DefaultDocumentBuilder.buildState` entries. */
    buildState: number;
    /** Documents in `LangiumDocuments`. */
    documents: number;
}

interface Sized {
    size: number;
}

/**
 * Count what the workspace retains per document URI. The index and build
 * state are protected in Langium, so this reads the default
 * implementations' fields; a missing field reads as -1 so a Langium
 * upgrade that renames one fails a leak test loudly instead of passing it.
 */
export function langiumRetention(shared: LangiumSharedCoreServices): LangiumRetention {
    const index = shared.workspace.IndexManager as unknown as Record<string, Sized | undefined>;
    const builder = shared.workspace.DocumentBuilder as unknown as Record<
        string,
        Sized | undefined
    >;
    return {
        symbolIndex: index.symbolIndex?.size ?? -1,
        referenceIndex: index.referenceIndex?.size ?? -1,
        buildState: builder.buildState?.size ?? -1,
        documents: shared.workspace.LangiumDocuments.all.count(),
    };
}
