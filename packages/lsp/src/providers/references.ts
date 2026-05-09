import type { CstNode, LangiumDocument, MaybePromise } from 'langium';
import { CstUtils } from 'langium';
import type { ReferencesProvider } from 'langium/lsp';
import type { CancellationToken, ReferenceParams } from 'vscode-languageserver';
import { Location } from 'vscode-languageserver';
import type { NowlineLspServices } from '../nowline-lsp-module.js';
import {
    declarationAt,
    fileFromDocument,
    findDeclarationRange,
    leafAt,
    propertyValueAt,
    propKey,
    REFERENCE_PROP_KEYS,
    visitAllProperties,
} from '../references/ast-utils.js';

/**
 * Custom find-references provider. Resolves the symbol the cursor is on to a
 * target id (either the declared name itself or the value the cursor sits on
 * inside a reference property), then walks the file collecting every
 * text-matching usage in known reference-property positions.
 *
 * Honours `params.context.includeDeclaration`: when true, the declaration
 * site is included in the result list.
 */
export class NowlineReferencesProvider implements ReferencesProvider {
    constructor(_services: NowlineLspServices) {
        /* AST helpers are pure. */
    }

    findReferences(
        document: LangiumDocument,
        params: ReferenceParams,
        _cancelToken?: CancellationToken,
    ): MaybePromise<Location[]> {
        const file = fileFromDocument(document);
        if (!file) return [];
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = leafAt(document, offset);
        if (!leaf) return [];

        const targetId = resolveTargetId(leaf);
        if (!targetId) return [];

        const locations: Location[] = [];
        const uri = document.uri.toString();

        if (params.context.includeDeclaration) {
            const declRange = findDeclarationRange(file, targetId);
            if (declRange) locations.push(Location.create(uri, declRange));
        }

        visitAllProperties(file, (prop) => {
            if (!REFERENCE_PROP_KEYS.has(propKey(prop))) return;
            for (const leafNode of valueLeavesOf(prop.$cstNode)) {
                if (leafNode.text === targetId) {
                    locations.push(Location.create(uri, leafNode.range));
                }
            }
        });

        return locations;
    }
}

function resolveTargetId(leaf: CstNode): string | undefined {
    const decl = declarationAt(leaf);
    if (decl?.name) return decl.name;
    const propHit = propertyValueAt(leaf);
    if (propHit && REFERENCE_PROP_KEYS.has(propKey(propHit.prop))) {
        return propHit.value;
    }
    return undefined;
}

function* valueLeavesOf(cst: CstNode | undefined): IterableIterator<CstNode> {
    if (!cst) return;
    for (const leaf of CstUtils.flattenCst(cst)) {
        if (leaf.hidden) continue;
        // Skip the property key (`after:` / `owner:` / …) so it doesn't
        // surface as a self-reference.
        if (leaf.text.endsWith(':')) continue;
        yield leaf;
    }
}
