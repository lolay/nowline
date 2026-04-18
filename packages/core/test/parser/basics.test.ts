import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';
import {
    isItemDeclaration,
    isSwimlaneDeclaration,
    isParallelBlock,
    isGroupBlock,
    isAnchorDeclaration,
    isFootnoteDeclaration,
    isMilestoneDeclaration,
    isTeamDeclaration,
} from '../../src/generated/ast.js';

describe('parser basics', () => {
    it('parses the minimal valid file', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  item x "x" duration:1w\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        expect(ast.roadmapDecl?.name).toBe('r');
        expect(ast.roadmapEntries).toHaveLength(1);
        const swimlane = ast.roadmapEntries[0];
        expect(isSwimlaneDeclaration(swimlane)).toBe(true);
    });

    it('parses nowline directive', async () => {
        const { parserErrors, ast } = await parse(
            `nowline v1\n\nroadmap r "R"\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        expect(ast.directive?.version).toBe('v1');
    });

    it('parses an item with id, title, and properties', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  item auth "Auth refactor" duration:2w status:done owner:sam\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const swimlane = ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.name).toBe('auth');
        expect(item.title).toBe('Auth refactor');
        const keys = item.properties.map((p) => p.key);
        expect(keys).toEqual(['duration', 'status', 'owner']);
    });

    it('parses title-only item (no id)', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  item "Quick cleanup" duration:3d\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const swimlane = ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.name).toBeUndefined();
        expect(item.title).toBe('Quick cleanup');
    });

    it('parses anchor with date: property', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R" start:2026-01-01\nanchor kickoff date:2026-01-06\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const anchor = ast.roadmapEntries[0];
        if (!isAnchorDeclaration(anchor)) throw new Error('expected anchor');
        expect(anchor.name).toBe('kickoff');
        expect(anchor.properties.find((p) => p.key === 'date')?.value).toBe('2026-01-06');
    });

    it('parses parallel with groups', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  parallel p\n    item a duration:1w\n    item b duration:1w\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const swimlane = ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const parallel = swimlane.content[0];
        if (!isParallelBlock(parallel)) throw new Error('expected parallel');
        expect(parallel.content).toHaveLength(2);
    });

    it('parses group with items', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  group g "G"\n    item a duration:1w\n    item b duration:1w\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const swimlane = ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const group = swimlane.content[0];
        if (!isGroupBlock(group)) throw new Error('expected group');
        expect(group.content).toHaveLength(2);
    });

    it('parses milestones with after list', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  item a duration:1w\n  item b duration:1w\nmilestone m "M" after:[a, b]\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const milestone = ast.roadmapEntries[1];
        if (!isMilestoneDeclaration(milestone)) throw new Error('expected milestone');
        const after = milestone.properties.find((p) => p.key === 'after');
        expect(after?.values.map((v) => v)).toEqual(['a', 'b']);
    });

    it('parses footnote with on and description', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nswimlane s\n  item audit duration:1w\nfootnote note "Risk" on:audit\n  description "Stuff."\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const footnote = ast.roadmapEntries[1];
        if (!isFootnoteDeclaration(footnote)) throw new Error('expected footnote');
        expect(footnote.properties.find((p) => p.key === 'on')?.value).toBe('audit');
        expect(footnote.description?.text).toBe('Stuff.');
    });

    it('parses nested teams', async () => {
        const { parserErrors, ast } = await parse(
            `roadmap r "R"\nteam eng "Engineering"\n  team platform "Platform"\n    person sam\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(parserErrors).toEqual([]);
        const team = ast.roadmapEntries[0];
        if (!isTeamDeclaration(team)) throw new Error('expected team');
        expect(team.name).toBe('eng');
        const nested = team.content.find((c) => isTeamDeclaration(c));
        expect(nested).toBeDefined();
    });
});
