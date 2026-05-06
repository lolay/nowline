import type { AstNode, CstNode, LangiumDocument } from 'langium';
import { CstUtils } from 'langium';
import type { Range } from 'vscode-languageserver';
import type {
    EntityProperty,
    NowlineFile,
    SwimlaneContent,
    GroupContent,
    ParallelContent,
    SwimlaneDeclaration,
    GroupBlock,
    ParallelBlock,
    ItemDeclaration,
    AnchorDeclaration,
    MilestoneDeclaration,
    FootnoteDeclaration,
    PersonDeclaration,
    TeamDeclaration,
    LabelDeclaration,
    SizeDeclaration,
    StatusDeclaration,
} from '@nowline/core';
import {
    isAnchorDeclaration,
    isFootnoteDeclaration,
    isGroupBlock,
    isItemDeclaration,
    isLabelDeclaration,
    isMilestoneDeclaration,
    isNowlineFile,
    isParallelBlock,
    isPersonDeclaration,
    isPersonMemberRef,
    isSizeDeclaration,
    isStatusDeclaration,
    isSwimlaneDeclaration,
    isTeamDeclaration,
} from '@nowline/core';

/**
 * Property keys whose value(s) name another entity in the same file. Used by
 * definition / references / rename / completion to decide whether the cursor
 * sits on an id reference.
 *
 * Mirrors the validator's `checkReferenceResolution` (`after` / `before` /
 * `on` / `owner`) plus `depends:` (synonym used by some examples) so the LSP
 * stays forgiving even when the validator is strict.
 */
export const REFERENCE_PROP_KEYS = new Set([
    'after',
    'before',
    'on',
    'owner',
    'depends',
]);

/** Status value-completion source: built-in statuses ship with the renderer. */
export const BUILTIN_STATUSES: readonly string[] = [
    'planned',
    'in-progress',
    'done',
    'at-risk',
    'blocked',
];

/** Strip the trailing `:` an `EntityProperty.key` carries from the grammar. */
export function propKey(prop: { key: string }): string {
    return prop.key.endsWith(':') ? prop.key.slice(0, -1) : prop.key;
}

/**
 * Named declaration shapes we expose for navigation. All have `name?: string`,
 * `title?: string`, and `properties?: EntityProperty[]`.
 */
export type NamedEntity =
    | RoadmapEntryNamed
    | ItemDeclaration
    | ParallelBlock
    | GroupBlock;

type RoadmapEntryNamed =
    | SwimlaneDeclaration
    | AnchorDeclaration
    | MilestoneDeclaration
    | FootnoteDeclaration
    | PersonDeclaration
    | TeamDeclaration
    | LabelDeclaration
    | SizeDeclaration
    | StatusDeclaration;

/**
 * Walk the `NowlineFile` and collect every entity that owns an `id`. The
 * traversal mirrors the validator's `collectReferenceableIds` so the LSP and
 * the validator agree on what's reachable.
 */
export function collectNamedEntities(file: NowlineFile): NamedEntity[] {
    const out: NamedEntity[] = [];

    const visitTeam = (team: TeamDeclaration) => {
        if (team.name) out.push(team);
        for (const c of team.content) {
            if (isTeamDeclaration(c)) visitTeam(c);
            // `PersonMemberRef` and `DescriptionDirective` are references / prose,
            // not declarations — skip.
            else if (isPersonMemberRef(c)) {
                /* skip */
            }
        }
    };

    const visitTrackChild = (
        child: SwimlaneContent | GroupContent | ParallelContent,
    ) => {
        if (isItemDeclaration(child) && child.name) out.push(child);
        else if (isParallelBlock(child)) {
            if (child.name) out.push(child);
            for (const sub of child.content) visitTrackChild(sub);
        } else if (isGroupBlock(child)) {
            if (child.name) out.push(child);
            for (const sub of child.content) visitTrackChild(sub);
        }
    };

    for (const entry of file.roadmapEntries) {
        if (isSwimlaneDeclaration(entry)) {
            if (entry.name) out.push(entry);
            for (const c of entry.content) visitTrackChild(c);
        } else if (isTeamDeclaration(entry)) visitTeam(entry);
        else if (
            isPersonDeclaration(entry) ||
            isAnchorDeclaration(entry) ||
            isMilestoneDeclaration(entry) ||
            isFootnoteDeclaration(entry) ||
            isLabelDeclaration(entry) ||
            isSizeDeclaration(entry) ||
            isStatusDeclaration(entry)
        ) {
            if (entry.name) out.push(entry);
        }
    }

    return out;
}

/**
 * Build a map from id → declaring entity. When a name appears multiple times
 * the validator already flags it; we keep the first occurrence so navigation
 * is deterministic.
 */
export function buildEntityIndex(file: NowlineFile): Map<string, NamedEntity> {
    const index = new Map<string, NamedEntity>();
    for (const ent of collectNamedEntities(file)) {
        const id = ent.name;
        if (id && !index.has(id)) index.set(id, ent);
    }
    return index;
}

/** Visit every `EntityProperty` reachable from a roadmap entry, depth-first. */
export function visitProperties(
    node: AstNode,
    visit: (prop: EntityProperty, owner: AstNode) => void,
): void {
    const walk = (n: AstNode): void => {
        const props = (n as { properties?: EntityProperty[] }).properties;
        if (Array.isArray(props)) {
            for (const p of props) visit(p, n);
        }
        if (isSwimlaneDeclaration(n)) {
            for (const c of n.content) walk(c);
        } else if (isParallelBlock(n) || isGroupBlock(n)) {
            for (const c of n.content) walk(c);
        } else if (isTeamDeclaration(n)) {
            for (const c of n.content) {
                if (isTeamDeclaration(c) || isPersonDeclaration(c)) walk(c);
            }
        }
    };
    walk(node);
}

/**
 * Iterate every `EntityProperty` in the file, including those on the roadmap
 * declaration itself, plus the properties on top-level config entries (style /
 * default / glyph blocks). Useful for find-references and completion when the
 * cursor isn't necessarily inside a roadmap entry.
 */
export function visitAllProperties(
    file: NowlineFile,
    visit: (prop: EntityProperty, owner: AstNode) => void,
): void {
    if (file.roadmapDecl) {
        for (const p of file.roadmapDecl.properties) visit(p, file.roadmapDecl);
    }
    for (const entry of file.roadmapEntries) visitProperties(entry, visit);
}

/**
 * Pull the `NowlineFile` AST root from a Langium document.
 */
export function fileFromDocument(document: LangiumDocument): NowlineFile | undefined {
    const root = document.parseResult?.value as AstNode | undefined;
    return root && isNowlineFile(root) ? (root as NowlineFile) : undefined;
}

/**
 * Find the leaf CST node directly under the given offset. Wraps
 * `CstUtils.findLeafNodeAtOffset` to make the call sites read clearly.
 */
export function leafAt(document: LangiumDocument, offset: number): CstNode | undefined {
    const root = document.parseResult?.value?.$cstNode;
    if (!root) return undefined;
    return CstUtils.findLeafNodeAtOffset(root, offset);
}

/**
 * When `leaf` sits inside the value(s) of an `EntityProperty`, return the
 * containing property along with the matched value text. Returns `undefined`
 * when the leaf is the property key, surrounding punctuation, or otherwise
 * outside a property value.
 *
 * Used by definition / hover / references to detect "cursor on a reference".
 */
export function propertyValueAt(
    leaf: CstNode | undefined,
): { prop: EntityProperty; value: string; valueNode: CstNode } | undefined {
    if (!leaf) return undefined;
    let node: CstNode | undefined = leaf;
    while (node && node.astNode.$type !== 'EntityProperty') node = node.container;
    if (!node) return undefined;
    const prop = node.astNode as EntityProperty;
    const text = leaf.text;
    if (prop.value === text) {
        return { prop, value: prop.value, valueNode: leaf };
    }
    if (prop.values?.includes(text)) {
        return { prop, value: text, valueNode: leaf };
    }
    return undefined;
}

/**
 * When `leaf` is the `name=ID` token of a named entity declaration, return the
 * declaring entity. Returns `undefined` for any other position.
 */
export function declarationAt(leaf: CstNode | undefined): NamedEntity | undefined {
    if (!leaf) return undefined;
    const owner = leaf.astNode as AstNode & { name?: string };
    if (!owner || typeof owner.name !== 'string') return undefined;
    if (owner.name !== leaf.text) return undefined;
    if (
        isSwimlaneDeclaration(owner) ||
        isItemDeclaration(owner) ||
        isParallelBlock(owner) ||
        isGroupBlock(owner) ||
        isAnchorDeclaration(owner) ||
        isMilestoneDeclaration(owner) ||
        isFootnoteDeclaration(owner) ||
        isPersonDeclaration(owner) ||
        isTeamDeclaration(owner) ||
        isLabelDeclaration(owner) ||
        isSizeDeclaration(owner) ||
        isStatusDeclaration(owner)
    ) {
        return owner as NamedEntity;
    }
    return undefined;
}

/**
 * Render a one-line "type id" label used by hover and document-symbols.
 */
export function entityKind(entity: AstNode): string {
    return entity.$type
        .replace(/Declaration$/, '')
        .replace(/Block$/, '')
        .toLowerCase();
}

/**
 * Find the CST node that holds the given entity's `name=ID` token. Walks the
 * entity's CST subtree and returns the first leaf whose text equals the
 * entity's resolved name. Returns `undefined` when the entity has no `name`
 * (anonymous declaration), no CST node, or no matching leaf.
 */
export function nameRangeOf(entity: AstNode): Range | undefined {
    const name = (entity as { name?: string }).name;
    if (!name || !entity.$cstNode) return undefined;
    for (const leaf of CstUtils.flattenCst(entity.$cstNode)) {
        if (leaf.text === name) return leaf.range;
    }
    return undefined;
}

/**
 * Iterate every leaf CST node inside the given root. Convenience wrapper over
 * `CstUtils.flattenCst` so call sites don't need to import the namespace.
 */
export function* flattenLeaves(root: CstNode): IterableIterator<CstNode> {
    for (const leaf of CstUtils.flattenCst(root)) yield leaf;
}
