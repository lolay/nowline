import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    collectDocumentDiagnostics,
    extractSuggestion,
    isBuiltinParseDiagnostic,
    type LangiumLikeDiagnostic,
    resolveDiagnosticCode,
} from '../../src/diagnostics/index.js';
import type { NowlineFile } from '../../src/generated/ast.js';
import { getServices } from '../helpers.js';

let counter = 0;

async function build(input: string) {
    const { shared } = getServices();
    const uri = URI.parse(`memory:///diag-${++counter}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(input, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    return doc;
}

// `duration:3-w` trips a lexer "unexpected character" on the stray `-`, a
// parser DEDENT error on the trailing `w`, and an invalid-duration validation.
const SYNTAX_PLUS_VALIDATION = `nowline v1

roadmap r "R" start:2026-01-05 length:8w
swimlane s "S" capacity:4
  item a "A" duration:3-w capacity:2
`;

describe('collectDocumentDiagnostics', () => {
    it('surfaces lexer/parser errors once and skips the copies Langium re-folds into doc.diagnostics', async () => {
        const doc = await build(SYNTAX_PLUS_VALIDATION);

        // Sanity: Langium did fold the lexer/parser errors into doc.diagnostics,
        // so the skip logic is actually exercised (otherwise the test is vacuous).
        const docDiagnostics = doc.diagnostics ?? [];
        const refolded = docDiagnostics.filter((d) =>
            isBuiltinParseDiagnostic((d as LangiumLikeDiagnostic).data),
        );
        expect(refolded.length).toBeGreaterThan(0);

        const raws = collectDocumentDiagnostics(doc);
        expect(raws.some((r) => r.origin === 'lexer')).toBe(true);
        expect(raws.some((r) => r.origin === 'parser')).toBe(true);
        expect(raws.some((r) => r.origin === 'validation')).toBe(true);

        // No validation-origin entry is one of Langium's re-folded built-ins.
        const validationRefolds = raws.filter(
            (r) => r.origin === 'validation' && isBuiltinParseDiagnostic(r.diagnostic.data),
        );
        expect(validationRefolds).toEqual([]);

        // The validation rows are exactly doc.diagnostics minus the re-folds.
        const validationCount = raws.filter((r) => r.origin === 'validation').length;
        expect(validationCount).toBe(docDiagnostics.length - refolded.length);
    });

    it('returns no diagnostics for a clean document', async () => {
        const doc = await build(`nowline v1

roadmap r "R" start:2026-01-05 length:8w
swimlane s "S"
  item a "A" duration:2w
`);
        expect(collectDocumentDiagnostics(doc)).toEqual([]);
    });
});

describe('resolveDiagnosticCode', () => {
    it('prefers the stable validator code carried in data', () => {
        const diag: LangiumLikeDiagnostic = {
            message: 'Item "a" requires a duration',
            data: { code: 'NL.E0600', args: [] },
        };
        expect(resolveDiagnosticCode(diag)).toBe('NL.E0600');
    });

    it('falls back to Langium top-level code when data has no stable code', () => {
        expect(resolveDiagnosticCode({ message: 'whatever', code: 'NL.E0001' })).toBe('NL.E0001');
    });

    it('ignores a data.code without an args array (e.g. Langium built-ins) and infers from message', () => {
        const diag: LangiumLikeDiagnostic = {
            message: 'Invalid duration "3"',
            data: { code: 'lexing-error' },
        };
        expect(resolveDiagnosticCode(diag)).toBe('duration');
    });

    it('infers a code from the message when nothing else is available', () => {
        expect(resolveDiagnosticCode({ message: 'duplicate identifier "x"' })).toBe(
            'duplicate-identifier',
        );
    });
});

describe('isBuiltinParseDiagnostic', () => {
    it('matches Langium lexer/parser folds only', () => {
        expect(isBuiltinParseDiagnostic({ code: 'lexing-error' })).toBe(true);
        expect(isBuiltinParseDiagnostic({ code: 'parsing-error' })).toBe(true);
        expect(isBuiltinParseDiagnostic({ code: 'NL.E0600', args: [] })).toBe(false);
        expect(isBuiltinParseDiagnostic(undefined)).toBe(false);
        expect(isBuiltinParseDiagnostic({})).toBe(false);
    });
});

describe('extractSuggestion', () => {
    it('pulls the target out of a "did you mean" message', () => {
        expect(extractSuggestion('Unknown reference "bulid". Did you mean "build"?')).toBe('build');
    });

    it('returns undefined when there is no suggestion', () => {
        expect(extractSuggestion('Something went wrong')).toBeUndefined();
    });
});
