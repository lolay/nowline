import { describe, expect, it } from 'vitest';
import { parseArgv } from '../../src/cli/args.js';
import { formatOptionError, resolveCliOptions } from '../../src/cli/options.js';
import { resolveTheme } from '../../src/cli/theme.js';
import { CliError } from '../../src/io/exit-codes.js';

function resolve(argv: string[], rc: Record<string, unknown> | null = null) {
    return resolveCliOptions(parseArgv(['in.nowline', ...argv]), rc);
}

function failure(fn: () => void): string {
    try {
        fn();
    } catch (err) {
        if (err instanceof CliError) return err.message;
        throw err;
    }
    throw new Error('expected a CliError');
}

describe('resolveCliOptions', () => {
    it('reads flag, then rc, then the default for the shared options', () => {
        expect(resolve([]).surface.theme).toBe('light');
        expect(resolve([], { theme: 'Dark', width: 900 }).surface).toMatchObject({
            theme: 'dark',
            width: 900,
        });
        expect(
            resolve(['--theme', 'greyscale', '-w', '1000'], { theme: 'dark', width: 900 }).surface,
        ).toMatchObject({ theme: 'grayscale', width: 1000 });
    });

    it('treats an empty --theme as not passed, so the rc theme applies', () => {
        expect(resolve(['--theme', ''], { theme: 'dark' }).surface.theme).toBe('dark');
    });

    it('lets a valid flag hide an invalid rc value', () => {
        const options = resolve(['--width', '800'], { width: 'wide' });
        expect(() => options.assertValid()).not.toThrow();
        expect(options.surface.width).toBe(800);
    });

    it('reads the CLI-only rc keys and ignores values of the wrong type', () => {
        const options = resolve([], {
            defaultFormat: 'png',
            fontSans: 'Inter',
            fontMono: 7,
            headlessFonts: true,
            useSystemFonts: 'yes',
            locale: 'fr',
            pdfOrientation: 'Landscape',
            pdfMargin: '1in',
        });
        expect(options).toMatchObject({
            defaultFormat: 'png',
            fontSans: 'Inter',
            fontMono: undefined,
            headless: true,
            useSystemFonts: false,
            rcLocale: 'fr',
            orientation: 'landscape',
            margin: 72,
        });
    });

    it('lets a flag override a CLI-only rc key', () => {
        const options = resolve(['--font-sans', 'Lato', '--headless'], { fontSans: 'Inter' });
        expect(options).toMatchObject({ fontSans: 'Lato', headless: true });
    });

    it('anchors the default now-line in the --timezone zone', () => {
        const clock = () => new Date('2026-02-09T23:30:00Z');
        const args = parseArgv(['in.nowline', '--timezone', '+05:00']);
        expect(resolveCliOptions(args, null, clock).surface.today).toEqual(
            new Date(Date.UTC(2026, 1, 10)),
        );
    });

    it('suppresses the now-line for --now -', () => {
        expect(resolve(['--now', '-']).surface.today).toBeUndefined();
    });
});

describe('resolveCliOptions errors', () => {
    it('reports theme, then timezone, then now, then width, then non-working', () => {
        const steps: Array<[string[], RegExp]> = [
            [['--theme', 'x', '--timezone', 'nowhere', '--now', 'y', '-w', 'z'], /--theme "x"/],
            [['--timezone', 'nowhere', '--now', 'y', '-w', 'z'], /unrecognised timezone/],
            [['--now', 'y', '-w', 'z', '--non-working', 'w'], /--now "y"/],
            [['-w', 'z', '--non-working', 'w'], /--width "z"/],
            [['--non-working', 'w'], /--non-working "w"/],
        ];
        for (const [argv, pattern] of steps) {
            expect(failure(() => resolve(argv).assertValid())).toMatch(pattern);
        }
    });

    it('names the flag or rc key and uses the CLI templates', () => {
        expect(failure(() => resolve(['-w', 'abc']).assertValid())).toBe(
            'nowline: invalid --width "abc". Must be an integer ≥ 320.',
        );
        expect(failure(() => resolve([], { theme: 'sepia' }).assertValid())).toBe(
            'nowline: invalid .nowlinerc theme "sepia". Expected light, dark, or grayscale.',
        );
        expect(failure(() => resolve(['--now', 'soon']).assertValid())).toBe(
            'nowline: invalid --now "soon". Expected YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS[Z|±HH:MM], or "-".',
        );
        expect(failure(() => resolve(['--non-working', 'maybe']).assertValid())).toBe(
            'nowline: invalid --non-working "maybe". Expected hide or show.',
        );
    });

    it('holds the PDF settings back until assertPdfSettingsValid', () => {
        const options = resolve(['--orientation', 'sideways'], { pdfMargin: 'wide' });
        expect(() => options.assertValid()).not.toThrow();
        expect(failure(() => options.assertPdfSettingsValid())).toBe(
            'nowline: invalid --orientation "sideways". Expected portrait, landscape, or auto.',
        );
        const margin = resolve([], { pdfMargin: 'wide' });
        expect(failure(() => margin.assertPdfSettingsValid())).toMatch(
            /^nowline: invalid \.nowlinerc pdfMargin "wide": /,
        );
    });
});

describe('formatOptionError', () => {
    it('joins a page-size detail after a colon', () => {
        const message = formatOptionError({
            key: 'pageSize',
            source: { kind: 'rc', key: 'pdfPageSize' },
            raw: 'huge',
            detail: 'unknown preset',
        });
        expect(message).toBe('nowline: invalid .nowlinerc pdfPageSize "huge": unknown preset');
    });
});

describe('resolveTheme', () => {
    it('resolves flag, then rc, then light', () => {
        expect(resolveTheme('dark', 'grayscale')).toBe('dark');
        expect(resolveTheme(undefined, 'GREYSCALE')).toBe('grayscale');
        expect(resolveTheme('', undefined)).toBe('light');
    });

    it('names the source of a bad value', () => {
        expect(failure(() => resolveTheme('x', undefined))).toBe(
            'nowline: invalid --theme "x". Expected light, dark, or grayscale.',
        );
        expect(failure(() => resolveTheme(undefined, 'x'))).toBe(
            'nowline: invalid .nowlinerc theme "x". Expected light, dark, or grayscale.',
        );
    });
});
