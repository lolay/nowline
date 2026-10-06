# Nowline Working Calendar

**Status: Accepted, scheduled as m2p. Not implemented.** This is the design record for non-working days: weekends, holidays and company-wide closures such as a summit. Today's parser rejects the `non-working` syntax shown here, and today's layout does not skip any day.

The implementation plan, the decisions that close §11 and the codebase map are in [`handoffs/handoff-m2p-working-calendar.md`](./handoffs/handoff-m2p-working-calendar.md). As each phase ships:

- its normative parts move into [`dsl.md`](./dsl.md) (syntax, validation, includes) and [`rendering.md`](./rendering.md) (layout, rendering, exporters);
- this file stays as the rationale and the home of the worked examples.

This proposal supersedes the `WorkingCalendar` plan in [`rendering-v2.md`](./rendering-v2.md) § WorkingCalendar and [`milestones.md`](./milestones.md) § m2.5a (`weekendsOff()`, `withHolidays()`). See §12.

## 1. Summary

**A calendar decides which days count as work. The schedule counts only working days; the chart decides whether to draw the days that don't count.**

- **One name.** The concept is a *non-working day*. The declaration keyword is `non-working`, the display setting is `non-working:`, the render-time override is `--non-working`, and the positioned model carries `timeline.nonWorking`.
- **One mechanism.** Weekends, holidays and closures are all `non-working` declarations, recurring (`every:`) or dated (`date:` and optional `through:`). `calendar:business` supplies one: `non-working weekend "Weekend" every:[sat, sun]`. Business gets no other special handling.
- **One schedule, two views.** Durations always count working days. The display setting only changes how dates map to x: `hide` (the default) collapses non-working days to a seam, and `show` draws them as shaded bands that work paints straight across.
- **The default changes little visually.** Under `hide`, a sequenced business roadmap that starts on a working day keeps today's item geometry. What changes is what was wrong: week labels, and every date-pinned entity, now land on the right day.

```nowline
config

non-working new-year "New Year's Day" date:2027-01-01
non-working summit "Company summit" date:2026-09-14 through:2026-09-16

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

## 3. Model

### 3.1 Two jobs

A calendar does two separate jobs:

1. **Duration arithmetic.** `days-per-week`, `days-per-month`, `days-per-quarter`, `days-per-year` convert `1w` / `1m` / `1q` / `1y` into a count of working days. Unchanged, including the no-transitivity rule (`dsl.md` § Calendar).
2. **Non-working days.** The set of calendar dates that consume no work: the union of every recurring and dated `non-working` declaration in effect.

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

### 4.1 The `non-working` declaration

A config keyword, beside `scale`, `calendar`, `style`, `symbol` and `default`:

```
NonWorkingDeclaration:
    'non-working' (name=ID)? (title=STRING)?
    (properties+=EntityProperty)*;
```

| Property | Value | Meaning |
|---|---|---|
| `date:` | ISO date | The first (or only) non-working date. |
| `through:` | ISO date | Optional, with `date:`. The last non-working date, inclusive. |
| `every:` | weekday or list: `sun mon tue wed thu fri sat` | A recurring weekly non-working day. |

Exactly one of `date:` and `every:` is required. The title labels the day on the chart (§7.4). An id is required only to override or reference the declaration (`weekend`).

### 4.2 The display setting

`non-working:` joins `timeline-position` and `minor-grid` as a roadmap-only style key. Raw style keys are not allowed on the roadmap declaration, so it is set on the `default roadmap` line:

```nowline
config

default roadmap non-working:show
```

| Value | Meaning |
|---|---|
| `hide` (default) | Non-working days take no width. Each run collapses to a seam (§7.2). |
| `show` | Non-working days are drawn at full width and shaded (§7.3). |

The setting never affects the schedule, so it can also be chosen at render time. Precedence, first hit wins:

1. `--non-working hide|show` on the CLI, or the same option in `@nowline/embed`, the VS Code preview and the MCP `render` / `export` tools;
2. the file's `default roadmap non-working:`;
3. `hide`.

### 4.3 Includes

`non-working` declarations are config, so they follow `config:` modes with no new rules. A shared holiday file is a style-library-shaped include:

```nowline
include "holidays-us-2026.nowline" roadmap:ignore
```

On `config:merge` the parent wins on an id collision, with the existing shadowing warning. Unnamed declarations never collide; they all merge.

### 4.4 Lexer and v1 compatibility

- `non-working` would be the first hyphenated keyword. Hyphens are already legal in `ID` and in property keys. Langium sets Chevrotain `longer_alt` for keywords, so `non-working-team` should still lex as `ID`. This needs a grammar test before the name is final (§11).
- Reserving the word follows the waves precedent ([`waves.md`](./waves.md) §4.7): an `EntityName` rule keeps bare-word uses such as `item non-working` parsing, and the JSON AST of an existing file stays byte-identical.
- `through:` and `every:` are new property keys. On any other entity they get the existing unknown-property warning.
- The printer prints config entries in source order (it never sorts them), so `non-working` declarations stay where the author wrote them. `through` and `every` join its key order.

## 5. Scheduling semantics

### 5.1 Rules

1. **Start.** An item starts on the first working day at or after its computed start (`date:`, `start:`, `after:`, or the lane cursor).
2. **Consumption.** It consumes N working days, where N is its calendar duration in working days (`duration:`, or `size:` effort divided by `capacity:` as today).
3. **Finish.** It finishes at the end of its Nth working day.
4. **Successor.** A sequenced successor, or an `after:` dependent, starts on the next working day.
5. **Calendar-bound entities keep their dates.** `date:` on milestones and anchors, `after:DATE`, `before:DATE`, `start:` on the roadmap and the now-line are calendar dates. A milestone on a Saturday is legitimate and stays on Saturday.
6. **Snapping is reported.** When rule 1 moves an item's pinned start (`date:` or `after:DATE` on a non-working day), the layout emits an info insight naming the item, the pinned date and the date used.
7. **`before:DATE`** keeps today's cap: the finish (rule 3) may not pass the start of the pinned day. A hidden pinned day maps to the seam like any other date.
8. **`length:`** on the roadmap is a duration, so it counts working days like any other.

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

Codes are placeholders; final `NL.*` codes are assigned at implementation, with EN and FR messages.

| Rule | Severity | Check |
|---|---|---|
| NW1 | error | A `non-working` declaration has exactly one of `date:` and `every:`. |
| NW2 | error | `through:` requires `date:` and must not be earlier than it. |
| NW3 | error | `every:` values are weekday names, without duplicates, and do not cover all seven days. |
| NW4 | warning | `days-per-week` differs from the number of weekdays that recurring declarations leave working. (`calendar:custom` with `days-per-week: 6` and no `every:` triggers it.) |
| NW5 | error | Duplicate `non-working` id within one file. Include collisions use the existing config-merge warning. |
| NW6 | error | `non-working:` on `default roadmap` is `hide` or `show`. |
| NW7 | info (layout insight) | An item's pinned start falls on a non-working day and moved (§5.1 rule 6). Shipped as **`NL.I1008`**; it covers `date:`, `start:` and the date in an `after:`, for main-lane and isolated-region items alike. A tie between the pin and another constraint (the lane cursor, an `after:` reference) still reports. |

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

### 7.4 Named non-working days

A run that contains a titled declaration is labelled in both views:

- under `hide`, as a thin cut line at the seam, styled like an anchor's but lighter, with its label (`Company summit · 3d`) packed into the marker row by the existing marker packer;
- under `show`, as a band whose label is packed into the marker row at the band's left edge.

New theme tokens: `timeline.nonWorkingFill` and `timeline.nonWorkingSeam`.

### 7.5 Positioned model

As built, `PositionedTimelineScale` gains two optional keys, set only when the window holds a non-working day under `hide` and omitted otherwise (so `calendar:full` and `calendar:custom` models carry neither):

```ts
nonWorkingDisplay?: 'hide';                 // 'show' arrives with Phase 4
nonWorking?: PositionedNonWorkingRun[];

interface PositionedNonWorkingRun {
    x: number;          // seam x under hide, band left edge under show
    width: number;      // 0 under hide
    from: Date;         // first non-working date of the run
    through: Date;      // last non-working date, inclusive
    titles?: string[];  // titled declarations in the run; omitted for a plain weekend
    seam?: true;        // days scale only: strictly inside the chart, no grid line at x; the renderer draws a seam
}
```

Other optional keys, each omitted when empty:

- `PositionedAnchor.hiddenDate` and `PositionedMilestone.hiddenDate`: the real ISO date of a marker dated on a hidden day. The marker sits at the seam; the renderer adds it as an SVG `<title>`.
- `PositionedMilestone.overrunDate`: the milestone's own date, so NL.I1007 no longer reads a date back off x.
- `PositionedItem.nonWorkingPin`: `{ key: 'date' | 'start' | 'after'; pin: string; start: string }`, the source of NL.I1008.
- Theme token `timeline.nonWorkingSeam` (light `#a0aec0`, dark `#6b7a90`, grayscale `#9a9a9a`). `timeline.nonWorkingFill` arrives with `show` (Phase 4).

Consumers that do date math from `pixelsPerDay` must use `forward` / `invert` instead. That includes the test helpers added in [#92](https://github.com/lolay/nowline/pull/92) that recover tick dates from x.

### 7.6 Several roadmaps in one chart

The root roadmap's calendar and display setting define the axis. An isolated include schedules with its own calendar and projects onto the root axis. Its own extra non-working days are not hidden; they shade inside the region under either view.

## 8. Exporters

Every exporter reads engine C's dates and the same calendar.

| Exporter | Proposed |
|---|---|
| XLSX | Start / End from engine C; the working-day duration column uses the file's `days-per-*` and supports `q`. |
| MS Project | `<WeekDays>` from the recurring declarations (all seven working under `calendar:full`); `<Exceptions>` from the dated ones. |
| Mermaid | `excludes` with weekday names and ISO dates, which Mermaid also excludes from task durations; durations emitted as working-day `Nd`. |
| JSON AST | New `NonWorkingDeclaration` node in `serializeToJson`; printer support; the round-trip test covers a fixture that uses it. |
| SVG / PNG / PDF / HTML | Follow the layout and the display setting. |

## 9. Rollout and byte stability

### 9.1 What changes

| Input | Change |
|---|---|
| `calendar:full`, no `non-working` declarations | None. The mapping is the identity. |
| `calendar:custom`, no `every:` | None, plus NW4 when `days-per-week` is not 7. |
| `calendar:business` (the default), `hide` | Sequenced items that start on a working day keep their x. Week ticks keep their x and change label (`Jan 10` → `Jan 12`). Date-pinned entities, the now-line and the window end move to the right day. |
| `calendar:business`, `show` | Everything after the first weekend moves right, by design. |

The 14 business-calendar layout snapshots (of 19; the five waves samples use `calendar:full`) and every business determinism cell that renders a picture change. For a fixture without date pins and without a now-line in its window, the only change is week-label text. The CHANGELOG entry goes under `### Changed`: the business calendar now does what `dsl.md` already says it does ("engineering working-day arithmetic").

### 9.2 Phases

1. **Weekends, hidden.** `WorkingCalendar` with recurring non-working days; the business preset's `weekend`; the `hide` projection and `invert`; engines B and C in working days; ticks and window end; MS Project, Mermaid and XLSX read the calendar. No new syntax. This phase removes the compression.
2. **`show`.** The sided projection, shading, the `non-working:` display key, and `--non-working` across CLI, embed, VS Code and MCP.
3. **Declarations.** `non-working` with `date:` / `through:` / `every:`, overriding `weekend`, includes, named seams and bands, exporter exceptions, validator rules, LSP completion, TextMate grammar.
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

non-working thanksgiving "Thanksgiving" date:2026-11-26 through:2026-11-27

roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
```

Schedule: Checkout uses Mon Nov 23, Tue 24, Wed 25, Mon 30 and Tue Dec 1. QA uses Wed Dec 2 and Thu Dec 3.

- **`hide`:** Checkout 0–40, QA 40–56. Thursday through Sunday collapse into one seam at x = 24, labelled `Thanksgiving · 2d`. The Saturday milestone sits on that seam. The first week column is 24 px wide, so its `Nov 23` label is dropped under the narrow-column rule.
- **`show`:** Checkout 0–72, painted across the shaded Nov 26–29 band (24–56; the `Thanksgiving` label covers Thursday and Friday). QA 72–88. The milestone sits at 40, on its Saturday.

### Example C: a Sunday–Thursday week

```nowline
nowline v1

config

non-working weekend "Weekend" every:[fri, sat]

roadmap r "R" start:2026-01-04 scale:1w calendar:business
```

The file's `weekend` replaces the preset's. `1w` is Sunday through Thursday, week ticks fall on Sundays, and `days-per-week: 5` agrees with the five working days, so NW4 stays quiet.

## 11. Scope, non-goals and open questions

**In scope.** Roadmap-wide recurring and dated non-working days, shareable through includes, with a choice of view.

**Non-goals.** `principles.md` rules out Gantt-chart scheduling and resource contention. So: no per-person time off, no working hours or partial days, no capacity reduction on a non-working day, no recurrence rules beyond weekly (holiday files list their dates), and no time zones (dates stay floating). A code freeze is not a non-working day; work continues through it, so it belongs to an annotation feature, not to the calendar.

**Open questions** (all decided; see §3 of the [handoff](./handoffs/handoff-m2p-working-calendar.md)).

1. **The keyword.** Confirm that `non-working` lexes as a keyword with `longer_alt` (a grammar test), and that spending the keyword budget on it is acceptable.
2. **Ranges.** `through:` versus a list of dates (`date:[2026-12-24, 2026-12-25]`). Both are cheap; a long shutdown reads better with `through:`.
3. **Narrow columns under `hide`.** Dropping the label is the simple rule. The alternative lets a label extend into a neighbouring column whose own label is thinned.
4. **Thinning at the `days` scale.** The default thins to every 7th day ("weekly markers"). Under `hide` that should become every Nth visible day, where N is the working days per week.
5. **Markers on hidden days.** A Saturday milestone under `hide` sits on the seam. Should its label carry the date (`Launch (Sat Nov 28)`), or is the hover title enough?
6. **Versioning.** The business calendar's dates change under `nowline v1`. This proposal treats that as a fix that matches the existing spec text (a `Changed` entry). The alternative is gating the new behaviour behind an opt-in.
7. **Per-swimlane calendars.** Different regional holidays per team. A swimlane would reference a named calendar; under `hide`, the axis still follows the root calendar, so the lane's extra days would shade. Deferred until there is demand, because it edges toward resource management.

## 12. Superseded design

`rendering-v2.md` and `milestones.md` § m2.5a planned a `WorkingCalendar` that compresses the axis (`weekendsOff()` "shrinks `pixelsPerDay`") as *the* model, with business mode as a factory call. Only the `WorkingCalendar` interface stub landed; no compression shipped. This proposal keeps the interface name and replaces the plan in two ways:

- the schedule and the view are separate: compression is the `hide` projection of a schedule that is always computed in working days, and `show` is equally supported;
- non-working days are data (`non-working` declarations), not factories, so holidays and closures need no code.
