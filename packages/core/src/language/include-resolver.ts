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
    UnitDeclaration,
    EstimatesDeclaration,
    ScaleDeclaration,
    DefaultsDeclaration,
    SwimlaneDeclaration,
    PersonDeclaration,
    TeamDeclaration,
    AnchorDeclaration,
    MilestoneDeclaration,
    FootnoteDeclaration,
    RoadmapDeclaration,
} from '../generated/ast.js';
import {
    isStyleDeclaration,
    isLabelDeclaration,
    isStatusDeclaration,
    isUnitDeclaration,
    isEstimatesDeclaration,
    isScaleDeclaration,
    isDefaultsDeclaration,
    isSwimlaneDeclaration,
    isPersonDeclaration,
    isTeamDeclaration,
    isAnchorDeclaration,
    isMilestoneDeclaration,
    isFootnoteDeclaration,
} from '../generated/ast.js';

export type IncludeMode = 'merge' | 'ignore' | 'isolate';

export interface ResolvedConfig {
    scale?: ScaleDeclaration;
    units: Map<string, UnitDeclaration>;
    estimates: Map<string, EstimatesDeclaration>;
    statuses: Map<string, StatusDeclaration>;
    styles: Map<string, StyleDeclaration>;
    labels: Map<string, LabelDeclaration>;
    defaults: Map<string, DefaultsDeclaration>;
}

export interface ResolvedContent {
    roadmap?: RoadmapDeclaration;
    persons: Map<string, PersonDeclaration>;
    teams: Map<string, TeamDeclaration>;
    anchors: Map<string, AnchorDeclaration>;
    swimlanes: Map<string, SwimlaneDeclaration>;
    milestones: Map<string, MilestoneDeclaration>;
    footnotes: Map<string, FootnoteDeclaration>;
    isolatedRegions: IsolatedRegion[];
}

export interface IsolatedRegion {
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
        units: new Map(),
        estimates: new Map(),
        statuses: new Map(),
        styles: new Map(),
        labels: new Map(),
        defaults: new Map(),
    };
}

function emptyContent(): ResolvedContent {
    return {
        persons: new Map(),
        teams: new Map(),
        anchors: new Map(),
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
    }

    ctx.resolving.pop();
    const result = { config, content };
    ctx.processed.set(absPath, result);
    return result;
}

function getIncludeMode(inc: IncludeDeclaration, key: 'config' | 'roadmap'): IncludeMode | undefined {
    const needle = `${key}:`;
    const opt = inc.options.find((o) => o.key === needle);
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
    mergeMap(target.labels, child.labels, (name) => warn(name, 'Label'));
    mergeMap(target.statuses, child.statuses, (name) => warn(name, 'Status'));
    mergeMap(target.units, child.units, (name) => warn(name, 'Unit'));
    mergeMap(target.estimates, child.estimates, (name) => warn(name, 'Estimates'));
    mergeMap(target.defaults, child.defaults, (name) => warn(name, 'Defaults'));
    if (child.scale && !target.scale) {
        target.scale = child.scale;
    }
}

function applyRoadmapMode(
    target: ResolvedContent,
    child: ResolvedContent,
    childConfig: ResolvedConfig,
    mode: IncludeMode,
    childPath: string,
    diagnostics: ResolveDiagnostic[],
): void {
    if (mode === 'ignore') return;

    if (mode === 'isolate') {
        if (child.roadmap) {
            target.isolatedRegions.push({
                sourcePath: childPath,
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
    if (isScaleDeclaration(entry)) {
        if (!config.scale) config.scale = entry;
    } else if (isUnitDeclaration(entry)) {
        if (!config.units.has(entry.name)) config.units.set(entry.name, entry);
    } else if (isEstimatesDeclaration(entry)) {
        for (const mapping of entry.mappings) {
            if (!config.estimates.has(mapping.name)) {
                config.estimates.set(mapping.name, entry);
            }
        }
    } else if (isStatusDeclaration(entry)) {
        if (!config.statuses.has(entry.name)) config.statuses.set(entry.name, entry);
    } else if (isStyleDeclaration(entry)) {
        if (entry.name && !config.styles.has(entry.name)) {
            config.styles.set(entry.name, entry);
        }
    } else if (isLabelDeclaration(entry)) {
        if (entry.name && !config.labels.has(entry.name)) {
            config.labels.set(entry.name, entry);
        }
    } else if (isDefaultsDeclaration(entry)) {
        for (const sub of entry.entries) {
            if (!config.defaults.has(sub.entityType)) {
                config.defaults.set(sub.entityType, entry);
            }
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
