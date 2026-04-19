import * as path from 'node:path';
import { defineCommand } from 'citty';
import { readInput } from '../io/read.js';
import { writeOutput } from '../io/write.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { parseSource } from '../core/parse.js';
import { serializeToJson } from '../convert/schema.js';
import { parseNowlineJson } from '../convert/parse-json.js';
import { printNowlineFile } from '../convert/printer.js';
import {
    formatDiagnostics,
    type DiagnosticSource,
} from '../diagnostics/index.js';

type IOFormat = 'nowline' | 'json';

export const convertCommand = defineCommand({
    meta: {
        name: 'convert',
        description: 'Convert between .nowline and JSON',
    },
    args: {
        input: {
            type: 'positional',
            description: 'Input file (.nowline or .json); "-" for stdin',
            required: true,
        },
        output: {
            type: 'string',
            alias: 'o',
            description: 'Output file (default: stdout)',
        },
        format: {
            type: 'string',
            alias: 'f',
            description: 'Output format: nowline or json',
        },
    },
    async run({ args }) {
        const input = await readInput(args.input);
        const inputFormat = inferInputFormat(args.input, input.isStdin, input.contents);
        const outputFormat = inferOutputFormat(
            inputFormat,
            typeof args.format === 'string' ? args.format : undefined,
            typeof args.output === 'string' ? args.output : undefined,
        );

        const rendered = await doConvert(input.contents, input.displayPath, inputFormat, outputFormat);
        await writeOutput(
            typeof args.output === 'string' ? args.output : undefined,
            rendered,
            'text',
        );
    },
});

async function doConvert(
    contents: string,
    displayPath: string,
    inputFormat: IOFormat,
    outputFormat: IOFormat,
): Promise<string> {
    if (inputFormat === 'nowline') {
        const result = await parseSource(contents, displayPath, { validate: true });
        if (result.hasErrors) {
            emitDiagnostics(result.diagnostics, result.source, displayPath);
            throw new CliError(ExitCode.ValidationError, '');
        }
        if (outputFormat === 'json') {
            const doc = serializeToJson(result.document, contents);
            return JSON.stringify(doc, null, 2);
        }
        const doc = serializeToJson(result.document, contents);
        return printNowlineFile(doc.ast);
    }

    // JSON input
    const { ast } = parseNowlineJson(contents, displayPath);
    const text = printNowlineFile(ast);
    if (outputFormat === 'nowline') {
        return text;
    }
    // JSON -> JSON: re-parse the printed text through core so we get a canonical AST with positions
    const reparsed = await parseSource(text, displayPath, { validate: true });
    if (reparsed.hasErrors) {
        emitDiagnostics(reparsed.diagnostics, reparsed.source, displayPath);
        throw new CliError(ExitCode.ValidationError, '');
    }
    return JSON.stringify(serializeToJson(reparsed.document, text), null, 2);
}

function emitDiagnostics(
    diagnostics: Parameters<typeof formatDiagnostics>[0],
    source: DiagnosticSource,
    displayPath: string,
): void {
    const sources = new Map<string, DiagnosticSource>([[displayPath, source]]);
    const rendered = formatDiagnostics(diagnostics, 'text', sources, {
        color: process.stderr.isTTY === true,
    });
    if (rendered) process.stderr.write(`${rendered}\n`);
}

function inferInputFormat(inputArg: string, isStdin: boolean, contents: string): IOFormat {
    if (!isStdin) {
        const ext = path.extname(inputArg).toLowerCase();
        if (ext === '.json') return 'json';
        if (ext === '.nowline') return 'nowline';
    }
    const trimmed = contents.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    return 'nowline';
}

function inferOutputFormat(
    inputFormat: IOFormat,
    formatFlag: string | undefined,
    outputPath: string | undefined,
): IOFormat {
    if (outputPath) {
        const ext = path.extname(outputPath).toLowerCase();
        if (ext === '.json') return 'json';
        if (ext === '.nowline') return 'nowline';
    }
    if (formatFlag) {
        const normalized = formatFlag.toLowerCase();
        if (normalized === 'json') return 'json';
        if (normalized === 'nowline') return 'nowline';
        throw new CliError(
            ExitCode.ValidationError,
            `Invalid --format: ${formatFlag}. Expected 'nowline' or 'json'.`,
        );
    }
    return inputFormat === 'nowline' ? 'json' : 'nowline';
}
