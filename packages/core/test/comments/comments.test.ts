import { describe, expect, it } from 'vitest';
import { parse } from '../helpers.js';

describe('comments', () => {
    it('ignores single-line comments at start of line', async () => {
        const r = await parse(
            `// top-level comment\nroadmap r "R"\n// inside\nswimlane s\n  item a duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('ignores single-line comments at end of a line', async () => {
        const r = await parse(`roadmap r "R"\nswimlane s\n  item a duration:1w // trailing\n`, {
            validate: false,
        });
        expect(r.parserErrors).toEqual([]);
    });

    it('ignores block comments wrapping a declaration', async () => {
        const r = await parse(
            `roadmap r "R"\nswimlane s\n  item a duration:1w\n/* item hidden duration:1w */\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('treats // inside a double-quoted string as literal text', async () => {
        const r = await parse(`roadmap r "R // preserved"\nswimlane s\n  item a duration:1w\n`, {
            validate: false,
        });
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.roadmapDecl?.title).toContain('//');
    });

    it('treats /* inside a double-quoted string as literal text', async () => {
        const r = await parse(`roadmap r "R /* preserved */"\nswimlane s\n  item a duration:1w\n`, {
            validate: false,
        });
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.roadmapDecl?.title).toContain('/*');
    });

    it('errors on an unterminated block comment', async () => {
        const r = await parse(
            `roadmap r "R"\nswimlane s\n  item a duration:1w\n/* unterminated\n`,
            { validate: false },
        );
        expect(r.lexerErrors.length + r.parserErrors.length).toBeGreaterThan(0);
    });
});
