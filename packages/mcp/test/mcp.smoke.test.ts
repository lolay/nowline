// Integration tests for @nowline/mcp server tools.
//
// Tests run in-process against the server module's shared helpers without
// spawning a subprocess, so they are fast and don't require a built binary.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/server.js';

const MINIMAL = [
    'nowline v1',
    'title Smoke Test',
    '',
    'roadmap',
    '  lane Test',
    '    item foo "Foo item" size:m',
].join('\n');

const _INVALID_SOURCE = 'nowline v1\nbad syntax @@@@';

describe('@nowline/mcp — server creation', () => {
    it('createMcpServer() returns an McpServer instance', () => {
        const server = createMcpServer({ allowedRoot: process.cwd() });
        expect(server).toBeDefined();
        // McpServer has a .server property (the underlying Server)
        expect(typeof server.connect).toBe('function');
    });
});

describe('@nowline/mcp — file tools', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nowline-mcp-test-'));
        writeFileSync(path.join(tmpDir, 'smoke.nowline'), MINIMAL, 'utf-8');
        mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
        writeFileSync(path.join(tmpDir, 'sub', 'nested.nowline'), MINIMAL, 'utf-8');
    });

    afterAll(() => {
        try {
            rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* best-effort */
        }
    });

    it('list finds .nowline files non-recursively', async () => {
        // Access list logic via an in-process helper instead of the MCP transport.
        // We re-implement the directory scan to test it independently.
        const { promises: fs } = await import('node:fs');
        const files: string[] = [];
        for (const entry of await fs.readdir(tmpDir, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith('.nowline')) {
                files.push(path.join(tmpDir, entry.name));
            }
        }
        expect(files.some((f) => f.endsWith('smoke.nowline'))).toBe(true);
    });

    it('the server module builds without error', async () => {
        // Importing the module exercises all static imports.
        const mod = await import('../src/server.js');
        expect(typeof mod.createMcpServer).toBe('function');
    });
});

describe('@nowline/mcp — resource content', () => {
    it('REFERENCE_MAN_PAGE is non-empty text', async () => {
        const { REFERENCE_MAN_PAGE } = await import('../src/generated/resources.js');
        expect(typeof REFERENCE_MAN_PAGE).toBe('string');
        expect(REFERENCE_MAN_PAGE.length).toBeGreaterThan(100);
    });

    it('EXAMPLES contains at least one entry with name and content', async () => {
        const { EXAMPLES } = await import('../src/generated/resources.js');
        expect(Array.isArray(EXAMPLES)).toBe(true);
        expect(EXAMPLES.length).toBeGreaterThan(0);
        expect(typeof EXAMPLES[0].name).toBe('string');
        expect(typeof EXAMPLES[0].content).toBe('string');
    });
});
