// Wave order rules (specs/waves.md §6.3): the G set.
//
//   - WV10 NL.E1103: the wave order can be realized; no member is forced to
//     start after its own wave ends.
//   - WV11 NL.W1100: a `before:` that can never be met.
//   - WV12 NL.W1101: an `after:` or `before:` that layout ignores (a forward
//     reference, or a floating milestone).
//
// The rules run over a layout scope: an ordered list of lanes that layout
// places together. The validator passes a file's own lanes; the include
// resolver passes the merged main lanes and each isolated region (§6.1), so
// nothing here assumes the lanes share a file. Findings keep their AST node,
// which maps to a file and line through `AstUtils.getDocument` and `$cstNode`.

import type { AstNode } from 'langium';
import type {
    EntityProperty,
    GroupBlock,
    ItemDeclaration,
    ParallelBlock,
    SwimlaneDeclaration,
    WaveDeclaration,
} from '../generated/ast.js';
import {
    isDescriptionDirective,
    isGroupBlock,
    isMilestoneDeclaration,
    isParallelBlock,
    isSwimlaneDeclaration,
} from '../generated/ast.js';
import type {
    BlockRef,
    E1103Args,
    FlowRef,
    WaveContainerKind,
} from '../i18n/wave-message-types.js';
import { singleLine } from '../util/single-line.js';
import { DATE_RE, displayName, lineOf, propKey } from './validator-utils.js';
import { assignWaves, type WaveFinding, type WaveRefLookup } from './waves.js';

/** A layout scope for `evaluateWaveOrder`. */
export interface WaveOrderScope {
    /**
     * Lanes in the order layout places them. They may come from several
     * files; an id reused across them resolves last-writer-wins, as in
     * layout's shared edge maps.
     */
    lanes: readonly SwimlaneDeclaration[];
    /**
     * Resolves an id that is not placed work (anchors, milestones) to its
     * declaration. Used to tell floating milestones, which layout ignores,
     * from anchors and dated milestones, which it resolves.
     */
    lookup: WaveRefLookup;
}

type Work = ItemDeclaration | GroupBlock | ParallelBlock;

// One item, group or parallel in placement order.
interface Slot {
    node: Work;
    lane: number;
    /** Enclosing group or parallel, or -1 at lane level. */
    parent: number;
    children: number[];
    /** Previous sibling in a lane or group flow; -1 for a first child or a track. */
    prev: number;
    /** Tick at which layout reads the node's `after:` (its start). */
    start: number;
    /** Tick at which layout registers the node's id (a container: after its content). */
    reg: number;
    ew?: number;
    lw?: number;
    /** An item pinned by `date:` or `start:`: the pin replaces flow and `after:`. */
    pinned: boolean;
    /** `after:` edges layout resolves to placed work. */
    after: Array<{ from: number; prop: EntityProperty; ref: string }>;
    /** `after:<wave>` references: constant `j`. */
    afterWaves: Array<{ prop: EntityProperty; ref: string; j: number }>;
}

// A term of the lower-bound system (§6.3) that feeds S(i) or E(i).
type Term =
    | { kind: 'wave' | 'lead' }
    | { kind: 'after-wave'; prop: EntityProperty; ref: string }
    | { kind: 'parent'; from: number }
    | { kind: 'seq'; from: number }
    | { kind: 'after'; from: number; prop: EntityProperty; ref: string }
    | { kind: 'start' }
    | { kind: 'child'; from: number };

type ContainerRef = { kind: WaveContainerKind; name: string; line?: number };

// A violation's root cause, in the §6.3 preference order.
type Cause =
    | { variant: 'after-wave'; owner: number; prop: EntityProperty; ref: string }
    | { variant: 'after-item'; owner: number; prop: EntityProperty; ref: string }
    | { variant: 'sequence'; owner: number; pred: number; ref: string | BlockRef }
    | { variant: 'join'; owner: number; block: number; track: string };

const PREFERENCE: Cause['variant'][] = ['after-wave', 'after-item', 'sequence', 'join'];

// One NL.E1103 diagnostic and the violating items it explains.
interface OrderReport {
    node: AstNode;
    run: number[];
    build: (run: number[]) => E1103Args;
    /** A `sequence` run: its predecessor, and which items its flow holds. */
    seq?: { pred: number; ref: string | BlockRef; inFlow: (i: number) => boolean };
}

function nameOf(node: { name?: string; title?: string }): string | undefined {
    return node.name ?? (node.title === undefined ? undefined : singleLine(node.title));
}

function flowRef(node: SwimlaneDeclaration | GroupBlock | ParallelBlock): FlowRef {
    const name = nameOf(node);
    if (isSwimlaneDeclaration(node)) return { kind: 'swimlane', name: displayName(node) };
    const group = isGroupBlock(node);
    if (name) return { kind: group ? 'group' : 'parallel', name };
    return { kind: group ? 'group-block' : 'parallel-block', line: lineOf(node) };
}

// How a `sequence` message names its predecessor: by id or title, or by
// position when it is an unnamed group or parallel. An unnamed item has no
// name to give.
function predRef(node: Work): string | BlockRef | undefined {
    const name = nameOf(node);
    if (name !== undefined || node.$type === 'ItemDeclaration') return name;
    return { kind: isGroupBlock(node) ? 'group-block' : 'parallel-block', line: lineOf(node) };
}

// How a W1100/W1101 names the entity it is on: by id or title, or by
// position when it is an unnamed group or parallel.
function ownerOf(node: Work): { name: string; kind?: WaveContainerKind; line?: number } {
    if (node.$type === 'ItemDeclaration' || nameOf(node) !== undefined) {
        return { name: displayName(node) };
    }
    return { name: '', kind: isGroupBlock(node) ? 'group' : 'parallel', line: lineOf(node) };
}

function containerRef(node: GroupBlock | ParallelBlock): ContainerRef {
    const kind = isGroupBlock(node) ? 'group' : 'parallel';
    const name = nameOf(node);
    return name ? { kind, name } : { kind, name: '', line: lineOf(node) };
}

function refValues(prop: EntityProperty): string[] {
    return (prop.value !== undefined ? [prop.value] : prop.values).filter((v) => !!v);
}

function isFloatingMilestone(node: AstNode | undefined): boolean {
    return isMilestoneDeclaration(node) && !node.properties.some((p) => propKey(p) === 'date');
}

function isPinned(node: Work): boolean {
    if (node.$type !== 'ItemDeclaration') return false;
    return node.properties.some((p) => {
        const key = propKey(p);
        return (key === 'date' || key === 'start') && !!p.value && DATE_RE.test(p.value);
    });
}

/**
 * The G rules (WV10-WV12) over one layout scope. `waves` is the roadmap's
 * wave list in declaration order (`ownWaves`); with no waves there are no
 * findings.
 *
 * - WV10 (NL.E1103). Lower bounds `lbS`/`lbE` per §6.3, relaxed to a fixpoint
 *   with a worklist. An item in wave k whose `lbS` reaches k is a violation.
 *   Each root cause is reported once, as `after-wave`, `after-item`,
 *   `sequence`, `join` or `chain`; a violation whose every achieving edge
 *   comes from an already explained violation is folded into that run. A
 *   `sequence` run lists the items of one wave, so it is kept per
 *   predecessor and wave.
 * - WV11 (NL.W1100). A `before:` whose target is placed earlier, or a wave,
 *   that the barrier makes unmeetable.
 * - WV12 (NL.W1101). An `after:` or `before:` naming work layout has not
 *   placed yet, or a floating milestone. A reference that closes an explicit
 *   `after:`/`before:` cycle is left to the circular-dependency check.
 *
 * Swimlane `after:`/`before:` are not implemented by any engine and are
 * ignored here.
 */
export function evaluateWaveOrder(
    scope: WaveOrderScope,
    waves: readonly WaveDeclaration[],
): WaveFinding[] {
    if (waves.length === 0) return [];
    const waveIds = new Map<string, number>();
    waves.forEach((w, i) => {
        if (w.name) waveIds.set(w.name, i + 1);
    });
    const waveName = (index: number): string => waves[index - 1]?.name ?? '';

    const { lanes, lookup } = scope;
    const { waveOf, leadOf } = assignWaves(lanes, waveIds);

    // --- Placement walk: lanes in order, children depth first. ---
    const slots: Slot[] = [];
    const byId = new Map<string, number[]>(); // in registration order
    let tick = 0;
    const visit = (node: Work, lane: number, parent: number, prev: number): number => {
        const i = slots.length;
        const slot: Slot = {
            node,
            lane,
            parent,
            children: [],
            prev,
            start: tick++,
            reg: -1,
            ew: waveOf.get(node),
            lw: leadOf.get(node),
            pinned: isPinned(node),
            after: [],
            afterWaves: [],
        };
        slots.push(slot);
        if (isGroupBlock(node) || isParallelBlock(node)) {
            let last = -1;
            for (const child of node.content) {
                if (isDescriptionDirective(child)) continue;
                last = visit(child, lane, i, isGroupBlock(node) ? last : -1);
                slot.children.push(last);
            }
            slot.reg = tick++;
        } else {
            slot.reg = slot.start;
        }
        if (node.name) {
            const list = byId.get(node.name) ?? [];
            list.push(i);
            byId.set(node.name, list);
        }
        return i;
    };
    lanes.forEach((lane, l) => {
        let last = -1;
        for (const child of lane.content) {
            if (!isDescriptionDirective(child)) last = visit(child, l, -1, last);
        }
    });

    // resolve(r, v): the last node with id r that layout registered before
    // it reads v's references.
    const resolve = (r: string, v: number): number | undefined => {
        const list = byId.get(r);
        if (!list) return undefined;
        for (let k = list.length - 1; k >= 0; k--) {
            if (slots[list[k]].reg < slots[v].start) return list[k];
        }
        return undefined;
    };

    const findings: WaveFinding[] = [];
    const onCycle = cycleTest(slots, lanes, lookup);

    // --- References: the after: edges layout resolves, and WV12. ---
    for (let v = 0; v < slots.length; v++) {
        const slot = slots[v];
        const owner = ownerOf(slot.node);
        for (const prop of slot.node.properties) {
            const key = propKey(prop);
            if (key !== 'after' && key !== 'before') continue;
            for (const ref of refValues(prop)) {
                if (DATE_RE.test(ref)) continue;
                const target = resolve(ref, v);
                const j = target === undefined ? waveIds.get(ref) : undefined;
                // A date: or start: pin replaces every after: term (§5.1).
                if (key === 'after' && !slot.pinned) {
                    if (target !== undefined) slot.after.push({ from: target, prop, ref });
                    else if (j !== undefined) slot.afterWaves.push({ prop, ref, j });
                }
                if (target !== undefined || j !== undefined) continue;

                // WV12: work layout has not placed yet, or a floating
                // milestone. Anchors and dated milestones resolve; an id that
                // names nothing is the "does not resolve" error's.
                const later = byId.get(ref)?.[0];
                if (later === undefined && !isFloatingMilestone(lookup(ref))) continue;
                if (onCycle(slot.node.name, key, ref)) continue;
                // An enclosing group or parallel registers its id only once
                // its content is placed, so layout never resolves it here.
                let ancestor = false;
                for (let a = slot.parent; a >= 0 && !ancestor; a = slots[a].parent) {
                    ancestor = slots[a].node.name === ref;
                }
                findings.push({
                    severity: 'warning',
                    code: 'NL.W1101',
                    args:
                        later === undefined
                            ? { reason: 'floating-milestone', key, ref, ...owner }
                            : ancestor
                              ? { reason: 'ancestor', key, ref, ...owner }
                              : slots[later].lane !== slot.lane
                                ? {
                                      reason: 'forward-lane',
                                      key,
                                      ref,
                                      ...owner,
                                      lane: displayName(lanes[slots[later].lane]),
                                      ownLane: displayName(lanes[slot.lane]),
                                  }
                                : {
                                      reason: 'forward-flow',
                                      key,
                                      ref,
                                      ...owner,
                                      flow: flowRef(commonFlow(slots, lanes, v, later)),
                                  },
                    node: prop,
                });
            }
        }
    }

    // --- WV11: before: that the barrier makes unmeetable. ---
    // maxW / minW: the largest / smallest effective wave over a subtree's items.
    const maxW: Array<number | undefined> = new Array(slots.length);
    const minW: Array<number | undefined> = new Array(slots.length);
    for (let i = slots.length - 1; i >= 0; i--) {
        const slot = slots[i];
        if (slot.node.$type === 'ItemDeclaration') {
            maxW[i] = slot.ew;
            minW[i] = slot.ew;
            continue;
        }
        for (const c of slot.children) {
            const hi = maxW[c];
            const lo = minW[c];
            if (hi !== undefined) maxW[i] = Math.max(maxW[i] ?? hi, hi);
            if (lo !== undefined) minW[i] = Math.min(minW[i] ?? lo, lo);
        }
    }
    for (let v = 0; v < slots.length; v++) {
        const own = maxW[v];
        if (own === undefined) continue; // background subtree
        const owner = ownerOf(slots[v].node);
        for (const prop of slots[v].node.properties) {
            if (propKey(prop) !== 'before') continue;
            for (const ref of refValues(prop)) {
                if (DATE_RE.test(ref)) continue;
                const target = resolve(ref, v);
                if (target !== undefined) {
                    const theirs = minW[target];
                    if (theirs === undefined || own <= theirs) continue;
                    findings.push({
                        severity: 'warning',
                        code: 'NL.W1100',
                        args: {
                            reason: 'item',
                            ref,
                            ...owner,
                            wave: waveName(own),
                            refWave: waveName(theirs),
                        },
                        node: prop,
                    });
                    continue;
                }
                const j = waveIds.get(ref);
                if (j === undefined || own < j) continue;
                findings.push({
                    severity: 'warning',
                    code: 'NL.W1100',
                    args: { reason: 'wave', ref, ...owner, wave: waveName(own) },
                    node: prop,
                });
            }
        }
    }

    // --- WV10: lower bounds, relaxed to a fixpoint. ---
    const isContainer = (i: number): boolean => slots[i].node.$type !== 'ItemDeclaration';
    const hasParentEdge = (i: number): boolean => {
        const { parent, pinned } = slots[i];
        if (pinned || parent < 0) return false;
        return isParallelBlock(slots[parent].node) || slots[parent].children[0] === i;
    };
    const valS = new Array<number>(slots.length).fill(0);
    const valE = new Array<number>(slots.length).fill(0);

    // Every term that feeds S(i), with its current value.
    const termsS = (i: number): Array<{ term: Term; value: number }> => {
        const slot = slots[i];
        const out: Array<{ term: Term; value: number }> = [];
        if (slot.lw !== undefined) {
            out.push({
                term: { kind: slot.ew !== undefined ? 'wave' : 'lead' },
                value: slot.lw - 1,
            });
        }
        for (const a of slot.afterWaves) {
            out.push({ term: { kind: 'after-wave', prop: a.prop, ref: a.ref }, value: a.j });
        }
        if (hasParentEdge(i)) {
            out.push({ term: { kind: 'parent', from: slot.parent }, value: valS[slot.parent] });
        }
        if (!slot.pinned && slot.prev >= 0) {
            out.push({ term: { kind: 'seq', from: slot.prev }, value: valE[slot.prev] });
        }
        for (const a of slot.after) {
            out.push({
                term: { kind: 'after', from: a.from, prop: a.prop, ref: a.ref },
                value: valE[a.from],
            });
        }
        return out;
    };
    const computeE = (i: number): number => {
        let v = valS[i];
        for (const c of slots[i].children) v = Math.max(v, valE[c]);
        return v;
    };

    // Dependents of S(i) and E(i), as worklist keys (2i for S, 2i + 1 for E).
    const depsS: number[][] = slots.map((_, i) => [2 * i + 1]);
    const depsE: number[][] = slots.map(() => []);
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (hasParentEdge(i)) depsS[slot.parent].push(2 * i);
        if (slot.prev >= 0) depsE[slot.prev].push(2 * i);
        for (const a of slot.after) depsE[a.from].push(2 * i);
        if (slot.parent >= 0) depsE[i].push(2 * slot.parent + 1);
    }
    const queue: number[] = [];
    const queued = new Array<boolean>(2 * slots.length).fill(true);
    for (let i = 0; i < slots.length; i++) queue.push(2 * i, 2 * i + 1);
    // Values lie in [0, n] and only grow, so this stops even on cyclic input.
    for (let head = 0; head < queue.length; head++) {
        const k = queue[head];
        queued[k] = false;
        const i = k >> 1;
        const isE = (k & 1) === 1;
        const next = isE ? computeE(i) : Math.max(0, ...termsS(i).map((t) => t.value));
        if (next <= (isE ? valE[i] : valS[i])) continue;
        if (isE) valE[i] = next;
        else valS[i] = next;
        for (const d of isE ? depsE[i] : depsS[i]) {
            if (!queued[d]) {
                queued[d] = true;
                queue.push(d);
            }
        }
    }

    // --- WV10 reporting. ---
    const achieversS = (i: number, b: number): Term[] =>
        termsS(i)
            .filter((t) => t.value === b)
            .map((t) => t.term);
    // E(C) is explained by the children that reach b; S(C) only when none
    // does (a pinned first child), since the children already carry it.
    const achieversE = (i: number, b: number): Term[] => {
        if (!isContainer(i)) return [{ kind: 'start' }];
        const kids: Term[] = slots[i].children
            .filter((c) => valE[c] === b)
            .map((c) => ({ kind: 'child', from: c }));
        if (kids.length > 0) return isGroupBlock(slots[i].node) ? kids.reverse() : kids;
        return valS[i] === b ? [{ kind: 'start' }] : [];
    };

    // The member whose own wave sets E(s) = b, reached through containment
    // only (E(C) from a child, E(v) from S(v)), and the child of s it lies in.
    const ownWaveOrigin = (s: number, b: number): { origin: number; via: number } | undefined => {
        const stack: Array<{ i: number; via: number }> = [{ i: s, via: s }];
        while (stack.length > 0) {
            const { i, via } = stack.pop() as { i: number; via: number };
            const terms = achieversE(i, b);
            for (let t = terms.length - 1; t >= 0; t--) {
                const term = terms[t];
                if (term.kind === 'start') {
                    const ew = slots[i].ew;
                    if (ew !== undefined && ew - 1 === b) return { origin: i, via };
                } else if (term.kind === 'child') {
                    stack.push({ i: term.from, via: i === s ? term.from : via });
                }
            }
        }
        return undefined;
    };

    // True when E(i) = b is i's own wave constant, ew(i) - 1: the condition
    // for `after-item` and `sequence`. A container without a wave of its
    // own may span waves, so there is no wave to name for it.
    const ownConstant = (i: number, b: number): boolean => {
        const ew = slots[i].ew;
        return ew !== undefined && ew - 1 === b;
    };

    // The nearest work before x in its flow with a wave later than k:
    // earlier siblings first, then those of each enclosing container. The
    // walk stops at a date pin, which cuts the flow.
    const laterBefore = (x: number, k: number): number | undefined => {
        for (let u = x; !slots[u].pinned; ) {
            const prev = slots[u].prev;
            if (prev < 0) {
                if (!hasParentEdge(u)) return undefined;
                u = slots[u].parent;
                continue;
            }
            const ew = slots[prev].ew;
            if (ew !== undefined && ew > k) return prev;
            u = prev;
        }
        return undefined;
    };

    const runOf = new Map<number, OrderReport>();
    const reports: OrderReport[] = [];
    const reportByKey = new Map<string, OrderReport>();
    const propKeyOf = (owner: number, prop: EntityProperty, ref: string): string =>
        `${owner}:${slots[owner].node.properties.indexOf(prop)}:${ref}`;

    const causeOf = (x: number, b: number): Cause | undefined => {
        const causes: Cause[] = [];
        let u = x;
        for (;;) {
            const terms = achieversS(u, b);
            for (const term of terms) {
                if (term.kind === 'after-wave') {
                    causes.push({
                        variant: 'after-wave',
                        owner: u,
                        prop: term.prop,
                        ref: term.ref,
                    });
                } else if (term.kind === 'after') {
                    if (ownConstant(term.from, b)) {
                        causes.push({
                            variant: 'after-item',
                            owner: u,
                            prop: term.prop,
                            ref: term.ref,
                        });
                    }
                } else if (term.kind === 'seq') {
                    const p = term.from;
                    const pNode = slots[p].node;
                    if (isParallelBlock(pNode) && slots[p].ew === undefined) {
                        const found = ownWaveOrigin(p, b);
                        const track =
                            found &&
                            (nameOf(slots[found.via].node) ?? nameOf(slots[found.origin].node));
                        if (track) causes.push({ variant: 'join', owner: u, block: p, track });
                    } else if (ownConstant(p, b)) {
                        const ref = predRef(pNode);
                        if (ref) causes.push({ variant: 'sequence', owner: u, pred: p, ref });
                    }
                }
            }
            const up = terms.find(
                (t): t is Extract<Term, { kind: 'parent' }> => t.kind === 'parent',
            );
            if (!up) break;
            u = up.from;
        }
        for (const variant of PREFERENCE) {
            const found = causes.find((c) => c.variant === variant);
            if (found) return found;
        }
        return undefined;
    };

    // Backward search over the achieving terms from S(x), stopping at
    // explained violations. Either a path from a constant (the chain), or
    // the first explained violation when every path goes through one.
    const searchBack = (
        x: number,
        b: number,
    ): { path: number[]; origin: string } | { hit: number | undefined } => {
        const nodes: Array<{ key: number; from: number }> = [{ key: 2 * x, from: -1 }];
        const seen = new Set<number>([2 * x]);
        let hit: number | undefined;
        const push = (key: number, from: number): void => {
            if (seen.has(key)) return;
            seen.add(key);
            nodes.push({ key, from });
        };
        for (let q = 0; q < nodes.length; q++) {
            const i = nodes[q].key >> 1;
            if (i !== x && runOf.has(i)) {
                hit ??= i;
                continue;
            }
            if ((nodes[q].key & 1) === 1) {
                for (const term of achieversE(i, b)) {
                    if (term.kind === 'start') push(2 * i, q);
                    else if (term.kind === 'child') push(2 * term.from + 1, q);
                }
                continue;
            }
            const terms = achieversS(i, b);
            const constant =
                terms.find((t) => t.kind === 'wave' || t.kind === 'lead') ??
                terms.find((t) => t.kind === 'after-wave');
            if (constant) {
                const path: number[] = [];
                for (let n = q; n >= 0; n = nodes[n].from) {
                    const s = nodes[n].key >> 1;
                    if (path[path.length - 1] !== s) path.push(s);
                }
                const label = displayName(slots[i].node);
                return {
                    path,
                    origin:
                        constant.kind === 'after-wave'
                            ? `${label} (after:${constant.ref})`
                            : `${label} (wave "${waveName(b + 1)}")`,
                };
            }
            for (const term of terms) {
                if (term.kind === 'parent') push(2 * term.from, q);
                else if (term.kind === 'seq' || term.kind === 'after') push(2 * term.from + 1, q);
            }
        }
        return { hit };
    };

    // The NL.E1103 report for a violation x in wave k whose root cause is
    // `cause`.
    const makeReport = (cause: Cause, x: number, k: number, b: number): OrderReport => {
        const name = displayName(slots[x].node);
        const wave = waveName(k);
        const refWave = waveName(b + 1);
        const owner = slots[cause.owner].node;
        const container =
            cause.owner === x ? undefined : containerRef(owner as GroupBlock | ParallelBlock);
        switch (cause.variant) {
            case 'after-wave': {
                // The container form names the container's wave, so a
                // container without one gets the item form, still on its
                // after:.
                const named = slots[cause.owner].ew === undefined ? undefined : container;
                return {
                    node: cause.prop,
                    run: [x],
                    build: () => ({
                        reason: 'after-wave',
                        name,
                        wave,
                        refId: cause.ref,
                        ...(named ? { container: named } : {}),
                    }),
                };
            }
            case 'after-item':
                return {
                    node: cause.prop,
                    run: [x],
                    build: () => ({
                        reason: 'after-item',
                        name,
                        wave,
                        refId: cause.ref,
                        ref: cause.ref,
                        refWave,
                        ...(container ? { container } : {}),
                    }),
                };
            case 'join': {
                const block = slots[cause.block];
                return {
                    node: slots[x].node,
                    run: [x],
                    build: () => ({
                        reason: 'join',
                        name,
                        wave,
                        block: flowRef(block.node as ParallelBlock),
                        flow: flowRef(flowOf(slots, lanes, cause.block)),
                        track: cause.track,
                        trackWave: refWave,
                    }),
                };
            }
            case 'sequence': {
                const p = cause.pred;
                const flowNode = slots[p].parent;
                // List the run's items that sit in p's flow; the advice moves
                // p below the last of them.
                const inFlow = (i: number): boolean => {
                    if (flowNode < 0) return slots[i].lane === slots[p].lane;
                    for (let a = slots[i].parent; a >= 0; a = slots[a].parent) {
                        if (a === flowNode) return true;
                    }
                    return false;
                };
                return {
                    node: slots[x].node,
                    run: [x],
                    build: (run) => {
                        const listed = run.filter(inFlow);
                        return {
                            reason: 'sequence',
                            items: listed.map((i) => displayName(slots[i].node)),
                            itemWave: wave,
                            ref: cause.ref,
                            refWave: waveName(slots[p].ew ?? b + 1),
                            flow: flowRef(flowOf(slots, lanes, p)),
                            last: displayName(slots[listed[listed.length - 1]].node),
                        };
                    },
                    seq: { pred: p, ref: cause.ref, inFlow },
                };
            }
        }
    };

    const addReport = (key: string | undefined, report: OrderReport): OrderReport => {
        reports.push(report);
        if (key !== undefined) reportByKey.set(key, report);
        return report;
    };

    // Add violation x (wave k, bound b) to the report for `cause`, or start
    // it. A `sequence` report is kept per predecessor and wave: its message
    // names one wave for every item it lists. A `join` report is kept per
    // block and wave: its message names the first affected item of a wave.
    const joinCause = (cause: Cause, x: number, k: number, b: number): OrderReport => {
        const key =
            cause.variant === 'sequence'
                ? `sequence:${cause.pred}:${k}`
                : cause.variant === 'join'
                  ? `join:${cause.block}:${k}`
                  : `${cause.variant}:${propKeyOf(cause.owner, cause.prop, cause.ref)}`;
        const report = reportByKey.get(key);
        if (!report) return addReport(key, makeReport(cause, x, k, b));
        report.run.push(x);
        return report;
    };

    for (let x = 0; x < slots.length; x++) {
        const slot = slots[x];
        const k = slot.ew;
        if (slot.node.$type !== 'ItemDeclaration' || k === undefined || valS[x] < k) continue;
        const b = valS[x];
        const cause = causeOf(x, b);

        let report: OrderReport | undefined;
        if (cause) {
            report = joinCause(cause, x, k, b);
        } else {
            const back = searchBack(x, b);
            if ('path' in back) {
                const labels = back.path
                    .slice(1)
                    .filter((i) => !isContainer(i) || nameOf(slots[i].node) !== undefined)
                    .map((i) => displayName(slots[i].node));
                const chain = [back.origin, ...labels.filter((l, n) => labels[n - 1] !== l)];
                const name = displayName(slot.node);
                const wave = waveName(k);
                report = addReport(undefined, {
                    node: slot.node,
                    run: [x],
                    build: () => ({ reason: 'chain', name, wave, chain }),
                });
            } else {
                // Cascade: fold into the run of the violation it comes from.
                // An item a sequence run would list is listed after the
                // nearest earlier work in its flow with a later wave (at
                // worst the run's own predecessor), in that predecessor's run
                // for its own wave: the message names one wave, and moving
                // the predecessor below the run then clears what it lists.
                const hit = back.hit === undefined ? undefined : runOf.get(back.hit);
                const seq = hit?.seq;
                if (seq?.inFlow(x)) {
                    const q = laterBefore(x, k);
                    const ref = q === undefined ? undefined : predRef(slots[q].node);
                    const own: Cause =
                        q !== undefined && ref !== undefined
                            ? { variant: 'sequence', owner: x, pred: q, ref }
                            : { variant: 'sequence', owner: x, pred: seq.pred, ref: seq.ref };
                    report = joinCause(own, x, k, b);
                } else {
                    report = hit;
                    report?.run.push(x);
                }
            }
        }
        if (report) runOf.set(x, report);
    }

    for (const report of reports) {
        findings.push({
            severity: 'error',
            code: 'NL.E1103',
            args: report.build(report.run),
            node: report.node,
        });
    }
    return findings;
}

// The flow that holds slot i: its enclosing group or parallel, or its lane.
function flowOf(
    slots: readonly Slot[],
    lanes: readonly SwimlaneDeclaration[],
    i: number,
): SwimlaneDeclaration | GroupBlock | ParallelBlock {
    const parent = slots[i].parent;
    return parent < 0 ? lanes[slots[i].lane] : (slots[parent].node as GroupBlock | ParallelBlock);
}

// The innermost flow that strictly holds both a and b (same lane).
function commonFlow(
    slots: readonly Slot[],
    lanes: readonly SwimlaneDeclaration[],
    a: number,
    b: number,
): SwimlaneDeclaration | GroupBlock | ParallelBlock {
    const holdsB = new Set<number>();
    for (let n = slots[b].parent; n >= 0; n = slots[n].parent) holdsB.add(n);
    for (let n = slots[a].parent; n >= 0; n = slots[n].parent) {
        if (holdsB.has(n)) return slots[n].node as GroupBlock | ParallelBlock;
    }
    return lanes[slots[a].lane];
}

// True when the reference `key:ref` on the entity `id` closes an explicit
// after:/before: cycle, the graph `checkCircularDependencies` walks: after:r
// on v is the edge v -> r, before:r on v is r -> v. Lanes and the milestones
// the scope references take part, as they do there.
function cycleTest(
    slots: readonly Slot[],
    lanes: readonly SwimlaneDeclaration[],
    lookup: WaveRefLookup,
): (id: string | undefined, key: 'after' | 'before', ref: string) => boolean {
    const edges = new Map<string, Set<string>>();
    const addEdge = (from: string, to: string): void => {
        const set = edges.get(from) ?? new Set<string>();
        set.add(to);
        edges.set(from, set);
    };
    const pending: string[] = [];
    const index = (id: string | undefined, props: readonly EntityProperty[]): void => {
        if (!id) return;
        for (const prop of props) {
            const key = propKey(prop);
            if (key !== 'after' && key !== 'before') continue;
            for (const ref of refValues(prop)) {
                if (DATE_RE.test(ref)) continue;
                if (key === 'after') addEdge(id, ref);
                else addEdge(ref, id);
                pending.push(ref);
            }
        }
    };
    for (const lane of lanes) index(lane.name, lane.properties);
    for (const slot of slots) index(slot.node.name, slot.node.properties);
    const seenMilestones = new Set<string>();
    while (pending.length > 0) {
        const ref = pending.pop() as string;
        if (seenMilestones.has(ref)) continue;
        seenMilestones.add(ref);
        const decl = lookup(ref);
        if (isMilestoneDeclaration(decl)) index(decl.name, decl.properties);
    }
    const reaches = (from: string, to: string): boolean => {
        const seen = new Set<string>([from]);
        const stack = [from];
        while (stack.length > 0) {
            const n = stack.pop() as string;
            if (n === to) return true;
            for (const next of edges.get(n) ?? []) {
                if (!seen.has(next)) {
                    seen.add(next);
                    stack.push(next);
                }
            }
        }
        return false;
    };
    return (id, key, ref) => {
        if (!id) return false;
        return key === 'after' ? reaches(ref, id) : reaches(id, ref);
    };
}
