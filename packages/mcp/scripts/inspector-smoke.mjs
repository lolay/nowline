#!/usr/bin/env node
// Deterministic cross-process MCP smoke via MCP Inspector CLI.
// Exercises real stdio framing against packages/mcp/dist/index.js.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInspectorCli, toolCallContent } from './inspector-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, '../dist/index.js');

const MINIMAL = [
    'nowline v1',
    '',
    'roadmap smoke-test "Smoke Test" start:2025-01-06 scale:1w',
    '',
    'swimlane test-lane "Test Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

const EXPECTED_TOOLS = [
    'capabilities',
    'convert',
    'create',
    'delete',
    'examples',
    'export',
    'list',
    'list-formats',
    'list-icons',
    'list-locales',
    'list-templates',
    'list-themes',
    'read',
    'reference',
    'render',
    'schema',
    'update',
    'validate',
].sort();

function main() {
    const listOut = runInspectorCli({ serverEntry, method: 'tools/list' });
    const tools = (listOut?.result?.tools ?? listOut?.tools ?? []).map((t) => t.name).sort();
    if (JSON.stringify(tools) !== JSON.stringify(EXPECTED_TOOLS)) {
        throw new Error(
            `tools/list mismatch.\nexpected: ${EXPECTED_TOOLS.join(', ')}\ngot: ${tools.join(', ')}`,
        );
    }

    const validateOut = runInspectorCli({
        serverEntry,
        method: 'tools/call',
        toolName: 'validate',
        toolArgs: { source: MINIMAL },
    });
    const validateResult = toolCallContent(validateOut);
    const validateText = validateResult.content?.find((c) => c.type === 'text')?.text;
    const validateJson = validateText ? JSON.parse(validateText) : validateResult.structuredContent;
    if (!validateJson?.ok) {
        throw new Error(`validate expected ok=true: ${JSON.stringify(validateJson)}`);
    }

    const renderOut = runInspectorCli({
        serverEntry,
        method: 'tools/call',
        toolName: 'render',
        toolArgs: {
            source: MINIMAL,
            format: 'svg',
            now: '2025-01-15',
        },
    });
    const renderResult = toolCallContent(renderOut);
    const svgBlock = renderResult.content?.find(
        (c) => c.type === 'text' && c.text?.trimStart().startsWith('<svg'),
    );
    if (!svgBlock) {
        throw new Error('render did not return inline SVG text block');
    }

    console.log('mcp inspector smoke ok — tools/list, validate, render(svg)');
}

main();
