import type { NowlineFile } from '@nowline/core';
import type { AstNode, CstNode, LangiumDocument } from 'langium';

export const NOWLINE_SCHEMA_VERSION = '1';

export interface NowlineDocument {
    $nowlineSchema: string;
    file: { uri: string; source: string };
    ast: JsonAstNode;
}

export interface Position {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
}

export interface JsonAstNode {
    $type: string;
    $position?: Position;
    [key: string]: unknown;
}

export interface SerializeOptions {
    includePositions?: boolean;
}

// Keys that Langium adds to AST nodes that we don't want in the JSON form.
const CONTAINER_KEYS = new Set(['$container', '$containerProperty', '$containerIndex']);
// $cstNode / $document are runtime-only. $type and $position are emitted.
const RUNTIME_KEYS = new Set(['$cstNode', '$document']);

export function serializeToJson(
    document: LangiumDocument<NowlineFile>,
    source: string,
    options: SerializeOptions = {},
): NowlineDocument {
    const includePositions = options.includePositions ?? true;
    return {
        $nowlineSchema: NOWLINE_SCHEMA_VERSION,
        file: {
            uri: document.uri.toString(),
            source,
        },
        ast: serializeNode(document.parseResult.value, includePositions),
    };
}

function serializeNode(node: AstNode, includePositions: boolean): JsonAstNode {
    const out: JsonAstNode = { $type: node.$type };
    if (includePositions) {
        const pos = cstPosition(node.$cstNode);
        if (pos) out.$position = pos;
    }
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('$')) continue;
        if (CONTAINER_KEYS.has(key) || RUNTIME_KEYS.has(key)) continue;
        out[key] = serializeValue(value, includePositions);
    }
    return out;
}

function serializeValue(value: unknown, includePositions: boolean): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
        return value.map((v) => serializeValue(v, includePositions));
    }
    if (isAstNode(value)) {
        return serializeNode(value, includePositions);
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(record)) {
            if (k.startsWith('$')) continue;
            if (CONTAINER_KEYS.has(k) || RUNTIME_KEYS.has(k)) continue;
            out[k] = serializeValue(v, includePositions);
        }
        return out;
    }
    return value;
}

function isAstNode(value: unknown): value is AstNode {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as { $type?: unknown }).$type === 'string'
    );
}

function cstPosition(cst: CstNode | undefined): Position | undefined {
    if (!cst) return undefined;
    return {
        start: {
            line: cst.range.start.line + 1,
            column: cst.range.start.character + 1,
            offset: cst.offset,
        },
        end: {
            line: cst.range.end.line + 1,
            column: cst.range.end.character + 1,
            offset: cst.end,
        },
    };
}
