import type { AstNode, LangiumDocument, MaybePromise } from 'langium';
import type {
    CancellationToken,
    DocumentSymbol,
    DocumentSymbolParams,
    Range,
} from 'vscode-languageserver';
import { SymbolKind } from 'vscode-languageserver';
import type { DocumentSymbolProvider } from 'langium/lsp';
import {
    isAnchorDeclaration,
    isFootnoteDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isLabelDeclaration,
    isMilestoneDeclaration,
    isParallelBlock,
    isPersonDeclaration,
    isSizeDeclaration,
    isStatusDeclaration,
    isSwimlaneDeclaration,
    isTeamDeclaration,
    type GroupBlock,
    type ItemDeclaration,
    type ParallelBlock,
    type RoadmapDeclaration,
    type SwimlaneContent,
    type SwimlaneDeclaration,
} from '@nowline/core';
import { entityKind, fileFromDocument, nameRangeOf } from '../references/ast-utils.js';
import type { NowlineLspServices } from '../nowline-lsp-module.js';

/**
 * Outline view: roadmap → swimlanes → items, with parallel/group nesting and
 * top-level anchors / milestones / footnotes / people / teams / labels /
 * sizes / statuses surfaced as siblings of the swimlanes. Mirrors the layout
 * engine's traversal so what authors see in the outline matches what gets
 * rendered.
 */
export class NowlineDocumentSymbolProvider implements DocumentSymbolProvider {
    constructor(_services: NowlineLspServices) {
        /* AST helpers are pure. */
    }

    getSymbols(
        document: LangiumDocument,
        _params: DocumentSymbolParams,
        _cancelToken?: CancellationToken,
    ): MaybePromise<DocumentSymbol[]> {
        const file = fileFromDocument(document);
        if (!file) return [];

        const symbols: DocumentSymbol[] = [];
        if (file.roadmapDecl) {
            const roadmapSymbol = this.roadmapSymbol(file.roadmapDecl);
            for (const entry of file.roadmapEntries) {
                const child = this.entrySymbol(entry);
                if (child) roadmapSymbol.children!.push(child);
            }
            symbols.push(roadmapSymbol);
        } else {
            for (const entry of file.roadmapEntries) {
                const child = this.entrySymbol(entry);
                if (child) symbols.push(child);
            }
        }
        return symbols;
    }

    private roadmapSymbol(roadmap: RoadmapDeclaration): DocumentSymbol {
        const range = roadmap.$cstNode!.range;
        const nameRange = nameRangeOf(roadmap) ?? range;
        return {
            name: roadmap.name ?? roadmap.title ?? 'roadmap',
            detail: roadmap.title && roadmap.name ? roadmap.title : 'roadmap',
            kind: SymbolKind.Package,
            range,
            selectionRange: nameRange,
            children: [],
        };
    }

    private entrySymbol(entry: AstNode): DocumentSymbol | undefined {
        if (isSwimlaneDeclaration(entry)) return this.swimlaneSymbol(entry);
        if (isAnchorDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Event);
        if (isMilestoneDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Event);
        if (isFootnoteDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.String);
        if (isPersonDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Constant);
        if (isTeamDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Module);
        if (isLabelDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.EnumMember);
        if (isSizeDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Number);
        if (isStatusDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Enum);
        return undefined;
    }

    private swimlaneSymbol(lane: SwimlaneDeclaration): DocumentSymbol {
        const sym = this.simpleSymbol(lane, SymbolKind.Namespace, true);
        for (const child of lane.content) {
            const sub = this.trackChildSymbol(child);
            if (sub) sym.children!.push(sub);
        }
        return sym;
    }

    private trackChildSymbol(child: SwimlaneContent): DocumentSymbol | undefined {
        if (isItemDeclaration(child)) return this.itemSymbol(child);
        if (isParallelBlock(child)) return this.parallelSymbol(child);
        if (isGroupBlock(child)) return this.groupSymbol(child);
        return undefined;
    }

    private itemSymbol(item: ItemDeclaration): DocumentSymbol {
        return this.simpleSymbol(item, SymbolKind.Field);
    }

    private parallelSymbol(node: ParallelBlock): DocumentSymbol {
        const sym = this.simpleSymbol(node, SymbolKind.Array, true);
        for (const child of node.content) {
            const sub = this.trackChildSymbol(child);
            if (sub) sym.children!.push(sub);
        }
        return sym;
    }

    private groupSymbol(node: GroupBlock): DocumentSymbol {
        const sym = this.simpleSymbol(node, SymbolKind.Object, true);
        for (const child of node.content) {
            const sub = this.trackChildSymbol(child);
            if (sub) sym.children!.push(sub);
        }
        return sym;
    }

    private simpleSymbol(
        entity: AstNode & { name?: string; title?: string },
        kind: SymbolKind,
        withChildrenSlot = false,
    ): DocumentSymbol {
        const range: Range = entity.$cstNode!.range;
        const name = entity.name ?? entity.title ?? entityKind(entity);
        const detail = entity.title && entity.name ? entity.title : entityKind(entity);
        const symbol: DocumentSymbol = {
            name,
            detail,
            kind,
            range,
            selectionRange: nameRangeOf(entity) ?? range,
        };
        if (withChildrenSlot) symbol.children = [];
        return symbol;
    }
}
