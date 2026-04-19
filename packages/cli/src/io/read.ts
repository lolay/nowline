import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CliError, ExitCode } from './exit-codes.js';

export interface ReadInputResult {
    contents: string;
    path: string;
    displayPath: string;
    isStdin: boolean;
}

export interface ReadInputOptions {
    readFile?: (absPath: string) => Promise<string>;
    readStdin?: () => Promise<string>;
    cwd?: string;
}

export async function readInput(
    inputArg: string,
    options: ReadInputOptions = {},
): Promise<ReadInputResult> {
    const readFile = options.readFile ?? ((p) => fs.readFile(p, 'utf-8'));
    const readStdin = options.readStdin ?? defaultReadStdin;
    const cwd = options.cwd ?? process.cwd();

    if (inputArg === '-') {
        return {
            contents: await readStdin(),
            path: '<stdin>',
            displayPath: '<stdin>',
            isStdin: true,
        };
    }

    const absPath = path.resolve(cwd, inputArg);
    try {
        const contents = await readFile(absPath);
        return {
            contents,
            path: absPath,
            displayPath: inputArg,
            isStdin: false,
        };
    } catch (err) {
        throw new CliError(ExitCode.InputError, formatReadError(inputArg, err));
    }
}

function formatReadError(inputArg: string, err: unknown): string {
    if (isNodeError(err)) {
        if (err.code === 'ENOENT') return `File not found: ${inputArg}`;
        if (err.code === 'EACCES') return `Permission denied: ${inputArg}`;
        if (err.code === 'EISDIR') return `Not a file: ${inputArg}`;
    }
    const message = err instanceof Error ? err.message : String(err);
    return `Could not read ${inputArg}: ${message}`;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
    return err instanceof Error && typeof (err as { code?: unknown }).code === 'string';
}

async function defaultReadStdin(): Promise<string> {
    let data = '';
    process.stdin.setEncoding('utf-8');
    for await (const chunk of process.stdin) {
        data += chunk;
    }
    return data;
}
