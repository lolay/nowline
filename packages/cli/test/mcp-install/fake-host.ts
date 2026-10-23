import { existsSync, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HostEnv, SpawnResult } from '../../src/mcp-install/host.js';

export interface FakeHost extends HostEnv {
    spawned: string[][];
}

/**
 * A host rooted in a fresh temp dir: `home` and `cwd` are real directories so
 * the handler's file writes land somewhere disposable; PATH and spawn are
 * fakes driven by `binaries` and `spawnResult`.
 */
export function fakeHost(
    overrides: Partial<HostEnv> & {
        binaries?: Record<string, string[]>;
        spawnResult?: (command: string, args: readonly string[]) => SpawnResult;
    } = {},
): FakeHost {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-install-'));
    const { binaries = {}, spawnResult, ...rest } = overrides;
    const spawned: string[][] = [];
    return {
        platform: 'linux',
        home: path.join(root, 'home'),
        cwd: path.join(root, 'project'),
        env: {},
        execPath: '/usr/local/bin/nowline',
        argv1: undefined,
        isCompiledBinary: true,
        exists: existsSync,
        realpath: (p) => p,
        findAllOnPath: (name) => binaries[name] ?? [],
        spawn: (command, args) => {
            spawned.push([command, ...args]);
            return spawnResult?.(command, args) ?? { status: 0, stdout: '', stderr: '' };
        },
        spawned,
        ...rest,
    };
}
