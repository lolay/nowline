import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, realpathSync, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface SpawnResult {
    status: number | null;
    stdout: string;
    stderr: string;
    /** Set when the process couldn't start or timed out. */
    error?: string;
}

/**
 * Everything `--mcp-install` reads from the machine, behind one seam so the
 * client table and server resolution are testable without touching $HOME or
 * spawning real harnesses.
 */
export interface HostEnv {
    platform: NodeJS.Platform;
    home: string;
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    execPath: string;
    argv1: string | undefined;
    /** True for the Bun-compiled standalone binary (Homebrew, .deb, release downloads). */
    isCompiledBinary: boolean;
    exists(p: string): boolean;
    realpath(p: string): string;
    /** Every executable named `name` on PATH, in PATH order. */
    findAllOnPath(name: string): string[];
    spawn(command: string, args: readonly string[]): SpawnResult;
}

const SPAWN_TIMEOUT_MS = 30_000;

export function createHostEnv(): HostEnv {
    const platform = process.platform;
    const env = process.env;
    const findAllOnPath = (name: string): string[] => {
        const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
        const exts =
            platform === 'win32'
                ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
                : [''];
        const found: string[] = [];
        for (const dir of dirs) {
            for (const ext of exts) {
                const candidate = path.join(dir, name + ext.toLowerCase());
                if (isExecutable(candidate, platform)) found.push(candidate);
            }
        }
        return found;
    };
    const bunVersion = (process.versions as Record<string, string | undefined>).bun;
    return {
        platform,
        home: os.homedir(),
        cwd: process.cwd(),
        env,
        execPath: process.execPath,
        argv1: process.argv[1],
        isCompiledBinary:
            bunVersion !== undefined && !/^bun(\.exe)?$/i.test(path.basename(process.execPath)),
        exists: existsSync,
        realpath: (p) => {
            try {
                return realpathSync(p);
            } catch {
                return path.resolve(p);
            }
        },
        findAllOnPath,
        spawn: (command, args) => {
            const resolved = findAllOnPath(command)[0] ?? command;
            // Node refuses to spawn .cmd/.bat shims without a shell (CVE-2024-27980).
            const needsShell = platform === 'win32' && /\.(cmd|bat)$/i.test(resolved);
            const result = spawnSync(
                needsShell ? `"${resolved}"` : resolved,
                needsShell ? args.map((a) => `"${a.replace(/"/g, '""')}"`) : [...args],
                {
                    encoding: 'utf-8',
                    // No stdin: a harness that prompts fails fast instead of hanging.
                    stdio: ['ignore', 'pipe', 'pipe'],
                    timeout: SPAWN_TIMEOUT_MS,
                    shell: needsShell,
                },
            );
            return {
                status: result.status,
                stdout: result.stdout ?? '',
                stderr: result.stderr ?? '',
                error: result.error?.message,
            };
        },
    };
}

function isExecutable(candidate: string, platform: NodeJS.Platform): boolean {
    try {
        accessSync(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
        return statSync(candidate).isFile();
    } catch {
        return false;
    }
}
