import * as path from 'node:path';
import type { HostEnv } from './host.js';

export type ServerKind = 'self' | 'npx';

/** The stdio launch line every harness config stores. */
export interface ServerEntry {
    command: string;
    args: string[];
}

export interface ResolvedServer {
    entry: ServerEntry;
    /** Notices for stderr (dropped under `-q`). */
    warnings: string[];
}

/**
 * Decides what `--mcp-install` registers.
 *
 * `self` points at the installed `nowline`. The path is absolute because GUI
 * harnesses (Claude Desktop, Cursor, VS Code launched from the Dock) don't
 * inherit the shell PATH, and it is the stable PATH entry rather than the
 * realpath, so a Homebrew symlink keeps working across `brew upgrade` instead
 * of pinning `Cellar/nowline/<version>/`.
 *
 * `npx` registers `npx -y @nowline/mcp`, which tracks npm independently of
 * the CLI but needs Node visible to the harness.
 */
export function resolveServer(
    kind: ServerKind,
    root: string | undefined,
    host: HostEnv,
): ResolvedServer {
    const rootArgs = root !== undefined ? ['--root', path.resolve(host.cwd, root)] : [];
    if (kind === 'npx') {
        // Windows GUI apps can't spawn `npx.cmd` without a shell.
        if (host.platform === 'win32') {
            return {
                entry: { command: 'cmd', args: ['/c', 'npx', '-y', '@nowline/mcp', ...rootArgs] },
                warnings: [],
            };
        }
        return {
            entry: { command: 'npx', args: ['-y', '@nowline/mcp', ...rootArgs] },
            warnings: [],
        };
    }

    if (host.isCompiledBinary) {
        const binary = host.realpath(host.execPath);
        const onPath = host
            .findAllOnPath('nowline')
            .find((candidate) => host.realpath(candidate) === binary);
        const command = onPath ?? host.execPath;
        const warnings: string[] = [];
        if (onPath === undefined && /[\\/]Cellar[\\/]/.test(command)) {
            warnings.push(
                `warning: registered ${command}, which changes on \`brew upgrade\`; put Homebrew's bin on PATH and re-run --mcp-install.`,
            );
        }
        return { entry: { command, args: ['--mcp', ...rootArgs] }, warnings };
    }

    // Running under Node (npm install or a checkout): the `nowline` shim is a
    // `#!/usr/bin/env node` script a GUI harness may not be able to run, so
    // register the absolute Node and the script it runs.
    const script = host.realpath(host.argv1 ?? '');
    return {
        entry: { command: host.execPath, args: [script, '--mcp', ...rootArgs] },
        warnings: [
            `warning: registered ${host.execPath}; re-run --mcp-install if you remove or switch this Node version.`,
        ],
    };
}
