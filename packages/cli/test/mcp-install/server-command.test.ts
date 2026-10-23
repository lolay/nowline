import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveServer } from '../../src/mcp-install/server-command.js';
import { fakeHost } from './fake-host.js';

describe('resolveServer — self', () => {
    it('registers the PATH entry, not the Homebrew Cellar realpath, so brew upgrade keeps working', () => {
        const cellar = '/opt/homebrew/Cellar/nowline/0.9.0/bin/nowline';
        const host = fakeHost({
            execPath: cellar,
            binaries: { nowline: ['/usr/bin/nowline', '/opt/homebrew/bin/nowline'] },
            realpath: (p) => (p === '/opt/homebrew/bin/nowline' ? cellar : p),
        });
        const { entry, warnings } = resolveServer('self', undefined, host);
        expect(entry).toEqual({ command: '/opt/homebrew/bin/nowline', args: ['--mcp'] });
        expect(warnings).toEqual([]);
    });

    it('falls back to the binary path and warns when only a Cellar path is known', () => {
        const cellar = '/opt/homebrew/Cellar/nowline/0.9.0/bin/nowline';
        const { entry, warnings } = resolveServer(
            'self',
            undefined,
            fakeHost({ execPath: cellar }),
        );
        expect(entry.command).toBe(cellar);
        expect(warnings.join('\n')).toMatch(/brew upgrade/);
    });

    it('registers absolute Node plus the real script when running under Node', () => {
        const host = fakeHost({
            isCompiledBinary: false,
            execPath: '/home/me/.nvm/versions/node/v26.12.0/bin/node',
            argv1: '/home/me/.nvm/versions/node/v26.12.0/bin/nowline',
            realpath: (p) =>
                p.endsWith('/bin/nowline')
                    ? '/home/me/.nvm/versions/node/v26.12.0/lib/node_modules/@nowline/cli/dist/index.js'
                    : p,
        });
        const { entry, warnings } = resolveServer('self', undefined, host);
        expect(entry).toEqual({
            command: '/home/me/.nvm/versions/node/v26.12.0/bin/node',
            args: [
                '/home/me/.nvm/versions/node/v26.12.0/lib/node_modules/@nowline/cli/dist/index.js',
                '--mcp',
            ],
        });
        expect(warnings.join('\n')).toMatch(/Node version/);
    });

    it('passes --root as an absolute path resolved against cwd', () => {
        const host = fakeHost();
        const { entry } = resolveServer('self', 'roadmaps', host);
        expect(entry.args).toEqual(['--mcp', '--root', path.resolve(host.cwd, 'roadmaps')]);
    });
});

describe('resolveServer — npx', () => {
    it('registers npx -y @nowline/mcp', () => {
        expect(resolveServer('npx', undefined, fakeHost()).entry).toEqual({
            command: 'npx',
            args: ['-y', '@nowline/mcp'],
        });
    });

    it('wraps npx in cmd /c on Windows, where GUI apps cannot spawn npx.cmd directly', () => {
        expect(resolveServer('npx', undefined, fakeHost({ platform: 'win32' })).entry).toEqual({
            command: 'cmd',
            args: ['/c', 'npx', '-y', '@nowline/mcp'],
        });
    });
});
