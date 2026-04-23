import type { JsonAstNode } from './schema.js';
import { CliError, ExitCode } from '../io/exit-codes.js';

// Keyed-property canonical order. Keys not in this list sort alphabetically after.
const KEY_ORDER = [
    'date',
    'length',
    'on',
    'duration',
    'status',
    'owner',
    'after',
    'before',
    'remaining',
    'labels',
    'style',
    'link',
    'author',
    'start',
    'scale',
    'calendar',
    'header-position',
];

const INDENT = '  ';

export interface PrintOptions {
    indent?: string;
}

export function printNowlineFile(ast: JsonAstNode, options: PrintOptions = {}): string {
    const printer = new Printer(options.indent ?? INDENT);
    printer.file(ast);
    return printer.toString();
}

class Printer {
    private readonly lines: string[] = [];

    constructor(private readonly indent: string) {}

    toString(): string {
        const text = this.lines.join('\n');
        return text.endsWith('\n') ? text : `${text}\n`;
    }

    file(file: JsonAstNode): void {
        assertType(file, 'NowlineFile');
        const directive = file.directive as JsonAstNode | undefined;
        if (directive) {
            this.line(0, `nowline ${getString(directive, 'version')}`);
            this.blank();
        }
        for (const inc of asArray(file.includes)) {
            this.include(inc);
        }
        if (asArray(file.includes).length > 0) this.blank();
        if (file.hasConfig) {
            this.line(0, 'config');
            this.blank();
            for (const entry of asArray(file.configEntries)) {
                this.configEntry(entry);
                this.blank();
            }
        }
        if (file.roadmapDecl) {
            this.roadmap(file.roadmapDecl as JsonAstNode);
            this.blank();
        }
        for (const entry of asArray(file.roadmapEntries)) {
            this.roadmapEntry(entry, 0);
        }
    }

    include(inc: JsonAstNode): void {
        assertType(inc, 'IncludeDeclaration');
        const path = getString(inc, 'path');
        const options = asArray(inc.options)
            .map((o) => `${getString(o, 'key')}:${getString(o, 'value')}`)
            .join(' ');
        const tail = options ? ` ${options}` : '';
        this.line(0, `include ${JSON.stringify(path)}${tail}`);
    }

    configEntry(entry: JsonAstNode): void {
        switch (entry.$type) {
            case 'ScaleBlock':
                return this.blockDecl('scale', asArray(entry.properties));
            case 'CalendarBlock':
                return this.blockDecl('calendar', asArray(entry.properties));
            case 'StyleDeclaration':
                return this.styleDecl(entry);
            case 'DefaultDeclaration':
                return this.defaultDecl(entry);
            default:
                throw new CliError(
                    ExitCode.ValidationError,
                    `Unknown config entry type: ${String(entry.$type)}`,
                );
        }
    }

    blockDecl(keyword: string, properties: JsonAstNode[]): void {
        this.line(0, keyword);
        for (const p of properties) {
            this.line(1, renderBlockProperty(p));
        }
    }

    styleDecl(entry: JsonAstNode): void {
        assertType(entry, 'StyleDeclaration');
        const header = declarationHeader('style', entry, []);
        this.line(0, header);
        for (const p of asArray(entry.properties)) {
            this.line(1, renderBlockProperty(p));
        }
    }

    defaultDecl(entry: JsonAstNode): void {
        assertType(entry, 'DefaultDeclaration');
        const entityType = getString(entry, 'entityType');
        const props = renderProperties(asArray(entry.properties));
        const tail = props ? ` ${props}` : '';
        this.line(0, `default ${entityType}${tail}`);
    }

    roadmap(decl: JsonAstNode): void {
        assertType(decl, 'RoadmapDeclaration');
        this.line(0, declarationHeader('roadmap', decl, asArray(decl.properties)));
    }

    roadmapEntry(entry: JsonAstNode, depth: number): void {
        switch (entry.$type) {
            case 'PersonDeclaration':
                return this.simpleEntity('person', entry, depth);
            case 'TeamDeclaration':
                return this.team(entry, depth);
            case 'AnchorDeclaration':
                return this.simpleEntity('anchor', entry, depth);
            case 'DurationDeclaration':
                return this.simpleEntity('duration', entry, depth);
            case 'StatusDeclaration':
                return this.simpleEntity('status', entry, depth);
            case 'LabelDeclaration':
                return this.simpleEntity('label', entry, depth);
            case 'MilestoneDeclaration':
                return this.simpleEntity('milestone', entry, depth);
            case 'FootnoteDeclaration':
                return this.simpleEntity('footnote', entry, depth);
            case 'SwimlaneDeclaration':
                return this.swimlane(entry, depth);
            default:
                throw new CliError(
                    ExitCode.ValidationError,
                    `Unknown roadmap entry type: ${String(entry.$type)}`,
                );
        }
    }

    simpleEntity(keyword: string, entry: JsonAstNode, depth: number): void {
        this.line(depth, declarationHeader(keyword, entry, asArray(entry.properties)));
        this.maybeDescription(entry, depth + 1);
    }

    team(entry: JsonAstNode, depth: number): void {
        this.line(depth, declarationHeader('team', entry, asArray(entry.properties)));
        for (const child of asArray(entry.content)) {
            this.teamContent(child, depth + 1);
        }
    }

    teamContent(node: JsonAstNode, depth: number): void {
        if (node.$type === 'PersonMemberRef') {
            this.line(depth, `person ${getString(node, 'ref')}`);
            return;
        }
        if (node.$type === 'TeamDeclaration') {
            return this.team(node, depth);
        }
        if (node.$type === 'PersonDeclaration') {
            return this.simpleEntity('person', node, depth);
        }
        if (node.$type === 'DescriptionDirective') {
            return this.descriptionDirective(node, depth);
        }
        throw new CliError(
            ExitCode.ValidationError,
            `Unknown team content type: ${String(node.$type)}`,
        );
    }

    swimlane(entry: JsonAstNode, depth: number): void {
        this.line(depth, declarationHeader('swimlane', entry, asArray(entry.properties)));
        for (const child of asArray(entry.content)) {
            this.swimlaneContent(child, depth + 1);
        }
    }

    swimlaneContent(node: JsonAstNode, depth: number): void {
        switch (node.$type) {
            case 'ItemDeclaration':
                this.simpleEntity('item', node, depth);
                return;
            case 'ParallelBlock':
                this.parallelBlock(node, depth);
                return;
            case 'GroupBlock':
                this.groupBlock(node, depth);
                return;
            case 'DescriptionDirective':
                this.descriptionDirective(node, depth);
                return;
            default:
                throw new CliError(
                    ExitCode.ValidationError,
                    `Unknown swimlane content type: ${String(node.$type)}`,
                );
        }
    }

    parallelBlock(entry: JsonAstNode, depth: number): void {
        this.line(depth, declarationHeader('parallel', entry, asArray(entry.properties)));
        for (const child of asArray(entry.content)) {
            this.swimlaneContent(child, depth + 1);
        }
    }

    groupBlock(entry: JsonAstNode, depth: number): void {
        this.line(depth, declarationHeader('group', entry, asArray(entry.properties)));
        for (const child of asArray(entry.content)) {
            this.swimlaneContent(child, depth + 1);
        }
    }

    descriptionDirective(node: JsonAstNode, depth: number): void {
        assertType(node, 'DescriptionDirective');
        this.line(depth, `description ${JSON.stringify(getString(node, 'text'))}`);
    }

    maybeDescription(entry: JsonAstNode, depth: number): void {
        const desc = entry.description as JsonAstNode | undefined;
        if (desc) this.descriptionDirective(desc, depth);
    }

    private line(depth: number, text: string): void {
        this.lines.push(this.indent.repeat(depth) + text);
    }

    private blank(): void {
        if (this.lines.length === 0) return;
        if (this.lines[this.lines.length - 1] === '') return;
        this.lines.push('');
    }
}

function declarationHeader(keyword: string, entry: JsonAstNode, properties: JsonAstNode[]): string {
    const id = entry.name as string | undefined;
    const title = entry.title as string | undefined;
    const parts = [keyword];
    if (id) parts.push(id);
    if (title) parts.push(JSON.stringify(title));
    const props = renderProperties(properties);
    if (props) parts.push(props);
    return parts.join(' ');
}

function renderProperties(properties: JsonAstNode[]): string {
    return orderProperties(properties)
        .map(renderProperty)
        .join(' ');
}

function orderProperties(properties: JsonAstNode[]): JsonAstNode[] {
    const indexOf = new Map(KEY_ORDER.map((k, i) => [k, i] as const));
    return [...properties].sort((a, b) => {
        const ak = normalizeKey(getString(a, 'key'));
        const bk = normalizeKey(getString(b, 'key'));
        const ai = indexOf.get(ak);
        const bi = indexOf.get(bk);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return ak.localeCompare(bk);
    });
}

function renderProperty(prop: JsonAstNode): string {
    const key = normalizeKey(getString(prop, 'key'));
    const values = asStringArray(prop.values);
    const value = prop.value as string | undefined;
    if (values.length >= 2) {
        return `${key}:[${values.map(formatAtom).join(', ')}]`;
    }
    if (values.length === 1) {
        return `${key}:${formatAtom(values[0])}`;
    }
    if (value !== undefined && value !== '') {
        return `${key}:${formatAtom(value)}`;
    }
    return `${key}:`;
}

// Block-style property (one per line, rendered as `key: value`). Used inside
// indented blocks like `scale`, `calendar`, and `style`. Uses formatAtom so
// that quoted / template strings such as `label: "W{n}"` survive a round-trip.
function renderBlockProperty(prop: JsonAstNode): string {
    const key = normalizeKey(getString(prop, 'key'));
    const values = asStringArray(prop.values);
    const value = prop.value as string | undefined;
    if (values.length >= 2) {
        return `${key}: [${values.map(formatAtom).join(', ')}]`;
    }
    if (values.length === 1) {
        return `${key}: ${formatAtom(values[0])}`;
    }
    if (value !== undefined && value !== '') {
        return `${key}: ${formatAtom(value)}`;
    }
    return `${key}:`;
}

function normalizeKey(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

const URL_RE = /^https?:\/\//;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_RE = /^\d+[dwmqy]$/;
const PERCENTAGE_RE = /^\d+%$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const INTEGER_RE = /^\d+$/;
const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function formatAtom(atom: string): string {
    if (
        URL_RE.test(atom) ||
        DATE_RE.test(atom) ||
        DURATION_RE.test(atom) ||
        PERCENTAGE_RE.test(atom) ||
        HEX_COLOR_RE.test(atom) ||
        INTEGER_RE.test(atom) ||
        ID_RE.test(atom)
    ) {
        return atom;
    }
    // Already-quoted string survives a round trip through JSON.stringify by re-quoting once.
    if (atom.startsWith('"') && atom.endsWith('"')) return atom;
    return JSON.stringify(atom);
}

function asArray(value: unknown): JsonAstNode[] {
    if (Array.isArray(value)) return value as JsonAstNode[];
    return [];
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
}

function getString(node: JsonAstNode | Record<string, unknown>, key: string): string {
    const value = (node as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
}

function assertType(node: JsonAstNode, expected: string): void {
    if (node.$type !== expected) {
        throw new CliError(
            ExitCode.ValidationError,
            `Expected $type "${expected}", got "${String(node.$type)}"`,
        );
    }
}
