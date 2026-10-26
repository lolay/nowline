import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import {
    collectDocumentDiagnostics,
    extractSuggestion,
    isBuiltinParseDiagnostic,
    type LangiumLikeDiagnostic,
    resolveDiagnosticCode,
    resolveDiagnosticSuggestion,
} from '../../src/diagnostics/index.js';
import type { NowlineFile } from '../../src/generated/ast.js';
import { tr } from '../../src/i18n/index.js';
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

describe('resolveDiagnosticSuggestion', () => {
    const unknown = {
        reason: 'unknown' as const,
        value: 'bild',
        declared: ['plan', 'build'],
        suggestion: { id: 'build', title: 'Build' },
    };

    // The E1101 template renders `wave:build ("Build")`; the suggestion is the
    // bare id, the token a client puts in place of `bild`.
    it('reads NL.E1101 from its args, not the rendered message', () => {
        for (const locale of ['en-US', 'fr']) {
            const message = tr(locale, 'NL.E1101', unknown);
            expect(message).toContain('wave:build');
            expect(
                resolveDiagnosticSuggestion(message, { code: 'NL.E1101', args: [unknown] }),
            ).toBe('build');
        }
    });

    it('reads an untitled NL.E1101 suggestion and the not-a-wave variant', () => {
        const untitled = { ...unknown, suggestion: { id: 'build' } };
        expect(
            resolveDiagnosticSuggestion(tr('en-US', 'NL.E1101', untitled), {
                code: 'NL.E1101',
                args: [untitled],
            }),
        ).toBe('build');
        const notAWave = {
            reason: 'not-a-wave' as const,
            value: 'alpha',
            kind: 'item' as const,
            suggestion: { id: 'alpha2', title: 'Alpha 2' },
        };
        expect(
            resolveDiagnosticSuggestion(tr('en-US', 'NL.E1101', notAWave), {
                code: 'NL.E1101',
                args: [notAWave],
            }),
        ).toBe('alpha2');
    });

    it('is undefined for an NL.E1101 with nothing to suggest', () => {
        const none = { reason: 'list' as const, value: '[a, b]' };
        expect(
            resolveDiagnosticSuggestion(tr('en-US', 'NL.E1101', none), {
                code: 'NL.E1101',
                args: [none],
            }),
        ).toBeUndefined();
    });

    it('reads NL.W0700 from its args in every locale', () => {
        const args = { key: 'statsu', entity: 'item "one"', suggested: 'status' };
        for (const locale of ['en-US', 'fr']) {
            const message = tr(locale, 'NL.W0700', args);
            expect(resolveDiagnosticSuggestion(message, { code: 'NL.W0700', args: [args] })).toBe(
                'status',
            );
        }
        const none = { ...args, suggested: '' };
        expect(
            resolveDiagnosticSuggestion(tr('en-US', 'NL.W0700', none), {
                code: 'NL.W0700',
                args: [none],
            }),
        ).toBeUndefined();
    });

    it('does not parse the message of a coded diagnostic', () => {
        expect(
            resolveDiagnosticSuggestion('Did you mean "x"?', { code: 'NL.E0600', args: [] }),
        ).toBeUndefined();
    });

    it('falls back to the message for an uncoded diagnostic', () => {
        expect(
            resolveDiagnosticSuggestion(
                'Unknown reference "bulid". Did you mean "build"?',
                undefined,
            ),
        ).toBe('build');
    });

    it('gives the wave id for a misspelled wave: in a built document', async () => {
        const doc = await build(`nowline v1

roadmap r "R" start:2026-01-05

wave plan "Plan"
wave build "Build"
swimlane a "A"
  item one "One" duration:1w wave:bild
`);
        const diag = (doc.diagnostics ?? []).find(
            (d) => resolveDiagnosticCode(d as LangiumLikeDiagnostic) === 'NL.E1101',
        );
        expect(diag).toBeDefined();
        expect(resolveDiagnosticSuggestion(diag!.message, diag!.data)).toBe('build');
    });
});
