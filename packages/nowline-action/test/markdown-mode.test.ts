import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/cli.js', () => ({
    ensureCli: vi.fn(async () => '0.0.0-test'),
    renderOnce: vi.fn(
        async (args: {
            input: string;
            output: string;
            format: 'svg' | 'png';
            theme: 'light' | 'dark';
        }) => {
            await fs.mkdir(path.dirname(args.output), { recursive: true });
            const source = await fs.readFile(args.input, 'utf-8');
            await fs.writeFile(
                args.output,
                `<!-- mock ${args.format}/${args.theme} -->\n${source}`,
                'utf-8',
            );
        },
    ),
}));

import { runMarkdownMode } from '../src/markdown-mode.js';

const MARKDOWN_FIXTURE = [
    '# Roadmap',
    '',
    '```nowline',
    'a -> b',
    '```',
    '',
    'Middle paragraph.',
    '',
    '```nowline',
    'c -> d',
    '```',
    '',
].join('\n');

describe('runMarkdownMode', () => {
    let workdir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-action-test-'));
        process.chdir(workdir);
        await fs.writeFile(path.join(workdir, 'roadmap.md'), MARKDOWN_FIXTURE, 'utf-8');
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await fs.rm(workdir, { recursive: true, force: true });
    });

    it('renders every block, edits the markdown, and lists changed paths', async () => {
        const result = await runMarkdownMode({
            mode: 'markdown',
            files: '**/*.md',
            outputDir: '.nowline/',
            format: 'svg',
            theme: 'light',
        });

        expect(result.rendered).toBe(2);
        expect(result.failed).toBe(0);

        const updated = await fs.readFile(path.join(workdir, 'roadmap.md'), 'utf-8');
        expect(updated).toContain('<!-- nowline:auto-rendered -->');
        expect(updated).toContain('<!-- nowline:auto-rendered-end -->');
        expect(updated).toContain('![Nowline roadmap](.nowline/nowline-');
        expect(updated).toContain('Middle paragraph.');

        const renderedFiles = result.changedFiles.filter((f) => f.startsWith('.nowline/'));
        expect(renderedFiles).toHaveLength(2);
        for (const f of renderedFiles) {
            expect(f).toMatch(/\.nowline\/nowline-[0-9a-f]{12}\.svg$/);
            const stat = await fs.stat(path.join(workdir, f));
            expect(stat.isFile()).toBe(true);
        }
        expect(result.changedFiles).toContain('roadmap.md');
    });

    it('is idempotent on a second run with no source changes', async () => {
        await runMarkdownMode({
            mode: 'markdown',
            files: '**/*.md',
            outputDir: '.nowline/',
            format: 'svg',
            theme: 'light',
        });
        const after1 = await fs.readFile(path.join(workdir, 'roadmap.md'), 'utf-8');

        const result2 = await runMarkdownMode({
            mode: 'markdown',
            files: '**/*.md',
            outputDir: '.nowline/',
            format: 'svg',
            theme: 'light',
        });
        const after2 = await fs.readFile(path.join(workdir, 'roadmap.md'), 'utf-8');

        expect(after2).toBe(after1);
        expect(result2.rendered).toBe(2);
        expect(result2.failed).toBe(0);
        expect(result2.changedFiles.filter((f) => f === 'roadmap.md')).toHaveLength(0);
    });

    it('returns zero counts when the glob matches no files', async () => {
        await fs.rm(path.join(workdir, 'roadmap.md'));

        const result = await runMarkdownMode({
            mode: 'markdown',
            files: '**/*.md',
            outputDir: '.nowline/',
            format: 'svg',
            theme: 'light',
        });

        expect(result).toEqual({ rendered: 0, failed: 0, changedFiles: [] });
    });

    it('skips markdown files that contain no nowline blocks', async () => {
        await fs.writeFile(path.join(workdir, 'roadmap.md'), '# nothing here\n', 'utf-8');

        const result = await runMarkdownMode({
            mode: 'markdown',
            files: '**/*.md',
            outputDir: '.nowline/',
            format: 'svg',
            theme: 'light',
        });

        expect(result.rendered).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.changedFiles).toEqual([]);
    });
});
