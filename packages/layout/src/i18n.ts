// Locale-aware strings used by the layout pipeline. Owns three things:
//   - The BCP-47 fallback chain (`fr-CA → fr → en-US`).
//   - A small message table for chrome strings the renderer paints
//     directly (now-pill, quarter prefix).
//   - The locale token passed to `Intl.DateTimeFormat` for axis labels.
//
// Today the table is inline; m-loc-d / m-loc-e (per `specs/localization.md`)
// will move this to a proper `messages.<locale>.ts` bundle layout. The
// shape here is deliberately minimal so that swap is mechanical.

export const DEFAULT_LOCALE = 'en-US';

export interface LocaleStrings {
    /** Short label painted inside the now-line pill. Sized for ~3-6 chars. */
    nowLabel: string;
    /** Prefix used when the timeline scale is quarters (e.g. `Q1 2026` / `T1 2026`). */
    quarterPrefix: string;
}

// Bundle entries keyed by language tag. The fallback chain strips the
// trailing `-SUBTAG` and retries; a missing key in a child bundle falls
// through to the parent. `en-US` is the root.
//
// Region overlays (fr-CA, fr-FR) are intentionally omitted: at launch they
// have nothing region-specific to override. Empty overlays are a feature,
// not a bug — they exist as a contract for future divergence. See
// `specs/localization.md` § "Locale resolution".
const BUNDLES: Record<string, Partial<LocaleStrings>> = {
    'en-US': {
        nowLabel: 'now',
        quarterPrefix: 'Q',
    },
    'fr': {
        // Short form of "maintenant"; keeps the pill compact while staying
        // correct French. The full word is too wide for the ~3-6 char pill
        // budget without geometry work (tracked in m-loc-c).
        nowLabel: 'maint.',
        // `T` for trimestre — the standard French business convention.
        quarterPrefix: 'T',
    },
};

/**
 * Resolve the effective locale for the rendered artifact.
 *
 * Precedence (highest wins):
 *   1. `directiveLocale` — `nowline v1 locale:fr-CA` from the file itself.
 *      The file is the artifact; its declared locale is authoritative the
 *      same way `<html lang="fr">` is on a web page or `:lang:` is in
 *      AsciiDoc. This guarantees cross-machine determinism: a French
 *      roadmap renders French even when invoked from a US-locale shell.
 *   2. `override` — the CLI `--locale` flag plus env-var fallback,
 *      already resolved by the CLI before calling layout. Used only when
 *      the file declines to declare its own locale.
 *   3. `DEFAULT_LOCALE` (`en-US`).
 *
 * Returns the input string verbatim — callers downstream walk the BCP-47
 * fallback chain to find string entries.
 *
 * Note: the operator's locale (CLI flag / env vars) controls a separate,
 * independent chain for terminal output (validator diagnostics, --help,
 * verbose logs). See `specs/localization.md` for the two-chain model.
 */
export function resolveLocale(
    override: string | undefined,
    directiveLocale: string | undefined,
): string {
    return directiveLocale ?? override ?? DEFAULT_LOCALE;
}

/**
 * Look up a locale's chrome strings, walking the BCP-47 tree until a
 * value is found. The walk strips the trailing `-SUBTAG` and retries:
 *   `fr-CA → fr → en-US`
 *   `fr-BE → fr → en-US` (no fr-BE bundle yet — works for free)
 *   `de-AT → de → en-US` (no de bundles yet — falls all the way through)
 *
 * Always returns a fully-populated `LocaleStrings` because the `en-US`
 * root has every key.
 */
export function localeStrings(locale: string): LocaleStrings {
    const result: Partial<LocaleStrings> = {};
    for (const tag of fallbackChain(locale)) {
        const bundle = BUNDLES[tag];
        if (!bundle) continue;
        for (const key of Object.keys(bundle) as (keyof LocaleStrings)[]) {
            if (result[key] === undefined && bundle[key] !== undefined) {
                result[key] = bundle[key];
            }
        }
    }
    // The root bundle (`en-US`) is always populated, so this cast is safe.
    return result as LocaleStrings;
}

/**
 * BCP-47 fallback chain for a locale tag. Strips trailing `-SUBTAG`s
 * one at a time until a primary subtag remains, then appends the root
 * locale. Case-normalized to lowercase primary + uppercase region so
 * lookups are stable regardless of input casing.
 */
export function fallbackChain(locale: string): string[] {
    const chain: string[] = [];
    let current = normalizeTag(locale);
    while (current.length > 0) {
        if (!chain.includes(current)) chain.push(current);
        const dash = current.lastIndexOf('-');
        if (dash <= 0) break;
        current = current.slice(0, dash);
    }
    if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
    return chain;
}

function normalizeTag(locale: string): string {
    const parts = locale.split('-');
    return parts
        .map((part, index) => {
            if (index === 0) return part.toLowerCase();
            // Region subtag: 2 letters → upper-case; 3 digits → keep as-is.
            return /^[a-zA-Z]{2}$/.test(part) ? part.toUpperCase() : part;
        })
        .join('-');
}
