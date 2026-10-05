// packages/mcp/manifest.json (.mcpb) and server.json (MCP registry) are
// tracked and carry the @nowline/mcp version. The release cut syncs and
// commits them (.github/scripts/bump-version.mjs), and `make pack-mcpb` only
// checks them, so a lag here means the release commit skipped them.
// Regression guard: they sat at 0.8.3 while package.json was 0.8.6, and every
// local `make pack-mcpb` rewrote them in place.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MCP_DIR = path.resolve(import.meta.dirname, '..', '..', 'mcp');

function readJson(name: string) {
    return JSON.parse(readFileSync(path.join(MCP_DIR, name), 'utf8'));
}

describe('@nowline/mcp metadata versions', () => {
    const version = readJson('package.json').version;

    it('manifest.json matches package.json', () => {
        expect(readJson('manifest.json').version).toBe(version);
    });

    it('server.json matches package.json', () => {
        const server = readJson('server.json');
        expect(server.version).toBe(version);
        expect(server.packages[0].version).toBe(version);
    });
});
