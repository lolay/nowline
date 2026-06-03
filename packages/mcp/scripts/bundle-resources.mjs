#!/usr/bin/env node
// Bundle the nowline://reference (man page) and nowline://examples resources
// into src/generated/resources.ts so they are available at runtime without
// any additional file I/O.  Runs as the prebuild step.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const outDir = path.join(packageRoot, 'src', 'generated');

mkdirSync(outDir, { recursive: true });

// ---- nowline://reference — DSL man page ------------------------------------

const manPage = readFileSync(path.join(repoRoot, 'packages', 'cli', 'man', 'nowline.5'), 'utf-8');

// ---- nowline://examples — canonical example roadmaps -----------------------

const examplesDir = path.join(repoRoot, 'examples');
const exampleFiles = readdirSync(examplesDir)
    .filter((f) => f.endsWith('.nowline'))
    .sort();

/** @type {Array<{name: string, content: string}>} */
const examples = exampleFiles.map((f) => ({
    name: f,
    content: readFileSync(path.join(examplesDir, f), 'utf-8'),
}));

// ---- Emit ------------------------------------------------------------------

const lines = [
    '// GENERATED — do not edit. Re-run `pnpm --filter @nowline/mcp build` to regenerate.',
    '//',
    '// Source: packages/cli/man/nowline.5 (reference) + examples/*.nowline (examples).',
    '',
    '/** Full text of the nowline.5 DSL man page. Serves as the `nowline://reference` resource. */',
    `export const REFERENCE_MAN_PAGE: string = ${JSON.stringify(manPage)};`,
    '',
    'export interface ExampleFile {',
    '    name: string;',
    '    content: string;',
    '}',
    '',
    '/** Canonical example .nowline files bundled as the `nowline://examples` resource. */',
    `export const EXAMPLES: ExampleFile[] = ${JSON.stringify(examples, null, 4)};`,
];

const outPath = path.join(outDir, 'resources.ts');
writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(`bundled ${examples.length} examples + man page → src/generated/resources.ts`);
