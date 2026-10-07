// How the chart shows a calendar's non-working days (specs/working-
// calendar.md §4.2): `hide` collapses them to zero width (the default),
// `show` draws them at full width as shaded bands. One shared definition
// for the layout and every surface that takes a render-time option, so the
// accepted spellings cannot drift between them. Core and the GitHub Action
// keep their own two-value checks because they cannot depend on layout.

/** A non-working display value. */
export type NonWorkingDisplay = 'hide' | 'show';

/** Every display value, in documentation order. */
export const NON_WORKING_DISPLAYS: readonly NonWorkingDisplay[] = ['hide', 'show'];

/** True when `value` is a display value. */
export function isNonWorkingDisplay(value: unknown): value is NonWorkingDisplay {
    return value === 'hide' || value === 'show';
}

/**
 * Parse a raw surface option. Empty or missing input is "unset" and returns
 * undefined, so the file's `default roadmap non-working:` key still applies;
 * anything other than `hide` or `show` throws a `RangeError`.
 */
export function parseNonWorkingDisplay(raw: string | undefined): NonWorkingDisplay | undefined {
    if (raw === undefined || raw === '') return undefined;
    if (isNonWorkingDisplay(raw)) return raw;
    throw new RangeError(`Invalid non-working display "${raw}". Expected hide or show.`);
}
