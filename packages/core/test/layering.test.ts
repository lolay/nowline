// Import layering inside `@nowline/core` (specs/core-ast-utilities.md §3.2).
//
// - Only `language/nowline-module.ts` and `src/index.ts` import the validator
//   (`language/nowline-validator.ts`, and any module under `language/validator/`
//   once the validator is split; those may import each other).
// - The leaf modules import only the generated AST, Langium types and each
//   other, so anything (the include resolver, layout, the LSP) can use them.
// - `src/internal.ts` does not import the validator, and nothing the include
//   resolver loads at run time reaches it.
//
// Imports are read from the source text: every `import … from`, `export … from`,
// side-effect `import '…'` and dynamic `import('…')`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** Source-relative POSIX path, e.g. `language/ast-walk.ts`. */
type SourcePath = string;

interface ImportEdge {
    /** The specifier as written. */
    specifier: string;
    /** The imported source file, or undefined for a package import. */
    target: SourcePath | undefined;
    /** `import type` / `export type`: erased at compile time. */
    typeOnly: boolean;
}

const VALIDATOR = 'language/nowline-validator.ts';
const VALIDATOR_DIR = 'language/validator/';
const VALIDATOR_IMPORTERS = new Set<SourcePath>(['language/nowline-module.ts', 'index.ts']);
const LEAF_MODULES = [
    'language/ast-walk.ts',
    'language/style-chain.ts',
    'language/calendar-declarations.ts',
    'language/value-tables.ts',
    'util/props.ts',
];
const GENERATED_AST = 'generated/ast.ts';

function sourceFiles(dir: string): SourcePath[] {
    const out: SourcePath[] = [];
    for (const name of readdirSync(dir).sort()) {
        const abs = path.join(dir, name);
        const rel = path.relative(SRC, abs).split(path.sep).join('/');
        if (statSync(abs).isDirectory()) {
            if (rel !== 'generated') out.push(...sourceFiles(abs));
        } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
            out.push(rel);
        }
    }
    return out;
}

const IMPORT_PATTERNS = [
    // import x from '…', import { … } from '…', export { … } from '…', export * from '…'
    /^\s*(import|export)\s+(type\s+)?[^'";]*?\bfrom\s+['"]([^'"]+)['"]/gm,
    // import '…'
    /^\s*import\s+()()['"]([^'"]+)['"]/gm,
    // import('…')
    /\bimport\(\s*()()['"]([^'"]+)['"]\s*\)/g,
];

function importsOf(text: string, from: SourcePath): ImportEdge[] {
    const edges: ImportEdge[] = [];
    for (const pattern of IMPORT_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
            const specifier = match[3];
            edges.push({
                specifier,
                target: resolveSpecifier(specifier, from),
                typeOnly: match[2] !== undefined && match[2] !== '',
            });
        }
    }
    return edges;
}

function resolveSpecifier(specifier: string, from: SourcePath): SourcePath | undefined {
    if (!specifier.startsWith('.')) return undefined;
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    return joined.replace(/\.js$/, '.ts');
}

function isValidator(file: SourcePath | undefined): boolean {
    return file === VALIDATOR || (file?.startsWith(VALIDATOR_DIR) ?? false);
}

const files = sourceFiles(SRC);
const imports = new Map<SourcePath, ImportEdge[]>(
    files.map((f) => [f, importsOf(readFileSync(path.join(SRC, f), 'utf8'), f)]),
);

describe('core import layering', () => {
    it('reads every source file outside src/generated and sees the known validator imports', () => {
        expect(files).toContain(VALIDATOR);
        expect(files).toContain('internal.ts');
        expect(files.some((f) => f.startsWith('generated/'))).toBe(false);
        // The scanner finds the two imports that must exist, so the checks
        // below cannot pass because it found nothing.
        for (const importer of VALIDATOR_IMPORTERS) {
            expect(imports.get(importer)?.some((e) => e.target === VALIDATOR)).toBe(true);
        }
    });

    it('lets only nowline-module.ts and src/index.ts import the validator', () => {
        const offenders: string[] = [];
        for (const [file, edges] of imports) {
            if (VALIDATOR_IMPORTERS.has(file) || isValidator(file)) continue;
            for (const edge of edges) {
                if (isValidator(edge.target)) offenders.push(`${file} imports ${edge.specifier}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('keeps src/internal.ts off the validator', () => {
        const edges = imports.get('internal.ts') ?? [];
        expect(edges.filter((e) => isValidator(e.target))).toEqual([]);
    });

    it('keeps the include resolver from loading the validator at run time', () => {
        // Type-only imports are erased, so they cannot load a module.
        const loaded = new Set<SourcePath>();
        const pending: SourcePath[] = ['language/include-resolver.ts'];
        while (pending.length > 0) {
            const file = pending.pop() as SourcePath;
            if (loaded.has(file)) continue;
            loaded.add(file);
            for (const edge of imports.get(file) ?? []) {
                if (edge.target && !edge.typeOnly && imports.has(edge.target)) {
                    pending.push(edge.target);
                }
            }
        }
        expect(loaded.has('language/include-waves.ts')).toBe(true);
        expect([...loaded].filter(isValidator)).toEqual([]);
    });

    it('has ast-walk.ts among the leaf modules', () => {
        expect(existsSync(path.join(SRC, 'language/ast-walk.ts'))).toBe(true);
    });

    describe.each(LEAF_MODULES.filter((f) => existsSync(path.join(SRC, f))))('%s', (leaf) => {
        it('imports only the generated AST, Langium types and the other leaf modules', () => {
            const offenders: string[] = [];
            for (const edge of imports.get(leaf) ?? []) {
                const allowed =
                    edge.target === GENERATED_AST ||
                    (edge.target !== undefined && LEAF_MODULES.includes(edge.target)) ||
                    (edge.specifier === 'langium' && edge.typeOnly);
                if (!allowed) offenders.push(edge.specifier);
            }
            expect(offenders).toEqual([]);
        });
    });
});
