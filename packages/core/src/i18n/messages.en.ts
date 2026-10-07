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

import type {
    E0202Args,
    E1100Args,
    E1101Args,
    E1102Args,
    E1103Args,
    E1104Args,
    E1105Args,
    E1106Args,
    FlowRef,
    I1006Args,
    I1007Args,
    I1008Args,
    W0701Args,
    W0702Args,
    W1001Args,
    W1002Args,
    W1100Args,
    W1101Args,
    WaveContainerKind,
    WaveKind,
    WaveSuggestion,
} from './wave-message-types.js';

// Kind descriptors for wave messages arrive as structured values and are
// rendered here (with an article) so other bundles can translate the noun.
const KIND_WITH_ARTICLE: Record<WaveKind, string> = {
    item: 'an item',
    group: 'a group',
    parallel: 'a parallel block',
    swimlane: 'a swimlane',
    anchor: 'an anchor',
    milestone: 'a milestone',
    'floating-milestone': 'a milestone without a date',
    wave: 'a wave',
    label: 'a label',
    size: 'a size',
    status: 'a status',
    person: 'a person',
    team: 'a team',
    footnote: 'a footnote',
    roadmap: 'the roadmap',
    style: 'a style',
    symbol: 'a symbol',
};

const KIND_NOUN: Record<WaveKind, string> = {
    item: 'item',
    group: 'group',
    parallel: 'parallel block',
    swimlane: 'swimlane',
    anchor: 'anchor',
    milestone: 'milestone',
    'floating-milestone': 'milestone',
    wave: 'wave',
    label: 'label',
    size: 'size',
    status: 'status',
    person: 'person',
    team: 'team',
    footnote: 'footnote',
    roadmap: 'roadmap',
    style: 'style',
    symbol: 'symbol',
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// A flow (swimlane, group, parallel) by name, or by position when unnamed.
function flowText(f: FlowRef): string {
    if (f.kind === 'parallel-block') return `the parallel block on line ${f.line}`;
    if (f.kind === 'group-block') return `the group on line ${f.line}`;
    return `${f.kind} "${f.name}"`;
}

// The entity a W1100/W1101 is on: `"name"`, or by position when it is an
// unnamed group or parallel.
function ownerText(a: { name: string; kind?: WaveContainerKind; line?: number }): string {
    if (a.name || a.line === undefined) return `"${a.name}"`;
    return flowText({
        kind: a.kind === 'parallel' ? 'parallel-block' : 'group-block',
        line: a.line,
    });
}

// An entity or container that may be unnamed, identified by line then.
function entityText(
    e: {
        kind: 'item' | 'group' | 'parallel';
        name: string;
        line?: number;
    },
    withArticle = true,
): string {
    if (e.name) return `${e.kind} "${e.name}"`;
    const noun = e.kind === 'parallel' ? 'parallel block' : e.kind;
    const the = withArticle ? 'the ' : '';
    return e.line === undefined ? `${the}${noun}` : `${the}${noun} on line ${e.line}`;
}

// Sentence subject for a container that may be unnamed: `Group "g"` or
// `The group on line 4`.
function containerSubject(c: { kind: WaveContainerKind; name: string; line?: number }): string {
    return c.name ? `${capitalize(c.kind)} "${c.name}"` : capitalize(entityText(c));
}

function floorClause(floor: string | null): string {
    return floor === null ? 'has no start floor' : `opens no earlier than ${floor}`;
}

function suggestionText(s: WaveSuggestion | undefined): string {
    if (!s) return '';
    return s.title === undefined
        ? ` Did you mean wave:${s.id}?`
        : ` Did you mean wave:${s.id} ("${s.title}")?`;
}

// Up to five quoted names, then "and N more".
function namesText(names: string[]): string {
    const shown = names.slice(0, 5).map((n) => `"${n}"`);
    const rest = names.length - shown.length;
    return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
}

function waveListText(ids: string[]): string {
    return `[${ids.join(', ')}]`;
}

export const messages = {
    // Structural
    'NL.E0001': () => 'Config section must appear before roadmap.',
    'NL.E0002': () => 'Include declarations must appear before the config section.',
    'NL.E0003': () => 'Include declarations must appear before the roadmap section.',
    'NL.E0004': () => 'At least one swimlane is required.',
    'NL.E0005': (a: { line: number }) =>
        `Line ${a.line}: mixed tabs and spaces in indentation. Use either tabs or spaces consistently.`,

    // Directive
    'NL.E0100': (a: { version: string }) =>
        `Invalid version format "${a.version}". Expected format: v1, v2, etc.`,
    'NL.E0101': (a: { version: string; supported: string }) =>
        `This file requires Nowline ${a.version}, but the parser only supports up to ${a.supported}.`,
    'NL.E0102': (a: { key: string; allowed: string }) =>
        `Unknown directive property "${a.key}". Allowed: ${a.allowed}.`,
    'NL.E0103': (a: { key: string }) => `Duplicate directive property "${a.key}".`,
    'NL.E0104': (a: { value: string }) =>
        `Invalid locale "${a.value}". Use a BCP-47 tag like "en-US", "fr", or "fr-CA".`,

    // Include
    'NL.E0200': (a: { value: string }) =>
        `Invalid include mode "${a.value}". Must be merge, ignore, or isolate.`,
    'NL.E0201': (a: { key: string }) => `Duplicate "${a.key}" option on include.`,
    'NL.E0202': (a: E0202Args) => {
        switch (a.reason) {
            case 'mismatch':
                return `Included "${a.path}" declares waves ${waveListText(a.child)}, but this file's waves are ${waveListText(a.parent)}. Every included roadmap must declare the same waves in the same order: copy this file's wave lines into "${a.path}".`;
            case 'child-none':
                return `Included "${a.path}" declares no waves, but this file's waves are ${waveListText(a.parent)}. Copy this file's wave lines into "${a.path}" so its work joins the waves.`;
            case 'parent-none':
                return `Included "${a.path}" declares waves ${waveListText(a.child)}, but this file declares none. Declare the same waves here so the barriers apply to the whole roadmap.`;
            case 'floor':
                return `Wave "${a.id}" in "${a.path}" ${floorClause(a.childFloor)}, but this file's wave "${a.id}" ${floorClause(a.parentFloor)}. A wave must have the same start floor in every included roadmap.`;
        }
    },

    // Identifier
    'NL.E0300': (a: { name: string; location: string }) =>
        `Duplicate identifier "${a.name}". First declared at ${a.location}.`,
    'NL.E0301': (a: { type: string }) => `${a.type} must have an identifier, a title, or both.`,

    // Property values
    'NL.E0400': (a: { value: string }) =>
        `Invalid duration "${a.value}". Use a raw duration literal like 0.5d, 2w, 1m, 2q. Use "size:NAME" to reference a declared size.`,
    'NL.E0401': (a: { value: string }) =>
        `Invalid size "${a.value}". Use the id of a declared size (e.g. xs, m, lg).`,
    'NL.E0402': (a: { value: string }) =>
        `Invalid effort "${a.value}". Use a raw duration literal like 0.5d, 2w, 1m, 2q.`,
    'NL.E0403': (a: { value: string }) =>
        `Invalid remaining value "${a.value}". Use a percentage like 30% or a duration literal like 1w, 0.5d.`,
    'NL.E0404': (a: { value: string }) => `Remaining must be between 0% and 100%, got ${a.value}.`,
    'NL.E0405': (a: { key: string; value: string }) =>
        `Invalid ${a.key} "${a.value}". Use ISO 8601 format: YYYY-MM-DD.`,
    'NL.E0406': (a: { value: string }) =>
        `Invalid scale "${a.value}". Use a raw duration literal like 1w, 2w, 1q (no name lookup).`,
    'NL.E0407': (a: { value: string }) =>
        `Invalid calendar "${a.value}". Must be business, full, or custom.`,
    'NL.E0408': (a: { key: string }) => `Property "${a.key}" requires at least one reference.`,
    'NL.E0410': (a: { key: string }) =>
        `"${a.key}:" accepts at most one inline date per direction; collapse the multiple dates to a single binding date or use a declared anchor.`,
    'NL.E0411': (a: { key: string; type: string }) =>
        `Inline date in "${a.key}:" is not allowed on ${a.type}. Allowed only on item, parallel, and group, and on a wave's after:; for a milestone use "date:" instead.`,
    'NL.E0412': (a: { key: string; date: string }) =>
        `Inline date "${a.date}" in "${a.key}:" requires the roadmap to declare "start:". Add start:YYYY-MM-DD to the roadmap.`,
    'NL.E0413': (a: { key: string; date: string; start: string }) =>
        `Inline date "${a.date}" in "${a.key}:" is before roadmap start ${a.start}.`,

    // Anchor / milestone / footnote
    'NL.E0500': (a: { name: string }) => `Anchor "${a.name}" requires a "date:" property.`,
    'NL.E0501': (a: { name: string }) =>
        `Anchor "${a.name}" has a date but the roadmap is missing "start:". Add start:YYYY-MM-DD to the roadmap.`,
    'NL.E0502': (a: { name: string; date: string; start: string }) =>
        `Anchor "${a.name}" date ${a.date} is before roadmap start ${a.start}.`,
    'NL.E0503': (a: { name: string }) =>
        `Milestone "${a.name}" requires at least one of "date:" or "after:".`,
    'NL.E0504': (a: { name: string; date: string; start: string }) =>
        `Milestone "${a.name}" date ${a.date} is before roadmap start ${a.start}.`,
    'NL.E0505': () => 'Footnote requires an "on:" property referencing one or more entities.',

    // Item
    'NL.E0600': (a: { name: string }) =>
        `Item "${a.name}" requires a "size:" or "duration:" property.`,

    // Style
    'NL.E0800': (a: { value: string }) =>
        `Invalid non-working value "${a.value}". Use hide or show.`,
    'NL.E0801': (a: { value: string; key: string }) =>
        `Invalid color "${a.value}" for "${a.key}". Use a named color, hex value, or "none".`,
    'NL.E0802': (a: { value: string; key: string; allowed: string }) =>
        `Invalid value "${a.value}" for "${a.key}". Allowed: ${a.allowed}.`,
    'NL.E0803': (a: { key: string }) => `Unknown style property "${a.key}".`,
    'NL.E0804': (a: { key: string; entity: string }) =>
        `Raw style property "${a.key}" is not allowed on ${a.entity}. ` +
        `Declare a named style in config and reference it via "style:id".`,
    'NL.E0805': (a: { name: string; builtins: string }) =>
        `Symbol id "${a.name}" collides with a built-in icon name. Reserved built-ins: ${a.builtins}.`,
    'NL.E0806': (a: { name: string }) =>
        `Symbol "${a.name}" requires a "unicode:" property (e.g. unicode:"💰" or unicode:"\\u{1F464}").`,
    'NL.E0807': (a: { name: string }) => `Symbol "${a.name}" unicode: must be a non-empty value.`,
    'NL.E0808': (a: { name: string; length: number }) =>
        `Symbol "${a.name}" ascii: must be 1-3 ASCII characters (got ${a.length} character${a.length === 1 ? '' : 's'}).`,
    'NL.E0809': (a: { key: string }) =>
        `Unknown symbol property "${a.key}". Allowed: unicode, ascii, link, description.`,
    'NL.E0810': (a: { name: string; location: string }) =>
        `Duplicate symbol id "${a.name}". First declared at ${a.location}.`,
    'NL.E0811': (a: { key: string; value: string; builtins: string }) =>
        `${a.key}: "${a.value}" is neither a built-in (${a.builtins}) nor a declared symbol. Add "symbol ${a.value} unicode:..." earlier in config or use a quoted Unicode literal.`,
    'NL.E0812': (a: { key: string; value: string }) =>
        `${a.key}: symbol "${a.value}" is referenced before its declaration. Move "symbol ${a.value}" above this entry.`,

    // Warnings
    'NL.W0700': (a: { key: string; entity: string; suggested: string }) =>
        `Unknown property "${a.key}" on ${a.entity}. The renderer ignores it.${
            a.suggested ? ` Did you mean "${a.suggested}"?` : ''
        }`,

    'NL.W0701': (a: W0701Args) =>
        `Wave "${a.id}" in "${a.path}" differs from this file's definition (${a.fields
            .map(
                (f) =>
                    `${f.field} ${f.there === '' ? 'none' : `"${f.there}"`} there, ${f.here === '' ? 'none' : `"${f.here}"`} here`,
            )
            .join('; ')}); this file's definition is used.`,
    'NL.W0702': (a: W0702Args) =>
        `"wave:" on ${
            a.target.kind === 'default'
                ? `"default ${a.target.entityType}"`
                : !a.target.name && a.target.line !== undefined
                  ? `the ${a.target.kind === 'parallel' ? 'parallel block' : a.target.kind} on line ${a.target.line}`
                  : `${a.target.kind} "${a.target.name}"`
        } is ignored: this roadmap declares no waves. Declare waves with "wave <id>" to use it, or remove the property.`,
    'NL.W0703': (a: { key: string; entityType: string }) =>
        `"${a.key}" on "default ${a.entityType}" is ignored: it is a roadmap-only style key. Set it on "default roadmap" instead.`,

    // Waves
    'NL.E1100': (a: E1100Args) =>
        `Wave ${
            a.title === undefined ? `on line ${a.line}` : `"${a.title}"`
        } needs an explicit identifier so work can reference it with wave:<id>, e.g. wave build "Build".`,
    'NL.E1101': (a: E1101Args) => {
        switch (a.reason) {
            case 'list':
                return `"wave:" takes exactly one wave id; an item belongs to at most one wave. Got "${a.value}".`;
            case 'unknown':
                return `Wave "${a.value}" is not declared. Declared waves: ${
                    a.declared.length > 0 ? a.declared.join(', ') : 'none'
                }. Add "wave ${a.value}" above the first swimlane that uses it.${suggestionText(a.suggestion)}`;
            case 'forward':
                return `Wave "${a.value}" is used before its declaration on line ${a.line}. Declare waves above the swimlanes that use them.`;
            case 'not-a-wave':
                return `"wave:" must name a wave, but "${a.value}" is ${KIND_WITH_ARTICLE[a.kind]}.${suggestionText(a.suggestion)}`;
        }
    },
    'NL.E1102': (a: E1102Args) =>
        `${capitalize(entityText(a.entity))} has wave:${a.wave}, but its enclosing ${entityText(a.container, false)} has wave:${a.containerWave}. A container's wave applies to everything inside it; remove one of the two wave: properties.`,
    'NL.E1103': (a: E1103Args) => {
        switch (a.reason) {
            case 'sequence': {
                const many = a.items.length > 1;
                const items = `${many ? 'Items' : 'Item'} ${a.items.map((n) => `"${n}"`).join(', ')} (wave "${a.itemWave}")`;
                const ref = typeof a.ref === 'string' ? `"${a.ref}"` : flowText(a.ref);
                return `${items} ${many ? 'come' : 'comes'} after ${ref} (wave "${a.refWave}") in ${flowText(a.flow)}. Work in a lane or group runs in order, so it must also be ordered by wave: move ${ref} below "${a.last}", or change their waves.`;
            }
            case 'join':
                return `Item "${a.name}" (wave "${a.wave}") comes after ${flowText(a.block)} in ${flowText(a.flow)}, and that block cannot end before its track "${a.track}" (wave "${a.trackWave}") does. Move "${a.name}" above the block or into a track of its own, or change one of their waves.`;
            case 'after-item':
                return a.container
                    ? `${containerSubject(a.container)} has after:${a.refId}, but "${a.ref}" is in later wave "${a.refWave}". Wave "${a.refWave}" cannot start until wave "${a.wave}" ends, so "${a.name}" (wave "${a.wave}") inside it could never start: move "${a.name}" to wave "${a.refWave}" or later, or remove the after:.`
                    : `Item "${a.name}" (wave "${a.wave}") has after:${a.refId}, but "${a.ref}" is in later wave "${a.refWave}". Wave "${a.refWave}" cannot start until wave "${a.wave}" ends, so "${a.name}" could never start: move it to wave "${a.refWave}" or later, or remove the after:.`;
            case 'after-wave':
                return a.container
                    ? `${containerSubject(a.container)} (wave "${a.wave}") has after:${a.refId}, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move the ${a.container.kind} to a later wave.`
                    : `Item "${a.name}" (wave "${a.wave}") has after:${a.refId}, but work cannot wait for the end of its own wave or a later one. Use an earlier wave, or move "${a.name}" to a later wave.`;
            case 'chain':
                return `Item "${a.name}" (wave "${a.wave}") could never start: through ${a.chain.join(' → ')}, it waits for work that cannot start until wave "${a.wave}" has ended. Move "${a.name}" to a later wave, or break the chain.`;
        }
    },
    'NL.E1104': (a: E1104Args) => {
        switch (a.reason) {
            case 'swimlane':
                return `"wave:" is not allowed on swimlane "${a.name}": a swimlane spans every wave. Put wave: on its items, or wrap them in "group wave:${a.value}".`;
            case 'milestone':
                return `"wave:" is not allowed on milestone "${a.name}". To place a milestone at the end of a wave, use after:${a.value}.`;
            case 'other':
                return `"wave:" is not allowed on ${KIND_NOUN[a.type]} "${a.name}"; only item, group, and parallel can belong to a wave.`;
        }
    },
    'NL.E1105': (a: E1105Args) =>
        a.reason === 'before'
            ? `"before:" is not allowed on wave "${a.name}". A wave's end comes from its items; to give a wave a deadline, add a dated milestone: milestone ${a.name}-due date:<YYYY-MM-DD> after:${a.name}.`
            : `"${a.key}:" is not allowed on wave "${a.name}". A wave's span comes from its items; only after: (an anchor, a dated milestone, or one ISO date) can hold back a wave's start.`,
    'NL.E1106': (a: E1106Args) =>
        `Wave "${a.name}" has after:${a.ref}, but "${a.ref}" is ${KIND_WITH_ARTICLE[a.kind]}. A wave's after: accepts only anchors, dated milestones, or one ISO date; to make a wave wait for work, put that work in an earlier wave.`,

    // Layout warnings
    'NL.W1000': (a: { date: string; start: string; end: string }) =>
        `Now-line date ${a.date} is outside the roadmap window (${a.start} – ${a.end}); it will not be drawn.`,

    'NL.W1001': (a: W1001Args) =>
        `Item "${a.name}" is pinned to ${a.pin} (${a.key}:), but wave "${a.wave}" cannot start until ${a.start}; the item starts at the wave start.`,
    'NL.W1002': (a: W1002Args) =>
        `Wave barriers did not settle after ${a.passes} layout passes, so the drawn schedule may not respect the wave order. The roadmap probably has an ordering conflict that validation did not catch.`,

    // Wave warnings
    'NL.W1100': (a: W1100Args) => {
        const owner = ownerText(a);
        return a.reason === 'item'
            ? `before:${a.ref} on ${owner} can never be met: ${owner} is in wave "${a.wave}", which cannot start until "${a.ref}" (wave "${a.refWave}") has finished. The overrun will be painted.`
            : `before:${a.ref} on ${owner} can never be met: ${owner} is in wave "${a.wave}", which cannot finish before wave "${a.ref}" starts. The overrun will be painted.`;
    },
    'NL.W1101': (a: W1101Args) => {
        const owner = ownerText(a);
        switch (a.reason) {
            case 'forward-lane':
                return `${a.key}:${a.ref} on ${owner} refers to "${a.ref}", which is in a later swimlane ("${a.lane}"). Layout places swimlanes in order and ignores references to work it has not placed yet, so it ignores this ${a.key}:. Move swimlane "${a.lane}" above swimlane "${a.ownLane}", or remove the ${a.key}:.`;
            case 'forward-flow':
                return `${a.key}:${a.ref} on ${owner} refers to "${a.ref}", which comes later in ${flowText(a.flow)}. Layout ignores references to work it has not placed yet, so it ignores this ${a.key}:. Move "${a.ref}" above ${owner}, or remove the ${a.key}:.`;
            case 'ancestor':
                return `${a.key}:${a.ref} on ${owner} refers to "${a.ref}", which contains it. Layout ignores references to an enclosing group or parallel, so it ignores this ${a.key}:. Remove the ${a.key}:.`;
            case 'floating-milestone':
                return `${a.key}:${a.ref} on ${owner} refers to milestone "${a.ref}", which has no date. Floating milestones are placed after all work, so layout ignores this ${a.key}:. Reference the milestone's predecessors or a wave instead.`;
        }
    },

    // Layout insights (informational)
    'NL.I1000': (a: { name: string }) =>
        `Title on item "${a.name}" is wider than its bar at this scale; it rendered to the right of the bar.`,
    'NL.I1001': (a: { name: string }) =>
        `Label chips on item "${a.name}" did not fit inside the bar; they rendered in a spill column to the right.`,
    'NL.I1002': (a: { name: string }) =>
        `Item "${a.name}" is too narrow to show its marker at this scale; decorations spilled beside the bar.`,
    'NL.I1003': (a: { name: string; anchor?: string }) =>
        a.anchor
            ? `Item "${a.name}" extends past its "before:" anchor "${a.anchor}".`
            : `Item "${a.name}" extends past its "before:" anchor.`,
    'NL.I1004': (a: { lane: string; rows: number }) =>
        `Swimlane "${a.lane}" packed into ${a.rows} rows to avoid overlap.`,
    'NL.I1005': (a: { lane: string }) =>
        `Swimlane "${a.lane}" is over capacity in one or more periods (red utilization band).`,
    'NL.I1006': (a: I1006Args) => {
        switch (a.reason) {
            case 'one':
                return `Wave "${a.name}" has no items, so it spans no time; it is drawn as a marker in the wave strip and listed in the wave legend.`;
            case 'many':
                return `Waves ${namesText(a.names)} have no items, so they span no time; they are drawn as markers in the wave strip and listed in the wave legend.`;
            case 'all':
                return `None of the declared waves (${namesText(a.names)}) has items yet. The wave strip shows a placeholder until work is assigned with wave:<id>.`;
        }
    },
    'NL.I1007': (a: I1007Args) =>
        `Milestone "${a.name}" (${a.date}) is overrun: wave "${a.wave}" ends ${a.end}.`,
    'NL.I1008': (a: I1008Args) =>
        `Item "${a.name}" is pinned to ${a.pin} (${a.key}:), a non-working day; it starts on ${a.start}.`,
};
