#!/usr/bin/env node
// Smoke-verify the packed .mcpb staging tree END-TO-END through the bundled
// server. Spawns staging/dist/index.js as a real stdio MCP server and calls
// its `export` tool for PNG and PDF via MCP Inspector CLI, so the externalized
// packages are exercised exactly as Claude Desktop will run them:
//
//   - module graph loads (langium + vscode-jsonrpc resolve from staging/node_modules)
//   - PNG export -> @resvg/resvg-wasm index_bg.wasm read from staging/node_modules
//   - PDF export -> pdfkit AFM font-metric data read from staging/node_modules
//
// A pre-flight existence check on the externalized assets gives a clear error
// up front if `npm install` missed one, before the deeper export failure.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBinaryFromToolResult, runInspectorCli, toolCallContent } from './inspector-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const stagingDir = path.join(repoRoot, 'dist-mcpb', 'staging');
const bundlePath = path.join(stagingDir, 'dist', 'index.js');

const MINIMAL = [
    'nowline v1',
    '',
    'roadmap smoke-test "Smoke Test" start:2025-01-06 scale:1w',
    '',
    'swimlane test-lane "Test Lane"',
    '  item foo "Foo Item" duration:1w',
].join('\n');

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function assertExternalAssets() {
    const req = createRequire(bundlePath);

    const resvgEntry = req.resolve('@resvg/resvg-wasm');
    const wasmPath = path.join(path.dirname(resvgEntry), 'index_bg.wasm');
    if (!existsSync(wasmPath)) {
        throw new Error(`missing resvg wasm at ${wasmPath}`);
    }

    const pdfkitEntry = req.resolve('pdfkit');
    const afmPath = path.join(path.dirname(pdfkitEntry), 'data/Helvetica.afm');
    if (!existsSync(afmPath)) {
        throw new Error(`missing pdfkit AFM data at ${afmPath}`);
    }
}

async function main() {
    if (!existsSync(bundlePath)) {
        throw new Error(`bundled entry missing: ${bundlePath}`);
    }

    assertExternalAssets();

    const tmpDir = mkdtempSync(path.join(tmpdir(), 'nowline-mcpb-verify-'));

    try {
        const pngOut = runInspectorCli({
            serverEntry: bundlePath,
            cwd: tmpDir,
            method: 'tools/call',
            toolName: 'export',
            toolArgs: {
                source: MINIMAL,
                format: 'png',
                now: '2025-01-15',
            },
        });
        const png = decodeBinaryFromToolResult(toolCallContent(pngOut));
        if (png.byteLength < 100) {
            throw new Error(`PNG export too small (${png.byteLength} bytes)`);
        }
        if (!PNG_MAGIC.every((b, i) => png[i] === b)) {
            throw new Error('PNG export missing magic header');
        }

        const pdfOut = runInspectorCli({
            serverEntry: bundlePath,
            cwd: tmpDir,
            method: 'tools/call',
            toolName: 'export',
            toolArgs: {
                source: MINIMAL,
                format: 'pdf',
                now: '2025-01-15',
            },
        });
        const pdf = decodeBinaryFromToolResult(toolCallContent(pdfOut));
        if (pdf.byteLength < 100) {
            throw new Error(`PDF export too small (${pdf.byteLength} bytes)`);
        }
        if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
            throw new Error('PDF export missing %PDF- header');
        }

        console.log(
            `mcpb staging verify ok — bundled server exported png ${png.byteLength} B, pdf ${pdf.byteLength} B`,
        );
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error('mcpb staging verify failed:', err);
    process.exit(1);
});
