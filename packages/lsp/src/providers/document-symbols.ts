import {
    type GroupBlock,
    type ItemDeclaration,
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
    isWaveDeclaration,
    type ParallelBlock,
    type RoadmapDeclaration,
    type SwimlaneContent,
    type SwimlaneDeclaration,
    singleLine,
} from '@nowline/core';
import type { AstNode, LangiumDocument, MaybePromise } from 'langium';
import type { DocumentSymbolProvider } from 'langium/lsp';
import type {
    CancellationToken,
    DocumentSymbol,
    DocumentSymbolParams,
    Range,
} from '../lsp-protocol.js';
import { SymbolKind } from '../lsp-protocol.js';
import type { NowlineLspServices } from '../nowline-lsp-module.js';
import { entityKind, fileFromDocument, nameRangeOf } from '../references/ast-utils.js';

/**
 * An outline entry is one line of text, but a quoted title can carry
 * explicit line breaks (`"Technology\nSelection"`), so each break is shown
 * as a single space. `undefined` stays `undefined` so callers can fall back
 * (as they must for a title that was only line breaks, which collapses to '').
 */
function singleLineTitle(title: string | undefined): string | undefined {
    return title === undefined ? undefined : singleLine(title);
}

/**
 * Outline view: roadmap → swimlanes → items, with parallel/group nesting and
 * top-level anchors / milestones / footnotes / people / teams / labels /
 * sizes / statuses / waves surfaced as siblings of the swimlanes. Mirrors the layout
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
            name: roadmap.name ?? (singleLineTitle(roadmap.title) || 'roadmap'),
            detail: roadmap.title && roadmap.name ? singleLine(roadmap.title) : 'roadmap',
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
        if (isWaveDeclaration(entry)) return this.simpleSymbol(entry, SymbolKind.Struct);
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
        const name = entity.name ?? (singleLineTitle(entity.title) || entityKind(entity));
        const detail = entity.title && entity.name ? singleLine(entity.title) : entityKind(entity);
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
