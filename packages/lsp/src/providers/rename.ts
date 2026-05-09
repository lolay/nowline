import type { LangiumDocument, MaybePromise } from 'langium';
import { CstUtils } from 'langium';
import type { RenameProvider } from 'langium/lsp';
import type {
    CancellationToken,
    Position,
    PrepareRenameParams,
    Range,
    RenameParams,
    TextDocumentPositionParams,
    TextEdit,
    WorkspaceEdit,
} from 'vscode-languageserver';
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
 * Rename an entity id (item, swimlane, anchor, etc.) and propagate the change
 * to every reference position in the file. Refuses to rename when the cursor
 * isn't on a renameable token, when the new name collides with an existing
 * declaration, or when the new name isn't a valid Nowline identifier.
 */
export class NowlineRenameProvider implements RenameProvider {
    constructor(_services: NowlineLspServices) {
        /* AST helpers are pure. */
    }

    prepareRename(
        document: LangiumDocument,
        params: TextDocumentPositionParams | PrepareRenameParams,
        _cancelToken?: CancellationToken,
    ): MaybePromise<Range | undefined> {
        return renameRangeAt(document, params.position)?.range;
    }

    async rename(
        document: LangiumDocument,
        params: RenameParams,
        _cancelToken?: CancellationToken,
    ): Promise<WorkspaceEdit | undefined> {
        const file = fileFromDocument(document);
        if (!file) return undefined;
        const target = renameRangeAt(document, params.position);
        if (!target) return undefined;

        const newName = params.newName;
        if (!isValidId(newName)) {
            throw new Error(
                `"${newName}" is not a valid Nowline identifier. Use letters, digits, underscores, and dashes (must start with a letter or underscore).`,
            );
        }

        const edits: TextEdit[] = [];
        const uri = document.uri.toString();

        const declRange = findDeclarationRange(file, target.id);
        if (declRange) edits.push({ range: declRange, newText: newName });

        visitAllProperties(file, (prop) => {
            if (!REFERENCE_PROP_KEYS.has(propKey(prop))) return;
            const cst = prop.$cstNode;
            if (!cst) return;
            for (const leaf of CstUtils.flattenCst(cst)) {
                if (leaf.hidden) continue;
                if (leaf.text.endsWith(':')) continue;
                if (leaf.text === target.id) {
                    edits.push({ range: leaf.range, newText: newName });
                }
            }
        });

        if (edits.length === 0) return undefined;
        return { changes: { [uri]: edits } };
    }
}

interface RenameTarget {
    id: string;
    range: Range;
}

function renameRangeAt(document: LangiumDocument, position: Position): RenameTarget | undefined {
    const offset = document.textDocument.offsetAt(position);
    const leaf = leafAt(document, offset);
    if (!leaf) return undefined;
    const decl = declarationAt(leaf);
    if (decl?.name === leaf.text) {
        return { id: decl.name, range: leaf.range };
    }
    const hit = propertyValueAt(leaf);
    if (hit && REFERENCE_PROP_KEYS.has(propKey(hit.prop))) {
        return { id: hit.value, range: hit.valueNode.range };
    }
    return undefined;
}

const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
function isValidId(value: string): boolean {
    return ID_RE.test(value);
}
