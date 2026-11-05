import { describe, expect, it } from 'vitest';
import { exportMermaid } from '../src/index.js';
import { buildExportInputs } from './helpers.js';

// `after:<dated milestone>` (r1.f8). The schedule resolved it to day 0, so a
// wave held by an item after a dated milestone ended where the item would
// have ended without it. The chart starts the item on the milestone's date
// and ends the wave a week later; the wave-end milestone has to agree.

const WAVES = `nowline v1

roadmap r "R" start:2026-01-05

wave build "Build"
wave launch "Launch"

swimlane a "A"
  item x "X" duration:1w wave:build after:gate
  item y "Y" duration:1w wave:launch

milestone gate "Gate" date:2026-03-02
`;

describe('exportMermaid — after a dated milestone (r1.f8)', () => {
    it('ends each wave after the item that waits for the milestone', async () => {
        const out = exportMermaid(await buildExportInputs(WAVES));
        expect(out).toContain('Build (wave end) :milestone, build, 2026-03-09, 0d');
        expect(out).toContain('Launch (wave end) :milestone, launch, 2026-03-16, 0d');
        expect(out).toContain('X :x, after gate, 5d');
    });
});
