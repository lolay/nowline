// Byte stability for calendars with no non-working day (specs/working-calendar.md
// §9, the identity path): `calendar:full` and a blockful `calendar:custom` keep
// today's positioned model, so none of the keys the hide view adds may appear
// anywhere in it. Every key is optional and omitted (never `undefined` or
// `[]`), so a generic key walk over each input is the check; `Object.keys`
// also catches a key set to `undefined`. A business roadmap is the control: the
// same walk must find them there.
//
// `WAVE_KEYS` in waves-byte-stability.test.ts is deliberately not extended; the
// wave walk and this one are independent.

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutRoadmap } from '../src/layout.js';
import { parseAndResolve } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every key the working-day schedule adds to the positioned model. */
const NON_WORKING_KEYS = ['nonWorking', 'nonWorkingDisplay', 'hiddenDate', 'nonWorkingPin'];

/** The paths (`a.b[2].c`) of every non-working key anywhere in `root`. */
function nonWorkingKeyPaths(root: unknown): string[] {
    const found: string[] = [];
    const seen = new WeakSet<object>();
    const walk = (value: unknown, at: string): void => {
        if (value === null || typeof value !== 'object' || value instanceof Date) return;
        if (seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) {
            value.forEach((v, i) => {
                walk(v, `${at}[${i}]`);
            });
            return;
        }
        for (const key of Object.keys(value)) {
            if (NON_WORKING_KEYS.includes(key)) found.push(at ? `${at}.${key}` : key);
            walk((value as Record<string, unknown>)[key], at ? `${at}.${key}` : key);
        }
    };
    walk(root, '');
    return found;
}

async function layFile(rel: string) {
    const abs = path.join(REPO_ROOT, rel);
    const source = await readFile(abs, 'utf8');
    const { file, resolved } = await parseAndResolve(source, abs, (p) => readFile(p, 'utf8'));
    return { source, model: layoutRoadmap(file, resolved) };
}

// Calendars without a non-working day: `calendar:full`, or `calendar:custom`
// with a `calendar` block (which sets day counts, not weekends).
const IDENTITY_INPUTS: Array<{ file: string; calendar: RegExp }> = [
    { file: 'examples/waves.nowline', calendar: /calendar:full/ },
    { file: 'examples/waves-program.nowline', calendar: /calendar:full/ },
    { file: 'examples/product.nowline', calendar: /calendar:custom/ },
    { file: 'tests/waves-coarse.nowline', calendar: /calendar:full/ },
    { file: 'tests/waves-gap-deadline.nowline', calendar: /calendar:full/ },
    { file: 'tests/waves-isolate.nowline', calendar: /calendar:full/ },
    { file: 'tests/grammar-properties.nowline', calendar: /calendar:custom/ },
];

describe('the positioned model of a calendar with no non-working day (identity path)', () => {
    it.each(IDENTITY_INPUTS)('$file carries no non-working key', async ({ file, calendar }) => {
        const { source, model } = await layFile(file);
        // Guard against a vacuous pass: the input really is full or custom.
        expect(source).toMatch(calendar);
        expect(nonWorkingKeyPaths(model)).toEqual([]);
        expect(model.timeline.nonWorking).toBeUndefined();
        expect(model.timeline.nonWorkingDisplay).toBeUndefined();
    });

    it('calendar:full carries none even with a Saturday milestone, pin and anchor', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:full

anchor sun "Sunday anchor" date:2026-01-11
milestone sat "Saturday gate" date:2026-01-10

swimlane a "A"
  item pinned "Pinned" duration:1w date:2026-01-10
  item after "After" duration:1w after:2026-01-24
`);
        expect(nonWorkingKeyPaths(layoutRoadmap(file, resolved))).toEqual([]);
    });
});

describe('a business roadmap carries the non-working keys (control)', () => {
    it('finds nonWorking and nonWorkingDisplay on the timeline of a plain business roadmap', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
`);
        const paths = nonWorkingKeyPaths(layoutRoadmap(file, resolved));
        expect([...paths].sort()).toEqual(['timeline.nonWorking', 'timeline.nonWorkingDisplay']);
    });

    it('finds hiddenDate and nonWorkingPin where the weekend holds a date', async () => {
        const { file, resolved } = await parseAndResolve(`nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor sun "Sunday anchor" date:2026-01-11
milestone sat "Saturday gate" date:2026-01-10

swimlane a "A"
  item pinned "Pinned" duration:1w date:2026-01-10
`);
        const paths = nonWorkingKeyPaths(layoutRoadmap(file, resolved));
        expect(paths).toEqual(
            expect.arrayContaining([
                'timeline.nonWorkingDisplay',
                'timeline.nonWorking',
                'anchors[0].hiddenDate',
                'milestones[0].hiddenDate',
                'swimlanes[0].children[0].nonWorkingPin',
            ]),
        );
    });

    it('finds nonWorking on the business sample examples/platform-2026.nowline', async () => {
        const { source, model } = await layFile('examples/platform-2026.nowline');
        expect(source).toMatch(/calendar:business/);
        expect(nonWorkingKeyPaths(model)).toContain('timeline.nonWorking');
    });
});
