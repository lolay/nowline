// `packMarkerRow` with marker-to-marker arrows (specs/rendering.md,
// Milestones, "Marker predecessors"): an arrow's run is reserved on its
// source's row, the target stays at or above the source, and a label keeps
// off its own arrow. With no arrows the pack is unchanged.

import { describe, expect, it } from 'vitest';
import { type MarkerEntity, packMarkerRow } from '../src/nodes/marker-band.js';

const width = (text: string): number => text.length * 6;

function marker(id: string, centerX: number): MarkerEntity {
    return { id, centerX, radius: 6, title: id, fontSize: 10, bold: false };
}

function pack(entries: MarkerEntity[], arrows: { from: string; to: string }[] = []) {
    const { placements, rowCount } = packMarkerRow(entries, 0, 1000, width, arrows);
    const row = (id: string): number => placements.get(id)?.rowIndex ?? Number.NaN;
    const side = (id: string): string | undefined => placements.get(id)?.labelSide;
    return { row, side, rowCount };
}

describe('packMarkerRow with marker arrows', () => {
    const entries = [marker('a', 100), marker('b', 200), marker('c', 300)];

    it('packs as before when there are no arrows', () => {
        const without = packMarkerRow(entries, 0, 1000, width);
        const empty = packMarkerRow(entries, 0, 1000, width, []);
        expect(empty).toEqual(without);
        expect(without.rowCount).toBe(1);
    });

    it("keeps other markers off an arrow's run", () => {
        const { row, rowCount } = pack(entries, [{ from: 'a', to: 'c' }]);
        expect(row('b')).not.toBe(row('a'));
        expect(rowCount).toBe(2);
    });

    it('keeps a slack target at or above its source', () => {
        const { row } = pack(entries, [{ from: 'a', to: 'c' }]);
        expect(row('c')).toBeLessThanOrEqual(row('a'));
    });

    it('keeps an overrun source at or below its target, growing a row below it', () => {
        // `b` overruns `a`'s date; `x` sits on b's run, on the bottom row.
        const { row, rowCount } = pack(
            [marker('a', 100), marker('x', 150), marker('b', 200)],
            [{ from: 'b', to: 'a' }],
        );
        expect(row('b')).toBeGreaterThanOrEqual(row('a'));
        expect(row('b')).not.toBe(row('x'));
        expect(rowCount).toBe(2);
    });

    it('puts a label on the side its own arrow does not run along', () => {
        const { side } = pack([marker('a', 100), marker('c', 300)], [{ from: 'a', to: 'c' }]);
        expect(side('a')).toBe('left');
        expect(side('c')).toBe('right');
    });

    it('ignores an arrow to a marker that is not packed', () => {
        const without = packMarkerRow(entries, 0, 1000, width);
        const unknown = packMarkerRow(entries, 0, 1000, width, [{ from: 'a', to: 'gone' }]);
        expect(unknown).toEqual(without);
    });
});
