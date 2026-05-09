// Stable error codes for validator messages. Codes never change once shipped:
// renumbering is a major-version concern. Adding a new code is always
// safe; deleting one means the rule was removed entirely.
//
// Code ranges are reserved by category to keep the table scannable:
//   NL.E0001–E0099  structural / file-level
//   NL.E0100–E0199  directive
//   NL.E0200–E0299  include
//   NL.E0300–E0399  identifier / id-or-title / indentation
//   NL.E0400–E0499  property values (duration, size, date, scale, etc.)
//   NL.E0500–E0599  anchor / milestone / footnote
//   NL.E0600–E0699  item / swimlane
//   NL.E0700–E0799  capacity / utilization
//   NL.E0800–E0899  style / color / symbol
//   NL.E0900–E0999  config blocks (calendar, scale, default)
//   NL.W0700–W0799  warnings (silently-ignored input)
//
// The full list of allocated codes lives in `messages.en.ts` (one entry
// per code). The runtime walks the locale fallback chain and falls
// through to en-US when a key is missing — see `i18n/index.ts`.

export type MessageCode =
    // Structural (NL.E0001–E0099)
    | 'NL.E0001' // config-after-roadmap
    | 'NL.E0002' // include-after-config
    | 'NL.E0003' // include-after-roadmap
    | 'NL.E0004' // swimlane-required
    | 'NL.E0005' // mixed-tabs-and-spaces

    // Directive (NL.E0100–E0199)
    | 'NL.E0100' // invalid-version-format
    | 'NL.E0101' // version-beyond-supported
    | 'NL.E0102' // unknown-directive-property
    | 'NL.E0103' // duplicate-directive-property
    | 'NL.E0104' // invalid-locale

    // Include (NL.E0200–E0299)
    | 'NL.E0200' // invalid-include-mode
    | 'NL.E0201' // duplicate-include-option

    // Identifier (NL.E0300–E0399)
    | 'NL.E0300' // duplicate-identifier
    | 'NL.E0301' // id-or-title-required

    // Property values (NL.E0400–E0499)
    | 'NL.E0400' // invalid-duration
    | 'NL.E0401' // invalid-size-ref
    | 'NL.E0402' // invalid-effort
    | 'NL.E0403' // invalid-remaining-percent
    | 'NL.E0404' // remaining-out-of-range
    | 'NL.E0405' // invalid-date
    | 'NL.E0406' // invalid-scale
    | 'NL.E0407' // invalid-calendar
    | 'NL.E0408' // empty-property-list

    // Anchor / milestone / footnote (NL.E0500–E0599)
    | 'NL.E0500' // anchor-requires-date
    | 'NL.E0501' // anchor-needs-roadmap-start
    | 'NL.E0502' // anchor-before-roadmap-start
    | 'NL.E0503' // milestone-requires-date-or-after
    | 'NL.E0504' // milestone-before-roadmap-start
    | 'NL.E0505' // footnote-requires-on

    // Item (NL.E0600–E0699)
    | 'NL.E0600' // item-requires-size-or-duration

    // Warnings (NL.W0700–W0799)
    | 'NL.W0700'; // unknown-entity-property

export const ALL_CODES: ReadonlyArray<MessageCode> = [
    'NL.E0001',
    'NL.E0002',
    'NL.E0003',
    'NL.E0004',
    'NL.E0005',
    'NL.E0100',
    'NL.E0101',
    'NL.E0102',
    'NL.E0103',
    'NL.E0104',
    'NL.E0200',
    'NL.E0201',
    'NL.E0300',
    'NL.E0301',
    'NL.E0400',
    'NL.E0401',
    'NL.E0402',
    'NL.E0403',
    'NL.E0404',
    'NL.E0405',
    'NL.E0406',
    'NL.E0407',
    'NL.E0408',
    'NL.E0500',
    'NL.E0501',
    'NL.E0502',
    'NL.E0503',
    'NL.E0504',
    'NL.E0505',
    'NL.E0600',
    'NL.W0700',
] as const;
