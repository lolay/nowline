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
    it('returns no pin and no after for a plain item', async () => {
        expect(await termsOf('item a duration:1w')).toEqual({ after: [] });
    });

    it('reads a `date:` pin', async () => {
        expect(await termsOf('item a duration:1w date:2026-02-02')).toEqual({
            pin: { key: 'date', raw: '2026-02-02', date: utc(2026, 2, 2) },
            after: [],
        });
    });

    it('reads a `start:` pin', async () => {
        expect(await termsOf('item a duration:1w start:2026-02-09')).toEqual({
            pin: { key: 'start', raw: '2026-02-09', date: utc(2026, 2, 9) },
            after: [],
        });
    });

    it('lets `date:` win over `start:` when both parse', async () => {
        const terms = await termsOf('item a duration:1w start:2026-02-09 date:2026-02-02');
        expect(terms.pin).toEqual({ key: 'date', raw: '2026-02-02', date: utc(2026, 2, 2) });
    });

    it('falls back to `start:` when `date:` does not parse', async () => {
        const terms = await termsOf('item a duration:1w date:soon start:2026-02-09');
        expect(terms.pin).toEqual({ key: 'start', raw: '2026-02-09', date: utc(2026, 2, 9) });
    });

    it('returns no pin when neither `date:` nor `start:` parses', async () => {
        const terms = await termsOf('item a duration:1w date:soon start:later');
        expect(terms.pin).toBeUndefined();
    });

    it('keeps `after:` elements in source order, ids as refs and ISO dates as dates', async () => {
        const terms = await termsOf('item a duration:1w after:[x, 2026-03-02, y]');
        expect(terms.after).toEqual([
            { raw: 'x', ref: 'x' },
            { raw: '2026-03-02', date: utc(2026, 3, 2) },
            { raw: 'y', ref: 'y' },
        ]);
        expect(terms.pin).toBeUndefined();
    });

    it('reads a single `after:` id and a pin together', async () => {
        const terms = await termsOf('item a duration:1w date:2026-02-02 after:x');
        expect(terms.pin?.key).toBe('date');
        expect(terms.after).toEqual([{ raw: 'x', ref: 'x' }]);
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
