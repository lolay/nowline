# Nowline DSL Specification

## Overview

The Nowline DSL is an indentation-significant, human-readable language for defining roadmaps. It is designed to feel like writing a structured outline — keywords read as plain English, and the file is meaningful without a rendering tool.

Parser: **Langium** (TypeScript-native, generates typed AST, provides LSP for free).

File extension: `.nowline`
MIME type: `text/vnd.nowline`
Fenced code block: ````nowline`

## Design Rules

1. **~20 keywords (currently 21).** If the keyword count grows beyond ~20, the language is too complex. The `glyph` declaration was added to support custom-named glyphs for `icon:` and `capacity-icon:`; further additions should stay rare.
2. **Indentation-significant.** Two-space or one-tab indent defines nesting. Spaces and tabs must not be mixed within a file — the parser rejects mixed indentation with a clear error identifying the first offending line. No braces, brackets, or explicit block delimiters.
3. **Strings are double-quoted.** `"Auth refactor"`, not `Auth refactor` or `'Auth refactor'`.
4. **Properties are key:value pairs** on the same line as the entity. All key-value pairs use `:` as the single separator — the DSL does not use `=`. Values containing spaces must be double-quoted.
5. **Built-in DSL names are kebab-case.** Property names (`capacity-icon`, `days-per-week`), section keywords, and built-in values (`in-progress`, `at-risk`) all use kebab-case. Author-chosen identifiers may use any combination of letters, digits, underscores, and dashes (must start with a letter or underscore) — `auth-refactor`, `authRefactor`, and `auth_refactor` are all valid.
6. **Order matters.** Items render and execute sequentially in source order within a swimlane.
7. **Comments** use `//` for single-line and `/* */` for multi-line.
8. **Line continuation** uses `\` at the end of a line. The next line continues the same declaration. Indentation on the continuation line is cosmetic. Use `\\` for a literal backslash.

## File Structure

A `.nowline` file has four sections in strict order:

1. `**nowline` directive** — DSL version declaration (optional but recommended, must be first line if present)
2. **Includes** — `include` declarations (optional)
3. **Config** — `config` marker followed by rendering configuration (optional)
4. **Roadmap** — `roadmap` marker followed by content declarations (required)

The `nowline` directive declares which version of the DSL the file targets. It must be the very first non-comment, non-blank line in the file:

```nowline
nowline v1
```

The DSL version is an integer-only major (`v1`, `v2`, `v3`, …) and is **independent of the package version**. The packages (`@nowline/cli`, the VS Code extension, etc.) ship under SemVer (`MAJOR.MINOR.PATCH`, see `specs/releasing.md`); the DSL major exists separately to express format-stability. Within a DSL major, the parser must accept every valid file written for that major: new syntax may be added between package minor/patch releases, but no breaking change to an existing valid `nowline v1` file ships without bumping the directive to `v2`. When the parser encounters a version newer than it supports, it emits an error identifying the required version. When the directive is omitted, the parser assumes the latest version it supports.

The directive line accepts optional file-level properties after the version:

```nowline
nowline v1 locale:fr-CA
```

The only directive property today is `locale:`, a BCP-47 tag controlling localized rendering and validator messages. Unknown directive keys are an error so typos surface immediately. See [`specs/localization.md`](./localization.md) for the full locale model, precedence chain, and bundle structure.

`config` and `roadmap` are section markers, not indent-containers. Config keywords (`scale`, `style`, `default`, `calendar`) appear at the top level after `config`. Roadmap keywords (`person`, `team`, `anchor`, `label`, `size`, `status`, `swimlane`, `milestone`, `footnote`) appear at the top level after `roadmap`. Indentation is used where nesting is real: style properties under `style`, `scale` and `calendar` block properties under their keyword, team members under `team`, and swimlane contents under `swimlane`.

## Full Example

```nowline
nowline v1

include "shared/teams.nowline"

config

style enterprise "Enterprise readiness"
  bg: blue
  fg: navy
  text: white
  border: solid
  icon: shield

style risky
  border: dashed
  fg: orange

style subtle
  bg: gray

style concurrent
  bracket: solid

default item status:planned shadow:subtle
default label style:subtle
default swimlane padding:sm spacing:none
default roadmap padding:md header-height:md font:sans
default parallel bracket:none

roadmap platform-2026 "Platform 2026" author:"Acme Engineering" logo:"./brand/acme.svg" start:2026-01-06 scale:2w calendar:business

person sam "Sam Chen" link:https://github.com/samchen
person jen "Jennifer Wu"

team engineering "Engineering"
  team platform "Platform Team"
    person sam
    person jen
  team mobile "Mobile Team"

anchor kickoff date:2026-01-06
anchor code-freeze "Code Freeze" date:2026-05-01
anchor ga-date "GA Date" date:2026-06-01

size xs "Extra Small" effort:1d
size s "Small" effort:3d
size m "Medium" effort:1w
size l "Large" effort:2w
size xl "Extra Large" effort:1m

status awaiting-review "Awaiting Review"
status in-review "In Review"

label enterprise "Enterprise readiness" style:enterprise
label security "Security hardening" style:enterprise
label low-confidence style:risky

swimlane platform owner:platform capacity:5
  item auth-refactor "Auth refactor" size:l after:kickoff \
    status:done owner:sam labels:enterprise capacity:3 \
    link:https://github.com/acme/auth/issues/123
  parallel after:auth-refactor
    group audit-track "Audit Track" labels:security
      item audit-log "Audit log v2" size:xl before:code-freeze \
        remaining:30% labels:[enterprise, security] capacity:2 \
        link:https://notion.so/acme/audit-log-spec
        description "Comprehensive audit trail for all admin actions"
      item audit-ui "Audit UI" size:m capacity:1
    item sso "SSO plugins" size:m labels:[enterprise, low-confidence] capacity:50%
  item platform-qa "Platform QA" size:s capacity:2

swimlane mobile owner:mobile capacity:2
  item offline "Offline mode" size:l after:kickoff owner:jen status:at-risk remaining:60% capacity:3 link:https://github.com/acme/mobile/pull/87
  item push-v2 "Push notifications v2" size:m owner:mobile capacity:1

milestone beta "Beta" after:auth-refactor
milestone v1-ga "v1 GA" after:[auth-refactor, audit-log]
milestone ga-launch "GA launch" date:2026-06-01 after:[auth-refactor, audit-log]

footnote "Vendor dependency" on:audit-log
  description "Blocked until vendor contract is signed. Expected March resolution."
footnote capacity-risk "Team capacity risk" on:[mobile, platform]
  description "Mobile team is down to 2 engineers through Q2."
```

## Keywords

### Directives


| Keyword   | Purpose                 | Notes                                                                                                                                       |
| --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `nowline` | DSL version declaration | `nowline v1`. Optional but recommended. Must be the first non-comment, non-blank line. Accepts optional `locale:<bcp47>` (see `localization.md`). |


### Section Markers


| Keyword   | Purpose                                    | Notes                                                                                                 |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `config`  | Section marker for rendering configuration | Optional. Must appear before `roadmap`. Config keywords follow at the top level (not indented).       |
| `roadmap` | Section marker for content declarations    | `[id] ["title"]`. Optional `author:"string"`, `start:YYYY-MM-DD`, `scale:<duration>`, `calendar:business\|full\|custom`, `logo:"path"`, `logo-size:<preset>`. One per file. Roadmap keywords follow at the top level. |


### Config Keywords (after `config`, before `roadmap`)


| Keyword     | Purpose                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `scale`     | Display settings for the timeline axis (properties indented beneath). Optional.                |
| `style`     | Named visual definition (properties indented beneath).                                         |
| `glyph`     | Named declaration of a custom glyph for use by `icon:` and `capacity-icon:` style properties. `[id] ["title"] unicode:"..."` (required) plus optional `ascii:"..."` fallback and universal properties. |
| `default`   | Default property values for a given entity type. One `default <entity> <properties>` declaration per entity type. |
| `calendar`  | Day-arithmetic overrides (properties indented beneath). Only valid when `roadmap` declares `calendar:custom`. |


### Roadmap Keywords (after `roadmap`)


| Keyword     | Purpose                            | Notes                                                                                    |
| ----------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `swimlane`  | Groups items by team/area/stream   | `[id] ["title"]`. Optional `owner:id`, `capacity:N`, `utilization-warn-at:N%`, `utilization-over-at:N%`. Items indented beneath. See "Capacity" below.                           |
| `person`    | Individual contributor declaration | `[id] ["title"]`. May be declared at roadmap top level or nested inside a team. Bare `person <id>` inside a team is a membership reference. Declared at most once per merged scope. |
| `team`      | Team/group declaration             | `[id] ["title"]`. Nested teams/persons indented beneath.                                 |
| `anchor`    | Named date on the timeline         | `[id] ["title"] date:YYYY-MM-DD`. `date:` is required.                                    |
| `label`     | Semantic tag / chip vocabulary     | `[id] ["title"]`. Optional `style:id` plus universal properties (`labels:`, `link:`, `description`). Raw style properties are not allowed — declare a `style` in config and reference it. |
| `size`      | Named effort budget calibrated to single-engineer scale | `[id] ["title"]`. Required `effort:<duration literal>` (decimal-aware: `0.5d`, `2w`, `1m`). Universal properties (`description`, `link:`) also allowed. Must be declared before any entity referencing `size:NAME`. An item with `size:` derives its duration as `effort ÷ item_capacity` (item `capacity:` defaults to `1` when absent). |
| `status`    | Custom status value                | `[id] ["title"]`. Extends the built-in set (`planned`, `in-progress`, `done`, `at-risk`, `blocked`). Universal properties (`description`, `link:`) also allowed. Must be declared before any entity referencing `status:NAME`. |
| `milestone` | Achievement marker                 | `[id] ["title"]`. At least one of `date:` or `after:` is required. `after:` accepts a single id or a list of item/milestone/anchor ids. |
| `item`      | Work item inside a swimlane        | `[id] ["title"]`. Indented under a swimlane.                                             |
| `parallel`  | Parallel execution block           | `[id] ["title"]`. Children run in parallel. Implicit join on dedent.                     |
| `group`     | Sequential item bundle             | `[id] ["title"]`. Children run sequentially. Works inside swimlanes and parallel blocks. |
| `footnote`  | Attachable annotation              | `[id] ["title"] on:id` or `on:[id1, id2]`. Attaches to one or more entities.             |


### Include Keyword (before `config` and `roadmap`)


| Keyword   | Purpose                         | Notes                                                                              |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `include` | Include another `.nowline` file | Path string with optional `config:` and `roadmap:` mode. `include "teams.nowline"` |


### Items (inside a swimlane)

Items are indented under a swimlane, prefixed with the `item` keyword. Each item follows the universal `keyword [id] ["title"] [properties]` pattern. Items execute in document order within a swimlane.

```nowline
swimlane platform
  item auth-refactor "Auth refactor" size:l status:done
  item "Quick cleanup" size:s
  item sso size:m
```

### Parallel and Group

#### `parallel` — parallel execution

`parallel` is a block inside a swimlane (or group) that runs its children in parallel. Children can be bare items or groups.

```nowline
swimlane platform
  item auth "Auth refactor" size:l
  parallel
    item api-v2 "API v2" size:m
    item sdk-update "SDK update" size:s
  item integration "Integration" size:s
```

- `api-v2` and `sdk-update` start at the same time (after `auth` finishes).
- **Implicit join on dedent** — when the parallel block ends, the next sibling (`integration`) waits for all parallel children to complete.
- Parallel with no subsequent sibling: parallel tracks float to completion independently.
- Parallel follows the universal `[id] ["title"]` pattern (both optional).

#### `group` — sequential item bundle

`group` bundles items into a named sequential track. It works inside swimlanes, parallel blocks, or other groups.

```nowline
swimlane platform
  group api-work "API Work" labels:enterprise
    item api-v2 "API v2" size:m
    item api-docs "API docs" size:s
  item deploy "Deploy" size:s
```

- Items inside a group execute sequentially (same as swimlane behavior). The renderer uses the same row-pack engine swimlanes use, so an item whose desired start collides with a sibling's logical right edge, an upstream caption's spill reservation, or a slack-arrow corridor bumps to a new inner row inside the group's content area. The group's bounding box grows vertically to encompass every populated row.
- Inside a swimlane (outside a parallel block), the group is sequential with respect to its siblings — `deploy` starts after `api-docs` finishes.
- **Styled group** — when a group has `style:`, `labels:`, or other visual properties, it renders with a visible bounding box plus a small title chiclet anchored flush in the box's upper-left corner. The chiclet sits entirely inside the box (no overhang) and the box reserves vertical pad above the first inner row plus a symmetric pad below the last row. See `specs/rendering.md` "Group (styled)" for the full chiclet contract.
- **Unstyled group** — when a group has no style or labels, it is purely structural. No visible artifact in the rendered output; it only governs sequencing and inner row growth.

#### `parallel` with `group` — parallel sequential tracks

Combine parallel and group for parallel tracks where each track has its own sequential items.

```nowline
swimlane platform
  item kickoff-work "Kickoff" size:s
  parallel streams "Parallel Streams"
    group api-track "API Track"
      item api-v2 "API v2" size:m
      item api-docs "API docs" size:s
    group sdk-track "SDK Track"
      item sdk-update "SDK update" size:s
      item sdk-tests "SDK tests" size:m
      item sdk-release "SDK release" size:s
  item integration "Integration testing" size:s
```

- `api-track` and `sdk-track` start in parallel after `kickoff-work`.
- Within each group, items are sequential (`api-v2` then `api-docs`; `sdk-update` then `sdk-tests` then `sdk-release`).
- `integration` starts after **both** groups finish (implicit join).

#### Parallel and Group Properties

Both `parallel` and `group` support universal properties (`labels`, `style`, `link`, `description`) plus:


| Property | Type               | Description                                                        |
| -------- | ------------------ | ------------------------------------------------------------------ |
| `status` | enum or string     | Aggregate/override status for the block as a whole.                |
| `owner`  | person or team ref | Accountable owner for the block.                                   |
| `after`  | identifier or list | The entire block starts after the referenced entity finishes. List form (`after:[a,b]`) starts after the latest of them. Accepts item, milestone, anchor, parallel, or group ids. |
| `before` | identifier or list | The entire block must finish before the referenced entity starts. List form (`before:[a,b]`) finishes before the earliest of them.                                                |


**Not supported** on parallel/group (computed from children):

- `duration` — derived from children's durations (sum for group, max for parallel).
- `remaining` — derived from children's progress.
- `capacity` — derived from children (sum at each timestep across parallel; pass-through for group).

#### Nesting Rules

- `parallel` is valid inside: swimlane, group.
- `group` is valid inside: swimlane, parallel, group (nesting allowed).
- `item` is valid inside: swimlane, parallel, group.
- Bare items inside a parallel block are each their own parallel track (single-item groups, effectively).

### Required Properties

Some entity types require specific keyed properties. Omitting a required property is a validation error; the error names the entity by id or title and the missing property.

| Entity      | Required property                            |
| ----------- | -------------------------------------------- |
| `item`      | `size:` or `duration:` (at least one)        |
| `milestone` | `date:` or `after:` (at least one)           |
| `anchor`    | `date:`                                      |
| `footnote`  | `on:`                                        |

All required fields are keyed properties — the language has no "positional required field" concept. Positional slots on entities are only `id` and `title`; at least one of the two must be present (see Universal Declaration Pattern).

### Universal Properties (all entities)

These properties and directives are valid on every entity type: items, swimlanes, parallel blocks, groups, milestones, anchors, persons, teams, and footnotes.


| Property / Directive | Type          | Description                                                                                          |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `labels`             | list          | Tags for filtering and display. `labels:[enterprise, security]`. On an item, each label renders as an atomic chiclet inside the bar; chips that don't fit on a single row wrap to additional rows and the bar grows downward. See `specs/rendering.md` "Labels" for the wrapping contract. |
| `link`               | URL           | Single URL to external content.                                                                      |
| `style`              | identifier    | Single reference to a named style declared in config. `style:enterprise`. This is the only visual property allowed on an entity. |
| `description`        | sub-directive | Indented under the entity. Longer explanatory text. `description "Details here"`                     |

**Content vs. rendering separation.** Entities in the roadmap section carry only semantic information (identity, ownership, sequencing, sizing, state, categorisation) plus an optional single `style:id` reference. Raw style properties (`bg`, `fg`, `text`, `border`, `icon`, `shadow`, `font`, `weight`, `italic`, `text-size`, `padding`, `spacing`, `header-height`, `corner-radius`, `bracket`, `timeline-position`, `minor-grid`) may only appear in `style` blocks and `default <entity>` lines — both of which live in `config`. To flag an item in red, declare a named style in config (`style flagged` with `bg: red` properties indented beneath) and reference it (`item blocked-work style:flagged`).


### Item Properties

These properties are specific to items. `status`, `owner`, `after`, and `before` are also valid on swimlanes, parallel blocks, and groups.


| Property    | Type                  | Description                                                                                                                             |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `status`    | enum or string        | Built-in: `planned`, `in-progress`, `done`, `at-risk`, `blocked`. Custom values allowed: `status:awaiting-review`.                      |
| `owner`     | person or team ref    | References a person or team. `owner:sam` or `owner:platform`. Singular — one accountable owner.                                         |
| `after`     | identifier or list    | This item starts after the referenced entity finishes. Single: `after:auth-refactor`. List: `after:[auth-refactor, audit-log]` — starts after the latest finisher. Accepts item, milestone, anchor, parallel, or group ids. |
| `before`    | identifier or list    | This item must finish before the referenced entity starts. List: `before:[code-freeze, ga-date]` — finishes before the earliest starter.                                                                                    |
| `size`      | size alias            | References a `size` roadmap declaration (`size:l`). The item's duration is calculated as `effort ÷ item_capacity` (`capacity:` defaults to `1` when absent). Overridden by an explicit `duration:` literal — see "Sizing precedence" below. Items only — not valid on parallel or group. |
| `duration`  | duration literal      | Raw duration literal only (`duration:2w`, `duration:3m`, `duration:0.5d`). No alias names; `size:` is the alias mechanism. When set alongside `size:`, this wins for bar width and meta-line driver (size chip omitted). Items only — not valid on parallel or group. |
| `remaining` | percentage or literal | Work remaining. Two equivalent forms — author picks whichever reads naturally: percent (`remaining:30%`) or single-eng effort literal (`remaining:1w`, `remaining:0.5d`). When a literal is given, the system computes `remaining_literal ÷ total_effort` to derive the percent (capacity divides the literal: `total_effort = size.effort` for sized items, or `duration × item_capacity` for duration-literal'd items). Both forms render identically — a percent of the bar. `status:done` takes priority. Items only — not valid on parallel or group. |
| `capacity`  | number                | Concurrent capacity consumed by this item while it runs. Positive integer (`capacity:2`), decimal (`capacity:0.5`), or percent literal (`capacity:50%`) which parses to a decimal. Items only — not valid on parallel or group. See "Capacity" below. |


### Capacity

`capacity:` is an optional annotation that models per-timestep throughput. Both swimlanes and items may declare it, and the two annotations are fully independent — neither requires the other.

```nowline
swimlane platform capacity:5
  item auth size:l capacity:2
  parallel
    item api size:m capacity:2
    item sdk size:m capacity:1
  item qa size:s capacity:50%
```

The unit is opaque to the DSL — the same way `size:l` is opaque until a `size` declaration gives it meaning. Authors decide whether `5` means engineers, story points, FTE, hours, story budget, or any other measure.

**Where it can appear:**

- `swimlane` — integer or decimal only (no percent form). The lane's per-timestep budget.
- `item` — integer, decimal, or percent literal. The item's concurrent consumption.
- Not valid on `parallel` or `group` — derived from children (sum at each timestep across parallel; pass-through for group), same exclusion family as `size`, `duration`, and `remaining`.

**Numeric formats:**

- Integer (`\d+`): `capacity:2`, `capacity:5`
- Decimal (`\d+\.\d+`, leading and trailing digit required): `capacity:0.5`, `capacity:1.5`
- Percent literal (`\d+(\.\d+)?%`): `capacity:50%`, `capacity:12.5%`. **Authoring sugar only** — the parser converts `50%` to `0.5` at lex time, and the DSL stores a single decimal value with no record of which form the author wrote. There is no resolution step against the lane's capacity.

All values must resolve to a positive number (`> 0`).

**Independence:** an item may declare `capacity:` whether or not its swimlane does, and vice versa. There is no validation rule coupling them.

**Default capacity:**

- **Sized items** (`size:` declared, no explicit `capacity:`): capacity defaults to `1` in both duration derivation (`duration = effort ÷ 1 = effort`) and overload accounting (the item contributes `1` to the per-timestep load).
- **Duration-literal items** (`duration:` declared, no `size:`, no explicit `capacity:`): capacity stays unset and the item contributes `0` to overload (uncounted). The literal duration is the bar width regardless.
- **Explicit `capacity:N`** always wins for both purposes.

**Lifetime:** capacity is constant for the item's full duration. No ramps in v1.

**Utilization thresholds.** Swimlanes that declare `capacity:` paint a tri-state utilization underline (green / yellow / red) along the bottom of the band based on the per-timestep load function `f(x) = Σ items[i].capacity for items active at x`. Two thresholds gate the colors and accept either a percent literal or a decimal in the same value family as `capacity:`:

- `utilization-warn-at:N%` (default `80%`) — at or above this fraction of `capacity:`, the segment paints **yellow**.
- `utilization-over-at:N%` (default `100%`) — at or above this fraction of `capacity:`, the segment paints **red**.

Below `warn-at` (including segments with zero load), segments paint **green** — the underline reads as a continuous health bar wherever the lane has `capacity:` declared. Both thresholds accept the literal value `none` to opt out of that color band: `utilization-warn-at:none` collapses to a binary green/red indicator; `utilization-over-at:none` removes red entirely; setting both to `none` suppresses the underline outright. Use `default swimlane utilization-over-at:none` to disable utilization indicators globally; individual lanes can re-enable by setting their own threshold.

> Removed in this release: `overcapacity:show|hide`. Suppression is now expressed via `utilization-over-at:none` (and/or `utilization-warn-at:none`); the binary `show|hide` form is no longer accepted.

**Cross-reference:** lane capacity renders inside the frame tab; item capacity renders as a `N[glyph]` suffix after the meta line's driver token (duration literal or size chip). When `size:` drives, the suffix follows the chip (`m 2×`, or `M 2×` when the size declares `title:"M"`); when `duration:` drives, it follows the literal (`2w 2×`). The glyph is controlled by the `capacity-icon:` style property (default: `multiplier`, rendering as `×`). The tri-state utilization underline is described in `rendering.md` § Lane utilization underline. See also `rendering.md` § Swimlane Capacity and § Item size chip.

**Examples — switching the glyph:**

```nowline
// People-based capacity (uses default people-icon SVG from the renderer's library)
default swimlane capacity-icon:person

swimlane platform capacity:5
  item auth size:l capacity:2    // renders as: l 2 [person] (effort 2w ÷ capacity 2 = 1w bar; meta driver is chip; suffix uses person glyph)
```

```nowline
// Story-points-based capacity
default swimlane capacity-icon:points

swimlane backend capacity:13
  item rewrite size:l capacity:8   // renders as: l 1.25d 8 ★ (effort 2w ÷ capacity 8 = 1.25d; folds to days when no whole-week match)
```

**Example — custom glyph and inline literal:**

```nowline
config

glyph budget "Budget" unicode:"💰" ascii:"$"

style finance capacity-icon:budget
style adhoc capacity-icon:"⚙"

default swimlane style:finance

roadmap ops "Operations"

swimlane payroll capacity:50000
  item q1-payroll size:m capacity:12000
swimlane tooling style:adhoc capacity:5
  item ci-revamp size:l capacity:2
```

**Example — tri-state utilization underline:**

```nowline
roadmap r "Utilization demo" start:2026-01-05 length:6w

size m effort:2w

// Default thresholds (warn:80%, over:100%) — three lanes show the
// three colors side by side at the same horizontal position.
swimlane healthy capacity:5
  item a size:m capacity:2     // load 2/5 = 40% → green underline
swimlane stressed capacity:5
  item b size:m capacity:4     // load 4/5 = 80% → yellow underline
swimlane overloaded capacity:5
  parallel
    item c size:m capacity:4
    item d size:m capacity:2   // load 6/5 = 120% → red underline
```

```nowline
// Custom thresholds — tighter warn band, slack on over.
default swimlane utilization-warn-at:60% utilization-over-at:120%

swimlane backend capacity:8
  item rebuild size:l capacity:5    // load 5/8 = 62.5% → yellow
```

```nowline
// Opt out of the underline on a specific lane.
swimlane research capacity:3 utilization-warn-at:none utilization-over-at:none
  item explore size:m capacity:5    // no underline; capacity badge still shows "3×"

// Opt out globally; re-enable per lane.
default swimlane utilization-over-at:none
swimlane critical capacity:5 utilization-over-at:100%
  item ship size:l capacity:6       // global default suppresses; lane override re-enables → red
```

#### Sizing precedence

When an item declares both `size:` and `duration:`, the explicit `duration:` literal wins for bar width **and** for the meta line: the size chip is not shown (only the literal appears as the driver token). When only `size:` is declared, the item's duration is calculated as `effort ÷ item_capacity` (item `capacity:` defaults to `1` when absent); the meta line shows the size chip only — calendar span reads from the bar width. When only `duration:` is declared, the bar width is the literal value with no derivation and the meta line shows that literal.

| `size:` | `duration:` | `capacity:` | Resulting duration                                |
| ------- | ----------- | ----------- | ------------------------------------------------- |
| `l`     | —           | —           | `size.l.effort ÷ 1` (e.g. `2w`)                   |
| `l`     | —           | `2`         | `size.l.effort ÷ 2` (e.g. `1w`)                   |
| `l`     | `2w`        | `2`         | `2w` (literal wins; meta line shows `2w` only — no chip) |
| —       | `2w`        | `2`         | `2w` (capacity does not divide a literal duration) |
| —       | —           | —           | Validation error — item needs at least one of `size:`/`duration:` |

### Anchor Declaration

An anchor is a named date on the timeline. Items reference anchors via `after` and `before` to pin their position.

```nowline
anchor kickoff date:2026-01-06
anchor code-freeze "Code Freeze" date:2026-05-01
anchor "Project Kickoff" date:2026-01-06
```

Anchors are the only place absolute dates appear in the DSL (milestones optionally have dates too). The `date:` property is required on every anchor. See `rendering.md` for visual treatment.

### Label Declaration

A `label` is a semantic tag / chip vocabulary item. Labels are declared in the roadmap section so that content and vocabulary live together; their visual defaults live in config via `default label` and referenced `style` blocks.

```nowline
label enterprise "Enterprise readiness" style:enterprise
label security "Security hardening" style:enterprise-red
label low-confidence style:risky-dotted
```

A `label` line follows the universal `[id] ["title"]` pattern and accepts:

- `style:id` — reference to a named style declared in config. Styles the label's own chip/badge.
- Universal properties — `labels:`, `link:`, and the `description` sub-directive.

Raw style properties (`bg`, `fg`, `text`, `border`, etc.) are **not** allowed on a `label` line. When an author wants a variant — e.g. a red-background `security` chip, or a dotted-border `low-confidence` chip — they declare a fresh named style in config (`style enterprise-red` with `bg: red` indented beneath, etc.) and reference it from the label.

A label's style applies only to the label's own chip/badge as rendered on a host entity — it never styles the host entity itself. If an author wants every entity tagged `enterprise` to appear blue, they set `style:enterprise-look` on those entities directly or via `default item style:enterprise-look`.

Labels used on items without a matching `label` declaration are valid (see Validation Rule 16). They render with chip defaults from `default label` (if declared in config) or system defaults otherwise.

### Size Declaration

A `size` declaration maps a named t-shirt size to a single-engineer **effort** budget. Items reference a size via `size:NAME`; the system divides the effort by the item's `capacity:` to derive the bar's calendar duration. Sizes live in the roadmap section so vocabulary co-locates with content.

```nowline
size xs "Extra Small" effort:0.5d
size s "Small" effort:3d
size m "Medium" effort:1w
size l "Large" effort:2w
size xl "Extra Large" effort:1m
```

A `size` line follows the universal `[id] ["title"]` pattern and accepts:

- `effort:<duration literal>` — **required**. The single-eng effort budget. Decimal-aware (`0.5d`, `1.5w`); positive non-zero.
- Universal properties — `description`, `link:`.

The id is the identifier used as the lookup key (`size:xs`, `size:l`). On items, the on-bar size chip renders the size's optional `title` when provided, falling back to the id verbatim (case as typed). Authors who want the classic uppercased t-shirt look pin it explicitly: `size m "M" effort:1w` renders `M`, `size m effort:1w` renders `m`, `size med effort:1w` renders `med`. The title also surfaces in legends, tooltips, and elsewhere — see `rendering.md` § Item size chip. Changing a `size` declaration's `effort:` later rescales every sized item that hasn't pinned an explicit `duration:` literal.

`size` declarations must appear in the roadmap section before any swimlane or item that references them.

**Effort vs. duration.** A size carries effort calibrated to a single engineer; an item's calendar duration falls out of `effort ÷ capacity:`. An item that overrides with an explicit `duration:LITERAL` ignores the derivation entirely for both bar width and meta-line display (no size chip on the meta line). See "Sizing precedence" under Capacity for the full table.

### Status Declaration

A `status` declaration extends the built-in set of item/swimlane/parallel/group status values (`planned`, `in-progress`, `done`, `at-risk`, `blocked`). Custom statuses are declared in the roadmap section so that vocabulary lives with the content that uses it.

```nowline
status awaiting-review "Awaiting Review"
status in-review "In Review"
status deferred "Deferred"
```

A `status` line follows the universal `[id] ["title"]` pattern and accepts:

- Universal properties — `description`, `link:`.

The id is the identifier used as the lookup key on entities via `status:NAME`. The optional title is for rendering in legends, chips, and status displays; when absent, renderers fall back to the id.

`status` declarations must appear in the roadmap section before any entity that references them.

Custom statuses have no inherent semantics beyond what renderers assign — the DSL only guarantees the value resolves and can carry a display title. Renderers may map custom statuses to visual treatments via `default item style:…` or entity-level `style:` overrides.

### Milestone Properties


| Property | Type                  | Description                                                                                                                                          |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date`   | ISO date              | Fixed date for the milestone. Optional if `after:` is present; required if `after:` is absent.                                                        |
| `after`  | identifier or list    | `after:id` or `after:[id1, id2]` — the milestone is met when all referenced entities finish (i.e. after the latest of them). Optional if `date:` is present; required if `date:` is absent. |


At least one of `date:` or `after:` is required on every milestone. Three valid forms:

- **Date-fixed** — `milestone v1-ga "v1 GA" date:2026-06-30`. Pinned to a specific date.
- **Dependency-driven** — `milestone v1-ga "v1 GA" after:[core-api, audit-log]`. Occurs when dependencies finish; the date is derived by the renderer.
- **Both** — `milestone v1-ga "v1 GA" date:2026-06-30 after:[core-api, audit-log]`. The `date:` is an intended target, not a hard cap. Slippage (dependencies not converging by the target date) is a rendering concern, not a validation error.

See `rendering.md` for visual treatment.

### Roadmap `start:` and absolute dates

The `roadmap` declaration accepts an optional `start:YYYY-MM-DD` property that anchors the timeline baseline:

```nowline
roadmap platform-2026 "Platform 2026" start:2026-01-06
```

Rules:

- If the file contains any `anchor` declaration, or any `milestone` with a `date:` property, `start:` is **required** on the roadmap.
- Every such anchor date and every dated milestone's date must be on or after `start:`.
- A roadmap with no absolute dates (schedules expressed purely with `duration:` and `after:`) does not need `start:`.

Renderers treat `start:` as the left edge of the timeline. A roadmap with no `start:` and no dates is purely relative — renderers choose their own reference date (e.g. the day of rendering).

### Roadmap `logo:` and `logo-size:`

The `roadmap` declaration accepts an optional company logo. The logo renders next to the title inside the roadmap header box.

```nowline
roadmap platform-2026 "Platform 2026" author:"Acme Engineering" logo:"./brand/acme.svg"
```

- `logo:"path"` — path to the logo file, resolved relative to the `.nowline` file's directory. Forward slashes on all platforms (same rule as `include`). Only local paths are accepted; `http://`, `https://`, `file://`, and `data:` URLs are rejected by the parser. Absolute paths are discouraged but allowed for authoring tools that resolve against a known root.
- `logo-size:<preset>` — size preset (`xs | sm | md | lg | xl`). Defaults to `md`. The rendered logo height is bounded by the roadmap header box; see `rendering.md` § Roadmap Header.

**Supported formats.** The renderer accepts `.svg`, `.png`, `.jpg` / `.jpeg`, and `.webp`. Format is determined by file extension; content-type is not sniffed. Any other extension is a validation error.

**Asset resolution.** Logo resolution happens at render time, not at parse time, so a `.nowline` file referencing a missing logo is still a valid document (`nowline <input> --dry-run` does not require the asset to exist). At render time, when the asset is missing or has an unsupported extension the renderer emits a warning and renders the header without the logo; `nowline <input> --strict` (and the equivalent renderer option) promotes warnings to errors.

**Portability.** Because `logo:` is a path, a `.nowline` file is not self-contained. To ship a self-contained artifact, inline the logo at export time (the renderer embeds SVG inline and raster formats as base64 `data:` URIs; see `rendering.md` § Roadmap Header). The DSL itself does not accept `data:` URIs to keep the text readable.

### Footnote Declaration

A footnote is an annotation that attaches to one or more entities via `on:`.

```nowline
footnote "Vendor dependency" on:audit-log
  description "Blocked until vendor contract is signed."

footnote capacity-risk "Team capacity risk" on:[mobile, platform]
  description "Both teams are understaffed through Q2."
```

The `on:` property is required and references one or more identifiers (item, swimlane, anchor, milestone, person, team). When referencing multiple entities, use bracket notation: `on:[id1, id2]`. Footnotes follow the universal `[id] ["title"]` pattern — a footnote with an id can itself be referenced.

Footnotes are numbered sequentially by document order. A superscript number appears in the upper-right corner of every entity the footnote is attached to. The full footnote text renders in a footnote section below the roadmap. See `rendering.md` for visual treatment.

### Include Declaration

`include` pulls another `.nowline` file into the current file. Two optional properties — `config:` and `roadmap:` — control how the included file's content is handled. They operate on two independent categories:

#### What each mode controls


| Category                             | What it contains                                                                                                     | Examples                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Config** (rendering configuration) | scale block, calendar block, styles, defaults                                                                                | Everything between `config` and `roadmap` in the included file |
| **Roadmap** (content)                | `roadmap` declaration, persons, teams, anchors, labels, sizes, statuses, swimlanes (+ contained items/parallel/groups), milestones, footnotes | Everything after `roadmap` in the included file                |


#### `config:` mode


| Mode                     | Behavior                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config:merge` (default) | The child's config items are merged into the parent's config. On name collision, the **parent wins** and the parser emits a **warning** per collision identifying the shadowed definition and its source file. Config is always merged before roadmap content is processed. |
| `config:ignore`          | The child's config items are dropped entirely. If the child's roadmap content is merged (`roadmap:merge`), it resolves styles from the parent's post-merge config.                                                                                                          |
| `config:isolate`         | The child's config items are only available within the child file. The parent's config is only available in the parent file (and to any already-merged roadmap items in the parent). Neither side's config bleeds into the other.                                           |


#### `roadmap:` mode


| Mode                      | Behavior                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `roadmap:merge` (default) | The child's content entities are merged into the parent. On name collision, the **parent wins** and the parser emits a **warning**. If a swimlane collides, its contained items are also dropped. Merged content resolves styles from the post-merge config. |
| `roadmap:ignore`          | The child's content entities are dropped. Only the child's config is processed (subject to `config:` mode). Use for shared style libraries. Shared label, status, and size vocabulary — since they are all roadmap content — uses `roadmap:merge` instead. |
| `roadmap:isolate`         | The child's content stays scoped to the child file. The child uses only the child's config. The child must contain a `roadmap` declaration (needed for the region label). The isolated content renders as a visually distinct region — see `rendering.md`.   |


In all cases, the result renders as a combined drawing as if it were one file.

#### Processing Order

Includes are processed in **file order, depth-first**. When the processor encounters an `include`, it immediately processes that child file (and the child's includes recursively) before continuing with the next declaration in the parent. Config is merged before roadmap content at each level.

```
1. Process includes (depth-first, recursive)
2. Merge/resolve config (per config: mode)
3. Merge/resolve roadmap content (per roadmap: mode, using post-merge config)
```

#### Collision Handling

On `merge`, when the parent and child both declare an entity with the same identifier:

- **Config items** (styles): parent wins, child's definition is dropped, warning emitted.
- **Roadmap entities** (swimlanes, persons, teams, labels, sizes, statuses, anchors, milestones, footnotes, etc.): parent wins, child's entity is dropped, warning emitted. If a swimlane collides, its contained items are also dropped.
- **Defaults**: `default <entity>` lines can be declared in both parent and child. On collision of entity type, the parent's `default <entity>` wins and a warning is emitted.

#### Diamond Includes (same file via multiple paths)

When the same file is reachable from multiple parents:

- **Duplicate include in the same file** — error. Writing `include "teams.nowline"` twice in one file is a mistake.
- **Diamond** (A includes B and C, both B and C include D) — valid. D is processed once on first encounter (depth-first). Each parent independently controls whether D's config merges into its own scope. Entities from D are not duplicated.
- **Circular includes** — error. Detected when a file appears in the currently-resolving stack (not the completed set).

#### Examples

```nowline
// Shared style library — pull config only, no content
include "brand-styles.nowline" roadmap:ignore

// Shared team definitions — merge everything (default)
include "teams.nowline"

// Strip foreign styling, keep content
include "snippet.nowline" config:ignore

// Fully self-contained foreign roadmap
include "partner.nowline" config:isolate roadmap:isolate

config

roadmap platform-2026 "Platform 2026" scale:1w

swimlane platform owner:platform
  item auth-refactor "Auth refactor" size:l after:kickoff
```

#### Common patterns

- `**include "brand.nowline" roadmap:ignore**` — shared style library. Pull in styles/labels, no content.
- `**include "teams.nowline"**` — merge config and content (both defaults). Brings in team/person declarations and any styles they define.
- `**include "snippet.nowline" config:ignore**` — strip foreign styling. Content merges but resolves against parent's config.
- `**include "partner.nowline" config:isolate roadmap:isolate**` — embed a foreign roadmap as a self-contained visual region with its own styling.

#### Scoping rules for `config:isolate`

- Config items (styles, defaults) from the isolated file are **not visible** to the parent or other includes.
- Config items from the parent are **not visible** to the isolated file's entities.
- Identifiers (items, swimlanes, anchors, etc.) are governed by `roadmap:` mode, not `config:` mode.

#### Scoping rules for `roadmap:isolate`

- The child's content stays scoped to the child file and uses only the child's config.
- The child's swimlanes, items, anchors, milestones, and footnotes render inside a dashed-border region labeled with the child's roadmap title.
- The region includes an indicator (icon or badge) to distinguish it from native content.
- Timeline scale is shared — the child's content aligns to the parent's scale/axis.
- The child must contain a `roadmap` declaration (error if missing).

#### General rules

Includes are resolved relative to the including file's directory. Paths use forward slashes on all platforms. Includes must appear before `config` and `roadmap` — they are the first declarations in a file.

Included files can themselves contain `include` declarations (transitive includes). Circular includes are a validation error.

### Config Section

The optional `config` section marker must appear before `roadmap`. Config keywords follow at the top level (not indented under `config`). It defines:

**Scale** — column width and axis labels are configured in two places:

1. The `roadmap` declaration sets the column width with `scale:<duration>` (e.g. `scale:2w`, `scale:1q`). This is a raw duration literal; it defaults to `1w` when omitted. Items with durations finer than `scale:` remain valid — the renderer may place them as labelled annotations alongside the main timeline row rather than as full columns (see `rendering.md`).
2. Axis display settings live in an optional `scale` config block. Every property is optional; anything unspecified is chosen by the renderer.

```nowline
config

scale
  name: sprints
  label-every: 2
  label: "Sprint {n}"
```

- `name` — display label for the scale unit (e.g. "sprint"). Defaults to an auto-generated name based on the roadmap's `scale:` duration.
- `label-every` — show an axis label every Nth column. Defaults to the renderer's choice.
- `label` — axis label format. `{n}` is the column index.

The `scale` config block is optional. A file can declare `scale:2w` on its `roadmap` with no `scale` block and the renderer picks all display defaults.

**Calendar** — day-arithmetic configuration (how many days per week, month, quarter, year). Selected via the `calendar:` property on the `roadmap` declaration. All three modes resolve to the same internal shape — four integer fields — so the rest of the system treats them uniformly.

```nowline
roadmap platform-2026 "Platform 2026" start:2026-01-06 scale:2w calendar:business
```

- `calendar:business` (default) — engineering working-day arithmetic. `days-per-week:5`, `days-per-month:22`, `days-per-quarter:65`, `days-per-year:260`.
- `calendar:full` — calendar-day arithmetic including weekends. `days-per-week:7`, `days-per-month:30`, `days-per-quarter:90`, `days-per-year:365`.
- `calendar:custom` — author-supplied values via the `calendar` config block below.

The default is `business` because engineering roadmaps almost always count working days when sizing work.

**No-transitivity rule.** Each `days-per-*` field is independently defined. A duration like `1y` resolves to `days-per-year` directly — not by multiplying through months or weeks. This is why business mode's `1y` = 260d, not `12 × 22d = 264d`. Year, quarter, month, week, and day are each first-class units with their own conversion to days.

**Preset reference** — the values baked into `calendar:business` and `calendar:full`, written in the same shape as a custom `calendar` block. These live hardcoded in the runtime; authors cannot and need not write them in a `.nowline` file:

```nowline
// calendar:business (hardcoded in the runtime; not valid DSL)
calendar
  days-per-week: 5
  days-per-month: 22
  days-per-quarter: 65
  days-per-year: 260

// calendar:full (hardcoded in the runtime; not valid DSL)
calendar
  days-per-week: 7
  days-per-month: 30
  days-per-quarter: 90
  days-per-year: 365
```

**Custom calendars** — when the roadmap declares `calendar:custom`, supply all four `days-per-*` fields in a `calendar` config block:

```nowline
config

calendar
  days-per-week: 6
  days-per-month: 26
  days-per-quarter: 78
  days-per-year: 312

roadmap rotating-shift "Rotating Shift Schedule" calendar:custom
```

All four entries are **required** and must be positive integers. There is no partial form — `custom` means fully specified. Mixing `calendar:business` or `calendar:full` (or the default) with a `calendar` config block is an error.

**Styles** — named visual definitions. Each style follows `[id] ["title"]` and has properties indented beneath it:

```nowline
config

style enterprise "Enterprise readiness"
  bg: blue
  fg: navy
  text: white
  border: solid
  icon: shield

style risky
  border: dashed
  fg: orange

style subtle
  bg: gray
  text: white

style elevated
  shadow: fuzzy
  bg: white

style code-task
  font: mono
  bg: gray

style heading
  weight: bold
  text-size: lg

style concurrent
  bracket: solid
```

Style properties:


| Property        | Type            | Description                                                                                                                                             |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg`            | color or `none` | Background/fill color. Named (`red`, `blue`, `yellow`, `green`, `orange`, `purple`, `gray`, `navy`, `white`), hex (`#2563eb`), or `none` (transparent). |
| `fg`            | color or `none` | Border/outline color. Named, hex, or `none` (no border).                                                                                                |
| `text`          | color or `none` | Text color. Named, hex, or `none` (hides text).                                                                                                         |
| `border`        | enum            | Border/line style: `solid`, `dashed`, `dotted`.                                                                                                         |
| `icon`          | identifier or string | Named icon displayed on the entity. Built-in identifiers (rendered from a curated SVG library, identical across platforms): `shield`, `warning`, `lock`, plus the capacity-icon vocabulary. Custom: any identifier declared by a `glyph` declaration in config. Inline: a double-quoted Unicode literal (`"💰"`, `"\u{1F464}"`) — font-dependent. |
| `shadow`        | enum            | Drop shadow: `none` (default), `subtle`, `fuzzy`, `hard`.                                                                                               |
| `font`          | enum            | Font family preset: `sans` (default), `serif`, `mono`.                                                                                                  |
| `weight`        | enum            | Font weight: `thin`, `light`, `normal` (default), `bold`.                                                                                               |
| `italic`        | boolean         | Italic text: `true` or `false` (default).                                                                                                               |
| `text-size`     | enum            | Text size preset: `xs`, `sm`, `md` (default), `lg`, `xl`. System owns the absolute pixel mapping.                                                       |
| `padding`       | enum            | Inset padding: `none`, `xs`, `sm`, `md` (default), `lg`, `xl`.                                                                                          |
| `spacing`       | enum            | Space between children: `none`, `xs`, `sm`, `md`, `lg`, `xl`. Default varies by entity.                                                                 |
| `header-height` | enum            | Timeline header row height. Roadmap-only: `none`, `xs`, `sm`, `md` (default), `lg`, `xl`.                                                               |
| `corner-radius` | enum            | Corner rounding: `none`, `xs`, `sm`, `md`, `lg`, `xl`, `full`.                                                                                          |
| `bracket`       | enum            | Bracket/join line on parallel blocks: `none` (default), `solid`, `dashed`. Parallel-only.                                                               |
| `capacity-icon` | identifier or string | Glyph used as the suffix to capacity numbers on lanes and items. Built-in identifiers (rendered from the same curated SVG library as `icon:`): `none`, `multiplier` (default — `×`), `person`, `people`, `points` (`★`), `time` (`⏱`). Custom: any identifier declared by a `glyph` declaration in config. Inline: a double-quoted Unicode literal — font-dependent. |
| `timeline-position` | enum        | Where the timeline date strip is rendered. Roadmap-only: `top` (default), `bottom`, `both`. `both` mirrors the strip at the chart bottom so dates stay readable on tall canvases.   |
| `minor-grid`    | boolean         | When `true`, draws faint dotted grid lines at every tick boundary in addition to the standard major-tick grid. Roadmap-only: `true` or `false` (default).                          |


All style properties are optional. Unset properties inherit from the system defaults.

`capacity-icon` follows the same value-form contract as `icon:` — a built-in identifier, a custom name from a `glyph` config declaration, or a double-quoted Unicode literal — but applies to the capacity number rendered on lanes and items, not as an entity-leading badge. Default is `multiplier` because it has the cleanest ASCII fallback (`5x`) and reads as a quantity in every context without presupposing a unit type. Roadmaps measuring capacity in people switch via `default swimlane capacity-icon:person`; story-points roadmaps use `capacity-icon:points`; etc. The `none` value renders just the bare number with no glyph.

**Built-in icon names are rendered from a curated SVG library shipped with the renderer**, not from Unicode emoji codepoints. This guarantees consistent visual output across every platform (web, CLI, exports) — emoji rendering otherwise varies dramatically by OS and font (Apple, Google, Microsoft, Linux). Authors who want platform-default emoji rendering can use an inline literal (`capacity-icon:"👤"`) instead of the named `person` icon.

**Glyphs** — declare custom named glyphs for use by `icon:` and `capacity-icon:`. Each `glyph` line follows the universal `[id] ["title"]` pattern.

```nowline
glyph budget "Budget" unicode:"💰" ascii:"$"
glyph fte unicode:"\u{1F464}" ascii:"@"
glyph star unicode:"⭐"
```

A `glyph` line accepts:

- `unicode:"<string>"` — **required**. The Unicode character (literal or escape, e.g. `"\u{1F464}"`). May be a multi-codepoint grapheme cluster (flag emoji, ZWJ sequences, etc.).
- `ascii:"<string>"` — optional. Short ASCII fallback for terminals/exports that lack the Unicode glyph. Length ≤ 3 ASCII characters. Defaults to `?` when omitted.
- Universal properties — `description`, `link:`.

The id is the lookup key used by `icon:my-glyph` and `capacity-icon:my-glyph`. Custom glyph ids cannot shadow built-in icon names (`none`, `multiplier`, `person`, `people`, `points`, `time`, `shield`, `warning`, `lock`) — the renderer's built-in vocabulary is reserved.

`glyph` declarations must precede any reference. Authors use the inline Unicode-literal form (`capacity-icon:"💰"`) for one-off glyphs; `glyph` declarations are for reusable named ones.

**Defaults** — set default property values for an entity type. Each line declares one default. Supported entity types: `item`, `label`, `swimlane`, `roadmap`, `parallel`, `group`, `milestone`, `footnote`, `anchor`.

```nowline
default item status:planned shadow:subtle
default label style:subtle corner-radius:full
default swimlane padding:sm spacing:none
default roadmap padding:md header-height:md font:sans
default milestone weight:bold
default footnote style:subtle shadow:subtle
default anchor style:subtle
default parallel bracket:none
default group padding:xs spacing:xs
```

`default` is always flat — one declaration per line, one declaration per entity type. When an entity omits a property, the matching default applies. Explicit values on the entity always override defaults. For long default lines, use line continuation (`\`).

**Banned on `default`** — identity-defining, sizing, sequencing, reference, and prose properties cannot be defaulted because they must be explicit on each entity:

| Entity             | Cannot default                                                          | Rationale                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `default item`     | `size`, `duration`, `after`, `before`, `remaining`, `link`, `description`, `owner` | `size`/`duration` are sizing properties — at least one is required per item, and they are intentionally explicit. Sequencing creates invisible dependencies. `remaining` is transient progress. `link`/`description` are unique. |
| `default milestone`| `date`, `after`, `link`, `description`                                  | `date`/`after` are identity/sizing properties — at least one is required per milestone.                                                         |
| `default anchor`   | `date`, `link`, `description`                                           | `date` is required and anchor-specific.                                                                                                         |
| `default footnote` | `on`, `link`, `description`                                             | `on` is the attachment target — identity-defining.                                                                                              |

Allowed on every `default <entity>`: presentation properties (`style:` and raw style properties — see next paragraph), bulk-state (`status:`, `labels:`), plus any non-banned entity-specific property.

`capacity` is allowed on `default item` (e.g. `default item capacity:1`). It is **not** allowed on `default swimlane` because each lane's budget is intentionally explicit at its declaration site. `utilization-warn-at:`, `utilization-over-at:`, and `capacity-icon:` (the capacity-adjacent properties), in contrast, are allowed on `default swimlane` and `default item` per the usual presentation-property rule.

**Raw style properties are allowed on `default`** as a catch-all escape hatch (e.g. `default item shadow:subtle padding:md`). `default` lives in config, which is the presentation section, so the ban on raw style properties applies to roadmap-section entities, not to `default` lines.

All config entries are optional. If `config` is omitted, all built-in defaults apply.

### Person & Team Declarations

`person` and `team` declarations provide metadata for person and team references. A `person` can be declared either at the roadmap top level or nested inside a `team`; either form is valid. `team` declarations can nest other teams and reference persons as members.

**Declaration vs. reference — the parser rule for `person`:**

- `person <id>` alone (no title, no keyed properties) — a **reference**. Inside a `team` it denotes membership; at the roadmap top level it is a no-op (the parser may emit a warning).
- `person <id> ["title"] [properties]` — a **declaration**. Creates the person. If nested inside a `team`, the declaration also establishes membership of that person in the enclosing team.

**Identity and scoping.** Person identifiers are global within the merged file scope regardless of where they are declared — a person declared inside `team platform` is still a valid target for `owner:sam` anywhere in the roadmap. Team-nesting the declaration does not scope the id.

A person may be declared **at most once** in the merged scope. Duplicate declarations of the same person id are a validation error, even if the metadata matches. Authors must pick a single canonical declaration location.

Three ergonomic patterns:

```nowline
// Multi-team member — declare once at top level, reference in each team
person sam "Sam Chen" link:https://github.com/samchen
team platform "Platform Team"
  person sam
team mobile "Mobile Team"
  person sam

// Single-team member — declare inline under the team
team platform "Platform Team"
  person sam "Sam Chen" link:https://github.com/samchen

// Reference-only, no declaration anywhere — valid, renders as the bare id
team platform "Platform Team"
  person sam
```

`team` nesting inside another `team` is always a declaration (as today). Teams cannot be referenced with a bare `team <id>` line.

Declarations are optional. If `owner:sam` or `owner:platform` appears without a matching declaration, the reference is still valid — just without a display name or metadata. The `link` property and `description` directive are supported on both `person` and `team`.

## Grammar Notes

### `nowline` Directive

The `nowline` directive is a simple two-token line: the keyword `nowline` followed by a version string matching `v\d+` (e.g., `v1`, `v2`). It does not follow the universal declaration pattern — no identifier, no title, no properties. It must be the first non-comment, non-blank line in the file if present.

### Universal Declaration Pattern

Every entity declaration (`item`, `anchor`, `label`, `duration`, `status`, `milestone`, `footnote`, `swimlane`, `parallel`, `group`, `person`, `team`, `roadmap`) follows the same pattern:

```
keyword [id] ["title"] [key:value ...]
```

- **Positional slots are only `id` and `title`.** At least one of the two must be present.
- **Identifier** — unquoted, matches `[a-zA-Z_][a-zA-Z0-9_-]*`. Used for referencing. Optional — auto-generated from the title (kebab-cased) if omitted.
- **Title** — a double-quoted string. Human-readable display name. Optional. **Titles are always double-quoted, even single-word titles** (the quote is how the parser distinguishes id from title).
- The parser distinguishes them by format: unquoted = identifier, quoted = title.
- Every other input (`date:`, `duration:`, `status:`, `after:`, `before:`, `on:`, `owner:`, `style:`, `labels:`, `link:`, etc.) is a keyed property using `key:value`.
- Required-ness is enforced by validation (see Required Properties), not by grammar shape.

Examples:

- `item auth-refactor "Auth refactor" size:l` — both id and title
- `item "Auth refactor" size:l` — title only, auto-id: `auth-refactor`
- `item auth-refactor size:l` — id only, display name: `auth-refactor`

The `nowline` directive is the only construct without an id or title; every other declaration follows the Universal Declaration Pattern. The directive accepts optional `key:value` properties after the version (currently just `locale:`) using the same `BlockProperty` shape as the indented `scale` and `calendar` blocks.

### Identifiers

Identifiers match `[a-zA-Z_][a-zA-Z0-9_-]*` — letters, digits, underscores, and dashes, starting with a letter or underscore. Idiomatic Nowline uses kebab-case (`auth-refactor`, `push-v2`, `ga-launch`), but `authRefactor`, `auth_refactor`, and `MED` are equally valid; pick what reads best for your team. They must be unique across the merged result (the file and all its includes).

When omitted, the parser generates one by slugifying the title to kebab-case: `"Audit log v2"` becomes `audit-log-v2`. Auto-generated ids are always kebab-case for stability across reruns.

### Lists

Any list-typed property accepts a single value without brackets or multiple values with bracket notation. Both forms are equivalent when there is one item:

- Single: `labels:enterprise`
- Multiple: `labels:[enterprise, security]`

No quotes around identifiers in lists. Comma-separated, optional spaces.

### Links

The `link` property takes a bare URL (no quotes). One link per entity.

### Dependencies and Anchoring

Both `after:` and `before:` accept a single identifier or a bracketed list of identifiers. References may target items, milestones, anchors, parallel blocks, or groups.

- `after:id` — this entity starts after the referenced entity finishes (or after the referenced anchor date).
- `after:[id1, id2, ...]` — this entity starts after **all** referenced entities finish (i.e. after the latest of them).
- `before:id` — this entity must finish before the referenced entity starts (or before the referenced anchor date).
- `before:[id1, id2, ...]` — this entity must finish before the **earliest** of the referenced entities starts.

Circular dependencies across the full graph (including every element of list-form references) are a validation error.

### Line Continuation

A `\` at the end of a line means the next line continues the same declaration. Indentation on the continuation line is cosmetic (ignored by the parser). Only valid at the end of a property line — not inside strings or comments. Use `\\` for a literal backslash.

```nowline
item auth "Auth refactor" duration:2w status:in-progress \
  owner:sam labels:[security,enterprise] \
  link:https://github.com/acme/auth/issues/123 \
  style:flagged
```

### Comments

```nowline
// This is a single-line comment

/* This is a
   multi-line comment */
```

## Validation Rules

The parser enforces these rules and produces clear error messages with file position and suggestions (e.g., fuzzy-match "did you mean X?").

### Structural rules

1. Exactly one `roadmap` declaration per file. Included files' `roadmap` declarations are governed by the `roadmap:` mode.
2. All identifiers are unique across the merged result (items, parallel blocks, groups, anchors, persons, teams, milestones, footnotes share one namespace). On merge collision, parent wins and a warning is emitted.
3. Every entity must have at least an identifier or a title (or both).
4. File structure must follow the section order: `nowline` directive (optional), includes, `config`, `roadmap`. The `nowline` directive, if present, must be the first non-comment, non-blank line.
5. The `nowline` directive version must match `v\d+`. If the version is newer than the parser supports, emit an error identifying the required version.
6. At least one swimlane is required in the merged result.
7. Indentation must be consistent within a file — either spaces or tabs, not both. Mixed indentation is a parse error identifying the first offending line.
8. `label` declarations must appear in the roadmap section, not under `config`. A `label` line placed before `roadmap` is an error. The error message should suggest moving the declaration under `roadmap`.
9. `size` declarations must appear in the roadmap section, not under `config`. A `size` line placed before `roadmap` is an error. The error message should suggest moving the declaration under `roadmap`.
10. `status` declarations must appear in the roadmap section, not under `config`. A `status` line placed before `roadmap` is an error. The error message should suggest moving the declaration under `roadmap`.

### Reference rules

1. All elements of `after:`, `before:`, and `on:` properties (whether single or list) resolve to declared identifiers within the merged scope.
2. No circular dependencies in `after`/`before` chains. Detection operates on the full dependency graph, including every element of list-form references.

### Value rules

**Dates, durations, sizes, scales**

1. `anchor` `date:` values and dated `milestone` `date:` values are valid ISO 8601 dates.
2. `duration:` property values must match the raw duration pattern (`\d+(\.\d+)?[dwmqy]`) — literal only, no alias name lookup. `scale:` property values use the same raw duration pattern.
3. `size:` property values must reference a `size` declaration in the roadmap section. Forward references are an error (rule 15 applies to `size:` the same way it applied to `duration:`).
4. A `size` declaration's id must not match the raw duration pattern `\d+(\.\d+)?[dwmqy]` and must not be a bare `d`, `w`, `m`, `q`, or `y`. This avoids ambiguity at the call site.
5. Every `size` declaration must specify an `effort:` property, and its value must match the raw duration pattern `\d+(\.\d+)?[dwmqy]` (positive, non-zero). A `size` declaration without `effort:` is a validation error. Duplicate `size` declaration ids within a single file are an error (same rule as duplicate `status` or `label` ids).

**Calendar**

6. `calendar:` on `roadmap` must be one of `business`, `full`, or `custom`. Omitted defaults to `business`.
7. A `calendar` config block is only meaningful when the roadmap declares `calendar:custom`. Presence of a `calendar` config block when the roadmap declares `calendar:business`, `calendar:full`, or the default is an error.
8. When `calendar:custom` is declared, the `calendar` config block must be present and must declare **all four** entries: `days-per-week`, `days-per-month`, `days-per-quarter`, `days-per-year`. Missing any entry is an error. Empty or absent block is an error.
9. `days-per-week`, `days-per-month`, `days-per-quarter`, `days-per-year` values must be positive integers.

**Required properties per entity**

10. `item` declarations must include at least one of `size:` or `duration:`. Omitting both is an error that identifies the item by id/title and line number. Declaring both is valid; the explicit `duration:` literal wins for bar width and meta-line display (size chip omitted; see Sizing Precedence in the Capacity section).
11. `anchor` declarations must include a `date:` property.
12. `milestone` declarations must include at least one of `date:` or `after:`.
13. `footnote` declarations must include an `on:` property referencing one or more valid identifiers. Single: `on:id`. Multiple: `on:[id1, id2]`.

**Status, labels, remaining**

14. `status` values are a built-in value (`planned`, `in-progress`, `done`, `at-risk`, `blocked`) or a value declared by a `status` declaration in the roadmap section.
15. A `size:` or `status:` property reference must resolve to a declaration that appears **earlier in the file** (or in an earlier include, per `config:`/`roadmap:` mode). Forward references are a validation error. The error message should point to both the reference site and suggest the declaration location.
16. `labels` values are identifiers (rule 5). Undeclared labels are valid (no config entry required).
17. `remaining` values are either a percentage (`0%`–`100%`) or a single-eng effort literal (`\d+(\.\d+)?[dwmqy]`, e.g. `1w`, `0.5d`). Both forms normalize to a percent of the item's total effort during layout: `percent = remaining_literal ÷ total_effort`, where `total_effort = size.effort` for sized items, or `duration_literal × item_capacity` for duration-literal'd items (`item_capacity` defaults to `1`). When the literal exceeds total effort (computed percent `> 100%`), the layout step emits a soft warning and clamps the painted bar to 100% remaining; rendering is never blocked.

**Capacity**

17a. `capacity:` on a `swimlane` must match a positive number literal (integer `\d+` or decimal `\d+\.\d+`). Percent form is not allowed on swimlanes.
17b. `capacity:` on an `item` must match a positive number literal or percent literal (`\d+(\.\d+)?%`). The percent literal is parsed to its decimal equivalent (`50%` → `0.5`).
17c. `capacity:` is not valid on `parallel` or `group` (same exclusion as `size`, `duration`, and `remaining`).
17d. `utilization-warn-at:` and `utilization-over-at:` on a `swimlane` (or `default swimlane`) must each match either a positive percent literal (`\d+(\.\d+)?%`), a positive decimal (`\d+(\.\d+)?`, interpreted as a fraction — `0.8` ≡ `80%`), or the bareword `none`. Defaults: `utilization-warn-at:80%`, `utilization-over-at:100%`. When both numeric thresholds are present on the same lane (or merged from a `default swimlane`), `utilization-warn-at` must be ≤ `utilization-over-at`; otherwise it is a validation error. Not valid on any other entity type.
17e. `capacity-icon:` value must be a built-in identifier (`none`, `multiplier`, `person`, `people`, `points`, `time`), an identifier matching a `glyph` declaration in scope, or a double-quoted Unicode literal. Like all raw style properties, it is only valid inside `style` blocks and `default <entity>` lines — not inline on entities. Defaults to `multiplier` when omitted. The same value-form rule applies to `icon:`.

Non-rules (intentionally not validated):

- Item and swimlane capacity are independent. An item declaring `capacity:` without its swimlane declaring one is **valid** and produces no diagnostic.
- A lane declaring `utilization-warn-at:` or `utilization-over-at:` without a `capacity:` value is **valid** but produces no underline (the load function has no denominator). Renderer treats it as a silent no-op; consider adding `capacity:` to make the threshold meaningful.
- A lane being over capacity — concurrent item capacity exceeding swimlane capacity at any timestep — is **not** a validation error and produces no parser output. It is rendered visually per `rendering.md`.
- `utilization-warn-at:none` and/or `utilization-over-at:none` on a swimlane that has no `capacity:` (or no items contributing load) is valid and a no-op — there is nothing to color.

**Glyph declarations**

17f. Every `glyph` declaration must specify a `unicode:"<string>"` property. Missing `unicode:` is a validation error.
17g. `unicode:` value must be a non-empty quoted string. May contain Unicode escapes (`\u{...}`) or literal Unicode characters. May be a multi-codepoint grapheme cluster.
17h. `ascii:` value, if present, must be a quoted string of length ≤ 3 ASCII characters.
17i. A `glyph` id must not match any built-in icon name (`none`, `multiplier`, `person`, `people`, `points`, `time`, `shield`, `warning`, `lock`, plus any other built-ins the renderer reserves). Shadowing is an error.
17j. Duplicate `glyph` declaration ids within a single file are an error (same rule as duplicate `status` or `label` ids).
17k. A `glyph` reference (`icon:NAME` or `capacity-icon:NAME`) must resolve to either a built-in or an earlier `glyph` declaration. Forward references are an error.

**Styles and content/rendering separation**

18. `style:` references on entities and labels must resolve to a style declared in the applicable `config` scope.
19. Style property values must be valid for their type: color properties (`bg`, `fg`, `text`) must be named colors, hex values, or `none`; `border` must be `solid`, `dashed`, or `dotted`; `shadow` must be `none`, `subtle`, `fuzzy`, or `hard`; `font` must be `sans`, `serif`, or `mono`; `weight` must be `thin`, `light`, `normal`, or `bold`; `italic` must be `true` or `false`; `text-size`, `padding`, `spacing`, `header-height` must be `none`, `xs`, `sm`, `md`, `lg`, or `xl`; `corner-radius` must be `none`, `xs`, `sm`, `md`, `lg`, `xl`, or `full`; `bracket` must be `none`, `solid`, or `dashed`; `capacity-icon` must be `none`, `multiplier`, `person`, `people`, `points`, `time`, a custom `glyph` id, or a double-quoted Unicode literal; `timeline-position` must be `top`, `bottom`, or `both`; `minor-grid` must be `true` or `false`.
20. Raw style properties (`bg`, `fg`, `text`, `border`, `icon`, `shadow`, `font`, `weight`, `italic`, `text-size`, `padding`, `spacing`, `header-height`, `corner-radius`, `bracket`, `capacity-icon`, `timeline-position`, `minor-grid`) may only appear in `style` blocks and `default <entity>` lines (both in config). Using them on any roadmap-section entity is an error.

**Defaults**

21. The first positional argument after `default` must be one of the supported entity types: `item`, `label`, `swimlane`, `roadmap`, `parallel`, `group`, `milestone`, `footnote`, `anchor`.
22. Duplicate `default <entity>` declarations for the same entity type within a single file are an error. On include with `config:merge`, the parent's `default <entity>` wins over the child (existing merge semantics apply).
23. A `default <entity>` declaration that sets a banned property (see the "Banned on `default`" table) is an error. The error names the banned property, the entity type, and points to the table.

**Dependencies**

24. `after:` and `before:` on any entity accept a single identifier or a bracketed list of identifiers. Each element must resolve to a declared item, milestone, anchor, parallel, or group identifier.
25. Circular dependency detection operates on the full graph across all `after:`/`before:` references (including every element of list-form references).

**Roadmap `start:`**

26. `roadmap` `start:` values are valid ISO 8601 dates (format `YYYY-MM-DD`, calendar-valid).
27. If a file contains any `anchor` declaration or any `milestone` with a `date:` property, the `roadmap` declaration must also declare `start:`. One error is emitted per offending dated entity.
28. Every `anchor` date and every dated `milestone`'s `date:` must be on or after the roadmap's `start:`. One error is emitted per offender.
29. If `start:` is present but fails the date-format rule, the two rules above are suppressed for that file — the user sees only the format error until they fix it.

**Persons and teams**

30. A `person` may be declared at most once in the merged file scope. A declaration is identified by the presence of a title or any keyed property on the `person` line. Multiple declarations of the same person id (regardless of whether metadata matches) are an error that identifies both declaration locations.
31. A bare `person <id>` inside a `team` denotes membership and is valid with or without a separate declaration.
32. A bare `person <id>` at roadmap top level with no matching declaration anywhere is a no-op; the parser may emit a warning suggesting the author either add properties or remove the line.

### Include rules

1. `include` paths must resolve to an existing `.nowline` file relative to the including file's directory.
2. No circular includes (A includes B includes A). Detected when a file appears in the currently-resolving stack.
3. `include` declarations must appear before `config` and `roadmap` (after the `nowline` directive if present).
4. Duplicate `include` of the same file in a single file is an error. Diamond includes (same file via different parents) are valid — the file is processed once.
5. `config:` on `include` must be `merge`, `ignore`, or `isolate`.
6. `roadmap:` on `include` must be `merge`, `ignore`, or `isolate`.
7. On `config:merge`, if a child config entry collides with a parent entry, the parent wins and the parser emits a warning with the source file path and shadowed name.
8. On `roadmap:merge`, if a child entity collides with a parent entity, the parent wins and the parser emits a warning. Swimlane collisions also drop contained items.
9. On `config:isolate`, `style:` references within the isolated file must resolve within that file's own config. References to parent config are a validation error. Label, size, and status references are governed by `roadmap:isolate`, not `config:isolate`, because labels, sizes, and statuses are roadmap content.
10. On `roadmap:isolate`, the included file must contain a `roadmap` declaration (needed for the region label).
11. For any `include` whose `roadmap:` mode is not `ignore` (i.e. `merge` or `isolate`), if the child file declares a `roadmap`, the parent and child must agree on `start:`: both absent, or both present with identical values. A mismatch is an error reported on the parent's `include` line. **This is an explicit exception to rule 8's "parent wins with warning" merge behaviour.** `start:` defines the shared timeline baseline, so silently shadowing a child's `start:` would cause rendered dates to drift from what the author wrote. `roadmap:ignore` is exempt because the child's roadmap content is dropped entirely.

### Parallel and group rules

1. `parallel` must contain at least 2 children (items or groups). A single-child parallel is a warning.
2. `group` must contain at least 1 child (item, parallel, or nested group).
3. `size`, `duration`, and `remaining` are not valid on `parallel` or `group` (computed from children).
4. `parallel` is valid inside swimlane or group. `group` is valid inside swimlane, parallel, or group.

