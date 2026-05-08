// English message bundle. The root locale — every key here MUST exist
// (CI enforces this in `messages-coverage.test.ts`). Other locales may
// omit keys; the loader falls through to en-US for any missing entry.
//
// Each entry is a plain function taking strongly-typed args. This keeps
// translation reviewable (no positional `{0}` / `{1}` indirection) and
// gives every placeholder a name. Authors translating to fr only have
// to swap the function body — the signature stays identical.
//
// We deliberately do NOT use `satisfies Record<MessageCode, ...>` here:
// the type of each entry is what `MessageArgs<K>` (in `index.ts`) reads
// to type-check call sites. A `satisfies` constraint would widen each
// entry to a uniform `(...args: never[]) => string` signature and break
// per-code argument inference. Coverage of `MessageCode` is enforced by
// the runtime test in `test/i18n/messages-coverage.test.ts`.

export const messages = {
    // Structural
    'NL.E0001': () =>
        'Config section must appear before roadmap.',
    'NL.E0002': () =>
        'Include declarations must appear before the config section.',
    'NL.E0003': () =>
        'Include declarations must appear before the roadmap section.',
    'NL.E0004': () =>
        'At least one swimlane is required.',
    'NL.E0005': (a: { line: number }) =>
        `Line ${a.line}: mixed tabs and spaces in indentation. Use either tabs or spaces consistently.`,

    // Directive
    'NL.E0100': (a: { version: string }) =>
        `Invalid version format "${a.version}". Expected format: v1, v2, etc.`,
    'NL.E0101': (a: { version: string; supported: string }) =>
        `This file requires Nowline ${a.version}, but the parser only supports up to ${a.supported}.`,
    'NL.E0102': (a: { key: string; allowed: string }) =>
        `Unknown directive property "${a.key}". Allowed: ${a.allowed}.`,
    'NL.E0103': (a: { key: string }) =>
        `Duplicate directive property "${a.key}".`,
    'NL.E0104': (a: { value: string }) =>
        `Invalid locale "${a.value}". Use a BCP-47 tag like "en-US", "fr", or "fr-CA".`,

    // Include
    'NL.E0200': (a: { value: string }) =>
        `Invalid include mode "${a.value}". Must be merge, ignore, or isolate.`,
    'NL.E0201': (a: { key: string }) =>
        `Duplicate "${a.key}" option on include.`,

    // Identifier
    'NL.E0300': (a: { name: string; location: string }) =>
        `Duplicate identifier "${a.name}". First declared at ${a.location}.`,
    'NL.E0301': (a: { type: string }) =>
        `${a.type} must have an identifier, a title, or both.`,

    // Property values
    'NL.E0400': (a: { value: string }) =>
        `Invalid duration "${a.value}". Use a raw duration literal like 0.5d, 2w, 1m, 2q. Use "size:NAME" to reference a declared size.`,
    'NL.E0401': (a: { value: string }) =>
        `Invalid size "${a.value}". Use the id of a declared size (e.g. xs, m, lg).`,
    'NL.E0402': (a: { value: string }) =>
        `Invalid effort "${a.value}". Use a raw duration literal like 0.5d, 2w, 1m, 2q.`,
    'NL.E0403': (a: { value: string }) =>
        `Invalid remaining value "${a.value}". Use a percentage like 30% or a duration literal like 1w, 0.5d.`,
    'NL.E0404': (a: { value: string }) =>
        `Remaining must be between 0% and 100%, got ${a.value}.`,
    'NL.E0405': (a: { key: string; value: string }) =>
        `Invalid ${a.key} "${a.value}". Use ISO 8601 format: YYYY-MM-DD.`,
    'NL.E0406': (a: { value: string }) =>
        `Invalid scale "${a.value}". Use a raw duration literal like 1w, 2w, 1q (no name lookup).`,
    'NL.E0407': (a: { value: string }) =>
        `Invalid calendar "${a.value}". Must be business, full, or custom.`,
    'NL.E0408': (a: { key: string }) =>
        `Property "${a.key}" requires at least one reference.`,

    // Anchor / milestone / footnote
    'NL.E0500': (a: { name: string }) =>
        `Anchor "${a.name}" requires a "date:" property.`,
    'NL.E0501': (a: { name: string }) =>
        `Anchor "${a.name}" has a date but the roadmap is missing "start:". Add start:YYYY-MM-DD to the roadmap.`,
    'NL.E0502': (a: { name: string; date: string; start: string }) =>
        `Anchor "${a.name}" date ${a.date} is before roadmap start ${a.start}.`,
    'NL.E0503': (a: { name: string }) =>
        `Milestone "${a.name}" requires at least one of "date:" or "after:".`,
    'NL.E0504': (a: { name: string; date: string; start: string }) =>
        `Milestone "${a.name}" date ${a.date} is before roadmap start ${a.start}.`,
    'NL.E0505': () =>
        'Footnote requires an "on:" property referencing one or more entities.',

    // Item
    'NL.E0600': (a: { name: string }) =>
        `Item "${a.name}" requires a "size:" or "duration:" property.`,
};
