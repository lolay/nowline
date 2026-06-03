#!/usr/bin/env node
// @nowline/mcp — entry point for `npx @nowline/mcp`.
//
// Parses the optional --root flag, creates the MCP server, and connects it to
// the stdio transport.  The server module (createMcpServer) is shared with
// the CLI's `--mcp` flag (packages/cli/src/commands/mcp-host.ts).
//
// Usage:
//   npx @nowline/mcp [--root <path>] [--version]
//
// Spec: specs/mcp.md.  Plan: export_determinism s8 + s10.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

function parseArgs(argv: string[]): { root?: string; help: boolean; version: boolean } {
    const args = argv.slice(2);
    let root: string | undefined;
    let help = false;
    let version = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--root' && i + 1 < args.length) {
            root = args[++i];
        } else if (args[i] === '-h' || args[i] === '--help') {
            help = true;
        } else if (args[i] === '--version' || args[i] === '-v') {
            version = true;
        }
    }
    return { root, help, version };
}

const { root, help, version } = parseArgs(process.argv);

if (version) {
    process.stdout.write('0.5.1\n');
    process.exit(0);
}

if (help) {
    process.stdout.write(
        [
            'Usage: npx @nowline/mcp [options]',
            '',
            'Start the Nowline MCP server (stdio transport).',
            '',
            'Options:',
            '  --root <path>   Allowed root for file operations. Defaults to cwd.',
            '  --version, -v   Print version and exit.',
            '  --help, -h      Show this help.',
            '',
        ].join('\n'),
    );
    process.exit(0);
}

const server = createMcpServer({ allowedRoot: root });
const transport = new StdioServerTransport();
await server.connect(transport);
