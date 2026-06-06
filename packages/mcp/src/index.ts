#!/usr/bin/env node
// @nowline/mcp — entry point for `npx @nowline/mcp`.
//
// Parses --root, --port, and --version flags, creates the MCP server, and
// connects it to the appropriate transport:
//   stdio  (default)                  standard MCP stdio transport
//   http   (--port <N>)               Streamable HTTP transport on localhost:<N>
//
// Usage:
//   npx @nowline/mcp [--root <path>] [--port <N>] [--version]
//
// Spec: specs/mcp.md.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readPkgVersion(): string {
    try {
        const raw = readFileSync(resolve(__dirname, '../package.json'), 'utf-8');
        const pkg = JSON.parse(raw) as { version?: string };
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

const PKG_VERSION = readPkgVersion();

function parseArgs(argv: string[]): {
    root?: string;
    port?: number;
    help: boolean;
    version: boolean;
} {
    const args = argv.slice(2);
    let root: string | undefined;
    let port: number | undefined;
    let help = false;
    let version = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--root' && i + 1 < args.length) {
            root = args[++i];
        } else if (args[i] === '--port' && i + 1 < args.length) {
            const n = parseInt(args[++i], 10);
            if (!Number.isFinite(n) || n < 1 || n > 65535) {
                process.stderr.write(`nowline-mcp: --port must be a number between 1 and 65535\n`);
                process.exit(1);
            }
            port = n;
        } else if (args[i] === '-h' || args[i] === '--help') {
            help = true;
        } else if (args[i] === '--version' || args[i] === '-v') {
            version = true;
        }
    }
    return { root, port, help, version };
}

const { root, port, help, version } = parseArgs(process.argv);

if (version) {
    process.stdout.write(`${PKG_VERSION}\n`);
    process.exit(0);
}

if (help) {
    process.stdout.write(
        [
            'Usage: npx @nowline/mcp [options]',
            '',
            'Start the Nowline MCP server.',
            '',
            'Options:',
            '  --root <path>   Allowed root for file operations. Defaults to cwd.',
            '  --port <N>      Listen on localhost:<N> using Streamable HTTP transport.',
            '                  When omitted, uses stdio transport (default).',
            '  --version, -v   Print version and exit.',
            '  --help, -h      Show this help.',
            '',
        ].join('\n'),
    );
    process.exit(0);
}

const server = createMcpServer({ allowedRoot: root, version: PKG_VERSION });

if (port !== undefined) {
    // Streamable HTTP transport — stateless (no session management).
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });
    await server.connect(transport);

    const httpServer = createServer(async (req, res) => {
        await transport.handleRequest(req, res);
    });

    httpServer.listen(port, '127.0.0.1', () => {
        process.stderr.write(
            `nowline-mcp: Streamable HTTP listening on http://127.0.0.1:${port}\n`,
        );
    });

    await new Promise<void>((resolve) => {
        httpServer.on('close', resolve);
        process.on('SIGINT', () => httpServer.close());
        process.on('SIGTERM', () => httpServer.close());
    });
} else {
    // Default: stdio transport.
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
