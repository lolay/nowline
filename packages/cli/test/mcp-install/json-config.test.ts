import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JsonTarget } from '../../src/mcp-install/clients.js';
import {
    JsonConfigError,
    removeEntry,
    upsertEntry,
    writeConfigFile,
} from '../../src/mcp-install/json-config.js';

const entry = { command: '/opt/homebrew/bin/nowline', args: ['--mcp'] };

const target: JsonTarget = {
    kind: 'json',
    path: '/config/mcp.json',
    place: (e) => ({
        keyPath: ['mcpServers', 'nowline'],
        value: { command: e.command, args: e.args },
    }),
};

describe('upsertEntry', () => {
    it('creates a missing file, starting from the seed', () => {
        const edit = upsertEntry(undefined, { ...target, seed: { schema_version: 1 } }, entry);
        expect(edit.change).toBe('created');
        expect(JSON.parse(edit.text ?? '')).toEqual({
            schema_version: 1,
            mcpServers: { nowline: { command: entry.command, args: ['--mcp'] } },
        });
        expect(edit.text?.endsWith('\n')).toBe(true);
    });

    it('keeps comments and sibling layout when adding to a non-empty object', () => {
        const before = [
            '{',
            '    // my servers',
            '    "mcpServers": {',
            '        "other": { "command": "x" }',
            '    },',
            '    "b": [ 1, 2 ]',
            '}',
            '',
        ].join('\n');
        const edit = upsertEntry(before, target, entry);
        expect(edit.change).toBe('added');
        expect(edit.text).toBe(
            [
                '{',
                '    // my servers',
                '    "mcpServers": {',
                '        "other": { "command": "x" },',
                '        "nowline": {',
                '            "command": "/opt/homebrew/bin/nowline",',
                '            "args": [',
                '                "--mcp"',
                '            ]',
                '        }',
                '    },',
                '    "b": [ 1, 2 ]',
                '}',
                '',
            ].join('\n'),
        );
    });

    it('follows tab indentation and CRLF line endings', () => {
        const edit = upsertEntry('{\r\n\t"theme": "x"\r\n}\r\n', target, entry);
        expect(edit.text).toContain('\r\n\t"mcpServers": {\r\n\t\t"nowline": {');
        expect(edit.text).not.toMatch(/[^\r]\n/);
    });

    it('is a no-op when the same entry is already there', () => {
        const once = upsertEntry(undefined, target, entry).text;
        expect(upsertEntry(once, target, entry).change).toBe('unchanged');
    });

    it('replaces a different entry', () => {
        const once = upsertEntry(undefined, target, { command: 'npx', args: [] }).text;
        const edit = upsertEntry(once, target, entry);
        expect(edit.change).toBe('updated');
        expect(JSON.parse(edit.text ?? '').mcpServers.nowline.command).toBe(entry.command);
    });

    it('refuses a file it cannot parse rather than overwriting it', () => {
        expect(() => upsertEntry('{ "mcpServers": ', target, entry)).toThrow(JsonConfigError);
        expect(() => upsertEntry('[]', target, entry)).toThrow(/not a JSON object/);
    });
});

describe('removeEntry', () => {
    it('round-trips: install then uninstall restores the original bytes', () => {
        const before = '{\n    // keep\n    "mcpServers": {\n        "a": {"q":1}\n    }\n}\n';
        const installed = upsertEntry(before, target, entry).text;
        const removed = removeEntry(installed, target, entry);
        expect(removed.change).toBe('removed');
        expect(removed.text).toBe(before);
    });

    it('reports absent for a missing file or entry', () => {
        expect(removeEntry(undefined, target, entry).change).toBe('absent');
        expect(removeEntry('{"mcpServers": {}}', target, entry).change).toBe('absent');
    });
});

describe('writeConfigFile', () => {
    it('creates parent directories', () => {
        const dir = mkdtempSync(path.join(os.tmpdir(), 'nowline-json-'));
        const file = path.join(dir, 'a', 'b', 'mcp.json');
        writeConfigFile(file, '{}\n');
        expect(readFileSync(file, 'utf-8')).toBe('{}\n');
    });

    // Creating symlinks needs elevated rights on Windows.
    it.skipIf(process.platform === 'win32')(
        'writes through a symlink instead of replacing it',
        () => {
            const dir = mkdtempSync(path.join(os.tmpdir(), 'nowline-json-'));
            const real = path.join(dir, 'dotfiles-mcp.json');
            const link = path.join(dir, 'mcp.json');
            writeFileSync(real, '{}\n');
            symlinkSync(real, link);
            writeConfigFile(link, '{"a":1}\n');
            expect(readFileSync(real, 'utf-8')).toBe('{"a":1}\n');
        },
    );
});
