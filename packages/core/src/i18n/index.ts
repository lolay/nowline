// Validator message registry. Walks the BCP-47 fallback chain, falling
// through to `en-US` for any missing key. Other locales (fr, fr-CA,
// fr-FR, …) plug in via `registerBundle` so the renderer in `@nowline/cli`
// can wire them at startup without forcing `@nowline/core` to import
// every locale file at build time.
//
// Coverage contract: `messages.en.ts` is the source of truth — every
// `MessageCode` MUST have an entry there. Coverage CI lives in
// `test/i18n/messages-coverage.test.ts`.

import type { MessageCode } from './codes.js';
import { messages as enMessages } from './messages.en.js';
import { messages as frMessages } from './messages.fr.js';
import { messages as frCAMessages } from './messages.fr-CA.js';
import { messages as frFRMessages } from './messages.fr-FR.js';

export type { MessageCode } from './codes.js';

// `messages.en.ts` re-exported with its inferred type so other locales
// can `satisfies` against it. Each function takes one named-argument
// object and returns a localized string.
export type MessageBundle = {
    [K in MessageCode]?: (...args: never[]) => string;
};

// Bundles are keyed by the BCP-47 tag. `en-US` is the canonical root and
// `fr` is the neutral French base; `fr-CA` and `fr-FR` are overlay shells
// that ship empty by design. The fallback walker (`fr-CA → fr → en-US`)
// fills in any missing keys, so authors only have to populate the
// overlays when a regional divergence actually exists.
//
// Empty overlays are intentional — they establish the contract for
// where regional divergences go when they appear, and keep the
// distribution surface uniform across locales.
const bundles = new Map<string, MessageBundle>([
    ['en-US', enMessages as MessageBundle],
    ['fr', frMessages],
    ['fr-CA', frCAMessages],
    ['fr-FR', frFRMessages],
]);

export function registerBundle(locale: string, bundle: MessageBundle): void {
    bundles.set(locale, bundle);
}

/**
 * Format a message in the resolved locale.
 *
 * Walks the locale fallback chain (`fr-CA → fr → en-US`) and returns
 * the first match. Always returns a string because `en-US` is
 * guaranteed to define every code.
 */
export function tr<K extends MessageCode>(
    locale: string,
    code: K,
    ...args: MessageArgs<K>
): string {
    for (const tag of fallbackChain(locale)) {
        const bundle = bundles.get(tag);
        const fn = bundle?.[code];
        if (fn) return (fn as (...a: typeof args) => string)(...args);
    }
    // Defensive fallback: en-US must define every code, but if a future
    // refactor accidentally forgets one, surface the code itself rather
    // than throwing — partial localization is recoverable; a thrown
    // exception during validation is not.
    return code;
}

// Type helper: extract the named-argument object type for a given code.
// `messages.en.ts` is the canonical signature source; other bundles
// satisfy `MessageBundle`, which only constrains the return type.
export type MessageArgs<K extends MessageCode> = Parameters<typeof enMessages[K]>;

const DEFAULT_LOCALE = 'en-US';

// Local copy of the BCP-47 fallback walker. Intentionally duplicated
// from `@nowline/layout/i18n` (which has the same logic) so that
// `@nowline/core` doesn't depend on `@nowline/layout`. The two
// implementations should evolve together — see `specs/localization.md`.
function fallbackChain(locale: string): string[] {
    const chain: string[] = [];
    let current = normalize(locale);
    while (current.length > 0) {
        if (!chain.includes(current)) chain.push(current);
        const dash = current.lastIndexOf('-');
        if (dash <= 0) break;
        current = current.slice(0, dash);
    }
    if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
    return chain;
}

function normalize(locale: string): string {
    const parts = locale.split('-');
    return parts
        .map((part, i) => {
            if (i === 0) return part.toLowerCase();
            return /^[a-zA-Z]{2}$/.test(part) ? part.toUpperCase() : part;
        })
        .join('-');
}
