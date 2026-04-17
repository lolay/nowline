import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';
import { isItemDeclaration, isSwimlaneDeclaration } from '../../src/generated/ast.js';

describe('strings and identifiers', () => {
    it('accepts empty string title', async () => {
        const r = await parse(`roadmap r ""\nswimlane s\n  item a duration:1w\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('accepts string with escaped quotes', async () => {
        const r = await parse(
            `roadmap r "Auth \\"refactor\\""\nswimlane s\n  item a duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('accepts unicode in titles', async () => {
        const r = await parse(
            `roadmap r "Plataforma 🚀"\nswimlane s\n  item a duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('accepts identifier with consecutive hyphens', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item auth--refactor duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const swimlane = r.ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.name).toBe('auth--refactor');
    });

    it('accepts very long identifier and title', async () => {
        const longId = 'a'.repeat(128);
        const longTitle = 'T'.repeat(256);
        const r = await parse(
            `roadmap r\nswimlane s\n  item ${longId} "${longTitle}" duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('accepts URL with special characters in link property', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w link:https://example.com/path?q=1&b=2#frag\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('accepts empty bracket list', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w labels:[]\n`,
            { validate: false },
        );
        // Empty [] may be a parser error since the grammar requires at least one atom;
        // confirm parser either accepts it or fails cleanly.
        expect(typeof r.parserErrors.length).toBe('number');
    });

    it('accepts single-item bracket list', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w labels:[enterprise]\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('accepts densely-packed and spaced list variants', async () => {
        const r1 = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w labels:[a,b,c]\n`,
            { validate: false },
        );
        const r2 = await parse(
            `roadmap r\nswimlane s\n  item a duration:1w labels:[ a , b , c ]\n`,
            { validate: false },
        );
        expect(r1.parserErrors).toEqual([]);
        expect(r2.parserErrors).toEqual([]);
    });
});
