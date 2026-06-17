#!/usr/bin/env node
// Gated real-Claude headless e2e against the built @nowline/mcp stdio server.
// Skips with exit 0 when ANTHROPIC_API_KEY is unset (local no-op).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, '../dist/index.js');

const MINIMAL = [
    'nowline v1',
    '',
    'roadmap smoke-test "Smoke Test" start:2025-01-06 scale:1w',
    '',
    'swimlane test-lane "Test Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

function main() {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.log('mcp-claude-e2e skipped — ANTHROPIC_API_KEY not set');
        return;
    }

    if (!existsSync(serverEntry)) {
        throw new Error(`built server missing: ${serverEntry} (run make build first)`);
    }

    const tmpDir = mkdtempSync(path.join(tmpdir(), 'nowline-mcp-claude-e2e-'));
    const configPath = path.join(tmpDir, 'mcp.json');
    writeFileSync(
        configPath,
        JSON.stringify(
            {
                mcpServers: {
                    nowline: {
                        command: 'node',
                        args: [serverEntry, '--root', tmpDir],
                    },
                },
            },
            null,
            2,
        ),
        'utf8',
    );

    const prompt =
        'Use the nowline MCP server only. Call validate on this source, then render it as svg with now 2025-01-15. ' +
        'Stop after both tools succeed.\n\n' +
        MINIMAL;

    let stdout;
    try {
        stdout = execFileSync(
            'claude',
            [
                '-p',
                '--bare',
                '--strict-mcp-config',
                '--mcp-config',
                configPath,
                '--allowedTools',
                'mcp__nowline__validate,mcp__nowline__render',
                '--output-format',
                'json',
                '--max-turns',
                '6',
                '--max-budget-usd',
                '1.00',
                prompt,
            ],
            {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: process.env,
            },
        );
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }

    let payload;
    try {
        payload = JSON.parse(stdout.trim());
    } catch {
        throw new Error(`claude -p returned non-JSON stdout: ${stdout.slice(0, 500)}`);
    }

    if (payload.is_error || payload.subtype === 'error') {
        throw new Error(`claude -p failed: ${JSON.stringify(payload).slice(0, 1000)}`);
    }

    const blob = JSON.stringify(payload);
    if (!/mcp__nowline__/.test(blob)) {
        throw new Error(
            'claude -p completed but no mcp__nowline__ tool invocation found in output',
        );
    }

    console.log('mcp-claude-e2e ok — claude invoked at least one nowline MCP tool');
}

main();
