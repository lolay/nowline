// Inline-date pin validator tests. Cover the four error paths and three
// happy paths described by specs/dsl.md "Inline date pins":
//
//   NL.E0410 — multiple inline dates in the same after:/before: list
//   NL.E0411 — inline date on a disallowed entity (milestone, swimlane,
//              anchor, footnote, person, team)
//   NL.E0412 — inline date present but roadmap is missing start:
//   NL.E0413 — inline date is before roadmap start:
//   NL.E0405 — inline date is not a real calendar day (2026-02-30)
//
// Plus happy paths: single inline date on item / group / parallel, and
// a mixed list (id ref + one date) on an item.

import { describe, expect, it } from 'vitest';
import { tr } from '../../src/i18n/index.js';
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

        it("single inline date on a wave's after: validates cleanly", async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `wave w1 after:2026-02-09\n` +
                    `swimlane s\n` +
                    `  item x duration:1w wave:w1\n`,
            );
            expect(r.diagnostics).toEqual([]);
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
            expect(hasError(errorMessages(r.diagnostics), /not allowed on milestone/i)).toBe(true);
        });

        it('NL.E0411: inline date on a swimlane is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `swimlane s after:2026-02-09\n` +
                    `  item x duration:1w\n`,
            );
            expect(hasError(errorMessages(r.diagnostics), /not allowed on swimlane/i)).toBe(true);
        });

        it('NL.E0412: inline date with no roadmap start: is an error', async () => {
            const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w after:2026-02-09\n`);
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
            expect(hasError(errorMessages(r.diagnostics), /is before roadmap start/i)).toBe(true);
        });
    });

    describe('NL.E0405: an impossible day', () => {
        type Coded = { code: string; args: [{ key: string; value: string }] };
        const coded = (diagnostics: { data?: unknown }[]) =>
            diagnostics.map((d) => d.data as Coded | undefined);

        // `Date` rolls 2026-02-30 over to 2026-03-02, after this start:, so
        // NL.E0413 would only fire if the check read the rolled-over date.
        it('after:2026-02-30 on an item is NL.E0405 in en and fr, not NL.E0413', async () => {
            const r = await parse(
                `roadmap r start:2026-03-01\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:2026-02-30\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([
                'Invalid after "2026-02-30". Use ISO 8601 format: YYYY-MM-DD.',
            ]);
            const [data] = coded(r.diagnostics);
            expect(data?.code).toBe('NL.E0405');
            expect(tr('fr', 'NL.E0405', ...data!.args)).toBe(
                'after invalide «\u00A02026-02-30\u00A0». Utilisez le format ISO 8601\u00A0: AAAA-MM-JJ.',
            );
        });

        it('an impossible day before roadmap start: is NL.E0405 only', async () => {
            const r = await parse(
                `roadmap r start:2026-04-01\n` +
                    `swimlane s\n` +
                    `  item x duration:1w before:2026-02-30\n`,
            );
            expect(coded(r.diagnostics).map((d) => d?.code)).toEqual(['NL.E0405']);
        });

        it('an impossible day with no roadmap start: is NL.E0405, not NL.E0412', async () => {
            const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w after:2026-02-30\n`);
            expect(coded(r.diagnostics).map((d) => d?.code)).toEqual(['NL.E0405']);
        });

        it('flags the date element of a list, on groups, parallels and waves', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `wave w1 after:2026-04-31\n` +
                    `swimlane s\n` +
                    `  item upstream duration:1w\n` +
                    `  item x duration:1w after:[upstream, 2026-02-29]\n` +
                    `  group g before:2026-06-31\n` +
                    `    item a duration:1w wave:w1\n` +
                    `  parallel p after:2026-09-31\n` +
                    `    item b duration:1w\n` +
                    `    item c duration:1w\n`,
            );
            const findings = coded(r.diagnostics).map((d) => [d?.code, d?.args[0]]);
            expect(findings).toEqual([
                ['NL.E0405', { key: 'after', value: '2026-04-31' }],
                ['NL.E0405', { key: 'after', value: '2026-02-29' }],
                ['NL.E0405', { key: 'before', value: '2026-06-31' }],
                ['NL.E0405', { key: 'after', value: '2026-09-31' }],
            ]);
            // The list form points at the date element, not the whole property.
            expect(r.diagnostics[1].range.start.character).toBe(
                '  item x duration:1w after:[upstream, '.length,
            );
        });

        it('a real leap day (2028-02-29) is accepted', async () => {
            const r = await parse(
                `roadmap r start:2028-01-03\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:2028-02-29\n`,
            );
            expect(r.diagnostics).toEqual([]);
        });
    });

    describe("a wave's after: (start floor)", () => {
        const codesOf = (diagnostics: { data?: unknown }[]) =>
            diagnostics.map((d) => (d.data as { code?: string } | undefined)?.code);

        it('NL.E0410: two inline dates in a wave after: list is an error', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `wave w1 after:[2026-02-09, 2026-03-09]\n` +
                    `swimlane s\n` +
                    `  item x duration:1w wave:w1\n`,
            );
            expect(codesOf(r.diagnostics)).toEqual(['NL.E0410']);
        });

        it('NL.E0412: an inline date on a wave needs roadmap start:', async () => {
            const r = await parse(
                `roadmap r\nwave w1 after:2026-02-09\nswimlane s\n  item x duration:1w wave:w1\n`,
            );
            expect(codesOf(r.diagnostics)).toEqual(['NL.E0412']);
        });

        it('NL.E0413: an inline date on a wave must not precede roadmap start:', async () => {
            const r = await parse(
                `roadmap r start:2026-02-01\n` +
                    `wave w1 after:2026-01-15\n` +
                    `swimlane s\n` +
                    `  item x duration:1w wave:w1\n`,
            );
            expect(codesOf(r.diagnostics)).toEqual(['NL.E0413']);
        });

        it("NL.E0411 does not fire on a wave's before: (NL.E1105 covers it)", async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `wave w1 before:2026-02-09\n` +
                    `swimlane s\n` +
                    `  item x duration:1w wave:w1\n`,
            );
            expect(codesOf(r.diagnostics)).toEqual(['NL.E1105']);
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
            expect(hasError(errorMessages(r.diagnostics), /Circular dependency/i)).toBe(false);
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

    // The rule 24 and rule 25 walks never looked inside a team, so a team
    // nested in a team is skipped (specs/core-ast-utilities.md §6). The
    // shared content walk visits nested teams; the validator filters them.
    describe('teams nested in teams', () => {
        const codesOf = (diagnostics: { data?: unknown }[]) =>
            diagnostics
                .map((d) => (d.data as { code?: string } | undefined)?.code)
                .filter((c) => c === 'NL.E0411');

        it('NL.E0411 fires on a top-level team with an inline date', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `team outer after:2026-02-09\n` +
                    `swimlane s\n` +
                    `  item x duration:1w\n`,
            );
            expect(codesOf(r.diagnostics)).toEqual(['NL.E0411']);
        });

        it('NL.E0411 does not fire on a team nested in a team', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `team outer\n` +
                    `  team inner after:2026-02-09\n` +
                    `swimlane s\n` +
                    `  item x duration:1w\n`,
            );
            expect(codesOf(r.diagnostics)).toEqual([]);
            expect(hasError(errorMessages(r.diagnostics), /not allowed on team/i)).toBe(false);
        });

        it('a nested team after: adds no edge to the dependency graph', async () => {
            // inner -> x and x -> inner would close a cycle if the nested
            // team's after: were an edge.
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `team outer\n` +
                    `  team inner after:x\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:inner\n`,
            );
            expect(hasError(errorMessages(r.diagnostics), /Circular dependency/i)).toBe(false);
        });

        it('a top-level team after: still adds its edge to the dependency graph', async () => {
            const r = await parse(
                `roadmap r start:2026-01-05\n` +
                    `team inner after:x\n` +
                    `swimlane s\n` +
                    `  item x duration:1w after:inner\n`,
            );
            expect(hasError(errorMessages(r.diagnostics), /Circular dependency/i)).toBe(true);
        });
    });
});
