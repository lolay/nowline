import {
    chmodSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    renameSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import {
    applyEdits,
    type Edit,
    type FormattingOptions,
    modify,
    type ParseError,
    parse,
    printParseErrorCode,
} from 'jsonc-parser';
import type { JsonTarget } from './clients.js';
import type { ServerEntry } from './server-command.js';

export type JsonChange = 'created' | 'added' | 'updated' | 'unchanged' | 'removed' | 'absent';

export interface JsonEdit {
    change: JsonChange;
    /** The new file content; undefined when nothing changes. */
    text?: string;
    keyPath: string[];
    value?: unknown;
}

export class JsonConfigError extends Error {}

/**
 * Inserts or replaces the server entry in a JSON / JSONC document, editing
 * the text rather than re-serializing it, so comments, key order, and the
 * file's own indentation survive. `existing` undefined means the file is
 * missing.
 */
export function upsertEntry(
    existing: string | undefined,
    target: JsonTarget,
    entry: ServerEntry,
): JsonEdit {
    const isNew = existing === undefined || existing.trim() === '';
    const text = isNew ? `${JSON.stringify(target.seed ?? {}, null, 2)}\n` : existing;
    const doc = parseDocument(text, target.path);
    const { keyPath, value } = target.place(entry, doc);
    const current = valueAt(doc, keyPath);
    if (!isNew && deepEqual(current, value)) return { change: 'unchanged', keyPath, value };
    return {
        change: isNew ? 'created' : current === undefined ? 'added' : 'updated',
        text: applyEdits(text, insertionEdits(text, keyPath, value)),
        keyPath,
        value,
    };
}

/** Removes the server entry, leaving every other key and comment in place. */
export function removeEntry(
    existing: string | undefined,
    target: JsonTarget,
    entry: ServerEntry,
): JsonEdit {
    if (existing === undefined || existing.trim() === '') {
        return { change: 'absent', keyPath: [] };
    }
    const doc = parseDocument(existing, target.path);
    const { keyPath } = target.place(entry, doc);
    if (valueAt(doc, keyPath) === undefined) return { change: 'absent', keyPath };
    // Unformatted: a pure deletion, so neighbouring entries keep their layout.
    const edits = modify(existing, keyPath, undefined, {});
    return { change: 'removed', text: applyEdits(existing, edits), keyPath };
}

export function readConfigFile(filePath: string): string | undefined {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw err;
    }
}

/**
 * Atomic write (temp file + rename) so a crash never leaves a harness with a
 * half-written config. Writes through a symlink (dotfile managers) and keeps
 * the existing file mode.
 */
export function writeConfigFile(filePath: string, text: string): void {
    let destination = filePath;
    let mode: number | undefined;
    try {
        destination = realpathSync(filePath);
        mode = statSync(destination).mode & 0o777;
    } catch {
        mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const temp = `${destination}.nowline-${process.pid}.tmp`;
    writeFileSync(temp, text, 'utf-8');
    if (mode !== undefined) chmodSync(temp, mode);
    renameSync(temp, destination);
}

/**
 * jsonc-parser's formatter re-flows the whole line it edits, and appending a
 * key to a non-empty object edits the previous sibling's line, so a user's
 * compact `"other": { "command": "x" }` would come back expanded. For that
 * case, take the unformatted edit and indent the new property ourselves.
 * Every other case (replacing our own entry, creating a missing parent)
 * only touches lines we own, so the library's formatting is fine.
 */
function insertionEdits(text: string, keyPath: string[], value: unknown): Edit[] {
    const formatting = detectFormatting(text);
    const raw = modify(text, keyPath, value, {});
    const edit = raw[0];
    if (raw.length !== 1 || edit.length !== 0 || !edit.content.startsWith(',')) {
        return modify(text, keyPath, value, { formattingOptions: formatting });
    }
    const unit = formatting.insertSpaces ? ' '.repeat(formatting.tabSize ?? 2) : '\t';
    const lineStart = text.lastIndexOf('\n', edit.offset - 1) + 1;
    const lineIndent = /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '';
    const property = JSON.stringify(JSON.parse(`{${edit.content.slice(1)}}`), null, unit)
        .split('\n')
        .slice(1, -1)
        .map((line) => lineIndent + line.slice(unit.length));
    const eol = formatting.eol ?? '\n';
    return [{ ...edit, content: `,${eol}${property.join(eol)}` }];
}

function parseDocument(text: string, filePath: string): unknown {
    const errors: ParseError[] = [];
    const doc = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
    if (errors.length > 0) {
        const first = errors[0];
        throw new JsonConfigError(
            `cannot parse ${filePath}: ${printParseErrorCode(first.error)} at offset ${first.offset}; fix or move the file and re-run.`,
        );
    }
    if (!isRecord(doc)) {
        throw new JsonConfigError(`cannot update ${filePath}: the top level is not a JSON object.`);
    }
    return doc;
}

function valueAt(doc: unknown, keyPath: readonly string[]): unknown {
    let node: unknown = doc;
    for (const key of keyPath) {
        if (!isRecord(node)) return undefined;
        node = node[key];
    }
    return node;
}

function detectFormatting(text: string): FormattingOptions {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const indent = /^([ \t]+)\S/m.exec(text)?.[1];
    if (indent?.startsWith('\t')) return { insertSpaces: false, tabSize: 1, eol };
    return { insertSpaces: true, tabSize: indent?.length ?? 2, eol };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
    }
    if (isRecord(a) && isRecord(b)) {
        const keys = Object.keys(a);
        return (
            keys.length === Object.keys(b).length && keys.every((key) => deepEqual(a[key], b[key]))
        );
    }
    return false;
}
