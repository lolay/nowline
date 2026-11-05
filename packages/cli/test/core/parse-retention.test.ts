// `nowline serve` re-parses on every change: each parse builds a document on a
// fresh URI, and the Langium workspace must not keep one entry per call
// (r1.f7).

import { langiumRetention } from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { getServices, parseSource } from '../../src/core/parse.js';

const SOURCE = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane a "A"
  item build "Build" duration:2w
`;

describe('parseSource: Langium retention', () => {
    it('stays constant across parses', async () => {
        await parseSource(SOURCE, '/workspace/a.nowline');
        const before = langiumRetention(getServices().shared);
        for (let i = 0; i < 20; i++) {
            const result = await parseSource(SOURCE, '/workspace/a.nowline');
            expect(result.hasErrors).toBe(false);
        }
        expect(langiumRetention(getServices().shared)).toStrictEqual(before);
        expect(before.buildState).toBe(0);
    });
});
