import { describe, expect, it } from 'vitest';
import {
    isGroupBlock,
    isItemDeclaration,
    isParallelBlock,
    isSwimlaneDeclaration,
} from '../../src/generated/ast.js';
import { parse } from '../helpers.js';

describe('parallel and group', () => {
    it('parses groups inside parallel', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p\n    group g1\n      item a duration:1w\n    group g2\n      item b duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const swimlane = r.ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const parallel = swimlane.content[0];
        if (!isParallelBlock(parallel)) throw new Error('expected parallel');
        expect(parallel.content.filter(isGroupBlock)).toHaveLength(2);
    });

    it('parses parallel inside group', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group g "G"\n    parallel p\n      item a duration:1w\n      item b duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses group inside group', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  group outer\n    group inner\n      item a duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with title and properties', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  parallel p "Parallel work" after:start\n    item a duration:1w\n    item b duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const swimlane = r.ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const parallel = swimlane.content[0];
        if (!isParallelBlock(parallel)) throw new Error('expected parallel');
        expect(parallel.name).toBe('p');
        expect(parallel.title).toBe('Parallel work');
        expect(parallel.properties.find((p) => p.key === 'after')?.value).toBe('start');
    });

    it('parses an item with a description', async () => {
        const r = await parse(
            `roadmap r\nswimlane s\n  item a "A" duration:1w\n    description "Background details."\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const swimlane = r.ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.description?.text).toBe('Background details.');
    });
});
