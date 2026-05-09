import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, mergeConfig, parseConfig } from '../src/index.js';

describe('.nowlinerc discovery', () => {
    it('walks up from the input directory until a .nowlinerc is found', async () => {
        // Build all paths through `path.resolve` / `path.join` so the stub
        // filesystem keys match what `loadConfig` actually looks up. On
        // Windows `path.resolve('/repo')` becomes `D:\\repo`; on posix it
        // stays `/repo`.
        const startDir = path.resolve('/repo/roadmaps/team-a');
        const rcPath = path.join(path.resolve('/repo'), '.nowlinerc');
        const root = path.parse(startDir).root;
        const files: Record<string, string> = {
            [rcPath]: '{"theme": "dark"}',
        };
        const readFile = async (p: string) => {
            if (p in files) return files[p];
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        };
        const fileExists = async (p: string) => p in files;
        const { config, path: foundAt } = await loadConfig(startDir, {
            readFile,
            fileExists,
            root,
        });
        expect(config.theme).toBe('dark');
        expect(foundAt).toBe(rcPath);
    });

    it('returns an empty config when no file is found', async () => {
        const startDir = path.resolve('/tmp/nonexistent-path-12345');
        const root = path.parse(startDir).root;
        const { config, path: foundAt } = await loadConfig(startDir, {
            readFile: async () => {
                throw new Error('nope');
            },
            fileExists: async () => false,
            root,
        });
        expect(config).toEqual({});
        expect(foundAt).toBeUndefined();
    });
});

describe('.nowlinerc parsing', () => {
    it('parses JSON', () => {
        expect(parseConfig('{"width": 1200}', '/x/.nowlinerc')).toEqual({ width: 1200 });
    });

    it('parses YAML', () => {
        const yaml = 'theme: dark\nwidth: 1200\n';
        expect(parseConfig(yaml, '/x/.nowlinerc')).toEqual({ theme: 'dark', width: 1200 });
    });

    it('rejects non-object roots', () => {
        expect(() => parseConfig('- a\n- b\n', '/x/.nowlinerc')).toThrow(/top-level/i);
    });
});

describe('.nowlinerc merge behavior', () => {
    it('CLI flags override config file values', () => {
        const merged = mergeConfig({ theme: 'dark', width: 1200 }, { width: 1600 });
        expect(merged.theme).toBe('dark');
        expect(merged.width).toBe(1600);
    });

    it('undefined CLI flags do not clobber config values', () => {
        const merged = mergeConfig({ theme: 'dark' }, { theme: undefined });
        expect(merged.theme).toBe('dark');
    });
});
