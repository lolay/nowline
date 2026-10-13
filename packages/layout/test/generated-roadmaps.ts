// A seeded generator of roadmaps with waves, shared by the barrier theorem
// (waves.test.ts) and the schedule extent oracle (schedule-extent.test.ts).
//
// It writes roadmaps that satisfy the order rules
// (specs/waves.md §6.3): in every lane, group and parallel-track flow the
// assigned waves never decrease, background items carry the running bound,
// and `after:` only targets earlier work (or earlier waves) whose bound a
// member's own wave can absorb. Each node tracks WV10's lower bound `lb`
// (start >= E_lb), so a member of wave k is only placed where lb <= k - 1.

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface Generated {
    source: string;
    /** Every item id and its wave (0 for background). */
    waves: Map<string, number>;
}

export function generateRoadmap(rand: () => number, index: number): Generated {
    const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
    const chance = (p: number): boolean => rand() < p;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

    const n = int(1, 4);
    const durations = ['1d', '3d', '1w', '2w', '3w', '4w'];
    const lines: string[] = [
        'nowline v1',
        '',
        `roadmap gen-${index} "Generated" start:2026-01-05 scale:1w`,
        '',
    ];
    for (let k = 1; k <= n; k++) lines.push(`wave w${k} "Wave ${k}"`);
    lines.push('');

    const waves = new Map<string, number>();
    // Earlier items, in placement order, with their lower bound.
    const placed: Array<{ id: string; lb: number }> = [];
    let nextId = 0;

    // `after:` refs whose bound stays within `maxLb`.
    const afterRefs = (maxLb: number): { refs: string[]; lb: number } => {
        const refs: string[] = [];
        let lb = 0;
        const count = chance(0.3) ? int(1, 2) : 0;
        for (let i = 0; i < count; i++) {
            if (chance(0.3) && maxLb >= 1) {
                const j = int(1, Math.min(n, maxLb));
                refs.push(`w${j}`);
                lb = Math.max(lb, j);
                continue;
            }
            const targets = placed.filter((p) => p.lb <= maxLb);
            if (targets.length === 0) continue;
            const t = pick(targets);
            if (refs.includes(t.id)) continue;
            refs.push(t.id);
            lb = Math.max(lb, t.lb);
        }
        return { refs, lb };
    };

    // One item; `inherited` is the container's wave (0: none). Returns lbE.
    const genItem = (indent: string, bound: number, inherited: number): number => {
        const id = `i${nextId++}`;
        let k = inherited;
        if (k === 0 && bound + 1 <= n && chance(0.75)) k = int(bound + 1, n);
        const maxLb = k > 0 ? k - 1 : n;
        const { refs, lb } = afterRefs(maxLb);
        const parts = [`${indent}item ${id} duration:${pick(durations)}`];
        if (k > 0 && inherited === 0) parts.push(`wave:w${k}`);
        if (refs.length === 1) parts.push(`after:${refs[0]}`);
        if (refs.length > 1) parts.push(`after:[${refs.join(', ')}]`);
        lines.push(parts.join(' '));
        const lbS = Math.max(bound, k > 0 ? k - 1 : 0, lb);
        waves.set(id, k);
        placed.push({ id, lb: lbS });
        return lbS;
    };

    // A flow of children (lane, group); returns its lbE.
    const genFlow = (indent: string, bound: number, inherited: number, depth: number): number => {
        let b = bound;
        const count = int(1, depth === 0 ? 5 : 3);
        for (let i = 0; i < count; i++) {
            const r = rand();
            if (depth < 2 && r < 0.12) b = genGroup(indent, b, inherited, depth);
            else if (depth < 2 && r < 0.24) b = genParallel(indent, b, inherited, depth);
            else b = genItem(indent, b, inherited);
        }
        return b;
    };

    const containerWave = (bound: number, inherited: number): number => {
        if (inherited > 0) return inherited;
        return bound + 1 <= n && chance(0.4) ? int(bound + 1, n) : 0;
    };

    const genGroup = (indent: string, bound: number, inherited: number, depth: number): number => {
        const k = containerWave(bound, inherited);
        const title = chance(0.5) ? ` "Group ${nextId}"` : '';
        lines.push(`${indent}group${title}${k > 0 && inherited === 0 ? ` wave:w${k}` : ''}`);
        return genFlow(`${indent}  `, Math.max(bound, k > 0 ? k - 1 : 0), k, depth + 1);
    };

    const genParallel = (
        indent: string,
        bound: number,
        inherited: number,
        depth: number,
    ): number => {
        const k = containerWave(bound, inherited);
        lines.push(`${indent}parallel${k > 0 && inherited === 0 ? ` wave:w${k}` : ''}`);
        const start = Math.max(bound, k > 0 ? k - 1 : 0);
        let end = start;
        const tracks = int(2, 3);
        for (let t = 0; t < tracks; t++) {
            const track = chance(0.3)
                ? genGroup(`${indent}  `, start, k, depth + 1)
                : genItem(`${indent}  `, start, k);
            end = Math.max(end, track);
        }
        return end;
    };

    const lanes = int(1, 4);
    for (let l = 0; l < lanes; l++) {
        lines.push(`swimlane lane${l}`);
        genFlow('  ', 0, 0, 0);
    }
    lines.push('');
    return { source: lines.join('\n'), waves };
}
