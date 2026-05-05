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

describe('m6 — size chip on the meta line', () => {
    it('prefixes metaText with the size id verbatim when no title is provided', async () => {
        // size:m, no title → chip text is "m" (case as typed). The
        // derived calendar duration of 1w shows beside it.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m\n`,
        );
        expect(item.metaText).toBe('m 1w');
    });

    it('uses the size title when provided (author opt-in for a custom chip label)', async () => {
        // `size m "M"` is the canonical t-shirt opt-in: title takes
        // precedence over the id so authors who want uppercase get
        // it explicitly, without the layout folding case on its own.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m "M" effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m\n`,
        );
        expect(item.metaText).toBe('M 1w');
    });

    it('preserves the id case as typed when no title is set', async () => {
        // Non-t-shirt naming (`med`, `MED`, `Med`) round-trips into the
        // chip with the author's casing intact. Authors who hate
        // shouty MED can keep `size med`; authors who love it can
        // declare `size MED` directly.
        const lower = await firstItem(
            `nowline v1\n\nconfig\nsize med effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:med\n`,
        );
        expect(lower.metaText).toBe('med 1w');
        const upper = await firstItem(
            `nowline v1\n\nconfig\nsize MED effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:MED\n`,
        );
        expect(upper.metaText).toBe('MED 1w');
    });

    it('reflects the derived calendar duration, not the raw effort literal', async () => {
        // effort:1w (5d) ÷ capacity:5 = 1d on the calendar. Meta must
        // read "m 1d" — showing the size's effort literal here would
        // mislead readers about the bar's actual width.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m effort:1w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m capacity:5\n`,
        );
        expect(item.metaText).toBe('m 1d');
    });

    it('keeps the explicit duration: literal verbatim and still shows the chip', async () => {
        // duration: wins for the bar; the chip is annotation-only per
        // specs/dsl.md "Sizing precedence" → "lg 2w" even when the
        // size would otherwise have derived a different value.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg duration:2w capacity:2\n`,
        );
        expect(item.metaText).toBe('lg 2w');
    });

    it('renders the on-bar reading order as [size chip] [duration] [capacity suffix]', async () => {
        // Capacity suffix paints separately AFTER metaText (renderer
        // uses metaText width as its x offset); we just need to confirm
        // metaText itself ends right where the suffix expects to begin.
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize m effort:2w\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:m capacity:2\n`,
        );
        expect(item.metaText).toBe('m 1w');
        expect(item.capacity?.text).toBe('2');
        expect(item.capacity?.icon).toEqual({ kind: 'builtin', name: 'multiplier' });
    });

    it('omits the chip entirely for items without size:', async () => {
        const item = await firstItem(
            `nowline v1\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a duration:1w\n`,
        );
        expect(item.metaText).toBe('1w');
    });

    it('keeps the chip when meta is owner-led (done item with owner)', async () => {
        // Done items drop the duration from meta — only the owner
        // shows. The size chip still annotates the item's effort
        // budget so a quick scan still tells you "this large piece is
        // owned by Alice".
        const item = await firstItem(
            `nowline v1\n\nconfig\nsize lg effort:2w\nperson alice "Alice"\n\nroadmap r start:2026-01-05\n\nswimlane s\n  item a size:lg owner:alice status:done\n`,
        );
        expect(item.metaText).toBe('lg Alice');
    });
});

