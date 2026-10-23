import type { ParsedArgs } from '../cli/args.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { createLog } from '../io/log.js';
import {
    CLIENT_IDS,
    CLIENTS,
    type ClientDescriptor,
    type CliTarget,
    commandLine,
    findClient,
    type JsonTarget,
    type PrintTarget,
    type Scope,
    SERVER_NAME,
} from '../mcp-install/clients.js';
import { createHostEnv, type HostEnv } from '../mcp-install/host.js';
import {
    JsonConfigError,
    readConfigFile,
    removeEntry,
    upsertEntry,
    writeConfigFile,
} from '../mcp-install/json-config.js';
import { resolveServer, type ServerEntry } from '../mcp-install/server-command.js';

export interface McpInstallOptions {
    args: ParsedArgs;
    host?: HostEnv;
    stdout?: (chunk: string) => void;
}

interface Run {
    uninstall: boolean;
    dryRun: boolean;
    scope: Scope;
    entry: ServerEntry;
    host: HostEnv;
    out: (line: string) => void;
}

/**
 * `nowline --mcp-install [<client>]` / `--mcp-uninstall [<client>]`.
 *
 * Registers (or removes) the `nowline` MCP server in each harness's config.
 * JSON configs are edited in place; Claude Code's user scope and Codex go
 * through their own `mcp add`, since we can't safely edit ~/.claude.json or
 * TOML; YAML and undocumented paths get a paste-ready snippet. One client
 * failing doesn't stop the rest; the run then exits with OutputError.
 */
export async function mcpInstallHandler({
    args,
    host = createHostEnv(),
    stdout = (chunk) => {
        process.stdout.write(chunk);
    },
}: McpInstallOptions): Promise<void> {
    const uninstall = args.mode === 'mcp-uninstall';
    const flag = uninstall ? '--mcp-uninstall' : '--mcp-install';
    const scope = args.scope ?? 'user';
    const log = createLog(args.logLevel);
    const out = (line: string) => stdout(`${line}\n`);

    const clients = selectClients(args.positional, scope, flag, host, out);

    const server = resolveServer(args.server ?? 'self', args.root, host);
    if (!uninstall) for (const warning of server.warnings) log.notice(warning);

    const run: Run = { uninstall, dryRun: args.dryRun, scope, entry: server.entry, host, out };
    const failed: string[] = [];
    for (const client of clients) {
        try {
            applyTarget(client, run);
        } catch (err) {
            if (!(err instanceof JsonConfigError || err instanceof ClientFailure)) throw err;
            failed.push(client.id);
            process.stderr.write(`nowline: ${client.id}: ${err.message}\n`);
        }
    }
    if (failed.length > 0) {
        throw new CliError(
            ExitCode.OutputError,
            `nowline: ${flag} failed for ${failed.join(', ')}.`,
        );
    }
}

class ClientFailure extends Error {}

function selectClients(
    requested: string | undefined,
    scope: Scope,
    flag: string,
    host: HostEnv,
    out: (line: string) => void,
): ClientDescriptor[] {
    if (requested !== undefined && requested !== 'all') {
        const client = findClient(requested);
        if (!client) {
            throw new CliError(
                ExitCode.InputError,
                `nowline: unknown client "${requested}". Expected one of: ${CLIENT_IDS.join(', ')}, all.`,
            );
        }
        if (!client.scopes.includes(scope)) {
            throw new CliError(
                ExitCode.InputError,
                `nowline: ${client.id} has no ${scope} config; use --scope ${client.scopes.join(' or ')}.`,
            );
        }
        return [client];
    }
    const detected = CLIENTS.filter((client) => client.detect(host));
    if (detected.length === 0) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: no supported agent found on this machine. Name one: nowline ${flag} <client>, where <client> is one of: ${CLIENT_IDS.join(', ')}.`,
        );
    }
    return detected.filter((client) => {
        if (client.scopes.includes(scope)) return true;
        out(`${client.id}: skipped, it has no ${scope} config`);
        return false;
    });
}

function applyTarget(client: ClientDescriptor, run: Run): void {
    const target = client.target(run.scope, run.entry, run.host);
    if (target.kind === 'json') return applyJson(client, target, run);
    if (target.kind === 'cli') {
        if (run.host.findAllOnPath(target.binary).length === 0) {
            return applyPrint(client, target.fallback, run);
        }
        return applyCli(client, target, run);
    }
    return applyPrint(client, target, run);
}

function applyJson(client: ClientDescriptor, target: JsonTarget, run: Run): void {
    const existing = readConfigFile(target.path);
    const edit = run.uninstall
        ? removeEntry(existing, target, run.entry)
        : upsertEntry(existing, target, run.entry);
    const where = target.path;
    if (edit.change === 'unchanged') return run.out(`${client.id}: already installed in ${where}`);
    if (edit.change === 'absent') return run.out(`${client.id}: not installed in ${where}`);

    const [verb, object] =
        edit.change === 'created'
            ? ['create', where]
            : edit.change === 'removed'
              ? ['remove', `${SERVER_NAME} from ${where}`]
              : edit.change === 'added'
                ? ['add', `${SERVER_NAME} to ${where}`]
                : ['update', `${SERVER_NAME} in ${where}`];
    if (run.dryRun) {
        run.out(`${client.id}: would ${verb} ${object}`);
        if (edit.value !== undefined) {
            run.out(indent(JSON.stringify({ [edit.keyPath.join('.')]: edit.value }, null, 2)));
        }
        return;
    }
    if (edit.text !== undefined) writeConfigFile(target.path, edit.text);
    const hint = target.hint !== undefined && !run.uninstall ? `; ${target.hint}` : '';
    run.out(`${client.id}: ${verb.endsWith('e') ? `${verb}d` : `${verb}ed`} ${object}${hint}`);
}

function applyCli(client: ClientDescriptor, target: CliTarget, run: Run): void {
    const remove = [target.binary, ...target.remove];
    const add = [target.binary, ...target.add];
    if (run.dryRun) {
        run.out(`${client.id}: would run:`);
        run.out(indent(commandLine(remove)));
        if (!run.uninstall) run.out(indent(commandLine(add)));
        return;
    }
    // Remove first so a re-run replaces a stale entry instead of failing on a duplicate.
    const removed = run.host.spawn(target.binary, target.remove);
    if (run.uninstall) {
        if (removed.status === 0) {
            return run.out(`${client.id}: removed ${SERVER_NAME} (${commandLine(remove)})`);
        }
        return run.out(
            `${client.id}: nothing removed; ${commandLine(remove)} said: ${firstLine(removed.stderr || removed.stdout || removed.error)}`,
        );
    }
    const added = run.host.spawn(target.binary, target.add);
    if (added.status !== 0) {
        const reason = firstLine(added.stderr || added.stdout || added.error);
        throw new ClientFailure(
            `${commandLine(add)} failed${added.status !== null ? ` (exit ${added.status})` : ''}: ${reason}`,
        );
    }
    run.out(`${client.id}: registered (${commandLine(add)})`);
}

function applyPrint(client: ClientDescriptor, target: PrintTarget, run: Run): void {
    const step = run.uninstall ? target.uninstall : target.install;
    run.out(`${client.id}: ${step.instructions}`);
    if (step.snippet !== undefined) run.out(indent(step.snippet));
}

function indent(text: string): string {
    return text
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
}

function firstLine(text: string | undefined): string {
    return text?.trim().split('\n')[0] ?? 'no output';
}
