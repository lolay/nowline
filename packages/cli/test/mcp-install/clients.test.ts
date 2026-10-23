import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    CLIENT_IDS,
    CLIENTS,
    type ClientDescriptor,
    findClient,
    type JsonTarget,
    type Scope,
    type Target,
} from '../../src/mcp-install/clients.js';
import type { HostEnv } from '../../src/mcp-install/host.js';
import { upsertEntry } from '../../src/mcp-install/json-config.js';
import { fakeHost } from './fake-host.js';

const entry = { command: '/opt/homebrew/bin/nowline', args: ['--mcp'] };

function client(id: string): ClientDescriptor {
    const found = findClient(id);
    if (!found) throw new Error(`no client ${id}`);
    return found;
}

function jsonTarget(id: string, scope: Scope, host: HostEnv): JsonTarget {
    const target: Target = client(id).target(scope, entry, host);
    if (target.kind !== 'json') throw new Error(`${id} ${scope} is ${target.kind}, not json`);
    return target;
}

/** The document a fresh install writes, parsed back. */
function installed(id: string, scope: Scope, host: HostEnv): Record<string, unknown> {
    return JSON.parse(upsertEntry(undefined, jsonTarget(id, scope, host), entry).text ?? '');
}

describe('client table', () => {
    it('has unique ids and none named all (reserved for every detected client)', () => {
        expect(new Set(CLIENT_IDS).size).toBe(CLIENT_IDS.length);
        expect(CLIENT_IDS).not.toContain('all');
    });

    it('every client supports user scope', () => {
        for (const c of CLIENTS) expect(c.scopes, c.id).toContain('user');
    });
});

describe('entry shapes', () => {
    const host = fakeHost();
    const plain = { command: entry.command, args: entry.args };
    const stdio = { type: 'stdio', ...plain };

    it.each([
        ['claude-desktop', 'user', ['mcpServers'], plain],
        ['cursor', 'user', ['mcpServers'], plain],
        ['gemini', 'user', ['mcpServers'], plain],
        ['antigravity', 'user', ['mcpServers'], plain],
        ['antigravity', 'project', ['mcpServers'], plain],
        ['windsurf', 'user', ['mcpServers'], plain],
        ['claude-code', 'project', ['mcpServers'], stdio],
        ['copilot', 'project', ['mcpServers'], stdio],
        ['vscode', 'user', ['servers'], stdio],
        ['vscode', 'project', ['servers'], stdio],
        ['zed', 'user', ['context_servers'], { ...plain, env: {} }],
        ['amp', 'user', ['amp.mcpServers'], plain],
        ['copilot', 'user', ['mcpServers'], { type: 'local', ...plain, tools: ['*'] }],
    ] as const)('%s (%s) writes %j', (id, scope, keys, value) => {
        expect(installed(id, scope, host)).toEqual({ [keys[0]]: { nowline: value } });
    });

    it('muse seeds schema_version and registers the server as optional', () => {
        expect(installed('muse', 'user', host)).toEqual({
            schema_version: 1,
            mcp_servers: {
                nowline: { transport: 'stdio', ...plain, mode: 'optional' },
            },
        });
    });

    it('opencode uses a command array under mcp', () => {
        expect(installed('opencode', 'user', host)).toEqual({
            $schema: 'https://opencode.ai/config.json',
            mcp: {
                nowline: {
                    type: 'local',
                    command: [entry.command, '--mcp'],
                    enabled: true,
                },
            },
        });
    });

    it('opencode follows the v2 mcp.servers layout when the file already uses it', () => {
        const target = jsonTarget('opencode', 'user', host);
        const edit = upsertEntry('{ "mcp": { "servers": {} } }', target, entry);
        expect(JSON.parse(edit.text ?? '').mcp.servers.nowline).toEqual({
            type: 'local',
            command: [entry.command, '--mcp'],
        });
    });
});

describe('config paths', () => {
    it('antigravity uses the config file its app, IDE and CLI share', () => {
        const host = fakeHost();
        expect(jsonTarget('antigravity', 'user', host).path).toBe(
            path.join(host.home, '.gemini', 'config', 'mcp_config.json'),
        );
    });

    it('resolves per-OS application directories', () => {
        const mac = fakeHost({ platform: 'darwin' });
        expect(jsonTarget('claude-desktop', 'user', mac).path).toBe(
            path.join(
                mac.home,
                'Library',
                'Application Support',
                'Claude',
                'claude_desktop_config.json',
            ),
        );
        const win = fakeHost({
            platform: 'win32',
            env: { APPDATA: 'C:/Users/me/AppData/Roaming' },
        });
        expect(jsonTarget('vscode', 'user', win).path).toBe(
            path.join('C:/Users/me/AppData/Roaming', 'Code', 'User', 'mcp.json'),
        );
        const linux = fakeHost({ env: { XDG_CONFIG_HOME: '/xdg' } });
        expect(jsonTarget('zed', 'user', linux).path).toBe(
            path.join('/xdg', 'zed', 'settings.json'),
        );
        expect(jsonTarget('opencode', 'user', linux).path).toBe(
            path.join('/xdg', 'opencode', 'opencode.json'),
        );
    });

    it('project scope writes into cwd', () => {
        const host = fakeHost();
        expect(jsonTarget('cursor', 'project', host).path).toBe(
            path.join(host.cwd, '.cursor', 'mcp.json'),
        );
        expect(jsonTarget('claude-code', 'project', host).path).toBe(
            path.join(host.cwd, '.mcp.json'),
        );
        expect(jsonTarget('amp', 'project', host).hint).toMatch(/amp mcp approve nowline/);
        expect(jsonTarget('antigravity', 'project', host).path).toBe(
            path.join(host.cwd, '.agents', 'mcp_config.json'),
        );
    });

    it('opencode edits an existing opencode.jsonc instead of adding a .json beside it', () => {
        const host = fakeHost();
        mkdirSync(host.cwd, { recursive: true });
        writeFileSync(path.join(host.cwd, 'opencode.jsonc'), '{}');
        expect(jsonTarget('opencode', 'project', host).path).toBe(
            path.join(host.cwd, 'opencode.jsonc'),
        );
    });
});

describe('CLI and printed targets', () => {
    it('claude-code user scope goes through claude mcp add with a -- separator', () => {
        const target = client('claude-code').target('user', entry, fakeHost());
        expect(target).toMatchObject({
            kind: 'cli',
            binary: 'claude',
            add: ['mcp', 'add', '--scope', 'user', 'nowline', '--', entry.command, '--mcp'],
            remove: ['mcp', 'remove', '--scope', 'user', 'nowline'],
        });
    });

    it('codex falls back to a TOML snippet for its config file', () => {
        const host = fakeHost({ env: { CODEX_HOME: '/codex' } });
        const target = client('codex').target('user', entry, host);
        if (target.kind !== 'cli') throw new Error('expected cli');
        expect(target.add).toEqual(['mcp', 'add', 'nowline', '--', entry.command, '--mcp']);
        expect(target.fallback.install.instructions).toContain(path.join('/codex', 'config.toml'));
        expect(target.fallback.install.snippet).toBe(
            '[mcp_servers.nowline]\ncommand = "/opt/homebrew/bin/nowline"\nargs = ["--mcp"]',
        );
    });

    it('goose prints YAML, and amp prints its own command on Windows', () => {
        const goose = client('goose').target('user', entry, fakeHost());
        expect(goose.kind).toBe('print');
        if (goose.kind === 'print') expect(goose.install.snippet).toContain('type: stdio');
        const amp = client('amp').target('user', entry, fakeHost({ platform: 'win32' }));
        expect(amp).toMatchObject({
            kind: 'print',
            install: { snippet: 'amp mcp add nowline -- /opt/homebrew/bin/nowline --mcp' },
        });
    });
});

describe('detection', () => {
    it('detects a harness by its CLI on PATH or its config directory', () => {
        expect(client('codex').detect(fakeHost())).toBe(false);
        expect(client('codex').detect(fakeHost({ binaries: { codex: ['/usr/bin/codex'] } }))).toBe(
            true,
        );
        expect(client('antigravity').detect(fakeHost({ binaries: { agy: ['/bin/agy'] } }))).toBe(
            true,
        );
        const host = fakeHost();
        mkdirSync(path.join(host.home, '.cursor'), { recursive: true });
        expect(client('cursor').detect(host)).toBe(true);
    });

    it('an Antigravity-only ~/.gemini does not look like Gemini CLI', () => {
        const host = fakeHost();
        mkdirSync(path.join(host.home, '.gemini', 'config'), { recursive: true });
        expect(client('antigravity').detect(host)).toBe(true);
        expect(client('gemini').detect(host)).toBe(false);
        writeFileSync(path.join(host.home, '.gemini', 'settings.json'), '{}');
        expect(client('gemini').detect(host)).toBe(true);
    });
});
