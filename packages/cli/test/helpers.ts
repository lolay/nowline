import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(__dirname, '..');
export const repoRoot = path.resolve(packageRoot, '..', '..');
export const examplesDir = path.join(repoRoot, 'examples');

export interface RunResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface RunOptions {
    stdin?: string;
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
        const child = spawn(process.execPath, [entry, ...args], {
            cwd: options.cwd ?? packageRoot,
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...options.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ exitCode: code ?? 0, stdout, stderr });
        });
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
