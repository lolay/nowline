// startMcpServer is the one start path for `npx @nowline/mcp` and
// `nowline --mcp` (r1.f15). These cover the decisions it owns; the CLI's
// integration suite checks the CLI reaches it.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidPortError, mcpServerOptions, parsePort, startMcpServer } from '../src/start.js';

const pkgVersion = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
        version: string;
    }
).version;

describe('parsePort', () => {
    it('accepts 1 through 65535', () => {
        expect(parsePort('1')).toBe(1);
        expect(parsePort('6789')).toBe(6789);
        expect(parsePort('65535')).toBe(65535);
    });

    it.each(['0', '65536', '-1', 'abc', '', '12abc', '1.5', '0x10'])('rejects %j', (raw) => {
        expect(() => parsePort(raw)).toThrow(InvalidPortError);
    });
});

describe('mcpServerOptions', () => {
    it('marks an explicit root as configured and expands it', () => {
        expect(mcpServerOptions('~/roadmaps')).toEqual({
            allowedRoot: path.join(homedir(), 'roadmaps'),
            rootConfigured: true,
            version: pkgVersion,
        });
    });

    it('treats a missing or blank root as unconfigured', () => {
        for (const root of [undefined, '', '   ']) {
            expect(mcpServerOptions(root)).toMatchObject({
                allowedRoot: undefined,
                rootConfigured: false,
            });
        }
    });

    it('reports the package version unless one is given', () => {
        expect(mcpServerOptions(undefined).version).toBe(pkgVersion);
        expect(mcpServerOptions(undefined, '9.9.9').version).toBe('9.9.9');
    });
});

describe('startMcpServer', () => {
    it('rejects a bad port before binding anything', async () => {
        await expect(startMcpServer({ port: 'nope' })).rejects.toBeInstanceOf(InvalidPortError);
    });
});
