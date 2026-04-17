import { describe, it, expect } from 'vitest';
import { parse, errorMessages, warningMessages } from '../helpers.js';

function hasError(diags: ReturnType<typeof errorMessages>, pattern: RegExp): boolean {
    return diags.some((m) => pattern.test(m));
}

describe('validation rules', () => {
    it('Rule 1: file must contain roadmap when used as primary file (no-op warning-only acceptable)', async () => {
        // A file with neither roadmap nor config is structurally empty; no errors expected.
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

    it('Rule 4: config must appear before roadmap', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w\nconfig\nscale weeks\n`);
        // Because grammar makes config optional and precedes roadmap, out-of-order will likely be a parse error;
        // either way a problem is reported.
        expect(r.parserErrors.length + errorMessages(r.diagnostics).length).toBeGreaterThan(0);
    });

    it('Rule 5: invalid version format is an error', async () => {
        const r = await parse(`nowline 1.0\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /Invalid version format|version/i)).toBe(true);
    });

    it('Rule 5: version beyond supported is an error', async () => {
        const r = await parse(`nowline v99\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /requires.*v99|only supports/i)).toBe(true);
    });

    it('Rule 6: roadmap without swimlane is an error', async () => {
        const r = await parse(`roadmap r "R"\n`);
        expect(hasError(errorMessages(r.diagnostics), /swimlane/i)).toBe(true);
    });

    it('Rule 11: anchor with invalid date is an error', async () => {
        const r = await parse(`roadmap r\nanchor kickoff 2026-13-45\nswimlane s\n  item x duration:1w\n`);
        // Lexer allows any 4-2-2 digit sequence; validator should reject invalid dates.
        const combined = r.parserErrors.concat(errorMessages(r.diagnostics));
        expect(combined.some((m) => /date|2026-13-45/i.test(m))).toBe(true);
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

    it('Rule 16: footnote without on is an error', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item x duration:1w\nfootnote "bad"\n`);
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

    it('Rule 22: duplicate config option on include is an error', async () => {
        const r = await parse(`include "./a.nowline" config:merge config:ignore\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /Duplicate "config"/i)).toBe(true);
    });

    it('Rule 23: unknown include mode is an error', async () => {
        const r = await parse(`include "./a.nowline" config:weird\nroadmap r\nswimlane s\n  item x duration:1w\n`);
        expect(hasError(errorMessages(r.diagnostics), /include mode|merge|ignore|isolate/i)).toBe(true);
    });

    it('Rule 29: parallel with one child emits a warning', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p\n    item a duration:1w\n`,
        );
        expect(warningMessages(r.diagnostics).some((m) => /Parallel/i.test(m))).toBe(true);
    });

    it('Rule 30: group with zero non-description children is an error', async () => {
        // Can\'t have a group block with zero children at grammar level; we test the structural rule.
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G"\n    description "d"\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /at least 1 child|Group/i)).toBe(true);
    });

    it('Rule 31: duration on parallel is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p duration:1w\n    item a duration:1w\n    item b duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /duration.*parallel|not valid on parallel/i)).toBe(true);
    });

    it('Rule 31: remaining on group is an error', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G" remaining:30%\n    item a duration:1w\n`,
        );
        expect(hasError(errorMessages(r.diagnostics), /remaining.*group|not valid on group/i)).toBe(true);
    });

    it('Rule 10 (labels kebab-case warning)', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item x duration:1w labels:BadLabel\n`,
        );
        // BadLabel is a valid ID but not kebab-case. Our impl only warns if not kebab — since PascalCase is a valid ID but fails kebab regex.
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
            `roadmap r\nanchor kickoff 2026-01-06\nswimlane s\n  item a duration:1w\n`,
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
            `roadmap r\nanchor kickoff 2026-01-06\nanchor midyear 2026-07-01\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-12-01\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /missing "start:"|missing start/i.test(m));
        expect(matches.length).toBe(3);
    });

    it('R2: undated milestone in a roadmap without start is not flagged', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w\nmilestone beta "Beta" depends:a\n`,
        );
        expect(errorMessages(r.diagnostics).some((m) => /missing "start:"/i.test(m))).toBe(false);
    });

    // --- R3: dated entities must not precede start: (per offender) ---

    it('R3: anchor before roadmap start is an error', async () => {
        const r = await parse(
            `roadmap r start:2026-02-01\nanchor kickoff 2026-01-06\nswimlane s\n  item a duration:1w\n`,
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

    it('R3: one anchor and one milestone both before start produce two errors', async () => {
        const r = await parse(
            `roadmap r start:2026-02-01\nanchor kickoff 2026-01-06\nswimlane s\n  item a duration:1w\nmilestone ga "GA" date:2026-01-15\n`,
        );
        const matches = errorMessages(r.diagnostics).filter((m) => /before roadmap start/i.test(m));
        expect(matches.length).toBe(2);
    });

    it('R3: anchor equal to start is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-06\nanchor kickoff 2026-01-06\nswimlane s\n  item a duration:1w\n`,
        );
        expect(errorMessages(r.diagnostics)).toEqual([]);
    });

    it('R3: anchor after start is accepted', async () => {
        const r = await parse(
            `roadmap r start:2026-01-01\nanchor kickoff 2026-01-06\nswimlane s\n  item a duration:1w\n`,
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
            `roadmap r start:not-a-date\nanchor kickoff 2000-01-01\nswimlane s\n  item a duration:1w\n`,
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
});
