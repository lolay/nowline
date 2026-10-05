// Positioned waves (specs/waves.md §8.7): the solved spans engine A's
// barrier driver settled on, in declaration order. Built from the frozen
// `WaveLayoutState` after the post-layout extent growth, so the dates read
// the final scale. Growth only extends the domain end (origin and
// pixels-per-day are unchanged), so the spans' x never move.

import type { LayoutContext } from '../layout-context.js';
import type { PositionedWave } from '../types.js';
import { summarizeWaves } from '../wave-barrier.js';
import { dateAtX, WAVE_EDGE_TOLERANCE_PX, type WaveLayoutState } from '../wave-layout.js';

/**
 * One `PositionedWave` per declared wave. `state` must be frozen: its
 * `pass` is the pass that ran with the solved `S`/`E`, so its member
 * counts cover the main lanes and the first-level regions exactly once
 * (later placements never accumulate).
 */
export function buildWaves(state: WaveLayoutState, ctx: LayoutContext): PositionedWave[] {
    if (!state.frozen || !state.solve) {
        throw new Error('buildWaves: the wave barrier has not settled');
    }
    const spans = summarizeWaves(
        state.plan,
        state.solve,
        state.pass,
        state.origin,
        state.floors,
        WAVE_EDGE_TOLERANCE_PX,
    );
    return spans.map((span, i) => {
        const decl = state.plan.waves[i];
        const wave: PositionedWave = {
            id: span.id,
            title: decl.title ?? span.id,
            index: i,
            startX: span.start,
            endX: span.end,
            startDate: dateAtX(span.start, ctx),
            endDate: dateAtX(span.end, ctx),
            memberCount: span.memberCount,
            empty: span.memberCount === 0,
        };
        if (span.heldBy !== undefined) wave.heldBy = span.heldBy;
        if (span.floorRef !== undefined) wave.floorRef = span.floorRef;
        return wave;
    });
}
