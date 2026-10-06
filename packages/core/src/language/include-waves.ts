// Waves across includes (specs/waves.md §6.1, §7). The include resolver
// calls these helpers:
//
//   - `checkWaveAgreement`: include rule 12 for one `P → C` edge (NL.E0202,
//     then NL.W0701 for presentation drift when the waves agree).
//   - `runResolverWaveChecks`: once per root pipeline, after resolution. The
//     S and P rules for every participating child (children are parsed with
//     `validation:false`, so the validator never sees them), the cross-file
//     part of WV2 (NL.E0300), and the G rules over each layout scope: the
//     merged main lanes and each isolated region.
//
// Every diagnostic produced here carries `rule: 'wave'` and is coded
// (`code` + `args`, the shape `acceptTr` stores), except WV8's fixed rule-23
// text.

import type { AstNode } from 'langium';
import type { IncludeDeclaration, NowlineFile, WaveDeclaration } from '../generated/ast.js';
import {
    isNowlineFile,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isWaveDeclaration,
} from '../generated/ast.js';
import type { MessageArgs, MessageCode } from '../i18n/index.js';
import { tr } from '../i18n/index.js';
import type { WavePresentationField } from '../i18n/wave-message-types.js';
import { basename } from '../util/posix-path.js';
import { singleLine } from '../util/single-line.js';
import type { IncludeMode, ResolveDiagnostic, ResolvedContent } from './include-resolver.js';
import { registerEntity } from './nowline-validator.js';
import { propKey } from './validator-utils.js';
import {
    checkWaveDeclarations,
    evaluateWaveProperties,
    fileRefLookup,
    ownWaves,
    type WaveFinding,
    type WaveRefLookup,
    waveFloorDate,
} from './waves.js';
import { evaluateWaveOrder } from './waves-order.js';

/** One include edge `P → C` whose child was read and parsed. */
export interface WaveIncludeEdge {
    /** Absolute path of the including file P. */
    parentAbs: string;
    inc: IncludeDeclaration;
    /** The path as written in P's `include` line. */
    childRelPath: string;
    childAbs: string;
    mode: IncludeMode;
    childFile: NowlineFile;
    childContent: ResolvedContent;
    /** `participates(C)` (§7.1). */
    participates: boolean;
}

/**
 * Resolves an id against resolved content the way layout seeds its edge
 * maps: anchors, then milestones, then waves, by map key.
 */
export function resolvedContentLookup(content: ResolvedContent): WaveRefLookup {
    return (id) => content.anchors.get(id) ?? content.milestones.get(id) ?? content.waves?.get(id);
}

function hasParseErrors(file: NowlineFile): boolean {
    const result = file.$document?.parseResult;
    return !!result && (result.lexerErrors.length > 0 || result.parserErrors.length > 0);
}

/**
 * `participates(C)` from specs/waves.md §7.1: C declares a roadmap, its
 * resolved content has a swimlane, or it declares waves. A child that failed
 * to parse, or a circular-include stub, never participates.
 */
export function participates(
    childFile: NowlineFile,
    childContent: ResolvedContent,
    isStub: boolean,
): boolean {
    if (isStub || hasParseErrors(childFile)) return false;
    return (
        !!childFile.roadmapDecl || childContent.swimlanes.size > 0 || ownWaves(childFile).length > 0
    );
}

/** A coded resolver diagnostic: the en-US text plus `code` and `args`. */
function coded<K extends MessageCode>(
    severity: 'error' | 'warning',
    sourcePath: string,
    line: number | undefined,
    code: K,
    ...args: MessageArgs<K>
): ResolveDiagnostic {
    return {
        severity,
        message: tr('en-US', code, ...args),
        sourcePath,
        ...(line === undefined ? {} : { line }),
        code,
        args,
        rule: 'wave',
    };
}

function waveIds(waves: readonly WaveDeclaration[]): string[] {
    return waves.map((w) => w.name as string);
}

// The fields NL.W0701 compares, as display text ('' when absent).
function presentation(wave: WaveDeclaration): Record<WavePresentationField, string> {
    const prop = (key: string): string => {
        const p = wave.properties.find((q) => propKey(q) === key);
        if (!p) return '';
        return p.value ?? p.values.join(', ');
    };
    return {
        title: wave.title === undefined ? '' : singleLine(wave.title),
        style: prop('style'),
        labels: prop('labels'),
        link: prop('link'),
        description: wave.description ? singleLine(wave.description.text) : '',
    };
}

const PRESENTATION_FIELDS: WavePresentationField[] = [
    'title',
    'style',
    'labels',
    'link',
    'description',
];

/**
 * Include rule 12 (§7.2) for one `merge` or `isolate` edge whose child
 * participates: σ(C) must equal σ(P), where σ(F) is F's own waves with their
 * floor dates resolved against F's resolved content. Reports the first
 * difference as NL.E0202 on P's include line; when σ agrees, one NL.W0701 per
 * wave whose presentation differs. `failed` marks a child that failed
 * NL.E0202, which is not evaluated further.
 */
export function checkWaveAgreement(
    parentFile: NowlineFile,
    parentContent: ResolvedContent,
    edge: WaveIncludeEdge,
): { diagnostics: ResolveDiagnostic[]; failed: boolean } {
    const none = { diagnostics: [], failed: false };
    if (edge.mode === 'ignore' || !edge.participates) return none;
    // A child with a wave that has no id (NL.E1100) is not compared.
    if (edge.childFile.roadmapEntries.some((e) => isWaveDeclaration(e) && !e.name)) return none;

    const at = edge.parentAbs;
    const line = edge.inc.$cstNode?.range.start.line;
    const path = edge.childRelPath;
    const parent = ownWaves(parentFile);
    const child = ownWaves(edge.childFile);
    const fail = (d: ResolveDiagnostic) => ({ diagnostics: [d], failed: true });

    if (parent.length === 0 && child.length === 0) return none;
    if (child.length === 0) {
        return fail(
            coded('error', at, line, 'NL.E0202', {
                reason: 'child-none',
                path,
                parent: waveIds(parent),
            }),
        );
    }
    if (parent.length === 0) {
        return fail(
            coded('error', at, line, 'NL.E0202', {
                reason: 'parent-none',
                path,
                child: waveIds(child),
            }),
        );
    }
    if (parent.length !== child.length || parent.some((w, i) => w.name !== child[i].name)) {
        return fail(
            coded('error', at, line, 'NL.E0202', {
                reason: 'mismatch',
                path,
                child: waveIds(child),
                parent: waveIds(parent),
            }),
        );
    }

    // Resolved floor dates are compared, never the written references.
    const parentLookup = resolvedContentLookup(parentContent);
    const childLookup = resolvedContentLookup(edge.childContent);
    for (let i = 0; i < parent.length; i++) {
        const parentFloor = waveFloorDate(parent[i], parentLookup)?.date ?? null;
        const childFloor = waveFloorDate(child[i], childLookup)?.date ?? null;
        if (parentFloor === childFloor) continue;
        return fail(
            coded('error', at, line, 'NL.E0202', {
                reason: 'floor',
                id: parent[i].name as string,
                path,
                childFloor,
                parentFloor,
            }),
        );
    }

    const diagnostics: ResolveDiagnostic[] = [];
    for (let i = 0; i < parent.length; i++) {
        const here = presentation(parent[i]);
        const there = presentation(child[i]);
        const fields = PRESENTATION_FIELDS.filter((f) => here[f] !== there[f]).map((field) => ({
            field,
            there: there[field],
            here: here[field],
        }));
        if (fields.length === 0) continue;
        diagnostics.push(
            coded('warning', at, line, 'NL.W0701', {
                id: parent[i].name as string,
                path,
                fields,
            }),
        );
    }
    return { diagnostics, failed: false };
}

// The NowlineFile a node belongs to.
function fileOf(node: AstNode): NowlineFile | undefined {
    let n: AstNode | undefined = node;
    while (n && !isNowlineFile(n)) n = n.$container;
    return n;
}

/** Inputs to `runResolverWaveChecks`, recorded during resolution. */
export interface ResolverWaveInput {
    rootFile: NowlineFile;
    rootAbs: string;
    rootContent: ResolvedContent;
    /** Every parsed file, the root included, by its absolute path. */
    files: ReadonlyMap<NowlineFile, string>;
    /** Every include edge whose child was read, per including file, in include order. */
    edges: ReadonlyMap<string, readonly WaveIncludeEdge[]>;
    /** Absolute paths of children that failed NL.E0202. */
    failed: ReadonlySet<string>;
}

/**
 * The S, P, cross-file WV2 and G evaluations of §6.1, run once per root
 * pipeline over the files and scopes recorded during resolution.
 */
export function runResolverWaveChecks(input: ResolverWaveInput): ResolveDiagnostic[] {
    const { rootFile, rootAbs, rootContent, files, edges, failed } = input;
    const out: ResolveDiagnostic[] = [];
    // A file placed in two layout scopes (isolated by the root and merged by
    // another child) yields the same G finding once per scope: keep one.
    const emitted = new Set<string>();
    const push = (d: ResolveDiagnostic): void => {
        const key = JSON.stringify([d.sourcePath, d.line, d.code, d.args, d.message]);
        if (emitted.has(key)) return;
        emitted.add(key);
        out.push(d);
    };
    const pathOf = (node: AstNode): string | undefined => {
        const file = fileOf(node);
        return file ? files.get(file) : undefined;
    };
    const toDiagnostic = (finding: WaveFinding, sourcePath: string): ResolveDiagnostic => {
        const line = finding.node.$cstNode?.range.start.line;
        if ('message' in finding) {
            return {
                severity: finding.severity,
                message: finding.message,
                sourcePath,
                ...(line === undefined ? {} : { line }),
                rule: 'wave',
            };
        }
        return coded(
            finding.severity,
            sourcePath,
            line,
            finding.code as 'NL.E1100',
            finding.args as MessageArgs<'NL.E1100'>[0],
        );
    };

    // Participating children reachable from the root through merge and
    // isolate edges, in include order (depth first, each file once).
    const children: Array<{ file: NowlineFile; abs: string }> = [];
    const seen = new Set<string>([rootAbs]);
    const walk = (abs: string): void => {
        for (const edge of edges.get(abs) ?? []) {
            if (edge.mode === 'ignore' || !edge.participates || seen.has(edge.childAbs)) continue;
            seen.add(edge.childAbs);
            if (!failed.has(edge.childAbs)) {
                children.push({ file: edge.childFile, abs: edge.childAbs });
            }
            walk(edge.childAbs);
        }
    };
    walk(rootAbs);

    const rootWaves = ownWaves(rootFile);
    const rootWaveDecls = new Map(rootWaves.map((w) => [w.name as string, w]));

    for (const { file, abs } of children) {
        // S and P: the validator never sees a child (`validation:false`).
        for (const f of checkWaveDeclarations(file)) push(toDiagnostic(f, abs));
        for (const f of evaluateWaveProperties(file)) push(toDiagnostic(f, abs));

        // WV2 across files: no explicit id may equal one of the root's wave
        // ids. The child's own matching wave lines are what rule 12 asks for.
        if (rootWaveDecls.size === 0) continue;
        const register = (name: string | undefined, node: AstNode): void => {
            const wave = name === undefined ? undefined : rootWaveDecls.get(name);
            if (!wave || isWaveDeclaration(node)) return;
            const waveLine = wave.$cstNode ? wave.$cstNode.range.start.line + 1 : 0;
            push(
                coded('error', abs, node.$cstNode?.range.start.line, 'NL.E0300', {
                    name: name as string,
                    location: `${basename(rootAbs)}:${waveLine}`,
                }),
            );
        };
        if (file.roadmapDecl) register(file.roadmapDecl.name, file.roadmapDecl);
        for (const entry of file.roadmapEntries) registerEntity(entry, register);
        for (const entry of file.configEntries) {
            if (isStyleDeclaration(entry)) register(entry.name, entry);
        }
    }

    // G: once per layout scope. The validator already evaluated the root's
    // own lanes, so a finding it reproduces exactly is not repeated; what
    // remains involves another file's work.
    if (rootWaves.length === 0) return out;
    const key = (f: WaveFinding): string =>
        'message' in f ? f.message : `${f.code}\u0000${JSON.stringify(f.args)}`;
    const rootOnly = new Map<AstNode, Set<string>>();
    const rootScope = {
        lanes: rootFile.roadmapEntries.filter(isSwimlaneDeclaration),
        lookup: fileRefLookup(rootFile),
    };
    for (const f of evaluateWaveOrder(rootScope, rootWaves, { suppressCycleRefs: false })) {
        const set = rootOnly.get(f.node) ?? new Set<string>();
        set.add(key(f));
        rootOnly.set(f.node, set);
    }
    const report = (findings: WaveFinding[]): void => {
        for (const f of findings) {
            if (rootOnly.get(f.node)?.has(key(f))) continue;
            const abs = pathOf(f.node);
            if (abs === undefined || failed.has(abs)) continue;
            push(toDiagnostic(f, abs));
        }
    };
    report(
        evaluateWaveOrder(
            {
                lanes: [...rootContent.swimlanes.values()],
                lookup: resolvedContentLookup(rootContent),
            },
            rootWaves,
            { suppressCycleRefs: false },
        ),
    );
    // Each isolated region is its own scope (one level: layout does not draw
    // nested regions). A region whose file failed NL.E0202 is skipped.
    for (const region of rootContent.isolatedRegions) {
        const regionRoot = region.content.roadmap ? pathOf(region.content.roadmap) : undefined;
        if (regionRoot !== undefined && failed.has(regionRoot)) continue;
        const regionWaves = [...(region.content.waves?.values() ?? [])];
        if (regionWaves.length === 0) continue;
        report(
            evaluateWaveOrder(
                {
                    lanes: [...region.content.swimlanes.values()],
                    lookup: resolvedContentLookup(region.content),
                },
                regionWaves,
                { suppressCycleRefs: false },
            ),
        );
    }
    return out;
}
