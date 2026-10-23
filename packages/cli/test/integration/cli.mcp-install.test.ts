import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot, runCliBuilt, withTempDir } from '../helpers.js';

const distEntry = path.join(packageRoot, 'dist', 'index.js');
const describeBuilt = existsSync(distEntry) ? describe : describe.skip;

/** Points every config root the installer reads at `dir`, with no harness CLIs on PATH. */
function isolatedEnv(dir: string): NodeJS.ProcessEnv {
    const home = path.join(dir, 'home');
    return {
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: path.join(home, '.config'),
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        CODEX_HOME: path.join(home, '.codex'),
        PATH: path.join(dir, 'empty-bin'),
    };
}

describeBuilt('--mcp-install integration', () => {
    it('writes the project config, previews with --dry-run, and uninstalls', async () => {
        await withTempDir(async (dir) => {
            const cwd = path.join(dir, 'project');
            await fs.mkdir(cwd, { recursive: true });
            const env = isolatedEnv(dir);
            const config = path.join(cwd, '.cursor', 'mcp.json');

            const preview = await runCliBuilt(
                ['--mcp-install', 'cursor', '--scope', 'project', '-n', '-q'],
                { cwd, env },
            );
            expect(preview.exitCode).toBe(0);
            expect(preview.stdout).toMatch(/cursor: would create/);
            expect(existsSync(config)).toBe(false);

            const install = await runCliBuilt(['--mcp-install', 'cursor', '--scope', 'project'], {
                cwd,
                env,
            });
            expect(install.exitCode).toBe(0);
            // Under Node, `self` is this Node plus the CLI script, with a warning on stderr.
            expect(install.stderr).toMatch(/warning: registered/);
            const written = JSON.parse(await fs.readFile(config, 'utf-8'));
            expect(written.mcpServers.nowline).toEqual({
                command: process.execPath,
                args: [await fs.realpath(distEntry), '--mcp'],
            });

            const uninstall = await runCliBuilt(
                ['--mcp-uninstall', 'cursor', '--scope', 'project'],
                { cwd, env },
            );
            expect(uninstall.exitCode).toBe(0);
            expect(JSON.parse(await fs.readFile(config, 'utf-8'))).toEqual({ mcpServers: {} });
        });
    });

    it('exits 2 when no agent is found and none is named', async () => {
        await withTempDir(async (dir) => {
            const result = await runCliBuilt(['--mcp-install'], {
                cwd: dir,
                env: isolatedEnv(dir),
            });
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toMatch(/no supported agent found/);
        });
    });
});
