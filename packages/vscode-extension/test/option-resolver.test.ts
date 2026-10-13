// The preview's option chain is toolbar, then setting, then `.nowlinerc`, then
// the editor's own theme. The rc values read through the shared options
// schema, and a value it rejects is ignored rather than reported.

import { describe, expect, it } from 'vitest';
import { resolvePreviewOptions } from '../src/preview/option-resolver.js';
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
    } = {},
) {
    return resolvePreviewOptions({
        settings: { ...SETTINGS, ...overrides.settings },
        rc: overrides.rc ?? {},
        vscodeLanguage: 'en',
        isDarkTheme: overrides.isDarkTheme ?? false,
        toolbarOverrides: overrides.toolbar,
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

    it('ignores an rc width below the 320 px floor or of the wrong type', () => {
        expect(resolve({ rc: { width: 300 } }).width).toBeUndefined();
        expect(resolve({ rc: { width: 'wide' } }).width).toBeUndefined();
        expect(resolve({ rc: { width: true } }).width).toBeUndefined();
    });
});

describe('resolvePreviewOptions: the other options', () => {
    it('draws the now-line at the pinned setting, and none for "none"', () => {
        expect(resolve({ settings: { now: '2026-02-09' } }).today).toEqual(
            new Date(Date.UTC(2026, 1, 9)),
        );
        expect(resolve({ settings: { now: 'none' } }).today).toBeNull();
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

    it('takes the locale from the setting, then the rc, then the editor language', () => {
        expect(resolve().locale).toBe('en');
        expect(resolve({ rc: { locale: 'fr' } }).locale).toBe('fr');
        expect(resolve({ settings: { locale: 'de' }, rc: { locale: 'fr' } }).locale).toBe('de');
    });
});
