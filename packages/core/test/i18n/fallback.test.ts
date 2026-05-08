// BCP-47 fallback chain coverage. Confirms that overlay locales fall
// through to their parent bundle for missing keys, and that the empty
// `fr-CA` / `fr-FR` overlays land on `fr` translations identically to
// bare `fr`.

import { describe, expect, it } from 'vitest';
import { tr } from '../../src/i18n/index.js';

describe('i18n fallback chain', () => {
    it('returns en-US text for en-US locale', () => {
        const msg = tr('en-US', 'NL.E0001');
        expect(msg).toMatch(/Config section must appear before roadmap/);
    });

    it('returns fr text for fr locale', () => {
        const msg = tr('fr', 'NL.E0001');
        expect(msg).toMatch(/section config doit/);
    });

    it('falls back to fr for fr-CA when overlay is empty', () => {
        const fr = tr('fr', 'NL.E0001');
        const frCA = tr('fr-CA', 'NL.E0001');
        expect(frCA).toBe(fr);
    });

    it('falls back to fr for fr-FR when overlay is empty', () => {
        const fr = tr('fr', 'NL.E0001');
        const frFR = tr('fr-FR', 'NL.E0001');
        expect(frFR).toBe(fr);
    });

    it('falls back to fr for an unregistered fr-BE region', () => {
        const fr = tr('fr', 'NL.E0001');
        const frBE = tr('fr-BE', 'NL.E0001');
        expect(frBE).toBe(fr);
    });

    it('falls back to en-US for an unknown language', () => {
        const en = tr('en-US', 'NL.E0001');
        const xx = tr('xx-XX', 'NL.E0001');
        expect(xx).toBe(en);
    });

    it('formats arguments through the fallback chain', () => {
        const en = tr('en-US', 'NL.E0005', { line: 7 });
        const fr = tr('fr', 'NL.E0005', { line: 7 });
        const frCA = tr('fr-CA', 'NL.E0005', { line: 7 });
        expect(en).toContain('Line 7');
        expect(fr).toContain('Ligne 7');
        expect(frCA).toBe(fr);
    });
});
