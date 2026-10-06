```
--- KICKOFF: begin orchestration at [deep] ---

  Status: 1/3 groups done | last review: wave-1 PASS | BLOCKED at gate 5 + gate 2 (first-subagent canary; [exec]->[deep] review of the tests) | current: m2p-1 s4 [deep] | updated 2026-10-06

  review: every-wave (log-only — parent writes Review log; no human review gate)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    Read specs/handoffs/plan-m2p-calendar-primitives-kestrel.md on branch
    claude/tender-babbage-mjx733 of lolay/nowline. The plan is already
    tagged. Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's procedure, and
    pause only at the mandatory STOP gates. Do not execute plan work
    inline. Update plan progress after each wave returns per the skill's
    procedure. You are the kickoff destination chat; skip the "continue
    here or new chat?" question and begin dispatching immediately.

---
```

# m2p Phase 1: working-calendar primitives (generalized rules)

## Context

The business calendar drifts two days a week against dated entities because the axis never skips a day (`working-calendar.md` §2). m2p fixes that in five phases (`specs/handoffs/handoff-m2p-working-calendar.md`). **Phase 1** builds the calendar primitive: no caller changes, no byte moves, no version question.

**Amendment requested by the maintainer:** the calendar must handle a temporary change to the weekly pattern, e.g. Sat/Sun off, then four weeks of working Saturdays, then back, with week columns that change width under `hide`. The handoff's §5.1 input (one open-ended weekly set plus dated non-working ranges) can't express that. Phase 1 therefore takes **general rules** (polarity, optional weekday set, specific dates, optional inclusive range) resolved by specificity.

**Syntax settled with the maintainer (lands in Phase 5, recorded in the report):** `non-working` and `working` keywords; `date:` takes one date or a list (`dsl.md` § Lists, no separate `dates:`); `start:` / `end:` (both inclusive) give a range, or bound an `every:` recurrence, which is open-ended on any side left off; a range without `every:` needs both. `every:` takes one weekday or a list. Durations stay in estimate units (working days at `days-per-*`), so working Saturdays pull work in. Day-scale labels follow week starts. `start:` already means "first day of this span" on the roadmap and (undocumented) on items; every roadmap-start rule reads `file.roadmapDecl` only (`nowline-validator.ts:373`, `include-resolver.ts:57`), so a `start:` on a calendar declaration collides with nothing; `end` is unused anywhere.

```nowline
non-working new-year "New Year's Day" date:2027-01-01
non-working christmas "Christmas" date:[2026-12-24, 2026-12-25]
non-working shutdown "Year-end shutdown" start:2026-12-28 end:2027-01-01
working crunch "Six-day weeks" every:[sat] start:2026-03-02 end:2026-03-29
working six-day "Saturdays from Mar 30" every:[sat] start:2026-03-30
```

## Line-reference check (handoff §4, HEAD `b22930b` = `9725e9d` + specs only)

Every Phase 1 row (§4.1: `working-calendar.ts:19-26, 28-38, :36, 40-72, 74-91`; `calendar.ts:23-37, 39-62, 235-244`) is exact. No production code reads `isWorkingDay` / `addUnits`; `TimeScale.calendar` is never read; `fromCalendarConfig(cal)` is called only at `roadmap-node.ts:228`, which reads only `daysPerUnit`. `WorkingCalendar` is not exported from `layout/src/index.ts`. So the change is byte-neutral by construction.

## Change: `packages/layout/src/working-calendar.ts` (only source file touched)

**Input model** (replaces §5.1's `NonWorkingSet` / `NonWorkingRange`):

```ts
export interface CalendarRule {
    working: boolean;                // false: weekend, holiday, closure; true: a working exception
    every?: ReadonlySet<number>;     // recurring UTC weekdays (0 = Sunday)
    dates?: ReadonlyArray<Date>;     // specific dates (`date:` single or list); excludes every/start/end
    start?: Date;                    // range start, or recurrence window start; inclusive
    end?: Date;                      // range end, or recurrence window end; inclusive
    id?: string;
    title?: string;
}
```

Kinds: `dates`, or `start` + `end` without `every`, is a dated rule; `every` with `start` and/or `end` is a bounded recurrence (open on an omitted side); `every` alone is the open-ended week. One declaration stays one rule, so its title appears once per run even when several of its dates fall in it.

- `presetRules(mode)`: business → `[{ working: false, every: {0, 6}, id: 'weekend', title: 'Weekend' }]`; full, custom → `[]`. `fromCalendarConfig(cal, rules = presetRules(cal.mode))`, so `roadmap-node.ts:228` needs no edit.
- **Precedence** (resolved once at construction): a dated rule beats a date-bounded recurring rule, which beats an open-ended recurring rule; at equal specificity `working` wins. Declaration order never matters: included files and the preset weekend have no meaningful position, and last-in-wins would let a crunch line placed after a holiday silently make that holiday a working day. Result: a sorted list of disjoint pieces, each a weekly mask (open-ended week or a bounded pattern) or an all-working / all-non-working dated stretch.
- **`WorkingCalendar` members** (handoff §5.1 names kept): `daysPerUnit` (unchanged), `addUnits`, `hasNonWorkingDays`, `isWorkingDay`, `workingIndexOf(base, date)`, `dateAtWorkingIndex(base, index)`, `nonWorkingRuns(from, to)`, `weekStart`, plus `readonly rules: ReadonlyArray<CalendarRule>` (normalized copy; Phase 3 needs it for MS Project `<WeekDays>` / `<WorkWeeks>` / `<Exceptions>` and Mermaid `excludes` / `includes`, decision 4 for the week length).
- **Identity path:** when no piece has a non-working day, `workingIndexOf` / `dateAtWorkingIndex` delegate unconditionally to `daysBetween` / `addDays`, so rounding and `addDays`' truncation of the sum match today exactly. `isWorkingDay` → true, `nonWorkingRuns` → `[]`, `weekStart` → undefined.
- **General path** in integer UTC day numbers (`Math.round(ms / DAY)`, weekday `(n + 4) mod 7`; `base` must be UTC midnight, documented): working days in `[a, b)` sum per piece (mask piece: whole weeks × its working weekdays + ≤6-day remainder; dated piece: all or nothing). `dateAtWorkingIndex` floors the index and walks pieces forward (k ≥ 0) or backward (k < 0), finishing inside one piece with O(1) weekly arithmetic. Snapping = `dateAtWorkingIndex(date, 0)`, so index 0 is the first working day at or after `base`. Cost O(pieces in the span); no day-by-day walks.
- `nonWorkingRuns`: maximal runs extended past both ends of `[from, to)`; `titles` = titled dated non-working rules in the run, by start date then input order.
- `weekStart`: first working weekday after the longest cyclic run of the open-ended week (Sat–Sun → Monday, Fri/Sat → Sunday); tie → earliest resulting week start in `sun … sat` order; undefined with no open-ended non-working days.
- **Guards:** remainder scans hard-capped at 14 steps (internal error past that). Throw `RangeError` for a weekday outside 0..6, or an unbounded stretch (before the first or after the last rule boundary) with no working weekday. Drop silently, like `resolveSizes`, any rule with an invalid date, `end < start`, an empty `every`, `dates` mixed with `every` / `start` / `end`, or a range without `every` missing either end: included files are parsed with `validation: false` (`include-resolver.ts:412`), so a throw would crash every surface. General-path entry points return the identity path's answer (`NaN`, Invalid Date, `true`, `[]`) for invalid dates and non-finite or out-of-range indices before any loop.
- `addUnits(date, count, unit)` = `dateAtWorkingIndex(date, count × daysPerUnit(unit))`: identical to today for full/custom, no callers, consistent with `isWorkingDay` for business (a count of 0 moves a non-working date to the next working day). `continuousCalendar()` keeps its units and gains the identity members. Rewrite the stale file header to describe the two jobs (spec §3.1).

**Already validated in plan mode** (in-memory scripts, nothing written): the simple model matched a brute-force day walk on 1.75M checks (all 127 weekly masks); an independent review re-ran it on 851k. The generalized engine matched a day-by-day precedence reference on 134,523 checks across 9 scenarios (crunch Saturdays, a holiday inside the crunch, summer Fridays with one working Friday, a release weekend, open-ended bounded patterns, the three-entry tiling, overlapping windows, full calendar with holidays and a working day, a week-long all-days shutdown), 7 bases each, zero mismatches. The crunch case gives `hide` week widths of 40, 48, 48, 48, 48, 40 px at 8 px per working day.

## Tests: `packages/layout/test/working-calendar.test.ts` (new; all fail without the change)

Dates via `Date.UTC`; no ISO-string assertions outside 0000–9999.

- **Handoff-mandated:** identity vs `daysBetween` / `addDays` over ~4 years for full, custom, `continuousCalendar` (integer and fractional indices incl. Mar 1 negative fractions); business week of 2026-01-05 (Sat/Sun share Monday's index, negatives before base, `Object.is(index, 0)`); `dateAtWorkingIndex(Mon Jan 5, 20)` = Mon Feb 2; 3-year brute-force agreement (prefix sums over an independent day-by-day precedence predicate using `getUTCDay()`; bases on weekdays, weekends, holidays and at the edges of every rule; round trips both ways); perf guard (warm-up, best of 5 batches over 10,000 years with ~100 holidays and a bounded pattern, budget 0.5 ms per call); `nonWorkingRuns(2026-01-05, 2026-02-02)` = four weekends; `weekStart` 1 business, undefined full.
- **The maintainer's use case:** weekend plus `working every:{sat}` Mar 2–29 2026: Saturdays in the window work, Sundays don't, week widths 40/48/48/48/48/40 px, and a `1w` (5-day) item chained through the window finishes earlier than outside it; with a dated holiday on Sat Mar 14 that Saturday stays non-working; the three-entry tiling yields the same calendar. A `dates` list (Dec 24 + Dec 25) forms one titled run with its title once.
- **Precedence:** summer Fridays (bounded non-working) with one dated working Friday; a dated working weekend over the preset weekend; equal-level conflict (working wins); overlapping bounded windows; open-ended working rule overriding part of the weekend; a bounded all-days shutdown; order independence (every permutation of the crunch, holiday and summer-Fridays rules yields the same calendar).
- **Non-tautological identity:** `calendar:full` plus one 1700 holiday forces the general path; must equal `daysBetween` / `addDays` for integer and non-negative fractional indices.
- **§10 at the primitive level:** A (W1 = Jan 5–9, successor index 5 = Jan 12, W4 = Jan 26–30, milestone index 19 → 152 px, ticks 0/40/80/120); B (Thanksgiving + weekend = one titled run Nov 26–29, Checkout Nov 23/24/25/30/Dec 1, QA Dec 2–3, Saturday milestone and seam at 24 px); C (`{fri, sat}` → `weekStart` 0, `1w` = Sun–Thu).
- **Edges:** parsed default calendar (`parseAndResolve` + `resolveCalendar`) carries the weekend; `nonWorkingRuns` with `from`/`to` inside a run and `from ≥ to`; a bounded recurrence open on each side; Friday + Monday holidays as one run with both titles; caller mutation after construction changes nothing; `daysPerUnit` unchanged per preset; `addUnits`; throws for bad weekdays and a week with no working day; malformed rules dropped; NaN, Infinity, 1e300 return promptly.

## Not changed

No caller, `TimeScale`, engine, exporter, renderer or index.ts export. No CHANGELOG entry (internal-only). No spec or handoff edits in this PR beyond the runner plan/handoff files below; the decision changes go in the report.

## Orchestration (personal-plan-orchestrate, Claude Code adaptation)

- **Harness gate (answered 2026-10-06: Workflow, verify model; orchestrate from this chat):** the skill targets Cursor's `Task(model=...)` and says to stop on Claude Code because [anthropics/claude-code#43869](https://github.com/anthropics/claude-code/issues/43869) (still open) reports per-subagent model overrides are ignored. Adaptation: dispatch each wave as a one-agent Workflow run with `model` + `effort` from the Claude Code row of the model picker (`[deep]` → `opus` / high, `[exec]` → `sonnet` / high; the folded `[fast]` step rides the `[exec]` wave). At the canary gate the parent reads the subagent transcript's `message.model` to report what actually ran, and prices every wave from real transcript usage (source precedence 1). Fallback: `personal-plan-model-tiers`.
- **Parallelism:** one git working directory (`/workspace/nowline`), so waves run serially, one subagent each.
- **Gates that fire in this plan:** after wave 1, gate 5 (first-subagent canary) and gate 2 (`[exec] -> [deep]` review of the new tests before Opus implements), asked together; gate 1 on any subagent error or weak output. `[deep] -> [exec]` (wave 2 → 3) has no gate; the parent's log-only review still runs. All gates fail closed.
- **Runner rules (personal `core.md`):** this is a cloud runner, so the plan is mirrored to `specs/handoffs/plan-m2p-calendar-primitives-kestrel.md` and a handoff to `specs/handoffs/handoff-m2p-calendar-primitives-kestrel.md`, both committed and pushed before every turn that waits, and removed as the last commit on the branch before merge (the PR says so). nowline's AGENTS.md makes a green `make pre-commit` non-negotiable before any commit, so at the canary gate, when the new tests are still red, the parent commits only the plan and handoff (pre-commit run with the red test file set aside) and the test file is committed once wave 2 turns it green. If the container dies at that gate, the test file is regenerated from this plan.
- **Subagent context contract:** each wave prompt quotes its steps below plus the § Change / § Tests excerpts verbatim, limits edits to `/workspace/nowline`, states the acceptance criteria and a hard scope limit (stop at the end of the group), points at nowline `AGENTS.md` (auto-injected) and personal `standards/testing.md` and `standards/code-style.md` (plus `standards/git.md` for wave 3), requires the full output in `.scratch/orchestrate-plan-m2p-calendar-primitives-kestrel-{wave}-{task}.md` (gitignored) with a one-paragraph summary back, and ends with the `tokens:` line.
- **Progress:** after each wave the parent appends ` (done)` to its headings, updates the Kickoff `Status:` line, writes the `## Review log` line, and flips the session todo list.

## m2p Phase 1 steps

--- WAVE 1 [exec] ---

### s1 - [fast] Toolchain and dependencies (done)

`source /opt/nvm/nvm.sh && nvm install` (reads `.nvmrc`: 26.2.0), `npm i -g pnpm@12.8.1` under that Node, then `make init`. Done when `node -v` is v26.2.0, `pnpm -v` is 12.8.1 and `make init` exits 0.

### s2 - [exec] Write the failing test file (done)

Create `packages/layout/test/working-calendar.test.ts` with every case in § Tests, written against the § Change API (`CalendarRule`, `presetRules`, `fromCalendarConfig(cal, rules?)`, the `WorkingCalendar` members). Follow `packages/layout/test/time-scale.test.ts` for style (4-space TS, `.js` import suffixes, `Date.UTC` dates). Done when the file covers § Tests completely and imports only APIs § Change defines.

### s3 - [exec] Red run and rendered-SVG baseline (done)

`make test` with only the test file added: within `@nowline/layout`, only `working-calendar.test.ts` fails (record the failure lines). Copy every `examples/**/*.svg` and `tests/**/*.svg` that the build rendered into `.scratch/orchestrate-baseline-svg/`, keeping relative paths. Done when the red output and the baseline are captured and nothing else in the tree changed.

--- WAVE 2 [deep] ---

### s4 - [deep] Implement the generalized calendar engine

Implement § Change in `packages/layout/src/working-calendar.ts` only. Iterate with `make test` until `working-calendar.test.ts` and every other layout suite pass. Change a test only where it contradicts § Change or § Tests, and list each such edit. Done when all layout tests pass and the only source change is that file.

--- WAVE 3 [exec] ---

### s5 - [exec] Gates and byte-stability proof

`make format` if needed, then `make pre-commit` (19 layout snapshots and `waves-byte-stability` included), `make bundle-size` (embed IIFE ~194 of 200 KB gzipped), `make compile TARGET=local && make determinism` (88 cells against `hashes.json`). Diff every rendered SVG against `.scratch/orchestrate-baseline-svg/` (byte-identical). `git status` shows only the test file and `working-calendar.ts` (plus the runner plan/handoff files). The browser determinism leg needs a Playwright 1.63 Chromium download this environment forbids; leave it to CI. Done when every gate is green and the evidence is in the artifact.

### s6 - [exec] Commit, push, open the PR

Re-run `make pre-commit` if anything changed after s5. Commit with an imperative subject (≤72 chars, no period) and the `b22930b` trailer set (`Assisted-by: Claude Code`, `Claude-Session`, `Co-authored-by: Claude`), push `claude/tender-babbage-mjx733` (retry on network errors only), open the PR from `.github/PULL_REQUEST_TEMPLATE.md` (flag the §5.1 input-model change and the deferred browser leg; `Assisted-by: Claude Code`). Done when the PR exists and its URL is in the artifact. The parent subscribes to PR activity.

## Then stop and report

- **Decision-log edits agreed with the maintainer:** decision 1: two keywords, `non-working` and `working`, both behind the Phase 5 lexer spike (Design Rule 1 count 22 → 24, with a justification like waves'). Decision 2: `date:` takes one date or a list (§ Lists), `start:` / `end:` (inclusive) give a range or bound `every:`, open-ended on an omitted side; `through:` is dropped. New decision: specificity precedence (dated > bounded recurrence > open-ended week), `working` wins ties. Decision 4: day-scale labels at week starts. Durations stay in estimate units, so working days pull work in. Knock-ons: NW1 (`date:` alone; `start:` + `end:` without `every:`; `every:` with optional bounds), NW2 (`end:` ≥ `start:`; `checkPropertyValues` gains `case 'end':` for NL.E0405), `start:` / `end:` hover text per entity in the LSP, `end` placed right after `start` in the printer's `KEY_ORDER`, NW3 on the open-ended week (bounded windows may close all seven days), NW4 against the open-ended week, `every` placed before `start` in `KEY_ORDER`, spec §4.1 / §5 / §6 rewritten to match. Decision 14 unchanged.
- **Phase 3:** MS Project writes date-bounded patterns as `<WorkWeeks>` and dated rules as `<Exceptions>` (`DayWorking` 0/1); Mermaid gets `excludes` plus `includes` for working dates (`includes` is in Mermaid's grammar but undocumented); exporters use 252 days/year vs the preset's 260 and have no `q` (add to `### Fixed`).
- **§4 corrections:** engine C also feeds Mermaid's wave section (Phase 2 moves those cells); waves divergence (g) missing; "two scales" list incomplete; lane-cursor wording; month-test description; `length:` in three more samples; MS Project row mislabel; man-page ranges.
- **Phase 2 traps:** exclusive end ≠ next index start (`addDays(dateAtWorkingIndex(b, ceil(N) − 1), 1)`); `invert` must round the index (float noise; flooring would move the `calendar:full` wave snapshots).
- **Spec §5.2 / §5.1:** update the interface sketch to `(base, …)` and the rule input; `titles` can't produce `Thanksgiving · 2d`, Phase 5 needs per-declaration spans; Phase 5's mapping must enforce NW1–NW3 itself (includes are unvalidated).
- **Budget and versioning:** ~6 KB embed headroom left for Phases 2–5; no DSL bump, ship Phases 2+3 as a 0.x minor with `### Changed`, and Phase 2 rewrites the #92 sentence in `dsl.md` § Calendar. Status line once the PR merges.

## Review log

review wave-1 (m2p-1-s1-s3): PASS - tests cover every § Tests case with the spec numbers and an independent day-by-day reference; the extra assertions match § Change; red run fails only at collection (presetRules missing), 563 other layout tests pass - 2026-10-06

## Token log

Input is real transcript usage counted once per message; output is chars/4 (the transcripts carry only streaming placeholder output counts, and redacted thinking is invisible), so treat output as a floor.

    orchestrator          (claude-opus-5-5):    input ~18.95M / output ~21k | ~$7.78
    wave-1 m2p-1 s1-s3    (claude-sonnet-5-5):  input ~2.90M  / output ~19k | ~$1.10
    RUNNING TOTAL:                                                         | ~$8.88

Model check (canary): wave 1 ran 26 of 26 messages on claude-sonnet-5-5, so the Workflow `model` override is honoured here (anthropics/claude-code#43869 concerns the Agent tool).
