// Structured key vocabulary for the MCP `schema` discovery tool.
//
// This is the one place whose whole job is to give agents ACCURATE DSL
// keys so they stop hallucinating. Every key below is a real DSL token
// (verified against specs/dsl.md and the man page) — render/CLI options
// like `theme` or `now` are deliberately excluded because they are not
// part of the `.nowline` source language.

export const SCHEMA_VOCABULARY = {
    // Keys valid on the `nowline` directive line (`locale`) and the
    // `roadmap` declaration line. NOT render/CLI options (`theme`, `now`).
    directiveKeys: [
        'locale',
        'author',
        'start',
        'scale',
        'length',
        'calendar',
        'logo',
        'logo-size',
    ],
    // Roadmap-section keywords — the declarable entity types.
    entityTypes: [
        'swimlane',
        'item',
        'parallel',
        'group',
        'person',
        'team',
        'anchor',
        'label',
        'size',
        'status',
        'milestone',
        'footnote',
    ],
    // Properties valid on `item` declarations: item-specific keys plus the
    // universal properties (`labels`, `link`, `style`, `description`).
    // Visual treatment is a single `style:` reference — raw color/style
    // props (`bg`, `fg`, `text`, ...) live in `style`/`default` config blocks.
    itemPropertyKeys: [
        'status',
        'owner',
        'after',
        'before',
        'size',
        'duration',
        'remaining',
        'capacity',
        'labels',
        'link',
        'style',
        'description',
    ],
} as const;
