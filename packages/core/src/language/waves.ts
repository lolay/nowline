// Wave rules (specs/waves.md §4, §5.1, §6). Pure functions over the AST: the
// validator translates the findings into Langium diagnostics, and the
// include resolver (children are parsed with `validation:false`) and layout
// call the same helpers.
//
// Rule sets implemented here:
//   - S (declarations): WV1 NL.E1100, WV3 NL.E1105, WV4 NL.E1106
//     (`checkWaveDeclaration` / `checkWaveDeclarations`).
//   - P (properties): WV5 NL.E1104, WV6 NL.E1101, WV7 NL.E1102, WV8 (the
//     rule-23 message for `wave` on a default line), WV9 NL.W0702
//     (`evaluateWaveProperties`).
// WV2 is the validator's existing `checkUniqueIdentifiers` (NL.E0300). The G
// rules (WV10-WV12) live in `waves-order.ts`, which builds on `assignWaves`.

import type { AstNode } from 'langium';
import type {
    EntityProperty,
    NowlineFile,
    SwimlaneDeclaration,
    WaveDeclaration,
} from '../generated/ast.js';
import {
    isAnchorDeclaration,
    isDefaultDeclaration,
    isDescriptionDirective,
    isGroupBlock,
    isItemDeclaration,
    isMilestoneDeclaration,
    isNowlineFile,
    isParallelBlock,
    isPersonDeclaration,
    isStyleDeclaration,
    isSwimlaneDeclaration,
    isSymbolDeclaration,
    isTeamDeclaration,
    isWaveDeclaration,
} from '../generated/ast.js';
import type { MessageArgs } from '../i18n/index.js';
import type { WaveKind, WaveSuggestion } from '../i18n/wave-message-types.js';
import { singleLine } from '../util/single-line.js';
import {
    DATE_RE,
    defaultBannedMessage,
    displayName,
    entityTypeLabel,
    lineOf,
    propKey,
    suggestUniqueKey,
} from './validator-utils.js';

// --- Findings ---

/** Codes the wave rules emit. */
export type WaveFindingCode =
    | 'NL.E1100'
    | 'NL.E1101'
    | 'NL.E1102'
    | 'NL.E1103'
    | 'NL.E1104'
    | 'NL.E1105'
    | 'NL.E1106'
    | 'NL.W0702'
    | 'NL.W1100'
    | 'NL.W1101';

type FindingBase = {
    severity: 'error' | 'warning';
    /** Node whose range the diagnostic covers. */
    node: AstNode;
    /** Optional property of `node` to narrow the range (e.g. `'key'`). */
    property?: string;
};

/** A localized finding: the caller formats it with `tr(locale, code, args)`. */
export type CodedWaveFinding = {
    [K in WaveFindingCode]: FindingBase & { code: K; args: MessageArgs<K>[0] };
}[WaveFindingCode];

/**
 * An uncoded finding with a fixed English message. Only WV8 uses it: `wave`
 * on a `default <entity>` line reuses the existing (uncoded) rule-23 text.
 */
export type UncodedWaveFinding = FindingBase & { message: string };

export type WaveFinding = CodedWaveFinding | UncodedWaveFinding;

// --- Wave list and index ---

/**
 * The file's own waves in declaration order: every wave declaration with a
 * valid (non-empty) id. A wave that failed WV1 is not in the list, and a
 * repeated id (NL.E0300) keeps only its first declaration. A roadmap "has
 * waves" when this list is non-empty.
 */
export function ownWaves(file: NowlineFile): WaveDeclaration[] {
    const seen = new Set<string>();
    const out: WaveDeclaration[] = [];
    for (const entry of file.roadmapEntries) {
        if (!isWaveDeclaration(entry) || !entry.name) continue;
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        out.push(entry);
    }
    return out;
}

/** Wave id to its 1-based index in declaration order (`ownWaves`). */
export function waveIndexMap(file: NowlineFile): Map<string, number> {
    const map = new Map<string, number>();
    ownWaves(file).forEach((w, i) => {
        map.set(w.name as string, i + 1);
    });
    return map;
}

// --- Effective wave, lead wave ---

type WaveValue =
    | { status: 'valid'; id: string; index: number }
    | { status: 'list'; value: string }
    | { status: 'forward'; value: string; line: number }
    | { status: 'missing'; value: string };

// Every `wave:` key on the node, in source order. A repeated key is a WV6
// error (one wave per entity); the first key is the one that applies.
function waveProps(node: AstNode): EntityProperty[] {
    const props = (node as { properties?: EntityProperty[] }).properties ?? [];
    return props.filter((p) => propKey(p) === 'wave');
}

function waveProp(node: AstNode): EntityProperty | undefined {
    return waveProps(node)[0];
}

// `wave:[a, b]` is echoed back as `[a, b]`; `wave:[a]` is the same as `wave:a`.
function waveValueText(prop: EntityProperty): string {
    if (prop.value !== undefined) return prop.value;
    return prop.values.length === 1 ? prop.values[0] : `[${prop.values.join(', ')}]`;
}

// The top-level roadmap entry that contains `node`, and the file it lives in.
function topLevel(node: AstNode): TopLevel | undefined {
    let n: AstNode | undefined = node;
    while (n?.$container && !isNowlineFile(n.$container)) n = n.$container;
    const file = n?.$container;
    if (!n || !file || !isNowlineFile(file)) return undefined;
    return {
        file,
        index: (file.roadmapEntries as AstNode[]).indexOf(n),
        waveDecls: waveDeclarationIndex(file),
    };
}

// Where each wave is first declared among the file's roadmap entries.
function waveDeclarationIndex(file: NowlineFile): Map<string, number> {
    const map = new Map<string, number>();
    file.roadmapEntries.forEach((e, i) => {
        if (isWaveDeclaration(e) && e.name && !map.has(e.name)) map.set(e.name, i);
    });
    return map;
}

// The top-level entry holding a reference, with its file's wave declaration
// index (`assignWaves` computes both once per lane).
type TopLevel = { file: NowlineFile; index: number; waveDecls: ReadonlyMap<string, number> };

// WV6 classification of a `wave:` value. A declared wave must be declared
// earlier in the roadmap section than the top-level entry holding the
// reference (rule-15 model). The check runs against the node's own file, so
// layout can pass a wave index built from another file that agrees on the
// waves (include rule 12).
function classifyWaveValue(
    prop: EntityProperty,
    node: AstNode,
    waveIds: ReadonlyMap<string, number>,
    top: TopLevel | undefined = topLevel(node),
): WaveValue {
    const value = waveValueText(prop);
    if (prop.value === undefined && prop.values.length !== 1) return { status: 'list', value };
    const index = waveIds.get(value);
    if (index === undefined) return { status: 'missing', value };
    if (top) {
        const declIdx = top.waveDecls.get(value);
        if (declIdx !== undefined && (top.index < 0 || declIdx > top.index)) {
            return {
                status: 'forward',
                value,
                line: lineOf(top.file.roadmapEntries[declIdx]),
            };
        }
    }
    return { status: 'valid', id: value, index };
}

function isWaveContainer(node: AstNode | undefined): boolean {
    return isGroupBlock(node) || isParallelBlock(node);
}

/**
 * `ew(x)` from specs/waves.md §4.4: the 1-based index of the node's
 * effective wave, or undefined for background work.
 *
 * - A `wave:` that names a valid declared wave applies, unless an enclosing
 *   group or parallel already has an effective wave: then the container's
 *   wave wins (a WV7 conflict uses the container's wave).
 * - An invalid `wave:` value (WV6) makes the node background.
 * - With no `wave:`, the nearest enclosing group or parallel decides.
 *   Swimlanes never contribute.
 */
export function effectiveWave(
    node: AstNode,
    waveIds: ReadonlyMap<string, number>,
): number | undefined {
    const parent = isWaveContainer(node.$container) ? node.$container : undefined;
    const inherited = parent ? effectiveWave(parent as AstNode, waveIds) : undefined;
    return effectiveWaveStep(node, inherited, waveIds, topLevel(node));
}

// One step of `ew`: the node's own `wave:` against the effective wave of its
// enclosing group or parallel (`inherited`).
function effectiveWaveStep(
    node: AstNode,
    inherited: number | undefined,
    waveIds: ReadonlyMap<string, number>,
    top: TopLevel | undefined,
): number | undefined {
    const prop = waveProp(node);
    if (!prop) return inherited;
    const own = classifyWaveValue(prop, node, waveIds, top);
    if (own.status !== 'valid') return undefined;
    return inherited ?? own.index;
}

/**
 * `lw(C)` from specs/waves.md §5.1: the wave a container's box may not open
 * before. An item's lead wave is its effective wave. A group without an
 * effective wave takes its first child's; a parallel without one takes the
 * minimum over its tracks, or background when any track is background. An
 * empty container is background.
 */
export function leadWave(node: AstNode, waveIds: ReadonlyMap<string, number>): number | undefined {
    const own = effectiveWave(node, waveIds);
    if (own !== undefined || isItemDeclaration(node)) return own;
    if (isGroupBlock(node)) {
        const first = node.content.find((c) => !isDescriptionDirective(c));
        return first ? leadWave(first, waveIds) : undefined;
    }
    if (isParallelBlock(node)) {
        let min: number | undefined;
        for (const track of node.content) {
            if (isDescriptionDirective(track)) continue;
            const lw = leadWave(track, waveIds);
            if (lw === undefined) return undefined;
            min = min === undefined ? lw : Math.min(min, lw);
        }
        return min;
    }
    return undefined;
}

/** `ew` and `lw` for every item, group and parallel under a list of lanes. */
export interface WaveAssignment {
    /** `ew(x)`, for every node with an effective wave (absent: background). */
    waveOf: Map<AstNode, number>;
    /** `lw(x)`, for every node with a lead wave (absent: none). */
    leadOf: Map<AstNode, number>;
}

/**
 * `effectiveWave` and `leadWave` for every item, group and parallel under
 * `lanes`, in one pass: `ew` top-down, `lw` bottom-up. Use this instead of
 * calling the single-node helpers per node, which re-walk the ancestors and
 * the file's entries each time. The lanes may come from several files that
 * agree on the waves (include rule 12); each `wave:` is still checked
 * against its own file's declaration order.
 */
export function assignWaves(
    lanes: readonly SwimlaneDeclaration[],
    waveIds: ReadonlyMap<string, number>,
): WaveAssignment {
    const waveOf = new Map<AstNode, number>();
    const leadOf = new Map<AstNode, number>();
    const declsByFile = new Map<NowlineFile, Map<string, number>>();

    // Returns lw(node).
    const visit = (
        node: AstNode,
        inherited: number | undefined,
        top: TopLevel | undefined,
    ): number | undefined => {
        const ew = effectiveWaveStep(node, inherited, waveIds, top);
        if (ew !== undefined) waveOf.set(node, ew);
        let lw = ew;
        if (isGroupBlock(node) || isParallelBlock(node)) {
            const leads: Array<number | undefined> = [];
            for (const child of node.content) {
                if (!isDescriptionDirective(child)) leads.push(visit(child, ew, top));
            }
            if (ew === undefined) {
                if (isGroupBlock(node)) lw = leads[0];
                else if (leads.length > 0 && !leads.includes(undefined)) {
                    lw = Math.min(...(leads as number[]));
                }
            }
        }
        if (lw !== undefined) leadOf.set(node, lw);
        return lw;
    };

    for (const lane of lanes) {
        let top: TopLevel | undefined;
        const file = lane.$container;
        if (isNowlineFile(file)) {
            let waveDecls = declsByFile.get(file);
            if (!waveDecls) {
                waveDecls = waveDeclarationIndex(file);
                declsByFile.set(file, waveDecls);
            }
            top = { file, index: (file.roadmapEntries as AstNode[]).indexOf(lane), waveDecls };
        }
        for (const child of lane.content) {
            if (!isDescriptionDirective(child)) visit(child, undefined, top);
        }
    }
    return { waveOf, leadOf };
}

// --- Start floor ---

/** Resolves an id to its declaration. Layout and includes pass merged lookups. */
export type WaveRefLookup = (id: string) => AstNode | undefined;

function isValidIsoDate(v: string): boolean {
    return DATE_RE.test(v) && !Number.isNaN(new Date(v).getTime());
}

function dateProp(node: AstNode): string | undefined {
    const props = (node as { properties?: EntityProperty[] }).properties ?? [];
    return props.find((p) => propKey(p) === 'date')?.value;
}

// Ids that `after:`, `before:` and `on:` can name, mirroring the validator's
// `collectReferenceableIds`. The first declaration of a repeated id wins.
function collectDeclarations(file: NowlineFile): Map<string, AstNode> {
    const ids = new Map<string, AstNode>();
    const add = (node: AstNode): void => {
        const name = (node as { name?: string }).name;
        if (name && !ids.has(name)) ids.set(name, node);
        if (isSwimlaneDeclaration(node) || isParallelBlock(node) || isGroupBlock(node)) {
            for (const c of node.content) add(c);
        } else if (isTeamDeclaration(node)) {
            for (const c of node.content) {
                if (isTeamDeclaration(c) || isPersonDeclaration(c)) add(c);
            }
        }
    };
    if (file.roadmapDecl) add(file.roadmapDecl);
    for (const entry of file.roadmapEntries) add(entry);
    return ids;
}

/** A lookup over one file's declarations (see `WaveRefLookup`). */
export function fileRefLookup(file: NowlineFile): WaveRefLookup {
    const ids = collectDeclarations(file);
    return (id) => ids.get(id);
}

/**
 * `A_k` from specs/waves.md §5.1: the latest date among the wave's `after:`
 * elements (an anchor's `date:`, a dated milestone's `date:`, or an inline
 * ISO date), with the element that set it as `ref`. Ties keep the first
 * element. Elements that fail WV4, or that do not resolve, are ignored;
 * null when no element gives a date.
 */
export function waveFloorDate(
    wave: WaveDeclaration,
    lookup: WaveRefLookup,
): { date: string; ref: string } | null {
    let best: { date: string; ref: string } | null = null;
    for (const prop of wave.properties) {
        if (propKey(prop) !== 'after') continue;
        const vals = prop.value !== undefined ? [prop.value] : prop.values;
        for (const v of vals) {
            if (!v) continue;
            let date: string | undefined;
            if (DATE_RE.test(v)) {
                date = v;
            } else {
                const target = lookup(v);
                if (isAnchorDeclaration(target) || isMilestoneDeclaration(target)) {
                    date = dateProp(target);
                }
            }
            if (date === undefined || !isValidIsoDate(date)) continue;
            if (best === null || date > best.date) best = { date, ref: v };
        }
    }
    return best;
}

// --- S rules: declarations ---

// WV3: keys a wave declaration may not take. `before` has its own message.
const WAVE_BANNED_KEYS = new Set([
    'before',
    'date',
    'start',
    'length',
    'duration',
    'size',
    'capacity',
    'remaining',
    'wave',
]);

/**
 * True for a property that WV3 owns: a banned key on a wave declaration.
 * Other checks skip it so NL.E1105 is the only diagnostic for that key.
 */
export function isWaveBannedProperty(prop: EntityProperty): boolean {
    return isWaveDeclaration(prop.$container) && WAVE_BANNED_KEYS.has(propKey(prop));
}

const KIND_BY_TYPE: Record<string, WaveKind> = {
    ItemDeclaration: 'item',
    GroupBlock: 'group',
    ParallelBlock: 'parallel',
    SwimlaneDeclaration: 'swimlane',
    AnchorDeclaration: 'anchor',
    MilestoneDeclaration: 'milestone',
    WaveDeclaration: 'wave',
    LabelDeclaration: 'label',
    SizeDeclaration: 'size',
    StatusDeclaration: 'status',
    PersonDeclaration: 'person',
    TeamDeclaration: 'team',
    FootnoteDeclaration: 'footnote',
    RoadmapDeclaration: 'roadmap',
    StyleDeclaration: 'style',
    SymbolDeclaration: 'symbol',
};

function waveKindOf(node: AstNode): WaveKind {
    return KIND_BY_TYPE[node.$type] ?? (entityTypeLabel(node) as WaveKind);
}

/**
 * WV1, WV3 and WV4 for one wave declaration. `lookup` resolves its `after:`
 * ids; build it once per file (`fileRefLookup`) or pass a merged lookup.
 */
export function checkWaveDeclaration(wave: WaveDeclaration, lookup: WaveRefLookup): WaveFinding[] {
    const findings: WaveFinding[] = [];
    const name = displayName(wave);
    // A wave with neither id nor title has only NL.E1100: the other messages
    // would have to name it "<unnamed>".
    const nameless = !wave.name && wave.title === undefined;

    if (!wave.name) {
        findings.push({
            severity: 'error',
            code: 'NL.E1100',
            args: {
                ...(wave.title === undefined ? {} : { title: singleLine(wave.title) }),
                line: lineOf(wave),
            },
            node: wave,
        });
    }

    if (nameless) return findings;

    for (const prop of wave.properties) {
        const key = propKey(prop);
        if (WAVE_BANNED_KEYS.has(key)) {
            findings.push({
                severity: 'error',
                code: 'NL.E1105',
                args:
                    key === 'before' ? { reason: 'before', name } : { reason: 'other', key, name },
                node: prop,
                property: 'key',
            });
            continue;
        }
        if (key !== 'after') continue;
        const vals = prop.value !== undefined ? [prop.value] : prop.values;
        for (const ref of vals) {
            // Dates are checked by checkInlineDatePins (E0410/E0412/E0413);
            // an id that resolves to nothing gets only "does not resolve".
            if (!ref || DATE_RE.test(ref)) continue;
            const target = lookup(ref);
            if (!target || isAnchorDeclaration(target)) continue;
            if (isMilestoneDeclaration(target)) {
                if (dateProp(target) !== undefined) continue;
                findings.push({
                    severity: 'error',
                    code: 'NL.E1106',
                    args: { name, ref, kind: 'floating-milestone' },
                    node: prop,
                });
                continue;
            }
            findings.push({
                severity: 'error',
                code: 'NL.E1106',
                args: { name, ref, kind: waveKindOf(target) },
                node: prop,
            });
        }
    }
    return findings;
}

/** The S rules (WV1, WV3, WV4) for every wave declaration in the file. */
export function checkWaveDeclarations(file: NowlineFile): WaveFinding[] {
    const lookup = fileRefLookup(file);
    return file.roadmapEntries
        .filter(isWaveDeclaration)
        .flatMap((wave) => checkWaveDeclaration(wave, lookup));
}

// --- P rules: `wave:` properties ---

type W0702Target = MessageArgs<'NL.W0702'>[0]['target'];
type W0702Kind = Exclude<W0702Target, { kind: 'default' }>['kind'];

// Every node that can carry a `wave:` key, outside wave declarations (the S
// rules own those): the roadmap line, roadmap entries and their content,
// people inside teams, and `default <entity>` lines.
function collectWaveHosts(file: NowlineFile): AstNode[] {
    const out: AstNode[] = [];
    const add = (node: AstNode): void => {
        if (isWaveDeclaration(node)) return;
        out.push(node);
        if (isSwimlaneDeclaration(node) || isParallelBlock(node) || isGroupBlock(node)) {
            for (const c of node.content) {
                if (!isDescriptionDirective(c)) add(c);
            }
        } else if (isTeamDeclaration(node)) {
            for (const c of node.content) {
                if (isTeamDeclaration(c) || isPersonDeclaration(c)) add(c);
            }
        }
    };
    for (const entry of file.configEntries) {
        if (isDefaultDeclaration(entry)) out.push(entry);
    }
    if (file.roadmapDecl) add(file.roadmapDecl);
    for (const entry of file.roadmapEntries) add(entry);
    return out;
}

// WV6 suggestion: a wave whose title matches the value (case-insensitive),
// else the unique closest id within two edits.
function suggestWave(value: string, waves: WaveDeclaration[]): WaveSuggestion | undefined {
    const lower = value.toLowerCase();
    const byTitle = waves.filter(
        (w) => w.title !== undefined && singleLine(w.title).toLowerCase() === lower,
    );
    let match: WaveDeclaration | undefined;
    if (byTitle.length === 1) {
        match = byTitle[0];
    } else {
        const id = suggestUniqueKey(
            value,
            waves.map((w) => w.name as string),
        );
        match = id === undefined ? undefined : waves.find((w) => w.name === id);
    }
    if (!match) return undefined;
    return match.title === undefined
        ? { id: match.name as string }
        : { id: match.name as string, title: singleLine(match.title) };
}

// What a non-wave id names, for WV6 `not-a-wave`: roadmap declarations first,
// then config styles and symbols.
function nonWaveKind(
    file: NowlineFile,
    value: string,
    lookup: WaveRefLookup,
): WaveKind | undefined {
    const target = lookup(value);
    if (target) return waveKindOf(target);
    for (const entry of file.configEntries) {
        if ((isStyleDeclaration(entry) || isSymbolDeclaration(entry)) && entry.name === value) {
            return waveKindOf(entry);
        }
    }
    return undefined;
}

// The nearest enclosing group or parallel that carries a `wave:` key. An
// enclosing `wave:` that failed WV6 stops the walk: that container is
// background, so it imposes nothing on its descendants (cascade control).
function nearestWaveContainer(
    node: AstNode,
    waveIds: ReadonlyMap<string, number>,
): { container: AstNode; prop: EntityProperty } | undefined {
    let n = node.$container;
    while (isWaveContainer(n)) {
        const prop = waveProp(n as AstNode);
        if (prop) {
            const v = classifyWaveValue(prop, n as AstNode, waveIds);
            return v.status === 'valid' ? { container: n as AstNode, prop } : undefined;
        }
        n = n?.$container;
    }
    return undefined;
}

// An entity or container as the E1102 message names it: its id or title, or
// its line when it has neither.
function e1102Ref<K extends 'item' | 'group' | 'parallel'>(
    kind: K,
    node: AstNode & { name?: string; title?: string },
): { kind: K; name: string; line?: number } {
    const name = node.name ?? (node.title === undefined ? '' : singleLine(node.title));
    return name ? { kind, name } : { kind, name, line: lineOf(node) };
}

// The NL.W0702 target: a default line by its entity type, anything else by
// its id or title, or by its line when it has neither (an anonymous block).
function w0702Target(node: AstNode): W0702Target {
    if (isDefaultDeclaration(node)) return { kind: 'default', entityType: node.entityType };
    const named = node as AstNode & { name?: string; title?: string };
    const name = named.name ?? (named.title === undefined ? '' : singleLine(named.title));
    const kind = waveKindOf(node) as W0702Kind;
    return name ? { kind, name } : { kind, name, line: lineOf(node) };
}

// WV6 and WV7 for the `wave:` key that applies to an item, group or parallel.
function checkWaveValue(
    file: NowlineFile,
    node: AstNode,
    prop: EntityProperty,
    waves: WaveDeclaration[],
    waveIds: ReadonlyMap<string, number>,
    lookup: WaveRefLookup,
): WaveFinding | undefined {
    const v = classifyWaveValue(prop, node, waveIds);
    switch (v.status) {
        case 'list':
            return {
                severity: 'error',
                code: 'NL.E1101',
                args: { reason: 'list', value: v.value },
                node: prop,
            };
        case 'forward':
            return {
                severity: 'error',
                code: 'NL.E1101',
                args: { reason: 'forward', value: v.value, line: v.line },
                node: prop,
            };
        case 'missing': {
            const kind = nonWaveKind(file, v.value, lookup);
            const suggestion = suggestWave(v.value, waves);
            return {
                severity: 'error',
                code: 'NL.E1101',
                args:
                    kind === undefined
                        ? {
                              reason: 'unknown',
                              value: v.value,
                              declared: waves.map((w) => w.name as string),
                              ...(suggestion ? { suggestion } : {}),
                          }
                        : {
                              reason: 'not-a-wave',
                              value: v.value,
                              kind,
                              ...(suggestion ? { suggestion } : {}),
                          },
                node: prop,
            };
        }
        case 'valid':
            break;
    }

    const outer = nearestWaveContainer(node, waveIds);
    if (!outer) return undefined;
    const containerWave = waveValueText(outer.prop);
    if (containerWave === v.id) return undefined;
    const entityKind = isItemDeclaration(node) ? 'item' : isGroupBlock(node) ? 'group' : 'parallel';
    return {
        severity: 'error',
        code: 'NL.E1102',
        args: {
            entity: e1102Ref(entityKind, node as AstNode & { name?: string; title?: string }),
            wave: v.id,
            container: e1102Ref(
                isGroupBlock(outer.container) ? 'group' : 'parallel',
                outer.container as AstNode & { name?: string; title?: string },
            ),
            containerWave,
        },
        node: prop,
    };
}

/**
 * The P rules (WV5-WV9) for every `wave:` key in the file.
 *
 * - With no waves (WV9), each `wave:` key gets one NL.W0702 and nothing else.
 * - With waves: each `wave:` key on a `default <entity>` line gets the
 *   rule-23 error (WV8); each one on an entity other than item, group and
 *   parallel gets NL.E1104 (WV5). On item, group and parallel the first key
 *   is checked by WV6 (NL.E1101) and, when valid, against the enclosing
 *   container's wave by WV7 (NL.E1102); each repeated key is NL.E1101
 *   `list`.
 */
export function evaluateWaveProperties(file: NowlineFile): WaveFinding[] {
    const waves = ownWaves(file);
    const hasWaves = waves.length > 0;
    const waveIds = waveIndexMap(file);
    const lookup = fileRefLookup(file);
    const findings: WaveFinding[] = [];

    for (const node of collectWaveHosts(file)) {
        const props = waveProps(node);
        if (props.length === 0) continue;

        if (!hasWaves) {
            for (const prop of props) {
                findings.push({
                    severity: 'warning',
                    code: 'NL.W0702',
                    args: { target: w0702Target(node) },
                    node: prop,
                    property: 'key',
                });
            }
            continue;
        }

        if (isDefaultDeclaration(node)) {
            for (const prop of props) {
                findings.push({
                    severity: 'error',
                    message: defaultBannedMessage('wave', node.entityType),
                    node: prop,
                });
            }
            continue;
        }

        const named = node as AstNode & { name?: string; title?: string };
        const name = displayName(named);
        const nameless = !named.name && named.title === undefined;
        // NL.E0301 already reports an entity with neither id nor title, and
        // NL.E1104 would have to name it "<unnamed>".
        if (nameless && !isItemDeclaration(node) && !isGroupBlock(node) && !isParallelBlock(node)) {
            continue;
        }
        if (isSwimlaneDeclaration(node) || isMilestoneDeclaration(node)) {
            for (const prop of props) {
                findings.push({
                    severity: 'error',
                    code: 'NL.E1104',
                    args: {
                        reason: isSwimlaneDeclaration(node) ? 'swimlane' : 'milestone',
                        name,
                        value: waveValueText(prop),
                    },
                    node: prop,
                });
            }
            continue;
        }
        if (!isItemDeclaration(node) && !isGroupBlock(node) && !isParallelBlock(node)) {
            for (const prop of props) {
                findings.push({
                    severity: 'error',
                    code: 'NL.E1104',
                    args: { reason: 'other', type: waveKindOf(node), name },
                    node: prop,
                });
            }
            continue;
        }

        const [prop, ...repeated] = props;
        const finding = checkWaveValue(file, node, prop, waves, waveIds, lookup);
        if (finding) findings.push(finding);
        // WV6: a repeated `wave:` key gives the entity more than one wave.
        // The first key still applies (`effectiveWave`); each later key is
        // reported with every value the entity names.
        if (repeated.length > 0) {
            const all = props.flatMap((p) => (p.value !== undefined ? [p.value] : p.values));
            for (const extra of repeated) {
                findings.push({
                    severity: 'error',
                    code: 'NL.E1101',
                    args: { reason: 'list', value: `[${all.join(', ')}]` },
                    node: extra,
                });
            }
        }
    }
    return findings;
}
