import { describe, expect, it } from 'vitest';
import {
    fallbackChain,
    localeStrings,
    resolveLocale,
    wavesDeclaredPlaceholder,
} from '../src/i18n.js';

describe('resolveLocale precedence (file wins for content)', () => {
    it('directive wins over override (the artifact owns its locale)', () => {
        expect(resolveLocale('en-US', 'fr-CA')).toBe('fr-CA');
        expect(resolveLocale('de-DE', 'fr')).toBe('fr');
    });

    it('override is used when the file declines to declare a locale', () => {
        expect(resolveLocale('fr-CA', undefined)).toBe('fr-CA');
    });

    it('directive wins even when override matches en-US (the default)', () => {
        expect(resolveLocale('en-US', 'fr')).toBe('fr');
    });

    it('falls back to en-US when both are undefined', () => {
        expect(resolveLocale(undefined, undefined)).toBe('en-US');
    });
});

describe('fallbackChain', () => {
    it('strips trailing subtags one at a time', () => {
        expect(fallbackChain('fr-CA')).toEqual(['fr-CA', 'fr', 'en-US']);
        expect(fallbackChain('fr-FR')).toEqual(['fr-FR', 'fr', 'en-US']);
    });

    it('handles bare languages without a region', () => {
        expect(fallbackChain('fr')).toEqual(['fr', 'en-US']);
    });

    it('en-US chain walks down to bare en before exiting (no duplicate root)', () => {
        expect(fallbackChain('en-US')).toEqual(['en-US', 'en']);
    });

    it('three-subtag chain falls through every level', () => {
        expect(fallbackChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en-US']);
    });

    it('normalizes case (input case agnostic)', () => {
        expect(fallbackChain('FR-ca')).toEqual(['fr-CA', 'fr', 'en-US']);
    });
});

describe('localeStrings', () => {
    it('returns en-US strings for the default locale', () => {
        const s = localeStrings('en-US');
        expect(s.nowLabel).toBe('now');
        expect(s.quarterPrefix).toBe('Q');
    });

    it('returns fr strings for fr', () => {
        const s = localeStrings('fr');
        expect(s.nowLabel).toBe('maint.');
        expect(s.quarterPrefix).toBe('T');
    });

    it('fr-CA falls through to fr (overlay is empty at launch)', () => {
        expect(localeStrings('fr-CA')).toEqual(localeStrings('fr'));
    });

    it('fr-FR falls through to fr (overlay is empty at launch)', () => {
        expect(localeStrings('fr-FR')).toEqual(localeStrings('fr'));
    });

    it('unknown locale falls through to en-US', () => {
        expect(localeStrings('de-AT')).toEqual(localeStrings('en-US'));
    });
});

describe('localeStrings — waves (specs/waves.md §9)', () => {
    it('returns the en-US wave strings', () => {
        const s = localeStrings('en-US');
        expect(s.waveHeldBy).toBe('held by');
        expect(s.waveNoItems).toBe('no items');
        expect(s.waveBackgroundItem).toBe('Background (no wave)');
        expect(s.waveLegendBackground).toBe('Background work (not in a wave)');
        expect(s.waveLegendBoundary).toBe('Wave boundary');
        expect(s.waveLegendPrefix).toBe('Waves:');
    });

    it('returns the fr wave strings, with a no-break space before colons', () => {
        const s = localeStrings('fr');
        expect(s.waveHeldBy).toBe('retenue par');
        expect(s.waveNoItems).toBe('aucun élément');
        expect(s.waveBackgroundItem).toBe('Travail de fond (hors vague)');
        expect(s.waveLegendBackground).toBe('Travail de fond (dans aucune vague)');
        expect(s.waveLegendBoundary).toBe('Limite de vague');
        expect(s.waveLegendPrefix).toBe('Vagues :');
    });

    it('every fr string differs from en-US (nothing falls through by accident)', () => {
        const en = localeStrings('en-US');
        const fr = localeStrings('fr');
        for (const key of Object.keys(en) as (keyof typeof en)[]) {
            expect(fr[key], key).not.toBe(en[key]);
        }
    });

    it('fills the all-empty placeholder with the wave titles', () => {
        expect(wavesDeclaredPlaceholder(localeStrings('en-US'), ['Discover', 'Build'])).toBe(
            'Waves declared: Discover, Build — no items assigned yet',
        );
        expect(wavesDeclaredPlaceholder(localeStrings('fr-CA'), ['Découvrir'])).toBe(
            'Vagues déclarées : Découvrir — aucun élément affecté pour l’instant',
        );
    });

    it('inserts titles verbatim, even ones that look like replacement patterns', () => {
        expect(wavesDeclaredPlaceholder(localeStrings('en-US'), ['$& cost', "$'"])).toBe(
            "Waves declared: $& cost, $' — no items assigned yet",
        );
    });
});
