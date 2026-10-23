import * as path from 'node:path';
import type { HostEnv } from './host.js';
import type { ServerEntry } from './server-command.js';

export type Scope = 'user' | 'project';

/** The name every harness registers the server under, so tools surface as `mcp__nowline__*`. */
export const SERVER_NAME = 'nowline';

/** A JSON / JSONC config file we edit in place. */
export interface JsonTarget {
    kind: 'json';
    path: string;
    /** Where the entry goes and what it holds, decided after reading the existing document. */
    place(entry: ServerEntry, doc: unknown): { keyPath: string[]; value: unknown };
    /** Top-level keys a newly created file starts with. */
    seed?: Record<string, unknown>;
    /** Shown after a successful install. */
    hint?: string;
}

/**
 * A harness whose config we can't safely edit ourselves (Claude Code's
 * ~/.claude.json, Codex's TOML): run its own `mcp add`, else print it.
 */
export interface CliTarget {
    kind: 'cli';
    binary: string;
    add: string[];
    remove: string[];
    fallback: PrintTarget;
}

/** Paste-ready instructions, for configs we neither edit nor reach through a CLI. */
export interface PrintTarget {
    kind: 'print';
    install: { instructions: string; snippet: string };
    uninstall: { instructions: string; snippet?: string };
}

export type Target = JsonTarget | CliTarget | PrintTarget;

export interface ClientDescriptor {
    id: string;
    name: string;
    scopes: readonly Scope[];
    /** True when the harness looks installed (its CLI is on PATH or its config dir exists). */
    detect(host: HostEnv): boolean;
    target(scope: Scope, entry: ServerEntry, host: HostEnv): Target;
}

function xdgConfig(host: HostEnv): string {
    return host.env.XDG_CONFIG_HOME || path.join(host.home, '.config');
}

function appData(host: HostEnv): string {
    return host.env.APPDATA || path.join(host.home, 'AppData', 'Roaming');
}

/** Per-OS application config directory (Electron apps: Claude Desktop, VS Code). */
function appConfigDir(host: HostEnv, name: string): string {
    if (host.platform === 'darwin') {
        return path.join(host.home, 'Library', 'Application Support', name);
    }
    if (host.platform === 'win32') return path.join(appData(host), name);
    return path.join(xdgConfig(host), name);
}

function onPathOrExists(binaries: readonly string[], dirs: (host: HostEnv) => string[]) {
    return (host: HostEnv): boolean =>
        binaries.some((binary) => host.findAllOnPath(binary).length > 0) ||
        dirs(host).some((dir) => host.exists(dir));
}

function plain(entry: ServerEntry) {
    return { command: entry.command, args: entry.args };
}

function stdioTyped(entry: ServerEntry) {
    return { type: 'stdio', command: entry.command, args: entry.args };
}

function underKey(
    filePath: string,
    key: string,
    shape: (entry: ServerEntry) => unknown,
    extra: Partial<JsonTarget> = {},
): JsonTarget {
    return {
        kind: 'json',
        path: filePath,
        place: (entry) => ({ keyPath: [key, SERVER_NAME], value: shape(entry) }),
        ...extra,
    };
}

/** POSIX-shell quoting for printed commands; bare when nothing needs escaping. */
export function shellQuote(arg: string): string {
    return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function commandLine(argv: readonly string[]): string {
    return argv.map(shellQuote).join(' ');
}

function cliTarget(
    binary: string,
    add: string[],
    remove: string[],
    fallback?: PrintTarget,
): CliTarget {
    return {
        kind: 'cli',
        binary,
        add,
        remove,
        fallback: fallback ?? {
            kind: 'print',
            install: {
                instructions: `${binary} is not on PATH; once it is, run:`,
                snippet: commandLine([binary, ...add]),
            },
            uninstall: {
                instructions: `${binary} is not on PATH; once it is, run:`,
                snippet: commandLine([binary, ...remove]),
            },
        },
    };
}

/** Prefer an existing `.jsonc` sibling, since OpenCode reads either. */
function jsonOrJsonc(host: HostEnv, base: string): string {
    return host.exists(`${base}.jsonc`) ? `${base}.jsonc` : `${base}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const CLIENTS: readonly ClientDescriptor[] = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['claude'], (h) => [path.join(h.home, '.claude')]),
        target: (scope, entry, host) => {
            if (scope === 'project') {
                return underKey(path.join(host.cwd, '.mcp.json'), 'mcpServers', stdioTyped);
            }
            return cliTarget(
                'claude',
                ['mcp', 'add', '--scope', 'user', SERVER_NAME, '--', entry.command, ...entry.args],
                ['mcp', 'remove', '--scope', 'user', SERVER_NAME],
            );
        },
    },
    {
        id: 'claude-desktop',
        name: 'Claude Desktop',
        scopes: ['user'],
        detect: onPathOrExists([], (h) => [appConfigDir(h, 'Claude')]),
        target: (_scope, _entry, host) =>
            underKey(
                path.join(appConfigDir(host, 'Claude'), 'claude_desktop_config.json'),
                'mcpServers',
                plain,
                { hint: 'restart Claude Desktop to load it' },
            ),
    },
    {
        id: 'cursor',
        name: 'Cursor',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['cursor'], (h) => [path.join(h.home, '.cursor')]),
        target: (scope, _entry, host) =>
            underKey(
                path.join(scope === 'user' ? host.home : host.cwd, '.cursor', 'mcp.json'),
                'mcpServers',
                plain,
            ),
    },
    {
        id: 'vscode',
        name: 'VS Code',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['code'], (h) => [path.join(appConfigDir(h, 'Code'), 'User')]),
        target: (scope, _entry, host) =>
            underKey(
                scope === 'user'
                    ? path.join(appConfigDir(host, 'Code'), 'User', 'mcp.json')
                    : path.join(host.cwd, '.vscode', 'mcp.json'),
                'servers',
                stdioTyped,
            ),
    },
    {
        id: 'codex',
        name: 'Codex CLI',
        scopes: ['user'],
        detect: onPathOrExists(['codex'], (h) => [h.env.CODEX_HOME || path.join(h.home, '.codex')]),
        target: (_scope, entry, host) => {
            const configPath = path.join(
                host.env.CODEX_HOME || path.join(host.home, '.codex'),
                'config.toml',
            );
            // JSON string and array literals are valid TOML basic strings and arrays.
            const toml = [
                `[mcp_servers.${SERVER_NAME}]`,
                `command = ${JSON.stringify(entry.command)}`,
                `args = ${JSON.stringify(entry.args)}`,
            ].join('\n');
            return cliTarget(
                'codex',
                ['mcp', 'add', SERVER_NAME, '--', entry.command, ...entry.args],
                ['mcp', 'remove', SERVER_NAME],
                {
                    kind: 'print',
                    install: {
                        instructions: `codex is not on PATH; add this to ${configPath}:`,
                        snippet: toml,
                    },
                    uninstall: {
                        instructions: `codex is not on PATH; delete the [mcp_servers.${SERVER_NAME}] table from ${configPath}.`,
                    },
                },
            );
        },
    },
    {
        id: 'gemini',
        name: 'Gemini CLI',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['gemini'], (h) => [path.join(h.home, '.gemini')]),
        target: (scope, _entry, host) =>
            underKey(
                path.join(scope === 'user' ? host.home : host.cwd, '.gemini', 'settings.json'),
                'mcpServers',
                plain,
            ),
    },
    {
        id: 'antigravity',
        name: 'Antigravity',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['agy', 'antigravity'], (h) => [
            path.join(h.home, '.gemini', 'config'),
            path.join(h.home, '.gemini', 'antigravity-cli'),
        ]),
        // The Antigravity app, IDE and CLI share one file.
        target: (scope, _entry, host) =>
            underKey(
                scope === 'user'
                    ? path.join(host.home, '.gemini', 'config', 'mcp_config.json')
                    : path.join(host.cwd, '.agents', 'mcp_config.json'),
                'mcpServers',
                plain,
            ),
    },
    {
        id: 'muse',
        name: 'Muse Code',
        scopes: ['user'],
        detect: onPathOrExists(['muse'], (h) => [path.join(h.home, '.config', 'muse')]),
        target: (_scope, _entry, host) =>
            underKey(
                path.join(host.home, '.config', 'muse', 'settings.json'),
                'mcp_servers',
                // `optional`: a missing nowline warns instead of aborting every Muse run.
                (entry) => ({
                    transport: 'stdio',
                    command: entry.command,
                    args: entry.args,
                    mode: 'optional',
                }),
                // Muse refuses to start on a settings file without it.
                { seed: { schema_version: 1 } },
            ),
    },
    {
        id: 'opencode',
        name: 'OpenCode',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['opencode'], (h) => [path.join(xdgConfig(h), 'opencode')]),
        target: (scope, _entry, host) => ({
            kind: 'json',
            path: jsonOrJsonc(
                host,
                scope === 'user'
                    ? path.join(xdgConfig(host), 'opencode', 'opencode')
                    : path.join(host.cwd, 'opencode'),
            ),
            seed: { $schema: 'https://opencode.ai/config.json' },
            place: (entry, doc) => {
                const command = [entry.command, ...entry.args];
                const mcp = isRecord(doc) ? doc.mcp : undefined;
                // The v2 layout nests servers under `mcp.servers` and drops `enabled`.
                if (isRecord(mcp) && isRecord(mcp.servers)) {
                    return {
                        keyPath: ['mcp', 'servers', SERVER_NAME],
                        value: { type: 'local', command },
                    };
                }
                return {
                    keyPath: ['mcp', SERVER_NAME],
                    value: { type: 'local', command, enabled: true },
                };
            },
        }),
    },
    {
        id: 'copilot',
        name: 'GitHub Copilot CLI',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['copilot'], (h) => [path.join(h.home, '.copilot')]),
        target: (scope, _entry, host) =>
            scope === 'user'
                ? underKey(
                      path.join(host.home, '.copilot', 'mcp-config.json'),
                      'mcpServers',
                      (entry) => ({
                          type: 'local',
                          command: entry.command,
                          args: entry.args,
                          tools: ['*'],
                      }),
                  )
                : // Same file and shape as Claude Code's project scope; Copilot reads it too.
                  underKey(path.join(host.cwd, '.mcp.json'), 'mcpServers', stdioTyped),
    },
    {
        id: 'windsurf',
        name: 'Windsurf',
        scopes: ['user'],
        detect: onPathOrExists(['windsurf'], (h) => [path.join(h.home, '.codeium', 'windsurf')]),
        target: (_scope, _entry, host) =>
            underKey(
                path.join(host.home, '.codeium', 'windsurf', 'mcp_config.json'),
                'mcpServers',
                plain,
            ),
    },
    {
        id: 'zed',
        name: 'Zed',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['zed'], (h) => [zedConfigDir(h)]),
        target: (scope, _entry, host) =>
            underKey(
                scope === 'user'
                    ? path.join(zedConfigDir(host), 'settings.json')
                    : path.join(host.cwd, '.zed', 'settings.json'),
                'context_servers',
                (entry) => ({ command: entry.command, args: entry.args, env: {} }),
            ),
    },
    {
        id: 'amp',
        name: 'Amp',
        scopes: ['user', 'project'],
        detect: onPathOrExists(['amp'], (h) => [path.join(h.home, '.config', 'amp')]),
        target: (scope, entry, host) => {
            if (scope === 'user' && host.platform === 'win32') {
                // Amp documents no Windows settings path; its own CLI knows it.
                return {
                    kind: 'print',
                    install: {
                        instructions: 'run:',
                        snippet: commandLine([
                            'amp',
                            'mcp',
                            'add',
                            SERVER_NAME,
                            '--',
                            entry.command,
                            ...entry.args,
                        ]),
                    },
                    uninstall: {
                        instructions: `remove "${SERVER_NAME}" from "amp.mcpServers" in Amp's settings.json.`,
                    },
                };
            }
            return underKey(
                scope === 'user'
                    ? path.join(host.home, '.config', 'amp', 'settings.json')
                    : path.join(host.cwd, '.amp', 'settings.json'),
                'amp.mcpServers',
                plain,
                scope === 'project'
                    ? { hint: `approve it once with \`amp mcp approve ${SERVER_NAME}\`` }
                    : {},
            );
        },
    },
    {
        id: 'goose',
        name: 'Goose',
        scopes: ['user'],
        detect: onPathOrExists(['goose'], (h) => [gooseConfigPath(h, true)]),
        target: (_scope, entry, host) => {
            const configPath = gooseConfigPath(host, false);
            // Goose's config is YAML we'd lose comments in; JSON scalars are valid YAML.
            const yaml = [
                'extensions:',
                `  ${SERVER_NAME}:`,
                '    enabled: true',
                `    name: ${SERVER_NAME}`,
                '    type: stdio',
                `    cmd: ${JSON.stringify(entry.command)}`,
                `    args: ${JSON.stringify(entry.args)}`,
                '    timeout: 300',
            ].join('\n');
            return {
                kind: 'print',
                install: { instructions: `add this to ${configPath}:`, snippet: yaml },
                uninstall: {
                    instructions: `delete extensions.${SERVER_NAME} from ${configPath}.`,
                },
            };
        },
    },
];

function zedConfigDir(host: HostEnv): string {
    return host.platform === 'win32'
        ? path.join(appData(host), 'Zed')
        : path.join(xdgConfig(host), 'zed');
}

function gooseConfigPath(host: HostEnv, dirOnly: boolean): string {
    const dir =
        host.platform === 'win32'
            ? path.join(appData(host), 'Block', 'goose', 'config')
            : path.join(xdgConfig(host), 'goose');
    return dirOnly ? dir : path.join(dir, 'config.yaml');
}

export const CLIENT_IDS: readonly string[] = CLIENTS.map((c) => c.id);

export function findClient(id: string): ClientDescriptor | undefined {
    return CLIENTS.find((c) => c.id === id);
}
