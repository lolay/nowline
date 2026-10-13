// The preview's option chain is toolbar, then setting, then `.nowlinerc`, then
// the editor's own theme. The rc values read through the shared options
// schema, and a value it rejects is ignored rather than reported.

import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    parseToolbarNow,
    resolvePreviewOptions,
    resolveTodayAnchor,
    withOptionProblems,
} from '../src/preview/option-resolver.js';
import type { PreviewSettings } from '../src/preview/preview-panel.js';

const SETTINGS: PreviewSettings = {
    refreshOn: 'keystroke',
    debounceMs: 250,
    theme: 'auto',
    defaultFit: 'fitPage',
    showMinimap: true,
    locale: '',
    now: 'auto',
    timezone: '',
    nonWorking: 'file',
    strict: false,
    showLinks: true,
    width: 0,
    assetRoot: '',
};

function resolve(
    overrides: {
        settings?: Partial<PreviewSettings>;
        rc?: Record<string, unknown>;
        isDarkTheme?: boolean;
        toolbar?: Parameters<typeof resolvePreviewOptions>[0]['toolbarOverrides'];
        rcPath?: string;
    } = {},
) {
    return resolvePreviewOptions({
        settings: { ...SETTINGS, ...overrides.settings },
        rc: overrides.rc ?? {},
        vscodeLanguage: 'en',
        isDarkTheme: overrides.isDarkTheme ?? false,
        toolbarOverrides: overrides.toolbar,
        rcPath: overrides.rcPath,
    });
}

describe('resolvePreviewOptions: theme', () => {
    it('follows the editor when nothing else is set', () => {
        expect(resolve({ isDarkTheme: false }).theme).toBe('light');
        expect(resolve({ isDarkTheme: true }).theme).toBe('dark');
    });

    it('lets the rc theme beat the editor theme', () => {
        expect(resolve({ rc: { theme: 'grayscale' }, isDarkTheme: false }).theme).toBe('grayscale');
    });

    it('reads the rc theme case-insensitively and accepts greyscale', () => {
        expect(resolve({ rc: { theme: 'GREYSCALE' } }).theme).toBe('grayscale');
    });

    it('lets the setting beat the rc theme, and the toolbar beat the setting', () => {
        const rc = { theme: 'grayscale' };
        expect(resolve({ rc, settings: { theme: 'dark' } }).theme).toBe('dark');
        expect(
            resolve({ rc, settings: { theme: 'dark' }, toolbar: { theme: 'light' } }).theme,
        ).toBe('light');
    });

    it('lets a toolbar auto fall through the setting to the rc theme', () => {
        const options = resolve({
            rc: { theme: 'dark' },
            settings: { theme: 'light' },
            toolbar: { theme: 'auto' },
        });
        expect(options.theme).toBe('dark');
    });

    it('ignores an rc theme the schema rejects and moves on to the editor theme', () => {
        expect(resolve({ rc: { theme: 'sepia' }, isDarkTheme: true }).theme).toBe('dark');
        expect(resolve({ rc: { theme: 7 }, isDarkTheme: false }).theme).toBe('light');
        expect(resolve({ rc: { theme: '' }, isDarkTheme: true }).theme).toBe('dark');
    });
});

describe('resolvePreviewOptions: width', () => {
    it('is unset by default', () => {
        expect(resolve().width).toBeUndefined();
    });

    it('takes the rc width when the setting is unset', () => {
        expect(resolve({ rc: { width: 1200 } }).width).toBe(1200);
    });

    it('lets the setting beat the rc width', () => {
        expect(resolve({ settings: { width: 900 }, rc: { width: 1200 } }).width).toBe(900);
    });

    it('reads the rc width as the CLI does, so a numeric string works', () => {
        expect(resolve({ rc: { width: '1200px' } }).width).toBe(1200);
    });

    it('leaves a valid width without a problem row', () => {
        expect(resolve({ settings: { width: 900 } }).problems).toEqual([]);
        expect(resolve({ rc: { width: 900 } }).problems).toEqual([]);
    });

    it('falls back to fit-content and reports a setting below the 320 px floor', () => {
        const options = resolve({ settings: { width: 100 }, rc: { width: 1200 } });
        // A bad setting is the winning value, so the rc width is not consulted.
        expect(options.width).toBeUndefined();
        expect(options.problems).toEqual([
            {
                severity: 'warning',
                code: 'invalid-option',
                message:
                    'Invalid nowline.preview.width "100": must be an integer ≥ 320. The preview fits its content instead.',
                file: '',
                line: 1,
                column: 1,
            },
        ]);
    });

    it('reports a fractional or negative setting', () => {
        expect(resolve({ settings: { width: 400.5 } }).problems).toHaveLength(1);
        expect(resolve({ settings: { width: -5 } }).problems).toHaveLength(1);
    });

    it('falls back to fit-content and reports an rc width the rule rejects, pointing at the rc file', () => {
        for (const width of [300, 'wide', true]) {
            const options = resolve({ rc: { width }, rcPath: '/repo/.nowlinerc' });
            expect(options.width).toBeUndefined();
            expect(options.problems).toHaveLength(1);
            expect(options.problems[0]).toMatchObject({
                severity: 'warning',
                file: '/repo/.nowlinerc',
            });
            expect(options.problems[0]?.message).toContain(`Invalid .nowlinerc width "${width}"`);
        }
    });

    it('does not report an rc width the setting overrides', () => {
        const options = resolve({ settings: { width: 900 }, rc: { width: 300 } });
        expect(options.width).toBe(900);
        expect(options.problems).toEqual([]);
    });

    it('keeps ignoring a bad rc theme without a row', () => {
        expect(resolve({ rc: { theme: 'sepia' } }).problems).toEqual([]);
    });
});

describe('withOptionProblems', () => {
    const problem = {
        severity: 'warning' as const,
        code: 'invalid-option',
        message: 'bad width',
        file: '',
        line: 1,
        column: 1,
    };
    const own = { ...problem, severity: 'error' as const, code: 'NL.E0001', message: 'own' };

    it('returns the outcome untouched when there are no problems', () => {
        const outcome = { kind: 'svg' as const, svg: '<svg/>' };
        expect(withOptionProblems(outcome, [])).toBe(outcome);
    });

    it('carries the problems as warnings beside a rendered diagram', () => {
        expect(withOptionProblems({ kind: 'svg', svg: '<svg/>' }, [problem])).toEqual({
            kind: 'svg',
            svg: '<svg/>',
            warnings: [problem],
        });
    });

    it("puts the problems before a diagnostics outcome's own rows", () => {
        expect(withOptionProblems({ kind: 'diagnostics', rows: [own] }, [problem])).toEqual({
            kind: 'diagnostics',
            rows: [problem, own],
        });
    });
});

describe('resolvePreviewOptions: the other options', () => {
    it('draws the now-line at the pinned setting, and none for "none"', () => {
        expect(resolve({ settings: { now: '2026-02-09' } }).today).toEqual(
            new Date(Date.UTC(2026, 1, 9)),
        );
        expect(resolve({ settings: { now: 'none' } }).today).toBeNull();
    });

    // Regression: both paths rolled 2026-02-30 over to March 2.
    it('drops an impossible toolbar date and falls back from an impossible setting', () => {
        expect(parseToolbarNow('2026-02-09')).toEqual(new Date(Date.UTC(2026, 1, 9)));
        expect(parseToolbarNow('today')).toBe('today');
        expect(parseToolbarNow('hide')).toBe('hide');
        expect(parseToolbarNow('2026-02-30')).toBeUndefined();
        expect(parseToolbarNow('2026-2-9')).toBeUndefined();
        expect(resolveTodayAnchor(undefined, '2026-02-30')).not.toEqual(
            new Date(Date.UTC(2026, 2, 2)),
        );
        expect(resolveTodayAnchor(undefined, '2026-02-30')).toEqual(
            resolveTodayAnchor(undefined, 'auto'),
        );
    });

    it('lets the toolbar hide the now-line over a pinned setting', () => {
        const options = resolve({ settings: { now: '2026-02-09' }, toolbar: { now: 'hide' } });
        expect(options.today).toBeNull();
    });

    it('resolves non-working from the toolbar, then the setting', () => {
        expect(resolve().nonWorking).toBeUndefined();
        expect(resolve({ settings: { nonWorking: 'show' } }).nonWorking).toBe('show');
        expect(
            resolve({ settings: { nonWorking: 'show' }, toolbar: { nonWorking: 'file' } })
                .nonWorking,
        ).toBeUndefined();
    });

    it('takes the asset root from the setting, then the rc', () => {
        expect(resolve({ rc: { assetRoot: '/rc' } }).assetRoot).toBe('/rc');
        expect(
            resolve({ settings: { assetRoot: '/set' }, rc: { assetRoot: '/rc' } }).assetRoot,
        ).toBe('/set');
    });

    it('resolves a relative rc asset root against the .nowlinerc directory', () => {
        const options = resolve({ rc: { assetRoot: 'assets' }, rcPath: '/repo/.nowlinerc' });
        expect(options.assetRoot).toBe(path.resolve('/repo', 'assets'));
    });

    it('ignores an rc asset root that is not a path, without a problem row', () => {
        const options = resolve({ rc: { assetRoot: 5 } });
        expect(options.assetRoot).toBeUndefined();
        expect(options.problems).toEqual([]);
    });

    it('takes the locale from the setting, then the rc, then the editor language', () => {
        expect(resolve().locale).toBe('en');
        expect(resolve({ rc: { locale: 'fr' } }).locale).toBe('fr');
        expect(resolve({ settings: { locale: 'de' }, rc: { locale: 'fr' } }).locale).toBe('de');
    });
});
