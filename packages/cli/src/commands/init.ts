import { defineCommand } from 'citty';
import { writeOutput } from '../io/write.js';
import { CliError, ExitCode } from '../io/exit-codes.js';
import { TEMPLATES, TEMPLATE_NAMES, type TemplateName } from '../generated/templates.js';

export const initCommand = defineCommand({
    meta: {
        name: 'init',
        description: 'Scaffold a starter .nowline file',
    },
    args: {
        name: {
            type: 'string',
            description: 'Human-readable roadmap name (used in title and default filename)',
        },
        template: {
            type: 'string',
            description: `Template: ${TEMPLATE_NAMES.join(' | ')}`,
            default: 'minimal',
        },
        force: {
            type: 'boolean',
            description: 'Overwrite existing file',
            default: false,
        },
    },
    async run({ args }) {
        const template = parseTemplateName(args.template);
        const name = typeof args.name === 'string' && args.name.trim() !== ''
            ? args.name.trim()
            : undefined;
        const force = args.force === true;

        const templateText = TEMPLATES[template];
        const rendered = applyName(templateText, name);
        const outputPath = defaultOutputPath(name, template);
        await writeOutput(outputPath, rendered, 'text', { force });
    },
});

function parseTemplateName(raw: unknown): TemplateName {
    const value = typeof raw === 'string' ? raw.toLowerCase() : '';
    if ((TEMPLATE_NAMES as readonly string[]).includes(value)) {
        return value as TemplateName;
    }
    throw new CliError(
        ExitCode.ValidationError,
        `Unknown template "${String(raw)}". Choose one of: ${TEMPLATE_NAMES.join(', ')}.`,
    );
}

export function applyName(template: string, name: string | undefined): string {
    if (!name) return template;
    // Substitute the roadmap declaration title. We operate on the first `roadmap <id> ...`
    // line and rewrite its title (or insert one if absent).
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

export function defaultOutputPath(name: string | undefined, template: TemplateName): string {
    const base = slugify(name ?? template);
    return `${base}.nowline`;
}

export function slugify(input: string): string {
    const base = input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base === '' ? 'nowline' : base;
}
