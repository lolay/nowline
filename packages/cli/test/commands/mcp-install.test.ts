import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { mcpInstallHandler } from '../../src/commands/mcp-install.js';
import { CliError, ExitCode } from '../../src/io/exit-codes.js';
import { type FakeHost, fakeHost } from '../mcp-install/fake-host.js';

async function run(argv: string[], host: FakeHost): Promise<string> {
    let out = '';
    await mcpInstallHandler({
        args: parseArgv(argv),
        host,
        stdout: (chunk) => {
            out += chunk;
        },
    });
    return out;
}

function hostWith(dirs: string[], options: Parameters<typeof fakeHost>[0] = {}): FakeHost {
    const host = fakeHost(options);
    for (const dir of dirs) mkdirSync(path.join(host.home, dir), { recursive: true });
    mkdirSync(host.cwd, { recursive: true });
    return host;
}

describe('mcpInstallHandler', () => {
    it('installs into every detected client and nothing else', async () => {
        const host = hostWith(['.cursor', '.gemini']);
        const out = await run(['--mcp-install', '-q'], host);
        expect(out).toMatch(/^cursor: created .*mcp\.json$/m);
        expect(out).toMatch(/^gemini: created .*settings\.json$/m);
        expect(existsSync(path.join(host.home, '.codeium'))).toBe(false);
        const cursor = JSON.parse(
            readFileSync(path.join(host.home, '.cursor', 'mcp.json'), 'utf-8'),
        );
        expect(cursor.mcpServers.nowline).toEqual({
            command: '/usr/local/bin/nowline',
            args: ['--mcp'],
        });
    });

    it('is idempotent and reversible', async () => {
        const host = hostWith(['.cursor']);
        await run(['--mcp-install', 'cursor'], host);
        expect(await run(['--mcp-install', 'cursor'], host)).toMatch(/cursor: already installed/);
        expect(await run(['--mcp-uninstall', 'cursor'], host)).toMatch(
            /cursor: removed nowline from/,
        );
        expect(await run(['--mcp-uninstall', 'cursor'], host)).toMatch(/cursor: not installed/);
    });

    it('--dry-run reports the change and writes nothing', async () => {
        const host = hostWith([]);
        const out = await run(['--mcp-install', 'cursor', '--scope', 'project', '-n'], host);
        expect(out).toMatch(/cursor: would create .*\.cursor[\\/]mcp\.json/);
        expect(out).toContain('"mcpServers.nowline"');
        expect(existsSync(path.join(host.cwd, '.cursor'))).toBe(false);
    });

    it('runs the harness CLI, removing first so a re-run replaces a stale entry', async () => {
        const host = hostWith([], { binaries: { claude: ['/usr/bin/claude'] } });
        const out = await run(['--mcp-install', 'claude-code'], host);
        expect(host.spawned).toEqual([
            ['claude', 'mcp', 'remove', '--scope', 'user', 'nowline'],
            [
                'claude',
                'mcp',
                'add',
                '--scope',
                'user',
                'nowline',
                '--',
                '/usr/local/bin/nowline',
                '--mcp',
            ],
        ]);
        expect(out).toMatch(/claude-code: registered \(claude mcp add/);
    });

    it('prints the command when the harness CLI is missing, and spawns nothing', async () => {
        const host = hostWith([]);
        const out = await run(['--mcp-install', 'claude-code'], host);
        expect(host.spawned).toEqual([]);
        expect(out).toContain('claude is not on PATH');
        expect(out).toContain(
            'claude mcp add --scope user nowline -- /usr/local/bin/nowline --mcp',
        );
    });

    it('keeps going after one client fails, then exits with an output error', async () => {
        const host = hostWith(['.cursor', '.gemini']);
        writeFileSync(path.join(host.home, '.cursor', 'mcp.json'), '{ broken');
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        let out = '';
        try {
            await mcpInstallHandler({
                args: parseArgv(['--mcp-install', '-q']),
                host,
                stdout: (chunk) => {
                    out += chunk;
                },
            });
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect((err as CliError).exitCode).toBe(ExitCode.OutputError);
            expect((err as CliError).message).toMatch(/failed for cursor/);
            expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/cursor: cannot parse/));
        } finally {
            stderr.mockRestore();
        }
        expect(out).toMatch(/gemini: created/);
    });

    it('fails a client whose harness CLI exits non-zero', async () => {
        const host = hostWith([], {
            binaries: { codex: ['/usr/bin/codex'] },
            spawnResult: (_command, args) =>
                args[1] === 'add'
                    ? { status: 2, stdout: '', stderr: 'error: unexpected argument\nusage' }
                    : { status: 0, stdout: '', stderr: '' },
        });
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            await expect(run(['--mcp-install', 'codex'], host)).rejects.toThrow(/failed for codex/);
            expect(stderr).toHaveBeenCalledWith(
                expect.stringMatching(
                    /codex mcp add .* failed \(exit 2\): error: unexpected argument/,
                ),
            );
        } finally {
            stderr.mockRestore();
        }
    });

    it('rejects an unknown client and project scope on a user-only client', async () => {
        const host = hostWith([]);
        await expect(run(['--mcp-install', 'emacs'], host)).rejects.toThrow(
            /unknown client "emacs"/,
        );
        await expect(run(['--mcp-install', 'muse', '--scope', 'project'], host)).rejects.toThrow(
            /muse has no project config/,
        );
    });

    it('skips user-only clients when auto-detecting with --scope project', async () => {
        const host = hostWith(['.cursor', '.config/muse']);
        const out = await run(['--mcp-install', '--scope', 'project'], host);
        expect(out).toMatch(/muse: skipped/);
        expect(out).toMatch(/cursor: created/);
    });

    it('says how to name a client when none is detected', async () => {
        try {
            await run(['--mcp-install'], hostWith([]));
            expect.fail('should have thrown');
        } catch (err) {
            expect((err as CliError).exitCode).toBe(ExitCode.InputError);
            expect((err as CliError).message).toMatch(/no supported agent found.*claude-code/);
        }
    });
});
