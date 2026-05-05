import { describe, it, expect } from 'vitest';
import { parse, errorMessages, warningMessages } from '../helpers.js';

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
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w\nconfig\nscale\n  name: weeks\n`);
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
        const r = await parse(`roadmap r start:2026-01-01\nanchor kickoff date:2026-13-45\nswimlane s\n  item x duration:1w\n`);
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

    it('Rule 15: forward reference to a duration is an error', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item a duration:md
duration md length:1w
`,
        );
        expect(hasError(errorMessages(r.diagnostics), /referenced before its declaration|Duration "md"/i)).toBe(true);
    });

    it('Rule 15: undeclared duration name is an error', async () => {
        const r = await parse(
            `roadmap r
swimlane s
  item a duration:mystery
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
        expect(hasError(errorMessages(r.diagnostics), /Status.*referenced before its declaration|Status "awaiting-review" is not a built-in/i)).toBe(true);
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

    it('Rule 17: bg with bad color is an error', async () => {
        const r = await parse(`config\nstyle bad\n  bg: xyzzy\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /color|bg/i)).toBe(true);
    });

    it('Rule 17: bg with hex color is accepted', async () => {
        const r = await parse(`config\nstyle ok\n  bg: #abcdef\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 18: border with invalid value is an error', async () => {
        const r = await parse(`config\nstyle s1\n  border: squiggly\nroadmap r\nswimlane s\n  item x duration:1w\n`);
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
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "header-position"/i)).toBe(true);
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

    it('Rule 20: raw timeline-position on roadmap declaration is an error', async () => {
        const r = await parse(
            `roadmap r timeline-position:both\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "timeline-position"/i)).toBe(true);
    });

    it('Rule 20: raw style property on item is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w bg:red\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on label is an error', async () => {
        const r = await parse(
            `roadmap r\nlabel urgent "Urgent" bg:red\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "bg"/i)).toBe(true);
    });

    it('Rule 20: raw style property on swimlane is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s bg:red\n  item x duration:1w\n`,
        );
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
        expect(hasError(errorMessages(r.diagnostics), /"duration" cannot be set on "default item"/i)).toBe(true);
    });

    it('Rule 24: after: reference that does not resolve is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w after:nonexistent\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /after: reference.*does not resolve/i)).toBe(true);
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
        const r = await parse(`include "./a.nowline" config:merge config:ignore\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /Duplicate "config"/i)).toBe(true);
    });

    it('Include rule: unknown include mode is an error', async () => {
        const r = await parse(`include "./a.nowline" config:weird\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /include mode|merge|ignore|isolate/i)).toBe(true);
    });

    it('Parallel rule: parallel with one child emits a warning', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p\n    item a duration:1w\n`,
        );
        expect(warningMessages(r.diagnostics).some((m) => /Parallel/i.test(m))).toBe(true);
    });

    it('Group rule: group with zero non-description children is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G"\n    description "d"\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /at least 1 child|Group/i)).toBe(true);
    });

    it('Parallel/group rule: duration on parallel is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p duration:1w\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /duration.*parallel|not valid on parallel/i)).toBe(true);
    });

    it('Parallel/group rule: remaining on group is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G" remaining:30%\n    item a duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /remaining.*group|not valid on group/i)).toBe(true);
    });

    it('Label rule: non-kebab label emits a warning', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w labels:BadLabel\n`,
        );
        expect(warningMessages(r.diagnostics).some((m) => /kebab/i.test(m))).toBe(true);
    });

    // --- R1: roadmap start: format ---

    it('R1: roadmap start with invalid format is an error', async () => {
        const r = await parse(
            `roadmap r start:not-a-date\nswimlane s\n  item a duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /start.*ISO 8601|Invalid start/i)).toBe(true);
    });

    it('R1: roadmap start with calendar-invalid value is an error', async () => {
        const r = await parse(
            `roadmap r start:2026-13-45\nswimlane s\n  item a duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /start|Invalid/i)).toBe(true);
    });

    it('R1: valid roadmap start is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- R2: dated roadmap requires start: (per offender) ---

    it('R2: a single anchor without roadmap start is an error on the anchor', async () => {
        const r = await parse(
            `roadmap r\nanchor kickoff date:2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /missing "start:"|missing start/i.test(m));
        expect(matches.length).toBe(1);
        expect(matches[0]).toMatch(/Anchor/i);
    });

    it('R2: a dated milestone without roadmap start is an error on the milestone', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-06-01\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /missing "start:"|missing start/i.test(m));
        expect(matches.length).toBe(1);
        expect(matches[0]).toMatch(/Milestone/i);
    });

    it('R2: two anchors and a dated milestone without start produce three errors', async () => {
        const r = await parse(
            `roadmap r\nanchor kickoff date:2026-01-06\nanchor midyear date:2026-07-01\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-12-01\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /missing "start:"|missing start/i.test(m));
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

    // --- Duration declaration: length: is required ---

    it('Duration decl: missing length: is an error', async () => {
        const r = await parse(
            `roadmap r\nduration md\nswimlane s\n  item a duration:md\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /length/i)).toBe(true);
    });

    it('Duration decl: invalid length value is an error', async () => {
        const r = await parse(
            `roadmap r\nduration md length:maybe\nswimlane s\n  item a duration:md\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /length/i)).toBe(true);
    });

    it('Duration decl: quarter suffix is accepted in length: and in item duration:', async () => {
        const r = await parse(
            `roadmap r\nduration big length:1q\nswimlane s\n  item a duration:big\n  item b duration:2q\n`,
        );
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
        const r = await parse(
            `roadmap r calendar:full\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Calendar: unknown mode on roadmap is an error', async () => {
        const r = await parse(
            `roadmap r calendar:weekendly\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /calendar|business|full|custom/i)).toBe(true);
    });

    it('Calendar: custom calendar without a calendar block is an error', async () => {
        const r = await parse(
            `roadmap r calendar:custom\nswimlane s\n  item x duration:1w\n`,
        );
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
        expect(hasError(errorMessages(r.diagnostics), /Duplicate|already declared|Person "sam"/i)).toBe(true);
    });

    it('Person: declaring a person inside a team is accepted', async () => {
        const r = await parse(
            `roadmap r\nteam eng "Engineering"\n  person sam\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    // --- Capacity (rules 17a–17e) ---

    it('Rule 17a: positive integer/decimal capacity on swimlane is accepted', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        const r2 = await parse(
            `roadmap r\nswimlane s capacity:1.5\n  item x duration:1w\n`,
        );
        expect(errorMessages(r2.diagnostics)).toEqual([]);
    });

    it('Rule 17a: percent literal on swimlane capacity is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:50%\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /swimlane capacity.*Percent literals are not allowed/i)).toBe(true);
    });

    it('Rule 17a: zero swimlane capacity is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:0\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /swimlane capacity/i)).toBe(true);
    });

    it('Rule 17b: integer/decimal/percent on item capacity is accepted', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w capacity:2\n  item b duration:1w capacity:0.5\n  item c duration:1w capacity:50%\n  item d duration:1w capacity:12.5%\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17b: zero item capacity is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w capacity:0\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Item capacity.*positive/i)).toBe(true);
    });

    it('Rule 17c: capacity on parallel is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel "P" capacity:3\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity.*not valid on parallel/i)).toBe(true);
    });

    it('Rule 17c: capacity on group is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G" capacity:3\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity.*not valid on group/i)).toBe(true);
    });

    it('Rule 17d: overcapacity:show|hide on swimlane is accepted', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5 overcapacity:show\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
        const r2 = await parse(
            `roadmap r\nswimlane s capacity:5 overcapacity:hide\n  item x duration:1w\n`,
        );
        expect(errorMessages(r2.diagnostics)).toEqual([]);
    });

    it('Rule 17d: overcapacity bad value is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s overcapacity:maybe\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /overcapacity.*show.*hide/i)).toBe(true);
    });

    it('Rule 17d: overcapacity on item is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w overcapacity:hide\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /overcapacity.*only valid on.*swimlane/i)).toBe(true);
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

    it('Rule 17e: capacity-icon glyph reference is accepted when declared earlier', async () => {
        const r = await parse(
            `config\nglyph budget unicode:"💰"\nstyle finance\n  capacity-icon: budget\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17e: capacity-icon as inline property on roadmap entity is an error (rule 20)', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity-icon:person\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Raw style property "capacity-icon"/i)).toBe(true);
    });

    // --- Glyph declaration (rules 17f–17k) ---

    it('Rule 17f: glyph without unicode: is an error', async () => {
        const r = await parse(
            `config\nglyph budget "Budget"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /requires a "unicode/i)).toBe(true);
    });

    it('Rule 17g: glyph with empty unicode string is an error', async () => {
        const r = await parse(
            `config\nglyph budget unicode:""\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /unicode.*non-empty/i)).toBe(true);
    });

    it('Rule 17h: glyph ascii longer than 3 chars is an error', async () => {
        const r = await parse(
            `config\nglyph budget unicode:"💰" ascii:"BUDG"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /ascii.*1-3 ASCII/i)).toBe(true);
    });

    it('Rule 17h: glyph ascii of 1-3 ASCII chars is accepted', async () => {
        const r = await parse(
            `config\nglyph budget unicode:"💰" ascii:"$"\nglyph star unicode:"⭐" ascii:"*"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('Rule 17i: glyph id shadowing a built-in icon name is an error', async () => {
        const r = await parse(
            `config\nglyph points unicode:"💰"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /collides with a built-in icon name/i)).toBe(true);
    });

    it('Rule 17j: duplicate glyph ids are an error', async () => {
        const r = await parse(
            `config\nglyph budget unicode:"💰"\nglyph budget unicode:"$"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /Duplicate glyph id/i)).toBe(true);
    });

    it('Rule 17k: capacity-icon referencing an unknown glyph is an error', async () => {
        const r = await parse(
            `config\nstyle finance\n  capacity-icon: nonesuch\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity-icon.*nonesuch.*neither a built-in/i)).toBe(true);
    });

    it('Rule 17k: capacity-icon referencing a glyph declared later is a forward-reference error', async () => {
        const r = await parse(
            `config\nstyle finance\n  capacity-icon: budget\nglyph budget unicode:"💰"\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /capacity-icon.*budget.*before its declaration/i)).toBe(true);
    });

    it('Rule 17k: icon: referencing an unknown glyph is an error', async () => {
        const r = await parse(
            `config\nstyle finance\n  icon: mystery\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /icon.*mystery.*neither a built-in/i)).toBe(true);
    });

    it('Rule 17k: built-in icon name (shield) is accepted', async () => {
        const r = await parse(
            `config\nstyle danger\n  icon: shield\nroadmap r\nswimlane s\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('lane and item capacity are independent — item capacity without lane capacity is OK', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w capacity:3\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('lane capacity without item capacity is OK', async () => {
        const r = await parse(
            `roadmap r\nswimlane s capacity:5\n  item x duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });
});
