import { URI } from 'langium';
import { collectDocumentDiagnostics, type RawDiagnostic } from '../diagnostics/index.js';
import type {
    AnchorDeclaration,
    CalendarBlock,
    ConfigEntry,
    DefaultDeclaration,
    FootnoteDeclaration,
    IncludeDeclaration,
    LabelDeclaration,
    MilestoneDeclaration,
    NonWorkingDeclaration,
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
    WaveDeclaration,
    WorkingDeclaration,
} from '../generated/ast.js';
import {
    isAnchorDeclaration,
    isCalendarBlock,
    isDefaultDeclaration,
    isFootnoteDeclaration,
    isLabelDeclaration,
    isMilestoneDeclaration,
    isNonWorkingDeclaration,
    isPersonDeclaration,
    isScaleBlock,
    isSizeDeclaration,
    isStatusDeclaration,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
    isWorkingDeclaration,
} from '../generated/ast.js';
import type { MessageCode } from '../i18n/codes.js';
import type { E0203Args, E0208Args } from '../i18n/include-message-types.js';
import { type MessageArgs, tr } from '../i18n/index.js';
import {
    basename,
    dirname,
    isAbsolute,
    isWithin,
    relative,
    resolve as resolvePath,
} from '../util/posix-path.js';
import { isRealIsoDate } from '../util/props.js';
import { checkIncludedReferences } from './include-references.js';
import {
    checkWaveAgreement,
    hasParseErrors,
    nodeLocation,
    participates,
    runResolverWaveChecks,
    type WaveIncludeEdge,
} from './include-waves.js';
import type { NowlineServices } from './nowline-module.js';
import { ownWaves } from './waves.js';

export type IncludeMode = 'merge' | 'ignore' | 'isolate';

// An impossible `start:` (`2026-02-30`) reads as absent, as it does in layout;
// the validator reports it as NL.E0405. (`new Date` would roll it over to
// March 2, so a parent and child could disagree on a day neither names.)
function readStartProp(decl: RoadmapDeclaration | undefined): string | undefined {
    const prop = decl?.properties.find((p) => p.key === 'start');
    if (!prop?.value || !isRealIsoDate(prop.value)) return undefined;
    return prop.value;
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
    /**
     * Every `non-working` and `working` declaration of the file and its merged
     * includes (specs/working-calendar.md §4). Unnamed ones always merge; a
     * child's named one is dropped, with a warning, when the parent already
     * holds one with the same keyword and name. The order carries no meaning:
     * the layout's calendar resolver sorts the rules it builds from them.
     */
    calendarDeclarations: CalendarDeclaration[];
}

/** A `non-working` or `working` config declaration. */
type CalendarDeclaration = NonWorkingDeclaration | WorkingDeclaration;

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
    /**
     * The file's own waves (specs/waves.md §7.4), by id; insertion order is
     * the wave order. Absent when the file declares none. Children's waves
     * are never merged in: include rule 12 makes every participating file
     * declare the same waves. Consumers read `content.waves ?? EMPTY`.
     */
    waves?: Map<string, WaveDeclaration>;
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

/** A 0-based, end-exclusive source range, the shape of an LSP `Range`. */
export interface ResolveRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

export interface ResolveDiagnostic {
    severity: 'error' | 'warning';
    /** en-US text; `localizeResolveDiagnostic` renders a coded one in another locale. */
    message: string;
    /** Absolute path of the file the diagnostic points into. */
    sourcePath: string;
    /** 0-based line in `sourcePath`; `range.start.line` when `range` is set. */
    line?: number;
    /**
     * 0-based range in `sourcePath` of the node the diagnostic is about,
     * narrowed to the property where the validator narrows its copy, so a
     * consumer can point at the same column and span. Set on the routed
     * diagnostics (see `isRoutedResolveDiagnostic`) whose node has a CST
     * node; consumers fall back to the whole of `line` without it. An
     * included file's syntax error has none: consumers adapt its `syntax`.
     */
    range?: ResolveRange;
    /**
     * Stable code of a coded diagnostic: every include error (NL.E0203 to
     * NL.E0210), the wave rules (specs/waves.md §7.4), and an included
     * file's unresolved reference (NL.E0302). Absent on the shadow
     * warnings, an included file's syntax error, and WV8.
     */
    code?: MessageCode;
    /** The message arguments as a rest tuple, as `acceptTr` stores them. */
    args?: unknown[];
    /**
     * `'wave'` on every diagnostic of the wave checks (specs/waves.md §6.1),
     * coded or not (WV8 reuses an uncoded message). Absent on every other
     * resolver diagnostic. See `isRoutedResolveDiagnostic`.
     */
    rule?: 'wave';
    /**
     * The lexer or parser error of an included file that failed to parse
     * (specs/dsl.md, Include rule 13), as `collectDocumentDiagnostics`
     * reports it. A surface adapts it with its own lexer/parser adapter, so it
     * reads as it does when that file is checked on its own. Absent on every
     * other resolver diagnostic.
     */
    syntax?: IncludedSyntaxError;
}

/** A lexer or parser error of an included file. */
export type IncludedSyntaxError = Extract<RawDiagnostic, { origin: 'lexer' | 'parser' }>;

/**
 * True for a resolver diagnostic that consumers report like a validator
 * diagnostic (file, line, localized, exit 1): a coded one (every include
 * error, the wave rules and NL.E0302), one from the wave checks, or an
 * included file's syntax error. What is left is the uncoded shadow warnings
 * (specs/waves.md §6.1).
 */
export function isRoutedResolveDiagnostic(d: ResolveDiagnostic): boolean {
    return d.code !== undefined || d.rule === 'wave' || d.syntax !== undefined;
}

export interface ResolveResult {
    config: ResolvedConfig;
    content: ResolvedContent;
    diagnostics: ResolveDiagnostic[];
    processedFiles: Set<string>;
}

interface ResolveContext {
    services: NowlineServices;
    /** Absolute path of the root file, whose syntax errors the validator reports. */
    rootAbs: string;
    policy?: IncludePolicy;
    /** Resolves symlinks under a `rooted` policy. */
    realPath: (absPath: string) => Promise<string>;
    /** What a circular include's chain is shown relative to. */
    displayBase: string;
    diagnostics: ResolveDiagnostic[];
    resolving: string[];
    processed: Map<string, { config: ResolvedConfig; content: ResolvedContent }>;
    readFile: (absPath: string) => Promise<string>;
    /** Every parsed file, the root included, with its absolute path. */
    files: Map<NowlineFile, string>;
    /** Include edges whose child was read, per including file, in include order. */
    edges: Map<string, WaveIncludeEdge[]>;
    /** Children that failed include rule 12 (NL.E0202). */
    failedWaves: Set<string>;
}

function emptyConfig(): ResolvedConfig {
    return {
        styles: new Map(),
        defaults: new Map(),
        symbols: new Map(),
        calendarDeclarations: [],
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

/**
 * How deep an include chain may go: the root's includes are depth 1. A
 * deeper include is NL.E0210 and is not read, so a chain the cycle check
 * cannot see (a symlinked directory that contains itself) still ends.
 */
export const MAX_INCLUDE_DEPTH = 16;

/**
 * Where includes may be read from (specs/dsl.md, Include rules 14 and 15).
 * Omitted: anywhere the reader reaches, relative to the including file.
 */
export type IncludePolicy =
    /** Every include is NL.E0209 on its line, and nothing is read. */
    | { kind: 'disabled' }
    /**
     * Every include, at any depth, must be a relative path that resolves,
     * symlinks followed, to a `.nowline` file inside `root`; anything else
     * is NL.E0208 on its line and is not read. `root` and the root file's
     * path must be absolute real paths (symlinks already resolved).
     * `realPath` resolves symlinks; Node's `fs.realpath` by default.
     */
    | { kind: 'rooted'; root: string; realPath?: (absPath: string) => Promise<string> };

export interface ResolveIncludesOptions {
    services: NowlineServices;
    readFile?: (absPath: string) => Promise<string>;
    includePolicy?: IncludePolicy;
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
    const policy = options.includePolicy;
    const realPath =
        (policy?.kind === 'rooted' ? policy.realPath : undefined) ??
        (async (p: string) => {
            const { nodeRealPath } = await import('../util/node-read-file.js');
            return nodeRealPath(p);
        });
    const absPath = resolvePath('', filePath);
    const ctx: ResolveContext = {
        services: options.services,
        rootAbs: absPath,
        policy,
        realPath,
        displayBase: policy?.kind === 'rooted' ? policy.root : dirname(absPath),
        diagnostics: [],
        resolving: [],
        processed: new Map(),
        readFile,
        files: new Map(),
        edges: new Map(),
        failedWaves: new Set(),
    };
    const { config, content } = await resolveFile(file, absPath, ctx);
    // The wave S, P and G evaluations run once, over everything resolved.
    ctx.diagnostics.push(
        ...runResolverWaveChecks({
            rootFile: file,
            rootAbs: absPath,
            rootContent: content,
            files: ctx.files,
            edges: ctx.edges,
            failed: ctx.failedWaves,
        }),
    );
    // References never cross a file boundary; report each included file's
    // unresolved ones in that file (an included file is never validated).
    ctx.diagnostics.push(...checkIncludedReferences(absPath, ctx.edges));
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

    // Each included file once, in every include mode: a `roadmap:ignore`
    // child's config is still merged (Include rule 13).
    if (absPath !== ctx.rootAbs) ctx.diagnostics.push(...syntaxDiagnostics(file, absPath));

    ctx.resolving.push(absPath);
    // The root is parsed from a `memory:` URI by every surface, so files are
    // mapped by object, never by `$document.uri`.
    ctx.files.set(file, absPath);

    const config = emptyConfig();
    const content = emptyContent();

    // Seed with the parent's own declarations first so that collisions from included
    // files shadow to the parent (parent wins) and produce a warning pointing at the child.
    mergeLocalConfig(config, file);
    mergeLocalContent(content, file);
    const waves = ownWaves(file);
    if (waves.length > 0) {
        content.waves = new Map(waves.map((w) => [w.name as string, w]));
    }

    const edges: WaveIncludeEdge[] = [];
    ctx.edges.set(absPath, edges);
    const seenIncludes = new Set<string>();
    for (const inc of file.includes) {
        const childRelPath = inc.path;
        // Every include error is coded, at the path on the include line.
        const fail = <K extends MessageCode>(code: K, ...args: MessageArgs<K>): void => {
            ctx.diagnostics.push(includeError(absPath, inc, code, ...args));
        };

        if (ctx.policy?.kind === 'disabled') {
            fail('NL.E0209', { path: childRelPath });
            continue;
        }
        const located = await locateInclude(absPath, childRelPath, ctx);
        if ('refused' in located) {
            fail('NL.E0208', located.refused);
            continue;
        }
        if ('unreadable' in located) {
            fail('NL.E0203', located.unreadable);
            continue;
        }
        const childAbsPath = located.absPath;

        if (seenIncludes.has(childAbsPath)) {
            fail('NL.E0205', { path: childRelPath });
            continue;
        }
        seenIncludes.add(childAbsPath);

        // Caught before the child is read, so a cycle reads nothing twice.
        const cycleStart = ctx.resolving.indexOf(childAbsPath);
        if (cycleStart >= 0) {
            const chain = [...ctx.resolving.slice(cycleStart), childAbsPath]
                .map((p) => relative(ctx.displayBase, p))
                .join(' → ');
            fail('NL.E0204', { path: childRelPath, chain });
            continue;
        }
        // `resolving` holds the chain down to this file, the root included,
        // so its length is the child's depth.
        if (ctx.resolving.length > MAX_INCLUDE_DEPTH) {
            fail('NL.E0210', { path: childRelPath, max: MAX_INCLUDE_DEPTH });
            continue;
        }
        if (!childAbsPath.endsWith('.nowline')) {
            fail('NL.E0203', { reason: 'not-nowline', path: childRelPath });
            continue;
        }

        const configMode = getIncludeMode(inc, 'config') ?? 'merge';
        const roadmapMode = getIncludeMode(inc, 'roadmap') ?? 'merge';

        let childFile: NowlineFile | undefined;
        try {
            const text = await ctx.readFile(childAbsPath);
            childFile = await parseString(ctx.services, text, childAbsPath);
        } catch (err) {
            fail('NL.E0203', unreadableArgs(childRelPath, err));
            continue;
        }

        const { config: childConfig, content: childContent } = await resolveFile(
            childFile,
            childAbsPath,
            ctx,
        );
        edges.push({
            parentAbs: absPath,
            inc,
            childRelPath,
            childAbs: childAbsPath,
            mode: roadmapMode,
            childFile,
            childContent,
            participates: participates(childFile, childContent),
        });

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

        // A partial AST would report a roadmap or start: the parser lost, as
        // an include error that hides the syntax error (Include rule 13).
        const isParsed = !hasParseErrors(childFile);

        if (isParsed && roadmapMode === 'isolate' && !childContent.roadmap) {
            fail('NL.E0206', { path: childRelPath });
        }

        // Non-ignored includes with a child roadmap must agree on start: with the parent.
        // Deliberate divergence from the usual "parent wins with warning" merge behaviour
        // because start: defines the shared timeline baseline.
        if (isParsed && roadmapMode !== 'ignore' && childFile.roadmapDecl) {
            const parentStart = readStartProp(file.roadmapDecl);
            const childStart = readStartProp(childFile.roadmapDecl);
            if (parentStart !== childStart) {
                fail('NL.E0207', {
                    path: childRelPath,
                    ...(parentStart ? { parentStart } : {}),
                    ...(childStart ? { childStart } : {}),
                });
            }
        }
    }

    if (content.waves) rekeyWaveSlugs(content, content.waves);

    // Include rule 12 runs after the include loop, so its result does not
    // depend on include order (specs/waves.md §7.4).
    for (const edge of edges) {
        const { diagnostics, failed } = checkWaveAgreement(file, content, edge);
        ctx.diagnostics.push(...diagnostics);
        if (failed) ctx.failedWaves.add(edge.childAbs);
    }

    ctx.resolving.pop();
    const result = { config, content };
    ctx.processed.set(absPath, result);
    return result;
}

/** A coded include error at `inc`'s path, in the including file. */
function includeError<K extends MessageCode>(
    sourcePath: string,
    inc: IncludeDeclaration,
    code: K,
    ...args: MessageArgs<K>
): ResolveDiagnostic {
    return {
        severity: 'error',
        message: tr('en-US', code, ...args),
        sourcePath,
        ...nodeLocation(inc, 'path'),
        code,
        args,
    };
}

type IncludeLocation = { absPath: string } | { refused: E0208Args } | { unreadable: E0203Args };

/**
 * Where `include "<path>"` in `parentAbs` reads from, under the policy.
 * Unrooted: the path resolved against the parent's directory, as written.
 * Rooted: an absolute path, or one that leaves the root before or after
 * symlinks are resolved, is refused; otherwise the real path, so a file
 * reached through two spellings is one file. Nothing is read here.
 */
async function locateInclude(
    parentAbs: string,
    path: string,
    ctx: ResolveContext,
): Promise<IncludeLocation> {
    const policy = ctx.policy;
    if (policy?.kind !== 'rooted') return { absPath: resolvePath(dirname(parentAbs), path) };
    if (isAbsolute(path)) return { refused: { reason: 'absolute', path } };
    const lexical = resolvePath(dirname(parentAbs), path);
    if (!isWithin(policy.root, lexical)) return { refused: { reason: 'parent', path } };
    let real: string;
    try {
        real = await ctx.realPath(lexical);
    } catch (err) {
        return { unreadable: unreadableArgs(path, err) };
    }
    if (!isWithin(policy.root, real)) return { refused: { reason: 'symlink', path } };
    return { absPath: real };
}

/** NL.E0203's reason for a failed read; the OS error's text only when no reason fits. */
function unreadableArgs(path: string, err: unknown): E0203Args {
    switch ((err as { code?: unknown } | undefined)?.code) {
        case 'ENOENT':
        case 'ENOTDIR':
            return { reason: 'not-found', path };
        case 'EISDIR':
            return { reason: 'is-directory', path };
        case 'EACCES':
        case 'EPERM':
            return { reason: 'permission-denied', path };
    }
    const detail = err instanceof Error ? err.message : undefined;
    return { reason: 'unreadable', path, ...(detail ? { detail } : {}) };
}

/**
 * An included file's lexer and parser errors, at their line in that file.
 * An included file is parsed without validation, so nothing else reports
 * them.
 */
function syntaxDiagnostics(file: NowlineFile, absPath: string): ResolveDiagnostic[] {
    const doc = file.$document;
    if (!doc) return [];
    const out: ResolveDiagnostic[] = [];
    for (const raw of collectDocumentDiagnostics(doc)) {
        if (raw.origin === 'validation') continue;
        // Chevrotain lines are 1-based; an error at end of input has NaN.
        const line = raw.origin === 'lexer' ? raw.error.line : raw.error.token?.startLine;
        out.push({
            severity: 'error',
            message: raw.error.message,
            sourcePath: absPath,
            ...(line !== undefined && Number.isFinite(line) ? { line: line - 1 } : {}),
            syntax: raw,
        });
    }
    return out;
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
    mergeCalendarDeclarations(target.calendarDeclarations, child.calendarDeclarations, (decl) =>
        warn(decl.name as string, calendarKeywordLabel(decl)),
    );
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
            // The same declaration arriving again through a diamond include
            // is not a collision.
            if (target.get(name) !== value) onConflict(name);
            continue;
        }
        target.set(name, value);
    }
}

/**
 * Append a child's calendar declarations to the parent's list. An unnamed
 * declaration always merges. A named one is dropped, and reported, when the
 * list already holds one with the same keyword and name (parent wins); a
 * `non-working h` and a `working h` never collide. A declaration already in
 * the list (a diamond include delivers the shared file's cached config
 * through every path) is skipped silently.
 */
function mergeCalendarDeclarations(
    target: CalendarDeclaration[],
    source: readonly CalendarDeclaration[],
    onConflict: (decl: CalendarDeclaration) => void,
): void {
    const merged = new Set(target);
    // Names held before this merge: a child's own duplicate id is NL.E0907 in
    // that file, not a shadowing by the parent, so both of its copies merge.
    const held = new Set(target.filter((t) => t.name).map(calendarDeclarationKey));
    for (const decl of source) {
        if (merged.has(decl)) continue;
        if (decl.name && held.has(calendarDeclarationKey(decl))) {
            onConflict(decl);
            continue;
        }
        target.push(decl);
        merged.add(decl);
    }
}

/** Keyword and id: the identity two named calendar declarations collide on. */
function calendarDeclarationKey(decl: CalendarDeclaration): string {
    return `${decl.$type}:${decl.name}`;
}

/** The shadow-warning category of a calendar declaration: its keyword, capitalized. */
function calendarKeywordLabel(decl: CalendarDeclaration): string {
    return isNonWorkingDeclaration(decl) ? 'Non-working' : 'Working';
}

/**
 * Merge a child content map into the parent. Explicit-id entries keep the
 * parent-wins-on-collision behavior (and warn). Title-only (auto-slugged)
 * entries are internal and non-referenceable, so they never shadow and never
 * warn — each is re-keyed around the parent's entries and kept. A declaration
 * already in the parent (a diamond include delivers the shared file's cached
 * content through every path) is skipped silently, whatever its key.
 */
function mergeContentMap<V extends { name?: string; title?: string }>(
    target: Map<string, V>,
    source: Map<string, V>,
    onConflict: (name: string) => void,
): void {
    const merged = new Set(target.values());
    for (const [name, value] of source) {
        if (merged.has(value)) continue;
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
    } else if (isNonWorkingDeclaration(entry) || isWorkingDeclaration(entry)) {
        // Every declaration of the file, named or not: a duplicate id in one
        // file is the validator's NL.E0907, not a merge question.
        config.calendarDeclarations.push(entry);
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

// Wave ids are reserved in every map: layout seeds its edge maps by key, so a
// title-only `milestone "Launch"` must not take the key of `wave launch`.
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
        else if (isWaveDeclaration(entry)) {
            for (const set of Object.values(reserved)) set.add(name);
        }
    }
    return reserved;
}

/**
 * Re-key every title-only entry whose slug key equals a wave id (merged in
 * from a child, whose slugs are recomputed by `mergeContentMap`), keeping
 * each map's insertion order. Layout seeds its edge maps by key.
 */
function rekeyWaveSlugs(
    content: ResolvedContent,
    waves: ReadonlyMap<string, WaveDeclaration>,
): void {
    const maps: Array<Map<string, { name?: string; title?: string }>> = [
        content.persons,
        content.teams,
        content.anchors,
        content.labels,
        content.sizes,
        content.statuses,
        content.swimlanes,
        content.milestones,
        content.footnotes,
    ];
    const titleOnlyOnWave = (key: string, v: { name?: string; title?: string }): boolean =>
        waves.has(key) && !v.name && !!v.title;
    for (const map of maps) {
        const entries = [...map];
        if (!entries.some(([k, v]) => titleOnlyOnWave(k, v))) continue;
        const reserved = new Set<string>([...map.keys(), ...waves.keys()]);
        map.clear();
        for (const [k, v] of entries) {
            const key = titleOnlyOnWave(k, v)
                ? uniqueMapKey(map as Map<string, unknown>, k, reserved)
                : k;
            reserved.add(key);
            map.set(key, v);
        }
    }
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
