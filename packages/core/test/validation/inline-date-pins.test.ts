// Inline-date pin validator tests. Cover the four error paths and three
// happy paths described by specs/dsl.md "Inline date pins":
//
//   NL.E0410 — multiple inline dates in the same after:/before: list
//   NL.E0411 — inline date on a disallowed entity (milestone, swimlane,
//              anchor, footnote, person, team)
//   NL.E0412 — inline date present but roadmap is missing start:
//   NL.E0413 — inline date is before roadmap start:
//
// Plus happy paths: single inline date on item / group / parallel, and
// a mixed list (id ref + one date) on an item.

import { describe, expect, it } from 'vitest';
import { errorMessages, parse } from '../helpers.js';

function hasError(diags: ReturnType<typeof errorMessages>, pattern: RegExp): boolean {
    return diags.some((m) => pattern.test(m));
}

describe('inline-date pins (after:DATE / before:DATE)', () => {
    describe('happy paths', () => {
        it('single inline date on an item validates cleanly', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:2026-02-09\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
        });

        it('single inline date on a group validates cleanly', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  group g after:2026-02-09\n` +
                    `    item a duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
        });

        it('single inline date on a parallel validates cleanly', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  parallel p before:2026-04-13\n` +
                    `    item a duration:1w\n` +
                    `    item b duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
        });

        it('mixed list (id + one date) validates cleanly', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  item upstream duration:1w\n` +
                    `  item downstream duration:1w after:[upstream, 2026-03-09]\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
        });
    });

    describe('error paths', () => {
        it('NL.E0410: two inline dates in one after: list is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:[2026-02-09, 2026-03-09]\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /at most one inline date per direction/i),
            ).toBe(true);
        });

        it('NL.E0410: two inline dates in one before: list is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  item x duration:1w before:[2026-04-13, 2026-05-25]\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /at most one inline date per direction/i),
            ).toBe(true);
        });

        it('NL.E0411: inline date on a milestone is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  milestone m after:2026-02-09\n` +
                    `  item x duration:1w\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /not allowed on milestone/i),
            ).toBe(true);
        });

        it('NL.E0411: inline date on a swimlane is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s after:2026-02-09\n` +
                    `  item x duration:1w\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /not allowed on swimlane/i),
            ).toBe(true);
        });

        it('NL.E0412: inline date with no roadmap start: is an error', async () => {
            const r = await parse(
                `roadmap r\nswimlane s\n  item x duration:1w after:2026-02-09\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /requires the roadmap to declare "start:"/i),
            ).toBe(true);
        });

        it('NL.E0413: inline date before roadmap start: is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-02-01\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:2026-01-15\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /is before roadmap start/i),
            ).toBe(true);
        });
    });

    describe('cycle detection', () => {
        it('inline dates do not participate in cycle detection', async () => {
            // A self-`after:DATE` would trigger a cycle if dates were
            // graph nodes; the validator must skip them.
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:2026-02-09\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /Circular dependency/i),
            ).toBe(false);
        });
    });

    describe('reference resolution', () => {
        it('inline date in after: is not flagged as an unresolved id', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:2026-02-09\n`,
            );
            expect(
                hasError(errorMessages(r.diagnostics), /does not resolve to any declared entity/i),
            ).toBe(false);
        });
    });
});
