// m5 — size + capacity duration derivation and remaining-literal
// normalization. These tests pin the layout-level contract:
//   1. `duration:LITERAL` is the calendar duration; `size:NAME` (if also
//      present) is annotation only (the bar paints `duration`).
//   2. `size:NAME` alone derives `effort_days / capacity` (default cap = 1).
//   3. `remaining:LITERAL` is single-engineer days and normalizes to a
//      0..1 progress fraction against the item's total single-engineer
//      effort (`size.effortDays`, OR `duration_days × capacity`).
//   4. Overflow (remaining > total) clamps the progress to "fully
//      remaining" (progressFraction === 0).
//
// The width assertions go through ratios, not absolute pixel values, so
// the tests survive timeline-scale tweaks and pixel-per-day rounding.

import { describe, it, expect } from 'vitest';
import { layoutRoadmap } from '../src/index.js';
import type { PositionedItem } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

async function firstItem(src: string): Promise<PositionedItem> {
    const { file, resolved } = await parseAndResolve(src);
    const model = layoutRoadmap(file, resolved, { theme: 'light' });
    return model.swimlanes[0].children[0] as PositionedItem;
}

describe('m5 — size + capacity duration derivation', () => {
    it('derives item duration as effort ÷ capacity (default capacity = 1)', async () => {
        // size lg effort:2w → 10d. capacity:1 (default) → bar is 10d wide.
        // Cross-check against an item that pins 10d directly via duration:.
        const sized = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg\n`,
        );
        const literal = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:2w\n`,
        );
        expect(sized.box.width).toBe(literal.box.width);
    });

    it('divides effort by capacity for the team-calendar duration', async () => {
        // size lg effort:2w (10d single-engineer) ÷ capacity:2 → 5d on
        // the calendar. Same width as a 1w duration literal.
        const team = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg capacity:2\n`,
        );
        const oneWeek = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(team.box.width).toBe(oneWeek.box.width);
    });

    it('treats duration: literal as the calendar duration even when size: is also set', async () => {
        // duration:3d wins; size:sm is annotation only. Bar matches the
        // bare 3d literal even though effort would otherwise pin 5d.
        const both = await firstItem(
            `nowline v1\n\nconfig\nsize sm effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:sm duration:3d\n`,
        );
        const literal = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:3d\n`,
        );
        expect(both.box.width).toBe(literal.box.width);
    });

    it('exposes ResolvedSize on PositionedItem when sized; null otherwise', async () => {
        const sized = await firstItem(
            `nowline v1\n\nconfig\nsize md effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:md\n`,
        );
        expect(sized.size).not.toBeNull();
        expect(sized.size?.name).toBe('md');
        expect(sized.size?.effortLiteral).toBe('2w');
        expect(sized.size?.effortDays).toBe(10);

        const plain = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(plain.size).toBeNull();
    });
});

describe('m5 — remaining: literal normalizes against single-engineer effort', () => {
    it('halves a sized item via a remaining literal equal to half its effort', async () => {
        // size lg effort:2w (10 single-engineer days). remaining:1w (5d)
        // → progress = 1 - 5/10 = 0.5.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg status:in-progress remaining:1w\n`,
        );
        expect(item.progressFraction).toBeCloseTo(0.5, 5);
    });

    it('uses duration × capacity as total effort for duration-literal items', async () => {
        // duration:1w (5d) × capacity:2 = 10 single-engineer days total.
        // remaining:1w (5d) → progress = 1 - 5/10 = 0.5.
        const item = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w capacity:2 status:in-progress remaining:1w\n`,
        );
        expect(item.progressFraction).toBeCloseTo(0.5, 5);
    });

    it('clamps to 0 progress when the remaining literal exceeds total effort (warn-and-clamp)', async () => {
        // duration:1w (5d) total. remaining:5w (25d) > total → clamp
        // to 0% complete. The validator surfaces the warning; the
        // layout simply paints "fully remaining".
        const item = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w status:in-progress remaining:5w\n`,
        );
        expect(item.progressFraction).toBe(0);
    });

    it('still accepts the percent form on remaining: with the same semantics', async () => {
        // Sanity check: percent form is unchanged. remaining:50% on an
        // in-progress item → progress = 0.5 regardless of effort math.
        const item = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:2w status:in-progress remaining:50%\n`,
        );
        expect(item.progressFraction).toBeCloseTo(0.5, 5);
    });
});
