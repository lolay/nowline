import { NOWLINE_SCHEMA_VERSION, type JsonAstNode, type NowlineDocument } from './schema.js';
import { CliError, ExitCode } from '../io/exit-codes.js';

export interface ParseJsonResult {
    document: NowlineDocument;
    ast: JsonAstNode;
}

export function parseNowlineJson(text: string, filePath: string): ParseJsonResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new CliError(
            ExitCode.ValidationError,
            `${filePath}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    const doc = parsed;
    if (!isRecord(doc)) {
        throw new CliError(
            ExitCode.ValidationError,
            `${filePath}: JSON root must be an object with $nowlineSchema and ast.`,
        );
    }
    const schema = doc.$nowlineSchema;
    if (typeof schema !== 'string') {
        throw new CliError(
            ExitCode.ValidationError,
            `${filePath}: missing "$nowlineSchema" at document root.`,
        );
    }
    if (schema !== NOWLINE_SCHEMA_VERSION) {
        throw new CliError(
            ExitCode.ValidationError,
            `${filePath}: unsupported $nowlineSchema "${schema}" (this CLI supports "${NOWLINE_SCHEMA_VERSION}").`,
        );
    }
    const ast = doc.ast;
    if (!isRecord(ast) || typeof ast.$type !== 'string') {
        throw new CliError(
            ExitCode.ValidationError,
            `${filePath}: document.ast must be an object with a "$type" field.`,
        );
    }
    if (ast.$type !== 'NowlineFile') {
        throw new CliError(
            ExitCode.ValidationError,
            `${filePath}: document.ast.$type must be "NowlineFile" (got "${String(ast.$type)}").`,
        );
    }
    return { document: doc as unknown as NowlineDocument, ast: ast as unknown as JsonAstNode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
