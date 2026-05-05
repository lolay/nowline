import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { URI } from 'langium';
import type { NowlineServices } from './nowline-module.js';
import type {
    NowlineFile,
    IncludeDeclaration,
    ConfigEntry,
    RoadmapEntry,
    StyleDeclaration,
    LabelDeclaration,
    StatusDeclaration,
    DurationDeclaration,
    ScaleBlock,
    CalendarBlock,
    DefaultDeclaration,
    SwimlaneDeclaration,
    PersonDeclaration,
    TeamDeclaration,
    AnchorDeclaration,
    MilestoneDeclaration,
    FootnoteDeclaration,
    RoadmapDeclaration,
    GlyphDeclaration,
} from '../generated/ast.js';
import {
    isStyleDeclaration,
    isLabelDeclaration,
    isStatusDeclaration,
    isDurationDeclaration,
    isScaleBlock,
    isCalendarBlock,
    isDefaultDeclaration,
    isSwimlaneDeclaration,
    isPersonDeclaration,
    isTeamDeclaration,
    isAnchorDeclaration,
    isMilestoneDeclaration,
    isFootnoteDeclaration,
    isGlyphDeclaration,
} from '../generated/ast.js';

export type IncludeMode = 'merge' | 'ignore' | 'isolate';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readStartProp(decl: RoadmapDeclaration | undefined): string | undefined {
    const prop = decl?.properties.find((p) => p.key === 'start');
    if (!prop || !prop.value) return undefined;
    if (!DATE_RE.test(prop.value)) return undefined;
    if (isNaN(new Date(prop.value).getTime())) return undefined;
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
    // Custom glyph declarations from the `glyph` config keyword. Renderer-side
    // resolution of `icon:` / `capacity-icon:` looks here when the value isn't
    // a built-in identifier or an inline Unicode literal. See specs/dsl.md §
    // Glyph Declaration.
    glyphs: Map<string, GlyphDeclaration>;
}

export interface ResolvedContent {
    roadmap?: RoadmapDeclaration;
    persons: Map<string, PersonDeclaration>;
    teams: Map<string, TeamDeclaration>;
    anchors: Map<string, AnchorDeclaration>;
    labels: Map<string, LabelDeclaration>;
    durations: Map<string, DurationDeclaration>;
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
        glyphs: new Map(),
    };
}

function emptyContent(): ResolvedContent {
    return {
        persons: new Map(),
        teams: new Map(),
        anchors: new Map(),
        labels: new Map(),
        durations: new Map(),
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
    const readFile = options.readFile ?? ((p) => fs.readFile(p, 'utf-8'));
    const ctx: ResolveContext = {
        services: options.services,
        diagnostics: [],
        resolving: [],
        processed: new Map(),
        readFile,
    };
    const absPath = path.resolve(filePath);
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
        const childAbsPath = path.resolve(path.dirname(absPath), childRelPath);

        if (seenIncludes.has(childAbsPath)) {
            ctx.diagnostics.push({
                severity: 'error',
                message: `Duplicate include "${childRelPath}" in ${path.basename(absPath)}.`,
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

function getIncludeMode(inc: IncludeDeclaration, key: 'config' | 'roadmap'): IncludeMode | undefined {
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
            message: `${category} "${name}" from ${path.basename(childPath)} is shadowed by the parent's definition.`,
            sourcePath: childPath,
        });

    mergeMap(target.styles, child.styles, (name) => warn(name, 'Style'));
    mergeMap(target.defaults, child.defaults, (name) => warn(name, 'Default'));
    mergeMap(target.glyphs, child.glyphs, (name) => warn(name, 'Glyph'));
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
            message: `${category} "${name}" from ${path.basename(childPath)} is shadowed by the parent's definition.`,
            sourcePath: childPath,
        });

    mergeMap(target.persons, child.persons, (name) => warn(name, 'Person'));
    mergeMap(target.teams, child.teams, (name) => warn(name, 'Team'));
    mergeMap(target.anchors, child.anchors, (name) => warn(name, 'Anchor'));
    mergeMap(target.labels, child.labels, (name) => warn(name, 'Label'));
    mergeMap(target.durations, child.durations, (name) => warn(name, 'Duration'));
    mergeMap(target.statuses, child.statuses, (name) => warn(name, 'Status'));
    mergeMap(target.swimlanes, child.swimlanes, (name) => warn(name, 'Swimlane'));
    mergeMap(target.milestones, child.milestones, (name) => warn(name, 'Milestone'));
    mergeMap(target.footnotes, child.footnotes, (name) => warn(name, 'Footnote'));
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
    } else if (isGlyphDeclaration(entry)) {
        if (entry.name && !config.glyphs.has(entry.name)) {
            config.glyphs.set(entry.name, entry);
        }
    } else if (isDefaultDeclaration(entry)) {
        if (!config.defaults.has(entry.entityType)) {
            config.defaults.set(entry.entityType, entry);
        }
    }
}

function mergeLocalContent(content: ResolvedContent, file: NowlineFile): void {
    if (file.roadmapDecl && !content.roadmap) {
        content.roadmap = file.roadmapDecl;
    }
    for (const entry of file.roadmapEntries) {
        addRoadmapEntry(content, entry);
    }
}

function addRoadmapEntry(content: ResolvedContent, entry: RoadmapEntry): void {
    if (isSwimlaneDeclaration(entry)) {
        if (entry.name && !content.swimlanes.has(entry.name)) {
            content.swimlanes.set(entry.name, entry);
        }
    } else if (isPersonDeclaration(entry)) {
        if (entry.name && !content.persons.has(entry.name)) {
            content.persons.set(entry.name, entry);
        }
    } else if (isTeamDeclaration(entry)) {
        if (entry.name && !content.teams.has(entry.name)) {
            content.teams.set(entry.name, entry);
        }
    } else if (isAnchorDeclaration(entry)) {
        if (entry.name && !content.anchors.has(entry.name)) {
            content.anchors.set(entry.name, entry);
        }
    } else if (isLabelDeclaration(entry)) {
        if (entry.name && !content.labels.has(entry.name)) {
            content.labels.set(entry.name, entry);
        }
    } else if (isDurationDeclaration(entry)) {
        if (entry.name && !content.durations.has(entry.name)) {
            content.durations.set(entry.name, entry);
        }
    } else if (isStatusDeclaration(entry)) {
        if (entry.name && !content.statuses.has(entry.name)) {
            content.statuses.set(entry.name, entry);
        }
    } else if (isMilestoneDeclaration(entry)) {
        if (entry.name && !content.milestones.has(entry.name)) {
            content.milestones.set(entry.name, entry);
        }
    } else if (isFootnoteDeclaration(entry)) {
        if (entry.name && !content.footnotes.has(entry.name)) {
            content.footnotes.set(entry.name, entry);
        }
    }
}
