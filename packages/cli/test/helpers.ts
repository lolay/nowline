import { spawn } from 'node:child_process';
import { closeSync, promises as fs, openSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(__dirname, '..');
export const repoRoot = path.resolve(packageRoot, '..', '..');
export const examplesDir = path.join(repoRoot, 'examples');

export interface RunResult {
    exitCode: number;
    stdout: string;
    /** Raw stdout, for binary formats (`-f png -o -`) that a UTF-8 decode would mangle. */
    stdoutBytes: Buffer;
    stderr: string;
}

export interface RunOptions {
    stdin?: string;
    /** Connect fd 0 to this file, as a shell redirect (`nowline - < file`) would. Wins over `stdin`. */
    stdinFile?: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}

/**
 * Spawns the compiled CLI at `dist/index.js`. Requires `pnpm build` to have
 * been run. Used by integration tests; unit tests should call CLI internals
 * directly via imports.
 */
export function runCliBuilt(args: string[], options: RunOptions = {}): Promise<RunResult> {
    const entry = path.join(packageRoot, 'dist', 'index.js');
    return new Promise((resolve, reject) => {
        const stdinFd = options.stdinFile !== undefined ? openSync(options.stdinFile, 'r') : null;
        const child = spawn(process.execPath, [entry, ...args], {
            cwd: options.cwd ?? packageRoot,
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...options.env },
            stdio: [stdinFd ?? 'pipe', 'pipe', 'pipe'],
        });
        if (stdinFd !== null) closeSync(stdinFd);
        // Decode once at close: a multi-byte character can straddle two chunks.
        const stdoutChunks: Buffer[] = [];
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => {
            stdoutChunks.push(d);
        });
        child.stderr.on('data', (d: Buffer) => {
            stderr += d.toString('utf-8');
        });
        child.on('error', reject);
        child.on('close', (code) => {
            const stdoutBytes = Buffer.concat(stdoutChunks);
            resolve({
                exitCode: code ?? 0,
                stdout: stdoutBytes.toString('utf-8'),
                stdoutBytes,
                stderr,
            });
        });
        if (stdinFd !== null) return;
        if (options.stdin !== undefined) {
            child.stdin.end(options.stdin);
        } else {
            child.stdin.end();
        }
    });
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nowline-cli-'));
    try {
        return await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}
