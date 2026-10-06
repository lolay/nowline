```
--- KICKOFF: begin orchestration at [deep] ---

  Status: 1/3 groups done | last review: wave-1 PASS | current: m2p-3 s4-s5 [deep] (gates 5 and 2 pending) | updated 2026-10-06

  review: every-wave (log-only — parent writes Review log; no human review gate)

  Next model
    The [deep] tier at high effort; the skill's model picker names the model per tool.

  Prompt to paste into the next chat:
    Read specs/handoffs/plan-m2p-exporter-calendars-wren.md on branch
    claude/tender-babbage-mjx733 of lolay/nowline. The plan is already
    tagged. Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's procedure, and
    pause only at the mandatory STOP gates. Do not execute plan work
    inline. Update plan progress after each wave returns per the skill's
    procedure. You are the kickoff destination chat; skip the "continue
    here or new chat?" question and begin dispatching immediately.

---
```

# m2p Phase 3: exporters read the file's calendar

## Context

Phases 1–2 are on branch `claude/tender-babbage-mjx733` in PR lolay/nowline#96 (open; CI green on `bf86c5d`). They put the business calendar's axis and engines B and C on working days.

The three exporters never read the calendar. Each has its own copy of one duration table:
- a size-bucket list that ignores `size … effort:` declarations;
- 5 / 22 / 252 days per w / m / y (the business preset says 260 a year);
- no `q`;
- no `capacity:`.

MS Project always writes a Mon–Fri calendar, and Mermaid writes no `excludes`.

Today's exports disagree with the chart even on the determinism fixtures:

| Item | Chart (engine C) | XLSX | MS Project | Mermaid |
|---|---|---|---|---|
| platform-2026 `size:med` (effort 1w) | 5 days | 0 | 1 day | `1d` |
| sizing `size:xl` (1m), `capacity:2` | 11 days | 15 | 15 days | `15d` |
| waves (`calendar:full`) `4w` | 28 days | 20 | 20 days on Mon–Fri | `4w` |

Phase 3 makes every exporter read the chart's calendar and durations (handoff decision 16). Plan of record:
- `specs/handoffs/handoff-m2p-working-calendar.md`: §6 Phase 3, decision 16, §4.7;
- `specs/working-calendar.md` §8.

Phase 3 stacks on the same branch, and PR #96 becomes "phases 1–3". If #96 merges first, the branch restarts from `main` with a new PR. Either way, Phases 2 and 3 ship together (handoff §1.4).

## Decisions

1. **One resolver, durations from engine C.**
   - New `packages/layout/src/calendar-resolver.ts` (not `calendar.ts`, which would create a value-import cycle with `working-calendar.ts:26`) exports `resolveWorkingCalendar(file, resolved): ResolvedCalendar { config: CalendarConfig; working: WorkingCalendar }`. It is implemented over the roadmap declaration and calendar block, so a per-region call needs no new signature later.
   - `@nowline/layout` exports the resolver and the types `ResolvedCalendar`, `CalendarConfig`, `CalendarMode` and `WorkingCalendar`.
   - Layout (`roadmap-node.ts`) and engine C (`schedule.ts`) switch to the resolver, byte-neutrally.
   - `RoadmapSchedule` gains `calendar: ResolvedCalendar`.
   - `ScheduledItem` gains `days`: engine C's existing per-item duration from `deriveItemDurationDays`, which already covers `q`, declared sizes and `capacity:`.
   - Every exporter reads durations from `schedule.byNode`. The three `duration.ts` bucket tables and the 5 / 22 / 252 constants go.
2. **The weekly pattern.**
   - `WorkingCalendar` gains `workingWeekdays: ReadonlySet<number>`: the weekdays the open-ended week works, with 0 = Sunday. Business is {1…5}; full and custom are {0…6}.
   - It exposes Phase 1's private open-week mask, so exporters don't re-derive precedence from `rules`.
3. **XLSX.**
   - The Duration column is `days`, with 0 when there is no duration, as today. "Duration (text)" keeps the literal.
   - The Roadmap sheet gains a `Calendar` row right after `Start`. Exact values:
     - business: `business (Saturday and Sunday off; 5/22/65/260 days per week/month/quarter/year)`
     - full: `full (no days off; 7/30/91/365 days per week/month/quarter/year)`
     - custom 6/26/78/312: `custom (no days off; 6/26/78/312 days per week/month/quarter/year)`
   - `Generated` moves to row 6. Its date format is keyed to the label instead of index 4.
   - The Items sheet's `End` header becomes `End (exclusive)`, as the Waves sheet already says. Phase 2 made a Mon–Fri item end on Saturday, so the bare header now misleads.
4. **MS Project.**
   - `buildCalendarsBlock(workingWeekdays)` swaps the weekend predicate at `calendar.ts:14-15`. The business block stays byte-identical. `calendar:full` and custom get seven working days, each with `WorkingTimes`.
   - It calls `scheduleRoadmap(inputs.ast, inputs.resolved, { today: inputs.today })`.
   - Item duration is `(days ?? 0) > 0 ? round(days × 480) : 480` minutes, written as `PT{n}M0S`. The 480 fallback keeps an unsized item from becoming a zero-length task, which MS Project shows as a milestone.
5. **Mermaid.**
   - Directly after `    dateFormat YYYY-MM-DD`, emit `    excludes ` plus the open week's non-working day names, Monday first. Business gives `    excludes saturday, sunday`. Full and custom emit no line.
   - Item duration is `${parseFloat(days.toFixed(2))}d`, as `calendar.ts:199` formats days. 0 keeps the `1d` fallback.
   - The schedule is now built for every export, not only waves.
   - Mermaid never checks a task's start day against `excludes`, so explicit dates must be working days:
     - snap `startDate` once at `index.ts:119` with `working.dateAtWorkingIndex(start, 0)`, keeping `resolveStartDate` as the source. This covers lane leaders, undated anchors, waves, and milestones without `after:`;
     - date wave-end milestones as points: `dateAtWorkingIndex(wave.end, 0)`, the first working day at or after engine C's exclusive end. That's Monday, not Saturday.
   - On the full calendar both of these are identities.
   - Anchors and dated milestones keep their dates (rule 5).
   - A full-calendar `4w` becomes `28d`: the same meaning, different bytes.
6. **Handoff decision log (docs only).** Amend §3 rows 1–2 and append rows 18 onward with the decisions from the Phase 1 design thread:
   - the `non-working` and `working` keywords;
   - `date:` as a single date or a list;
   - inclusive `start:` / `end:`, replacing `through:`;
   - specificity precedence, with `working` winning ties;
   - durations staying in estimate units;
   - the NW1–NW4 and `KEY_ORDER` knock-ons.

## Change

**Layout:**
- `calendar-resolver.ts` (new);
- `working-calendar.ts`: `workingWeekdays` in both builders;
- `schedule.ts`: the resolver, `calendar`, and `days` (the existing `dur`);
- `nodes/roadmap-node.ts`: the resolver;
- `index.ts`: the new exports;
- the header comment at `schedule.ts:20-23`.

**XLSX:**
- `index.ts`:
  - Duration from `scheduled.days`;
  - the schedule's calendar passed to `buildRoadmapSheet`;
  - the Calendar row;
  - `End (exclusive)`;
  - the Generated format keyed by label.
- `duration.ts`: drop `durationToWorkingDays` and keep `durationLiteralToText`.

**MS Project:**
- `index.ts`: the schedule, durations from `byNode`, `workingWeekdays`, and the header at `:6`;
- `calendar.ts`: the parameter and the header at `:1-10`;
- `duration.ts`: keep `minutesToMsProjDuration` and drop the table.

**Mermaid:**
- `index.ts`:
  - the `excludes` line;
  - the schedule built once;
  - durations;
  - the `startDate` snap;
  - wave-end point dates;
  - the header at `:10-41`.
- `duration.ts`: drop the table.

**Docs:**
- `CHANGELOG.md`:
  - `### Changed`, for every calendar:
    - the XLSX Calendar row and `End (exclusive)`;
    - durations from the file's calendar and sizes;
    - Mermaid `Nw` written as `Nd`;
    - on business, Mermaid `excludes` and working-day `Nd`, plus explicit dates on working days.
  - `### Fixed`:
    - the `calendar:full` MS Project calendar gets seven working days;
    - full durations become 7/30/91/365;
    - `q`, declared sizes and `capacity:` work in all three exporters;
    - business `1y` is 260 days, not 252.
  - Rewrite the Phase 2 entry's "MS Project and Mermaid keep their own calendars until phase 3" sentence.
- `specs/rendering.md`:
  - XLSX Roadmap rows (add Start and Calendar), Duration, Start/End (exclusive, no longer blank for anonymous items);
  - `:763`: the MS Project exporter now runs the schedule;
  - the MS Project calendar;
  - the Mermaid bridge (`excludes`, `Nd`, point dates; `:780`).
- `specs/working-calendar.md`:
  - §2 and §8 as built;
  - `:296-297`, which said full and custom are unchanged; their exporter cells now move, as fixes.
- The handoff:
  - status line;
  - line 11: the byte-identity rule covers layout and rendering, and exporter fixes move full cells;
  - the §2 Phase 3 row;
  - Decision 6 above.
- READMEs:
  - msproj `:50`, `:66-78` (Calendar fidelity), `:88` (custom calendar no longer dropped);
  - Mermaid `:50-52` (output shape, `excludes`);
  - XLSX `:35` (Roadmap sheet).
- `packages/mcp/resources/conversions.md`: a gantt with `excludes weekends` counts `Nd` in working days.

## Tests (fail without the change unless marked guard)

New tests use literal values and import from `../src/index.js`. The custom fixture is `calendar:custom` with all four fields, 6/26/78/312 (the validator requires all four).

**Layout:**
- `resolveWorkingCalendar` for business, full and custom.
- `workingWeekdays`: business {1…5}; full and custom {0…6}.
- `schedule.calendar`.
- `ScheduledItem.days`:
  - `1w` is 5 / 7 / 6 (business / full / custom);
  - `1q` is 65 / 91;
  - `1y` is 260 / 365;
  - `size xl effort:1m` with `capacity:2` is 11;
  - an undeclared size is 0, through `buildSchedule` in `schedule.test.ts:29-38`, not `buildWaveSchedule`, which asserts no errors.

**XLSX:**
- Duration:
  - business `1q` 65, `1y` 260;
  - `size med effort:1w` 5 (today 0);
  - `size xl effort:1m` with `capacity:2` 11 (today 15);
  - full `4w` 28, `1q` 91;
  - custom `1w` 6.
- The three exact Calendar row strings at A5/B5, with `Generated` at A6.
- `End (exclusive)` in the Items header.

**MS Project:**
- Full and custom: seven `<DayWorking>1</DayWorking>` days, each with `WorkingTimes`.
- Durations:
  - business `1q` `PT31200M0S`, `size med effort:1w` `PT2400M0S` (today 480);
  - `xl` with `capacity:2` `PT5280M0S`;
  - full `1w` `PT3360M0S`;
  - custom `1w` `PT2880M0S`.
- Guards (green before and after):
  - the business `<WeekDays>` block, byte-identical;
  - business `1w` `PT2400M0S`;
  - an unsized item `PT480M0S`.

**Mermaid:**
- Business `    excludes saturday, sunday` sits on the line after `    dateFormat YYYY-MM-DD`. Full and custom have no `excludes`.
- Durations:
  - business `2w` `10d`, `1q` `65d`, `1.5w` `7.5d`;
  - `size med effort:1w` `5d` (today `1d`);
  - `xl` with `capacity:2` `11d` (today `15d`);
  - `xl` with `capacity:3` `7.33d`;
  - full `4w` `28d`;
  - custom `1w` `6d`.
- A Saturday `start:` gives Monday's date to the lane leader and to an undated anchor.
- The waves fixture at `export-mermaid.test.ts:279-290` gives:
  - `    One (wave end) :milestone, one, 2026-01-12, 0d`;
  - `:y1, after one, 5d`.
- `PARALLEL_FIXTURE` (`:330`): plan 01-12, build 01-26.
- Guard: the full-calendar wave-end dates are unchanged.

**Existing tests updated deliberately:**
- XLSX:
  - `:100`: Generated moves to A6;
  - `:137`, `:183`, `:376`: the `'End'` header lookups;
  - `:442-459`: delete the bucket-table test;
  - `:496`.
- MS Project:
  - `:2`;
  - `:141-150`: delete;
  - keep `:151-154`.
- Mermaid, business:
  - `:122`, `:127-128`, `:157-158`, `:290`, `:352-362`.
- Mermaid, full:
  - `:262` becomes `28d`;
  - `:270` becomes `126d`.

s2 ends with `make lint`.

## Determinism (deliberate)

**Baseline (s3).**
- Capture all 33 cells (11 fixtures × mermaid, msproj, xlsx) with the fresh Node build, `node packages/cli/dist/index.js`, using the gate's exact flags from `determinism/cli-surface.ts` (`--now 2026-02-09 --locale en-US --theme <fixture theme> --headless`).
- Each file's SHA-256 must equal `hashes.json` `cells["<id>:<fmt>"].node`; otherwise the baseline is wrong.
- The compiled binary in `packages/cli/dist-bin/` is stale and must not be used.

**Category review (s5, before regeneration).** A script decodes old and new xlsx with exceljs and diffs the msproj and mermaid text. Allowed:
- xlsx:
  - the Calendar row and the shifted Generated row;
  - the `End (exclusive)` header;
  - Duration values, each equal to engine C's `days`.
- msproj:
  - `med` 480 → 2400 (platform-2026, -dark);
  - `xl` 7200 → 5280 (sizing);
  - `xl` 7200 → 10560 (nested-both-headers);
  - `waves`: every duration × 1.4 plus the seven-day `<WeekDays>`.
  - Nothing else.
- mermaid:
  - the `excludes` line on business;
  - item durations.
  - No date may move: every fixture starts on Monday 2026-01-05 and `waves` is full, so any leader, anchor or wave-end date change is a failure.

**Regeneration (s5, after a clean review).**
- `make compile TARGET=local` first.
- Then `UPDATE_DETERMINISM_GOLDENS=1 make determinism`, then plain `make determinism`, which must be green with the CLI leg run.

**Expected movers:**
- all 11 xlsx cells;
- all 11 mermaid cells;
- 5 msproj cells: platform-2026, -dark, sizing, nested-both-headers, waves.

**Must not move:**
- json, svg, png, pdf, html;
- the six unsized business msproj cells;
- every layout snapshot.

The browser leg doesn't cover these formats.

## Out of scope (incidental findings, listed in the PR)

- **MS Project start and sequencing.** MS Project ignores the roadmap's `start:` (it uses the export date or `--start`) and has no implicit lane sequencing, so its schedule can't match the chart whatever the calendar.
- **MS Project duration display.** It writes no `<MinutesPerWeek>` / `<DaysPerMonth>`, so a full-calendar `1w` displays as 1.4 default weeks. Emitting them would move every business msproj cell.
- **Mermaid pins.** It ignores item `date:`/`start:` pins and writes `after:DATE` verbatim. An `after:` successor of a weekend-dated anchor or milestone starts on that weekend day, and fractional days are rounded by Mermaid.
- **Includes.** Exporters walk only the root file, so merged and isolated include items aren't exported. Isolated includes use the root calendar.

## Verification

- `make pre-commit` green.
- `make bundle-size` under 200 KB. Exporters aren't in the embed bundle; layout grows slightly.
- `make compile TARGET=local && make determinism` green after regeneration, with only the allowed cells moved.
- The category report is in the wave 2 artifact.
- CI green on the pushed head.

## Orchestration (personal-plan-orchestrate, as in Phases 1–2)

- **Waves.** Three waves, each a one-agent Workflow with the `model` and `effort` overrides the skill's model picker gives each tier, at high effort. Orchestrated from this chat.
- **Gates.**
  - After wave 1: gates 5 and 2, asked together.
  - Gate 1 on any error, weak output, or a disallowed determinism move. Guards marked above are expected green in the red run.
- **Runner rules.**
  - The plan and handoff are mirrored to `specs/handoffs/plan-m2p-exporter-calendars-wren.md` and `handoff-m2p-exporter-calendars-wren.md`.
  - They are pushed before every wait. Red tests are set aside, because nowline commits only on a green `make pre-commit`.
  - They are removed as the branch's last commit.
- **Commit trailers.** Every subagent prompt gives the exact trailers (`Assisted-by: Claude Code`, `Claude-Session`, `Co-authored-by: Claude <noreply@anthropic.com>`), says they override any harness attribution reminder, and forbids model names. The Phase 2 follow-up used the harness's model-named trailer.
- **Artifacts:** `.scratch/orchestrate-plan-m2p-exporter-calendars-wren-{wave}-{task}.md`.

## m2p Phase 3 steps

--- WAVE 1 [exec] ---

### s1 - [fast] Toolchain check (done)

`nvm use` 26.2.0, `pnpm -v` 12.8.1, `make build-fast`. Done when both versions match and the build exits 0.

### s2 - [exec] Write the failing tests and update the existing ones (done)

Write everything in § Tests against § Decisions' names and shapes. Done when:
- every case exists;
- nothing outside `*/test/` changed;
- `make lint` passes.

### s3 - [exec] Red run and baselines (done)

- `make test`, parking packages as in Phase 2 when one failure hides the rest. Record the failures, and confirm the guards are green.
- Capture the 33 baselines into `.scratch/p3-baseline/` per § Determinism.

Done when the red list exists, every baseline hash matches `hashes.json`, and no source file changed.

--- WAVE 2 [deep] ---

### s4 - [deep] Implement Phase 3

Implement § Decisions and § Change until `make test` and `make lint` pass. Determinism is excepted until s5.
- Change a test only where it contradicts the plan, and list each edit.
- Run `make bundle-size`.

Done when tests pass and the size is under budget.

### s5 - [deep] Category review, then regenerate the goldens

Follow § Determinism. The review script and report come first. Regenerate only when nothing disallowed moved; otherwise stop and report. Done when:
- determinism is green;
- `hashes.json` moved exactly the expected cells;
- the report is in the artifact.

--- WAVE 3 [exec] ---

### s6 - [exec] Docs

Everything under § Change "Docs" and Decision 6. Done when every listed file is updated and `make lint` passes.

### s7 - [exec] Gates, commit, push, PR

1. `make pre-commit`, `make bundle-size`, then `make compile TARGET=local && make determinism`.
2. Commit with the exact trailers and push.
3. Retitle PR #96 to `Count working days in the business calendar and exports (m2p phases 1-3)`, and extend its body with Phase 3, the determinism categories and the incidental findings.

Done when CI starts on the new head.

## Review log

review wave-1 (m2p-3-s1-s3): PASS - four new test files (layout calendar-resolver, and a calendar suite per exporter) plus updates in four, every § Tests bullet covered with literal values; make-only staged red runs show 100 failures (layout 41, mermaid 27, msproj 9, xlsx 23), all in new or updated tests, with every guard green (among them the business msproj `<WeekDays>` block, `1w` and unsized durations, and the full-calendar Mermaid wave end); nothing outside `*/test/` changed; 33/33 baselines from `packages/cli/dist/index.js` match `hashes.json` node cells; extras beyond the plan: `workingWeekdays` for an open-week rule (Sunday to Thursday) and for dated and bounded rules, which wave 2 must satisfy - 2026-10-06

## Token log

Phase 1 ~$20.42; Phase 2 ~$66.4. Input is real transcript usage counted once per message; output is chars/4, so a floor.

| row | tier | ~input | ~output | ~cost |
|---|---|---|---|---|
| orchestrator (since the Phase 3 request) | orchestrator | 22.24M | 26k | $17.96 |
| planning: 3 explorers + 1 plan review | orchestrator | 62.24M | 45k | $19.43 |
| wave-1 (m2p-3-s1-s3) | [exec] | 7.89M | 18k | $2.28 |
| **running total** | | 92.37M | 89k | **$39.67** |

Model check (canary): wave 1 ran 50 of 50 messages on the [exec] tier's model.
