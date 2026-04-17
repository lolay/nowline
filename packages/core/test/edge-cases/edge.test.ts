import { describe, it, expect } from 'vitest';
import { parse, errorMessages } from '../helpers.js';

describe('edge cases', () => {
    it('parses an empty file without crashing', async () => {
        const r = await parse('', { validate: false });
        expect(r.lexerErrors).toEqual([]);
    });

    it('parses a file with only comments', async () => {
        const r = await parse('// hi\n/* multi\nline */\n', { validate: false });
        expect(r.lexerErrors).toEqual([]);
    });

    it('parses a file with only whitespace', async () => {
        const r = await parse('   \n\n\n', { validate: false });
        expect(r.lexerErrors).toEqual([]);
    });

    it('errors on a roadmap with no swimlanes (validation)', async () => {
        const r = await parse(`roadmap r "R"\n`, { validate: true });
        const errors = errorMessages(r.diagnostics);
        expect(errors.some((m) => /swimlane/i.test(m))).toBe(true);
    });

    it('parses a swimlane with no children (structural)', async () => {
        const r = await parse(`roadmap r\nswimlane s\nmilestone m "M"\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });
});
