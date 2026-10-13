# Nowline — Core AST, Style and Calendar Utilities

**Status: Accepted (design only, no code yet).** Milestone **m4.12** in [`milestones.md`](./milestones.md); decisions in the last section. This is refactor R3 from [`review-since-v086.md`](./review-since-v086.md): a small utility layer in `@nowline/core` so that the content walk, the style precedence chain, the calendar-declaration classifier and the property helpers each live once. Every `file:line` below was checked at the commit that adds this spec (source identical to 0062df3 plus the m2 fixes of the same review).

## 1. Problem

### 1.1 The content walk is written about ten times

A roadmap's declarations form a fixed tree (`packages/core/src/language/nowline.langium:83-175`): roadmap entries; swimlane, group and parallel content (items, groups, parallels, with `description` lines to skip); teams nested in teams. Each consumer re-implements the descent:

| Copy | Location | What it collects |
|---|---|---|
| `registerEntity` + `registerTeam` + `registerSwimlaneContent` | `nowline-validator.ts:2454-2514` | every explicit id, for rule 2 (`:708`) and the include resolver's WV2 |
| `visitPropertiesDeep` | `nowline-validator.ts:2516-2533` | every property under an entry (`:1640`, `:1697`) |
| `collectReferenceableIds` | `nowline-validator.ts:2535-2558` | ids `after:` / `before:` / `on:` may name (`:1694`) |
| rule 24 inline-date walk | `nowline-validator.ts:1795-1801` | entries and track content |
| rule 25 dependency walk | `nowline-validator.ts:1858-1864` | entries and track content |
| person / team walk | `nowline-validator.ts:1926-1935` | persons in teams |
| `collectDeclarations` | `waves.ts:344-360` | first declaration of each id ("mirroring the validator's `collectReferenceableIds`", `:343`) |
| `collectWaveHosts` | `waves.ts:530-551` | every node a `wave:` key can sit on |
| `assignWaves`, `leadWave` | `waves.ts:241-326` | track content with inheritance |
| wave-order slots | `waves-order.ts:212-256` | track content in layout order |
| `collectNamedEntities`, `visitProperties` | `packages/lsp/src/references/ast-utils.ts:186-237`, `:254-274` | LSP navigation ("mirrors the validator's `collectReferenceableIds`", `:181`) |
| document symbols | `packages/lsp/src/providers/document-symbols.ts:109-145` | the outline tree |
| `collectItems` | `packages/layout/src/layout.ts:1880-1911` | every item, for dependency edges |

The copies agree today by care, not by construction. They already differ in small ways: the validator's `visitPropertiesDeep` and `collectReferenceableIds` look for a `PersonDeclaration` inside a team (`:2528`, `:2548`), which the grammar does not allow (`TeamContent` is `DescriptionDirective | PersonMemberRef | TeamDeclaration`, `nowline.langium:109-110`); `registerTeam` does not look. A new container keyword (the next feature like `group` or `parallel`) would have to be added to every one.

### 1.2 Core's include resolver depends on the validator

`include-resolver.ts` imports `include-waves.ts` (`include-resolver.ts:47-52`), which imports `registerEntity` from the 2,558-line validator (`include-waves.ts:30`). So resolving includes loads every validation rule, and the validator cannot import anything from the resolver without a cycle. The edge exists only because the id walk lives in the validator.

### 1.3 The style precedence chain lives twice

[`rendering.md`](./rendering.md) § Style Precedence defines five levels: theme default, `default <entity>` (its `style:` then its own keys), label styles (first label wins), the entity's `style:`, inline keys. Layout implements it in `resolveStyle` (`packages/layout/src/style-resolution.ts:178-242`, label walk at `:178-196`). NL.W0704 re-implements the same chain to decide whether `header-height:none` and `timeline-position:bottom|both` end up together (`nowline-validator.ts:1455-1517`; the comment at `:1455-1460` says it "walks the roadmap's style chain the way @nowline/layout's resolveStyle does"). When #109 changed label precedence, both had to change.

### 1.4 Calendar declarations are classified three times

A `non-working` or `working` declaration is a dated list, a range, or a weekly recurrence (bounded or not), and is usable only when its dates are real days and its weekdays known ([`working-calendar.md`](./working-calendar.md) §4.1):

| Copy | Location | Answers |
|---|---|---|
| validator | `nowline-validator.ts:2325-2439` (`calendarOwnProps`, `hasCalendarShape`, `isWellFormedCalendarDeclaration`, `isOpenEndedRecurrence`, `isHalfBoundedRecurrence`, `weekdaysOf`, its own `WEEKDAY_INDEX`) | is it well formed, what week does it make (NW3/NW4 at `:2106-2173`) |
| layout | `packages/layout/src/calendar-resolver.ts:105-135` (`declarationRule`, plus its own `WEEKDAY_INDEX` at `:70-78` and `realDate` at `:148-151`) | the `CalendarRule` it stands for |
| LSP hover | `packages/lsp/src/providers/hover.ts:136-149` (`undrawnTitleNote`) | dated, range or recurrence, bounded or not |

The validator's NW3/NW4 week (`:2131-2145`, "mirrors `resolveWorkingCalendar` in @nowline/layout", `:2104`) also re-derives the layout's preset-weekend rule (`calendar-resolver.ts:89-92`).

### 1.5 Small helpers and tables are copied across packages

The value converter strips the trailing `:` from every property key at parse time (`packages/core/src/language/nowline-module.ts:32-43`), yet the strip is re-implemented twelve times:

| Helper | Copies |
|---|---|
| `stripColon` / `propKey` | `core/src/language/validator-utils.ts:11-13`, `core/src/convert/printer.ts:325-327` (`normalizeKey`), `layout/src/dsl-utils.ts:10-12`, `layout/src/view-preset.ts:60-62`, `layout/src/nodes/roadmap-node.ts:1323-1325`, `layout/src/nodes/wave-node.ts:301`, `layout/src/capacity.ts:113-115`, `layout/src/calendar.ts:191-193`, `layout/src/calendar-resolver.ts:153-155`, `layout/src/style-resolution.ts:35-37`, `lsp/src/references/ast-utils.ts:131-133`, `cli/src/i18n/locale.ts:107-109` |
| `DATE_RE` (`/^\d{4}-\d{2}-\d{2}$/`) | `core/src/language/validator-utils.ts:9`, `core/src/language/include-resolver.ts:58`, `core/src/convert/printer.ts:330`, `export-msproj/src/index.ts:419` and inline at `:606`, inline in `export-mermaid/src/index.ts:443` and `layout/src/inline-date-pin-geometry.ts:228`, with captures in `layout/src/dsl-utils.ts:26` and `layout/src/resolve-today.ts:149` |
| value tables | `BUILTIN_STATUSES` (`nowline-validator.ts:93`, `ast-utils.ts:88`), `BUILTIN_CAPACITY_ICONS` (`:146`, `ast-utils.ts:103`), `BUILTIN_ICON_NAMES` (`:159`, `ast-utils.ts:116`), weekdays (`:2329`, `calendar-resolver.ts:70`, `ast-utils.ts:125`), non-working displays (`:130`, `layout/src/non-working-display.ts:13`, `ast-utils.ts:128`) |

The LSP copies say why they exist: "kept as a literal here so the LSP doesn't have to import a non-public symbol from `@nowline/core`" (`ast-utils.ts:99-101`); the validator's says core "cannot import" layout's list (`nowline-validator.ts:129`). The `calendar` icon missing from the LSP list until this review's m2.s4 is what that costs.

### 1.6 The validator is one 2,558-line file

`nowline-validator.ts` holds about 300 lines of tables (`:86-389`), the check registration (`:455-587`), one class of 46 checks (`:589-2255`) and the walk and calendar helpers above (`:2259-2558`). It grew from 2,138 to 2,558 lines since v0.8.6, mostly calendar and style checks added inline.

## 2. Goals and non-goals

**Goals**

1. One content walk in core (`ast-walk.ts`) used by the validator, the include resolver, the wave rules, layout and the LSP.
2. No import from the include resolver (or anything it loads) into the validator.
3. One style precedence chain in core, consumed by layout's `resolveStyle` and by NL.W0704.
4. One calendar-declaration classifier in core, consumed by the validator, layout's calendar resolver and LSP hover.
5. One `propKey` / `propValue` / `propValues`, one ISO date pattern and parser, and one copy of each value table, exported from core.
6. The validator split into per-feature modules behind the unchanged `NowlineValidator` and `registerValidationChecks` API.
7. Every step byte-identical in renders and in diagnostics.

**Non-goals**

- Changing any diagnostic's code, text, position or order, any validation rule, or the style precedence.
- Generating the TextMate grammar or LSP completion lists from the grammar (R6). This spec only makes the tables importable.
- Changing the AST, the grammar or the JSON schema.
- Moving the working calendar (`WorkingCalendar`) into core. Only the declaration classifier moves.
- Removing other exports from `@nowline/core`. Only `effectiveWave` and `leadWave` go (§7, decision 2).

## 3. Design

### 3.1 `ast-walk.ts`

A new `packages/core/src/language/ast-walk.ts` depends only on `../generated/ast.js`. It is exported from the `@nowline/core/internal` subpath (§7, decision 3).

```ts
/** A node that sits on a swimlane track. */
export type TrackNode = ItemDeclaration | GroupBlock | ParallelBlock;

/** Any declaration the walk visits. */
export type DeclarationNode =
    | RoadmapDeclaration
    | RoadmapEntry
    | TrackNode
    | TeamDeclaration
    | ConfigEntry;

export interface WalkOptions {
    /** Visit `roadmapDecl` first. Default false. */
    roadmap?: boolean;
    /** Visit `configEntries` before the roadmap. Default false. */
    config?: boolean;
}

/** A container's track children in source order, `description` lines skipped. */
export function trackChildren(node: SwimlaneDeclaration | GroupBlock | ParallelBlock): TrackNode[];

/** Every track node under `lanes`, pre-order, in source order. */
export function trackNodes(lanes: Iterable<SwimlaneDeclaration>): Generator<TrackNode>;

/**
 * Every declaration in the file, pre-order, in source order: optionally the
 * config entries and the roadmap line, then each roadmap entry followed by
 * its track content (swimlanes) or nested teams (teams).
 */
export function declarations(file: NowlineFile, options?: WalkOptions): Generator<DeclarationNode>;

/** Every property on `node` and on the declarations nested under it, with its owner. */
export function visitProperties(
    node: AstNode,
    visit: (prop: EntityProperty, owner: AstNode) => void,
): void;

/** Each explicit id a roadmap entry declares, in source order (rule 2, WV2). */
export function forEachDeclaredId(
    entry: RoadmapEntry,
    register: (name: string | undefined, node: AstNode) => void,
): void;

/** Ids `after:`, `before:` and `on:` can name: the roadmap's id plus every declared id. */
export function referenceableIds(file: NowlineFile): Set<string>;

/** Id to its first declaration (roadmap line and roadmap entries). */
export function firstDeclarations(file: NowlineFile): Map<string, AstNode>;
```

| Today | After |
|---|---|
| `registerEntity` (validator, imported by `include-waves.ts`) | `forEachDeclaredId` |
| `visitPropertiesDeep` (validator), `visitProperties` (LSP) | `visitProperties` |
| `collectReferenceableIds` (validator) | `referenceableIds` |
| `collectDeclarations` (`waves.ts`), the roadmap part of `buildEntityIndex` (LSP) | `firstDeclarations` |
| rule 24 / rule 25 / person walks, `collectWaveHosts`, `collectNamedEntities` | `declarations(file, …)` with a filter |
| `collectItems` (layout), the walkers of the wave rules and of `waves-order.ts` | `trackNodes` / `trackChildren` |

Walks that carry state down the tree (wave inheritance in `assignWaves`, slot numbering in `waves-order.ts`, the LSP outline's nesting) keep their own recursion and use `trackChildren` for the descent, so the rule for "what is a child" still lives once. The dead `PersonDeclaration`-in-team branches disappear, which changes nothing because the grammar cannot produce that shape.

### 3.2 The resolver no longer reaches the validator

`include-waves.ts` imports `forEachDeclaredId` from `ast-walk.ts`. The validator's `registerEntity` export is removed (it is not exported from `@nowline/core`'s index, so no package outside core sees it). The resulting graph inside `core/src/language`:

```
include-resolver ─▶ include-waves ─▶ waves, waves-order, validator-utils, ast-walk
nowline-validator ─▶ waves, waves-order, validator-utils, ast-walk, style-chain, calendar-declarations
nowline-module ─▶ nowline-validator
```

A layering test (`packages/core/test/layering.test.ts`) reads the `import` lines of every `src/language/*.ts` file and fails if anything other than `nowline-module.ts` and `src/index.ts` imports the validator, or if `ast-walk.ts`, `style-chain.ts` or `calendar-declarations.ts` import anything but generated AST types and each other.

### 3.3 `style-chain.ts`: the precedence chain in core

Core owns the order; layout owns what a key means (colours, size buckets, theme fallbacks).

```ts
export interface StyleSources {
    styles: ReadonlyMap<string, StyleDeclaration>;
    defaults: ReadonlyMap<string, DefaultDeclaration>;
    labels: ReadonlyMap<string, LabelDeclaration>;
}

/** One layer of rendering.md § Style Precedence levels 2-5, in application order. */
export type StyleLayer =
    | { level: 'default-style' | 'label-style' | 'entity-style'; id: string; decl: StyleDeclaration | undefined }
    | { level: 'label'; id: string; label: undefined }            // a label this file does not declare
    | { level: 'default' | 'inline'; props: readonly EntityProperty[] };

/**
 * Levels 2-5 for an entity of `entityType` with `props`: the `default`
 * line's `style:` then its own keys, each label's `style:` from last label to
 * first (so the first label wins), the entity's `style:`, its own keys. A
 * later layer wins a key. A `style:` or label that `sources` does not hold is
 * a layer with `decl` (or `label`) undefined, so a caller can tell "unset"
 * from "set somewhere it cannot see".
 */
export function styleLayers(
    entityType: string,
    props: readonly EntityProperty[],
    sources: StyleSources,
): StyleLayer[];
```

- **Layout.** `resolveStyle` (`style-resolution.ts:215-242`) becomes: theme default, then for each layer `applyStyleDecl` (style layers with a `decl`) or `applyProperties` (`default`, `inline`), skipping undefined ones. Its sources are `resolved.config.styles`, `defaults` and `content.labels`, as today.
- **NL.W0704.** `checkHiddenTimelineStrip` builds file-local sources (first declaration wins, as `:1465-1480` does today), walks `styleLayers('roadmap', …)`, stays silent at the first layer with an undefined `decl` or `label`, and otherwise reads the last `header-height` and `timeline-position`. The rule's text and position do not change.

### 3.4 `calendar-declarations.ts`: one classifier

```ts
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
/** UTC weekday number (Sunday is 0), the numbering of `CalendarRule.every`. */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>>;

export type CalendarShape =
    | 'dated'                       // date: alone
    | 'range'                       // start: + end:, no every:
    | 'open-recurrence'             // every: alone
    | 'half-bounded-recurrence'     // every: + exactly one of start: / end:
    | 'bounded-recurrence'          // every: + start: + end:
    | 'malformed';                  // any other combination

export interface CalendarDeclarationFacts {
    /** First occurrence of each of `date`, `start`, `end`, `every`; other keys are NL.E0901's. */
    own: ReadonlyMap<'date' | 'start' | 'end' | 'every', EntityProperty>;
    shape: CalendarShape;
    /** Real dates of `date:`, or undefined when any is not a real day. */
    dates?: string[];
    /** The single real date of `start:` / `end:`, or undefined. */
    start?: string;
    end?: string;
    /** Weekday numbers of `every:`, or undefined when any name is unknown. */
    weekdays?: number[];
    /** The resolver uses it: not malformed, every value real or known, and end not before start. */
    wellFormed: boolean;
}

export function classifyCalendarDeclaration(
    decl: NonWorkingDeclaration | WorkingDeclaration,
): CalendarDeclarationFacts;

/** A preset weekend applies unless a `non-working` declaration is named `weekend`. */
export function replacesPresetWeekend(
    declarations: ReadonlyArray<NonWorkingDeclaration | WorkingDeclaration>,
): boolean;
```

- **Validator.** `checkCalendarDeclaration` keeps choosing codes from the facts; NW3/NW4 (`:2106-2173`) read `wellFormed`, `shape` and `weekdays` and use `replacesPresetWeekend`. The local helpers at `:2325-2439` go.
- **Layout.** `declarationRule` (`calendar-resolver.ts:105-135`) maps facts to a `CalendarRule` (string dates to `Date`), and `calendarRules` uses `replacesPresetWeekend`. Its `WEEKDAY_INDEX`, `realDate` and `stripColon` go.
- **LSP hover.** `undrawnTitleNote` (`hover.ts:136-149`) reads `shape`: a titled `bounded-recurrence` or `half-bounded-recurrence` is not drawn.

The three copies agree on every shape the grammar can produce (a bracket list has at least one element, `nowline.langium:189-193`), so the switch changes no output; the facts are tested against each copy before the copies go (§5).

### 3.5 Property helpers, date pattern and value tables

A new `packages/core/src/util/props.ts`, exported from `@nowline/core/internal`:

```ts
/** `prop.key` without a trailing `:`. Keys from the parser never carry one; hand-built ASTs may. */
export function propKey(prop: { key: string }): string;
/** The first property with `key`, or undefined. */
export function findProp<P extends { key: string }>(props: readonly P[], key: string): P | undefined;
/** Its scalar value (layout's `propValue` semantics). */
export function propValue(props: readonly EntityProperty[], key: string): string | undefined;
/** Its scalar as a one-element list, or its bracket list (layout's `propValues` semantics). */
export function propValues(props: readonly EntityProperty[], key: string): string[];

/** `YYYY-MM-DD`. */
export const ISO_DATE_RE: RegExp;
/** UTC midnight of `YYYY-MM-DD` that names a real calendar day, or null (`02-30` is null; no roll-over). */
export function parseIsoDate(raw: string | undefined): Date | null;
/** `YYYY-MM-DD` that names a real calendar day (the validator's strict check). */
export function isRealIsoDate(raw: string): boolean;
```

and a `packages/core/src/language/value-tables.ts` with `BUILTIN_STATUSES`, `BUILTIN_CAPACITY_ICONS`, `BUILTIN_ICON_NAMES` and `NON_WORKING_DISPLAYS` (plus `WEEKDAYS` from §3.4). Layout re-exports `NON_WORKING_DISPLAYS` from core, so `@nowline/layout`'s public export and the MCP and browser code that import it are unchanged.

- Every listed copy (§1.5) imports these instead. Each keeps its current semantics; where two copies differ (`export-core`'s `getProp` returns the first list element, layout's `propValue` does not), the caller keeps its own function. `export-core`'s `getProp`, `getProps` and `hasProp` also compare keys with `===` and never strip a `:`, which `findProp` would change, so they keep their own lookup.
- `printer.ts` keeps its strip: it formats hand-written JSON whose keys may end in `:`. It uses `propKey`.
- `@nowline/preview-shell` keeps its inline regex (`mount.ts:1537`): it deliberately has no engine dependency ([`architecture.md`](./architecture.md), preview-shell entry).
- `parseIsoDate` is strict (§7, decisions 4 and 5): it drops the roll-over of layout's old `parseDate`, so layout reads `2026-02-30` as no date. The validator was strict only inside calendar declarations, and `resolveLocalStart` and the wave rules' `isValidIsoDate` accepted `2026-02-30` (which `Date` rolls to 2026-03-02), so the same commit makes the validator strict too: `NL.E0405` fires for an impossible day on every `date:`, `start:` and `end:`, and `resolveLocalStart` and the wave start floor use `isRealIsoDate`. That commit is marked *behaviour*, carries a `fixed` fragment, and G1 and G3 confirm no sample relies on roll-over.

### 3.6 The validator split

The class and the registration stay the public surface (`NowlineValidator`, `registerValidationChecks`, `packages/core/src/index.ts:49`); the bodies move into `packages/core/src/language/validator/`:

| Module | Checks (current lines) |
|---|---|
| `tables.ts` | constants and regexes (`:86-389`) |
| `support.ts` | `resolveLocalStart`, `acceptTr`, `acceptWaveFinding`, `locationOf` (`:391-453`, `:2441-2447`) |
| `structure.ts` | file structure, directive, ids and titles, unique ids, indentation, swimlane required, include options (`:591-765`) |
| `properties.ts` | `checkPropertyValues` and its helpers, unknown keys, raw style keys, style enums (`:766-1029`, `:1197-1305`, `:2259-2323`) |
| `entities.ts` | anchors, milestones, footnotes, items, parallels and groups, sizes, statuses, utilization, persons (`:1030-1196`, `:1306-1340`, `:1354-1400`, `:1904-1958`) |
| `style.ts` | `default` lines and NL.W0704 (`:1401-1517`) |
| `calendar.ts` | calendar and scale blocks, calendar declarations, the week, duplicate calendar ids (`:1521-1623`, `:2016-2196`) |
| `references.ts` | forward references, reference resolution, inline date pins, cycles (`:1624-1903`) |
| `symbols.ts` | symbol declarations and references (`:1959-2015`, `:2197-2257`) |
| `waves.ts` (existing `language/waves.ts`) | unchanged; `checkWaves` (`:1341-1353`) stays a thin call |

Each module exports plain functions `(node, accept) => void`. `NowlineValidator` keeps one method per check that forwards to them, so `registerValidationChecks`, the method names Langium binds and the check order are unchanged; diagnostic order depends on that registration order.

## 4. Migration plan

Every step is one PR, independently mergeable, and passes these gates:

- **G1, sample renders.** Render every `examples/**.nowline` and `tests/*.nowline` sample directly with the CLI, on the base commit and on the step, in each built-in theme with `--now 2026-02-09`, and compare every render's SVG bytes and exit status: any difference fails the gate, wherever it falls in the list.
  ```sh
  git worktree add ../base origin/main && (cd ../base && make init build-fast)
  make build-fast
  (cd ../base && git ls-files 'examples/**.nowline' 'tests/*.nowline') >../samples.txt
  render_all() {  # $1 = checkout to render with, $2 = output directory
      rm -rf "$2" && mkdir -p "$2"
      while read -r f; do
          for t in light dark grayscale; do
              out="$2/${f%.nowline}.$t.svg"
              mkdir -p "${out%/*}"
              (cd "$1" && node packages/cli/dist/index.js "$f" --theme "$t" --now 2026-02-09 -o -) >"$out" 2>/dev/null
              echo "exit $?" >"$out.status"
          done
      done <../samples.txt
  }
  render_all ../base ../g1-base && render_all . ../g1-step
  diff -r ../g1-base ../g1-step
  ```
  (`diff -r` exits non-zero when any SVG or exit status differs, and lists every difference rather than the last. The sample list is the base's, so a sample the step deletes or breaks fails too. The gate does not use `make build`, which renders only the slugs listed in `scripts/render-samples.mjs` and `scripts/render-tests.mjs` and so skips `examples/continuation`, `examples/minimal.fr`, `tests/grammar-properties`, `tests/grammar-properties-include`, `tests/partner-multi` and `tests/waves-isolate-team`, and renders the seven include files under `examples/nested/` and `examples/waves-program/` only through their parents. At the commit that adds this spec all 180 renders exit 0, and two runs on that commit give identical trees, in about three minutes.)
- **G2, snapshots and suites.** `make pre-commit` passes without `UPDATE_LAYOUT_SNAPSHOTS`, including the core message and coverage suites and the LSP suites.
- **G3, diagnostics.** For every sample, `nowline <file> --dry-run --diagnostic-format json`, and the same with `--locale fr`, print the same bytes on both commits (the gate m2o used, [`waves.md`](./waves.md) §8.9).

No step adds a changelog fragment: nothing observable changes.

### m1 - One content walk

#### s1 - Add `ast-walk.ts`

Add the `./internal` entry to `packages/core/package.json` `exports` (with `src/internal.ts` re-exporting this step's module and, in later steps, `style-chain.ts`, `calendar-declarations.ts`, `props.ts` and `value-tables.ts`; §7, decision 3). Add the module (§3.1) and its tests, including equivalence tests that run each new function and the copy it will replace over every sample and the core validation fixtures and compare the results (ids, order, owners). No caller changes.

#### s2 - Move the validator and the resolver onto it

Switch `registerEntity`, `visitPropertiesDeep`, `collectReferenceableIds`, the rule 24, rule 25 and person walks to `ast-walk.ts`; `include-waves.ts` imports `forEachDeclaredId`; delete the validator's walk helpers. Add the layering test (§3.2). G1, G2, G3.

#### s3 - Move the wave rules and layout onto it

`collectDeclarations`, `collectWaveHosts`, the descent in `assignWaves`, `leadWave` and `waves-order.ts`, and layout's `collectItems` use `ast-walk.ts`. G1, G2, G3.

#### s4 - Move the LSP onto it

`collectNamedEntities`, `visitProperties`, `visitAllProperties` and `buildEntityIndex` in `ast-utils.ts` and the descent in `document-symbols.ts` use `ast-walk.ts`. G1, G2.

### m2 - Shared rules

#### s1 - Property helpers and the date pattern

Add `util/props.ts` (§3.5) and replace the copies listed in §1.5, package by package. Layout's date parsing moves to the strict `parseIsoDate` in its own commit, marked *behaviour* with a `fixed` fragment. G1, G2, G3.

#### s2 - The style chain

Add `style-chain.ts` (§3.3) with tests that pin the layer order for each level and for unresolved styles and labels; switch `resolveStyle` and `checkHiddenTimelineStrip`. G1, G2, G3.

#### s3 - The calendar classifier

Add `calendar-declarations.ts` (§3.4) with a test that classifies every declaration in the samples and in the calendar test fixtures and compares the result with each of the three copies; then switch the validator, `calendar-resolver.ts` and `hover.ts` and delete the copies. G1, G2, G3.

#### s4 - Value tables

Add `value-tables.ts`; the validator, layout (`NON_WORKING_DISPLAYS` re-export) and the LSP (`ast-utils.ts:88-128`) import it. G1, G2, G3.

### m3 - The validator split

#### s1 - Move tables and support code

Move `tables.ts` and `support.ts` out of `nowline-validator.ts`. Pure move. G1, G2, G3.

#### s2 - Move the checks by feature

Move the check bodies into the modules of §3.6, one module per commit within the PR; `NowlineValidator` forwards. Pure move. G1, G2, G3.

#### s3 - Remove the unused wave exports

Delete `effectiveWave` and `leadWave` (`waves.ts:210-267`, exported at `core/src/index.ts:55` and `:59`); `assignWaves` covers both. Only `packages/core/test/validation/waves.test.ts` calls them: its agreement test (`assignWaves agrees with effectiveWave and leadWave`) becomes direct expectations on `assignWaves`, and the two rows go from the helper table in [`waves.md`](./waves.md). A `removed` changelog fragment, since the package is published. G1, G2.

## 5. Test strategy

- **Equivalence before replacement.** Each new function is first tested against the copy it replaces, over the full sample corpus and the existing fixtures (m1.s1, m2.s2, m2.s3). The equivalence tests are deleted with the copies; the direct unit tests stay.
- **Direct unit tests** for `ast-walk.ts` (order, `description` skipping, nested teams, groups in parallels in groups), `styleLayers` (every level, label order, unresolved references), `classifyCalendarDeclaration` (every shape, roll-over dates such as `2026-02-30`, unknown weekdays, end before start) and `props.ts`.
- **Layering test** (m1.s2): the resolver-to-validator edge cannot come back.
- **Gates** G1 to G3 on every step. G3 is what proves a validator move kept the diagnostic order.

## 6. Risks

| Risk | Mitigation |
|---|---|
| A walk change reorders diagnostics (rule 2 duplicates, cycle reports) | the walk keeps source order; G3 compares the JSON diagnostics byte for byte, in both locales |
| A copy had a deliberate difference that the shared function erases | the equivalence tests run before each copy is deleted; a difference found there is kept as a caller-side filter and noted in the PR |
| The validator split breaks Langium's method binding or check order | the class keeps every method name and `registerValidationChecks` is untouched; G3 |
| New core exports become public API that is hard to change | they ship under `@nowline/core/internal`, documented in `packages/core/README.md` as unstable and for the other `@nowline/*` packages, which version in lock-step; nothing observable changes, so no changelog fragment |
| `preview-shell`, which reaches the engine only through type-only imports, starts importing core at runtime | the exception is written down (§3.5); m2.s1 leaves `mount.ts` alone |

## 7. Decisions

Gary, 2026-10-13:

1. **Milestone ID.** Yes: m4.12. R1 (m4.11) and R3 do not depend on each other; whichever lands second uses the other's helpers.
2. **`effectiveWave` and `leadWave`.** Remove them in m3.s3, with no deprecation step: nothing outside core's own tests calls them. A `removed` fragment covers the published package.
3. **Publishing the new helpers.** Through a `@nowline/core/internal` subpath, documented as unstable, not as supported `@nowline/core` API. Every consumer is another `@nowline/*` package in lock-step. This reverses the draft's recommendation.
4. **Strict dates in layout.** Make `parseIsoDate` strict, so layout agrees with the validator on impossible dates (§3.5). This reverses the draft's recommendation.
5. **Strict dates in the validator too.** Decision 4 assumed the validator already rejected impossible days everywhere; it did so only in calendar declarations. The behaviour commit of m2.s1 makes both strict: `NL.E0405` fires for `2026-02-30` on every date key, and layout reads it as no date (§3.5). One `fixed` fragment covers both.
