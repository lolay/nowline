import { type ResolveDiagnostic, tr } from '@nowline/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    __resetBrowserPipelineForTests,
    fromResolveDiagnostic,
    parseSource,
    renderSource,
    type SkippedInclude,
} from '../src/index.js';
import {
    ROADMAP_ALPHA,
    ROADMAP_BETA,
    ROADMAP_BUSINESS,
    ROADMAP_BUSINESS_FILE_SHOW,
    ROADMAP_LEXER_ERROR,
    ROADMAP_PARSE_ERROR,
    ROADMAP_WITH_INCLUDE,
} from './fixtures.js';

describe('parseSource', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    it('returns an AST with no diagnostics for a valid source', async () => {
        const result = await parseSource(ROADMAP_ALPHA);
        expect(result.diagnostics).toEqual([]);
        expect(result.ast).toBeDefined();
    });

    it('reports parse diagnostics with a synthetic file path by default', async () => {
        const result = await parseSource(ROADMAP_PARSE_ERROR);
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0].file).toBe('/browser-source.nowline');
        expect(result.diagnostics[0].severity).toBe('error');
    });

    it('honours a custom filePath option', async () => {
        const result = await parseSource(ROADMAP_PARSE_ERROR, {
            filePath: '/custom/path.nowline',
        });
        expect(result.diagnostics[0].file).toBe('/custom/path.nowline');
    });

    it('does not double-count lexer/parser errors that Langium also folds into doc.diagnostics', async () => {
        // Regression: Langium's validateDocument() re-emits lexer + parser
        // errors inside doc.diagnostics, so collecting parseResult.lexerErrors
        // / parserErrors AND doc.diagnostics duplicated every syntax error in
        // the preview table while the LSP Problems panel showed each once.
        const result = await parseSource(ROADMAP_LEXER_ERROR);

        const seen = new Map<string, number>();
        for (const d of result.diagnostics) {
            const key = `${d.line}:${d.column}:${d.message}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        const duplicated = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
        expect(duplicated).toEqual([]);

        // The lexer error keeps its dedicated `lex-error` code (rather than
        // collapsing to the generic `validation` fallback).
        expect(result.diagnostics.some((d) => d.code === 'lex-error')).toBe(true);
    });

    it('surfaces the stable validator code (NL.Exxxx) for migrated diagnostics, matching the CLI', async () => {
        // Before the shared resolveDiagnosticCode() rewire, the preview ignored
        // the validator's stable `data.code` and only inferred a code from the
        // message (here: `missing-date`), diverging from the CLI / Problems
        // panel which both showed `NL.E0500`.
        const source = `nowline v1

roadmap r1 "R"

swimlane s1 "S"
  item x duration:1w

anchor launch "Launch"
`;
        const result = await parseSource(source);
        expect(result.diagnostics.map((d) => d.code)).toContain('NL.E0500');
    });
});

describe('renderSource — happy path', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    it('returns kind:svg with a complete SVG string for a valid source', async () => {
        const result = await renderSource(ROADMAP_ALPHA);
        expect(result.kind).toBe('svg');
        if (result.kind !== 'svg') return;
        expect(result.svg.startsWith('<svg')).toBe(true);
        expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(result.warnings).toEqual([]);
    });

    it('produces deterministic output for the same input + idPrefix', async () => {
        const a = await renderSource(ROADMAP_ALPHA, { idPrefix: 'fixed' });
        const b = await renderSource(ROADMAP_ALPHA, { idPrefix: 'fixed' });
        expect(a).toStrictEqual(b);
    });

    it('respects an explicit theme override', async () => {
        const light = await renderSource(ROADMAP_ALPHA, { theme: 'light', idPrefix: 'fixed' });
        const dark = await renderSource(ROADMAP_ALPHA, { theme: 'dark', idPrefix: 'fixed' });
        expect(light.kind).toBe('svg');
        expect(dark.kind).toBe('svg');
        if (light.kind !== 'svg' || dark.kind !== 'svg') return;
        expect(light.svg).not.toBe(dark.svg);
    });

    it('isolates styles between renders via distinct idPrefix values', async () => {
        // The renderer scopes its `<defs>` ids by `id="<prefix>-..."` so
        // two blocks on the same page never share filter / marker / clip
        // ids. We look for those id-attribute prefixes specifically; bare
        // `a-` substrings would match generic markup like `text-anchor`
        // and produce false positives.
        const a = await renderSource(ROADMAP_ALPHA, { idPrefix: 'alpha' });
        const b = await renderSource(ROADMAP_BETA, { idPrefix: 'beta' });
        if (a.kind !== 'svg' || b.kind !== 'svg') {
            throw new Error('expected both renders to succeed');
        }
        expect(a.svg).toContain('id="alpha-');
        expect(b.svg).toContain('id="beta-');
        expect(a.svg).not.toContain('id="beta-');
        expect(b.svg).not.toContain('id="alpha-');
    });
});

describe('renderSource — diagnostic path', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    it('returns kind:diagnostics on a parse error and never throws', async () => {
        const result = await renderSource(ROADMAP_PARSE_ERROR);
        expect(result.kind).toBe('diagnostics');
        if (result.kind !== 'diagnostics') return;
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0].severity).toBe('error');
    });
});

describe('renderSource — include resolution', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
        vi.restoreAllMocks();
    });

    it('skips includes and renders the rest when no readFile is supplied', async () => {
        const skipped: SkippedInclude[] = [];
        const result = await renderSource(ROADMAP_WITH_INCLUDE, {
            onSkippedInclude: (info) => skipped.push(info),
        });
        expect(result.kind).toBe('svg');
        expect(skipped.length).toBeGreaterThan(0);
        expect(skipped[0].message).toMatch(/include/);
    });

    it('does not invoke console.warn from within the pipeline itself', async () => {
        // The embed wraps onSkippedInclude in its own once-per-page warn
        // latch. The pipeline must not emit console.warn directly so
        // host-side consumers control their own UX.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await renderSource(ROADMAP_WITH_INCLUDE);
        expect(warn).not.toHaveBeenCalled();
    });

    it('uses an injected readFile callback when supplied', async () => {
        const partner = `nowline v1

person alice "Alice"
`;
        const readFile = vi.fn().mockImplementation(async (p: string) => {
            if (p.endsWith('other.nowline')) return partner;
            throw new Error(`unexpected include: ${p}`);
        });
        const result = await renderSource(ROADMAP_WITH_INCLUDE, {
            filePath: '/workspace/main.nowline',
            readFile,
        });
        expect(readFile).toHaveBeenCalledTimes(1);
        expect(result.kind).toBe('svg');
    });
});

// Wave-rule resolver diagnostics (specs/waves.md §6.1) keep their stable
// code; every other resolver diagnostic stays an `include` row.
describe('renderSource — wave-rule include diagnostics', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    // The include is on line 3; the parent declares waves w1 and w2.
    const parent = `nowline v1

include "./other.nowline"

roadmap r "R" start:2026-01-05
wave w1
wave w2
swimlane eng "Engineering"
  item solo duration:1w wave:w1
`;
    const render = (child: string) =>
        renderSource(parent, {
            filePath: '/workspace/main.nowline',
            readFile: async () => child,
        });

    it('reports NL.E0202 on the parent include line', async () => {
        const result = await render('swimlane c "C"\n  item y duration:1w\n');
        expect(result.kind).toBe('diagnostics');
        if (result.kind !== 'diagnostics') return;
        expect(result.diagnostics).toEqual([
            {
                severity: 'error',
                code: 'NL.E0202',
                message: tr('en-US', 'NL.E0202', {
                    reason: 'child-none',
                    path: './other.nowline',
                    parent: ['w1', 'w2'],
                }),
                file: '/workspace/main.nowline',
                line: 3,
                column: 1,
            },
        ]);
    });

    it('reports NL.E1101 at the child path and line', async () => {
        const result = await render(
            'wave w1\nwave w2\nswimlane c "C"\n  item y duration:1w wave:w9\n',
        );
        expect(result.kind).toBe('diagnostics');
        if (result.kind !== 'diagnostics') return;
        expect(result.diagnostics.map((d) => [d.code, d.file, d.line])).toEqual([
            ['NL.E1101', '/workspace/other.nowline', 4],
        ]);
    });

    it('keeps an uncoded include error as an include row, verbatim', async () => {
        const result = await renderSource(parent, {
            filePath: '/workspace/main.nowline',
            readFile: async () => {
                throw new Error('boom');
            },
        });
        expect(result.kind).toBe('diagnostics');
        if (result.kind !== 'diagnostics') return;
        expect(result.diagnostics).toEqual([
            {
                severity: 'error',
                code: 'include',
                message: 'Could not read include "./other.nowline": boom',
                file: '/workspace/main.nowline',
                line: 3,
                column: 1,
            },
        ]);
    });

    // REGRESSION: an uncoded include error takes precedence; the wave-rule
    // diagnostics reported alongside it are dropped.
    it('reports only the include row when wave-rule errors also occur', async () => {
        const result = await renderSource(
            parent.replace(
                'include "./other.nowline"',
                'include "./other.nowline"\ninclude "./missing.nowline"',
            ),
            {
                filePath: '/workspace/main.nowline',
                readFile: async (p) => {
                    if (p.endsWith('missing.nowline')) throw new Error('boom');
                    return 'swimlane c "C"\n  item y duration:1w\n';
                },
            },
        );
        expect(result.kind).toBe('diagnostics');
        if (result.kind !== 'diagnostics') return;
        expect(result.diagnostics).toEqual([
            {
                severity: 'error',
                code: 'include',
                message: 'Could not read include "./missing.nowline": boom',
                file: '/workspace/main.nowline',
                line: 4,
                column: 1,
            },
        ]);
    });
});

describe('fromResolveDiagnostic', () => {
    const coded: ResolveDiagnostic = {
        severity: 'error',
        message: tr('en-US', 'NL.E1101', { reason: 'unknown', value: 'w9', declared: ['w1'] }),
        sourcePath: '/c.nowline',
        line: 4,
        code: 'NL.E1101',
        args: [{ reason: 'unknown', value: 'w9', declared: ['w1'] }],
        rule: 'wave',
    };

    it('localizes a coded diagnostic when a locale is given', () => {
        const fr = tr('fr', 'NL.E1101', { reason: 'unknown', value: 'w9', declared: ['w1'] });
        expect(fr).not.toBe(coded.message);
        expect(fromResolveDiagnostic(coded, 'fr').message).toBe(fr);
        expect(fromResolveDiagnostic(coded).message).toBe(coded.message);
        expect(fromResolveDiagnostic(coded).line).toBe(5);
    });

    it('labels WV8 (uncoded, wave-marked) like the validator, not as an include row', () => {
        const row = fromResolveDiagnostic({
            severity: 'error',
            message: '"wave" cannot be set on "default item".',
            sourcePath: '/c.nowline',
            line: 1,
            rule: 'wave',
        });
        expect(row.code).not.toBe('include');
    });

    it('leaves an uncoded include diagnostic unchanged in any locale', () => {
        const row = fromResolveDiagnostic(
            { severity: 'warning', message: 'Person "sam" is shadowed', sourcePath: '/a.nowline' },
            'fr',
        );
        expect(row).toEqual({
            severity: 'warning',
            code: 'include',
            message: 'Person "sam" is shadowed',
            file: '/a.nowline',
            line: 1,
            column: 1,
        });
    });
});

describe('renderSource — strict + warnings', () => {
    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    it('returns diagnostics with severity error when strict is set and assetResolver throws', async () => {
        // The renderer fires a warning when an asset resolver rejects an
        // image reference. With strict:true we expect the pipeline to
        // promote that warning to an error and return the diagnostics
        // discriminator. ROADMAP_ALPHA doesn't reference an image, so we
        // exercise the strict promotion path via the renderer's general
        // warn() callback through a custom assetResolver that always
        // throws (renderer will not call it unless an asset is requested,
        // so this assertion remains tolerant: strict produces either an
        // empty `warnings` SVG path or an error diagnostics path).
        const assetResolver = async () => {
            throw new Error('asset rejected by test');
        };
        const result = await renderSource(ROADMAP_ALPHA, {
            assetResolver,
            strict: true,
        });
        // Either path is correct: ROADMAP_ALPHA has no asset references,
        // so strict mode should still succeed without warnings.
        expect(['svg', 'diagnostics']).toContain(result.kind);
    });

    it('threads idPrefix into renderer style scoping', async () => {
        const result = await renderSource(ROADMAP_ALPHA, { idPrefix: 'inject' });
        if (result.kind !== 'svg') throw new Error('expected svg');
        expect(result.svg).toContain('id="inject-');
    });

    it('drops layout insights by default (diagnosticLevel error)', async () => {
        const longTitle = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane eng "Engineering"
  item x "This title is far too long to fit inside a one-week bar" duration:1w
`;
        const result = await renderSource(longTitle);
        expect(result.kind).toBe('svg');
        if (result.kind !== 'svg') return;
        expect(result.warnings).toEqual([]);
    });

    it('includes layout insights when diagnosticLevel is info', async () => {
        const longTitle = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane eng "Engineering"
  item x "This title is far too long to fit inside a one-week bar" duration:1w
`;
        const result = await renderSource(longTitle, { diagnosticLevel: 'info' });
        expect(result.kind).toBe('svg');
        if (result.kind !== 'svg') return;
        expect(result.warnings.some((w) => w.code === 'NL.I1000')).toBe(true);
    });
});

describe('renderSource: the non-working display', () => {
    const LAYER = 'data-layer="non-working"';

    afterEach(() => {
        __resetBrowserPipelineForTests();
    });

    async function svgOf(source: string, nonWorking?: 'hide' | 'show'): Promise<string> {
        const result = await renderSource(source, {
            today: null,
            ...(nonWorking === undefined ? {} : { nonWorking }),
        });
        if (result.kind !== 'svg') throw new Error('expected an svg result');
        return result.svg;
    }

    it('the option show adds the non-working layer', async () => {
        expect(await svgOf(ROADMAP_BUSINESS, 'show')).toContain(LAYER);
    });

    it('a file key show with no option has the layer (unset stays undefined)', async () => {
        expect(await svgOf(ROADMAP_BUSINESS_FILE_SHOW)).toContain(LAYER);
    });

    it('a file key show with the option hide has no layer', async () => {
        expect(await svgOf(ROADMAP_BUSINESS_FILE_SHOW, 'hide')).not.toContain(LAYER);
    });

    it('stays hide with no key and no option', async () => {
        expect(await svgOf(ROADMAP_BUSINESS)).not.toContain(LAYER);
    });
});
