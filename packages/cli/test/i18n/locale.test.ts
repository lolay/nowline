import { describe, expect, it } from 'vitest';
import {
    describeContentLocaleSource,
    operatorLocale,
    resolveLocaleOverride,
} from '../../src/i18n/locale.js';

describe('resolveLocaleOverride', () => {
    it('CLI flag wins over every env var', () => {
        const result = resolveLocaleOverride({
            flag: 'fr-CA',
            env: { LANG: 'en_US.UTF-8', LC_ALL: 'de_DE', LC_MESSAGES: 'es' },
        });
        expect(result).toEqual({ tag: 'fr-CA', source: 'flag' });
    });

    it('LC_ALL wins over LC_MESSAGES and LANG', () => {
        const result = resolveLocaleOverride({
            flag: undefined,
            env: { LC_ALL: 'fr_FR.UTF-8', LC_MESSAGES: 'de_DE', LANG: 'en_US' },
        });
        expect(result).toEqual({ tag: 'fr-FR', source: 'env', envVar: 'LC_ALL' });
    });

    it('LC_MESSAGES wins over LANG when LC_ALL is unset', () => {
        const result = resolveLocaleOverride({
            flag: undefined,
            env: { LC_MESSAGES: 'fr_CA.UTF-8', LANG: 'en_US' },
        });
        expect(result).toEqual({ tag: 'fr-CA', source: 'env', envVar: 'LC_MESSAGES' });
    });

    it('LANG used when LC_ALL and LC_MESSAGES are unset', () => {
        const result = resolveLocaleOverride({
            flag: undefined,
            env: { LANG: 'fr_FR' },
        });
        expect(result).toEqual({ tag: 'fr-FR', source: 'env', envVar: 'LANG' });
    });

    it('strips POSIX `.encoding` and `@variant` suffixes', () => {
        expect(resolveLocaleOverride({ flag: undefined, env: { LANG: 'fr_FR.UTF-8' } })).toEqual({
            tag: 'fr-FR',
            source: 'env',
            envVar: 'LANG',
        });
        expect(resolveLocaleOverride({ flag: undefined, env: { LANG: 'fr_CA@euro' } })).toEqual({
            tag: 'fr-CA',
            source: 'env',
            envVar: 'LANG',
        });
        expect(
            resolveLocaleOverride({ flag: undefined, env: { LANG: 'fr_FR.UTF-8@euro' } }),
        ).toEqual({
            tag: 'fr-FR',
            source: 'env',
            envVar: 'LANG',
        });
    });

    it('skips POSIX C / POSIX locales (treated as "no localization")', () => {
        expect(resolveLocaleOverride({ flag: undefined, env: { LANG: 'C' } })).toEqual({
            tag: undefined,
            source: undefined,
        });
        expect(resolveLocaleOverride({ flag: undefined, env: { LANG: 'POSIX' } })).toEqual({
            tag: undefined,
            source: undefined,
        });
        expect(
            resolveLocaleOverride({ flag: undefined, env: { LC_ALL: 'C', LANG: 'fr_FR' } }),
        ).toEqual({ tag: 'fr-FR', source: 'env', envVar: 'LANG' });
    });

    it('returns undefined when nothing is set (operator falls back to en-US, content to directive)', () => {
        expect(resolveLocaleOverride({ flag: undefined, env: {} })).toEqual({
            tag: undefined,
            source: undefined,
        });
    });

    it('passes BCP-47-shaped values through unchanged', () => {
        expect(resolveLocaleOverride({ flag: 'fr', env: {} })).toEqual({
            tag: 'fr',
            source: 'flag',
        });
        expect(resolveLocaleOverride({ flag: 'fr-CA', env: {} })).toEqual({
            tag: 'fr-CA',
            source: 'flag',
        });
        expect(resolveLocaleOverride({ flag: 'es-419', env: {} })).toEqual({
            tag: 'es-419',
            source: 'flag',
        });
    });

    it('falls through to .nowlinerc when flag and env are unset', () => {
        const result = resolveLocaleOverride({ flag: undefined, env: {}, rc: 'fr-CA' });
        expect(result).toEqual({ tag: 'fr-CA', source: 'rc' });
    });
});

describe('operatorLocale', () => {
    it('returns the resolved tag verbatim', () => {
        expect(operatorLocale({ tag: 'fr-CA', source: 'flag' })).toBe('fr-CA');
    });

    it('falls back to en-US when no source produced a tag', () => {
        expect(operatorLocale({ tag: undefined, source: undefined })).toBe('en-US');
    });
});

describe('describeContentLocaleSource', () => {
    it('reports the file directive when the file declares a locale', () => {
        const result = describeContentLocaleSource('fr-CA', { tag: 'en-US', source: 'flag' });
        expect(result).toEqual({ tag: 'fr-CA', source: 'from file directive' });
    });

    it('reports the CLI flag when no directive but flag is set', () => {
        const result = describeContentLocaleSource(undefined, { tag: 'fr-CA', source: 'flag' });
        expect(result).toEqual({ tag: 'fr-CA', source: 'from --locale' });
    });

    it('reports the env var by name when env produced the tag', () => {
        const result = describeContentLocaleSource(undefined, {
            tag: 'fr-FR',
            source: 'env',
            envVar: 'LANG',
        });
        expect(result).toEqual({ tag: 'fr-FR', source: 'from LANG env var' });
    });

    it('reports .nowlinerc when rc produced the tag', () => {
        const result = describeContentLocaleSource(undefined, { tag: 'fr-CA', source: 'rc' });
        expect(result).toEqual({ tag: 'fr-CA', source: 'from .nowlinerc' });
    });

    it('reports the en-US default when nothing is set', () => {
        const result = describeContentLocaleSource(undefined, {
            tag: undefined,
            source: undefined,
        });
        expect(result).toEqual({ tag: 'en-US', source: 'default' });
    });
});
