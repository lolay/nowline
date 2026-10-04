// The wave plan of a resolved roadmap (specs/waves.md §5.1, §7.3), and the
// locale helper for coded resolver diagnostics (§7.4). Layout (engines A, B
// and C) and the exporters read waves through `buildWavePlan` so they agree
// on membership and floors.

import type { AstNode } from 'langium';
import type { SwimlaneDeclaration, WaveDeclaration } from '../generated/ast.js';
import { isItemDeclaration } from '../generated/ast.js';
import type { MessageArgs } from '../i18n/index.js';
import { tr } from '../i18n/index.js';
import type { ResolveDiagnostic, ResolveResult } from './include-resolver.js';
import { resolvedContentLookup } from './include-waves.js';
import { assignWaves, waveFloorDate } from './waves.js';

/**
 * A resolver diagnostic's text in `locale`: the coded message when the
 * diagnostic carries a code, else its fixed (en-US) message.
 */
export function localizeResolveDiagnostic(locale: string, d: ResolveDiagnostic): string {
    if (d.code === undefined) return d.message;
    // `args` is the rest tuple `acceptTr` stores; the code union does not
    // narrow through the generic, so widen it to one code here.
    return tr(locale, d.code as 'NL.E0202', ...((d.args ?? []) as MessageArgs<'NL.E0202'>));
}

/** A wave's start floor `A_k`: the date and the `after:` element that set it. */
export interface WaveFloor {
    date: string;
    ref: string;
}

/**
 * Waves of a resolved roadmap. Wave indices are **1-based**, as in §5.1
 * (`w_1 … w_n`): wave k is `waves[k - 1]`.
 */
export interface WavePlan {
    /** The root's waves in declaration order. */
    waves: readonly WaveDeclaration[];
    /** Wave id to its 1-based index. */
    index: ReadonlyMap<string, number>;
    /** `A_k` for wave k at `floors[k - 1]`, resolved against the merged content; null: no floor. */
    floors: ReadonlyArray<WaveFloor | null>;
    /**
     * `ew(x)`, 1-based, for every item, group and parallel layout places (the
     * main lanes and each first-level isolated region) that has an effective
     * wave. Absent: background work.
     */
    waveOf: WeakMap<AstNode, number>;
    /** `lw(x)`, 1-based, for every such node with a lead wave. */
    leadOf: WeakMap<AstNode, number>;
    /** The 1-based wave of a member (a leaf item with an effective wave), else undefined. */
    memberWave(node: AstNode): number | undefined;
    /** True for a member of wave `k` (1-based), or of any wave when `k` is omitted. */
    isMember(node: AstNode, k?: number): boolean;
}

/**
 * The wave plan of a resolved roadmap, or undefined when the root declares
 * no waves (callers then do nothing). Membership covers the merged main
 * lanes and each first-level isolated region; a region's `wave:x` maps to the
 * root's wave with the same id, which include rule 12 guarantees exists.
 */
export function buildWavePlan(resolved: ResolveResult): WavePlan | undefined {
    const { content } = resolved;
    const waves = [...(content.waves?.values() ?? [])];
    if (waves.length === 0) return undefined;

    const index = new Map<string, number>();
    waves.forEach((w, i) => {
        index.set(w.name as string, i + 1);
    });
    const lookup = resolvedContentLookup(content);
    const floors = waves.map((w) => waveFloorDate(w, lookup));

    const waveOf = new WeakMap<AstNode, number>();
    const leadOf = new WeakMap<AstNode, number>();
    const assign = (lanes: readonly SwimlaneDeclaration[]): void => {
        const a = assignWaves(lanes, index);
        for (const [node, k] of a.waveOf) waveOf.set(node, k);
        for (const [node, k] of a.leadOf) leadOf.set(node, k);
    };
    assign([...content.swimlanes.values()]);
    for (const region of content.isolatedRegions) {
        assign([...region.content.swimlanes.values()]);
    }

    const memberWave = (node: AstNode): number | undefined =>
        isItemDeclaration(node) ? waveOf.get(node) : undefined;
    return {
        waves,
        index,
        floors,
        waveOf,
        leadOf,
        memberWave,
        isMember: (node, k) => {
            const w = memberWave(node);
            return w !== undefined && (k === undefined || w === k);
        },
    };
}
