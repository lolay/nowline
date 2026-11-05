import { InvalidPortError, startMcpServer } from '@nowline/mcp/start';
import type { ParsedArgs } from '../cli/args.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { createLog } from '../io/log.js';

/**
 * `nowline --mcp` handler.
 *
 * Starts the Model Context Protocol server through the same `startMcpServer`
 * that `npx @nowline/mcp` calls, so `--root` (expansion and the binary-export
 * delivery default), `--port` and the reported version behave identically.
 *
 * Transport selection:
 *   stdio (default)  — when --port is absent.
 *   Streamable HTTP  — when --port <N> is supplied; listens on 127.0.0.1:<N>.
 *
 * Runs until the process receives SIGINT/SIGTERM or the client closes stdin.
 */
export async function mcpHandler({ args }: { args: ParsedArgs }): Promise<void> {
    try {
        await startMcpServer({
            root: args.root,
            port: args.port,
            onListening: (url) =>
                createLog(args.logLevel).notice(`nowline: MCP Streamable HTTP listening on ${url}`),
        });
    } catch (err) {
        if (err instanceof InvalidPortError) {
            throw new CliError(ExitCode.InputError, `nowline: ${err.message}`);
        }
        throw err;
    }
}
