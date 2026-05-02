// Byte-stable sample snapshots — the gate the m2.5 layout-engine
// refactor lives or dies on. If a refactor preserves behavior these
// pass without touching the snapshot files; if it introduces a
// deliberate visual change re-run with `UPDATE_LAYOUT_SNAPSHOTS=1`.

import { describe, it, expect } from 'vitest';
import {
    SAMPLES,
    isUpdateMode,
    readSnapshot,
    renderSampleSvg,
    writeSnapshot,
} from './snapshot.helpers.js';

describe('layout v2 sample snapshots', () => {
    for (const sample of SAMPLES) {
        it(`${sample.name} matches snapshot`, async () => {
            const actual = await renderSampleSvg(sample);
            if (isUpdateMode()) {
                await writeSnapshot(sample.name, actual);
                return;
            }
            const expected = await readSnapshot(sample.name);
            if (expected === null) {
                await writeSnapshot(sample.name, actual);
                return;
            }
            expect(actual).toBe(expected);
        });
    }
});
