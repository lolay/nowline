import { URI } from 'langium';
import type {
    AnchorDeclaration,
    CalendarBlock,
    ConfigEntry,
    DefaultDeclaration,
    FootnoteDeclaration,
    IncludeDeclaration,
    LabelDeclaration,
    MilestoneDeclaration,
    NowlineFile,
    PersonDeclaration,
    RoadmapDeclaration,
    RoadmapEntry,
    ScaleBlock,
    SizeDeclaration,
    StatusDeclaration,
    StyleDeclaration,
    SwimlaneDeclaration,
    SymbolDeclaration,
    TeamDeclaration,
} from '../generated/ast.js';
import {
    isAnchorDeclaration,
    isCalendarBlock,
    isDefaultDeclaration,
    isFootnoteDeclaration,
    isLabelDeclaration,
    isMilestoneDeclaration,
    isPersonDeclaration,
    isScaleBlock,
    isSizeDeclaration,
    isStatusDeclaration,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
} from '../generated/ast.js';
import { basename, dirname, resolve as resolvePath } from '../util/posix-path.js';
import type { NowlineServices } from './nowline-module.js';

export type IncludeMode = 'merge' | 'ignore' | 'isolate';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readStartProp(decl: RoadmapDeclaration | undefined): string | undefined {
    const prop = decl?.properties.find((p) => p.key === 'start');
    if (!prop?.value) return undefined;
    if (!DATE_RE.test(prop.value)) return undefined;
    if (Number.isNaN(new Date(prop.value).getTime())) return undefined;
    return prop.value;
}

function formatStartMismatch(
    childRelPath: string,
    parentStart: string | undefined,
    childStart: string | undefined,
): string {
    if (parentStart && childStart) {
        return `Included "${childRelPath}" declares start:${childStart}, which doesn't match this file's start:${parentStart}. Both files must declare the same start date, or neither should.`;
    }
    if (parentStart) {
        return `Included "${childRelPath}" has no start:, but this file declares start:${parentStart}. Both files must declare the same start date, or neither should.`;
    }
    return `Included "${childRelPath}" declares start:${childStart}, but this file has no start:. Both files must declare the same start date, or neither should.`;
}

export interface ResolvedConfig {
    scale?: ScaleBlock;
    calendar?: CalendarBlock;
    styles: Map<string, StyleDeclaration>;
    defaults: Map<string, DefaultDeclaration>;
    // Custom symbol declarations from the `symbol` config keyword. Renderer-side
    // resolution of `icon:` / `capacity-icon:` looks here when the value isn't
    // a built-in identifier or an inline Unicode literal. See specs/dsl.md §
    // Symbol Declaration.
    symbols: Map<string, SymbolDeclaration>;
}

export interface ResolvedContent {
    roadmap?: RoadmapDeclaration;
    persons: Map<string, PersonDeclaration>;
    teams: Map<string, TeamDeclaration>;
    anchors: Map<string, AnchorDeclaration>;
    labels: Map<string, LabelDeclaration>;
    sizes: Map<string, SizeDeclaration>;
    statuses: Map<string, StatusDeclaration>;
    swimlanes: Map<string, SwimlaneDeclaration>;
    milestones: Map<string, MilestoneDeclaration>;
    footnotes: Map<string, FootnoteDeclaration>;
    isolatedRegions: IsolatedRegion[];
}

export interface IsolatedRegion {
    // The path string as written in the parent's `include "..."` directive
    // (e.g. "./partner.nowline"). Used as the user-facing label/badge in the
    // rendered region. The resolver's internal caching/dedup uses the
    // resolved absolute path, but that's never exposed to layout/render.
    sourcePath: string;
    config: ResolvedConfig;
    content: ResolvedContent;
}

export interface ResolveDiagnostic {
    severity: 'error' | 'warning';
    message: string;
    sourcePath: string;
    line?: number;
}

export interface ResolveResult {
    config: ResolvedConfig;
    content: ResolvedContent;
    diagnostics: ResolveDiagnostic[];
    processedFiles: Set<string>;
}

interface ResolveContext {
    services: NowlineServices;
    diagnostics: ResolveDiagnostic[];
    resolving: string[];
    processed: Map<string, { config: ResolvedConfig; content: ResolvedContent }>;
    readFile: (absPath: string) => Promise<string>;
}

function emptyConfig(): ResolvedConfig {
    return {
        styles: new Map(),
        defaults: new Map(),
        symbols: new Map(),
    };
}

function emptyContent(): ResolvedContent {
    return {
        persons: new Map(),
        teams: new Map(),
        anchors: new Map(),
        labels: new Map(),
        sizes: new Map(),
        statuses: new Map(),
        swimlanes: new Map(),
        milestones: new Map(),
        footnotes: new Map(),
        isolatedRegions: [],
    };
}

export interface ResolveIncludesOptions {
    services: NowlineServices;
    readFile?: (absPath: string) => Promise<string>;
}

export async function resolveIncludes(
    file: NowlineFile,
    filePath: string,
    options: ResolveIncludesOptions,
): Promise<ResolveResult> {
    // Default `readFile` lives behind a dynamic import so a browser
    // bundle that always injects its own callback never pulls `node:fs`
    // into the static dependency graph.
    const readFile =
        options.readFile ??
        (async (p: string) => {
            const { nodeReadFile } = await import('../util/node-read-file.js');
            return nodeReadFile(p);
        });
    const ctx: ResolveContext = {
        services: options.services,
        diagnostics: [],
        resolving: [],
        processed: new Map(),
        readFile,
    };
    const absPath = resolvePath('', filePath);
    const { config, content } = await resolveFile(file, absPath, ctx);
    return {
        config,
        content,
        diagnostics: ctx.diagnostics,
        processedFiles: new Set(ctx.processed.keys()),
    };
}

async function resolveFile(
    file: NowlineFile,
    absPath: string,
    ctx: ResolveContext,
): Promise<{ config: ResolvedConfig; content: ResolvedContent }> {
    if (ctx.processed.has(absPath)) {
        return ctx.processed.get(absPath)!;
    }
    if (ctx.resolving.includes(absPath)) {
        ctx.diagnostics.push({
            severity: 'error',
            message: `Circular include detected: ${[...ctx.resolving, absPath].join(' → ')}`,
            sourcePath: absPath,
        });
        const empty = { config: emptyConfig(), content: emptyContent() };
        ctx.processed.set(absPath, empty);
        return empty;
    }

    ctx.resolving.push(absPath);

    const config = emptyConfig();
    const content = emptyContent();

    // Seed with the parent's own declarations first so that collisions from included
    // files shadow to the parent (parent wins) and produce a warning pointing at the child.
    mergeLocalConfig(config, file);
    mergeLocalContent(content, file);

    const seenIncludes = new Set<string>();
    for (const inc of file.includes) {
        const childRelPath = inc.path;
        const childAbsPath = resolvePath(dirname(absPath), childRelPath);

        if (seenIncludes.has(childAbsPath)) {
            ctx.diagnostics.push({
                severity: 'error',
                message: `Duplicate include "${childRelPath}" in ${basename(absPath)}.`,
                sourcePath: absPath,
                line: inc.$cstNode?.range.start.line,
            });
            continue;
        }
        seenIncludes.add(childAbsPath);

        const configMode = getIncludeMode(inc, 'config') ?? 'merge';
        const roadmapMode = getIncludeMode(inc, 'roadmap') ?? 'merge';

        let childFile: NowlineFile | undefined;
        try {
            const text = await ctx.readFile(childAbsPath);
            childFile = await parseString(ctx.services, text, childAbsPath);
        } catch (err) {
            ctx.diagnostics.push({
                severity: 'error',
                message: `Could not read include "${childRelPath}": ${(err as Error).message}`,
                sourcePath: absPath,
                line: inc.$cstNode?.range.start.line,
            });
            continue;
        }

        const { config: childConfig, content: childContent } = await resolveFile(
            childFile,
            childAbsPath,
            ctx,
        );

        applyConfigMode(config, childConfig, configMode, childAbsPath, ctx.diagnostics);
        applyRoadmapMode(
            content,
            childContent,
            childConfig,
            roadmapMode,
            childAbsPath,
            childRelPath,
            ctx.diagnostics,
        );

        if (roadmapMode === 'isolate' && !childContent.roadmap) {
            ctx.diagnostics.push({
                severity: 'error',
                message: `Cannot isolate "${childRelPath}": it has no roadmap declaration.`,
                sourcePath: absPath,
                line: inc.$cstNode?.range.start.line,
            });
        }

        // Non-ignored includes with a child roadmap must agree on start: with the parent.
        // Deliberate divergence from the usual "parent wins with warning" merge behaviour
        // because start: defines the shared timeline baseline.
        if (roadmapMode !== 'ignore' && childFile.roadmapDecl) {
            const parentStart = readStartProp(file.roadmapDecl);
            const childStart = readStartProp(childFile.roadmapDecl);
            if (parentStart !== childStart) {
                ctx.diagnostics.push({
                    severity: 'error',
                    message: formatStartMismatch(childRelPath, parentStart, childStart),
                    sourcePath: absPath,
                    line: inc.$cstNode?.range.start.line,
                });
            }
        }
    }

    ctx.resolving.pop();
    const result = { config, content };
    ctx.processed.set(absPath, result);
    return result;
}

function getIncludeMode(
    inc: IncludeDeclaration,
    key: 'config' | 'roadmap',
): IncludeMode | undefined {
    const opt = inc.options.find((o) => o.key === key);
    if (!opt) return undefined;
    if (opt.value === 'merge' || opt.value === 'ignore' || opt.value === 'isolate') {
        return opt.value;
    }
    return undefined;
}

async function parseString(
    services: NowlineServices,
    text: string,
    absPath: string,
): Promise<NowlineFile> {
    const uri = URI.file(absPath);
    const docFactory = services.shared.workspace.LangiumDocumentFactory;
    const doc = docFactory.fromString<NowlineFile>(text, uri);
    await services.shared.workspace.DocumentBuilder.build([doc], { validation: false });
    return doc.parseResult.value;
}

function applyConfigMode(
    target: ResolvedConfig,
    child: ResolvedConfig,
    mode: IncludeMode,
    childPath: string,
    diagnostics: ResolveDiagnostic[],
): void {
    if (mode === 'ignore' || mode === 'isolate') return;

    const warn = (name: string, category: string) =>
        diagnostics.push({
            severity: 'warning',
            message: `${category} "${name}" from ${basename(childPath)} is shadowed by the parent's definition.`,
            sourcePath: childPath,
        });

    mergeMap(target.styles, child.styles, (name) => warn(name, 'Style'));
    mergeMap(target.defaults, child.defaults, (name) => warn(name, 'Default'));
    mergeMap(target.symbols, child.symbols, (name) => warn(name, 'Symbol'));
    if (child.scale && !target.scale) {
        target.scale = child.scale;
    }
    if (child.calendar && !target.calendar) {
        target.calendar = child.calendar;
    }
}

function applyRoadmapMode(
    target: ResolvedContent,
    child: ResolvedContent,
    childConfig: ResolvedConfig,
    mode: IncludeMode,
    childPath: string,
    childRelPath: string,
    diagnostics: ResolveDiagnostic[],
): void {
    if (mode === 'ignore') return;

    if (mode === 'isolate') {
        if (child.roadmap) {
            target.isolatedRegions.push({
                sourcePath: childRelPath,
                config: childConfig,
                content: child,
            });
        }
        return;
    }

    const warn = (name: string, category: string) =>
        diagnostics.push({
            severity: 'warning',
            message: `${category} "${name}" from ${basename(childPath)} is shadowed by the parent's definition.`,
            sourcePath: childPath,
        });

    mergeContentMap(target.persons, child.persons, (name) => warn(name, 'Person'));
    mergeContentMap(target.teams, child.teams, (name) => warn(name, 'Team'));
    mergeContentMap(target.anchors, child.anchors, (name) => warn(name, 'Anchor'));
    mergeContentMap(target.labels, child.labels, (name) => warn(name, 'Label'));
    mergeContentMap(target.sizes, child.sizes, (name) => warn(name, 'Size'));
    mergeContentMap(target.statuses, child.statuses, (name) => warn(name, 'Status'));
    mergeContentMap(target.swimlanes, child.swimlanes, (name) => warn(name, 'Swimlane'));
    mergeContentMap(target.milestones, child.milestones, (name) => warn(name, 'Milestone'));
    mergeContentMap(target.footnotes, child.footnotes, (name) => warn(name, 'Footnote'));
    if (child.roadmap && !target.roadmap) {
        target.roadmap = child.roadmap;
    }
}

function mergeMap<V>(
    target: Map<string, V>,
    source: Map<string, V>,
    onConflict: (name: string) => void,
): void {
    for (const [name, value] of source) {
        if (target.has(name)) {
            onConflict(name);
            continue;
        }
        target.set(name, value);
    }
}

/**
 * Merge a child content map into the parent. Explicit-id entries keep the
 * parent-wins-on-collision behavior (and warn). Title-only (auto-slugged)
 * entries are internal and non-referenceable, so they never shadow and never
 * warn — each is re-keyed around the parent's entries and kept.
 */
function mergeContentMap<V extends { name?: string; title?: string }>(
    target: Map<string, V>,
    source: Map<string, V>,
    onConflict: (name: string) => void,
): void {
    for (const [name, value] of source) {
        if (!value.name && value.title) {
            target.set(
                uniqueMapKey(target as Map<string, unknown>, slugifyTitle(value.title)),
                value,
            );
            continue;
        }
        if (target.has(name)) {
            onConflict(name);
            continue;
        }
        target.set(name, value);
    }
}

function mergeLocalConfig(config: ResolvedConfig, file: NowlineFile): void {
    for (const entry of file.configEntries) {
        addConfigEntry(config, entry);
    }
}

function addConfigEntry(config: ResolvedConfig, entry: ConfigEntry): void {
    if (isScaleBlock(entry)) {
        if (!config.scale) config.scale = entry;
    } else if (isCalendarBlock(entry)) {
        if (!config.calendar) config.calendar = entry;
    } else if (isStyleDeclaration(entry)) {
        if (entry.name && !config.styles.has(entry.name)) {
            config.styles.set(entry.name, entry);
        }
    } else if (isSymbolDeclaration(entry)) {
        if (entry.name && !config.symbols.has(entry.name)) {
            config.symbols.set(entry.name, entry);
        }
    } else if (isDefaultDeclaration(entry)) {
        if (!config.defaults.has(entry.entityType)) {
            config.defaults.set(entry.entityType, entry);
        }
    }
}

/** Explicit ids declared in a file, grouped by the content map they target. */
interface ReservedRoadmapIds {
    swimlanes: Set<string>;
    persons: Set<string>;
    teams: Set<string>;
    anchors: Set<string>;
    labels: Set<string>;
    sizes: Set<string>;
    statuses: Set<string>;
    milestones: Set<string>;
    footnotes: Set<string>;
}

function collectExplicitRoadmapIds(entries: RoadmapEntry[]): ReservedRoadmapIds {
    const reserved: ReservedRoadmapIds = {
        swimlanes: new Set(),
        persons: new Set(),
        teams: new Set(),
        anchors: new Set(),
        labels: new Set(),
        sizes: new Set(),
        statuses: new Set(),
        milestones: new Set(),
        footnotes: new Set(),
    };
    for (const entry of entries) {
        const name = (entry as { name?: string }).name;
        if (!name) continue;
        if (isSwimlaneDeclaration(entry)) reserved.swimlanes.add(name);
        else if (isPersonDeclaration(entry)) reserved.persons.add(name);
        else if (isTeamDeclaration(entry)) reserved.teams.add(name);
        else if (isAnchorDeclaration(entry)) reserved.anchors.add(name);
        else if (isLabelDeclaration(entry)) reserved.labels.add(name);
        else if (isSizeDeclaration(entry)) reserved.sizes.add(name);
        else if (isStatusDeclaration(entry)) reserved.statuses.add(name);
        else if (isMilestoneDeclaration(entry)) reserved.milestones.add(name);
        else if (isFootnoteDeclaration(entry)) reserved.footnotes.add(name);
    }
    return reserved;
}

function mergeLocalContent(content: ResolvedContent, file: NowlineFile): void {
    if (file.roadmapDecl && !content.roadmap) {
        content.roadmap = file.roadmapDecl;
    }
    // Pre-scan explicit ids so a title-only slug can never displace one an
    // author spelled out, even when the title-only entry comes first in source.
    const reserved = collectExplicitRoadmapIds(file.roadmapEntries);
    for (const entry of file.roadmapEntries) {
        addRoadmapEntry(content, entry, reserved);
    }
}

/** Kebab-case slug for title-only entities (specs/dsl.md § Identifiers). */
function slugifyTitle(title: string): string {
    return (
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'entity'
    );
}

/**
 * Pick a map key that does not collide with an existing entry, nor with any
 * key in `reserved` (explicit ids that will be inserted later in the same
 * pass). Reserving keeps a title-only slug from claiming a key an author
 * spelled out explicitly, regardless of source order.
 */
function uniqueMapKey(map: Map<string, unknown>, base: string, reserved?: Set<string>): string {
    const taken = (key: string): boolean => map.has(key) || (reserved?.has(key) ?? false);
    if (!taken(base)) return base;
    let n = 2;
    while (taken(`${base}-${n}`)) n++;
    return `${base}-${n}`;
}

/**
 * Insert a roadmap entity into a resolved-content map. Explicit ids always
 * win their key (and keep today's parent-wins-on-collision behavior); title-only
 * entries land under a slug derived from the title (internal key — not written
 * to AST) that avoids both occupied and `reserved` explicit-id keys.
 */
function addByKey<V extends { name?: string; title?: string }>(
    map: Map<string, V>,
    entry: V,
    reserved?: Set<string>,
): void {
    if (entry.name) {
        if (!map.has(entry.name)) {
            map.set(entry.name, entry);
        }
    } else if (entry.title) {
        map.set(
            uniqueMapKey(map as Map<string, unknown>, slugifyTitle(entry.title), reserved),
            entry,
        );
    }
}

function addRoadmapEntry(
    content: ResolvedContent,
    entry: RoadmapEntry,
    reserved: ReservedRoadmapIds,
): void {
    if (isSwimlaneDeclaration(entry)) {
        addByKey(content.swimlanes, entry, reserved.swimlanes);
    } else if (isPersonDeclaration(entry)) {
        addByKey(content.persons, entry, reserved.persons);
    } else if (isTeamDeclaration(entry)) {
        addByKey(content.teams, entry, reserved.teams);
    } else if (isAnchorDeclaration(entry)) {
        addByKey(content.anchors, entry, reserved.anchors);
    } else if (isLabelDeclaration(entry)) {
        addByKey(content.labels, entry, reserved.labels);
    } else if (isSizeDeclaration(entry)) {
        addByKey(content.sizes, entry, reserved.sizes);
    } else if (isStatusDeclaration(entry)) {
        addByKey(content.statuses, entry, reserved.statuses);
    } else if (isMilestoneDeclaration(entry)) {
        addByKey(content.milestones, entry, reserved.milestones);
    } else if (isFootnoteDeclaration(entry)) {
        addByKey(content.footnotes, entry, reserved.footnotes);
    }
}
