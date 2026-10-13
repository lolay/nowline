// The fixed vocabularies the validator checks values against and the editor
// offers as completions (specs/core-ast-utilities.md §3.5). One definition
// for core, layout and the LSP, so the accepted spellings cannot drift between
// them. Exported only through `@nowline/core/internal`. A leaf module: it
// imports only `calendar-declarations.ts`, for the weekday names.

/**
 * Built-in status vocabulary. `active` and `completed` are international-
 * friendly aliases for `in-progress` and `done` respectively: they
 * canonicalize at the layout boundary (see statusFromProp in layout.ts) so
 * downstream consumers see a single normalized form. Both spellings remain
 * valid input.
 */
export const BUILTIN_STATUSES: readonly string[] = [
    'planned',
    'in-progress',
    'active',
    'done',
    'completed',
    'at-risk',
    'blocked',
];

/**
 * Built-in `capacity-icon:` vocabulary. Renderer-curated SVG glyphs, plus
 * `multiplier` (drawn as the U+00D7 text character) and `none` (suppresses
 * the glyph).
 */
export const BUILTIN_CAPACITY_ICONS: readonly string[] = [
    'none',
    'multiplier',
    'person',
    'people',
    'points',
    'time',
];

/**
 * Built-in `icon:` vocabulary: the capacity-icon names plus the entity-
 * decoration glyphs the renderer ships. `calendar` is the glyph the inline-
 * date pin path (`after:DATE` / `before:DATE`) draws onto items, parallels
 * and groups; reserving it keeps a `symbol calendar` declaration from
 * shadowing it.
 */
export const BUILTIN_ICON_NAMES: readonly string[] = [
    ...BUILTIN_CAPACITY_ICONS,
    'shield',
    'warning',
    'lock',
    'calendar',
];

/**
 * Values of the `non-working:` display key on `default roadmap`
 * (specs/working-calendar.md §4.2), in documentation order.
 */
export const NON_WORKING_DISPLAYS = ['hide', 'show'] as const;

/** One of the `non-working:` display values. */
export type NonWorkingDisplay = (typeof NON_WORKING_DISPLAYS)[number];

export { WEEKDAYS } from './calendar-declarations.js';
