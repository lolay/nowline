import { type JsonAstNode, NOWLINE_SCHEMA_VERSION, type NowlineDocument } from './schema.js';

export interface ParseJsonResult {
    document: NowlineDocument;
    ast: JsonAstNode;
}

export function parseNowlineJson(text: string, filePath: string): ParseJsonResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error(
            `${filePath}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    const doc = parsed;
    if (!isRecord(doc)) {
        throw new Error(`${filePath}: JSON root must be an object with $nowlineSchema and ast.`);
    }
    const schema = doc.$nowlineSchema;
    if (typeof schema !== 'string') {
        throw new Error(`${filePath}: missing "$nowlineSchema" at document root.`);
    }
    if (schema !== NOWLINE_SCHEMA_VERSION) {
        throw new Error(
            `${filePath}: unsupported $nowlineSchema "${schema}" (this tool supports "${NOWLINE_SCHEMA_VERSION}").`,
        );
    }
    const ast = doc.ast;
    if (!isRecord(ast) || typeof ast.$type !== 'string') {
        throw new Error(`${filePath}: document.ast must be an object with a "$type" field.`);
    }
    if (ast.$type !== 'NowlineFile') {
        throw new Error(
            `${filePath}: document.ast.$type must be "NowlineFile" (got "${String(ast.$type)}").`,
        );
    }
    return { document: doc as unknown as NowlineDocument, ast: ast as unknown as JsonAstNode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
