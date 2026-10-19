// The fixed vocabularies the validator checks keys and values against and
// the editor offers as completions (specs/core-ast-utilities.md §3.5). One
// definition for core, layout and the LSP, so the accepted spellings cannot
// drift between them. Exported only through `@nowline/core/internal`. A leaf module: it
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

/**
 * Values of each enumerated style key (specs/dsl.md rule 19), in
 * documentation order. `non-working:` is not here: it has its own table and
 * its own error code. Colour keys (`bg`, `fg`, `text`) take `COLOR_NAMES` or
 * a hex value instead.
 */
export const STYLE_PROP_ENUMS: Readonly<Record<string, readonly string[]>> = {
    border: ['solid', 'dashed', 'dotted'],
    shadow: ['none', 'subtle', 'soft', 'hard'],
    font: ['sans', 'serif', 'mono'],
    weight: ['thin', 'light', 'normal', 'bold'],
    italic: ['true', 'false'],
    'text-size': ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    padding: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    spacing: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    'header-height': ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
    'corner-radius': ['none', 'xs', 'sm', 'md', 'lg', 'xl', 'full'],
    bracket: ['none', 'solid', 'dashed'],
    'header-position': ['beside', 'above'],
    'timeline-position': ['top', 'bottom', 'both'],
    'minor-grid': ['true', 'false'],
};

/**
 * Built-in colour vocabulary for `bg`, `fg` and `text`. `grey` and `violet`
 * are international-friendly aliases for `gray` and `purple`: they
 * canonicalize at the theme boundary (resolveColor in
 * packages/layout/src/themes/index.ts) so themes don't grow new fields. Both
 * spellings remain valid input.
 */
export const COLOR_NAMES: readonly string[] = [
    'red',
    'blue',
    'yellow',
    'green',
    'orange',
    'purple',
    'violet',
    'gray',
    'grey',
    'navy',
    'white',
    'none',
];

/** Values of `calendar:` on the `roadmap` line. */
export const CALENDAR_MODES: readonly string[] = ['business', 'full', 'custom'];

/** Values of `config:` and `roadmap:` on an `include` line. */
export const INCLUDE_MODES: readonly string[] = ['merge', 'ignore', 'isolate'];

/**
 * Keys a style block or `default` line may set (specs/dsl.md style table).
 * The enumerated ones take `STYLE_PROP_ENUMS`; `bg`, `fg` and `text` take a
 * colour.
 */
export const STYLE_PROP_KEYS: readonly string[] = [
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
];

/**
 * Style keys only the roadmap reads (specs/dsl.md style table). On another
 * entity's `default` line they are a silent no-op, so they warn (NL.W0703).
 * Style blocks are not checked: one block can be referenced by the roadmap
 * and by other entities alike, so the key there is not necessarily wrong.
 */
export const ROADMAP_ONLY_STYLE_KEYS: readonly string[] = [
    'header-height',
    'header-position',
    'timeline-position',
    'minor-grid',
    'non-working',
];

/**
 * `utilization-warn-at:` / `utilization-over-at:` accept the literal `none`
 * to opt out of that color band (per specs/dsl.md rule 17d). Numeric forms
 * (positive percent, decimal, integer) are validated separately.
 */
export const UTILIZATION_NONE = 'none';

/** Keys of a `calendar` block. */
export const CALENDAR_FIELDS: readonly string[] = [
    'days-per-week',
    'days-per-month',
    'days-per-quarter',
    'days-per-year',
];

/** Keys of a `scale` block. */
export const SCALE_FIELDS: readonly string[] = ['name', 'label-every', 'label'];

/** Entity types a `default <entity>` line may name. */
export const DEFAULT_ENTITY_TYPES: readonly string[] = [
    'item',
    'label',
    'swimlane',
    'roadmap',
    'milestone',
    'footnote',
    'anchor',
    'parallel',
    'group',
];

/**
 * Properties every entity declaration may carry (`specs/dsl.md` § Universal
 * Properties). `description` is technically a sub-directive (`description
 * "text"` indented under the entity), not an EntityProperty, but we accept it
 * here too: authors who type `description:"text"` as a property aren't doing
 * anything meaningful, but the typo is common enough that warning on it adds
 * noise rather than signal — the value is at least carried into the AST and
 * could be surfaced later if we choose to.
 */
export const UNIVERSAL_ENTITY_PROPS: readonly string[] = ['labels', 'link', 'style', 'description'];

/**
 * Properties each entity declaration's `properties: EntityProperty[]` bag
 * actually consumes downstream, keyed by the declaration's AST `$type`.
 * Sourced from (a) the property tables in `specs/dsl.md` and (b) every
 * `propValue(...)`/`propValues(...)` call site in `packages/layout/`. Keys
 * outside this table + `UNIVERSAL_ENTITY_PROPS` are silently dropped by the
 * layout — `checkUnknownEntityProperties` warns on them so authors notice
 * typos like `now:2026-01-25` on a `roadmap` line.
 *
 * Raw style props (`bg`, `fg`, ...) intentionally stay OUT of this map — they
 * are rejected as errors by `checkNoRawStyleProperties` and the unknown-
 * property check short-circuits on them so authors don't see a duplicate
 * diagnostic.
 */
export const ENTITY_KNOWN_PROPS: Readonly<Record<string, readonly string[]>> = {
    RoadmapDeclaration: ['author', 'start', 'length', 'scale', 'calendar', 'logo', 'logo-size'],
    AnchorDeclaration: ['date'],
    SwimlaneDeclaration: [
        'owner',
        'capacity',
        'utilization-warn-at',
        'utilization-over-at',
        'status',
        'after',
        'before',
    ],
    // An item has no `date:` or `start:`: it cannot be pinned to a fixed start
    // date (`specs/dsl.md` § Item Properties, "Pinning is not supported"), so
    // both keys draw the unknown-property warning with an `after:<date>` hint.
    ItemDeclaration: [
        'size',
        'duration',
        'status',
        'owner',
        'after',
        'before',
        'remaining',
        'capacity',
    ],
    // size/duration/remaining/capacity on parallel/group are already errors via
    // `checkNoComputedProperties`, so we don't list them here.
    ParallelBlock: ['owner', 'after', 'before', 'status'],
    GroupBlock: ['owner', 'after', 'before', 'status'],
    MilestoneDeclaration: ['date', 'after'],
    FootnoteDeclaration: ['on'],
    PersonDeclaration: [],
    TeamDeclaration: [],
    LabelDeclaration: [],
    SizeDeclaration: ['effort'],
    StatusDeclaration: [],
    // The other keys a wave takes are universal; the keys it may not take
    // are NL.E1105 (`isWaveBannedProperty`), owned by the wave rules.
    WaveDeclaration: ['after'],
};

/**
 * Allow-listed property keys on the `nowline` directive line. The directive
 * existed historically as `nowline v1` only; properties are a forward-
 * extension point but stay restrictive so authors get an early error instead
 * of typos rendering silently.
 */
export const DIRECTIVE_FIELDS: readonly string[] = ['locale'];

export { WEEKDAYS } from './calendar-declarations.js';
