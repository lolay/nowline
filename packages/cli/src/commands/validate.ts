import { defineCommand } from 'citty';
import { readInput } from '../io/read.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { parseSource } from '../core/parse.js';
import {
    formatDiagnostics,
    isDiagnosticFormat,
    type DiagnosticFormat,
    type DiagnosticSource,
} from '../diagnostics/index.js';

export const validateCommand = defineCommand({
    meta: {
        name: 'validate',
        description: 'Parse and validate a .nowline file',
    },
    args: {
        input: {
            type: 'positional',
            description: 'Path to .nowline file, or "-" for stdin',
            required: true,
        },
        format: {
            type: 'string',
            description: 'Error format: text or json',
            default: 'text',
        },
    },
    async run({ args }) {
        const format = parseFormat(args.format);
        const input = await readInput(args.input);
        const result = await parseSource(input.contents, input.displayPath, { validate: true });

        const sources = new Map<string, DiagnosticSource>([[input.displayPath, result.source]]);
        if (result.diagnostics.length > 0) {
            const rendered = formatDiagnostics(result.diagnostics, format, sources, {
                color: process.stderr.isTTY === true,
            });
            process.stderr.write(`${rendered}\n`);
        }

        if (result.hasErrors) {
            throw new CliError(ExitCode.ValidationError, '');
        }
    },
});

function parseFormat(raw: unknown): DiagnosticFormat {
    if (isDiagnosticFormat(raw)) return raw;
    throw new CliError(
        ExitCode.ValidationError,
        `Invalid --format: ${String(raw)}. Expected 'text' or 'json'.`,
    );
}
