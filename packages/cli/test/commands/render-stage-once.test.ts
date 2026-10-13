import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { DefaultLangiumDocumentFactory } from 'langium';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { renderHandler } from '../../src/commands/render.js';
import { withTempDir } from '../helpers.js';

// A render parses its roadmap once (specs/surface-options.md §5, counting
// tests): the validator's document is the one the stage and the export use.
// `create` is where every Langium document, from this file or from an include,
// is built.
const created = vi.spyOn(DefaultLangiumDocumentFactory.prototype, 'create');

// The first render in a process also builds the language's own setup documents;
// warm up so the counts below are the render's.
beforeAll(async () => {
    await render({ 'main.nowline': ROOT });
});

afterEach(() => {
    created.mockClear();
});

const ROOT =
    'nowline v1\n\nroadmap r "R" start:2026-01-05\n\nswimlane a "A"\n  item x duration:1w\n';

const WITH_INCLUDE =
    'nowline v1\n\ninclude "./part.nowline" roadmap:isolate\n\nroadmap r "R" start:2026-01-05\n\nswimlane a "A"\n  item x duration:1w\n';
const PART =
    'nowline v1\n\nroadmap p "P" start:2026-01-05\n\nswimlane b "B"\n  item y duration:1w\n';

async function render(files: Record<string, string>, flags: string[] = []): Promise<void> {
    await withTempDir(async (dir) => {
        for (const [name, text] of Object.entries(files)) {
            await fs.writeFile(path.join(dir, name), text);
        }
        const args = parseArgv(['main.nowline', '--dry-run', '--now', '2026-01-07', ...flags]);
        await renderHandler({ args, cwd: dir });
    });
}

describe('render: one Langium document per file', () => {
    it.each([
        ['svg', ['-f', 'svg']],
        ['json', ['-f', 'json']],
        ['mermaid', ['-f', 'mermaid']],
    ])('builds one document for a single-file %s render', async (_format, flags) => {
        await render({ 'main.nowline': ROOT }, flags);
        expect(created).toHaveBeenCalledTimes(1);
    });

    it('builds one document for the file and one for each include', async () => {
        await render({ 'main.nowline': WITH_INCLUDE, 'part.nowline': PART });
        expect(created).toHaveBeenCalledTimes(2);
    });
});
