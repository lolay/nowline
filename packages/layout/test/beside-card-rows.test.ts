// F1 (specs/layout-phases.md §1.3 L1, §5): the beside header card's bottom
// sits on the bottom of the header rows as finalize step f7 leaves them.
// Before the fix the card hugged the measure phase's estimate, so it ended
// a marker row short when the final pack needed more rows than the
// pre-pack (the three samples below) and a pill row short when f7 reserved
// the now-pill row on an extended axis (L2).

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutRoadmap, type PositionedRoadmap } from '../src/index.js';
import { MARKER_ROW_CENTER_OFFSET_PX } from '../src/nodes/marker-geometry.js';
import { parseAndResolve } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

async function layFile(rel: string, today: Date, edit = (s: string) => s) {
    const abs = path.join(REPO, rel);
    const source = edit(await readFile(abs, 'utf8'));
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    return layoutRoadmap(file, resolved, { theme: 'light', today });
}

function cardBottom(model: PositionedRoadmap): number {
    const card = model.header.cardBox;
    if (!card) throw new Error('expected a beside header card');
    return card.y + card.height;
}

/** Bottom of the header rows: the marker band's top plus its height. */
function rowsBottom(model: PositionedRoadmap): number {
    const { markerRow } = model.timeline;
    return markerRow.y - MARKER_ROW_CENTER_OFFSET_PX + markerRow.height;
}

describe('the beside card hugs the grown header rows (F1)', () => {
    // The samples whose final marker pack needs more rows than the
    // pre-pack, at the G1 gate's date.
    it.each([
        'examples/dependencies.nowline',
        'tests/late-row-shifts.nowline',
        'tests/marker-left-overflow.nowline',
    ])('%s', async (rel) => {
        const model = await layFile(rel, utc(2026, 2, 9));
        expect(model.header.position).toBe('beside');
        expect(model.timeline.markerRow.height).toBeGreaterThan(0);
        expect(cardBottom(model)).toBe(rowsBottom(model));
    });

    it('covers the now-pill row reserved on an extended axis (L2)', async () => {
        const model = await layFile('examples/platform-2026.nowline', utc(2026, 3, 17), (s) =>
            s.replace(/^(roadmap platform-2026 .*)$/m, '$1 length:1w'),
        );
        expect(model.timeline.pillRowHeight).toBeGreaterThan(0);
        expect(cardBottom(model)).toBe(rowsBottom(model));
    });
});
