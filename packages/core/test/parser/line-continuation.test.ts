import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';
import {
    isItemDeclaration,
    isSwimlaneDeclaration,
    isDefaultDeclaration,
} from '../../src/generated/ast.js';

// Regression coverage for https://github.com/lolay/nowline/issues/2.
// The trailing `\` line continuation is documented in specs/dsl.md
// (sections "Quick Notation Notes" #8 and "Line Continuation").
describe('line continuation', () => {
    it('parses the minimum failing case from issue #2', async () => {
        const r = await parse(
            `nowline v1

roadmap r "Continuation bug repro" start:2026-01-05 scale:1w calendar:business

anchor kickoff date:2026-01-05

swimlane platform "Platform"
  item auth-refactor "Auth refactor" duration:2w \\
    after:kickoff \\
    status:in-progress \\
    labels:[security, enterprise]
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
        const swimlane = r.ast.roadmapEntries.find(isSwimlaneDeclaration);
        if (!swimlane) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.name).toBe('auth-refactor');
        expect(item.properties.map((p) => p.key)).toEqual([
            'duration',
            'after',
            'status',
            'labels',
        ]);
    });

    it('parses the verbatim spec example from "Line Continuation"', async () => {
        const r = await parse(
            `nowline v1

config

default item shadow:subtle

roadmap r "Spec example" start:2026-01-05 scale:1w calendar:business

anchor kickoff date:2026-01-05

swimlane platform "Platform"
  item auth "Auth refactor" duration:2w status:in-progress \\
    owner:sam labels:[security,enterprise] \\
    link:https://linear.app/team/PRJ-123 \\
    style:flagged
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
        const swimlane = r.ast.roadmapEntries.find(isSwimlaneDeclaration);
        if (!swimlane) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.properties.map((p) => p.key)).toEqual([
            'duration',
            'status',
            'owner',
            'labels',
            'link',
            'style',
        ]);
    });

    it('produces the same AST whether continued or single-line', async () => {
        const continued = await parse(
            `roadmap r "R"
swimlane s
  item auth "Auth" duration:2w \\
    status:in-progress \\
    owner:sam
`,
            { validate: false },
        );
        const inlined = await parse(
            `roadmap r "R"
swimlane s
  item auth "Auth" duration:2w status:in-progress owner:sam
`,
            { validate: false },
        );
        expect(continued.parserErrors).toEqual([]);
        expect(inlined.parserErrors).toEqual([]);

        const pickItem = (ast: typeof continued.ast) => {
            const swimlane = ast.roadmapEntries[0];
            if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
            const item = swimlane.content[0];
            if (!isItemDeclaration(item)) throw new Error('expected item');
            return {
                name: item.name,
                title: item.title,
                properties: item.properties.map((p) => ({
                    key: p.key,
                    value: p.value,
                    values: p.values,
                })),
            };
        };
        expect(pickItem(continued.ast)).toEqual(pickItem(inlined.ast));
    });

    it('tolerates trailing whitespace between `\\` and the newline', async () => {
        const r = await parse(
            `roadmap r "R"
swimlane s
  item auth "Auth" duration:2w \\   
    status:in-progress
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
    });

    it('treats continuation indentation as cosmetic (no DEDENT)', async () => {
        // Continuation lines that start in column 0 must NOT close the
        // surrounding swimlane block. The next non-continuation line
        // (`item b ...`) must still belong to the swimlane.
        const r = await parse(
            `roadmap r "R"
swimlane s
  item a "A" duration:2w \\
status:in-progress \\
owner:sam
  item b "B" duration:1w
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
        const swimlane = r.ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        expect(swimlane.content).toHaveLength(2);
    });

    it('parses long `default` declarations with continuation', async () => {
        const r = await parse(
            `config
default item shadow:subtle \\
  bg:#eef \\
  border:#99c
roadmap r "R"
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
        const def = r.ast.configEntries.find(isDefaultDeclaration);
        if (!def) throw new Error('expected default declaration');
        expect(def.entityType).toBe('item');
        expect(def.properties.map((p) => p.key)).toEqual(['shadow', 'bg', 'border']);
    });

    it('does not interpret backslashes inside a STRING as continuations', async () => {
        const r = await parse(
            `roadmap r "R"
swimlane s
  item auth "Path is C:\\\\foo\\\\bar" duration:1w
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
        const swimlane = r.ast.roadmapEntries[0];
        if (!isSwimlaneDeclaration(swimlane)) throw new Error('expected swimlane');
        const item = swimlane.content[0];
        if (!isItemDeclaration(item)) throw new Error('expected item');
        expect(item.title).toBe('Path is C:\\foo\\bar');
    });

    it('handles multiple consecutive continuations', async () => {
        const r = await parse(
            `roadmap r "R"
swimlane s
  item a "A" duration:2w \\
    \\
    status:in-progress
`,
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
    });

    it('handles CRLF line endings around the continuation', async () => {
        const r = await parse(
            'roadmap r "R"\r\nswimlane s\r\n  item a "A" duration:2w \\\r\n    status:in-progress\r\n',
            { validate: false },
        );
        expect(r.lexerErrors, r.lexerErrors.join('\n')).toEqual([]);
        expect(r.parserErrors, r.parserErrors.join('\n')).toEqual([]);
    });
});
