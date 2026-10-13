// One walk over a roadmap's declarations (specs/core-ast-utilities.md §3.1).
//
// The declarations form a fixed tree (nowline.langium): roadmap entries;
// swimlane, group and parallel content (items, groups, parallels, with
// `description` lines to skip); teams nested in teams. This module is the only
// place that says what a child is, so a new container keyword is added here
// once. It is a leaf module: it imports only the generated AST and Langium
// types.

import type { AstNode } from 'langium';
import {
    type ConfigEntry,
    type EntityProperty,
    type GroupBlock,
    type ItemDeclaration,
    isDescriptionDirective,
    isGroupBlock,
    isParallelBlock,
    isSwimlaneDeclaration,
    isTeamDeclaration,
    type NowlineFile,
    type ParallelBlock,
    type RoadmapDeclaration,
    type RoadmapEntry,
    type SwimlaneDeclaration,
    type TeamDeclaration,
} from '../generated/ast.js';

/** A node that sits on a swimlane track. */
export type TrackNode = ItemDeclaration | GroupBlock | ParallelBlock;

/** Any declaration the walk visits. */
export type DeclarationNode =
    | RoadmapDeclaration
    | RoadmapEntry
    | TrackNode
    | TeamDeclaration
    | ConfigEntry;

export interface WalkOptions {
    /** Visit `roadmapDecl` first. Default false. */
    roadmap?: boolean;
    /** Visit `configEntries` before the roadmap. Default false. */
    config?: boolean;
}

/** A container's track children in source order, `description` lines skipped. */
export function trackChildren(node: SwimlaneDeclaration | GroupBlock | ParallelBlock): TrackNode[] {
    const out: TrackNode[] = [];
    for (const child of node.content) {
        if (!isDescriptionDirective(child)) out.push(child);
    }
    return out;
}

/** Every track node under `lanes`, pre-order, in source order. */
export function* trackNodes(lanes: Iterable<SwimlaneDeclaration>): Generator<TrackNode> {
    for (const lane of lanes) yield* trackDescendants(lane);
}

// Track nodes under a swimlane, group or parallel, pre-order.
function* trackDescendants(
    container: SwimlaneDeclaration | GroupBlock | ParallelBlock,
): Generator<TrackNode> {
    for (const child of trackChildren(container)) {
        yield child;
        if (isGroupBlock(child) || isParallelBlock(child)) yield* trackDescendants(child);
    }
}

// Teams nested in `team`, pre-order. `PersonMemberRef` lines are references and
// `description` lines are prose, so neither is a declaration.
function* nestedTeams(team: TeamDeclaration): Generator<TeamDeclaration> {
    for (const member of team.content) {
        if (isTeamDeclaration(member)) {
            yield member;
            yield* nestedTeams(member);
        }
    }
}

// What sits under a node: a swimlane's, group's or parallel's track content, a
// team's nested teams, nothing for every other node.
function* nestedDeclarations(node: AstNode): Generator<TrackNode | TeamDeclaration> {
    if (isSwimlaneDeclaration(node) || isGroupBlock(node) || isParallelBlock(node)) {
        yield* trackDescendants(node);
    } else if (isTeamDeclaration(node)) {
        yield* nestedTeams(node);
    }
}

/**
 * Every declaration in the file, pre-order, in source order: optionally the
 * config entries and the roadmap line, then each roadmap entry followed by
 * its track content (swimlanes) or nested teams (teams).
 */
export function* declarations(
    file: NowlineFile,
    options: WalkOptions = {},
): Generator<DeclarationNode> {
    if (options.config) yield* file.configEntries;
    if (options.roadmap && file.roadmapDecl) yield file.roadmapDecl;
    for (const entry of file.roadmapEntries) {
        yield entry;
        yield* nestedDeclarations(entry);
    }
}

/** Every property on `node` and on the declarations nested under it, with its owner. */
export function visitProperties(
    node: AstNode,
    visit: (prop: EntityProperty, owner: AstNode) => void,
): void {
    visitOwnProperties(node, visit);
    for (const nested of nestedDeclarations(node)) visitOwnProperties(nested, visit);
}

function visitOwnProperties(
    node: AstNode,
    visit: (prop: EntityProperty, owner: AstNode) => void,
): void {
    const props = (node as { properties?: EntityProperty[] }).properties;
    if (!Array.isArray(props)) return;
    for (const prop of props) visit(prop, node);
}

/** Each explicit id a roadmap entry declares, in source order (rule 2, WV2). */
export function forEachDeclaredId(
    entry: RoadmapEntry,
    register: (name: string | undefined, node: AstNode) => void,
): void {
    register(entry.name, entry);
    for (const child of nestedDeclarations(entry)) register(child.name, child);
}

function nameOf(node: AstNode): string | undefined {
    return (node as { name?: string }).name;
}

/** Ids `after:`, `before:` and `on:` can name: the roadmap's id plus every declared id. */
export function referenceableIds(file: NowlineFile): Set<string> {
    const ids = new Set<string>();
    for (const node of declarations(file, { roadmap: true })) {
        const name = nameOf(node);
        if (name) ids.add(name);
    }
    return ids;
}

/** Id to its first declaration (roadmap line and roadmap entries). */
export function firstDeclarations(file: NowlineFile): Map<string, AstNode> {
    const ids = new Map<string, AstNode>();
    for (const node of declarations(file, { roadmap: true })) {
        const name = nameOf(node);
        if (name && !ids.has(name)) ids.set(name, node);
    }
    return ids;
}
