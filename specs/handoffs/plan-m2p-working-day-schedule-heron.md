```
--- KICKOFF: begin orchestration at [deep] ---

  Status: 1/3 groups done | last review: wave-1 PASS | current: m2p-2 s4-s5 [deep] (gates 5 and 2 pending) | updated 2026-10-06

  review: every-wave (log-only — parent writes Review log; no human review gate)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    Read specs/handoffs/plan-m2p-working-day-schedule-heron.md on branch
    claude/tender-babbage-mjx733 of lolay/nowline. The plan is already
    tagged. Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's procedure, and
    pause only at the mandatory STOP gates. Do not execute plan work
    inline. Update plan progress after each wave returns per the skill's
    procedure. You are the kickoff destination chat; skip the "continue
    here or new chat?" question and begin dispatching immediately.

---
```

# m2p Phase 2: working-day schedule under `hide`

## Context

Phase 1 (`4a596b6`, `92558b9`; PR lolay/nowline#96, CI green, open) built `WorkingCalendar` rules and index functions with no callers. Phase 2 puts the business calendar (the default) on them: the axis, the window, ticks, the now-line and engines B and C count working days, and weekends are hidden (`hide`, the only display until Phase 4). That ends today's compression: a business `1w` is 40 px but a calendar week is 56, so week ticks drift (`Jan 05, 10, 15…`), dated entities land in the wrong week, and `length:6w` makes a 30-calendar-day window. `calendar:full` and blockful `calendar:custom` have no non-working days and must stay byte-identical everywhere (the identity path).

Plan of record: `specs/handoffs/handoff-m2p-working-calendar.md` §6 Phase 2, plus `specs/working-calendar.md` §5, §7.1, §7.2, §7.5 and §10 A. The maintainer asked to keep branch `claude/tender-babbage-mjx733`, so Phase 2 stacks on Phase 1 and PR #96 becomes "phases 1–2" (if #96 merges first, the branch restarts from `main` with a new PR). Phases 2 and 3 must ship in one release (handoff §1.4); the PR says so. A code-grounded review of this plan verified every number below and found no missed call site.

## Decisions carried in, and the Phase 2 choices

From the Phase 1 design thread (maintainer-approved): durations stay in estimate units; **day-scale labels sit at week starts** (amends handoff decision 4); the week start comes from the open-ended week (decision 10; Monday for business). Only the handoff edits Phase 2 implements are written here.

1. **Index → date.** A point (a start, a floor, `today`, an after-only milestone) is `dateAtWorkingIndex(base, k)`: a Saturday pin starts Monday (spec rule 1) and an `after:` dependent starts on the next working day (rule 4). A span's exclusive end is the new free function `spanEndDate(cal, base, s, e)` = `addDays(dateAtWorkingIndex(base, floor(e) − 1), 1)` when `floor(e) > floor(s)`, else the start date: a Mon–Fri item ends (exclusive) Saturday. Both delegate to `addDays(base, k)` on the identity path, truncation included. Consequences, pinned by tests: a successor starts Monday while its predecessor's exclusive end is Saturday, and an after-only milestone is dated Monday; XLSX shows that, while Mermaid's wave-end milestone (span end) lands on Saturday until Phase 3 dates it as a point. Engines A and C agree on wave dates for whole working days (A rounds, C truncates, as today).
2. **`invert(x)`** is the working day whose start is nearest x: `dateAtWorkingIndex(d0, round((x − originX) / ppd))` (spec §7.1). That drops d3 `scaleTime`, which alone brings d3-time-format, d3-time, d3-interpolate and d3-color into the embed bundle (about 27 KB minified); d3-scale stays for `scaleBand`.
3. **Ticks under `hide`.** Only when `scale.calendar?.hasNonWorkingDays`; otherwise today's code runs unchanged.
   - Candidate boundaries: every calendar day (days); the window start plus every week start (weeks; with no `weekStart`, a 7-day stride from the start); the window start plus unit starts (months and up). x comes from `forward`. The window end always closes. Zero-width columns are dropped with their labels.
   - Thinning counts kept columns. Under default `days` thinning, majors are week starts, the first tick included only when it is one. The closing tick never has a label.
   - Labels at days and weeks: a label is dropped only when it is wider than its column and the column is narrower than a full unit (`columnPx < daysPerUnit(unit) × ppd − 0.5`). Months and up keep only the #92 edge rule, on the kept columns. This reads decision 3 as "narrowed relative to a full unit", which every business column would otherwise trip: French week labels (`janv. 05`, 46 px) would vanish from 40 px weeks.
4. **Seams.** Under `hide`, the model carries the window's runs. At the `days` scale a run gets `seam: true` when it lies strictly inside the chart and no grid line is drawn at its x (no major tick there, and no tick at all when `minor-grid` is on). Default thinning puts a labelled Monday after every business weekend, so seams show only with an explicit `label-every`. The renderer draws marked seams.
5. **Hidden-day markers (decision 5)** ship now, since Phase 2 creates hidden days. A dated milestone or anchor on a non-working day carries `hiddenDate` and gets `<title>YYYY-MM-DD</title>`.
6. **NL.I1007** stops reading dates back off x, since insights have no calendar. Dated milestones that get `overrunByWave` also carry `overrunDate`, formatted from the parsed date as today's message does.
7. **NW7 → `NL.I1008`** (info). It covers `date:`, `start:` and `after:DATE` pins, and fires only when the pinned date set the start: not when a later `after:` ref, the lane cursor or a wave floor did.

## Change

**`working-calendar.ts`.** Export `spanEndDate` (choice 1).

**`time-scale.ts`.**
- Index is `calendar ? calendar.workingIndexOf(d0, ·) : daysBetween(d0, ·)`, used for `spanDays` (still `max(1, …)`) and `forward`.
- `forwardWithinDomain` keeps its raw-date guard.
- `invert` per choice 2; remove the d3 import.
- A calendar-less `TimeScale` is exactly today's.

**`view-preset.ts`.**
- `resolveScale` adds `labelEveryDefault?: true` when `labelEvery` came from `LABEL_THINNING`, including a scale block that switches `unit:` and inherits the default.
- `buildHeaderTicks` per choice 3, keyed on `scale.calendar`.
- `tickBoundaryAtOrAfter(start, days, unit, tickDays, calendar?)`: the identity path is unchanged. Otherwise:
  - k = `ceil(days − 1e-6)`; for days and weeks, k ≤ 0 returns 0.
  - D is the first date whose index is k: `addDays(dateAtWorkingIndex(start, k − 1), 1)`, or `start` for k ≤ 0.
  - Return `workingIndexOf(start, B)`, where B is the next unit or week start at or after D.
  - Example: content ending Fri Jan 30 2026 at month scale returns Feb 1's index (20), not March's.

**Engine B (`layout.ts`).**
- `computeDateWindow` takes the `WorkingCalendar`, built from `ctx.cal` when absent.
- Window end: `dateAtWorkingIndex(start, Math.max(1, finalDays))`.
- `computeContentEndDay` converts anchors, inline `after:` dates, `date:`/`start:` pins, milestones and `today` with `workingIndexOf`, including the region recursion at `:1615-1625`.
- `waveFloorDays(plan, startDate, calendar)`.

**Engine C (`schedule.ts`).**
- Same conversions. Item `start` is a point; `end` is `spanEndDate`. `summarizeWaves` does the same.
- Anchors and dated milestones keep their raw dates (rule 5); their indices come from `workingIndexOf`.
- After-only milestones are a point at the max end.
- Fix the header's "XLSX only": Mermaid's wave section reads it too.

**`roadmap-node.ts` and waves.**
- Build the calendar before the window. `spanDays = max(1, workingIndexOf(start, end))`.
- The extension pass uses `dateAtWorkingIndex(start, paddedDays)` and rebuilds ticks and `nonWorking`.
- `dateAtX` (`wave-layout.ts`) becomes a point (W1001 text, wave start), and wave ends use `spanEndDate`. Both go through `ctx.calendar` with `timeline.originX` / `pixelsPerDay`.
- Widths do not change (decision 9).

**Model (`types.ts`; optional keys, spread in only when present, never `undefined` or `[]`).**
- `PositionedTimelineScale.nonWorkingDisplay?: 'hide'` and `nonWorking?: Array<{ x: number; width: number; from: Date; through: Date; titles?: string[]; seam?: true }>`, present when the window holds a non-working day.
- `PositionedMilestone.overrunDate?: string` and `hiddenDate?: string`.
- `PositionedAnchor.hiddenDate?: string`.
- `PositionedItem.nonWorkingPin?: { key: 'date' | 'start' | 'after'; pin: string; start: string }`.
- All dates are `YYYY-MM-DD`.

**Renderer and themes.**
- Token `timeline.nonWorkingSeam` in `shape.ts`, light, dark and grayscale (gray).
- Seams: 1 px, dash `1 3`, the minor grid line's vertical span, in the grid layer, emitted only when marked.
- `<title>` on hidden-day markers, as `renderInlineDatePin` does.
- Floors in `themes.test.ts`: seam vs both row tints ≥ 1.8, vs `gridLine` ≥ 1.3, and unlike both cut-line colours.

**NL.I1008.**
- Engine A records `nonWorkingPin` in `sequenceItem` / `resolvePinnedOrSequentialStart`, using the `wavePinOverride` pattern. It is skipped when `wavePinOverride` applies. `layout-insights.ts` emits it, using the `collectWavePinInsight` pattern.
- Args `{ name, pin, key, start }`.
- EN: `` `Item "${a.name}" is pinned to ${a.pin} (${a.key}:), a non-working day; it starts on ${a.start}.` ``
- FR: `` `L'élément ${q(a.name)} est épinglé à ${a.pin} (${a.key}:), un jour non ouvré ; il démarre le ${a.start}.` ``
- Also: `codes.ts` union and `ALL_CODES`; the FR-structure regex in `wave-messages.test.ts`.

**Docs.**
- `CHANGELOG.md` `### Changed`: the business axis, window and `length:` count working days; week labels; XLSX Start/End, through the public `scheduleRoadmap`; the new insight.
- `specs/dsl.md`: the § Calendar #92 sentence (`:823`) and the insight list.
- `specs/rendering.md`:
  - § Timeline Scale: week ticks at week starts, seams, dropped columns, the narrow-column rule, thinning, day-scale labels.
  - The model-key list (`:45-55`).
  - The `pixelsPerDay` note (`:409`).
- `specs/working-calendar.md`:
  - §5.2: the `(base, …)` signatures.
  - §6: NW7 = NL.I1008, including `start:`.
  - §7.2: the narrow-column reading and day-scale thinning.
  - §7.5: the model as built.
- The handoff: the decision 4 row and the status line.
- `nowline.5` and `fr/nowline.5`: the insight lists.

## Tests (fail without the change)

New tests use literal dates and pixels. The calendar oracle appears only inside existing helpers, so no test checks the code against itself. Positions are relative to `originX`.

**§10 A (business).**
- W4's box is 126–154 (logical 120–160). The milestone is at 152.
- Ticks at 0/40/80/120/160, labelled `Jan 05, Jan 12, Jan 19, Jan 26`; `endDate` 2026-02-02.
- Engine C: W1 2026-01-05 → 01-10 (exclusive), W4 01-26 → 01-31, milestone 01-30.

**Identity.**
- The same file under `calendar:full` keeps today's numbers.
- `spanEndDate(full, 2026-01-01, −3, −1.5)` is 2025-12-31 (truncation), not the floor formula's 12-30.
- A new walk over the full and custom inputs finds none of `nonWorking`, `nonWorkingDisplay`, `hiddenDate`, `nonWorkingPin`. The inputs are `examples/waves`, `waves-program`, `product`; `tests/waves-coarse`, `waves-gap-deadline`, `waves-isolate`, `grammar-properties`. A business control does carry `nonWorking`. Leave `WAVE_KEYS` alone.

**Edges.**
- `start:2026-01-10` (Saturday): origin at the Monday seam, first label `Jan 12`, nothing left of `originX`.
- `today` 2026-02-08 (Sunday): the now-line is at index 25.
- A Wednesday start: first column 24 px, `Jan 07` dropped, ticks on Mondays.
- A Wednesday-ending `length:` drops the closing column's label.
- fr-CA business `scale:1w` keeps every week label.

**Months.**
- Business `scale:1m` over Feb 1 2026: the `Feb` column starts at Feb 2's x.
- `tickBoundaryAtOrAfter` returns index 20 for content ending Fri Jan 30.
- k ≤ 0 returns 0 for days and weeks.

**Days scale.** `start:2026-01-05`, scale block `unit: days`, `label-every: 2`:
- Weekends are dropped; majors fall on even kept columns.
- Seams are marked and drawn at Jan 10–11 (Monday Jan 12 is kept column 5, minor), and not at Jan 17–18 (Monday Jan 19 is column 10, major).
- No seam is drawn with `minor-grid:true`, or with default thinning.

**Extension pass.** Rewrite `layout.test.ts:630` and `:659` so they still extend under business:
- Milestone dated 2026-02-02 (index 20) gives `endDate` 2026-02-09 and width 200.
- Include test: the extending date is at index 25; the reference is 02-13.
- An anchor (extended scale) and a milestone (original scale) on one date share x.

**Waves.** A business wave roadmap whose wave 1 ends on a Wednesday and whose wave 2 has `after:` a Saturday:
- Wave 2 opens Monday in engines A and C.
- The two engines' wave dates are equal.

**Also covered:**
- `invert` (a Saturday's x gives Monday).
- I1008 for each pin key, a non-binding `after:[ref, Sunday]`, working-day pins, and none under full.
- The hidden-date `<title>`.
- I1007 on business. The full-calendar I1007 tests at `layout-insights.test.ts:285-344` stay as identity guards; only the comment changes.
- Theme tokens and floors.

**Existing tests updated deliberately.** The helpers convert with the working calendar, so most tables keep their numbers.
- `schedule.test.ts`: `weeks()`; `:61` (`b.start` Mon 01-12 vs `a.end` Sat 01-10); `:130` (milestone Mon 01-19 vs `a.end` Sat 01-17); the Sunday pin now starts Monday 02-02.
- `waves.test.ts`: `engineCWeeks` and `expectWaves`.
- `date-window.test.ts`: `windowDays` in working days, plus one absolute `endDate` each.
- `time-scale.test.ts`: business scales carry the calendar; `tickDates` uses `invert`; new `tickBoundaryAtOrAfter` cases.
- `layout.test.ts`:
  - #92 business months: labels Jan 2026–Jun 2027, `endDate` 2027-07-01.
  - The growing window: 42 calendar days, end 02-16.
  - The pin-spacing tests at `:1976-2069`.
- `inline-date-pins.test.ts`: the inline snapshot.
- `export-xlsx.test.ts`: End and the milestone, both 2026-01-20.

## Snapshots and determinism (deliberate)

**What moves, and how it is regenerated.**
- The 14 business layout snapshots, via `UPDATE_LAYOUT_SNAPSHOTS=1 make test`.
- The 10 business determinism fixtures, via `make compile TARGET=local && UPDATE_DETERMINISM_GOLDENS=1 make determinism`. svg, html, png, pdf and xlsx move; json, mermaid and msproj must not.

**Category review first, by script, never by eye.** A script in `.scratch/` compares before and after:
- Every item bar's x and width must match in samples without date pins.
- Any move must trace to a date-pinned entity upstream.

**Allowed categories:**
- tick labels, and the x of calendar-aligned ticks;
- date-pinned entities;
- the now-line;
- the window's right edge;
- anything sequenced after a moved pin.

**Expected changes:**
- sizing, capacity-items and capacity-lanes gain a now-line and its 16 px pill row, so their y values shift while x and width do not.
- clean-quarters (52 weeks end Fri 2027-01-01) grows a nearly empty Q1 2027 column.

**Must not change:**
- The five `calendar:full` snapshots.
- Every full or custom SVG rendered under `examples/` and `tests/` stays byte-identical (`cmp` against the s3 baseline).

**Not run here.** The browser determinism leg runs only in CI. It needs no local regeneration, since `hashes.json` has no browser overrides.

## Out of scope

- `show`, the display setting and bands (Phase 4).
- Exporter calendars, durations, `excludes`, `<WeekDays>`, and Mermaid's wave-end point date (Phase 3, same release).
- Declarations (Phase 5).
- Known limit, noted in the PR: an isolated include on a different calendar than the root places its durations on the root's working-day axis.

## Verification

- `make pre-commit` green.
- `make bundle-size` ≤ 200 KB. It should shrink with choice 2; going over is a STOP.
- `make compile TARGET=local && make determinism` green after regeneration, with the CLI leg run.
- The identity `cmp` and the category report are in the wave 3 artifact.
- CI green on the pushed head, including the browser determinism leg.

## Orchestration (personal-plan-orchestrate, as in Phase 1)

Same approach as Phase 1, with two differences: the snapshot and golden regeneration (s5) is `[deep]` and rides wave 2, because judging which moves are legitimate is review work; and this plan had a code-grounded review by a separate agent before approval.

- **Dispatch.** One git working directory, so waves run serially, one subagent each. Each is a one-agent Workflow run with `model` + `effort` (`[exec]` sonnet/high, `[deep]` opus/high; Phase 1 verified the override is honoured). Orchestrate from this chat.
- **Gates.**
  - After wave 1: gate 5 (canary) and gate 2 (`[exec] → [deep]` test review), asked together.
  - Gate 1 on any error, weak output or bundle overrun.
- **Runner rules, as in Phase 1.**
  - The plan and handoff are mirrored to `specs/handoffs/plan-m2p-working-day-schedule-heron.md` and `handoff-m2p-working-day-schedule-heron.md`.
  - They are committed and pushed before every turn that waits. A red test is set aside until green, because nowline needs a green `make pre-commit` for any commit.
  - They are removed as the branch's last commit.
- **Artifacts:** `.scratch/orchestrate-plan-m2p-working-day-schedule-heron-{wave}-{task}.md`.

## m2p Phase 2 steps

--- WAVE 1 [exec] ---

### s1 - [fast] Toolchain check (done)

`nvm use` 26.2.0, `pnpm -v` 12.8.1, `make build-fast`. Done when both versions match and the build exits 0.

### s2 - [exec] Write the failing tests and update the existing ones (done)

Everything in § Tests, written against § Change's names and shapes. Done when every listed case exists and nothing outside `*/test/` changed.

### s3 - [exec] Red run and baselines (done)

- `make test`, and record the failures. Only new or updated tests may fail.
- Copy every rendered `examples/**/*.svg` and `tests/**/*.svg`, plus the 19 layout snapshots, to `.scratch/p2-baseline/`.

Done when the red list and the baseline are captured and no source file changed.

--- WAVE 2 [deep] ---

### s4 - [deep] Implement Phase 2

Implement § Change until `make test` and `make lint` pass. The exceptions are the layout snapshot and determinism comparisons and `cli/test/integration/cli.render.test.ts:767-790` (CLI SVG vs the business snapshots), which s5 regenerates.
- Change a test only where it contradicts § Change or § Tests, and list each edit.
- Run `make bundle-size` and record the size.

Done when tests pass, the size is under budget, and the identity `cmp` of full and custom SVGs is clean.

### s5 - [deep] Regenerate snapshots and goldens after the category review

Per § Snapshots:
1. Write the review script and its report first.
2. Regenerate only if no disallowed move appears; otherwise stop and report.

Done when the report is in the artifact, and the snapshot suite, the CLI render test and determinism all pass.

--- WAVE 3 [exec] ---

### s6 - [exec] Docs

Everything under § Change "Docs". Done when every listed file is updated and `make lint` passes.

### s7 - [exec] Gates, commit, push, PR

1. `make pre-commit`, `make bundle-size`, then `make compile TARGET=local && make determinism`.
2. Commit with the trailer set, then push.
3. Retitle and extend PR #96 to cover phases 1–2. Include:
   - the snapshot categories, per AI_POLICY.md;
   - the XLSX/Mermaid date note;
   - the isolated-include limit;
   - that Phases 2 and 3 ship together.

Done when CI starts on the new head.

## Review log

review wave-1 (m2p-2-s1-s3): PASS - 66 new tests in three new files plus updates in ten, every § Tests bullet covered with literal values; make-only staged red runs show 142 failures, all in new or updated tests, and the whole suite green with them parked; 59-SVG baseline with checksums; note: the days-scale fixtures put `unit:` in a scale block, which the validator rejects (SCALE_FIELDS), so wave 2 switches them to roadmap `scale:days` - 2026-10-06

## Token log

Phase 1 total ~$20.42 (PR #96 thread). Input is real transcript usage counted once per message; output is chars/4, so a floor.

| row | model | ~input | ~output | ~cost |
|---|---|---|---|---|
| orchestrator (since the Phase 2 request) | claude-opus-5-5 | 25.78M | 36k | $19.91 |
| planning: 3 explorers + 1 plan review | claude-opus-5-5 | 95.72M | 54k | $27.31 |
| wave-1 (m2p-2-s1-s3) | claude-sonnet-5-5 | 33.58M | 42k | $8.13 |
| **running total** | | 155.08M | 132k | **$55.35** |

Model check (canary): wave 1 ran 120 of 120 messages on claude-sonnet-5-5.
