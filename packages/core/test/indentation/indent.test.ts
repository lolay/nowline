import { describe, it, expect } from 'vitest';
import { parse, errorMessages } from '../helpers.js';

describe('indentation', () => {
    it('rejects mixed tabs and spaces (spaces then tab on different lines)', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w\n\tparallel\n`, { validate: false });
        expect(r.lexerErrors.length + r.parserErrors.length).toBeGreaterThan(0);
    });

    it('rejects mixed tabs and spaces within a single indent line', async () => {
        const r = await parse(`roadmap r\nswimlane s\n \titem x duration:1w\n`);
        expect(errorMessages(r.diagnostics).some((m) => /mixed tabs and spaces/i.test(m))).toBe(true);
    });

    it('accepts tab-only indentation consistently', async () => {
        const r = await parse(`roadmap r\nswimlane s\n\titem x duration:1w\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
        expect(r.lexerErrors).toEqual([]);
    });

    it('ignores blank lines between indented blocks', async () => {
        const r = await parse(`roadmap r\nswimlane s\n  item a duration:1w\n\n  item b duration:2w\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('handles multiple DEDENTs at once (deeply nested to top-level)', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p\n    group g\n      item a duration:1w\n      item b duration:1w\nmilestone m "M" depends:a\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('handles implicit DEDENT at end of file', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p\n    item a duration:1w\n    item b duration:1w`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('handles comment-only lines inside an indented block', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  // a note\n  item a duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });
});
