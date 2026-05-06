// m5 — size + capacity duration derivation and remaining-literal
// normalization. These tests pin the layout-level contract:
//   1. `duration:LITERAL` is the calendar duration when set; if `size:`
//      is also present, it does not appear on the meta line (driver is
//      the literal only).
//   2. `size:NAME` alone derives `effort_days / capacity` (default cap = 1)
//      and the meta line shows the size chip only (bar width carries
//      calendar span).
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
            `nowline v1\n\nconfig\nsize md "Medium" effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:md\n`,
        );
        expect(sized.size).not.toBeNull();
        expect(sized.size?.name).toBe('md');
        expect(sized.size?.title).toBe('Medium');
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

describe('m6 — size chip on the meta line (driver-only)', () => {
    it('shows the size chip alone as driver when size: drives (no duration:)', async () => {
        // size:m, no title → chip text is "m" (case as typed). Derived
        // calendar span is encoded in bar width only — not duplicated in meta.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m\n`,
        );
        expect(item.metaText).toBe('m');
    });

    it('uses the size title when provided (author opt-in for a custom chip label)', async () => {
        // `size m "M"` is the canonical t-shirt opt-in: title takes
        // precedence over the id so authors who want uppercase get
        // it explicitly, without the layout folding case on its own.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m "M" effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m\n`,
        );
        expect(item.metaText).toBe('M');
    });

    it('preserves the id case as typed when no title is set', async () => {
        // Non-t-shirt naming (`med`, `MED`, `Med`) round-trips into the
        // chip with the author's casing intact. Authors who hate
        // shouty MED can keep `size med`; authors who love it can
        // declare `size MED` directly.
        const lower = await firstItem(
            `nowline v1\n\nconfig\nsize med effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:med\n`,
        );
        expect(lower.metaText).toBe('med');
        const upper = await firstItem(
            `nowline v1\n\nconfig\nsize MED effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:MED\n`,
        );
        expect(upper.metaText).toBe('MED');
    });

    it('shows chip only after dividing effort by capacity (derived span not in meta)', async () => {
        // effort:1w (5d) ÷ capacity:5 = 1d on the calendar — bar encodes
        // it; meta shows the driver chip only.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m capacity:5\n`,
        );
        expect(item.metaText).toBe('m');
    });

    it('uses duration literal as sole meta driver when both size: and duration: are set', async () => {
        // duration: wins for the bar AND meta — no chip on the line.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg duration:2w capacity:2\n`,
        );
        expect(item.metaText).toBe('2w');
    });

    it('puts [driver] before capacity suffix width accounting (metaText is chip only)', async () => {
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m capacity:2\n`,
        );
        expect(item.metaText).toBe('m');
        expect(item.capacity?.text).toBe('2');
        expect(item.capacity?.icon).toEqual({ kind: 'builtin', name: 'multiplier' });
    });

    it('omits the chip entirely for items without size:', async () => {
        const item = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(item.metaText).toBe('1w');
    });

    it('composes driver then owner on the meta line', async () => {
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\nperson alice "Alice"\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg owner:alice status:done\n`,
        );
        expect(item.metaText).toBe('lg Alice');
    });

    it('shows duration driver before owner when duration: drives', async () => {
        const item = await firstItem(
            `nowline v1\n\nperson bob "Bob"\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w owner:bob status:done\n`,
        );
        expect(item.metaText).toBe('1w Bob');
    });

    it('shows duration before owner when size: + duration: override (no chip)', async () => {
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize xl effort:4w\nperson carl "Carl"\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:xl duration:1w owner:carl status:done\n`,
        );
        expect(item.metaText).toBe('1w Carl');
    });

    it('in-progress remaining literal follows chip-only driver when sized', async () => {
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize lg "L" effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg capacity:2 status:in-progress remaining:1w\n`,
        );
        expect(item.metaText).toBe('L — 1w remaining');
    });
});

