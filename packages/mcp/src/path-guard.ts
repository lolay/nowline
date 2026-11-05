// The path-root sandbox for the server's file tools.
//
// A path is checked twice: lexically (resolved against the primary root, so a
// path that names somewhere outside is refused before anything is touched)
// and again after symlinks are resolved, so a link inside a root cannot reach
// a file outside every root. File tools also name the extensions they accept,
// checked on both the requested and the real path, so a `.nowline` link to a
// non-roadmap file is refused too.
//
// Spec: specs/mcp.md "Path roots".

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { InputRequiredError, PathOutsideRootError } from './diagnostics.js';
import { isInsideRoots, type WorkspaceRoots } from './workspace-roots.js';

/** The extension the roadmap file tools (`read`, `create`, `update`, `delete`, `path` inputs) accept. */
export const NOWLINE_EXTENSIONS = ['.nowline'] as const;

/** The extensions `render` / `export` may write: one per export format. */
export const OUTPUT_EXTENSIONS = ['.svg', '.png', '.pdf', '.html', '.md', '.xml', '.xlsx'] as const;

export interface GuardedPath {
    /** The path as requested, resolved against the primary root. Reported back to the client. */
    readonly abs: string;
    /** `abs` with every symlink resolved; what the tool reads or writes. */
    readonly real: string;
    /** The real allowed root `real` lies in; the include root for a roadmap read from `real`. */
    readonly root: string;
}

/** Symlinks followed before giving up, as the kernel's own limit (`ELOOP`). */
const MAX_SYMLINK_HOPS = 40;

function loopError(p: string): NodeJS.ErrnoException {
    const err: NodeJS.ErrnoException = new Error(`Too many symbolic links: ${p}`);
    err.code = 'ELOOP';
    return err;
}

/**
 * `p` with every symlink resolved, for a path that may not exist yet: the
 * real path of its deepest existing ancestor joined with the missing rest. A
 * dangling symlink resolves to where it points, so a write through it cannot
 * create a file outside the root.
 */
export async function realPathAllowingMissing(p: string, hops = 0): Promise<string> {
    if (hops > MAX_SYMLINK_HOPS) throw loopError(p);
    try {
        return await fs.realpath(p);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw err;
    }
    const stat = await fs.lstat(p).catch(() => undefined);
    if (stat?.isSymbolicLink()) {
        const target = path.resolve(path.dirname(p), await fs.readlink(p));
        return realPathAllowingMissing(target, hops + 1);
    }
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(await realPathAllowingMissing(parent, hops), path.basename(p));
}

/** Whether `p` is `root` or inside it. */
export function isWithin(root: string, p: string): boolean {
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    return p === root || p.startsWith(prefix);
}

function hasExtension(p: string, extensions: readonly string[]): boolean {
    const lower = p.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
}

/**
 * Resolve `filePath` against the primary root and check it lands inside an
 * allowed root, both as written and with symlinks resolved. With
 * `extensions`, the requested and the real path must each end in one of
 * them (`NL.MCP.INPUT` otherwise). Throws `PathOutsideRootError` for a path
 * outside every root (`NL.MCP.OUT_OF_ROOT`).
 */
export async function guardPath(
    filePath: string,
    roots: WorkspaceRoots,
    extensions?: readonly string[],
): Promise<GuardedPath> {
    const abs = path.resolve(roots.primary, filePath);
    if (!isInsideRoots(abs, roots)) {
        throw new PathOutsideRootError(filePath, roots.allowed.join(', '));
    }
    if (extensions && !hasExtension(abs, extensions)) {
        throw new InputRequiredError(
            `Path ${filePath} must end in ${extensions.join(', ')}; this tool does not touch other files.`,
        );
    }
    const real = await realPathAllowingMissing(abs);
    const realRoots = await Promise.all(roots.allowed.map((r) => realPathAllowingMissing(r)));
    const root = realRoots.find((r) => isWithin(r, real));
    if (root === undefined) {
        throw new PathOutsideRootError(filePath, roots.allowed.join(', '));
    }
    if (extensions && !hasExtension(real, extensions)) {
        throw new InputRequiredError(
            `Path ${filePath} is a link to a file that does not end in ${extensions.join(', ')}.`,
        );
    }
    return { abs, real, root };
}
