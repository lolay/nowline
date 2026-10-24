// The files that ship @nowline/mcp outside npm are tracked and carry its
// version: packages/mcp/manifest.json (.mcpb), server.json (MCP registry),
// gemini-extension.json, and the plugin manifests under plugins/nowline. The
// release cut syncs and commits them (.github/scripts/bump-version.mjs), and
// `make pack-mcpb` only checks them, so a lag here means the release commit
// skipped them.
// Regression guards: manifest.json and server.json sat at 0.8.3 while
// package.json was 0.8.6, and every local `make pack-mcpb` rewrote them in
// place; gemini-extension.json sat at 0.8.5 through the 0.9.0 release because
// nothing synced it.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const MCP_DIR = path.join(REPO_ROOT, 'packages', 'mcp');
const PLUGIN_DIR = path.join(REPO_ROOT, 'plugins', 'nowline');

function readJson(...segments: string[]) {
    return JSON.parse(readFileSync(path.join(...segments), 'utf8'));
}

describe('@nowline/mcp metadata versions', () => {
    const version = readJson(MCP_DIR, 'package.json').version;

    it('manifest.json matches package.json', () => {
        expect(readJson(MCP_DIR, 'manifest.json').version).toBe(version);
    });

    it('server.json matches package.json', () => {
        const server = readJson(MCP_DIR, 'server.json');
        expect(server.version).toBe(version);
        expect(server.packages[0].version).toBe(version);
    });

    it('gemini-extension.json matches package.json', () => {
        expect(readJson(REPO_ROOT, 'gemini-extension.json').version).toBe(version);
    });

    it('both plugin manifests match package.json', () => {
        expect(readJson(PLUGIN_DIR, '.claude-plugin', 'plugin.json').version).toBe(version);
        expect(readJson(PLUGIN_DIR, 'plugin.json').version).toBe(version);
    });
});

// The plugin ships the same server in two formats: .claude-plugin/plugin.json
// + .mcp.json (Claude Code, Copilot CLI) and plugin.json + mcp.json (Agent
// Plugins, read by Codex, Cursor, and Copilot CLI). They must not drift apart.
describe('plugins/nowline manifests', () => {
    const claude = readJson(PLUGIN_DIR, '.claude-plugin', 'plugin.json');
    const agent = readJson(PLUGIN_DIR, 'plugin.json');
    const claudeMcp = readJson(PLUGIN_DIR, '.mcp.json');
    const agentMcp = readJson(PLUGIN_DIR, 'mcp.json');

    it('share the plugin metadata', () => {
        for (const key of [
            'name',
            'description',
            'author',
            'homepage',
            'repository',
            'license',
            'keywords',
        ]) {
            expect(agent[key], key).toEqual(claude[key]);
        }
    });

    it('launch the same server', () => {
        const { type, ...agentServer } = agentMcp.mcpServers.nowline;
        expect(type).toBe('stdio');
        expect(agentServer).toEqual(claudeMcp.mcpServers.nowline);
        expect(claudeMcp.mcpServers.nowline.args).toContain('@nowline/mcp@latest');
    });

    it('are listed in the repo marketplace under the same name', () => {
        const marketplace = readJson(REPO_ROOT, '.claude-plugin', 'marketplace.json');
        expect(marketplace.plugins).toEqual([
            expect.objectContaining({ name: claude.name, source: './plugins/nowline' }),
        ]);
    });
});
