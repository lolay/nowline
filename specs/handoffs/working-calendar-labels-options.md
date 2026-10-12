# Working-calendar labels: titled recurrences and working exceptions

**Status: decision memo, no decision taken.** Research for whether to change the m2p phase 5b rule in [`working-calendar.md`](../working-calendar.md) §7.4: only dated, titled, `non-working` declarations are labelled on the chart, so a titled bounded recurrence and a titled `working` exception are not. Nothing here changes code.

## Recommendation

1. **Titled `working` exception: label it before 5a/5b ship (option W1).** It is the one titled form MS Project already names, so the chart is the odd surface out; the cost is one more marker-row entry, one example and one determinism fixture. Label only, no cut line, suffix `+Nd`.
2. **Titled bounded recurrence: leave it unlabelled.** Neither per-occurrence option survives the week scale. The good option (a period bracket, R3) is the primitive of the annotation feature §11 deferred (code freezes), so build it there, once, not as a calendar one-off.
3. **Fix the real harm separately.** A recurrence under `hide` blanks the week tick labels for its whole window at the default scale (below). That is worse than the missing label and is a tick-thinning problem, not a label problem. Worth its own issue.
4. **Make the limit discoverable either way.** The LSP hover on a titled bounded recurrence should say the title is not drawn. Zero render bytes.

Timing matters: 5a and 5b are both under `## [Unreleased]` (the last release is 0.8.6). No user file carries these declarations yet, so any change now costs only repo goldens. After the release, a change moves rendered bytes for real files.

## What each form shows today

Measured with the layout API on `tests/non-working-{hide,show}.nowline` plus one declaration each, and on `examples/working-calendar.nowline` with `non-working fridays "Summer Fridays" every:fri start:2026-07-01 end:2026-08-31` and its start moved to Jun 1.

| | `hide`, days / weeks | `hide`, months / quarters | `show`, days / weeks | `show`, months / quarters |
|---|---|---|---|---|
| Titled bounded recurrence | Weeks in the window are 4 working days (32 px), so the narrow-column rule (decision 3) **drops every week tick label** from Jun 29 to Aug 24 at `1w`. No seam drawn (week scale). | Columns a little narrower; nothing marks why. | Fri to Sun bands are 24 px against 16 px for a plain weekend. Readable if you know to look. | Nothing: untitled runs are not banded at month scale and above. |
| Titled `working` exception | The Saturday becomes an 8 px slice of a 48 px week column. Invisible. | Invisible. | A gap in one weekend band (Sunday shaded, Saturday not). | Invisible. |

So the missing label does hurt, but differently. For the recurrence, the information that matters is a period ("summer runs at four days a week"), and under the default view the axis goes blank across that period with nothing to explain it. For the working exception, the information is one day, and the only trace is the exporter.

A related quirk the working option would also fix: a weekday make-up day inside a titled closure (`working makeup "Make-up day" date:2026-12-30` inside Winter break) splits the closure into two labelled seams 8 px apart, `Winter break · 4d` and `Winter break · 2d`, with nothing saying why.

## Exporters today

| | MS Project | Mermaid | XLSX |
|---|---|---|---|
| Titled bounded recurrence | One `<Exception>` per changed run, **unnamed**: `exceptionTitles` skips any rule with `every`. | Every closed date in `excludes`. | Dates only; the Calendar row describes the open week. |
| Titled `working` exception | `<Exception>` with `DayWorking` 1 and `<Name>`. | Not expressible; counted as `working-day` in the `%%` summary. | Dates only. |

Read the other way: a bounded recurrence's title currently has no observable effect on any surface. It is a comment. A titled working exception is named in MS Project only. Labelling the working exception brings the chart into line with MS Project; labelling the recurrence would make the chart the only surface that names it (MS Project could follow with a one-line change to `exceptionTitles`). Dates never disagree under any option: labels are views of a schedule that is already shared.

## Titled bounded recurrence

### Options

Mockups are schematic (1 character ≈ one working day under `hide`, one calendar day under `show`); row counts come from re-running `packMarkerRow` with the extra entries.

**Today**, Summer Fridays example, `hide`, `1w`:

```
         Jun 22  Jun 29 ........................... Aug 24   Aug 31
axis     |     |    |    |    |    |    |    |    |    |    |     |
                ^ nine 4-day weeks, every tick label dropped
row 0                                                   (empty)
row 1    ◆ Kickoff ...
lanes    [API v2 ------------------------][Data migration --------]
```

**R1, a label on every occurrence** (`Summer Fridays · 1d` at each run's seam or band edge):

```
axis     |     |    |    |    |    |    |    |    |    |    |     |
row 0           :Summer Fridays · 1d :Summer Fridays · 1d :Summer F…
row 1                :Summer Fridays · 1d :Summer Fridays · 1d
row 2                     :Summer Fridays · 1d :Summer Fridays · 1d
row 3                          :Summer Fridays · 1d
```

**R2, one label on the first occurrence** (`Summer Fridays · 9d`, or `Summer Fridays · every Fri to Aug 31`):

```
axis     |     |    |    |    |    |    |    |    |    |    |     |
row 0           :Summer Fridays · 9d
                ^ one cut line, on Jul 3's seam only
```

**R3, a period bracket** spanning `start:` to `end:` in the marker row:

```
axis     |     |    |    |    |    |    |    |    |    |    |     |
row 0           ├─ Summer Fridays · every Fri · 9d ─────────────┤
```

Under `show` R3 sits over the existing wider Fri to Sun bands, which then read as explained.

### Cost

Marker rows (26 px each) for the Summer Fridays example, then the fixture with `non-working recharge "Recharge Fridays" every:fri start:2026-11-30 end:2026-12-20`, where the recurrence lands among Thanksgiving, Launch and the summit:

| Scale, view | Today | R1 | R2 | R3 |
|---|---|---|---|---|
| `1d` hide | 3 / 3 | 6 / 4 | 3 / 4 | 3 / 4 |
| `1w` hide | 2 / 3 | 4 / 4 | 2 / 4 | 2 / 4 |
| `1m` hide | 3 / 3 | 8 / 5 | 3 / 4 | 3 / 4 |
| `1q` hide | 4 / 3 | 9 / 5 | 4 / 4 | 4 / 4 |
| `1w` show | 1 / 2 | 3 / 3 | 1 / 3 | 1 / 3 |
| `1q` show | 3 / 3 | 7 / 4 | 3 / 4 | 3 / 4 |

- **R1** is dead on arrival: +3 to +5 rows at month and quarter scale for nine Fridays, and a summer-long recurrence is the normal case. Code is small (relax `titledRules`, attribute a recurrence title per day rather than per span, or a `every:wed` title leaks onto the Sat/Sun runs inside its window).
- **R2** is cheap (+0 or +1 row) and misleading: under `hide` a cut line means "a closure is here", and `· 9d` on Jul 3 reads as a nine-day closure on Jul 3. Fixing the wording does not fix the line.
- **R3** costs +0 or +1 row and reads at every scale, because it is anchored to two dates, not to N days. It is the only option that also explains the blank axis. It is also the most new machinery: `packMarkerRow` is point-based (a centre, a radius, a right-or-left label), so a span needs a third placement mode with fixed left anchoring; a new model array (`PositionedNonWorkingRun` is per run, the bracket is per rule); a renderer element; a new `tests/` fixture and snapshot sample.
- **Byte identity.** No file in `examples/`, `tests/` or the determinism fixtures has a bounded `every:`, so R1 to R3 move no existing golden. Every option needs a new fixture.
- **Bundle.** The whole 5b chart feature (labels, packing, canvas growth, `calendarExceptions`) cost +1.51 KB raw, +0.49 KB gzipped (measured: `make bundle-size` at `7ac0d44` against `56345c7`). R1 and R2 are a fraction of that; R3 is the largest, still well under 1 KB gzipped against 6.67 KB of headroom (193.33 of 200 KB). Not a constraint for any option here.
- **Spec and docs surface.** `working-calendar.md` §7.4, §7.5 (R3 adds a model type), §8 known limits; `rendering.md` § Timeline Scale (the `non-working-label` paragraph); `dsl.md` § Non-working Declaration (the title row); `nowline(5)` en and fr; the MCP reference resource; the 5b CHANGELOG entry (still unreleased, so edited in place).

### Non-goals

R1 and R2 are pure views of declared data and fit. R3 is where it gets close: §11 already says a code freeze "belongs to an annotation feature, not to the calendar". A titled date range drawn as a bracket above the axis *is* that annotation primitive. Shipping it for recurrences first gives two bracket styles or one feature designed around its least common use. That is the argument for deferring, not a principle violation.

## Titled `working` exception

### Options

Fixture `tests/non-working-{hide,show}.nowline` plus `working crunch "Release crunch" date:2026-12-05` (a Saturday).

**Today**, `hide`, `1w` (1 character ≈ one working day):

```
axis     |   |Nov 30|  |Dec 14|Dec 21|
row 0        :Thanksgiving · 2d
row 1        ◆ Launch  :Company summit · 3d
                  ^ Sat Dec 5 is the sixth day of the Nov 30 column; nothing marks it
```

**Today**, `show`, `1w` (1 character = one day; `▓` shaded, `·` working):

```
axis     |Nov 23|Nov 30|Dec 07|Dec 14|Dec 21|
bands    ···▓▓▓▓······▓··▓▓▓▓▓·····▓▓·····▓▓
                     ^ Sat Dec 5 unshaded: a half-width weekend band
```

**W1, label it like a closure, without a cut line** (`Release crunch · +1d`, N = working days added):

```
hide     |   |Nov 30|  |Dec 14|Dec 21|
row 0        :Thanksgiving · 2d
row 1             Release crunch · +1d
row 2        ◆ Launch  :Company summit · 3d

show     |Nov 23|Nov 30|Dec 07|Dec 14|Dec 21|
row 0         ◆ Launch    Release crunch · +1d
row 1       Thanksgiving · 2d  Company summit · 3d
bands    ···▓▓▓▓······▓··▓▓▓▓▓·····▓▓·····▓▓
```

No cut line, because the dotted line means "time removed here" and a working day removes none. That one difference keeps a working label from being read as a closure.

**W2, `show` only: tint the worked day, no label.** The Saturday gets its own fill (say a hatch in the seam token) so the gap in the band reads as deliberate. Nothing under `hide`, nothing at month scale and above.

```
show     |Nov 23|Nov 30|Dec 07|Dec 14|Dec 21|
bands    ···▓▓▓▓·····╱▓··▓▓▓▓▓·····▓▓·····▓▓
```

**W0, leave it**, with the hover note from the recommendation.

### Cost

- **Crowding.** W1 adds one marker row where the day lands near other markers: `examples/working-calendar.nowline` goes from 2 to 3 rows at `1w` under `hide` (the crunch Saturday sits between the summit and Launch), and the fixture from 2 to 3. A working exception is one day, so it never scales badly the way R1 does. W2 adds no rows.
- **Scales.** W1 reads at every scale (a point label, like a milestone). W2 only works at days and weeks under `show`, where the band already half-shows the information.
- **Byte identity.** `examples/working-calendar.nowline` declares `working launch-prep "Launch prep Saturday" date:2027-01-23`, so W1 changes that example's render and the `working-calendar` determinism fixture's `svg`, `png`, `pdf` and `html` cells (`json`, `mermaid`, `msproj` unchanged). The example's comment ("It is not labelled on the chart") changes too. No snapshot sample has a `working` declaration. W2 moves the same cells under `show` only, which the fixture does not use, so nothing.
- **Code.** W1 is mostly reuse: the marker entry, the label layer and canvas growth already exist for titled runs. The one design point is the data source. `calendarExceptions` already returns titled working exceptions, but only where the day differs from the *open week*, so it misses a weekday make-up day inside a dated closure, the case that splits Winter break today. The labels should come from the days a titled dated `working` rule actually flips under precedence, which the resolver knows. Also a new optional model array beside `nonWorking` (a working day is not a `PositionedNonWorkingRun`). Bundle: an estimated 0.1 to 0.3 KB gzipped.
- **Spec and docs surface.** Same list as the recurrence, plus §10 Example D gains its label, and the `dsl.md` title row loses half its exception.

### Non-goals

Fits. It draws a declared, titled date, which is what milestones and anchors already do. It adds no syntax, no keyword, no scheduling.

## Why not the reverse split

The natural objection: label both or neither, for a uniform rule. The forms are not symmetric. A working exception is a dated point with a title, the same shape as a closure, so W1 makes the rule "a dated title is drawn" with no exception left. A bounded recurrence is a period, and a period needs a span primitive the chart does not have yet. Uniform-by-omission (W0 plus R0) is defensible; uniform-by-R1 is not.
