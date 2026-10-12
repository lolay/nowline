# Nowline Working Calendar

**Status: Accepted, implemented as m2p. Phases 1–3 (calendar primitives; the working-day schedule under `hide`; the exporters read the file's calendar) are implemented in lolay/nowline#96; Phase 4 (`show` and the display setting) is implemented in lolay/nowline#97; Phase 5a (the `non-working` and `working` declarations reach the language, the validator and the schedule) is implemented in lolay/nowline#115; Phase 5b (what the declarations draw, MS Project `<Exceptions>`, Mermaid dated `excludes`, editor and agent tooling) is implemented in lolay/nowline#118.** This is the design record for non-working days: weekends, holidays and company-wide closures such as a summit. The declarations in §4.1 parse and validate, and they feed the working calendar, so the chart's axis, engines A, B and C and every exporter's dates, durations and calendar follow them. A dated, titled `non-working` declaration is labelled on the chart (§7.4), and MS Project and Mermaid carry its days (§8).

The implementation plan, the decisions that close §11 and the codebase map are in [`handoffs/handoff-m2p-working-calendar.md`](./handoffs/handoff-m2p-working-calendar.md). As each phase ships:

- its normative parts move into [`dsl.md`](./dsl.md) (syntax, validation, includes) and [`rendering.md`](./rendering.md) (layout, rendering, exporters);
- this file stays as the rationale and the home of the worked examples.

This proposal supersedes the `WorkingCalendar` plan in [`rendering-v2.md`](./rendering-v2.md) § WorkingCalendar and [`milestones.md`](./milestones.md) § m2.5a (`weekendsOff()`, `withHolidays()`). See §12.

## 1. Summary

**A calendar decides which days count as work. The schedule counts only working days; the chart decides whether to draw the days that don't count.**

- **One name.** The concept is a *non-working day*. The declaration keyword is `non-working`, the display setting is `non-working:`, the render-time override is `--non-working`, and the positioned model carries `timeline.nonWorking`.
- **One mechanism.** Weekends, holidays and closures are all `non-working` declarations, recurring (`every:`) or dated (`date:`, or `start:` and `end:`), and a `working` declaration gives days back. `calendar:business` supplies one: `non-working weekend "Weekend" every:[sat, sun]`. Business gets no other special handling.
- **One schedule, two views.** Durations always count working days. The display setting only changes how dates map to x: `hide` (the default) collapses non-working days to a seam, and `show` draws them as shaded bands that work paints straight across.
- **The default changes little visually.** Under `hide`, a sequenced business roadmap that starts on a working day keeps today's item geometry. What changes is what was wrong: week labels, and every date-pinned entity, now land on the right day.

```nowline
config

non-working new-year "New Year's Day" date:2027-01-01
non-working summit "Company summit" start:2026-09-14 end:2026-09-16

default roadmap non-working:hide

roadmap r "Platform" start:2026-09-07 calendar:business
```

## 2. The problem today

The date axis counts calendar days and never skips one. `calendar:business` converts `1w` to 5 days and lays those 5 days on the calendar axis one for one. Every week of sequenced work therefore drifts two calendar days early against anything with a real date.

Probe, `start:2026-01-05 scale:1w calendar:business`, four chained `1w` items and a milestone on Friday Jan 30 (the true end of four working weeks):

| | Today |
|---|---|
| Last item drawn over | Jan 20 – Jan 25 (Tuesday to Sunday) |
| Milestone `date:2026-01-30` | a full week column to the right of the work |
| Week tick labels | `Jan 05, Jan 10, Jan 15, Jan 20, Jan 25, Jan 30` (Mon, Sat, Thu, Tue, Sun, Fri) |

The compression is 2/7, about 29%. Ten weeks of chained work appears about 20 days early against the now-line, milestones, anchors, `date:` and `after:DATE`.

The surfaces also disagree with each other, because each one hardcodes its own calendar:

| Surface | Today |
|---|---|
| SVG / PNG / PDF / HTML | business `1w` = 5 calendar days on the axis |
| Mermaid (`export-mermaid/src/duration.ts`) | `1w` passed through (Mermaid reads 7 calendar days); `1m` → 22d; `1y` → 252d; no `excludes` |
| XLSX (`export-xlsx/src/duration.ts`) | 5 / 22 / 252 working days per w / m / y, whatever the `calendar:`; no `q` |
| MS Project (`export-msproj/src/calendar.ts`) | always a Mon–Fri Standard calendar, even for `calendar:full` |

That table is the state before Phases 2 and 3. Phase 2 put the axis and the schedulers on working days. Phase 3 replaced the three exporters' duration tables and the MS Project calendar with engine C's calendar and durations (§8): all of them now match the chart, and the sizes, `q` and `capacity:` that the tables ignored now count.

## 3. Model

### 3.1 Two jobs

A calendar does two separate jobs:

1. **Duration arithmetic.** `days-per-week`, `days-per-month`, `days-per-quarter`, `days-per-year` convert `1w` / `1m` / `1q` / `1y` into a count of working days. Unchanged, including the no-transitivity rule (`dsl.md` § Calendar).
2. **Non-working days.** The set of calendar dates that consume no work: the preset's weekend and the file's `non-working` declarations, with the file's `working` declarations giving days back. Which one wins on a day is decided by specificity, never by order (§4.1).

`1d` is one working day. A duration of N working days starts on a working day and ends at the end of the Nth working day.

### 3.2 Presets

| Preset | `days-per-*` (unchanged) | Non-working days it supplies |
|---|---|---|
| `calendar:business` (default) | 5 / 22 / 65 / 260 | `non-working weekend "Weekend" every:[sat, sun]` |
| `calendar:full` | 7 / 30 / 91 / 365 | none |
| `calendar:custom` | from the `calendar` block | none |

A file's own `non-working weekend` declaration replaces the preset's, so a Fri/Sat or Sun–Thu week needs no custom calendar (§10, example C).

### 3.3 Units become coherent

On a calendar axis with weekends removed from the count, the business numbers line up with real time:

| Literal | Business working days | Calendar span (no holidays) |
|---|---|---|
| `1w` | 5 | 7 days |
| `1m` | 22 | ~31 days |
| `1q` | 65 | 13 weeks |
| `1y` | 260 | 52 weeks |

With holidays declared, a long duration spans correspondingly more calendar time. That is the intended reading: a year of work does take longer than a year when the company closes for two weeks.

## 4. Syntax

### 4.1 The `non-working` and `working` declarations

Two config keywords, beside `scale`, `calendar`, `style`, `symbol` and `default`. `non-working` takes days out of the schedule. `working` puts them back: a crunch Saturday, or a make-up day after a closure.

```
NonWorkingDeclaration:
    'non-working' (name=EntityName)? (title=STRING)?
    (properties+=EntityProperty)*;

WorkingDeclaration:
    'working' (name=EntityName)? (title=STRING)?
    (properties+=EntityProperty)*;
```

Neither takes a description. `EntityName` is the waves precedent (§4.4): the bare words `non-working` and `working` stay valid as ids and values.

| Property | Value | Meaning |
|---|---|---|
| `date:` | one ISO date, or a list | The dates the declaration covers: `date:2026-12-24`, `date:[2026-12-24, 2026-12-25]`. |
| `start:` | one ISO date | The first day of a range, or the day a recurrence begins. Inclusive. |
| `end:` | one ISO date | The last day of a range, or the day a recurrence stops. Inclusive. |
| `every:` | weekday or list: `sun mon tue wed thu fri sat` | A weekly recurrence. |

**Three shapes (NW1).** A declaration is exactly one of:

- **dates:** `date:` alone;
- **a range:** `start:` and `end:` without `every:`, which is the same as listing every date between them;
- **a recurrence:** `every:`, with `start:` and `end:` both optional. Without either bound it is open-ended, the weekly pattern that holds for every week of the file. With one bound it is open on the other side. With both it holds only inside the window.

Anything else is `NL.E0900`: no properties, `date:` with any other key, or a lone `start:` or `end:`. `start:` and `end:` take one date each (a one-element bracket is that date; two or more is `NL.E0902`). Any key other than the four is `NL.E0901`, including `style:`, `labels:`, `link:` and `wave:`.

**Precedence, by specificity (decision 18).** On any day, the most specific declaration that covers it decides, and a `working` declaration wins a tie:

1. a dated declaration (`date:`, or a `start:` / `end:` range);
2. a bounded recurrence (`every:` with `start:` and/or `end:`);
3. the open-ended week.

Declaration order, file order and include order never matter: the same declarations in any order give the same schedule, run titles and exports. `calendar:business` contributes its `weekend` to level 3. A `non-working` declaration **named `weekend`** replaces the preset's, whichever preset it is and whatever its shape (§3.2, example C); the rule counts every `non-working weekend`, malformed ones included, as the validator does.

The title labels the day on the chart (§7.4). An id is needed only to be the `weekend` or to be told apart in an include collision (§4.3).

A declaration whose value or shape is malformed is skipped by the resolver, because the validator already reported it in the root file and an include is not validated. "Malformed" is the validator's rule exactly: only the first `date:`, `start:`, `end:` and `every:` keys count, unknown keys beside a valid shape change nothing, a weekday listed twice merges, and every date must be a real calendar day (`2026-02-30` is `NL.E0405`, not March 2).

### 4.2 The display setting

`non-working:` joins `timeline-position` and `minor-grid` as a roadmap-only style key (shipped in Phase 4). Raw style keys are not allowed on the roadmap declaration (Rule 20 rejects `roadmap r non-working:show`), so it is set on the `default roadmap` line:

```nowline
config

default roadmap non-working:show
```

| Value | Meaning |
|---|---|
| `hide` (default) | Non-working days take no width. Each run collapses to a seam (§7.2). |
| `show` | Non-working days are drawn at full width and shaded (§7.3). |

The setting never affects the schedule, so it can also be chosen at render time. Precedence, first hit wins:

1. `--non-working hide|show` on the CLI, or the same option on every other surface: `nonWorking` in `@nowline/embed`, `@nowline/browser` and the MCP `render` / `export` tools, the `non-working` input of the GitHub Action, the preview toolbar's "Non-working days" menu and the `nowline.preview.nonWorking` setting in VS Code;
2. the file's `default roadmap non-working:`;
3. `hide`.

"Unset" is `undefined` on every surface and falls through to the file's key; no surface defaults the option to `hide`. In the VS Code preview the toolbar choice comes before the setting, and the toolbar's "File" entry means unset, so it also overrides a `hide` or `show` setting. There is no `.nowlinerc` key. A value other than `hide` or `show` in the file is `NL.E0800` (the shipped code for NW6); an invalid CLI value exits 2.

### 4.3 Includes

`non-working` and `working` declarations are config, so they follow `config:` modes. A shared holiday file is a style-library-shaped include:

```nowline
include "holidays-us-2026.nowline" roadmap:ignore
```

- **`config:merge`.** Every declaration of the child lands in the parent's list. A named child declaration is dropped, with the existing uncoded shadowing warning, when the parent already held one with the same keyword and name before this merge: `Non-working "x" from child.nowline is shadowed by the parent's definition.` (`Working "x" from …` for the other keyword). Collisions are per keyword, so `non-working h` and `working h` coexist. Unnamed declarations never collide; they all merge.
- **A child's own duplicate id** is `NL.E0907` in the child (§6, NW5), not a collision: both copies merge.
- **A diamond** (the same object reached twice) is skipped silently, as every other config map is.
- **`config:ignore`** merges nothing.
- **`config:isolate`** keeps the child's declarations in its isolated region's config, where they have no effect yet. The layout draws a region on the host's calendar (§7.6), and per-region calendars stay out of m2p (§11, question 7).
- **Order carries no meaning** (decision 18), so include order cannot change the schedule.
- **The validator sees only its own file.** A `non-working weekend` in an include does not feed NW3 or NW4 (§6), and an included file that closes the whole week is not reported (the root file would have had `NL.E0906`). The resolver falls back to the preset calendar rather than failing layout or export.

### 4.4 Lexer and v1 compatibility

- `non-working` is the first hyphenated keyword, and `working` is an ordinary English word. A lexer spike passed before any other work: both lex as keywords, `non-working-team`, `working-group`, `nonworking` and `workings` lex as `ID`, `non-working:` and `working:` lex as property keys, and the parser builds with `skipValidations: false`. It is kept as the permanent gate, `packages/core/test/strings-and-ids/non-working-identifier.test.ts`.
- Reserving the words follows the waves precedent ([`waves.md`](./waves.md) §4.7): an `EntityName` rule and the value rules list both, so `item non-working` and `after:working` keep parsing, and the JSON AST of an existing file stays byte-identical. The residual is the waves class: a bare `style`, `symbol`, `non-working` or `working` line takes the next line's keyword as its id.
- `end:` and `every:` are new property keys. On any other entity they get the existing unknown-property warning `NL.W0700`.
- The printer prints config entries in source order (it never sorts them), so declarations stay where the author wrote them. `every`, `start` and `end` join its key order, so a declaration prints `date`, `every`, `start`, `end`. Known side effect: an unknown `end:` or `every:` on any other entity now prints in that position instead of alphabetically after the known keys.
- The JSON AST carries `NonWorkingDeclaration` and `WorkingDeclaration` nodes with no code of their own (the JSON walkers are generic).

## 5. Scheduling semantics

### 5.1 Rules

1. **Start.** An item starts on the first working day at or after its computed start (`date:`, `start:`, `after:`, or the lane cursor).
2. **Consumption.** It consumes N working days, where N is its calendar duration in working days (`duration:`, or `size:` effort divided by `capacity:` as today). Durations stay in estimate units (decision 19): `1w` is `days-per-week` working days, laid on whatever the calendar leaves working. A `working` exception pulls an end in, and a `non-working` day inside a bar pushes it out.
3. **Finish.** It finishes at the end of its Nth working day.
4. **Successor.** A sequenced successor, or an `after:` dependent, starts on the next working day.
5. **Calendar-bound entities keep their dates.** `date:` on milestones and anchors, `after:DATE`, `before:DATE`, `start:` on the roadmap and the now-line are calendar dates. A milestone on a Saturday is legitimate and stays on Saturday.
6. **Snapping is reported.** When rule 1 moves an item's pinned start (`date:` or `after:DATE` on a non-working day), the layout emits an info insight naming the item, the pinned date and the date used.
7. **`before:DATE`** keeps today's cap: the finish (rule 3) may not pass the start of the pinned day. A hidden pinned day maps to the seam like any other date.
8. **`length:`** on the roadmap is a duration, so it counts working days like any other.
9. **Which days work** is decided by specificity (§4.1): dated declarations over bounded recurrences over the open-ended week, `working` winning a tie, and nothing depends on declaration or include order. The rules are put in a canonical order (first date, title, id, `working`, the weekday set, start and end) before the calendar is built, because the engine breaks ties between titled runs by input order.

Dates mark the start of their day, as they do today: a milestone dated on the last working day of a piece of work sits one day before that work's finish.

Fractional durations (`0.5d`, `1.5w`) consume fractions of a working day. Progress (`remaining:`, `status:`) and capacity are unaffected; they already work in single-engineer days.

### 5.2 Working-day index space

Every scheduler works in working-day indices and converts to dates only at the edges. Index 0 is the first working day at or after the base date, the roadmap start. The calendar carries no start of its own, so the index functions take the base as their first argument (UTC midnight). As shipped:

```ts
interface WorkingCalendar {
    daysPerUnit(unit: ScaleUnit): number;                  // unchanged: duration arithmetic
    addUnits(date: Date, count: number, unit: ScaleUnit): Date;
    readonly hasNonWorkingDays: boolean;                   // false: every function is plain calendar-day math
    isWorkingDay(date: Date): boolean;
    workingIndexOf(base: Date, date: Date): number;        // a non-working date maps to the next working day's index
    dateAtWorkingIndex(base: Date, index: number): Date;   // fractions floor
    nonWorkingRuns(from: Date, to: Date): NonWorkingRun[];
    readonly weekStart: number | undefined;                // first working weekday after the weekend (Monday for Sat/Sun)
    readonly rules: ReadonlyArray<CalendarRule>;
}

// working-calendar.ts, beside the interface
function spanEndDate(calendar: WorkingCalendar, base: Date, start: number, end: number): Date;
```

`spanEndDate` is the exclusive end date of a span of indices `[start, end)`: the day after the last whole working day the span covers, so a Mon–Fri item ends on Saturday. A span that covers no whole working day ends on its start date. Engine C uses it for every item and wave end, and engine A for a wave's end date (`spanEndDateAtX`). Dates that are points (a start, a milestone, an after-only milestone) come from `dateAtWorkingIndex`; anchors and dated milestones keep their own dates.

`fromCalendarConfig(cal)` (`working-calendar.ts`) builds the calendar from the resolved `CalendarConfig` and its rules (the preset's, by default). With no non-working day, `workingIndexOf` is `daysBetween(base, date)`, `dateAtWorkingIndex` is `addDays` and `spanEndDate` is `addDays(base, end)`: every function is the identity of today's code, which is what keeps `calendar:full` byte-stable.

### 5.3 The three engines

The waves handoff names them ([`handoffs/handoff-m2o-waves.md`](./handoffs/handoff-m2o-waves.md) §4.1). All three must agree:

- **Engine A, the pixel layout.** Under `hide`, x is linear in working index, so the engine's pixel arithmetic is unchanged: `TimeScale.forward` / `invert` change (§7.1), and so do the few places that convert between pixels and days by hand instead of through them (listed in the handoff's codebase map). Under `show`, the few duration-to-width sites advance through the calendar and every start snaps to a working day (§7.3). The engine's pixel-space quirks (caption spill into the lane cursor, the 8 px track gutter, the minimum bar width; divergences (b)–(d) in the waves handoff) stay in pixels; a quirk that pushes a start onto a hidden day snaps to the next working day like any other start.
- **Engine B, the day-space extent** (`computeContentEndDay`, `computeDateWindow` in `layout.ts`). It counts working days, and pins convert with `workingIndexOf`.
- **Engine C, the day-space schedule** (`scheduleRoadmap` in `schedule.ts`). Same change; its output dates come from `dateAtWorkingIndex`. It becomes the date source for every exporter (§8).

## 6. Validation rules

The `non-working` and `working` declarations share one check, and the kind in a message is `non-working` or `working`, verbatim in both languages. Messages are in EN and FR.

| Rule | Severity | Check |
|---|---|---|
| NW1 | error | A declaration is one of the three shapes of §4.1: `date:` alone; `start:` and `end:` without `every:`; or `every:` with optional `start:` and `end:`. Anything else is **`NL.E0900`**, once on the declaration. Any key other than `date`, `start`, `end` and `every` is **`NL.E0901`** on the property. `start:` or `end:` given a list is **`NL.E0902`**. |
| NW2 | error | Every date is a real ISO date (**`NL.E0405`**, one error per bad element, including the elements of a `date:` list and the single element of a bracketed `start:` / `end:`), and `end:` is not before `start:` (**`NL.E0903`**; equal is fine). |
| NW3 | error | `every:` values are weekday names (**`NL.E0904`**) without duplicates (**`NL.E0905`**), and the open-ended week keeps one weekday working (**`NL.E0906`**). See below. |
| NW4 | warning | `days-per-week` differs from the number of weekdays the open-ended week leaves working (**`NL.W0705`**). `calendar:custom` with `days-per-week: 6` and no `every:` triggers it. |
| NW5 | error | Duplicate id within one file, per keyword (**`NL.E0907`**): `non-working x` beside `working x` is fine. Include collisions use the existing config-merge warning (§4.3). |
| NW6 | error | `non-working:` on `default roadmap` is `hide` or `show`. Shipped as **`NL.E0800`**; it also covers a `non-working:` value inside a `style` block, one error per bad value. |
| NW7 | info (layout insight) | An item's pinned start falls on a non-working day and moved (§5.1 rule 6). Shipped as **`NL.I1008`**; it covers `date:`, `start:` and the date in an `after:`, for main-lane and isolated-region items alike. A tie between the pin and another constraint (the lane cursor, an `after:` reference) still reports. |

**The open-ended week** is the file's `non-working … every:` declarations with neither `start:` nor `end:`, plus the business preset's Saturday and Sunday unless the file declares `non-working weekend`, minus the file's open-ended `working … every:`. NW3 and NW4 both read it.

- **NW3.** If the open-ended week covers all seven days, `NL.E0906` is reported on each open-ended `non-working` declaration. Then, for each `non-working … every:` with exactly one bound, if the open-ended week plus its days covers all seven, it is reported too. A recurrence bounded on both sides may close all seven days (a closed window such as a year-end shutdown). The rule is the validator's mirror of the calendar's own `RangeError` for the root file.
- **NW4.** Reported on the custom block's `days-per-week` property when there is one, else on the roadmap's `calendar:` property, else on the first open-ended declaration, else on the roadmap declaration. Business with no declarations leaves 5 against 5, `calendar:full` 7 against 7, and example C 5 against 5, so all are quiet. It is skipped when no working weekday is left (`NL.E0906` reports that).
- A file with no `roadmap` declaration (an include) is skipped by NW3 and NW4, and a malformed declaration is left out of the open-ended week.
- **`NL.E0405`** on a calendar declaration checks that the date is a real calendar day. Other entities keep the looser check, which accepts `2026-02-30`.
- **`end:` and `every:` on any other entity** get the existing `NL.W0700`.

## 7. Rendering

### 7.1 One schedule, two projections

`TimeScale` stays the only date-to-x mapping. Its density is unchanged: `pixelsPerDay = pixelsPerUnit / daysPerUnit(unit)`, now read as pixels per *visible* day.

- **`hide`:** `forward(date) = originX + workingIndexOf(date) × pixelsPerDay`. A non-working date maps to the start of the next working day: the seam. `invert(x)` returns working dates only (the editor work depends on it).
- **`show`:** `forward(date) = originX + daysBetween(start, date) × pixelsPerDay`, exactly today's mapping.

Because the density is shared, `show` is wider than `hide` by the non-working days it adds back. A business week column is 40 px under `hide` and 56 px under `show` at the default week scale.

### 7.2 `hide`

- **The seam rule.** Every date on a hidden day maps to the seam. That covers milestones and anchors on a weekend, the now-line on a Sunday, a month start on a weekend (Feb 1 2026 is a Sunday), and a week start after a Monday holiday.
- **Ticks.** A tick takes its label from its boundary date (`Feb`, `May 25`) and its x from `forward`. Week boundaries are the first day after the recurring weekend (Monday for Sat/Sun). With no recurring declaration, week ticks keep stepping from the roadmap start, as today.
- **Zero-width columns are dropped,** with their labels: a fully closed week, or every weekend day at the `days` scale.
- **Narrow columns.** A week holding two holidays is 24 px wide at the default scale. The edge-column rule from [#92](https://github.com/lolay/nowline/pull/92) extends to every column under `hide`: a label wider than a column that is narrower than a full unit is dropped, and the tick stays (§11). A dropped label keeps its `labelX`. The closing tick's `major` flag follows the same column rule as the ticks before it.
- **Thinning** counts visible columns. At the `days` scale the default thinning labels week starts (Mondays under the business weekend) instead of every Nth visible column, which drifts once a week has six working days (handoff decision 4, amended by the maintainer on 2026-10-06). An explicit `label-every` still counts visible columns.
- **Seams.** An unnamed seam (a plain weekend) draws nothing at week scale and above, where it coincides with a week tick or is too dense to matter. At the `days` scale it draws a faint seam line: 1 px, dotted (`1 3`), in `timeline.nonWorkingSeam`, across the minor-grid range, only strictly inside the chart and only where no grid line already sits. A named seam always draws (§7.4).

### 7.3 `show`

- Non-working days are shaded bands behind all content, at day and week scale. At month scale and above, plain weekends are not shaded (about 5 px each); named runs still are.
- **Anything that spans a visible non-working day paints straight across it:** bars, groups, parallels, include brackets, wave strips and dependency arrows.
- A bar ends at the end of its last working day. It is not stretched over a trailing weekend, so chained items show the gap. Seeing that gap is the point of `show`.
- **Sides of a seam.** A seam is one point in `hide` space but two in `show` space: a start (a box start, a dated milestone or anchor, an arrow head) belongs on the right side, at the next working day's start, and a finish (a box end, an arrow tail) on the left, at the end of the last working day. Engine A gets this natively: under `show` it advances every duration through the calendar and snaps every start to a working day, rather than projecting a finished `hide` layout. See decision 8 in the [handoff](./handoffs/handoff-m2p-working-calendar.md).

As built (Phase 4), the rules above resolve to these specifics, normative text in [`rendering.md` § Timeline Scale](./rendering.md#timeline-scale):

- **Bands.** Each non-working run is one `PositionedNonWorkingRun` with its `x` and right edge clamped to the window and its `from` / `through` kept as the run's real dates, so a run that straddles the window edge reads as the part inside it. A run carries `band: true` at the days and weeks scales, or when it has titles (Phase 5); it never carries `seam`. At month scale and above no plain weekend carries `band`, so none is shaded, but the runs still exist and keep their meaning for consumers.
- **Layer.** `<g data-layer="non-working">` sits after the lane backgrounds and before `wave-bg` and the grid (the name must not contain "wave"). It is re-emitted inside an isolated include region right after the region's fill rect and before the wave layers, clipped by rect intersection, with no `clipPath`. When no run is banded the layer is not emitted, so `hide` output gains no bytes.
- **Y-range.** From `chartBox.y` to the bottom of the timeline box, the span the seam and minor-grid lines use, so a band covers the lanes and not the header or marker rows. Fill is `timeline.nonWorkingFill` (light `#64748b`, dark `#94a3b8`, grayscale `#737373`) at `fill-opacity` 0.1 (`NON_WORKING_FILL_OPACITY`, exported from `@nowline/layout`).
- **Month-scale rule.** `fullUnitPx` counts calendar days under `show`. At month scale and above, a closing column that holds no working day is merged into the column before it. Engine B ends a window on Monday Feb 2 after a Sunday Feb 1 boundary, and `hide` already drops that column for having zero width; without the merge `show` would draw a one-day `Feb` sliver at the right edge.
- **Sliver merge limit.** The merge is for the closing column only. A leading sliver (a window that starts on a Sunday, so the first column holds no working day) keeps its tick, and its label is dropped by the #92 edge-column rule. This is a known limit.
- **Snap sites.** Starts snap to a working day (`TimeScale.startX`) only where they become geometry: `sequenceItem`'s placed start (after `waveFloorX`, `wavePinOverrideOf` and `nonWorkingPinOf` have run on the pre-snap value), group and parallel box left edges (a group's width is `max(snapped, timeCursorX, usedRightX) − snapped`), and the row packer's predicted extent and `firstChildStartX`. Lane cursor seeds, wave floors and include regions are not snapped. This is a deliberate deviation from the handoff's §6 wording ("the lane cursor, wave floors go through `startX`") with the same resulting geometry: it keeps `NL.I1008`, `NL.W1001` and their tie rules identical in both views and keeps floors raw, as decision 11 requires.
- **Widths.** One helper, `itemSpanPx` in `working-span.ts`, serves all four duration-to-width sites. Under `hide` it returns the legacy `days × pixelsPerDay` verbatim, so there is no float drift; under `show` it returns `advanceX(startX, days) − startX`.

### 7.4 Named non-working days

A run that contains a titled declaration is labelled in both views:

- under `hide`, as a thin cut line at the seam, styled like an anchor's but lighter, with its label (`Company summit · 3d`) packed into the marker row by the existing marker packer;
- under `show`, as a band whose label is packed into the marker row at the band's left edge.

New theme tokens: `timeline.nonWorkingFill` and `timeline.nonWorkingSeam`. The cut line uses the seam token and the label the `timeline.labelText` token, so labels need no new one.

As built (Phase 5b), normative text in [`rendering.md` § Timeline Scale](./rendering.md#timeline-scale):

- **Label text.** The run's `titles` joined with `, `, then ` · Nd` (U+00B7, one space each side), where N counts the days in `[from, through]` whose weekday is in the open-ended week's `workingWeekdays`: the working days the closure removes, which is what the DSL's `d` counts. The suffix is dropped when N is 0 (a titled run made only of weekend days), so `non-working "Sat off" date:2026-11-28` reads `Sat off`. A Wednesday-to-Friday summit reads `Company summit · 3d`; two declarations on the same days read `Alpha, Beta · 2d`.
- **Which rules are labelled.** Only dated, titled, non-working rules give a run titles. A titled bounded recurrence (`every:` with `start:` or `end:`) and a titled `working` exception are never labelled on the chart. This is a known limit, not a bug; the days still shape the schedule and the exports, and the editor's hover on such a declaration says its title is not drawn ([`ide.md`](./ide.md)).
- **The cut line.** Under `hide`, a titled run always draws its cut line, at every scale, independent of `seam` (which keeps its Phase 4 meaning: unnamed, days scale, off a grid line). Spec §7.2: a named seam always draws. The line runs from the label's row to the bottom of the timeline.
- **Packing.** A titled run is one more entry in the marker row, placed after the anchors and milestones, so a marker that ties it on x is placed first. A file whose only marker-row content is a titled run still gets a marker row. Under `hide`, Example B's Saturday Launch and the Thanksgiving label share x = 24, so Launch takes row 1 and the label a new top row.
- **Canvas growth.** If a run's label fits neither to the right of its x nor to the left of the chart, the chart grows on the right until it fits, so a label never falls onto the header card beside the chart. Anchors and milestones keep their existing left fallback; this growth covers run labels only.
- **Layer.** `<g data-layer="non-working-label">` follows the milestone cut lines and precedes the marker diamonds, so the cut lines sit over the bars, as milestone cut lines do. It is omitted when no run has a label. The name must not contain "wave".

### 7.5 Positioned model

As built, `PositionedTimelineScale` gains two optional keys, set only when the window holds a non-working day under `hide` and omitted otherwise (so `calendar:full` and `calendar:custom` models carry neither):

```ts
nonWorkingDisplay?: NonWorkingDisplay;      // 'hide' | 'show'
nonWorking?: PositionedNonWorkingRun[];

interface PositionedNonWorkingRun {
    x: number;          // seam x under hide, band left edge under show (clamped to the window)
    width: number;      // 0 under hide; the clamped band width under show
    from: Date;         // first non-working date of the run (real date, never clamped)
    through: Date;      // last non-working date, inclusive (real date, never clamped)
    titles?: string[];  // titled declarations in the run; omitted for a plain weekend
    seam?: true;        // hide, days scale only: strictly inside the chart, no grid line at x; the renderer draws a seam
    band?: true;        // show, days and weeks scales or a run with titles: the renderer shades it; never with seam
    label?: string;     // titled runs only: `Thanksgiving · 2d` (§7.4)
    labelBox?: BoundingBox;      // titled runs only: the label's box in the marker row, like PositionedMilestone.labelBox
    labelSide?: 'left' | 'right'; // titled runs only: which side of `x` the label sits on
    cut?: true;         // hide only, titled runs only: the renderer draws the named cut line at x
}
```

The four label keys are omitted on every run without titles (never `undefined` or `[]`), so a plain weekend's model is unchanged.

Other optional keys, each omitted when empty:

- `PositionedAnchor.hiddenDate` and `PositionedMilestone.hiddenDate`: the real ISO date of a marker dated on a hidden day. The marker sits at the seam; the renderer adds it as an SVG `<title>`.
- `PositionedMilestone.overrunDate`: the milestone's own date, so NL.I1007 no longer reads a date back off x.
- `PositionedItem.nonWorkingPin`: `{ key: 'date' | 'start' | 'after'; pin: string; start: string }`, the source of NL.I1008.
- `ResolvedStyle.nonWorking` (`'hide'` | `'show'`, default `'hide'`): the roadmap's resolved display setting, carried by every resolved style object in every calendar like `minorGrid` and `timelinePosition`. The render-time option replaces it when the layout is built, so `timeline.nonWorkingDisplay` is the value that was drawn.
- `hiddenDate` is set only when the marker's date is hidden (`!showsNonWorking && !isWorkingDay`). Under `show` a marker dated on a weekend sits on its own date.
- Theme tokens `timeline.nonWorkingSeam` (light `#a0aec0`, dark `#6b7a90`, grayscale `#9a9a9a`) and `timeline.nonWorkingFill` (light `#64748b`, dark `#94a3b8`, grayscale `#737373`, drawn at 0.1 opacity).

Consumers that do date math from `pixelsPerDay` must use `forward` / `invert` instead. That includes the test helpers added in [#92](https://github.com/lolay/nowline/pull/92) that recover tick dates from x.

### 7.6 Several roadmaps in one chart

The root roadmap's calendar and display setting define the axis. An isolated include schedules with its own calendar and projects onto the root axis. Its own extra non-working days are not hidden; they shade inside the region under either view.

## 8. Exporters

Every exporter reads engine C's dates, durations and calendar. `resolveWorkingCalendar(file, resolved)` in `@nowline/layout` is the one resolver; `RoadmapSchedule.calendar` carries its result and `ScheduledItem.days` each item's duration in working days (0 when it has none), so no exporter keeps its own duration table. `WorkingCalendar.workingWeekdays` is the open-ended week's working weekdays (0 = Sunday): Monday to Friday for business, all seven for full and custom.

| Exporter | Phase 3 (built; the presets, since a file declares no days off yet) | Phase 5 (declarations) |
|---|---|---|
| XLSX | Start / End (exclusive) from engine C. The Duration column is `days` (`q`, declared sizes and `capacity:` included; 0 when there is none). The Roadmap sheet gains a `Calendar` row after `Start`, e.g. `business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)`. | — |
| MS Project | `<WeekDays>` from `workingWeekdays`: Mon–Fri under business, byte-identical to before, and seven working days under `calendar:full` and `calendar:custom`. A task lasts `days` × 480 minutes (480 when it has no duration). | `<WeekDays>` from the recurring declarations; one `<Exception>` per run of days the file's calendar differs from that week (a dated closure, a bounded recurrence's closed days, a working day inside a closed weekend), titled when a titled dated rule is behind it. No `<WorkWeeks>`: see below. |
| Mermaid | Business emits `excludes saturday, sunday` after `dateFormat`; full and custom emit none. Durations are `Nd` from `days` (`28d` for a full `4w`). The roadmap start and wave-end milestones move to the first working day at or after them, because Mermaid never checks a start against `excludes`; anchors and dated milestones keep their dates (rule 5). | One `excludes` line: the weekday names, then the ISO date of every day in every non-working exception, ascending (`excludes saturday, sunday, 2026-11-26, 2026-11-27`). Mermaid takes the dates out of task durations too. A `working` exception cannot be expressed; it is counted in the lossy summary as `working-day`. |
| JSON AST | Not in Phase 3. | Built in 5a: `NonWorkingDeclaration` and `WorkingDeclaration` nodes (no JSON code, the walkers are generic); printer support; the round-trip tests cover every shape. |
| SVG / PNG / PDF / HTML | Follow the layout and the display setting. | Same. |

**Phases 5a and 5b.** A file's declarations reach every exporter through the one resolver. An open-ended recurrence moves what follows `workingWeekdays`: the MS Project `<WeekDays>`, the Mermaid `excludes friday, saturday` line and the XLSX Calendar row (`business (Friday and Saturday off; 5/22/65/260 days per week/month/quarter/year)` for example C). Dated and bounded rules move engine C's start and end dates in every exporter (5a), and 5b writes the days themselves. `calendarExceptions(working, from, to)` in `@nowline/layout` is the one derivation both exporters call: each exception is a maximal run of consecutive days whose working state differs from the open-ended week, split wherever the state flips.

- **Horizon.** `[from, to)`, the roadmap's window, together with every finite bound of every rule (its `dates`, and its `start` / `end` when set). A declared holiday outside the window is still exported, a half-open bounded recurrence is expanded only inside the horizon, and nothing iterates forever.
- **Titles.** The titles of the dated or ranged rules (no `every`) whose `working` equals the exception's state and that cover a day of it, in the resolver's canonical order, de-duplicated. The key is omitted when there are none.
- **MS Project.** `<Exceptions>` goes in base calendar UID 1 right after `</WeekDays>`; the resource calendar is unchanged. Each `<Exception>` has `TimePeriod` (`FromDate` at `T00:00:00`, `ToDate` at `T23:59:00`), `Occurrences` 1, `Name` (the titles joined with `, `, XML-escaped, omitted without titles), `Type` 1 (daily) and `DayWorking` 0 or 1; a working exception repeats the `WorkingTimes` of a weekday (08:00-12:00 and 13:00-17:00).
- **No `<WorkWeeks>`.** An earlier draft of this section had a bounded recurrence become a `<WorkWeeks>` entry. Phase 5b writes `<Exceptions>` instead: a bounded recurrence becomes one exception per run of days it changes, and the exceptions never overlap. This deviates from the earlier wording of this section, and the deviation is deliberate.
- **Mermaid.** The dated `excludes` follow the weekday names on the same line; the line is written when either list is non-empty, so `calendar:full` with a holiday gets `excludes 2026-03-02`.

**5a and 5b ship in the same release**, as Phases 2 and 3 did, or the exporters disagree with the chart: until 5b, Mermaid lays a holiday-spanning `Nd` across the holiday, and MS Project does not know the closure.

Known limits: Mermaid has no working exceptions (its parser has an undocumented `includes` keyword, but the gantt docs do not list it and GitHub's bundled Mermaid may lack it), so a `working` day inside a closed week is counted as `working-day` in the lossy summary and written nowhere else; only dated, titled, non-working rules are labelled on the chart (§7.4). Not fixed in Phase 3: MS Project ignores the roadmap's `start:` (it uses the export date or `--start`) and has no implicit lane sequencing, so its schedule cannot match the chart; it writes no `<MinutesPerWeek>` or `<DaysPerMonth>`, so a full-calendar `1w` displays as 1.4 default weeks; Mermaid ignores item `date:` / `start:` pins, writes `after:DATE` verbatim and rounds fractional days; exporters walk only the root file, so merged and isolated include items are not exported.

## 9. Rollout and byte stability

### 9.1 What changes

| Input | Change |
|---|---|
| `calendar:full`, no `non-working` declarations | None to layout and rendering: the mapping is the identity. Export cells move in Phase 3, as fixes: durations count 7 / 30 / 91 / 365 and the MS Project calendar gets seven working days. |
| `calendar:custom`, no `every:` | None to layout and rendering, plus NW4 (`NL.W0705`) when `days-per-week` is not 7 (Phase 5a: it fires on `examples/product.nowline` and `tests/grammar-properties.nowline`; it is a warning, so render bytes do not move). Export cells move in Phase 3, as fixes: durations follow the file's `days-per-*` and the MS Project calendar gets seven working days. |
| `calendar:business` (the default), `hide` | Sequenced items that start on a working day keep their x. Week ticks keep their x and change label (`Jan 10` → `Jan 12`). Date-pinned entities, the now-line and the window end move to the right day. |
| `calendar:business`, `show` | Everything after the first weekend moves right, by design. |
| A file with no `non-working` or `working` declaration (Phase 5a) | None: every layout snapshot, determinism cell and rendered example stays byte-identical, and so does every JSON AST. |
| A file with declarations (Phases 5a, 5b) | The calendar changes, so dates, x and run titles follow it. A titled run is shaded under `show` at every scale and labelled in both views (5b). MS Project gains `<Exceptions>` and Mermaid dated `excludes`. |
| A file with no declaration (Phase 5b) | None: the label keys, the `non-working-label` layer, `<Exceptions>` and dated `excludes` all need a declaration. The deliberate additions are two snapshot samples (`non-working-hide`, `non-working-show`), one determinism fixture (`working-calendar`, eight cells), one rendered example and two rendered test fixtures. |

The 14 business-calendar layout snapshots (of 19; the five waves samples use `calendar:full`) and every business determinism cell that renders a picture change. For a fixture without date pins and without a now-line in its window, the only change is week-label text. Phase 3 moves every `xlsx` and `mermaid` determinism cell (the Calendar row, `End (exclusive)` and the durations; `excludes` on business) and the `msproj` cells with sized items or the full calendar. The CHANGELOG entry goes under `### Changed`: the business calendar now does what `dsl.md` already says it does ("engineering working-day arithmetic").

### 9.2 Phases

1. **Weekends, hidden.** `WorkingCalendar` with recurring non-working days; the business preset's `weekend`; the `hide` projection and `invert`; engines B and C in working days; ticks and window end; MS Project, Mermaid and XLSX read the calendar. No new syntax. This phase removes the compression.
2. **`show`.** The sided projection, shading, the `non-working:` display key, and `--non-working` across CLI, embed, VS Code and MCP.
3. **Declarations,** in two PRs that ship in the same release.
   - **5a, declarations reach the schedule.** `non-working` and `working` with `date:` / `start:` / `end:` / `every:`, overriding `weekend`, validator rules NW1–NW5, include merge, and the resolver that feeds engines A, B and C and every exporter's calendar.
   - **5b, declarations on the chart and in exports (built).** Labelled seams and bands, MS Project `<Exceptions>`, Mermaid dated `excludes`, LSP completion, the TextMate grammar and the other editor and agent tooling.
4. **Per-swimlane calendars,** only on demand (§11).

## 10. Worked examples

All examples use the default scale (`1w`, 40 px per business week, 8 px per visible day).

### Example A: the probe, both views

```nowline
nowline v1

roadmap r "R" start:2026-01-05 scale:1w calendar:business

milestone fri "Fri Jan 30" date:2026-01-30

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
  item w4 "W4" duration:1w
```

Schedule: W1 Jan 5–9, W2 Jan 12–16, W3 Jan 19–23, W4 Jan 26–30.

| | Today | `hide` | `show` |
|---|---|---|---|
| W4 x (relative to origin) | 120–160, over Jan 20–25 | 120–160, Jan 26–30 | 168–208 |
| Milestone x | 200 | 152 | 200 |
| Week ticks | Jan 05, 10, 15, 20, 25, 30 | Jan 05, 12, 19, 26 | Jan 05, 12, 19, 26 (at 0, 56, 112, 168) |
| Shading | none | none | 40–56, 96–112, 152–168, 208–224 |

### Example B: a holiday inside a bar

```nowline
nowline v1

config

non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27

roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
```

Schedule: Checkout uses Mon Nov 23, Tue 24, Wed 25, Mon 30 and Tue Dec 1. QA uses Wed Dec 2 and Thu Dec 3. Pixels are relative to the timeline origin. A box sits 6 px inside its logical extent, and QA's `hide` box is the 8 px minimum width.

| | `hide` | `show` |
|---|---|---|
| Checkout box | 6–34 (logical 0–40) | 6–66 (logical 0–72) |
| QA box | 46–54 (logical 40–56, minimum width) | 78–86 (logical 72–88) |
| Milestone x | 24, `hiddenDate` `2026-11-28` | 40, no `hiddenDate` |
| Ticks | `[0,undefined]`, `[24,'Nov 30']`, `[64,undefined]` | `[0,'Nov 23']`, `[56,'Nov 30']`, `[112,undefined]` |
| Width, `endDate` | 64, 2026-12-07 | 112, 2026-12-07 |
| Runs | `[24,0,'2026-11-26','2026-11-29',['Thanksgiving']]` and `[64,0,'2026-12-05','2026-12-06']` (no `titles` key) | `[24,32,…,['Thanksgiving'],band]` and `[96,16,'2026-12-05','2026-12-06',band]` |
| Label of the titled run | `Thanksgiving · 2d`, `cut: true`, `labelSide` `right`, `labelBox` x 30, 98.6 wide, 12 high | `Thanksgiving · 2d`, no `cut`, `labelSide` `right`, `labelBox` x 30, 98.6 wide, 12 high |
| Marker rows | The run on row 0 (`labelBox.y` = `markerRow.y − 4`), Launch on row 1 (`center.y` = `markerRow.y + 26`); `markerRow.height` 52 | Launch on row 0 (`center.y` = `markerRow.y`), the run on row 1 (`labelBox.y` = `markerRow.y + 22`); `markerRow.height` 52 |
| Launch label | `labelSide` `right`, `labelBox` x 36, 36.54 wide | `labelSide` `right`, `labelBox` x 52, 36.54 wide |
| Model `width` | 272.6 (250.32 without the label; the canvas grows so the label sits on the right) | 282.32 |
| Weekend run `2026-12-05` to `2026-12-06` | No `label`, `labelBox`, `labelSide` or `cut` key | Same |

Runs read `[x, width, from, through, titles, band]`. The label, `labelBox`, `labelSide` and `cut` columns are positions in the marker row relative to the timeline origin, like a milestone's.

- **`hide`:** Thursday through Sunday collapse into one seam at x = 24. The Saturday milestone sits on that seam. The first week column is 24 px wide, so its `Nov 23` label is dropped under the narrow-column rule. The seam is labelled `Thanksgiving · 2d`, with a cut line from the label down to the bottom of the timeline. Launch and the label share x = 24, so Launch is placed first, on row 0 of the marker row, and the label takes a row above it; the marker row grows from one row to two.
- **`show`:** Checkout is painted across the shaded Nov 26–29 band (24–56). QA follows at 72–88. The milestone sits at 40, on its Saturday. The band's label `Thanksgiving · 2d` sits at x = 30, on the second marker row, with no cut line.
- **Engine C**, the same in both views: checkout `2026-11-23` to `2026-12-02` (exclusive, 5 days), qa `2026-12-02` to `2026-12-04` (2 days), launch `2026-11-28`.
- **`date:[2026-11-26, 2026-11-27]`** in place of `start:` and `end:` gives the same model under `hide` and the same engine C.
- Without the declaration the file lays out as it always did: Checkout 6–34, QA 46–54, the milestone at x = 40 with `hiddenDate`, and no titled run.
- **MS Project** writes the closure in the base calendar (UID 1), right after `</WeekDays>` and before `</Calendar>`. `<WeekDays>` still marks Saturday and Sunday non-working, and the resource calendar (UID 2) is unchanged:

  ```xml
        </WeekDays>
        <Exceptions>
        <Exception>
          <EnteredByOccurrences>0</EnteredByOccurrences>
          <TimePeriod>
            <FromDate>2026-11-26T00:00:00</FromDate>
            <ToDate>2026-11-27T23:59:00</ToDate>
          </TimePeriod>
          <Occurrences>1</Occurrences>
          <Name>Thanksgiving</Name>
          <Type>1</Type>
          <DayWorking>0</DayWorking>
        </Exception>
        </Exceptions>
      </Calendar>
  ```

- **Mermaid** writes one `excludes` line, `    excludes saturday, sunday, 2026-11-26, 2026-11-27`, and the task lines stay as they were (`Checkout :checkout, 2026-11-23, 5d`, `QA :qa, after checkout, 2d`, `Launch :milestone, launch, 2026-11-28, 0d`). With the dates excluded, Mermaid ends Checkout on Dec 2 (exclusive), agreeing with engine C. There is no drop summary.

### Example C: a Sunday–Thursday week

```nowline
nowline v1

config

non-working weekend "Weekend" every:[fri, sat]

roadmap r "R" start:2026-01-04 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
```

The file's `weekend` replaces the preset's. `1w` is Sunday through Thursday, week ticks fall on Sundays, and `days-per-week: 5` agrees with the five working days, so NW4 stays quiet.

- **`hide`:** boxes 6–34, 46–74 and 86–114. Ticks `[0,'Jan 04']`, `[40,'Jan 11']`, `[80,'Jan 18']`, `[120,'Jan 25']`, `[160,'Feb 01']`, `[200,'Feb 08']` and `[240,undefined]`. The first run is `[40,0,'2026-01-09','2026-01-10']`, and there is no Saturday–Sunday run.
- **`show`:** boxes 6–34, 62–90 and 118–146, with ticks every 56 from `Jan 04`.
- **Engine C:** w1 `2026-01-04` to `2026-01-09`, w2 `2026-01-11` to `2026-01-16`, w3 `2026-01-18` to `2026-01-23` (exclusive ends).
- **Calendar:** `resolveWorkingCalendar(...).working.workingWeekdays` is `{0,1,2,3,4}` and `weekStart` is 0. Mermaid emits `excludes friday, saturday`, MS Project marks Friday and Saturday non-working, and the XLSX Calendar row reads `business (Friday and Saturday off; 5/22/65/260 days per week/month/quarter/year)`.

### Example D: a working exception

Example A plus one declaration:

```nowline
config

working crunch "Crunch Saturday" date:2026-01-10
```

The crunch Saturday is a working day, so work that crosses it ends a day sooner.

- **`hide`:** the item boxes keep their x (6–34, 46–74, 86–114, 126–154). The Friday milestone moves from 152 to 160. Ticks `[0,'Jan 05']`, `[48,'Jan 12']`, `[88,'Jan 19']`, `[128,'Jan 26']`, `[168,'Feb 02']` and `[208,undefined]`. The first run is `[48,0,'2026-01-11','2026-01-11']`.
- **`show`:** W2 46–82, W3 94–138 and W4 150–194. W4 was 174–202, so its end comes in by one day. The first run is `[48,8,'2026-01-11','2026-01-11',band]`.
- **Engine C:** w2 `2026-01-10` to `2026-01-16`, w3 `2026-01-16` to `2026-01-23`, w4 `2026-01-23` to `2026-01-30` (it was `2026-01-26` to `2026-01-31`).

### Example E: precedence

Each row adds the declarations to Example A and reports engine C's W4 and the `hide` runs (`[x, width, from, through]`). Example A's own W4 is `2026-01-26` to `2026-01-31`.

| Declarations | Engine C | `hide` runs |
|---|---|---|
| `non-working every:fri start:2026-01-12 end:2026-01-25` (a bounded recurrence over the open week) | w2 `01-12`–`01-20`, w3 `01-20`–`01-28`, w4 `01-28`–`02-04` | `[72,0,'2026-01-16','2026-01-18']`, `[104,0,'2026-01-23','2026-01-25']` |
| `working every:sat start:2026-01-12 end:2026-01-25` and `non-working date:2026-01-17` (dated beats bounded) | w4 `01-24`–`01-30` | `[80,0,'2026-01-17','2026-01-18']`, `[128,0,'2026-01-25','2026-01-25']` |
| `non-working date:2026-01-14` and `working date:2026-01-14` (`working` wins a dated tie) | equal to Example A | equal to Example A |
| `non-working every:wed start:2026-01-12 end:2026-01-25` and `working every:wed start:2026-01-12 end:2026-01-25` (`working` wins a bounded tie) | equal to Example A | equal to Example A |

Any order of the declarations, in the file or in a `config:merge` include, gives the same result. Two titled dated rules that start the same day (`non-working "Beta" start:2026-12-24 end:2026-12-25` and `non-working "Alpha" date:2026-12-24`) give the run `2026-12-24` to `2026-12-27` the titles `['Alpha','Beta']` in either order.

## 11. Scope, non-goals and open questions

**In scope.** Roadmap-wide recurring and dated non-working days, shareable through includes, with a choice of view.

**Non-goals.** `principles.md` rules out Gantt-chart scheduling and resource contention. So: no per-person time off, no working hours or partial days, no capacity reduction on a non-working day, no recurrence rules beyond weekly (holiday files list their dates), and no time zones (dates stay floating). A code freeze is not a non-working day; work continues through it, so it belongs to an annotation feature, not to the calendar.

**Open questions** (all decided; see §3 of the [handoff](./handoffs/handoff-m2p-working-calendar.md)).

1. **The keyword.** Decided: `non-working`, plus `working` for exceptions, and the lexer spike passed (decision 1 in the handoff's decision log; `dsl.md` Design Rule 1 goes from 22 to 24 keywords).
2. **Ranges.** Decided: `date:` takes one date or a list, and `start:` / `end:` (inclusive) give a range or bound an `every:`; `through:` is dropped (decision 2, amended 2026-10-06).
3. **Narrow columns under `hide`.** Dropping the label is the simple rule. The alternative lets a label extend into a neighbouring column whose own label is thinned.
4. **Thinning at the `days` scale.** The default thins to every 7th day ("weekly markers"). Under `hide` that should become every Nth visible day, where N is the working days per week.
5. **Markers on hidden days.** A Saturday milestone under `hide` sits on the seam. Should its label carry the date (`Launch (Sat Nov 28)`), or is the hover title enough?
6. **Versioning.** The business calendar's dates change under `nowline v1`. This proposal treats that as a fix that matches the existing spec text (a `Changed` entry). The alternative is gating the new behaviour behind an opt-in.
7. **Per-swimlane calendars.** Different regional holidays per team. A swimlane would reference a named calendar; under `hide`, the axis still follows the root calendar, so the lane's extra days would shade. Deferred until there is demand, because it edges toward resource management.

## 12. Superseded design

`rendering-v2.md` and `milestones.md` § m2.5a planned a `WorkingCalendar` that compresses the axis (`weekendsOff()` "shrinks `pixelsPerDay`") as *the* model, with business mode as a factory call. Only the `WorkingCalendar` interface stub landed; no compression shipped. This proposal keeps the interface name and replaces the plan in two ways:

- the schedule and the view are separate: compression is the `hide` projection of a schedule that is always computed in working days, and `show` is equally supported;
- non-working days are data (`non-working` declarations), not factories, so holidays and closures need no code.
