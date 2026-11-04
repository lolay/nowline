import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { type RenderArgs, renderOnce } from './cli.js';

/**
 * Render into a scratch file and only replace `args.output` when the bytes
 * differ, so `changed-files` lists real modifications and an unchanged image
 * keeps its mtime. A missing output counts as changed.
 *
 * Returns whether the output changed. Throws when the render fails; the
 * existing output is left untouched in that case.
 */
export async function renderIfChanged(args: RenderArgs): Promise<boolean> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-action-'));
    // Keep the basename so the extension still matches the format.
    const tmpOutput = path.join(tmpDir, path.basename(args.output));

    try {
        await renderOnce({ ...args, output: tmpOutput });
        const next = await fs.readFile(tmpOutput);
        const current = await readIfExists(args.output);
        if (current?.equals(next)) {
            return false;
        }
        // Copy rather than rename: the temp dir may sit on another filesystem.
        await fs.copyFile(tmpOutput, args.output);
        return true;
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
}

async function readIfExists(filePath: string): Promise<Buffer | undefined> {
    try {
        return await fs.readFile(filePath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
        }
        throw err;
    }
}
