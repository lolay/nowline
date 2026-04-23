import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { defineCommand } from 'citty';
import { readInput } from '../io/read.js';
import { writeOutput } from '../io/write.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { parseSource, getServices } from '../core/parse.js';
import { resolveIncludes } from '@nowline/core';
import { layoutRoadmap, type ThemeName } from '@nowline/layout';
import { renderSvg, type AssetResolver } from '@nowline/renderer';
import { formatDiagnostics, type DiagnosticSource } from '../diagnostics/index.js';

export const renderCommand = defineCommand({
    meta: {
        name: 'render',
        description: 'Render a .nowline file to SVG',
    },
    args: {
        input: {
            type: 'positional',
            description: 'Path to .nowline file, or "-" for stdin',
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
            description: 'Output format (svg — other formats ship in m2c)',
            default: 'svg',
        },
        theme: {
            type: 'string',
            description: 'Color theme: light or dark',
            default: 'light',
        },
        today: {
            type: 'string',
            description: 'Override today for the now-line (YYYY-MM-DD)',
        },
        'asset-root': {
            type: 'string',
            description: 'Directory from which logo/image assets may be loaded',
        },
        'no-links': {
            type: 'boolean',
            description: 'Strip link icons from rendered items',
            default: false,
        },
        strict: {
            type: 'boolean',
            description: 'Promote asset warnings to errors',
            default: false,
        },
        width: {
            type: 'string',
            description: 'Canvas width in px (default: 1280)',
        },
        force: {
            type: 'boolean',
            description: 'Overwrite output file if it exists',
            default: false,
        },
    },
    async run({ args }) {
        const format = String(args.format ?? 'svg').toLowerCase();
        if (format !== 'svg') {
            throw new CliError(
                ExitCode.InputError,
                `Format "${format}" is not supported in this release. PNG/PDF ship in m2c. Use --format svg.`,
            );
        }

        const themeArg = String(args.theme ?? 'light').toLowerCase();
        if (themeArg !== 'light' && themeArg !== 'dark') {
            throw new CliError(
                ExitCode.InputError,
                `Invalid --theme: ${themeArg}. Expected 'light' or 'dark'.`,
            );
        }
        const theme: ThemeName = themeArg;

        const today = parseTodayArg(args.today as string | undefined);
        const width = args.width ? parseInt(String(args.width), 10) : undefined;
        if (args.width && (!width || width < 320)) {
            throw new CliError(
                ExitCode.InputError,
                `Invalid --width: ${String(args.width)}. Must be an integer ≥ 320.`,
            );
        }

        const input = await readInput(args.input);
        const parse = await parseSource(input.contents, input.displayPath, { validate: true });
        if (parse.hasErrors) {
            emitDiagnostics(parse.diagnostics, parse.source, input.displayPath);
            throw new CliError(ExitCode.ValidationError, '');
        }

        const filePath = input.isStdin ? path.resolve(process.cwd(), 'stdin.nowline') : input.path;
        const resolved = await resolveIncludes(parse.ast, filePath, {
            services: getServices().Nowline,
        });
        for (const diag of resolved.diagnostics) {
            if (diag.severity === 'error') {
                process.stderr.write(`${diag.sourcePath}: ${diag.message}\n`);
            }
        }
        if (resolved.diagnostics.some((d) => d.severity === 'error')) {
            throw new CliError(ExitCode.ValidationError, '');
        }

        const model = layoutRoadmap(parse.ast, resolved, { theme, today, width });

        const assetRoot = args['asset-root']
            ? path.resolve(String(args['asset-root']))
            : path.dirname(filePath);
        const resolver: AssetResolver = createAssetResolver(assetRoot);

        const warnings: string[] = [];
        const svg = await renderSvg(model, {
            assetResolver: resolver,
            noLinks: Boolean(args['no-links']),
            strict: Boolean(args.strict),
            warn: (msg) => warnings.push(msg),
        });

        for (const w of warnings) {
            process.stderr.write(`warning: ${w}\n`);
        }

        await writeOutput(
            typeof args.output === 'string' ? args.output : undefined,
            svg,
            'text',
            { force: Boolean(args.force) },
        );
    },
});

function parseTodayArg(raw: string | undefined): Date | undefined {
    if (!raw) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) {
        throw new CliError(ExitCode.InputError, `Invalid --today: ${raw}. Expected YYYY-MM-DD.`);
    }
    return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
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

export function createAssetResolver(assetRoot: string): AssetResolver {
    const root = path.resolve(assetRoot);
    return async (ref: string) => {
        const absPath = path.resolve(root, ref);
        if (!absPath.startsWith(root + path.sep) && absPath !== root) {
            throw new Error(`Asset ${ref} escapes asset-root ${assetRoot}`);
        }
        const bytes = await fs.readFile(absPath);
        const mime = guessMime(absPath);
        return { bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), mime };
    };
}

function guessMime(p: string): string {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}
