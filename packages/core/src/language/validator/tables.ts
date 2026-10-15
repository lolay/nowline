// Constants, vocabularies and regexes the validator's checks share
// (specs/core-ast-utilities.md §3.6). Moved out of nowline-validator.ts as-is.

import type { DefaultEntityType } from '../../generated/ast.js';
import {
    BUILTIN_CAPACITY_ICONS,
    BUILTIN_ICON_NAMES,
    BUILTIN_STATUSES,
    CALENDAR_MODES as CALENDAR_MODE_LIST,
    COLOR_NAMES as COLOR_NAME_LIST,
    INCLUDE_MODES as INCLUDE_MODE_LIST,
    NON_WORKING_DISPLAYS,
    STYLE_PROP_ENUMS as STYLE_PROP_ENUM_LISTS,
} from '../value-tables.js';

export const SUPPORTED_VERSION = 'v1';

// Built-in vocabularies come from value-tables.ts; the validator checks
// membership, so it holds them as sets.
export const BUILTIN_STATUS_SET: ReadonlySet<string> = new Set(BUILTIN_STATUSES);
export const BUILTIN_CAPACITY_ICON_SET: ReadonlySet<string> = new Set(BUILTIN_CAPACITY_ICONS);
export const BUILTIN_ICON_NAME_SET: ReadonlySet<string> = new Set(BUILTIN_ICON_NAMES);

export const STYLE_PROP_KEYS = new Set([
    'bg',
    'fg',
    'text',
    'border',
    'icon',
    'shadow',
    'font',
    'weight',
    'italic',
    'text-size',
    'padding',
    'spacing',
    'header-height',
    'corner-radius',
    'bracket',
    'header-position',
    'capacity-icon',
    'timeline-position',
    'minor-grid',
    'non-working',
]);

// `non-working:` values (specs/working-calendar.md §4.2). Kept out of
// `STYLE_PROP_ENUMS` on purpose: the key reports its own coded NL.E0800,
// and the generic enum check would add a second error (NL.E0802).
export const NON_WORKING_VALUES: ReadonlySet<string> = new Set(NON_WORKING_DISPLAYS);

// Style keys only the roadmap reads (specs/dsl.md style table). On another
// entity's `default` line they are a silent no-op, so they warn (NL.W0703).
// Style blocks are not checked: one block can be referenced by the roadmap
// and by other entities alike, so the key there is not necessarily wrong.
export const ROADMAP_ONLY_STYLE_KEYS = new Set([
    'header-height',
    'header-position',
    'timeline-position',
    'minor-grid',
    'non-working',
]);

// `utilization-warn-at:` / `utilization-over-at:` accept the literal `none`
// to opt out of that color band (per specs/dsl.md rule 17d). Numeric forms
// (positive percent, decimal, integer) are validated separately via
// POSITIVE_NUMBER_RE / POSITIVE_PERCENT_RE.
export const UTILIZATION_NONE = 'none';

// Style enums, colour names and calendar modes come from value-tables.ts,
// held here as sets for the membership checks.
export const STYLE_PROP_ENUMS: Record<string, ReadonlySet<string>> = Object.fromEntries(
    Object.entries(STYLE_PROP_ENUM_LISTS).map(([key, values]) => [key, new Set(values)]),
);

export const COLOR_NAMES: ReadonlySet<string> = new Set(COLOR_NAME_LIST);

export const CALENDAR_MODES: ReadonlySet<string> = new Set(CALENDAR_MODE_LIST);

export const CALENDAR_FIELDS = new Set([
    'days-per-week',
    'days-per-month',
    'days-per-quarter',
    'days-per-year',
]);

export const SCALE_FIELDS = new Set(['name', 'label-every', 'label']);

export const DEFAULT_ENTITY_TYPES = new Set([
    'item',
    'label',
    'swimlane',
    'roadmap',
    'milestone',
    'footnote',
    'anchor',
    'parallel',
    'group',
]);

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

// Properties every entity declaration may carry (`specs/dsl.md` § Universal Properties).
// `description` is technically a sub-directive (`description "text"` indented under the
// entity), not an EntityProperty, but we accept it here too: authors who type
// `description:"text"` as a property aren't doing anything meaningful, but the typo is
// common enough that warning on it adds noise rather than signal — the value is at
// least carried into the AST and could be surfaced later if we choose to.
export const UNIVERSAL_ENTITY_PROPS = new Set(['labels', 'link', 'style', 'description']);

// Properties each entity declaration's `properties: EntityProperty[]` bag actually
// consumes downstream. Sourced from (a) the property tables in `specs/dsl.md` and
// (b) every `propValue(...)`/`propValues(...)` call site in `packages/layout/`. Keys
// outside this set + `UNIVERSAL_ENTITY_PROPS` are silently dropped by the layout —
// `checkUnknownEntityProperties` warns on them so authors notice typos like
// `now:2026-01-25` on a `roadmap` line.
//
// Raw style props (`bg`, `fg`, ...) intentionally stay OUT of this map — they are
// rejected as errors by `checkNoRawStyleProperties` and the unknown-property check
// short-circuits on them so authors don't see a duplicate diagnostic.
export const ENTITY_KNOWN_PROPS: Record<string, Set<string>> = {
    RoadmapDeclaration: new Set([
        'author',
        'start',
        'length',
        'scale',
        'calendar',
        'logo',
        'logo-size',
    ]),
    AnchorDeclaration: new Set(['date']),
    SwimlaneDeclaration: new Set([
        'owner',
        'capacity',
        'utilization-warn-at',
        'utilization-over-at',
        'status',
        'after',
        'before',
    ]),
    // An item has no `date:` or `start:`: it cannot be pinned to a fixed start
    // date (`specs/dsl.md` § Item Properties, "Pinning is not supported"), so
    // both keys draw this warning with the `after:<date>` concept hint below.
    ItemDeclaration: new Set([
        'size',
        'duration',
        'status',
        'owner',
        'after',
        'before',
        'remaining',
        'capacity',
    ]),
    // size/duration/remaining/capacity on parallel/group are already errors via
    // `checkNoComputedProperties`, so we don't list them here.
    ParallelBlock: new Set(['owner', 'after', 'before', 'status']),
    GroupBlock: new Set(['owner', 'after', 'before', 'status']),
    MilestoneDeclaration: new Set(['date', 'after']),
    FootnoteDeclaration: new Set(['on']),
    PersonDeclaration: new Set(),
    TeamDeclaration: new Set(),
    LabelDeclaration: new Set(),
    SizeDeclaration: new Set(['effort']),
    StatusDeclaration: new Set(),
    // The other keys a wave takes are universal; the keys it may not take
    // are NL.E1105 (`isWaveBannedProperty`), owned by the wave rules.
    WaveDeclaration: new Set(['after']),
};

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

// Allow-listed property keys on the `nowline` directive line. The directive existed
// historically as `nowline v1` only; properties are a forward-extension point but stay
// restrictive so authors get an early error instead of typos rendering silently.
export const DIRECTIVE_FIELDS = new Set(['locale']);
