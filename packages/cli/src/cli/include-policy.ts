import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IncludePolicy } from '@nowline/core';
import { CliError, ExitCode } from '../io/exit-codes.js';
import type { ParsedArgs } from './args.js';

/** Where a run's includes may be read from, and where its root file sits. */
export interface IncludeSetup {
    /** Omitted: includes resolve anywhere, relative to the including file. */
    policy?: IncludePolicy;
    /** `--include-root` as a real path; included files are named relative to it. */
    root?: string;
    /**
     * The absolute path include resolution sees for the input: under a root,
     * a stdin input sits in the root and a file input is its real path, so
     * the working directory never affects resolution.
     */
    inputPath: string;
}

/**
 * Resolve `--no-includes` / `--include-root` (mutually exclusive, checked by
 * `parseArgv`). A root that is missing or not a directory is a usage error.
 * `inputPath` is the input's absolute path, or undefined for stdin.
 */
export async function resolveIncludeSetup(
    args: Pick<ParsedArgs, 'includeRoot' | 'noIncludes'>,
    inputPath: string | undefined,
    cwd: string,
): Promise<IncludeSetup> {
    const stdinPath = (dir: string): string => path.join(dir, 'stdin.nowline');
    if (args.noIncludes) {
        return { policy: { kind: 'disabled' }, inputPath: inputPath ?? stdinPath(cwd) };
    }
    if (args.includeRoot === undefined) {
        return { inputPath: inputPath ?? stdinPath(cwd) };
    }
    const root = await realDirectory(args.includeRoot, cwd);
    return {
        policy: { kind: 'rooted', root },
        root,
        inputPath: inputPath === undefined ? stdinPath(root) : await fs.realpath(inputPath),
    };
}

async function realDirectory(dir: string, cwd: string): Promise<string> {
    const notADirectory = new CliError(
        ExitCode.InputError,
        `nowline: invalid --include-root "${dir}". Expected an existing directory.`,
    );
    let real: string;
    try {
        real = await fs.realpath(path.resolve(cwd, dir));
    } catch {
        throw notADirectory;
    }
    if (!(await fs.stat(real)).isDirectory()) throw notADirectory;
    return real;
}
