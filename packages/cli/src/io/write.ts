import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CliError, ExitCode } from './exit-codes.js';

export interface WriteOutputOptions {
    force?: boolean;
    cwd?: string;
    writeFile?: (absPath: string, data: string | Uint8Array) => Promise<void>;
    fileExists?: (absPath: string) => Promise<boolean>;
    stdoutWrite?: (data: string | Uint8Array) => boolean;
    stdoutIsTTY?: boolean;
}

export async function writeOutput(
    outputArg: string | undefined,
    data: string | Uint8Array,
    format: OutputFormat,
    options: WriteOutputOptions = {},
): Promise<void> {
    if (!outputArg) {
        guardBinaryStdout(format, options);
        const write = options.stdoutWrite ?? ((chunk) => process.stdout.write(chunk));
        const payload = ensureTrailingNewline(data, format);
        write(payload);
        return;
    }

    const cwd = options.cwd ?? process.cwd();
    const absPath = path.resolve(cwd, outputArg);

    if (!options.force) {
        const exists = options.fileExists ?? defaultFileExists;
        if (await exists(absPath)) {
            throw new CliError(
                ExitCode.OutputError,
                `Refusing to overwrite ${outputArg} without --force`,
            );
        }
    }

    const writeFile = options.writeFile ?? ((p, d) => fs.writeFile(p, d));
    try {
        await writeFile(absPath, data);
    } catch (err) {
        throw new CliError(ExitCode.OutputError, formatWriteError(outputArg, err));
    }
}

export type OutputFormat = 'text' | 'binary';

function guardBinaryStdout(format: OutputFormat, options: WriteOutputOptions): void {
    if (format !== 'binary') return;
    const isTTY = options.stdoutIsTTY ?? process.stdout.isTTY === true;
    if (isTTY) {
        throw new CliError(
            ExitCode.OutputError,
            'Refusing to write binary output to a terminal. Use -o <path> to write to a file.',
        );
    }
}

function ensureTrailingNewline(data: string | Uint8Array, format: OutputFormat): string | Uint8Array {
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

async function defaultFileExists(absPath: string): Promise<boolean> {
    try {
        await fs.access(absPath);
        return true;
    } catch {
        return false;
    }
}
