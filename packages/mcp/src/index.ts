#!/usr/bin/env node
// @nowline/mcp — entry point for `npx @nowline/mcp`.
//
// Parses --root, --port, and --version flags and hands them to
// startMcpServer (start.ts), which `nowline --mcp` calls too. Transports:
//   stdio  (default)                  standard MCP stdio transport
//   http   (--port <N>)               Streamable HTTP transport on localhost:<N>
//
// Usage:
//   npx @nowline/mcp [--root <path>] [--port <N>] [--version]
//
// Spec: specs/mcp.md.

import { MCP_VERSION } from './generated/version.js';
import { InvalidPortError, startMcpServer } from './start.js';

function parseArgs(argv: string[]): {
    root?: string;
    port?: string;
    help: boolean;
    version: boolean;
} {
    const args = argv.slice(2);
    let root: string | undefined;
    let port: string | undefined;
    let help = false;
    let version = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--root' && i + 1 < args.length) {
            root = args[++i];
        } else if (args[i] === '--port' && i + 1 < args.length) {
            port = args[++i];
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
    process.stdout.write(`${MCP_VERSION}\n`);
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
            '  --root <path>   Allowed root for file operations. Defaults to the',
            "                  client's MCP roots, else cwd.",
            '  --port <N>      Listen on localhost:<N> using Streamable HTTP transport.',
            '                  When omitted, uses stdio transport (default).',
            '  --version, -v   Print version and exit.',
            '  --help, -h      Show this help.',
            '',
        ].join('\n'),
    );
    process.exit(0);
}

try {
    await startMcpServer({ root, port });
} catch (err) {
    if (!(err instanceof InvalidPortError)) throw err;
    process.stderr.write(`nowline-mcp: ${err.message}\n`);
    process.exit(1);
}
