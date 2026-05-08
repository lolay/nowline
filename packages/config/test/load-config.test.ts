import { describe, it, expect } from 'vitest';
import { loadConfig, parseConfig, mergeConfig } from '../src/index.js';
import * as path from 'node:path';

describe('.nowlinerc discovery', () => {
    it('walks up from the input directory until a .nowlinerc is found', async () => {
        const files: Record<string, string> = {
            '/repo/.nowlinerc': '{"theme": "dark"}',
        };
        const readFile = async (p: string) => {
            if (p in files) return files[p];
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        };
        const fileExists = async (p: string) => p in files;
        const startDir = path.posix.resolve('/repo/roadmaps/team-a');
        const { config, path: foundAt } = await loadConfig(startDir, {
            readFile,
            fileExists,
            root: '/',
        });
        expect(config.theme).toBe('dark');
        expect(foundAt).toBe('/repo/.nowlinerc');
    });

    it('returns an empty config when no file is found', async () => {
        const { config, path: foundAt } = await loadConfig('/tmp/nonexistent-path-12345', {
            readFile: async () => { throw new Error('nope'); },
            fileExists: async () => false,
            root: '/',
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
