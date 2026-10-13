# Working-calendar labels: titled recurrences and working exceptions

**Status: titled working exception decided and shipped (W1, [#136](https://github.com/lolay/nowline/pull/136)). Titled bounded recurrence re-measured on 2026-10-13 after [#136](https://github.com/lolay/nowline/pull/136) and [#142](https://github.com/lolay/nowline/pull/142); recommendation R0, waiting on the maintainer's pick.** Research for the m2p phase 5b rule in [`working-calendar.md`](../working-calendar.md) §7.4: a dated, titled declaration is labelled on the chart, `non-working` or `working`; a titled bounded recurrence is not. Nothing here changes code.

## Recommendation

**Titled bounded recurrence: keep it unlabelled (R0) for this release, and build the period bracket (R3) with the annotation feature, not now.**

1. **The harm that justified R3 is gone.** The memo's case for R3 was that it was "the only option that also explains the blank axis". #142 un-blanked the axis: inside a recurrence the week labels alternate (`Jul 06`, `Jul 20`, `Aug 03`, `Aug 17`). What is left is narrower columns with nothing saying why: 32 px weeks against 40 at `1w`, July 65 px against 84 at `1m`, Q3 140 px against 162 at `1q`. That is a missing explanation, not a broken chart.
2. **R3 is still the annotation primitive.** §11 says a code freeze "belongs to an annotation feature, not to the calendar". A titled date range drawn as a bracket in the marker row is exactly that primitive. Shipping it now fixes its look, its packing rule and its model name for the least common use, before the feature that owns it has a spec, and after the release any change to it moves bytes for real files.
3. **R2 is cheaper than before but buys little.** #136 made a text-only point label (no cut line) a legitimate form, which removes the memo's main objection to R2. What is left: a point label for a period, which cannot show where the period ends, and wording (`every fri to Aug 31`) that puts the chart's first non-title English words on the axis and needs French strings. If R3 ships later, R2 is a released label format to replace.
4. **The limit is already discoverable.** The LSP hover on a titled bounded recurrence says `Title not drawn on the chart: bounded recurrences are not labelled.` ([#129](https://github.com/lolay/nowline/pull/129)), and §7.4 states it as a known limit. R0 costs nothing further.

The honest cost of waiting: when R3 does ship, every user file with a titled bounded recurrence gains a bracket and, where it collides, a marker row (26 px of height). That is the cost of any additive feature, not a migration, and it is not a reason to design the annotation primitive early.

If the maintainer wants the title on the chart before release anyway, R2 (text-only, as specified below) is the option to take, not R3.

**Timing.** 5a, 5b, #136 and #142 are all unreleased: the 5a/5b entries sit under `## [Unreleased]` in `CHANGELOG.md`, #136 and #142 are `.changelog/` fragments, and the latest release is v0.8.6 (2026-10-01). Any rendering change before the next release costs only repo goldens; after it, it moves rendered bytes for real files.

## What a titled bounded recurrence shows today

Re-measured with the layout API at `d366549`, on `tests/non-working-recurrence.nowline` (Summer Fridays plus Juneteenth, start Jun 1, added by #142), cross-checked on `examples/working-calendar.nowline` with `non-working fridays "Summer Fridays" every:fri start:2026-07-01 end:2026-08-31` added and its start moved to Jun 1. Widths are compared with the same file without the recurrence. In every cell the model has no titled run inside the window: the title is never drawn.

| Scale | `hide` | `show` |
|---|---|---|
| `1d` | Fridays are zero-width columns, dropped with their labels: the axis reads `7/2`, `7/6`, Mon to Thu only. Readable if you notice the missing dates; nothing names them. | Fri to Sun bands are 15 px against 10 px for a plain weekend. Every date labelled. |
| `1w` | Weeks Jun 29 to Aug 24 are 32 px against 40. Labels alternate since #142 (`Jul 06`, `Jul 20`, `Aug 03`, `Aug 17`); before #142 all nine were dropped. Under the default `scale:weeks` thinning the majors return. No seam drawn. | Fri to Sun bands are 24 px against 16 px. All ten week labels. |
| `1m` | July 65 px against 84, August 62 px against 76. Labels kept. Nothing marks why. | Nothing. Columns count calendar days, and untitled runs are not banded at month scale and above. Only bar ends move. |
| `1q` | Q3 140 px against 162. Nothing marks why. | Nothing, as at `1m`. |

So after #142 the recurrence is visible but unexplained under `hide` at every scale, explained by band width under `show` at days and weeks, and invisible under `show` at months and quarters. The information that matters is a period ("summer runs at four days a week"), and no surface states it on the chart.

## Exporters today

| | MS Project | Mermaid | XLSX | Chart |
|---|---|---|---|---|
| Titled bounded recurrence | One `<Exception>` per changed run, **unnamed**: `exceptionTitles` skips any rule with `every`. | Every closed date in `excludes`. | Dates only. | Not labelled; hover note in the editor. |
| Titled `working` exception | `<Exception>` with `DayWorking` 1 and `<Name>`. | Not expressible; counted as `working-day` in the `%%` summary. | Dates only. | Labelled, `Release crunch · +1d` (#136). |

A bounded recurrence's title still has no observable effect on any rendered surface; it shows only in the editor hover. Labelling it would make the chart the only surface that names it (MS Project could follow with a one-line change to `exceptionTitles`, independent of this decision). Dates never disagree under any option: labels are views of a schedule that is already shared.

## Titled bounded recurrence: options

Mockups are schematic (1 character ≈ one working day under `hide`, one calendar day under `show`).

**R0, today** (`tests/non-working-recurrence.nowline`, `hide`, `1w`):

```
         Jun 22   ·   Jul 06   ·   Jul 20   ·   Aug 03   ·   Aug 17   ·   Aug 31
axis     |       |      |      |      |      |      |      |      |      |       |
                 ^ nine 32 px weeks; labels alternate, nothing says why they are narrow
row 0    ◆ Kickoff ...
lanes    [API v2 ---------------][Data migration -----------------][Hardening --
```

**R1, a label on every occurrence** (`Summer Fridays · 1d` at each closed Friday): unchanged verdict, dead on arrival. +3 to +7 rows at month and quarter scale for nine Fridays (table below).

**R2, one text-only label at the first closed day** (`Summer Fridays · every fri to Aug 31`, no cut line, the #136 working-exception form):

```
axis     |       |      |      |      |      |      |      |      |      |       |
row 0             Summer Fridays · every fri to Aug 31
row 1    ◆ Kickoff ...
```

The earlier R2 (a cut line on Jul 3's seam, `Summer Fridays · 9d`) stays rejected: under `hide` a cut line means "a closure is here", so it reads as a nine-day closure on Jul 3. Dropping the cut line fixes that; the `· 9d` count would still mislead, hence the wording.

**R3, a period bracket** spanning `start:` to `end:` in the marker row:

```
axis     |       |      |      |      |      |      |      |      |      |       |
row 0             ├─ Summer Fridays · every fri · 9d ─────────────────────┤
row 1    ◆ Kickoff ...
```

Under `show` R3 sits over the wider Fri to Sun bands, which then read as explained. It is the only option that shows the period's extent, which matters most at months and quarters under `show`, where today nothing marks the recurrence at all (R2's label names it but cannot show where it ends).

### Marker rows

Marker rows (26 px each), fixture / example. "Today" is the layout's own count; R1 to R3 re-run `packMarkerRow` on the model's own entries plus the option's entries (the reconstruction reproduces "Today" in all 16 cells). R3 is approximated as a fixed-width entry from `start:` to the day after `end:` (or the label width, if wider). The example's counts are up on the old memo because #136 added its `Launch prep Saturday · +1d` label.

| Scale, view | R0 (today) | R1 | R2 | R3 |
|---|---|---|---|---|
| `1d` hide | 1 / 4 | 6 / 6 | 2 / 4 | 2 / 4 |
| `1w` hide | 1 / 3 | 4 / 4 | 2 / 3 | 2 / 3 |
| `1m` hide | 2 / 4 | 8 / 8 | 2 / 4 | 2 / 4 |
| `1q` hide | 2 / 4 | 9 / 9 | 3 / 4 | 3 / 4 |
| `1d` show | 1 / 3 | 4 / 4 | 2 / 3 | 2 / 3 |
| `1w` show | 1 / 3 | 3 / 3 | 1 / 3 | 2 / 3 |
| `1m` show | 1 / 4 | 5 / 5 | 2 / 4 | 2 / 4 |
| `1q` show | 2 / 4 | 7 / 7 | 2 / 4 | 2 / 4 |

R2 and R3 cost the same: +0 or +1 row. Row count does not separate them.

### Cost

| | R0 | R2 | R3 |
|---|---|---|---|
| Model | none | a text-only calendar label: a third optional array beside `nonWorking` and `workingExceptions`, or `workingExceptions` generalised into one calendar-label array (an unreleased type, so free to reshape now) | a new per-rule type (`PositionedNonWorkingRun` is per run; a bracket is per rule) with `x`, `width`, `from`, `through`, `titles`, `label`, `labelBox` |
| Layout | none | reuse: a zero-radius marker entry, the existing label packing and canvas growth | a third `packMarkerRow` placement mode: a span with a fixed left anchor that never flips side, which the point packer does not have |
| Renderer | none | one more loop in `non-working-label` | a new element (bracket line, end ticks, label) and its theme token decision |
| Wording | none | `every`, `to`, a weekday and an end date on the chart: French strings, locale-aware weekday and date (the tick formatter covers the date) | same wording question, smaller: the bracket shows the end, so `Summer Fridays · every fri` suffices |
| Goldens | none | `non-working-recurrence.svg` snapshot and the fixture's comment; no example and no determinism cell has a bounded `every:` | same as R2 |
| Bundle (gzip) | 0 | est. 0.1 to 0.3 KB | est. 0.3 to 0.6 KB |
| Spec and docs | none (§7.4 already states the limit) | `working-calendar.md` §7.4, §7.5, §8; `rendering.md` § Timeline Scale; `dsl.md` title row; `nowline(5)` en and fr; MCP reference resource; `ide.md` and the hover note (removed); a `.changelog/` fragment | all of R2's, plus a span primitive defined in the calendar spec that the annotation feature later inherits or replaces |

Bundle headroom is 5.69 KB gzipped (194.31 of 200 KB, `make bundle-size` at `d366549`), down from 6.67 KB when this memo was first written. Not a constraint for any option. The whole 5b chart feature cost +0.49 KB gzipped.

### Non-goals

R0 and R2 fit: R2 draws declared, titled data, as milestones and #136's working exceptions do. R3 is where it gets close, not over: a bracket for a titled period is the annotation primitive §11 defers (code freezes). Building it for recurrences first gives either two bracket styles later or one feature designed around its least common use. That is the argument for waiting, not a principle violation.

## Titled `working` exception: decided

Recommended as W1 and shipped in #136: a titled dated `working` declaration is labelled like a named closure, text only, no cut line (a working day removes no time), suffix `+Nd`, at its first turned day, in both views. Two refinements on the memo's sketch:

- **Data source.** Labels come from the days a titled dated `working` rule actually turns under precedence (`WorkingCalendar.workingExceptionRuns`), not from `calendarExceptions`, which compares with the open week only. So a weekday make-up day inside a dated closure is labelled, and the closure's split into `Winter break · 4d` and `Winter break · 2d` now has `Make-up day · +1d` between them.
- **Model.** `PositionedTimelineScale.workingExceptions` (`PositionedWorkingException[]`), beside `nonWorking`, omitted when empty.

The hover note now fires only on a titled bounded recurrence.

## Why not the reverse split

The forms are not symmetric. A working exception is a dated point with a title, the same shape as a closure, so W1 made the rule "a dated title is drawn" with no exception left. A bounded recurrence is a period, and a period needs a span primitive the chart does not have yet. R0 leaves exactly one documented gap, the period, for the feature built to draw periods.
