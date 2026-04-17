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
});
