// `startTermsOf` and `waveFloorDates` directly (specs/scheduler-unification.md
// §3.4): the one place start terms and wave floors are parsed. The engines
// that consume them are covered by the layout, schedule and wave suites.

import { buildWavePlan, isItemDeclaration } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { startTermsOf, waveFloorDates } from '../src/start-terms.js';
import { parseAndResolve } from './helpers.js';

/** The start terms of the item `id` in `swimlane s`. */
async function termsOf(itemLine: string, extra = '') {
    const { resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05
${extra}
swimlane s
  ${itemLine}
`);
    const lane = [...resolved.content.swimlanes.values()][0];
    const item = lane.content.find(isItemDeclaration);
    if (!item) throw new Error('no item in the fixture');
    return startTermsOf(item.properties);
}

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

describe('startTermsOf', () => {
    it('returns no after for a plain item', async () => {
        expect(await termsOf('item a duration:1w')).toEqual({ after: [] });
    });

    it('ignores `date:` and `start:` on an item: work has no fixed start pin', async () => {
        // specs/dsl.md § Item Properties: both keys are unknown on an item, so
        // they set no term; the validator warns with an `after:<date>` hint.
        expect(await termsOf('item a duration:1w date:2026-02-02')).toEqual({ after: [] });
        expect(await termsOf('item a duration:1w start:2026-02-09')).toEqual({ after: [] });
        expect(
            await termsOf('item a duration:1w start:2026-02-09 date:2026-02-02 after:x'),
        ).toEqual({ after: [{ raw: 'x', ref: 'x' }] });
    });

    it('keeps `after:` elements in source order, ids as refs and ISO dates as dates', async () => {
        const terms = await termsOf('item a duration:1w after:[x, 2026-03-02, y]');
        expect(terms.after).toEqual([
            { raw: 'x', ref: 'x' },
            { raw: '2026-03-02', date: utc(2026, 3, 2) },
            { raw: 'y', ref: 'y' },
        ]);
    });
});

describe('waveFloorDates', () => {
    it('maps each wave to its floor date or null, by wave index', async () => {
        const { resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 calendar:full

anchor budget "Budget" date:2026-02-02

wave plan "Plan"
wave execute "Execute" after:budget
wave review "Review"
wave ship "Ship" after:2026-03-16

swimlane s
  item a duration:1w wave:plan
  item b duration:1w wave:execute
  item c duration:1w wave:review
  item d duration:1w wave:ship
`);
        const plan = buildWavePlan(resolved);
        expect(plan).toBeDefined();
        expect(waveFloorDates(plan!)).toEqual([null, utc(2026, 2, 2), null, utc(2026, 3, 16)]);
    });

    it('is null for a floor date that is not an ISO date', () => {
        const plan = {
            floors: [null, { date: '2026-1-5' }, { date: '2026-02-02' }],
        } as unknown as Parameters<typeof waveFloorDates>[0];
        expect(waveFloorDates(plan)).toEqual([null, null, utc(2026, 2, 2)]);
    });
});
