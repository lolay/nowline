#!/usr/bin/env node
// Shared MCP Inspector CLI wrapper for cross-process stdio smoke tests.
// Writes a temp mcp.json, shells out to `mcp-inspector --cli`, and returns parsed JSON.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Resolve the mcp-inspector CLI entry (pinned via @nowline/mcp devDependency). */
function inspectorBin() {
    const pkgPath = require.resolve('@modelcontextprotocol/inspector/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const bin = pkg.bin?.['mcp-inspector'] ?? pkg.bin?.inspector;
    if (!bin) {
        throw new Error('could not resolve mcp-inspector bin from @modelcontextprotocol/inspector');
    }
    return path.join(path.dirname(pkgPath), bin);
}

/**
 * Run one MCP Inspector CLI operation against a stdio server entrypoint.
 *
 * @param {object} opts
 * @param {string} opts.serverEntry - Absolute path to dist/index.js
 * @param {string} [opts.serverName='nowline']
 * @param {string} [opts.cwd] - Working directory for the spawned server (defaults to temp dir)
 * @param {string} opts.method - e.g. tools/list, tools/call
 * @param {string} [opts.toolName]
 * @param {Record<string, string>} [opts.toolArgs] - flat key=value args for --tool-arg
 * @returns {unknown} Parsed JSON from inspector stdout
 */
export function runInspectorCli({
    serverEntry,
    serverName = 'nowline',
    cwd,
    method,
    toolName,
    toolArgs = {},
}) {
    const workDir = cwd ?? mkdtempSync(path.join(tmpdir(), 'nowline-mcp-inspector-'));
    const configDir = mkdtempSync(path.join(tmpdir(), 'nowline-mcp-inspector-cfg-'));
    const configPath = path.join(configDir, 'mcp.json');

    const config = {
        mcpServers: {
            [serverName]: {
                command: 'node',
                args: [serverEntry, '--root', workDir],
            },
        },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    const args = ['--cli', '--config', configPath, '--server', serverName, '--method', method];
    if (toolName) {
        args.push('--tool-name', toolName);
        for (const [key, value] of Object.entries(toolArgs)) {
            args.push('--tool-arg', `${key}=${value}`);
        }
    }

    let stdout;
    try {
        stdout = execFileSync(inspectorBin(), args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NO_COLOR: '1' },
        });
    } catch (err) {
        const stderr = err.stderr?.toString?.() ?? '';
        throw new Error(
            `mcp-inspector --cli failed (${method}${toolName ? ` ${toolName}` : ''}): ${stderr || err.message}`,
        );
    } finally {
        if (!cwd) {
            rmSync(workDir, { recursive: true, force: true });
        }
        rmSync(configDir, { recursive: true, force: true });
    }

    const trimmed = stdout.trim();
    if (!trimmed) {
        throw new Error(`mcp-inspector --cli returned empty stdout for ${method}`);
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        throw new Error(
            `mcp-inspector --cli returned non-JSON stdout for ${method}: ${trimmed.slice(0, 500)}`,
        );
    }
}

/** Extract tool call result content from inspector tools/call JSON. */
export function toolCallContent(inspectorResult) {
    const result = inspectorResult?.result ?? inspectorResult;
    if (!result || typeof result !== 'object') {
        throw new Error(
            `unexpected tools/call shape: ${JSON.stringify(inspectorResult).slice(0, 500)}`,
        );
    }
    return result;
}

/** Decode inline base64 image block from an export tool result. */
export function decodeImageFromToolResult(result) {
    if (result.isError) {
        throw new Error(`tool returned isError: ${JSON.stringify(result.content)}`);
    }
    const block = result.content?.find((c) => c.type === 'image');
    if (!block || typeof block.data !== 'string') {
        throw new Error(
            `export result missing inline image block: ${JSON.stringify(result.content)}`,
        );
    }
    return Buffer.from(block.data, 'base64');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const [method, ...rest] = process.argv.slice(2);
    if (!method) {
        console.error('usage: inspector-cli.mjs <method> [--tool-name NAME --tool-arg k=v ...]');
        process.exit(2);
    }
    const serverEntry = path.resolve(__dirname, '../dist/index.js');
    let toolName;
    const toolArgs = {};
    for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '--tool-name') {
            toolName = rest[++i];
        } else if (rest[i] === '--tool-arg') {
            const eq = rest[++i]?.indexOf('=') ?? -1;
            if (eq < 0) continue;
            toolArgs[rest[i].slice(0, eq)] = rest[i].slice(eq + 1);
        }
    }
    const out = runInspectorCli({ serverEntry, method, toolName, toolArgs });
    console.log(JSON.stringify(out, null, 2));
}
