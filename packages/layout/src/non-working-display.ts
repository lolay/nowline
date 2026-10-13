// How the chart shows a calendar's non-working days (specs/working-
// calendar.md §4.2): `hide` collapses them to zero width (the default),
// `show` draws them at full width as shaded bands. One shared definition
// for the layout and every surface that takes a render-time option, so the
// accepted spellings cannot drift between them. The table itself lives in
// core (`value-tables.ts`), which the validator and the editor completions
// read too; the GitHub Action still has its own copy, though it bundles
// layout's theme parser.

import { NON_WORKING_DISPLAYS, type NonWorkingDisplay } from '@nowline/core/internal';

/** A non-working display value. */
export type { NonWorkingDisplay };

/** Every display value, in documentation order. */
export { NON_WORKING_DISPLAYS };

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
