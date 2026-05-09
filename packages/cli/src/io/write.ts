import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CliError, ExitCode } from './exit-codes.js';

export interface WriteOutputOptions {
    /**
     * Current working directory used to resolve relative output paths. Defaults
     * to `process.cwd()`.
     */
    cwd?: string;
    /**
     * Test seam: writes the output bytes to `absPath`. Defaults to
     * `fs.writeFile`.
     */
    writeFile?: (absPath: string, data: string | Uint8Array) => Promise<void>;
    /**
     * Test seam: stdout writer. Defaults to `process.stdout.write`.
     */
    stdoutWrite?: (data: string | Uint8Array) => boolean;
    /**
     * Test seam: stdout-is-a-TTY override. Defaults to `process.stdout.isTTY`.
     */
    stdoutIsTTY?: boolean;
}

export type OutputFormat = 'text' | 'binary';

/**
 * Writes `data` to either a file (`outputArg` is a path) or stdout (`outputArg`
 * is `-` or `undefined` — though `undefined` is no longer the default; mode
 * dispatch always resolves a concrete path now).
 *
 * Existing files are silently overwritten. m2b.5 removed the `--force` gate;
 * matches POSIX redirection (`> file`) and every peer drawing CLI (mmdc, d2,
 * prettier, tsc, pandoc).
 */
export async function writeOutput(
    outputArg: string | undefined,
    data: string | Uint8Array,
    format: OutputFormat,
    options: WriteOutputOptions = {},
): Promise<void> {
    if (outputArg === undefined || outputArg === '-') {
        guardBinaryStdout(format, options);
        const write = options.stdoutWrite ?? ((chunk) => process.stdout.write(chunk));
        const payload = ensureTrailingNewline(data, format);
        write(payload);
        return;
    }

    const cwd = options.cwd ?? process.cwd();
    const absPath = path.resolve(cwd, outputArg);

    const writeFile = options.writeFile ?? ((p, d) => fs.writeFile(p, d));
    try {
        await writeFile(absPath, data);
    } catch (err) {
        throw new CliError(ExitCode.OutputError, formatWriteError(outputArg, err));
    }
}

function guardBinaryStdout(format: OutputFormat, options: WriteOutputOptions): void {
    if (format !== 'binary') return;
    const isTTY = options.stdoutIsTTY ?? process.stdout.isTTY === true;
    if (isTTY) {
        throw new CliError(
            ExitCode.InputError,
            'nowline: binary output to terminal refused; use -o <path> or pipe to a file.',
        );
    }
}

function ensureTrailingNewline(
    data: string | Uint8Array,
    format: OutputFormat,
): string | Uint8Array {
    if (format !== 'text') return data;
    if (typeof data !== 'string') return data;
    return data.endsWith('\n') ? data : `${data}\n`;
}

function formatWriteError(outputArg: string, err: unknown): string {
    if (isNodeError(err)) {
        if (err.code === 'EACCES') return `Permission denied: ${outputArg}`;
        if (err.code === 'ENOENT') return `Output directory does not exist: ${outputArg}`;
        if (err.code === 'EISDIR') return `Output path is a directory: ${outputArg}`;
    }
    const message = err instanceof Error ? err.message : String(err);
    return `Could not write ${outputArg}: ${message}`;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
    return err instanceof Error && typeof (err as { code?: unknown }).code === 'string';
}
