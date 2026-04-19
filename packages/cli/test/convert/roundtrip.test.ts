import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseSource } from '../../src/core/parse.js';
import { serializeToJson } from '../../src/convert/schema.js';
import { parseNowlineJson } from '../../src/convert/parse-json.js';
import { printNowlineFile } from '../../src/convert/printer.js';
import { examplesDir } from '../helpers.js';

const EXAMPLES = ['minimal.nowline', 'teams.nowline', 'product.nowline'];

async function textToJsonString(text: string, file: string): Promise<string> {
    // Round-trip only depends on parser output, not semantic validation, so we
    // skip validation and assert only on lex/parse errors.
    const result = await parseSource(text, file, { validate: false });
    expect(
        result.hasParseErrors,
        `expected ${file} to parse cleanly; diagnostics:\n${JSON.stringify(result.diagnostics, null, 2)}`,
    ).toBe(false);
    return JSON.stringify(serializeToJson(result.document, text), null, 2);
}

async function textToText(text: string, file: string): Promise<string> {
    const result = await parseSource(text, file, { validate: false });
    expect(
        result.hasParseErrors,
        `expected ${file} to parse cleanly; diagnostics:\n${JSON.stringify(result.diagnostics, null, 2)}`,
    ).toBe(false);
    const doc = serializeToJson(result.document, text);
    return printNowlineFile(doc.ast);
}

describe('convert — round-trip idempotency', () => {
    for (const file of EXAMPLES) {
        it(`${file}: text -> json -> text is stable after first canonicalization`, async () => {
            const original = await fs.readFile(path.join(examplesDir, file), 'utf-8');
            const canonical = await textToText(original, file);
            const canonicalJson = JSON.parse(await textToJsonString(canonical, file));
            const roundTripped = printNowlineFile(canonicalJson.ast);
            expect(roundTripped).toBe(canonical);
        });

        it(`${file}: json -> text -> json is stable (after canonicalization)`, async () => {
            const original = await fs.readFile(path.join(examplesDir, file), 'utf-8');
            // The printer is canonical (reorders properties to a stable order and
            // canonicalizes list formatting), so the first JSON extracted from
            // free-form source is NOT expected to match a JSON round-tripped
            // through the printer. We first canonicalize text -> text -> JSON,
            // then verify that printing + re-parsing is idempotent on that
            // canonical JSON.
            const canonicalText = await textToText(original, file);
            const firstJson = JSON.parse(await textToJsonString(canonicalText, file));
            const parsed = parseNowlineJson(JSON.stringify(firstJson), file);
            expect(parsed.ast.$type).toBe('NowlineFile');
            const reprintedText = printNowlineFile(firstJson.ast);
            expect(reprintedText.length).toBeGreaterThan(0);
            const secondJson = JSON.parse(await textToJsonString(reprintedText, file));
            expect(stripPositions(secondJson.ast)).toEqual(stripPositions(firstJson.ast));
        });
    }
});

function stripPositions(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(stripPositions);
    if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (k === '$position') continue;
            out[k] = stripPositions(v);
        }
        return out;
    }
    return node;
}
