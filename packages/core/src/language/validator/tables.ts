// Constants, vocabularies and regexes the validator's checks share
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is.

import type { DefaultEntityType } from '../../generated/ast.js';
import {
    BUILTIN_CAPACITY_ICONS,
    BUILTIN_ICON_NAMES,
    BUILTIN_STATUSES,
    CALENDAR_FIELDS as CALENDAR_FIELD_LIST,
    CALENDAR_MODES as CALENDAR_MODE_LIST,
    COLOR_NAMES as COLOR_NAME_LIST,
    DEFAULT_ENTITY_TYPES as DEFAULT_ENTITY_TYPE_LIST,
    DIRECTIVE_FIELDS as DIRECTIVE_FIELD_LIST,
    ENTITY_KNOWN_PROPS as ENTITY_KNOWN_PROP_LISTS,
    INCLUDE_MODES as INCLUDE_MODE_LIST,
    NON_WORKING_DISPLAYS,
    ROADMAP_ONLY_STYLE_KEYS as ROADMAP_ONLY_STYLE_KEY_LIST,
    SCALE_FIELDS as SCALE_FIELD_LIST,
    STYLE_PROP_ENUMS as STYLE_PROP_ENUM_LISTS,
    STYLE_PROP_KEYS as STYLE_PROP_KEY_LIST,
    UNIVERSAL_ENTITY_PROPS as UNIVERSAL_ENTITY_PROP_LIST,
} from '../value-tables.js';

export { UTILIZATION_NONE } from '../value-tables.js';

export const SUPPORTED_VERSION = 'v1';

// Built-in vocabularies come from value-tables.ts; the validator checks
// membership, so it holds them as sets.
export const BUILTIN_STATUS_SET: ReadonlySet<string> = new Set(BUILTIN_STATUSES);
export const BUILTIN_CAPACITY_ICON_SET: ReadonlySet<string> = new Set(BUILTIN_CAPACITY_ICONS);
export const BUILTIN_ICON_NAME_SET: ReadonlySet<string> = new Set(BUILTIN_ICON_NAMES);

// Key vocabularies come from value-tables.ts too, held here as sets.
export const STYLE_PROP_KEYS: ReadonlySet<string> = new Set(STYLE_PROP_KEY_LIST);

// `non-working:` values (specs/working-calendar.md §4.2). Kept out of
// `STYLE_PROP_ENUMS` on purpose: the key reports its own coded NL.E0800,
// and the generic enum check would add a second error (NL.E0802).
export const NON_WORKING_VALUES: ReadonlySet<string> = new Set(NON_WORKING_DISPLAYS);

export const ROADMAP_ONLY_STYLE_KEYS: ReadonlySet<string> = new Set(ROADMAP_ONLY_STYLE_KEY_LIST);

// Style enums, colour names and calendar modes come from value-tables.ts,
// held here as sets for the membership checks.
export const STYLE_PROP_ENUMS: Record<string, ReadonlySet<string>> = Object.fromEntries(
    Object.entries(STYLE_PROP_ENUM_LISTS).map(([key, values]) => [key, new Set(values)]),
);

export const COLOR_NAMES: ReadonlySet<string> = new Set(COLOR_NAME_LIST);

export const CALENDAR_MODES: ReadonlySet<string> = new Set(CALENDAR_MODE_LIST);

export const CALENDAR_FIELDS: ReadonlySet<string> = new Set(CALENDAR_FIELD_LIST);

export const SCALE_FIELDS: ReadonlySet<string> = new Set(SCALE_FIELD_LIST);

export const DEFAULT_ENTITY_TYPES: ReadonlySet<string> = new Set(DEFAULT_ENTITY_TYPE_LIST);

// Banned properties per entity type on `default <entity>` lines.
// `capacity` on `default swimlane` is banned because each lane's budget must be
// explicit at its declaration site (per dsl.md). `capacity` on `default item` is
// allowed (and a useful "every item consumes 1 unit by default" lever).
export const DEFAULT_BANNED: Record<DefaultEntityType, Set<string>> = {
    item: new Set([
        'size',
        'duration',
        'after',
        'before',
        'remaining',
        'link',
        'description',
        'owner',
    ]),
    milestone: new Set(['date', 'after', 'link', 'description']),
    anchor: new Set(['date', 'link', 'description']),
    footnote: new Set(['on', 'link', 'description']),
    label: new Set(['link', 'description']),
    swimlane: new Set(['capacity']),
    roadmap: new Set(),
    parallel: new Set(),
    group: new Set(),
};

export const UNIVERSAL_ENTITY_PROPS: ReadonlySet<string> = new Set(UNIVERSAL_ENTITY_PROP_LIST);

export const ENTITY_KNOWN_PROPS: Record<string, ReadonlySet<string>> = Object.fromEntries(
    Object.entries(ENTITY_KNOWN_PROP_LISTS).map(([type, keys]) => [type, new Set(keys)]),
);

// Conceptual mistakes that aren't typos of a real key — e.g. `progress:60` is a
// reasonable guess for "60% done", but Nowline models completion as
// `status:` + `remaining:` (work *left*). Levenshtein can't bridge that gap, so
// we map the concept directly. `requires` names a key the entity must support,
// so the hint only fires where it's actionable (e.g. on an `item`, which has
// `remaining`, not on a `roadmap` line). `entities`, when set, narrows it
// further to the declarations where the suggested form is valid.
const CONCEPT_ALIASES: ReadonlyArray<{
    keys: ReadonlySet<string>;
    requires: string;
    entities?: ReadonlySet<string>;
    suggest: string;
}> = [
    {
        keys: new Set(['progress', 'percent', 'percentage', 'pct', 'complete', 'completion']),
        requires: 'remaining',
        suggest: 'status: + remaining:',
    },
    {
        // A fixed start date is not supported on work (`specs/dsl.md` §
        // Item Properties); `after:<date>` is "not before". An inline date
        // in `after:` is valid on an item, parallel and group only
        // (Validation Rule 24a), so a swimlane gets no hint.
        keys: new Set(['date', 'start']),
        requires: 'after',
        entities: new Set(['ItemDeclaration', 'ParallelBlock', 'GroupBlock']),
        suggest: 'after:<date>',
    },
];

// Suggest the canonical property (or combination) for a known conceptual
// mistake, gated to entities that actually support the target key. Returns
// undefined when no concept matches so callers fall back to `suggestKey`.
export function suggestConcept(
    key: string,
    known: ReadonlySet<string>,
    entityType?: string,
): string | undefined {
    const lower = key.toLowerCase();
    for (const alias of CONCEPT_ALIASES) {
        if (!alias.keys.has(lower) || !known.has(alias.requires)) continue;
        if (alias.entities && (entityType === undefined || !alias.entities.has(entityType))) {
            continue;
        }
        return alias.suggest;
    }
    return undefined;
}

// Matches duration literals including decimals, e.g. `2w`, `0.5d`, `1.5m`.
export const DURATION_RE = /^\d+(?:\.\d+)?[dwmqy]$/;
export const PERCENTAGE_RE = /^\d+%$/;
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
export const VERSION_RE = /^v\d+$/;
export const INTEGER_RE = /^\d+$/;
export const BARE_DURATION_SUFFIX_RE = /^[dwmqy]$/;
// Capacity numeric forms — the grammar already separates DECIMAL/INTEGER/PERCENTAGE
// terminals, but the validator needs to enforce the spec's "positive number" rule
// and to differentiate where percent is allowed (item) vs. banned (swimlane).
export const POSITIVE_NUMBER_RE = /^\d+(\.\d+)?$/;
export const POSITIVE_PERCENT_RE = /^\d+(\.\d+)?%$/;
// Disambiguated forms used by `utilization-warn-at:` / `utilization-over-at:`.
// A decimal-fraction MUST include the dot so its meaning is unambiguous; a
// bare integer matches the integer regex and is rejected by the validator
// with a hint to switch to either the percent or decimal-fraction form.
export const POSITIVE_DECIMAL_FRACTION_RE = /^\d+\.\d+$/;
export const POSITIVE_INTEGER_RE = /^\d+$/;
// ASCII printable, length 1-3 — used by the glyph declaration validator for the
// `ascii:"..."` fallback property after Langium has stripped the surrounding quotes.
export const ASCII_FALLBACK_RE = /^[\x20-\x7E]{1,3}$/;

// BCP-47 language tag, simplified to the subset Nowline cares about: a 2- or 3-letter
// primary language subtag followed by an optional region subtag (2 letters or 3 digits).
// Permissive enough for `fr`, `fr-CA`, `zh-CN`, `es-419` while rejecting obvious typos.
// The runtime resolver does the actual fallback work; this regex just gates input shape.
export const BCP47_RE = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2}|-\d{3})?$/;

// From value-tables.ts, held as a set for the membership check.
export const INCLUDE_MODES: ReadonlySet<string> = new Set(INCLUDE_MODE_LIST);

export const DIRECTIVE_FIELDS: ReadonlySet<string> = new Set(DIRECTIVE_FIELD_LIST);
