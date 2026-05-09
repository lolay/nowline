import type { LangiumDocument, MaybePromise } from 'langium';
import type { DefinitionProvider } from 'langium/lsp';
import type { CancellationToken, DefinitionParams } from 'vscode-languageserver';
import { LocationLink } from 'vscode-languageserver';
import type { NowlineLspServices } from '../nowline-lsp-module.js';
import {
    buildEntityIndex,
    fileFromDocument,
    leafAt,
    nameRangeOf,
    propertyValueAt,
    propKey,
    REFERENCE_PROP_KEYS,
} from '../references/ast-utils.js';

/**
 * Custom definition provider. The Nowline grammar uses `PropertyAtom` (plain
 * text) for cross-references, so Langium's default cross-ref-aware provider
 * has nothing to follow. We walk the AST instead: when the cursor sits on a
 * value of a reference property (`after:`, `before:`, `owner:`, `on:`,
 * `depends:[]`), look up the target id in the file-level entity index and
 * return its declaration site.
 */
export class NowlineDefinitionProvider implements DefinitionProvider {
    constructor(_services: NowlineLspServices) {
        /* No collaborator dependencies; AST helpers are pure. */
    }

    getDefinition(
        document: LangiumDocument,
        params: DefinitionParams,
        _cancelToken?: CancellationToken,
    ): MaybePromise<LocationLink[] | undefined> {
        const file = fileFromDocument(document);
        if (!file) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = leafAt(document, offset);
        const hit = propertyValueAt(leaf);
        if (!hit) return undefined;
        if (!REFERENCE_PROP_KEYS.has(propKey(hit.prop))) return undefined;

        const index = buildEntityIndex(file);
        const target = index.get(hit.value);
        if (!target) return undefined;
        const targetCst = target.$cstNode;
        if (!targetCst) return undefined;

        const nameRange = nameRangeOf(target) ?? targetCst.range;
        return [
            LocationLink.create(
                document.uri.toString(),
                targetCst.range,
                nameRange,
                hit.valueNode.range,
            ),
        ];
    }
}
