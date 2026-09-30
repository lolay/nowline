#!/usr/bin/env node
// Deterministic cross-process MCP smoke via MCP Inspector CLI.
// Exercises real stdio framing against packages/mcp/dist/index.js.
//
// Inspector 2.x advertises the MCP Apps UI capability, so a plain `render`
// takes the apps-host path and returns the lean nowline.preview payload
// instead of inline SVG. Both branches are covered below: the default call
// must hand back the preview payload, and `preview: false` must force SVG.

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import expectedToolsJson from './expected-tools.json' with { type: 'json' };
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

const EXPECTED_TOOLS = [...expectedToolsJson].sort();

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

    // Apps-host path: the host-negotiated default returns the preview payload.
    const previewOut = runInspectorCli({
        serverEntry,
        method: 'tools/call',
        toolName: 'render',
        toolArgs: {
            source: MINIMAL,
            format: 'svg',
            now: '2025-01-15',
        },
    });
    const previewResult = toolCallContent(previewOut);
    const previewBlock = previewResult.content?.find(
        (c) => c.type === 'text' && c.text?.trimStart().startsWith('{'),
    );
    const preview = previewBlock ? JSON.parse(previewBlock.text) : undefined;
    if (preview?.kind !== 'nowline.preview' || preview.source !== MINIMAL) {
        throw new Error(
            `render on an apps host did not return the nowline.preview payload: ${JSON.stringify(previewResult.content).slice(0, 500)}`,
        );
    }

    // Explicit opt-out: inline SVG even though the client advertises apps UI.
    const renderOut = runInspectorCli({
        serverEntry,
        method: 'tools/call',
        toolName: 'render',
        toolArgs: {
            source: MINIMAL,
            format: 'svg',
            now: '2025-01-15',
            preview: false,
        },
    });
    const renderResult = toolCallContent(renderOut);
    const svgBlock = renderResult.content?.find(
        (c) => c.type === 'text' && c.text?.trimStart().startsWith('<svg'),
    );
    if (!svgBlock) {
        throw new Error('render with preview=false did not return inline SVG text block');
    }

    console.log(
        'mcp inspector smoke ok — tools/list, validate, render(preview payload), render(svg)',
    );
}

main();
