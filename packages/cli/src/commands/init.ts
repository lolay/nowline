import { writeOutput } from '../io/write.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { TEMPLATES, TEMPLATE_NAMES, type TemplateName } from '../generated/templates.js';
import {
    defaultInitOutputPath,
    initNameHasIncompatibleExtension,
} from '../cli/output-path.js';
import type { ParsedArgs } from '../cli/args.js';

export interface InitHandlerOptions {
    args: ParsedArgs;
    /** Test seam: cwd override. Defaults to `process.cwd()`. */
    cwd?: string;
}

/**
 * `--init` mode handler. Scaffolds a starter `.nowline` file in cwd.
 *
 * Positional argument is the project *name*, not a file path:
 *   - No extension      → append `.nowline`.
 *   - `.nowline`        → use literal.
 *   - Other extension   → exit 2.
 *   - Missing positional → default name "roadmap".
 *
 * `-o` overrides the resolved path. Existing files are silently overwritten.
 */
export async function initHandler(options: InitHandlerOptions): Promise<void> {
    const { args } = options;
    const cwd = options.cwd ?? process.cwd();
    const template = parseTemplateName(args.template);
    const positional = args.positional;

    if (positional !== undefined && positional !== '' && initNameHasIncompatibleExtension(positional)) {
        throw new CliError(
            ExitCode.InputError,
            `nowline: --init only scaffolds .nowline files; got "${positional}".`,
        );
    }

    const projectName = projectNameFor(positional);
    const titleName = titleFor(positional);
    const templateText = TEMPLATES[template];
    const rendered = applyName(templateText, titleName);

    const outputPath = args.output
        ?? defaultInitOutputPath({ name: projectName, cwd });

    await writeOutput(outputPath, rendered, 'text', { cwd });

    if (args.logLevel === 'verbose') {
        process.stderr.write(`nowline: wrote ${outputPath}\n`);
    }
}

function parseTemplateName(raw: string | undefined): TemplateName {
    const value = (raw ?? '').toLowerCase();
    if (value === '') return 'minimal';
    if ((TEMPLATE_NAMES as readonly string[]).includes(value)) {
        return value as TemplateName;
    }
    throw new CliError(
        ExitCode.InputError,
        `nowline: unknown --template "${raw}". Choose one of: ${TEMPLATE_NAMES.join(', ')}.`,
    );
}

function projectNameFor(positional: string | undefined): string | undefined {
    if (!positional) return undefined;
    return positional;
}

/**
 * Returns the title to substitute into the roadmap declaration. When the user
 * passes a positional we use it as-is; trailing `.nowline` is stripped so the
 * title isn't `My Plan.nowline`.
 */
function titleFor(positional: string | undefined): string | undefined {
    if (!positional) return undefined;
    return positional.endsWith('.nowline')
        ? positional.slice(0, -'.nowline'.length)
        : positional;
}

export function applyName(template: string, name: string | undefined): string {
    if (!name) return template;
    const lines = template.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^\s*roadmap\b/.test(line)) continue;
        lines[i] = rewriteRoadmapTitle(line, name);
        break;
    }
    return lines.join('\n');
}

function rewriteRoadmapTitle(line: string, name: string): string {
    const match = line.match(/^(\s*roadmap\s+[A-Za-z_][A-Za-z0-9_-]*)(\s+"[^"]*")?(.*)$/);
    if (!match) return line;
    const [, head, , tail] = match;
    return `${head} ${JSON.stringify(name)}${tail}`;
}
