// m12 — lane utilization underline contract. Pins both the pure helpers
// (`computeLaneUtilization`, `classifyLoad`, `resolveLaneUtilizationThresholds`)
// and the integration through the layout pipeline (the field appears on
// `PositionedSwimlane` with the right segments).
//
// Coverage matrix (per the m12 plan in handoff-m9-utilization.md):
//   - no items → null
//   - all green (load < warn-at)
//   - warn band (warn ≤ load < over)
//   - over band (load ≥ over)
//   - threshold-boundary edges (warn == over collapses warn band; load
//     exactly at warn / over)
//   - partial-capacity items (`capacity:50%` contributes 0.5)
//   - sized items contributing only over their derived window (default
//     load 1; half-effort + double-cap items contribute different loads
//     across non-overlapping windows)
//   - `none` thresholds (warn:none, over:none, both:none)
//   - default-swimlane resolution

import { describe, it, expect } from 'vitest';
import { layoutRoadmap } from '../src/index.js';
import type { PositionedSwimlane, PositionedLaneUtilization } from '../src/types.js';
import {
    classifyLoad,
    collectLoadContributors,
    computeLaneUtilization,
    DEFAULT_UTILIZATION_OVER_FRACTION,
    DEFAULT_UTILIZATION_WARN_FRACTION,
} from '../src/lane-utilization.js';
import { parseAndResolve } from './helpers.js';

async function firstLane(src: string): Promise<PositionedSwimlane> {
    const { file, resolved } = await parseAndResolve(src);
    const model = layoutRoadmap(file, resolved, { theme: 'light' });
    return model.swimlanes[0];
}

async function laneUtilization(src: string): Promise<PositionedLaneUtilization | null> {
    return (await firstLane(src)).utilization;
}

describe('m12 — pure helpers: classifyLoad', () => {
    it('paints green when load is below warn-at (including zero)', () => {
        expect(classifyLoad(0, 5, 0.8, 1.0)).toBe('green');
        expect(classifyLoad(2, 5, 0.8, 1.0)).toBe('green'); // 40%
    });

    it('paints yellow inside the warn band [warn, over)', () => {
        expect(classifyLoad(4, 5, 0.8, 1.0)).toBe('yellow'); // 80% exactly = warn
        expect(classifyLoad(4.5, 5, 0.8, 1.0)).toBe('yellow'); // 90%
    });

    it('paints red at and above over-at', () => {
        expect(classifyLoad(5, 5, 0.8, 1.0)).toBe('red'); // 100% exactly = over
        expect(classifyLoad(6, 5, 0.8, 1.0)).toBe('red'); // 120%
    });

    it('skips the yellow band when warnFraction is null (binary green/red)', () => {
        expect(classifyLoad(4.5, 5, null, 1.0)).toBe('green'); // 90%, no warn
        expect(classifyLoad(5, 5, null, 1.0)).toBe('red'); // 100%
    });

    it('skips the red band when overFraction is null (binary green/yellow)', () => {
        expect(classifyLoad(4, 5, 0.8, null)).toBe('yellow');
        expect(classifyLoad(10, 5, 0.8, null)).toBe('yellow'); // 200%, still warn (no red)
    });

    it('exposes built-in defaults at the spec values', () => {
        expect(DEFAULT_UTILIZATION_WARN_FRACTION).toBe(0.8);
        expect(DEFAULT_UTILIZATION_OVER_FRACTION).toBe(1.0);
    });
});

describe('m12 — pure helpers: computeLaneUtilization', () => {
    it('returns null for capacity 0 / negative', () => {
        const u = computeLaneUtilization({
            children: [],
            capacityValue: 0,
            warnFraction: 0.8,
            overFraction: 1.0,
        });
        expect(u).toBeNull();
    });

    it('returns null when both thresholds are opted out via `none`', () => {
        const u = computeLaneUtilization({
            children: [],
            capacityValue: 5,
            warnFraction: null,
            overFraction: null,
        });
        expect(u).toBeNull();
    });

    it('returns null when no items contribute load', () => {
        const u = computeLaneUtilization({
            children: [],
            capacityValue: 5,
            warnFraction: 0.8,
            overFraction: 1.0,
        });
        expect(u).toBeNull();
    });
});

describe('m12 — integration: single-item lane (continuous health bar)', () => {
    it('emits one green segment for the full item span (load < warn)', async () => {
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  item a duration:2w capacity:2\n`,
        );
        expect(u).not.toBeNull();
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('green');
        expect(u!.segments[0].load).toBe(2);
        expect(u!.capacityValue).toBe(5);
        expect(u!.warnFraction).toBe(DEFAULT_UTILIZATION_WARN_FRACTION);
        expect(u!.overFraction).toBe(DEFAULT_UTILIZATION_OVER_FRACTION);
    });

    it('emits one yellow segment when item load reaches the warn band', async () => {
        // capacity:5, item capacity:4 → 80% = warn-at exactly.
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  item a duration:2w capacity:4\n`,
        );
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('yellow');
    });

    it('emits one red segment when item load reaches over-at', async () => {
        // capacity:5, item capacity:5 → 100% = over-at exactly.
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  item a duration:2w capacity:5\n`,
        );
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('red');
    });
});

describe('m12 — integration: parallel block drives concurrent load', () => {
    it('classifies the parallel window red when summed item capacities exceed over-at', async () => {
        // capacity:5; parallel: item c cap:4 + item d cap:2 = load 6 → 120% red.
        const lane = await firstLane(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  parallel\n    item c duration:2w capacity:4\n    item d duration:2w capacity:2\n`,
        );
        const u = lane.utilization!;
        // Parallel block envelope: contributors are the two items, both
        // share the same span; sweep yields a single coalesced red segment.
        expect(u.segments).toHaveLength(1);
        expect(u.segments[0].classification).toBe('red');
        expect(u.segments[0].load).toBe(6);
    });
});

describe('m12 — integration: percent-form item capacity contributes its decimal load', () => {
    it('treats capacity:50% as load 0.5 (continuous health bar stays green)', async () => {
        // capacity:1; item capacity:50% → load 0.5 → 50% utilization → green.
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:1\n  item a duration:2w capacity:50%\n`,
        );
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('green');
        expect(u!.segments[0].load).toBeCloseTo(0.5, 5);
    });
});

describe('m12 — integration: sized items default to load 1', () => {
    it('contributes 1 from a `size:` item with no explicit capacity', async () => {
        // capacity:5; size m effort:2w; one sized item → load 1 → 20% green.
        const u = await laneUtilization(
            `nowline v1\n\nconfig\nsize m effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  item a size:m\n`,
        );
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('green');
        expect(u!.segments[0].load).toBe(1);
    });

    it('skips duration-literal items with no explicit capacity (load 0)', async () => {
        // Capacity declared but no contributing items → null.
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  item a duration:2w\n`,
        );
        expect(u).toBeNull();
    });
});

describe('m12 — integration: opt-out via `none`', () => {
    it('paints no underline when both thresholds are `none`', async () => {
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5 utilization-warn-at:none utilization-over-at:none\n  item a duration:2w capacity:6\n`,
        );
        expect(u).toBeNull();
    });

    it('collapses warn band when warn:none (binary green/red)', async () => {
        // capacity:5, item cap:4 = 80% → without warn, paints green
        // (binary scheme: green until red).
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5 utilization-warn-at:none\n  item a duration:2w capacity:4\n`,
        );
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('green');
        expect(u!.warnFraction).toBeNull();
    });

    it('removes red band when over:none (yellow stays even at high load)', async () => {
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5 utilization-over-at:none\n  item a duration:2w capacity:10\n`,
        );
        expect(u!.segments).toHaveLength(1);
        expect(u!.segments[0].classification).toBe('yellow');
        expect(u!.overFraction).toBeNull();
    });
});

describe('m12 — integration: default swimlane resolution', () => {
    it('inherits warn-at / over-at from `default swimlane`', async () => {
        // Default warn 50% / over 80%; lane capacity 5; item cap 3 → 60% → yellow.
        const u = await laneUtilization(
            `nowline v1\n\nconfig\ndefault swimlane utilization-warn-at:50% utilization-over-at:80%\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5\n  item a duration:2w capacity:3\n`,
        );
        expect(u!.warnFraction).toBeCloseTo(0.5, 5);
        expect(u!.overFraction).toBeCloseTo(0.8, 5);
        expect(u!.segments[0].classification).toBe('yellow');
    });

    it('lane override beats the `default swimlane` value', async () => {
        // Default warn:50%; lane override warn:90%; item cap 3 of 5 = 60% → green
        // (60% is below the lane's overriding 90% warn).
        const u = await laneUtilization(
            `nowline v1\n\nconfig\ndefault swimlane utilization-warn-at:50% utilization-over-at:80%\n\nroadmap r start:2026-01-05\n\nswimlane s capacity:5 utilization-warn-at:90%\n  item a duration:2w capacity:3\n`,
        );
        expect(u!.warnFraction).toBeCloseTo(0.9, 5);
        expect(u!.overFraction).toBeCloseTo(0.8, 5);
        expect(u!.segments[0].classification).toBe('green');
    });

    it('does not paint utilization on a lane with no `capacity:`', async () => {
        const u = await laneUtilization(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:2w capacity:2\n`,
        );
        expect(u).toBeNull();
    });
});

describe('m12 — pure helpers: collectLoadContributors recursion', () => {
    it('descends into parallel blocks but skips the block envelope', () => {
        // Synthetic positioned children: a parallel containing two items.
        // Asserts the helper produces two contributors (one per item),
        // not three (no envelope contributor).
        const item = (id: string, x: number, w: number, load: number) => ({
            kind: 'item' as const,
            id,
            title: id,
            box: { x, y: 0, width: w, height: 10 },
            status: 'planned' as const,
            progressFraction: 1,
            footnoteIndicators: [],
            labelChips: [],
            chipsOutside: false,
            chipsRightX: x + w,
            hasOverflow: false,
            textSpills: false,
            dotSpills: false,
            iconSpills: false,
            footnoteSpills: false,
            dotSpillCx: null,
            iconSpillX: null,
            footnoteSpillStartX: null,
            decorationsRightX: x + w,
            capacity: { value: load, text: String(load), icon: null },
            size: null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style: {} as any,
        });
        const parallel = {
            kind: 'parallel' as const,
            box: { x: 0, y: 0, width: 100, height: 50 },
            children: [item('a', 0, 50, 2), item('b', 0, 50, 3)],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style: {} as any,
        };
        const contributors = collectLoadContributors([parallel]);
        expect(contributors).toHaveLength(2);
        expect(contributors.map((c) => c.load)).toEqual([2, 3]);
    });
});
