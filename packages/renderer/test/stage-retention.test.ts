// stageRoadmap builds its document on a fresh URI per call; the Langium
// workspace must not keep one entry per call (r1.f7). An include file is
// keyed by its own path, so it is held once, not per stage.

import { createNowlineServices } from '@nowline/core';
import { langiumRetention } from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { stageRoadmap } from '../src/index.js';

const MAIN = '/workspace/main.nowline';
const SHARED = '/workspace/shared.nowline';

const SOURCES: Record<string, string> = {
    [SHARED]: `nowline v1

swimlane shared "Shared"
  item s1 "Shared work" duration:1w
`,
};

function source(withInclude: boolean): string {
    return [
        'nowline v1',
        '',
        ...(withInclude ? ['include "./shared.nowline"', ''] : []),
        'roadmap r "R" start:2026-01-05 scale:1w',
        '',
        'swimlane a "A"',
        '  item build "Build" duration:2w',
        '  item dup "One" duration:1w',
        '',
    ].join('\n');
}

describe('stageRoadmap: Langium retention', () => {
    it.each([
        ['a valid roadmap', source(false)],
        ['a roadmap with an include', source(true)],
        ['an invalid roadmap', `${source(false)}  item dup "Two" duration:1w\n`],
    ])('stays constant across stages of %s', async (_label, text) => {
        const services = createNowlineServices();
        const stage = () =>
            stageRoadmap({
                source: text,
                sourcePath: MAIN,
                services,
                readSource: async (absPath) => {
                    const found = SOURCES[absPath];
                    if (found === undefined) throw new Error(`ENOENT ${absPath}`);
                    return found;
                },
                layout: { theme: 'light', today: new Date(Date.UTC(2026, 1, 9)) },
            });
        const first = await stage();
        const after = langiumRetention(services.shared);
        for (let i = 0; i < 20; i++) {
            const next = await stage();
            expect(next.kind).toBe(first.kind);
        }
        expect(langiumRetention(services.shared)).toStrictEqual(after);
        // Only the include file, keyed by its path, stays indexed.
        expect(after.buildState).toBe(text.includes('include') ? 1 : 0);
    });
});
