// Coverage contract: every `MessageCode` listed in `ALL_CODES` MUST
// appear in `messages.en.ts`. Other locales may omit keys — the loader
// falls through to `en-US` for any missing entry — so they are not
// required to be exhaustive. This test enforces the en-US half of the
// contract; locale bundles register themselves dynamically and are
// covered by the loader's fallback path tests.

import { describe, expect, it } from 'vitest';
import { ALL_CODES } from '../../src/i18n/codes.js';
import { messages } from '../../src/i18n/messages.en.js';

describe('messages.en coverage', () => {
    it('defines every code listed in ALL_CODES', () => {
        const missing = ALL_CODES.filter((code) => !(code in messages));
        expect(missing).toEqual([]);
    });

    it('does not define stray codes outside ALL_CODES', () => {
        const allowed = new Set<string>(ALL_CODES);
        const stray = Object.keys(messages).filter((k) => !allowed.has(k));
        expect(stray).toEqual([]);
    });
});
