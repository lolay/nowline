import { parseArgs, type ParseArgsConfig } from 'node:util';
import { CliError, ExitCode } from '../io/exit-codes.js';

export type ModeKind = 'render' | 'serve' | 'init' | 'help' | 'version';

export interface ParsedArgs {
    /** Resolved mode after dispatch (mutual-exclusivity already checked). */
    mode: ModeKind;
    /** Positional argument, or undefined. Render = input path. Init = project name. Serve = input path. */
    positional?: string;
    /** True if `--dry-run` / `-n` was passed (only valid for render mode). */
    dryRun: boolean;
    /** Logging level. Verbose and quiet are mutually exclusive. */
    logLevel: 'verbose' | 'quiet' | 'normal';

    // I/O
    output?: string;
    format?: string;
    inputFormat?: string;

    // Render options
    theme?: string;
    today?: string;
    noLinks: boolean;
    scale?: string;
    strict: boolean;
    width?: string;
    assetRoot?: string;

    // Serve options
    port?: string;
    host?: string;
    open: boolean;

    // Validate / dry-run formatting
    diagnosticFormat?: string;

    // Init
    template?: string;
}

/**
 * Pure argument parser. Walks `argv` once, identifies mode flags, applies
 * mutual-exclusivity rules, and returns a fully-resolved `ParsedArgs`. Throws
 * `CliError(ExitCode.InputError)` for usage errors.
 *
 * Help / version short-circuit any other flag combinations.
 */
export function parseArgv(argv: readonly string[]): ParsedArgs {
    if (argv.length === 0) {
        return { mode: 'help', dryRun: false, logLevel: 'normal', noLinks: false, strict: false, open: false };
    }

    const config: ParseArgsConfig = {
        args: argv as string[],
        allowPositionals: true,
        strict: true,
        options: {
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean', short: 'V' },
            verbose: { type: 'boolean', short: 'v' },
            quiet: { type: 'boolean', short: 'q' },

            output: { type: 'string', short: 'o' },
            format: { type: 'string', short: 'f' },
            'input-format': { type: 'string' },

            serve: { type: 'boolean' },
            init: { type: 'boolean' },
            'dry-run': { type: 'boolean', short: 'n' },

            theme: { type: 'string', short: 't' },
            today: { type: 'string' },
            'no-links': { type: 'boolean' },
            scale: { type: 'string', short: 's' },
            strict: { type: 'boolean' },
            width: { type: 'string', short: 'w' },
            'asset-root': { type: 'string' },

            port: { type: 'string', short: 'p' },
            host: { type: 'string' },
            open: { type: 'boolean' },

            'diagnostic-format': { type: 'string' },

            template: { type: 'string' },
        },
    };

    let parsed: ReturnType<typeof parseArgs>;
    try {
        parsed = parseArgs(config);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(ExitCode.InputError, formatUsageError(message));
    }

    const values = parsed.values as Record<string, unknown>;
    const positionals = parsed.positionals;

    if (values.help === true) {
        return { mode: 'help', dryRun: false, logLevel: 'normal', noLinks: false, strict: false, open: false };
    }
    if (values.version === true) {
        return { mode: 'version', dryRun: false, logLevel: 'normal', noLinks: false, strict: false, open: false };
    }

    if (values.verbose === true && values.quiet === true) {
        throw new CliError(
            ExitCode.InputError,
            'nowline: --verbose and --quiet are mutually exclusive.',
        );
    }

    const modes: ModeKind[] = [];
    if (values.serve === true) modes.push('serve');
    if (values.init === true) modes.push('init');
    if (modes.length > 1) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: --${modes[0]} and --${modes[1]} are mutually exclusive.`,
        );
    }

    const dryRun = values['dry-run'] === true;
    const mode: ModeKind = modes[0] ?? 'render';

    if (dryRun && (mode === 'serve' || mode === 'init')) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: --dry-run cannot be combined with --${mode}.`,
        );
    }

    if (positionals.length > 1) {
        const extras = positionals.slice(1).map((p) => JSON.stringify(p)).join(' ');
        throw new CliError(
            ExitCode.InputError,
            `nowline: unexpected extra arguments: ${extras}.`,
        );
    }

    const logLevel: ParsedArgs['logLevel'] = values.verbose === true
        ? 'verbose'
        : values.quiet === true
            ? 'quiet'
            : 'normal';

    return {
        mode,
        positional: positionals[0],
        dryRun,
        logLevel,
        output: stringOrUndefined(values.output),
        format: stringOrUndefined(values.format),
        inputFormat: stringOrUndefined(values['input-format']),
        theme: stringOrUndefined(values.theme),
        today: stringOrUndefined(values.today),
        noLinks: values['no-links'] === true,
        scale: stringOrUndefined(values.scale),
        strict: values.strict === true,
        width: stringOrUndefined(values.width),
        assetRoot: stringOrUndefined(values['asset-root']),
        port: stringOrUndefined(values.port),
        host: stringOrUndefined(values.host),
        open: values.open === true,
        diagnosticFormat: stringOrUndefined(values['diagnostic-format']),
        template: stringOrUndefined(values.template),
    };
}

function stringOrUndefined(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    return undefined;
}

function formatUsageError(message: string): string {
    if (message.startsWith('Unknown option')) {
        return `nowline: ${message}. Try --help for usage.`;
    }
    if (message.includes('expected')) {
        return `nowline: ${message}. Try --help for usage.`;
    }
    return `nowline: ${message}`;
}
