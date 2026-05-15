import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import * as core from '@actions/core';
import fastGlob from 'fast-glob';

import { ensureCli, renderOnce } from './cli.js';
import type { ActionInputs, RunResult } from './inputs.js';
import { applyEdits, type BlockEdit } from './markdown-edit.js';
import { type ScannedBlock, scanMarkdown } from './markdown-scan.js';

const DEFAULT_GLOB_IGNORE = ['**/node_modules/**', '**/.git/**'];

export async function runMarkdownMode(inputs: ActionInputs): Promise<RunResult> {
    await ensureCli(inputs.cliVersion);

    const repoRoot = process.cwd();
    const outputDir = path.resolve(repoRoot, inputs.outputDir);
    await fs.mkdir(outputDir, { recursive: true });

    const markdownFiles = await fastGlob(inputs.files, {
        cwd: repoRoot,
        ignore: DEFAULT_GLOB_IGNORE,
        onlyFiles: true,
        absolute: true,
    });

    if (markdownFiles.length === 0) {
        core.warning(`no markdown files matched "${inputs.files}"`);
        return { rendered: 0, failed: 0, changedFiles: [] };
    }

    let rendered = 0;
    let failed = 0;
    const changedFiles: string[] = [];

    for (const mdPath of markdownFiles) {
        const fileResult = await processMarkdownFile({
            mdPath,
            outputDir,
            format: inputs.format,
            theme: inputs.theme,
        });
        rendered += fileResult.rendered;
        failed += fileResult.failed;
        for (const renderedPath of fileResult.renderedPaths) {
            changedFiles.push(path.relative(repoRoot, renderedPath));
        }
        if (fileResult.markdownChanged) {
            changedFiles.push(path.relative(repoRoot, mdPath));
        }
    }

    return { rendered, failed, changedFiles };
}

interface FileResult {
    rendered: number;
    failed: number;
    markdownChanged: boolean;
    renderedPaths: string[];
}

interface ProcessMarkdownFileArgs {
    mdPath: string;
    outputDir: string;
    format: 'svg' | 'png';
    theme: 'light' | 'dark';
}

async function processMarkdownFile(args: ProcessMarkdownFileArgs): Promise<FileResult> {
    const { mdPath, outputDir, format, theme } = args;
    const source = await fs.readFile(mdPath, 'utf-8');
    const { blocks } = scanMarkdown(source);

    if (blocks.length === 0) {
        return { rendered: 0, failed: 0, markdownChanged: false, renderedPaths: [] };
    }

    core.info(
        `scanning ${path.relative(process.cwd(), mdPath)} (${blocks.length} block${blocks.length === 1 ? '' : 's'})`,
    );

    const successful: BlockEdit[] = [];
    const renderedPaths: string[] = [];
    let rendered = 0;
    let failed = 0;

    for (const block of blocks) {
        const outPath = path.join(outputDir, `nowline-${block.slug}.${format}`);
        const success = await renderBlock({ block, outPath, format, theme });
        if (success) {
            rendered += 1;
            renderedPaths.push(outPath);
            successful.push({
                block,
                imagePath: relativeImagePath(mdPath, outPath),
            });
        } else {
            failed += 1;
        }
    }

    if (successful.length === 0) {
        return { rendered, failed, markdownChanged: false, renderedPaths };
    }

    const updated = applyEdits(source, successful);
    if (updated === source) {
        return { rendered, failed, markdownChanged: false, renderedPaths };
    }

    await fs.writeFile(mdPath, updated, 'utf-8');
    return { rendered, failed, markdownChanged: true, renderedPaths };
}

interface RenderBlockArgs {
    block: ScannedBlock;
    outPath: string;
    format: 'svg' | 'png';
    theme: 'light' | 'dark';
}

async function renderBlock(args: RenderBlockArgs): Promise<boolean> {
    const tmpFile = path.join(
        os.tmpdir(),
        `nowline-action-${args.block.slug}-${process.pid}.nowline`,
    );

    try {
        await fs.writeFile(tmpFile, args.block.source, 'utf-8');
        await renderOnce({
            input: tmpFile,
            output: args.outPath,
            format: args.format,
            theme: args.theme,
        });
        return true;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        core.error(`failed to render block ${args.block.slug}: ${message}`);
        return false;
    } finally {
        await fs.unlink(tmpFile).catch(() => undefined);
    }
}

/**
 * Compute the markdown-image-link-relative path from the .md file to the
 * rendered image. Image-link paths use forward slashes regardless of host
 * OS, so we normalise the result.
 */
function relativeImagePath(mdPath: string, outPath: string): string {
    const rel = path.relative(path.dirname(mdPath), outPath);
    return rel.split(path.sep).join('/');
}
