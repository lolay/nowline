import { describe, expect, it } from 'vitest';
import { resolveDiagnosticCode } from '../../src/diagnostics/index.js';
import { tr } from '../../src/i18n/index.js';
import { errorMessages, parse, warningMessages } from '../helpers.js';

function hasError(diags: ReturnType<typeof errorMessages>, pattern: RegExp): boolean {
    return diags.some((m) => pattern.test(m));
}

describe('validation rules', () => {
    it('Rule 1: empty file emits no errors', async () => {
        const r = await parse('', { validate: true });
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 2: duplicate identifiers within a file are an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w\n  item x duration:2w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Duplicate identifier/i)).toBe(true);
    });

    it('Rule 3: entity without id or title is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /identifier.*title/i)).toBe(true);
    });

    it('Rule 4: config after roadmap is rejected', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w\nconfig\nscale\n  name: weeks\n`,
        );
        expect(r.parserErrors.length + errorMessages(r.diagnostics).length).toBeGreaterThan(0);
    });

    it('Rule 4 / Issue #1: 2+ includes with config:isolate and a config block validate cleanly', async () => {
        const r = await parse(
            `nowline v1\n` +
                `include "./child-a.nowline" config:isolate roadmap:isolate\n` +
                `include "./child-b.nowline" config:isolate roadmap:isolate\n` +
                `config\n` +
                `default item shadow:subtle\n` +
                `roadmap parent "Parent" start:2026-01-05 scale:1w calendar:business\n` +
                `swimlane parent-lane "Parent"\n` +
                `  item parent-item "Parent item" duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /Include declarations must appear before/i),
        ).toBe(false);
    });

    it('Rule 4: config block placed after roadmap is rejected even when an include uses config:isolate', async () => {
        const r = await parse(
            `nowline v1\n` +
                `include "./child-a.nowline" config:isolate roadmap:isolate\n` +
                `roadmap parent "Parent" start:2026-01-05 scale:1w calendar:business\n` +
                `swimlane parent-lane "Parent"\n` +
                `  item parent-item "Parent item" duration:1w\n` +
                `config\n` +
                `default item shadow:subtle\n`,
        );
        expect(r.parserErrors.length + errorMessages(r.diagnostics).length).toBeGreaterThan(0);
    });

    it('Rule 5: invalid version format is an error', async () => {
        const r = await parse(`nowline 1.0\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(r.parserErrors.length + errorMessages(r.diagnostics).length).toBeGreaterThan(0);
    });

    it('Rule 5: version beyond supported is an error', async () => {
        const r = await parse(`nowline v99\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /requires.*v99|only supports/i)).toBe(true);
    });

    it('Directive locale: well-formed BCP-47 tag parses cleanly', async () => {
        for (const tag of ['en-US', 'fr', 'fr-CA', 'fr-FR', 'zh-CN', 'es-419']) {
            const r = await parse(
                `nowline v1 locale:${tag}\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
            expect(r.ast.directive?.properties[0]?.value).toBe(tag);
        }
    });

    it('Directive locale: malformed tag is an error', async () => {
        const r = await parse(
            `nowline v1 locale:englishUS\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Invalid locale.*BCP-47/i)).toBe(true);
    });

    it('Directive locale: unknown directive property is an error', async () => {
        const r = await parse(
            `nowline v1 strict:true\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Unknown directive property/i)).toBe(true);
    });

    it('Directive locale: duplicate keys are rejected', async () => {
        // Both values are en-US so the duplicate-detection message itself is
        // emitted in English (validation messages localize to the file's own
        // declared locale; switching locale here would only test the French
        // bundle, not the rule).
        const r = await parse(
            `nowline v1 locale:en-US locale:en-US\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Duplicate directive property/i)).toBe(true);
    });

    it('Directive: bare `nowline v1` without properties stays valid', async () => {
        const r = await parse(`nowline v1\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
        expect(r.ast.directive?.properties).toEqual([]);
    });

    it('Rule 6: roadmap without swimlane is an error', async () => {
        const r = await parse(`roadmap r "R"\n`);
        expect(hasError(errorMessages(r.diagnostics), /swimlane/i)).toBe(true);
    });

    it('Rule 10: item without duration: is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x\n`);
        expect(hasError(errorMessages(r.diagnostics), /duration/i)).toBe(true);
    });

    it('Rule 11: anchor without date: is an error', async () => {
        const r = await parse(`roadmap r\nanchor kickoff\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /requires.*date/i)).toBe(true);
    });

    it('Rule 11: anchor with invalid date is an error', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01\nanchor kickoff date:2026-13-45\nswimlane s\n  item x duration:1w\n`,
        );
        const combined = r.parserErrors.concat(errorMessages(r.diagnostics));
        expect(combined.some((m) => /date|2026-13-45/i.test(m))).toBe(true);
    });

    it('Rule 12: milestone without date: or after: is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w\nmilestone bad "Bad"\n`);
        expect(hasError(errorMessages(r.diagnostics), /Milestone.*date.*after/i)).toBe(true);
    });

    it('Rule 13: duration with wrong-type value is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:50%\n`);
        expect(hasError(errorMessages(r.diagnostics), /duration/i)).toBe(true);
    });

    it('Rule 14: remaining outside 0..100 is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w remaining:150%\n`);
        expect(hasError(errorMessages(r.diagnostics), /remaining.*0.*100|between 0/i)).toBe(true);
    });

    it('Rule 14: remaining non-percentage is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w remaining:half\n`);
        expect(hasError(errorMessages(r.diagnostics), /remaining/i)).toBe(true);
    });

    it('Rule 15: forward reference to a size is an error', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item a size:md
size md effort:1w
`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /referenced before its declaration|Size "md"/i),
        ).toBe(true);
    });

    it('Rule 15: undeclared size name is an error', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item a size:mystery
`,
        );
        expect(hasError(errorMessages(r.diagnostics), /not declared/i)).toBe(true);
    });

    it('Rule 15: forward reference to a status is an error', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item a duration:1w status:awaiting-review
status awaiting-review
`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /Status.*referenced before its declaration|Status "awaiting-review" is not a built-in/i,
            ),
        ).toBe(true);
    });

    it('Rule 15: built-in status values do not require a declaration', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item a duration:1w status:planned
`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 16: footnote without on: is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w\nfootnote f "bad"\n`);
        expect(hasError(errorMessages(r.diagnostics), /Footnote.*on/i)).toBe(true);
    });

    it('Rule 16a: footnote: as a property on an item is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w footnote:vendor-dep\nfootnote vendor-dep "Vendor dep" on:x\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /"footnote:" is not valid/i)).toBe(true);
    });

    it('Rule 16a: footnote: as a property on a swimlane is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s footnote:capacity-risk\n  item x duration:1w\nfootnote capacity-risk "Capacity risk" on:x\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /"footnote:" is not valid/i)).toBe(true);
    });

    it('Rule 16a: footnote ... on:item-id is accepted (spec-mandated direction)', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w\nfootnote vendor-dep "Vendor dep" on:x\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17: bg with bad color is an error', async () => {
        const r = await parse(
            `config\nstyle bad\n  bg: xyzzy\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /color|bg/i)).toBe(true);
    });

    it('Rule 17: bg with hex color is accepted', async () => {
        const r = await parse(
            `config\nstyle ok\n  bg: #abcdef\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 18: border with invalid value is an error', async () => {
        const r = await parse(
            `config\nstyle s1\n  border: squiggly\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /border|squiggly/i)).toBe(true);
    });

    it('Rule 18: header-position beside/above are accepted', async () => {
        const rBeside = await parse(
            `config\nstyle compact\n  header-position: beside\nroadmap r style:compact\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(rBeside.diagnostics)).toEqual([]);
        const rAbove = await parse(
            `config\nstyle wide\n  header-position: above\nroadmap r style:wide\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(rAbove.diagnostics)).toEqual([]);
    });

    it('Rule 18: header-position with invalid value is an error', async () => {
        const r = await parse(
            `config\nstyle bad\n  header-position: sideways\nroadmap r style:bad\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /header-position|sideways/i)).toBe(true);
    });

    it('Rule 18: header-position on default roadmap is accepted', async () => {
        const r = await parse(
            `config\ndefault roadmap header-position:above\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 20: raw header-position on roadmap declaration is an error', async () => {
        const r = await parse(
            `roadmap r header-position:above\nswimlane s\n  item x duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /Raw style property "header-position"/i),
        ).toBe(true);
    });

    it('Rule 18: timeline-position top/bottom/both are accepted', async () => {
        for (const value of ['top', 'bottom', 'both']) {
            const r = await parse(
                `config\ndefault roadmap timeline-position:${value}\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
        }
    });

    it('Rule 18: timeline-position with invalid value is an error', async () => {
        const r = await parse(
            `config\ndefault roadmap timeline-position:sideways\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /timeline-position|sideways/i)).toBe(true);
    });

    it('Rule 18: minor-grid true/false are accepted', async () => {
        for (const value of ['true', 'false']) {
            const r = await parse(
                `config\ndefault roadmap minor-grid:${value}\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            );
            expect(errorMessages(r.diagnostics)).toEqual([]);
        }
    });

    it('Rule 18: minor-grid with invalid value is an error', async () => {
        const r = await parse(
            `config\ndefault roadmap minor-grid:maybe\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /minor-grid|maybe/i)).toBe(true);
    });

    // No enum key accepts a colour (rule 19), so a colour-shaped value on a
    // `default` line is the same single error it is in a `style` block.
    it('Rule 18: a hex colour for minor-grid on a default line is exactly one error', async () => {
        const r = await parse(
            `config\ndefault roadmap minor-grid:#fff\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([
            'Invalid value "#fff" for "minor-grid". Allowed: true, false.',
        ]);
    });

    it('Rule 18: a named colour for timeline-position on a default line is exactly one error', async () => {
        const r = await parse(
            `config\ndefault roadmap timeline-position:red\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([
            'Invalid value "red" for "timeline-position". Allowed: top, bottom, both.',
        ]);
    });

    it('Rule 18: default lines and style blocks agree on colour-shaped enum values', async () => {
        const body = 'roadmap r\nswimlane s\n  item x duration:1w\n';
        const cases: Array<[string, string]> = [
            ['minor-grid', '#fff'],
            ['timeline-position', 'red'],
            ['border', 'none'],
            ['header-height', 'navy'],
            ['bracket', '#123456'],
        ];
        for (const [key, value] of cases) {
            const fromDefault = await parse(`config\ndefault roadmap ${key}:${value}\n${body}`);
            const fromStyle = await parse(`config\nstyle s1\n  ${key}: ${value}\n${body}`);
            const expected = errorMessages(fromStyle.diagnostics);
            expect(expected).toHaveLength(1);
            expect(errorMessages(fromDefault.diagnostics)).toEqual(expected);
        }
    });

    it('Rule 20: raw timeline-position on roadmap declaration is an error', async () => {
        const r = await parse(
            `roadmap r timeline-position:both\nswimlane s\n  item x duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /Raw style property "timeline-position"/i),
        ).toBe(true);
    });

    it('Rule 20: raw style property on item is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w bg:red\n`);
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on label is an error', async () => {
        const r = await parse(
            `roadmap r\nlabel urgent "Urgent" bg:red\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on swimlane is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s bg:red\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: style:id reference on label is accepted', async () => {
        const r = await parse(
            `config\nstyle ent\n  bg: blue\nroadmap r\nlabel urgent "Urgent" style:ent\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 21: default of unknown entity type is an error', async () => {
        const r = await parse(
            `config\ndefault widget shadow:subtle\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /not a supported entity type/i)).toBe(true);
    });

    it('Rule 22: duplicate default for same entity is an error', async () => {
        const r = await parse(
            `config\ndefault item shadow:subtle\ndefault item padding:sm\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Duplicate "default item"/i)).toBe(true);
    });

    it('Rule 23: banned property on default item is an error', async () => {
        const r = await parse(
            `config\ndefault item duration:1w\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /"duration" cannot be set on "default item"/i),
        ).toBe(true);
    });

    it('Rule 24: after: reference that does not resolve is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w after:nonexistent\n`);
        expect(hasError(errorMessages(r.diagnostics), /after: reference.*does not resolve/i)).toBe(
            true,
        );
    });

    it('Rule 24: owner: with no matching declaration is allowed (per dsl.md "declarations are optional")', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w owner:sam\n`);
        expect(errorMessages(r.diagnostics).some((m) => /owner.*does not resolve/i.test(m))).toBe(
            false,
        );
    });

    it('Rule 25: circular dependency via after: is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w after:b\n  item b duration:1w after:a\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Circular dependency/i)).toBe(true);
    });

    it('Rule 25: 3-cycle via mixed after/before is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w after:c\n  item b duration:1w after:a\n  item c duration:1w after:b\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Circular dependency/i)).toBe(true);
    });

    it('Include rule: duplicate config option is an error', async () => {
        const r = await parse(
            `include "./a.nowline" config:merge config:ignore\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Duplicate "config"/i)).toBe(true);
    });

    it('Include rule: unknown include mode is an error', async () => {
        const r = await parse(
            `include "./a.nowline" config:weird\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /include mode|merge|ignore|isolate/i)).toBe(
            true,
        );
    });

    it('Parallel rule: parallel with one child emits a warning', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  parallel p\n    item a duration:1w\n`);
        expect(warningMessages(r.diagnostics).some((m) => /Parallel/i.test(m))).toBe(true);
    });

    it('Group rule: group with zero non-description children is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  group g "G"\n    description "d"\n`);
        expect(hasError(errorMessages(r.diagnostics), /at least 1 child|Group/i)).toBe(true);
    });

    it('Parallel/group rule: duration on parallel is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p duration:1w\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /duration.*parallel|not valid on parallel/i),
        ).toBe(true);
    });

    it('Parallel/group rule: remaining on group is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G" remaining:30%\n    item a duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /remaining.*group|not valid on group/i)).toBe(
            true,
        );
    });

    // --- R1: roadmap start: format ---

    it('R1: roadmap start with invalid format is an error', async () => {
        const r = await parse(`roadmap r start:not-a-date\nswimlane s\n  item a duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /start.*ISO 8601|Invalid start/i)).toBe(true);
    });

    it('R1: roadmap start with calendar-invalid value is an error', async () => {
        const r = await parse(`roadmap r start:2026-13-45\nswimlane s\n  item a duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /start|Invalid/i)).toBe(true);
    });

    it('R1: valid roadmap start is accepted', async () => {
        const r = await parse(`roadmap r start:2026-01-06\nswimlane s\n  item a duration:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- R2: dated roadmap requires start: (per offender) ---

    it('R2: a single anchor without roadmap start is an error on the anchor', async () => {
        const r = await parse(
            `roadmap r\nanchor kickoff date:2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) =>
            /missing "start:"|missing start/i.test(m),
        );
        expect(matches.length).toBe(1);
        expect(matches[0]).toMatch(/Anchor/i);
    });

    it('R2: a dated milestone without roadmap start is an error on the milestone', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-06-01\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) =>
            /missing "start:"|missing start/i.test(m),
        );
        expect(matches.length).toBe(1);
        expect(matches[0]).toMatch(/Milestone/i);
    });

    it('R2: two anchors and a dated milestone without start produce three errors', async () => {
        const r = await parse(
            `roadmap r\nanchor kickoff date:2026-01-06\nanchor midyear date:2026-07-01\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-12-01\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) =>
            /missing "start:"|missing start/i.test(m),
        );
        expect(matches.length).toBe(3);
    });

    it('R2: undated milestone in a roadmap without start is not flagged', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nmilestone beta "Beta" after:a\n`,
        );
        expect(errorMessages(r.diagnostics).some((m) => /missing "start:"/i.test(m))).toBe(false);
    });

    // --- R3: dated entities must not precede start: ---

    it('R3: anchor before roadmap start is an error', async () => {
        const r = await parse(
            `roadmap r start:2026-02-01\nanchor kickoff date:2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /before roadmap start/i.test(m));
        expect(matches.length).toBe(1);
        expect(matches[0]).toMatch(/Anchor/i);
    });

    it('R3: dated milestone before roadmap start is an error', async () => {
        const r = await parse(
            `roadmap r start:2026-02-01\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-01-15\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /before roadmap start/i.test(m));
        expect(matches.length).toBe(1);
        expect(matches[0]).toMatch(/Milestone/i);
    });

    it('R3: anchor equal to start is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-06\nanchor kickoff date:2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('R3: anchor after start is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01\nanchor kickoff date:2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('R3: dated milestone after start is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-06-01\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- R4: no cascade when start: is malformed ---

    it('R4: malformed start does not cascade to missing/ordering errors', async () => {
        const r = await parse(
            `roadmap r start:not-a-date\nanchor kickoff date:2000-01-01\nswimlane s\n  item a duration:1w\n`,
        );
        const errors = errorMessages(r.diagnostics);
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/start/i);
        expect(errors[0]).not.toMatch(/before roadmap start|missing "start:"/i);
    });

    // --- R6: pure-relative roadmaps stay valid ---

    it('R6: pure-relative roadmap without start: or dates is valid', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:2w\n  item b duration:1w after:a\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        expect(warningMessages(r.diagnostics)).toEqual([]);
    });

    // --- Size declaration: effort: is required ---

    it('Size decl: missing effort: is an error', async () => {
        const r = await parse(`roadmap r\nsize md\nswimlane s\n  item a size:md\n`);
        expect(hasError(errorMessages(r.diagnostics), /effort/i)).toBe(true);
    });

    it('Size decl: invalid effort value is an error', async () => {
        const r = await parse(`roadmap r\nsize md effort:maybe\nswimlane s\n  item a size:md\n`);
        expect(hasError(errorMessages(r.diagnostics), /effort/i)).toBe(true);
    });

    it('Size decl: quarter suffix is accepted in effort: and in item duration:', async () => {
        const r = await parse(
            `roadmap r\nsize big effort:1q\nswimlane s\n  item a size:big\n  item b duration:2q\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Size decl: decimal effort is accepted (0.5d)', async () => {
        const r = await parse(`roadmap r\nsize tiny effort:0.5d\nswimlane s\n  item a size:tiny\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Item duration: literal-only ---

    it('Item duration: identifier (alias-style) is an error — use size:NAME', async () => {
        const r = await parse(`roadmap r\nsize md effort:1w\nswimlane s\n  item a duration:md\n`);
        expect(hasError(errorMessages(r.diagnostics), /Invalid duration "md".*size:NAME/i)).toBe(
            true,
        );
    });

    it('Item duration: decimal literal is accepted (0.5d)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:0.5d\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Item remaining: percent OR literal ---

    it('Item remaining: duration literal is accepted (1w)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:2w remaining:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Item remaining: decimal literal is accepted (0.5d)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w remaining:0.5d\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Item remaining: literal larger than duration is accepted at parse-time (overflow handled at layout)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w remaining:4w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Raw-style ban: confirm every roadmap entity type is covered ---

    it('Rule 20: raw style property on anchor is an error', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01\nanchor kickoff date:2026-01-06 bg:red\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on milestone is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nmilestone ga "GA" after:a bg:red\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on footnote is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nfootnote f "F" on:a bg:red\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on group is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G" bg:red\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    // --- Calendar modes / custom block ---

    it('Calendar: valid mode on roadmap is accepted', async () => {
        const r = await parse(`roadmap r calendar:full\nswimlane s\n  item x duration:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Calendar: unknown mode on roadmap is an error', async () => {
        const r = await parse(`roadmap r calendar:weekendly\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /calendar|business|full|custom/i)).toBe(true);
    });

    it('Calendar: custom calendar without a calendar block is an error', async () => {
        const r = await parse(`roadmap r calendar:custom\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /custom|calendar/i)).toBe(true);
    });

    it('Calendar: non-integer days-per-week is an error', async () => {
        const r = await parse(
            `config\ncalendar\n  days-per-week: seven\nroadmap r calendar:custom\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /integer|days-per-week/i)).toBe(true);
    });

    it('Scale: invalid label-every is an error', async () => {
        const r = await parse(
            `config\nscale\n  label-every: hello\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /label-every|integer/i)).toBe(true);
    });

    // --- Milestone: date: OR after: required ---

    it('Milestone: date: alone is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01\nswimlane s\n  item a duration:1w\nmilestone ga date:2026-06-01\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Milestone: after: alone is accepted', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nmilestone ga after:a\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Person declaration rules ---

    it('Person: declaring the same person twice is an error', async () => {
        const r = await parse(
            `roadmap r\nperson sam "Sam"\nperson sam "Sam again"\nswimlane s\n  item x duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /Duplicate|already declared|Person "sam"/i),
        ).toBe(true);
    });

    it('Person: declaring a person inside a team is accepted', async () => {
        const r = await parse(
            `roadmap r\nteam eng "Engineering"\n  person sam\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Capacity (rules 17a–17e) ---

    it('Rule 17a: positive integer/decimal capacity on swimlane is accepted', async () => {
        const r = await parse(`roadmap r\nswimlane s capacity:5\n  item x duration:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
        const r2 = await parse(`roadmap r\nswimlane s capacity:1.5\n  item x duration:1w\n`);
        expect(errorMessages(r2.diagnostics)).toEqual([]);
    });

    it('Rule 17a: percent literal on swimlane capacity is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s capacity:50%\n  item x duration:1w\n`);
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /swimlane capacity.*Percent literals are not allowed/i,
            ),
        ).toBe(true);
    });

    it('Rule 17a: zero swimlane capacity is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s capacity:0\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /swimlane capacity/i)).toBe(true);
    });

    it('Rule 17b: integer/decimal/percent on item capacity is accepted', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w capacity:2\n  item b duration:1w capacity:0.5\n  item c duration:1w capacity:50%\n  item d duration:1w capacity:12.5%\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17b: zero item capacity is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w capacity:0\n`);
        expect(hasError(errorMessages(r.diagnostics), /Item capacity.*positive/i)).toBe(true);
    });

    it('Rule 17c: capacity on parallel is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel "P" capacity:3\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity.*not valid on parallel/i)).toBe(
            true,
        );
    });

    it('Rule 17c: capacity on group is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G" capacity:3\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity.*not valid on group/i)).toBe(true);
    });

    it('Rule 17d (removal): overcapacity:show|hide is rejected with a migration hint', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 overcapacity:hide\n  item x duration:1w\n`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /overcapacity.*was removed.*utilization-over-at:none/i,
            ),
        ).toBe(true);
    });

    it('Rule 17d (removal): overcapacity:show is also rejected (no value carve-out)', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 overcapacity:show\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /overcapacity.*was removed/i)).toBe(true);
    });

    it('Rule 17d: utilization-warn-at percent and decimal-fraction values are accepted on swimlane and default swimlane', async () => {
        const r = await parse(
            `config\ndefault swimlane utilization-warn-at:80% utilization-over-at:100%\nroadmap r\nswimlane s capacity:5 utilization-warn-at:75% utilization-over-at:120%\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        const r2 = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:0.5 utilization-over-at:1.25\n  item x duration:1w\n`,
        );
        expect(errorMessages(r2.diagnostics)).toEqual([]);
    });

    it('Rule 17d: utilization-*-at:none opts out of that color band', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:none utilization-over-at:none\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17d: bare integers are rejected with a disambiguation hint', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:80\n  item x duration:1w\n`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /utilization-warn-at.*"80".*Use the percent form.*"80%".*decimal-fraction.*"0\.80"/i,
            ),
        ).toBe(true);
    });

    it('Rule 17d: malformed values are rejected', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-over-at:maybe\n  item x duration:1w\n`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /utilization-over-at.*positive percent.*decimal fraction.*none/i,
            ),
        ).toBe(true);
    });

    it('Rule 17d: utilization-warn-at on an item is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w utilization-warn-at:50%\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /utilization-warn-at.*only valid on.*swimlane/i),
        ).toBe(true);
    });

    it('Rule 17d (ordering): warn > over is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:120% utilization-over-at:100%\n  item x duration:1w\n`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /utilization-warn-at.*120%.*must be ≤.*utilization-over-at.*100%/i,
            ),
        ).toBe(true);
    });

    it('Rule 17d (ordering): warn == over is allowed (binary indicator)', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:100% utilization-over-at:100%\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17d (ordering): `none` on either side skips the comparison', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:none utilization-over-at:50%\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        const r2 = await parse(
            `roadmap r\nswimlane s capacity:5 utilization-warn-at:200% utilization-over-at:none\n  item x duration:1w\n`,
        );
        expect(errorMessages(r2.diagnostics)).toEqual([]);
    });

    it('Rule 17d (ordering): default swimlane is also checked', async () => {
        const r = await parse(
            `config\ndefault swimlane utilization-warn-at:120% utilization-over-at:100%\nroadmap r\nswimlane s capacity:5\n  item x duration:1w\n`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /utilization-warn-at.*must be ≤.*utilization-over-at/i,
            ),
        ).toBe(true);
    });

    it('default swimlane capacity is banned (rule: lane budgets must be explicit)', async () => {
        const r = await parse(
            `config\ndefault swimlane capacity:5\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity.*default swimlane/i)).toBe(true);
    });

    it('default item capacity is allowed', async () => {
        const r = await parse(
            `config\ndefault item capacity:1\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17e: capacity-icon built-in identifier is accepted in style block', async () => {
        const r = await parse(
            `config\nstyle finance\n  capacity-icon: person\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17e: capacity-icon string literal is accepted in default swimlane', async () => {
        const r = await parse(
            `config\ndefault swimlane capacity-icon:"⚙"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17e: capacity-icon symbol reference is accepted when declared earlier', async () => {
        const r = await parse(
            `config\nsymbol budget unicode:"💰"\nstyle finance\n  capacity-icon: budget\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17e: capacity-icon as inline property on roadmap entity is an error (rule 20)', async () => {
        const r = await parse(`roadmap r\nswimlane s capacity-icon:person\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "capacity-icon"/i)).toBe(
            true,
        );
    });

    // --- Symbol declaration (rules 17f–17k) ---

    it('Rule 17f: symbol without unicode: is an error', async () => {
        const r = await parse(
            `config\nsymbol budget "Budget"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /requires a "unicode/i)).toBe(true);
    });

    it('Rule 17g: symbol with empty unicode string is an error', async () => {
        const r = await parse(
            `config\nsymbol budget unicode:""\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /unicode.*non-empty/i)).toBe(true);
    });

    it('Rule 17h: symbol ascii longer than 3 chars is an error', async () => {
        const r = await parse(
            `config\nsymbol budget unicode:"💰" ascii:"BUDG"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /ascii.*1-3 ASCII/i)).toBe(true);
    });

    it('Rule 17h: symbol ascii of 1-3 ASCII chars is accepted', async () => {
        const r = await parse(
            `config\nsymbol budget unicode:"💰" ascii:"$"\nsymbol star unicode:"⭐" ascii:"*"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17i: symbol id shadowing a built-in icon name is an error', async () => {
        const r = await parse(
            `config\nsymbol points unicode:"💰"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /collides with a built-in icon name/i)).toBe(
            true,
        );
    });

    it('Rule 17j: duplicate symbol ids are an error', async () => {
        const r = await parse(
            `config\nsymbol budget unicode:"💰"\nsymbol budget unicode:"$"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Duplicate symbol id/i)).toBe(true);
    });

    it('Rule 17k: capacity-icon referencing an unknown symbol is an error', async () => {
        const r = await parse(
            `config\nstyle finance\n  capacity-icon: nonesuch\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(
            hasError(errorMessages(r.diagnostics), /capacity-icon.*nonesuch.*neither a built-in/i),
        ).toBe(true);
    });

    it('Rule 17k: capacity-icon referencing a symbol declared later is a forward-reference error', async () => {
        const r = await parse(
            `config\nstyle finance\n  capacity-icon: budget\nsymbol budget unicode:"💰"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(
            hasError(
                errorMessages(r.diagnostics),
                /capacity-icon.*budget.*before its declaration/i,
            ),
        ).toBe(true);
    });

    it('Rule 17k: icon: referencing an unknown symbol is an error', async () => {
        const r = await parse(
            `config\nstyle finance\n  icon: mystery\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /icon.*mystery.*neither a built-in/i)).toBe(
            true,
        );
    });

    it('Rule 17k: built-in icon name (shield) is accepted', async () => {
        const r = await parse(
            `config\nstyle danger\n  icon: shield\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('lane and item capacity are independent — item capacity without lane capacity is OK', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w capacity:3\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('lane capacity without item capacity is OK', async () => {
        const r = await parse(`roadmap r\nswimlane s capacity:5\n  item x duration:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Vocabulary aliases (additive, behavior-equivalent) ---

    it('accepts status alias "active" (= in-progress)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w status:active\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('accepts status alias "completed" (= done)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w status:completed\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('accepts color alias "grey" inside a style block (= gray)', async () => {
        const r = await parse(
            `config\nstyle muted\n  bg: grey\nroadmap r\nswimlane s\n  item x duration:1w style:muted\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('accepts color alias "violet" inside a style block (= purple)', async () => {
        const r = await parse(
            `config\nstyle accent\n  bg: violet\nroadmap r\nswimlane s\n  item x duration:1w style:accent\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Pre-release renames: old spellings must be rejected ---

    it('rejects shadow:fuzzy (renamed to soft)', async () => {
        const r = await parse(
            `config\nstyle elevated\n  shadow: fuzzy\nroadmap r\nswimlane s\n  item x duration:1w style:elevated\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /shadow/i)).toBe(true);
    });

    it('accepts shadow:soft (canonical)', async () => {
        const r = await parse(
            `config\nstyle elevated\n  shadow: soft\nroadmap r\nswimlane s\n  item x duration:1w style:elevated\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('rejects the legacy "glyph" keyword (renamed to "symbol")', async () => {
        // The keyword `glyph` is no longer a config-section keyword, so the
        // parser refuses the line. Surface error on either parserErrors or
        // validation diagnostics — the parser front-ends differ.
        const r = await parse(
            `config\nglyph budget unicode:"💰"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        const hadProblem =
            r.parserErrors.length > 0 ||
            r.lexerErrors.length > 0 ||
            r.diagnostics.some((d) => d.severity === 'error');
        expect(hadProblem).toBe(true);
    });

    // --- NL.W0700: unknown property on entity declaration ---

    it('NL.W0700: unknown roadmap property emits a warning, not an error', async () => {
        const r = await parse(
            `roadmap r "R" start:2026-01-05 scale:1w now:2026-01-25\nswimlane s\n  item x duration:1w\n`,
        );
        const warnings = warningMessages(r.diagnostics);
        expect(warnings.some((m) => /Unknown property "now" on/.test(m))).toBe(true);
        expect(hasError(errorMessages(r.diagnostics), /Unknown property "now"/)).toBe(false);
    });

    it('NL.W0700: unknown item property emits exactly one warning', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w foo:bar\n`);
        const warnings = warningMessages(r.diagnostics).filter((m) =>
            /Unknown property "foo"/.test(m),
        );
        expect(warnings.length).toBe(1);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('NL.W0700: typo close to a known key includes a "did you mean" suggestion', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w descripton:"x"\n`);
        const warnings = warningMessages(r.diagnostics);
        const hit = warnings.find((m) => /Unknown property "descripton"/.test(m));
        expect(hit).toBeDefined();
        expect(hit).toMatch(/Did you mean "description"\?/);
    });

    it('NL.W0700: "progress" on an item suggests status: + remaining:', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w progress:60\n`);
        const warnings = warningMessages(r.diagnostics);
        const hit = warnings.find((m) => /Unknown property "progress"/.test(m));
        expect(hit).toBeDefined();
        expect(hit).toMatch(/Did you mean "status: \+ remaining:"\?/);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('NL.W0700: "progress" on a roadmap line has no remaining-based suggestion', async () => {
        // The roadmap declaration has no `remaining:` support, so the concept
        // alias is gated off — the message must not point at status/remaining.
        const r = await parse(`roadmap r "R" start:2026-01-05 scale:1w progress:60\n`);
        const warnings = warningMessages(r.diagnostics);
        const hit = warnings.find((m) => /Unknown property "progress"/.test(m));
        expect(hit).toBeDefined();
        expect(hit).not.toMatch(/remaining:/);
    });

    it('NL.W0700: documented per-entity properties produce no warnings', async () => {
        const r = await parse(
            `${[
                `roadmap r "R" start:2026-01-05 length:6m scale:1w calendar:business author:"Jane"`,
                `  description "A roadmap"`,
                `swimlane s "S" owner:jane capacity:5 utilization-warn-at:80% utilization-over-at:100%`,
                `  anchor kickoff date:2026-01-05`,
                `  milestone launch date:2026-02-15`,
                `  item x "X" duration:1w status:in-progress owner:jane after:kickoff remaining:50%`,
                `  parallel`,
                `    item p1 "P1" duration:1w owner:jane`,
                `    item p2 "P2" duration:1w owner:jane`,
                `  group g1`,
                `    item g1a "G1A" duration:1w`,
                `    item g1b "G1B" duration:1w`,
                `  footnote fn1 "Note" on:x`,
                `person jane "Jane Doe"`,
                `team team-a "Team A"`,
            ].join('\n')}\n`,
        );
        const warnings = warningMessages(r.diagnostics).filter((m) => /Unknown property/.test(m));
        expect(warnings).toEqual([]);
    });

    it('NL.W0700: raw style key on an entity stays an error and does NOT emit a duplicate warning', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w bg:#ff0000\n`);
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/)).toBe(true);
        const warnings = warningMessages(r.diagnostics).filter((m) =>
            /Unknown property "bg"/.test(m),
        );
        expect(warnings).toEqual([]);
    });
});

describe('diagnostics that echo an item title', () => {
    // A title can carry an explicit line break (`\n` in the source parses to a
    // real newline, and the chart paints two lines), but a diagnostic is one
    // line of text: the break shows as a single space.
    it('shows "Technology\\nSelection" as "Technology Selection" in a message', async () => {
        // Title-only item with neither size: nor duration: NL.E0600 echoes its
        // title (`displayName`).
        const missing = await parse(`roadmap r\nswimlane s\n  item "Technology\\nSelection"\n`);
        const e0600 = errorMessages(missing.diagnostics).filter((m) =>
            /requires a "size:"/.test(m),
        );
        expect(e0600).toEqual([
            'Item "Technology Selection" requires a "size:" or "duration:" property.',
        ]);

        // An unknown property names the entity (`describeNode`), title-only too.
        const unknown = await parse(
            `roadmap r\nswimlane s\n  item "Technology\\nSelection" duration:1w foo:bar\n`,
        );
        const w0700 = warningMessages(unknown.diagnostics).filter((m) =>
            /Unknown property "foo"/.test(m),
        );
        expect(w0700).toHaveLength(1);
        expect(w0700[0]).toContain('item "Technology Selection"');

        // No diagnostic carries a raw line break.
        for (const m of [...e0600, ...w0700]) expect(m).not.toMatch(/[\r\n]/);
    });
});

// `non-working` is a roadmap style key (specs/dsl.md style table, rule 19 and
// 20; specs/working-calendar.md 4.2): `hide` or `show`, set on the config
// default line. Any other value is exactly one NL.E0800. The key is not in the
// generic enum table, so no NL.E0802 and no colour bypass reaches it.
describe('non-working style key', () => {
    const body = 'roadmap r\nswimlane s\n  item x duration:1w\n';
    const NBSP = '\u00A0';

    type Outcome = Awaited<ReturnType<typeof parse>>;

    const e0800 = (r: Outcome) =>
        r.diagnostics.filter((d) => (d.data as { code?: string } | undefined)?.code === 'NL.E0800');

    it('accepts hide and show on the default roadmap line', async () => {
        for (const value of ['hide', 'show']) {
            const r = await parse(`config\ndefault roadmap non-working:${value}\n${body}`);
            expect(errorMessages(r.diagnostics)).toEqual([]);
        }
    });

    it('rejects a word that is not hide or show with exactly one NL.E0800', async () => {
        const r = await parse(`config\ndefault roadmap non-working:maybe\n${body}`);
        expect(errorMessages(r.diagnostics)).toEqual([
            'Invalid non-working value "maybe". Use hide or show.',
        ]);
        expect(e0800(r)).toHaveLength(1);
    });

    it('rejects a colour literal with exactly one NL.E0800 (no colour bypass)', async () => {
        const r = await parse(`config\ndefault roadmap non-working:#fff\n${body}`);
        expect(errorMessages(r.diagnostics)).toEqual([
            'Invalid non-working value "#fff". Use hide or show.',
        ]);
        expect(e0800(r)).toHaveLength(1);
    });

    it('rejects a bad value in a style block with exactly one NL.E0800', async () => {
        const r = await parse(`config\nstyle night\n  non-working: maybe\n${body}`);
        expect(errorMessages(r.diagnostics)).toEqual([
            'Invalid non-working value "maybe". Use hide or show.',
        ]);
        expect(e0800(r)).toHaveLength(1);
    });

    it('accepts hide and show in a style block', async () => {
        for (const value of ['hide', 'show']) {
            const r = await parse(`config\nstyle night\n  non-working: ${value}\n${body}`);
            expect(errorMessages(r.diagnostics)).toEqual([]);
        }
    });

    it('rejects the key raw on the roadmap line with only the Rule 20 error', async () => {
        const r = await parse(`roadmap r non-working:show\nswimlane s\n  item x duration:1w\n`);
        const errors = errorMessages(r.diagnostics);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/Raw style property "non-working"/i);
        expect(e0800(r)).toEqual([]);
    });

    // The validator always writes the en-US text and stashes `{ code, args }`
    // for a surface to re-render in the operator's locale (specs/
    // localization.md), so the French text is checked from that data.
    it('translates the message into French', async () => {
        const r = await parse(
            `nowline v1 locale:fr\nconfig\ndefault roadmap non-working:maybe\n${body}`,
        );
        const [diag] = e0800(r);
        expect(e0800(r)).toHaveLength(1);
        const { code, args } = diag.data as { code: 'NL.E0800'; args: [{ value: string }] };
        expect(tr('fr', code, ...args)).toBe(
            `Valeur non-working invalide \u00AB${NBSP}maybe${NBSP}\u00BB. Utilisez hide ou show.`,
        );
    });
});

// Rule 19 style values and unknown style keys carry stable codes (NL.E0801
// colour, NL.E0802 enum, NL.E0803 unknown key). The English text predates the
// codes and must not change, so each case pins it exactly. Both paths are
// covered: a `style` block (checkStylePropertyEnum) and a `default` line
// (the entity-property switch).
describe('style value codes', () => {
    const body = 'roadmap r\nswimlane s\n  item x duration:1w\n';
    const NBSP = '\u00A0';

    type Outcome = Awaited<ReturnType<typeof parse>>;
    type Coded = { code: string; args: unknown[] };

    const coded = (r: Outcome) =>
        r.diagnostics
            .filter((d) => d.severity === 1)
            .map((d) => ({ message: d.message, data: d.data as Coded | undefined }));

    const cases: Array<{
        name: string;
        src: string;
        code: string;
        en: string;
        fr: string;
    }> = [
        {
            name: 'bad colour in a style block',
            src: `config\nstyle s1\n  bg: chartreuse-ish\n${body}`,
            code: 'NL.E0801',
            en: 'Invalid color "chartreuse-ish" for "bg". Use a named color, hex value, or "none".',
            fr: `Couleur invalide \u00AB${NBSP}chartreuse-ish${NBSP}\u00BB pour \u00AB${NBSP}bg${NBSP}\u00BB. Utilisez une couleur nommée, une valeur hexadécimale ou \u00AB${NBSP}none${NBSP}\u00BB.`,
        },
        {
            name: 'bad colour on a default line',
            src: `config\ndefault item fg:chartreuse-ish\n${body}`,
            code: 'NL.E0801',
            en: 'Invalid color "chartreuse-ish" for "fg". Use a named color, hex value, or "none".',
            fr: `Couleur invalide \u00AB${NBSP}chartreuse-ish${NBSP}\u00BB pour \u00AB${NBSP}fg${NBSP}\u00BB. Utilisez une couleur nommée, une valeur hexadécimale ou \u00AB${NBSP}none${NBSP}\u00BB.`,
        },
        {
            name: 'bad enum value in a style block',
            src: `config\nstyle s1\n  border: wavy\n${body}`,
            code: 'NL.E0802',
            en: 'Invalid value "wavy" for "border". Allowed: solid, dashed, dotted.',
            fr: `Valeur invalide \u00AB${NBSP}wavy${NBSP}\u00BB pour \u00AB${NBSP}border${NBSP}\u00BB. Valeurs admises${NBSP}: solid, dashed, dotted.`,
        },
        {
            name: 'bad enum value on a default line',
            src: `config\ndefault item shadow:loud\n${body}`,
            code: 'NL.E0802',
            en: 'Invalid value "loud" for "shadow". Allowed: none, subtle, soft, hard.',
            fr: `Valeur invalide \u00AB${NBSP}loud${NBSP}\u00BB pour \u00AB${NBSP}shadow${NBSP}\u00BB. Valeurs admises${NBSP}: none, subtle, soft, hard.`,
        },
        {
            name: 'unknown key in a style block',
            src: `config\nstyle s1\n  sparkle: lots\n${body}`,
            code: 'NL.E0803',
            en: 'Unknown style property "sparkle".',
            fr: `Propriété de style inconnue \u00AB${NBSP}sparkle${NBSP}\u00BB.`,
        },
    ];

    for (const c of cases) {
        it(`${c.name} is exactly one ${c.code} with unchanged English text`, async () => {
            const r = await parse(c.src);
            const errors = coded(r);
            expect(errors.map((e) => e.message)).toEqual([c.en]);
            expect(errors[0].data?.code).toBe(c.code);
        });

        it(`${c.name} renders ${c.code} in French from its data`, async () => {
            const r = await parse(c.src);
            const [error] = coded(r);
            // One code stands in for the case's code: `tr` is generic per code,
            // and the runtime lookup goes by the string either way.
            const { code, args } = error.data as { code: 'NL.E0803'; args: [{ key: string }] };
            expect(tr('fr', code, ...args)).toBe(c.fr);
        });
    }

    // Before the code, these messages fell to the text heuristic, which
    // mislabels a key or value that happens to contain one of its trigger
    // words (here "duration"). The stable code now wins.
    it('resolves to the stable code, not the message heuristic', async () => {
        const r = await parse(`config\nstyle s1\n  duration: long\n${body}`);
        const [diag] = r.diagnostics.filter((d) => d.severity === 1);
        expect(diag.message).toBe('Unknown style property "duration".');
        expect(resolveDiagnosticCode(diag)).toBe('NL.E0803');
    });
});

// Rule 20: header-height, timeline-position, minor-grid and non-working are
// read only from the roadmap's style. On another entity's `default` line they
// do nothing, so they warn (NL.W0703). Style blocks are left alone: one block
// can serve the roadmap and other entities alike.
describe('NL.W0703: roadmap-only style key on another default', () => {
    const body = 'roadmap r\nswimlane s\n  item x duration:1w\n';
    const NBSP = ' ';

    type Outcome = Awaited<ReturnType<typeof parse>>;

    const w0703 = (r: Outcome) =>
        r.diagnostics.filter((d) => (d.data as { code?: string } | undefined)?.code === 'NL.W0703');

    it.each([
        ['item', 'minor-grid:true'],
        ['swimlane', 'non-working:show'],
        ['group', 'header-height:lg'],
        ['milestone', 'timeline-position:both'],
    ])('warns on default %s %s', async (entity, prop) => {
        const key = prop.split(':')[0];
        const r = await parse(`config\ndefault ${entity} ${prop}\n${body}`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
        expect(warningMessages(r.diagnostics)).toEqual([
            `"${key}" on "default ${entity}" is ignored: it is a roadmap-only style key. Set it on "default roadmap" instead.`,
        ]);
        expect(w0703(r)).toHaveLength(1);
    });

    it('warns once per roadmap-only key on the same line', async () => {
        const r = await parse(
            `config\ndefault swimlane minor-grid:true non-working:show padding:sm\n${body}`,
        );
        expect(w0703(r).map((d) => (d.data as { args: [{ key: string }] }).args[0].key)).toEqual([
            'minor-grid',
            'non-working',
        ]);
    });

    it('stays clean on default roadmap', async () => {
        const r = await parse(
            `config\ndefault roadmap minor-grid:true non-working:show header-height:lg timeline-position:both\n${body}`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        expect(warningMessages(r.diagnostics)).toEqual([]);
    });

    it('does not check style blocks', async () => {
        const r = await parse(
            `config\nstyle grid\n  minor-grid: true\n  non-working: show\ndefault swimlane style:grid\n${body}`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        expect(w0703(r)).toEqual([]);
    });

    it('keeps the value error alongside the warning for a bad value', async () => {
        const r = await parse(`config\ndefault item non-working:maybe\n${body}`);
        expect(errorMessages(r.diagnostics)).toEqual([
            'Invalid non-working value "maybe". Use hide or show.',
        ]);
        expect(w0703(r)).toHaveLength(1);
    });

    it('translates the message into French', async () => {
        const r = await parse(
            `nowline v1 locale:fr\nconfig\ndefault item minor-grid:true\n${body}`,
        );
        const [diag] = w0703(r);
        const { code, args } = diag.data as {
            code: 'NL.W0703';
            args: [{ key: string; entityType: string }];
        };
        expect(tr('fr', code, ...args)).toBe(
            `«${NBSP}minor-grid${NBSP}» sur «${NBSP}default item${NBSP}» est ignoré${NBSP}: c'est une clé de style propre à la roadmap. Définissez-la plutôt sur «${NBSP}default roadmap${NBSP}».`,
        );
    });
});
