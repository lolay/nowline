import { promises as fs, readFileSync } from 'node:fs';
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
        const contents = await readStdin();
        if (contents.length === 0) {
            throw new CliError(ExitCode.InputError, 'nowline: no input on stdin');
        }
        return {
            contents,
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

// Read fd 0 directly. Iterating `process.stdin` returns empty input for a
// shell redirect (`nowline - < file`) in the compiled Bun binary; a
// synchronous fd read works for pipes, redirects and here-docs alike. A TTY
// still blocks until EOF, as before. When fd 0 is non-blocking (a terminal
// under node), the sync read throws EAGAIN/EWOULDBLOCK; fall back to the
// stream loop, which waits for Ctrl-D.
export async function readStdinFd(
    readFd: (fd: number, encoding: 'utf8') => string = readFileSync,
    stream: AsyncIterable<string | Buffer> & {
        setEncoding?: (e: BufferEncoding) => unknown;
    } = process.stdin,
): Promise<string> {
    try {
        return readFd(0, 'utf8');
    } catch (err) {
        // Windows reports a closed console stdin as EOF; nothing to read.
        if (isNodeError(err) && err.code === 'EOF') return '';
        if (isNodeError(err) && (err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK')) {
            return await readStdinStream(stream);
        }
        throw err;
    }
}

async function readStdinStream(
    stream: AsyncIterable<string | Buffer> & { setEncoding?: (e: BufferEncoding) => unknown },
): Promise<string> {
    let data = '';
    stream.setEncoding?.('utf-8');
    for await (const chunk of stream) {
        data += chunk;
    }
    return data;
}

function defaultReadStdin(): Promise<string> {
    return readStdinFd();
}
