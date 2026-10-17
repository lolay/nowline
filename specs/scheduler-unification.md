# Nowline — Scheduler Unification

**Status: Implemented: m1 to m3 and F1 to F8.** Milestone **m4.11** in [`milestones.md`](./milestones.md); decisions and as-built notes in the last two sections. Decisions 6 and 7 are superseded by the true-width layout (m4.15, [`true-width-layout.md`](./true-width-layout.md)). Sections 1 and 3 describe the code before m1 and the follow-ups (engine B and `computeContentEndDay` are gone, and F1 to F8 closed the divergences of §1.2); §4 says what each step did, §5 what each follow-up changed, and §9 records where the build differs from this text and the gaps that remain open. This is refactor R1 from [`review-since-v086.md`](./review-since-v086.md): one day-level scheduler instead of three hand-synced copies. Every `file:line` below was checked at the commit that adds this spec (source identical to 0062df3 plus the m2 fixes of the same review).

## 1. Problem

### 1.1 Three engines compute the same schedule

Waves (m2o) and the working calendar (m2p) named the three places that turn `date:`, `start:`, `after:`, durations and lane order into a schedule ([`waves.md`](./waves.md) §8.2):

| Engine | Entry point | Unit | Computes | Read by |
|---|---|---|---|---|
| A, pixel layout | `sequenceItem` (`packages/layout/src/layout.ts:410-928`), `resolvePinnedOrSequentialStart` (`layout.ts:1190-1218`), the lane loops (`nodes/swimlane-node.ts:273-355`, `nodes/group-node.ts`, `nodes/parallel-node.ts`), the wave state (`wave-layout.ts`) | px | every bar's x and width, the barrier `S_k`/`E_k` in px | the renderer, through `PositionedRoadmap` |
| B, date window | `computeContentEndDay` (`layout.ts:1469-1715`), called by `computeDateWindow` (`layout.ts:1357-1423`) | working days | one number: the latest content day | `RoadmapNode.place` (`nodes/roadmap-node.ts:305-312`), to size the axis |
| C, schedule | `scheduleRoadmap` (`packages/layout/src/schedule.ts:111-347`) | working days | start, end and duration of every item, milestone and anchor, and every wave span | the XLSX, Mermaid and MS Project exporters |

Engine C's header says its rules "exactly mirror `computeContentEndDay`" (`schedule.ts:4-5`), and they do, by copy: the walker in B (`layout.ts:1509-1605`) and the walker in C (`schedule.ts:166-255`) are the same code with different result maps, and so are their wave-barrier wirings (`layout.ts:1615-1664`, `schedule.ts:264-313`). The m2o spec left them separate on purpose, "to keep the risk down" (`waves.md:823`).

### 1.2 How they differ today

B and C agree with each other except for scope. A differs from both in pixel-level rules that m2o catalogued as divergences (a) to (g) ([`handoffs/handoff-m2o-waves.md`](./handoffs/handoff-m2o-waves.md) §4; (g) was fixed in m2o).

*The table is the state before m4.11 and is kept as the record of what the follow-ups changed.* The follow-ups settled every row (§5, §9): (a) by F1, (e) by F2, (c), (d) and (b) by F3, (f) by F8's removal of pins (the lane cursor can no longer move back), the pin row by F8, and the isolated-region rows by m1 of §4 (C took B's scope) and F5 (region anchors). What remains of (b) was the clamped bar's own drawn width, which was presentation (§8, decision 6) and kept six register entries until m4.15 m1 drew every bar on its dates and emptied the register ([`true-width-layout.md`](./true-width-layout.md)).

| Rule | A (pixels) | B (window) | C (schedule) |
|---|---|---|---|
| (a) `after:` on a lane or group child | `max(laneLeftX, refs)`: the lane cursor is ignored, so the item can start before the previous item ends and the row packer moves it to another row (`layout.ts:1202-1215`) | `max(prevEnd, refs)` (`layout.ts:1556-1557`) | `max(prevEnd, refs)` (`schedule.ts:204-205`) |
| (b) short items | the visual bar is at least `MIN_ITEM_WIDTH` (`nodes/item-node.ts:320`) and the cursor advances to the bar plus `ITEM_INSET_PX` (`swimlane-node.ts:354`), so an item under 20 px advances the cursor 20 px | `start + days` | `start + days` |
| (c) group caption spill | the lane cursor advances to the group's box edge, caption included (`swimlane-node.ts:294`, `:303`) | group end = last child end | same as B |
| (d) group track inside a parallel | adds the 8 px `TRACK_BLOCK_TAIL_GUTTER_PX` (`group-node.ts:293`) | none | none |
| (e) `after:` on a group nested in a parallel | ignored: the group floors only by its wave (`group-node.ts:103`) | honoured (`layout.ts:1593-1598`) | honoured (`schedule.ts:243-248`) |
| (f) lane cursor | monotone: `timeCursorX = max(timeCursorX, end)` (`swimlane-node.ts:303`, `:355`) | the last child's end | the last child's end |
| Pins outside the window | dropped by `forwardWithinDomain`; the item falls back to `after:` or the cursor (`layout.ts:1199-1200`) | used, even when negative | used, even when negative |
| Isolated regions without waves | placed with the region's own sizes (`nodes/include-node.ts:84-87`) | walked by recursion with the **parent's** sizes, nested regions, region anchors and region milestones included (`layout.ts:1692-1707`) | not scheduled at all: region items are missing from `byNode` |
| Isolated regions with waves | one level, fresh id maps | one level, region sizes (`layout.ts:1642-1656`) | one level, region sizes (`schedule.ts:285-298`) |
| `today` | draws the now-line only | extends the window when there is no `length:` (`layout.ts:1709-1712`) | sets the default start only |
| Output | px | one day number | per-node dates, `days`, wave spans |

Divergences (b), (c), (d) and (f) can only make A **later** than C. Divergences (a) and (e), and a pin before the roadmap start, can make A **earlier**. That asymmetry decided what A may take from C (§3.4); with F1, F2 and F8 landed it is gone, and C is a lower bound of A everywhere (F4).

### 1.3 What the sample corpus shows

A probe run for this spec laid out all 53 roadmaps under `examples/` and `tests/` with `--now 2026-02-09` and compared each named item's span in A (logical px converted back to working days) with C:

| Finding | Samples |
|---|---|
| A and C disagree on at least one item | 10 of 53 |
| (a) `after:` ignores the lane cursor | `examples/showcase.nowline` (`ship`, then `announce`: chart day 20, XLSX day 40), `examples/sizing.nowline` (`search-v2`: day 5 against 16), `tests/late-row-shifts.nowline` (four items) |
| (b) minimum width | `examples/showcase.nowline` (`brief`), `tests/non-working-hide.nowline`, `tests/non-working-show.nowline`, `tests/size-and-capacity.nowline` |
| (c) caption spill | `examples/inline-date-pins.nowline` (`us-rollout`, `eu-rollout`), `examples/waves.nowline` (`launch-page`: 10.8 days later in the chart) |
| (d) tail gutter | `examples/platform-2026.nowline`, `examples/product.nowline` (`platform-qa`, one day later) |
| C leaves region items unscheduled (no waves) | `examples/isolate-include.nowline`, `examples/nested.nowline`, `tests/grammar-properties.nowline`, `tests/isolate-include-multi.nowline` |
| B's window is too short, so layout grows it after placement (`roadmap-node.ts:763-812`) | `examples/nested.nowline`, `examples/platform-2026.nowline`, `examples/waves.nowline`, `tests/header-height-none.nowline`, `tests/header-height-xl.nowline`, `tests/nested-both-headers.nowline` |

The counts are from before the follow-ups: after F1 to F8 the register holds only the six clamped-bar entries of §9. So the flagship samples showed the cost of three engines: the showcase's XLSX, MS Project and Mermaid exports date `Ship` and the `Launch` milestone a month later than its chart, and the waves sample's exports start `Launch page` two weeks earlier than its chart (both closed: F1 and F3).

### 1.4 The cost of copies

*Before m1; the copies are gone (§3.4, and the item pin that made five of them is removed, F8).*

- **Every scheduling rule is written three times.** Date precedence (`date:` > `start:` > `after:` > cursor) is parsed in five places: `resolvePinnedOrSequentialStart` (`layout.ts:1190-1218`), `startPinOf` (`layout.ts:1244-1257`), `wavePinOverrideOf` (`wave-layout.ts:157-181`), B's `walkNode` (`layout.ts:1546-1558`) and C's `walkNode` (`schedule.ts:194-206`). Wave floor dates are parsed twice (`wave-barrier.ts:104-113` in days, `wave-layout.ts:67-70` in px). `literalDays` (`layout.ts:1437-1455`) copies `literalToDays` (`calendar.ts:67-85`), and `defaultStartDate` (`layout.ts:1432-1435`) copies `utcMidnight` (`schedule.ts:349-351`).
- **The wave plan is built three times per schedule export.** The export kernel lays out (`packages/export/src/index.ts:316-323`, `buildWavePlan` at `layout.ts:1920`); then the XLSX exporter calls `scheduleRoadmap` (`packages/export-xlsx/src/index.ts:73`, `buildWavePlan` again at `schedule.ts:257`) and `buildWavePlan` itself (`export-xlsx/src/index.ts:76`). Mermaid (`packages/export-mermaid/src/index.ts:146`, `:240`) and MS Project (`packages/export-msproj/src/index.ts:116`, `:130`) do the same. With waves each day walk runs up to n + 1 barrier passes, so an XLSX export walks the content in days 2 × (n + 1) times on top of engine A's own passes.
- **Every scheduling feature pays for agreement tests.** The worked examples assert A = C item by item (`expectTable`, `packages/layout/test/waves.test.ts:208-215`, 27 call sites) and wave by wave (`expectWaves`, `waves.test.ts:1086-1104`, 8 call sites), plus `layout.test.ts:2139-2198` and `working-day-schedule.test.ts:533-595`. They only pass because every example avoids the divergences "by construction" (`waves.md:838`), so they test the examples' shape as much as the engines.

## 2. Goals and non-goals

**Goals**

1. Engine C is the only day-space scheduler. Engine B is deleted; the date window is a projection of C's result.
2. One wave plan and one schedule per render or export, built by the staging step and carried to layout and to every exporter (`ExportInputs`).
3. Engine A keeps placing pixels but takes its day facts (window, durations, start terms, wave floor dates) from the shared code instead of re-deriving them.
4. The A/C differences become a named, tested register instead of a rule every example must avoid.
5. Every migration step renders every `examples/` and `tests/*.nowline` sample byte-identically.

**Non-goals**

- Fixing divergences (a) to (f) inside the migration steps. Each changes rendered output or exporter output and needed a maintainer decision and a deliberate snapshot or golden bump, so they landed as the follow-ups of §5.
- Splitting `RoadmapNode.place` into phases, or deriving the row-packer predictor from `ItemNode.measure`. That is R2 (`specs/layout-phases.md`); this spec only changes what A reads.
- Changing barrier semantics, the barrier driver's algorithm, or any wave diagnostic.
- Merging engine A's pixel walk into C. A's row packing, spill and gutters are presentation and stay in pixels.

## 3. Design

### 3.1 Engine C is canonical

| Candidate | For | Against |
|---|---|---|
| **C, `scheduleRoadmap` (chosen)** | Pure function of `(file, resolved, today)`: no pixels, no window, no scale. Already a published `@nowline/layout` export and the exporters' source. Its result is a superset of B's (per node, per wave). Days are the DSL's own unit. | Needs B's scope rules (non-wave regions, container cursors, `today`) to replace B. |
| A, pixel layout | It is what users see. | Needs the date window to place anything, and the window needs a schedule: a cycle. Its pixel quirks (b) to (d) are presentation, not scheduling. It cannot run without measurement. |
| B, `computeContentEndDay` | Already feeds the window. | Returns one number; a strict subset of C's walk. |

So C stays, B becomes `contentEndDay(schedule)`, and A consumes C's outputs where that is byte-identical.

**Why A could not simply floor every start from C at first.** "Engine A floors from C" means `startX = max(A's start, forward(C.start))`. That is the identity only when C's start is a lower bound of A's. Divergences (b), (c), (d) and (f) kept it a lower bound, but (a), (e) and pins before the roadmap start made A start earlier than C, and the probe showed (a) in three samples. Flooring would have moved those bars, and C's `S_k` could not warm-start A's pixel barrier passes for the same reason. F1, F2 and F8 resolved those cases, and F5 gave A the region anchors C already used (§5), so C is a lower bound of A on every item and wave edge (`schedule-lower-bound.test.ts`). F4 then did both without changing output: A floors each start by C's, and seeds the barrier driver with C's `S_k` and `E_k` ([`waves.md`](./waves.md) §8.3, "Warm start"). Kleene iteration from any lower bound of the least fixpoint reaches the same fixpoint, in fewer passes.

### 3.2 Engine C's result grows what B needed

`scheduleRoadmap` gains the scope B covered, so that B's number can be read off C's result. Nothing an exporter reads today changes.

```ts
export interface ScheduleOptions {
    /** Reference date when the roadmap omits `start:`. */
    today?: Date;
    /**
     * The roadmap's wave plan from `buildWavePlan(resolved)`, when the caller
     * already built it; `null` means "built, no waves". Omitted: built here.
     */
    plan?: WavePlan | null;
}

export interface RoadmapSchedule {
    // ...every existing field, unchanged...
    /** The wave plan the schedule ran with; undefined without waves. */
    plan?: WavePlan;
    /** The `ResolveResult` this schedule was built from (identity check for reuse, §3.6). */
    resolved: ResolveResult;
    /** What the date window needs (§3.3). */
    extent: ScheduleExtent;
}

export interface ScheduleExtent {
    /**
     * Latest working-day offset from `startDate` reached by any lane cursor
     * (item ends and container starts), any dated anchor, any milestone, and,
     * with waves, every `S_k` and `E_n`. `today` is not included. Exactly the
     * value `computeContentEndDay` returns today with `today` undefined.
     */
    contentEndDay: number;
}
```

- **One walker.** C's `makeWalker` (`schedule.ts:166-255`) gains B's `reach` callback (`layout.ts:1509-1540`), which updates `extent.contentEndDay` after every lane child, so container starts that pass every child (an empty `group after:x`) still count.
- **Isolated regions without waves.** C walks them the way B's recursion does: each region with fresh id maps, nested regions recursively, region anchors and region milestones counted in the extent only. First-level region items join `byNode` (as they already do with waves); their ids stay out of `items`. No exporter walks regions (they iterate the root AST), so their bytes do not change; m1.s2 verifies that with gate G3.
- **Region sizes.** B's recursion resolves region items against the parent's sizes (`layout.ts:1694-1704` passes the parent `ctx`), while A and the wave-mode walks use the region's own. No sample has a region-only size (checked for this spec), so either choice renders every sample identically. The region's own sizes apply everywhere and the old behaviour is a bug (§8, decision 2).

### 3.3 The date window is a projection

`computeDateWindow` (`layout.ts:1357-1423`) keeps its rounding and `length:` rules and changes only where its content day comes from:

```ts
export function computeDateWindow(
    file: NowlineFile,
    schedule: RoadmapSchedule,
    today: Date | undefined,
    scale: ViewPreset,
): { startDate: Date; endDate: Date } {
    const lengthDays = literalToDays(propValue(props, 'length') ?? '', cal);
    let contentDays = schedule.extent.contentEndDay;
    if (today && !(lengthDays > 0)) {
        const t = calendar.workingIndexOf(schedule.startDate, today);
        if (t > 0) contentDays = Math.max(contentDays, t);
    }
    // ...tickBoundaryAtOrAfter and the length floor exactly as today...
}
```

- The start date is `schedule.startDate`; `defaultStartDate` and `utcMidnight` collapse into one helper.
- `computeContentEndDay` and `literalDays` are deleted.
- The post-placement extension (`roadmap-node.ts:763-812`) stays. It exists because A's pixel quirks can run past C's days (§1.3, last row), and R2 owns it.

### 3.4 What engine A takes from the schedule

| Fact | Today | After R1 | Byte-identical because |
|---|---|---|---|
| Window start and end | B | `computeDateWindow(file, schedule, …)` | `extent.contentEndDay` equals B's result (oracle test, §6) |
| Item duration in working days | `deriveItemDurationDays` called in `sequenceItem` (`layout.ts:426`), the lane predictor (`swimlane-node.ts:320`) and the group loop | `schedule.byNode.get(node).days` | same function, same sizes, same calendar |
| Start terms (`date:`, `start:`, `after:` ids and inline dates) | parsed five times (§1.4) | one `startTermsOf(props)` in `layout/src/start-terms.ts`, used by C's walker, `resolvePinnedOrSequentialStart`, `startPinOf` and `wavePinOverrideOf` | pure refactor of parsing; each caller keeps its own `max` rule |
| Wave floor dates | parsed in days and in px | one `waveFloorDates(plan)` returning `Date \| null` per wave; C maps it with `workingIndexOf`, A with `scale.forward` | same parse, same projections |
| Item starts | A's own rule | unchanged in R1 (divergence (e); (a) settled by F1); F4 later floors them by C's start | — |
| Barrier `S_k`/`E_k` | A's own pixel passes | unchanged in R1; F4 later seeds the first pass from C | the barrier must hold on A's own ends ([`waves.md`](./waves.md) §8.6) |

`startTermsOf` returns the parsed terms, not a start. This is the shape m1.s4 designed; F8 removed the `pin` field with the item pin, so the built `StartTerms` holds only `after`:

```ts
export interface StartTerms {
    /** `date:` when it parses, else `start:` when it parses (`date:` wins). */
    pin?: { key: 'date' | 'start'; raw: string; date: Date };
    /** `after:` elements in source order: an ISO date or an id. */
    after: ReadonlyArray<{ raw: string; date: Date } | { raw: string; ref: string }>;
}
```

The day walker keeps `max(prevEnd, …after)`. The pixel walker's rule was `max(laneLeftX, …after)`; F1 settled divergence (a) in C's favour (§8, decision 3) and it is now `max(laneCursor, …after)`, a one-line change with a test that names it.

### 3.5 The wave-barrier fixpoint

`wave-barrier.ts` already holds the shared parts: the driver `solveWaveBarriers` (`:55-84`), the day-floor projection `waveFloorDays` (`:104-113`), the per-pass state `WavePass` (`:119-167`) and `summarizeWaves` (`:189-227`). What is copied is the per-pass wiring around them (reset the maps, seed the wave ids with `E_k`, walk the lanes, walk one level of regions), once in B and once in C. With B gone there are exactly two callers of the driver:

- **C, in days**, the only day-space wiring, which also fills `extent`.
- **A, in px** (`roadmap-node.ts:683-708`), which keeps its own pass loop because its ends include the pixel quirks and the 12 px wave gutter is a property of its own ends.

A and C keep agreeing on wave spans except where a divergence binds a wave's end; the register (§6) lists those cases. `waveFloorDays` and `createWaveLayoutState` (`wave-layout.ts:57-76`) both read `waveFloorDates(plan)`. After F1 and F2, A's driver call can start from `S_k^C` projected to px (§3.1).

### 3.6 One plan and one schedule per staging, carried to exporters

The staging step (today the export kernel's `stageDocument`, `packages/export/src/index.ts:250-359`; the shared staging function of [`surface-options.md`](./surface-options.md) once R4 lands) builds both once and hands them on:

```ts
const plan = buildWavePlan(resolved) ?? null;
const schedule = scheduleRoadmap(ast, resolved, { today: inputs.today, plan });
const model = layoutRoadmap(ast, resolved, { ...layoutOptions, schedule });
const exportInputs: ExportInputs = { model, ast, resolved, schedule, sourcePath, today };
```

```ts
// packages/export-core/src/types.ts
export interface ExportInputs {
    model: PositionedRoadmap;
    ast: NowlineFile;
    resolved: ResolveResult;
    /**
     * The day schedule the layout used (`scheduleRoadmap`), wave plan
     * included as `schedule.plan`. Exporters read dates, durations and wave
     * spans from it. Optional so callers outside the kernel keep working:
     * an exporter given none schedules the roadmap itself.
     */
    schedule?: RoadmapSchedule;
    sourcePath: string;
    today?: Date;
}
```

- `LayoutOptions.schedule?: RoadmapSchedule`. `layoutRoadmap` uses it when `schedule.resolved === resolved` and builds its own otherwise, so direct callers and tests keep working; `RoadmapNode.place` takes `plan` from `schedule.plan`.
- The three schedule exporters replace `scheduleRoadmap(…)` and `buildWavePlan(…)` with `inputs.schedule ?? scheduleRoadmap(…)` and `schedule.plan`.
- `ExportInputs` is built only by the kernel inside this repo (the CLI, MCP and the VS Code extension all call `exportDocument`), and the field is optional, so the published `@nowline/export-*` API stays compatible.

Per XLSX export: wave plans from 3 to 1, day walks from 2 to 1. Per SVG export: one day walk, as today (C instead of B).

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
  (`diff -r` exits non-zero when any SVG or exit status differs, and lists every difference rather than the last. The sample list is the base's, so a sample the step deletes or breaks fails too. The gate does not use `make build`, which renders only the slugs listed in `scripts/lib/render-manifest.mjs` and so skips `examples/continuation`, `examples/minimal.fr`, `tests/grammar-properties`, `tests/grammar-properties-include`, `tests/partner-multi` and `tests/waves-isolate-team`, and renders the seven include files under `examples/nested/` and `examples/waves-program/` only through their parents. At the commit that adds this spec all 180 renders exit 0, and two runs on that commit give identical trees, in about three minutes.)
- **G2, snapshots.** `make pre-commit` passes without `UPDATE_LAYOUT_SNAPSHOTS`.
- **G3, exporter bytes** (steps that touch exporters or the schedule). For every sample, `nowline <file> -f xlsx`, `-f msproj` and `-f mermaid` with `--now 2026-02-09` give the same bytes on both commits, and `make determinism` passes without `UPDATE_DETERMINISM_GOLDENS`.

No step adds a changelog fragment except where noted.

### m1 - Engine B becomes a projection of engine C

#### s1 - Add the engine divergence register

Add `packages/layout/test/engine-divergence-register.test.ts` and `engine-divergences.json`. The test lays out every roadmap under `examples/` and `tests/`, compares A's logical span of every named item (and every wave span) with C's, and checks the mismatches against the committed register, keyed by sample and item, each classified (a) to (f) or `region-scope`. A new mismatch fails; so does a registered one that disappears. Seed it from HEAD (§1.3). Test-only.

#### s2 - Give engine C engine B's scope

Implement §3.2: `ScheduleOptions.plan`, `RoadmapSchedule.plan`, `.resolved`, `.extent`; the `reach` hook; non-wave region scheduling. Add an oracle test that keeps a frozen copy of today's `computeContentEndDay` under `test/` and asserts `extent.contentEndDay` equals it for every sample, the 60 generated roadmaps of `waves.test.ts:1456-1491`, and fixtures for each scope rule (empty `group after:`, nested region, region milestone, undated anchor, waves with an empty trailing wave). The register's `region-scope` entries disappear in this step, except `nested.nowline`'s (§9). G1, G2, G3.

#### s3 - Derive the date window from the schedule

Implement §3.3: `RoadmapNode.place` schedules once and passes the schedule to `computeDateWindow`; delete `computeContentEndDay`, `literalDays` and the duplicate start-date helper. Region sizes follow §8, decision 2: the region's own sizes, with a regression test and a `fixed` fragment for the window of a region with region-only sizes. G1, G2.

#### s4 - Parse start terms and wave floors once

Add `start-terms.ts` (`startTermsOf`) and `waveFloorDates(plan)`; switch C's walker, `resolvePinnedOrSequentialStart`, `startPinOf`, `wavePinOverrideOf`, `waveFloorDays` and `createWaveLayoutState` to them. G1, G2, G3.

### m2 - One plan and one schedule per staging

#### s1 - Let layout reuse a schedule

Add `LayoutOptions.schedule` with the identity check of §3.6; `layoutRoadmap` builds plan and schedule once when absent and passes them to `RoadmapNode.place`. G1, G2.

#### s2 - Carry the schedule to exporters

Add `ExportInputs.schedule`. The kernel's staging builds plan, schedule and layout in that order and fills it; XLSX, Mermaid and MS Project read `inputs.schedule ?? scheduleRoadmap(…)` and `schedule.plan`. Add a test that a kernel export calls `buildWavePlan` once (spy) and that each exporter still works without `schedule`. G1, G2, G3.

#### s3 - Read durations from the schedule in engine A

`sequenceItem`, the lane predictor, the group loop and `predictItemBarExtraHeight` read `schedule.byNode.get(node).days` (exposed on `LayoutContext`) instead of calling `deriveItemDurationDays`. G1, G2.

### m3 - Tests describe behaviour, not agreement

#### s1 - Assert the worked examples on each engine directly

Make sure every §11 worked example is asserted on C in the existing `packages/layout/test/schedule.test.ts` (its "§11 worked examples" and "wave barrier details" blocks), adding what is missing, rather than in a duplicate `schedule-waves.test.ts` (§9). In `waves.test.ts`, `expectTable` and `expectWaves` assert A against the same tables and drop `engineCWeeks` / `engineCWaveSpans` (`:196-206`, `:1072-1084`). Each example is still checked twice, against the spec's numbers instead of against each other. Test-only.

#### s2 - Retire the remaining agreement tests and the oracle

Split `layout.test.ts:2139-2198` and `working-day-schedule.test.ts:533-595` into a pixel expectation and a day expectation; drop "the two engines report equal wave dates", which the register covers. Delete the frozen `computeContentEndDay` oracle from m1.s2. Rewrite `date-window.test.ts` against `computeDateWindow(file, schedule, …)` and add direct `extent` tests (the scope fixtures of m1.s2 become literal `extent` expectations). Test-only.

#### s3 - Update the specs

[`waves.md`](./waves.md) §8.2, §8.5 and §8.6 (engine B removed, the register replaces "avoid by construction"), [`working-calendar.md`](./working-calendar.md), [`rendering.md`](./rendering.md) and [`layout-phases.md`](./layout-phases.md) where they name engine B, the stale engine-B comments in `schedule.ts`, `wave-barrier.ts` and the register test, and this file's status line. Docs-only.

## 5. Follow-ups outside this migration

Each of these changes rendered or exported bytes, so none is part of the byte-identical plan above. They still belong to m4.11. All eight landed (§9 has the as-built note of each), each naming its snapshot or golden bump, carrying a changelog block and removing its register entries.

| # | Change | Changes | Evidence |
|---|---|---|---|
| F1 | Divergence (a), decided: `after:` on a lane or group child starts at `max(previous item end, refs)`, so it only ever delays (A adopts C). [`dsl.md`](./dsl.md) gains that sentence | the SVG of 3 samples; `showcase` now draws Ship after the parallel it waits on, at 42.2 working days against the exports' 40 (the remaining 2.2 days are the (d) tail gutter, closed by F3) | showcase, sizing, late-row-shifts |
| F2 | Divergence (e), decided: the chart honours `after:` on a group inside a parallel (A adopts C; matches [`dsl.md`](./dsl.md)'s block `after:` row and F1) | as F1 | no sample today |
| F3 | The pixel quirks stay out of the lane cursor, decided per divergence: (b) the cursor advances by the duration, the bar keeps its minimum width and the row packer its painted footprint, so a following bar drops a row; the clamped bar's own drawn width is presentation and keeps its register entry (§8, decision 6). (c) the cursor takes the group's compact end, the packer keeps the painted box, so a following item drops below the caption at its true date. (d) the tail gutter leaves the lane cursor and the parallel's box (showcase `Ship` to day 40). (f) resolved by F8: without item pins nothing moves a cursor back, so it needs no code of its own | SVG of 7 samples | §1.3 |
| F4 | After F1, F2, F5 and F8: floor A's starts from C, and warm-start A's barrier passes from C's `S_k` and `E_k` (seeding `S_k` alone left 7 of the 12 wave samples at their cold 2 passes). Under `show` the floor compares the placed (snapped) start, so an unsnapped `after:` date that NL.I1008 reads stays put. With those four landed C is a lower bound of A everywhere, because (b), (c) and (d) only ever make A later and F8 removes the pin before the roadmap start and the pin past a `length:` window | nothing (same fixpoint); `waveSolve.passes` drops | §3.1; [`waves.md`](./waves.md) §8.3 |
| F5 | Region anchors in isolated regions without waves: engine A resolves an `after:` that names a region's own anchor (`anchor kickoff` in each `examples/nested/*.nowline` region) inside that region, as C does, instead of starting at the region's day 0 | the SVG of `nested`; its 50 `region-scope` register entries go | §9; `examples/nested.nowline` |
| F6 | Status dot, decided: it draws inside a bar only when it has equal air on both sides, that is the bar is at least 24 px wide (2 × `ITEM_STATUS_DOT_INSET_RIGHT_PX`); a narrower bar spills the dot outside. An m4.11 follow-up, not a new milestone (§8, decision 13) | the SVG of samples with bars 17 to 23 px wide | `MIN_BAR_WIDTH_FOR_DOT_PX` |
| F7 | Caption cap at the chart's end only, decided: a caption that would run past the axis end truncates with `…` to end within one extra column; the axis grows by that column, labelled only where `label-every`, thinning and the narrow-column rules label it, and the full title stays as the bar's `<title>` tooltip. Mid-chart captions are unchanged. An m4.11 follow-up (§8, decision 13) | the SVG of samples whose last caption passes the axis end | `extendTimeline` in `phases/finalize.ts` |
| F8 | Item `date:` and `start:` pins, decided: removed, on items only. They were never in the DSL ([`waves.md`](./waves.md) calls it "the undocumented fixed-start pin") and a "must start on" constraint breaks Design Rule 6; `after:<date>` covers "not before". Roadmap `start:`, anchor and milestone `date:` and calendar declarations are unchanged. A also stops honouring a pin on a group or parallel (the validator already warned and C ignored it). The specs state that pinning is not supported: it starts to require resource-level splits and conflicts with [`principles.md`](./principles.md), and it may be revisited in the future. Settles F3 (f) and the pin-before-start case F4 needs | the SVG and exports of any roadmap that pins an item; a validation change for item `date:` and `start:` | `waves.md` §5.1; `resolvePinnedOrSequentialStart` |

## 6. Test strategy

- **Register** (m1.s1): the A/C differences on the real corpus are an explicit, reviewed list. A refactor that introduces a new one fails; a fix that removes one must delete its entry.
- **Oracle** (m1.s2 to m3.s2): the frozen engine B proved `extent.contentEndDay` is the same number on every sample, the generated corpus and scope fixtures while B was being replaced. m3.s2 deleted it; `schedule-extent.test.ts` keeps the scope fixtures as literal `extent` expectations.
- **Direct tables** (m3.s1): the §11 worked examples assert C in days (`schedule.test.ts`) and A in weeks (`waves.test.ts`) against the spec's own numbers. The barrier theorem on 60 generated roadmaps (`waves.test.ts:1456-1491`) stays A-only.
- **Reuse** (m2.s1, m2.s2): `buildWavePlan` and `scheduleRoadmap` run once per kernel export (spy); `layoutRoadmap` rebuilds the schedule when handed one built from another `ResolveResult`; each exporter still runs without `inputs.schedule`.
- **Gates** G1 to G3 on every step (§4).

## 7. Risks

| Risk | Mitigation |
|---|---|
| A scope rule of B is missed and a window changes on a file outside the corpus | the oracle covers the generated corpus and one fixture per scope rule; the register shows any new mismatch |
| Region items in `byNode` change an exporter's bytes | exporters walk the root AST only; G3 on every sample |
| A caller hands `layoutRoadmap` a stale schedule | identity check on `schedule.resolved`; a mismatch rebuilds |
| The register becomes a rubber stamp (entries added to make CI green) | entries carry a divergence letter; after F1 to F8 only (b), as a clamped bar's own drawn width (§8 decision 6), is valid, and adding one needs a reason in the PR |
| Engine A still has its own start rule, so "one scheduler" is only true in days | stated as a non-goal; F1 to F5 and F8 closed it and F4 makes A floor from C, and R2 moves A's passes into an explicit phase |
| The published `ExportInputs` shape changes | the new field is optional; exporters fall back to scheduling themselves |

## 8. Decisions

Gary, 2026-10-13:

1. **Milestone ID.** Yes: m4.11, with R3 as m4.12, R4 as m4.13 and R2 as m4.14.
2. **Region sizes in the window.** Yes: m1.s3 uses the region's own sizes and ships a `fixed` fragment; no sample changes.
3. **Divergence (a), the meaning of `after:` on a lane item (F1).** The exports' reading: an item with `after:` starts once both the previous item in its lane and every referenced item have finished, so `after:` only ever delays. Engine A adopts C's rule in F1, which changes the chart for `showcase`, `sizing` and `late-row-shifts`, and [`dsl.md`](./dsl.md) states the rule. This reverses the draft's recommendation (chart canonical).
4. **Order with R2.** Yes: m1 and m2 land before R2's first step that touches `RoadmapNode.place`.

Gary, 2026-10-15:

5. **Divergence (e), `after:` on a group inside a parallel (F2).** The chart honours it: engine A adopts C, which matches [`dsl.md`](./dsl.md)'s block `after:` row and decision 3.
6. **Divergence (b), minimum bar width (F3).** *Superseded by the true-width layout (m4.15, [`true-width-layout.md`](./true-width-layout.md) §3.1): no bar is drawn wider than its dates, so there is no clamped width to call presentation and the register is empty.* Out of the lane cursor. The cursor advances by the duration; the bar keeps its minimum width; the row packer keeps the painted footprint, so a following bar drops a row instead of drifting. The clamped bar's own drawn width is presentation: its register entry stays, citing this decision. The (b) entries of the items that follow it go.
7. **Divergence (c), group caption spill (F3).** *Superseded by the true-width layout (m4.15, [`true-width-layout.md`](./true-width-layout.md) §3.3): a container spans exactly its dates and takes no horizontal space, and the one lane cursor carries only the time end; a caption or header past the end is footprint the row packer keeps.* Out of the lane cursor. The lane cursor takes the group's compact end; the packer keeps the painted box, so a following item drops below the caption at its true date.
8. **Divergence (d), track tail gutter (F3).** Out of the lane cursor and out of the parallel's box (showcase `Ship` to day 40).
9. **Divergence (f), monotone cursor (F3).** The lane never moves back in time: an item starts after the latest end before it. There is no item splitting, which [`principles.md`](./principles.md) excludes as resource levelling. Resolved by construction by decision 10: without item pins nothing moves either engine's cursor back, so it needs no code change of its own.
10. **Item `date:` and `start:` pins (F8).** Removed, items only. They were never in the DSL ([`waves.md`](./waves.md) calls it "the undocumented fixed-start pin"), and a Gantt "must start on" constraint breaks Design Rule 6; `after:<date>` covers "not before". Roadmap `start:`, anchor and milestone `date:` and calendar declarations are unchanged. This also removes engine A honouring a pin on a group or parallel (the validator already warned; C ignored it). The specs say that pinning is not supported: it starts to require resource-level splits and conflicts with [`principles.md`](./principles.md), and it may be revisited in the future.
11. **Status dot (F6).** Inside a bar only when it has equal air on both sides: bar width at least 24 px (2 × `ITEM_STATUS_DOT_INSET_RIGHT_PX`), else it spills outside.
12. **Caption cap at the chart's end only (F7).** A caption that would run past the axis end truncates with `…` to end within one extra column; the axis grows by that column with its date label; the full title stays as the bar's `<title>` tooltip. Captions in the middle of the chart are unchanged.
    - Gary, 2026-10-15 (after the run): the added column follows the axis's labelling rules; it is labelled only when `label-every`, thinning and the narrow-column rules would label it.
13. **Placement.** F6 and F7 are m4.11 follow-ups (§5 rows), not a new milestone. F4 is planned: with F2, F5 and F8, C is a lower bound of A everywhere.

Gary, 2026-10-16:

14. **Milestones and `before:` read the duration end.** Decision 6 extends to them: an after-only milestone sits on its latest predecessor's duration end (C's day, in the gutter 6 px right of a bar's visual edge), a dated milestone is overrun and a `before:` cap is missed only by a duration end, and every arrow and the red tail keep the painted edge (*the gutter and the painted edge are gone since m4.15: a bar ends on its duration end, so arrows, slack lines and the red tail start there; [`true-width-layout.md`](./true-width-layout.md) §3.4, §3.5*). This closes two of §9's known open gaps, and takes the dated-milestone overrun along as the same class.

## 9. As built

Where the implementation differs from the text above, or makes a choice the text left open:

- **F1 is `m1.s5`.** It landed right after `m1.s4`, in the one function (`resolvePinnedOrSequentialStart`) that step rewrote onto `startTermsOf`. It also moves lane-level groups and parallels with `after:`, which take the same path. Only showcase, sizing and late-row-shifts changed (G1).
- **showcase `Ship` was not on day 40 in the chart after F1.** Engine A drew it at 42.2 working days against the exports' 40: the lane cursor took the parallel's box edge, which included the 8 px track tail gutter of divergence (d). F3 closed that (below); `Ship` now starts on day 40.
- **The register's `classes` is an array**, because some mismatches had two causes (showcase `ship` and `announce` were (a)+(b); late-row-shifts `p1` and `d` were (a)+(c)). F1 deleted the (a)-only entries and the letter (a) from the others; F2, F3 and F5 deleted the rest.
- **`nested.nowline` kept 50 `region-scope` register entries after m1 (follow-up F5, §5).** Each nested region declares its own `anchor kickoff` and starts lanes `after:kickoff`; C resolved it inside the region (day 1), while A had no region anchors and started at day 0. F5 removed them all (below). The other three region-scope samples never had entries.
- **`computeDateWindow` takes its calendar from the schedule** (`schedule.calendar`), since the §3.3 sketch drops the context that `literalToDays` needs; `RoadmapNodeDeps.computeDateWindow` changed with it.
- **Only first-level region items join `byNode`.** Deeper nested regions count in `extent` only, and `scheduledItemDays` throws on a node missing from `byNode`, which engine A never asks for because it lays out first-level regions only.
- **Staging moved to `stageRoadmap`.** R4 ([`surface-options.md`](./surface-options.md) §3.3) replaced the kernel's `stageDocument` with `@nowline/renderer`'s `stageRoadmap`, which now builds the plan and the schedule as in §3.6, lays out with the schedule and returns both on the staged result; the kernel's `exportStaged` fills `ExportInputs.schedule` from it. The browser pipeline, `--serve` and MCP stage through it too.
- **Public API.** `ScheduleOptions.plan`, `RoadmapSchedule.plan`, `.resolved`, `.extent` (`ScheduleExtent`), `LayoutOptions.schedule` and `ExportInputs.schedule` are new; the changelog fragment `scheduler-unification.txt` names them.
- **m3.s1** asserts C in the existing `schedule.test.ts` instead of a new `schedule-waves.test.ts`; it already held the §11 blocks, so the review added only what the blocks lacked: Example 7's fix variant, Example 9's wave dates, and then (after review) the numbered variants of Examples 3 (without `docs`), 6 (without the dependency), 10 (without waves), 11 (without the floor), 13 (both fixes) and 15 (the move fix).
- **The 60-roadmap generator** moved to `test/generated-roadmaps.ts`; the barrier theorem in `waves.test.ts` stays A-only, and `schedule-extent.test.ts` checks that `extent` reaches every item and wave end on the same roadmaps.

### The follow-ups as built (F2 to F8)

Each landed with its own commits (the plan's units, not the m1 to m3 steps of §4), a block in `.changelog/scheduler-follow-ups.txt`, and the snapshot and determinism-cell bumps its commit names. Where the build differs from §5 the difference is here.

- **F8 (the pins).** Item `date:` and `start:` are removed from engine A (`start-terms`, `start-rules`, `sequence-item`) and engine C (`walkNode`); the wave order rules in core (`waves-order.ts`) no longer let a pin cut the flow either. The validator drops both keys from the item's known keys, so they draw `NL.W0700` with the hint `Did you mean "after:<date>"?` on an item, a group or a parallel (not on a swimlane, where an inline date is `NL.E0411`). `NL.W1001`, `W1001Args` and `PositionedItem.wavePinOverride` are retired; `NL.I1008` covers only the date in an `after:`. `resolvePinnedOrSequentialStart` keeps its name though it no longer pins. [`dsl.md`](./dsl.md) gains "Pinning is not supported". Only `tests/weekends-show` changed (it moved to `after:2026-01-07` and gained the glyph), and its xlsx and mermaid exports with it.
- **F2 (`after:` on a group track).** `GroupNode.place` starts at the wave floor of the resolved start, so a group track of a parallel starts at `max(the parallel's start, its refs)`. No sample has the shape, so nothing moved. A parallel's box reports only its tracks' compact ends, so a caption spilled from a track never reached the canvas; the row track now passes each block's painted right edge to the row packer, which widens only the canvas and the enclosing group's box, never row packing. The review widened this from group tracks to every parallel track's spilled caption.
- **F3 (the pixel quirks).** (d): the tail gutter leaves the lane cursor and the parallel's box, and `TRACK_BLOCK_TAIL_GUTTER_PX`, a public `@nowline/layout` export, is deleted. showcase `Ship` is on day 40, platform-2026 and product move the item after a parallel 8 px earlier, and `minimal` also moved (its last child is a parallel of group tracks, so its box and canvas are 8 px narrower; decision 8). (c): the lane cursor takes the group's compact end while the row packer keeps the painted box; the waves sample's `Launch page` starts 10.8 days earlier, and inline-date-pins and late-row-shifts moved. (b): the cursor, a parallel's join, an `after:` reference and the wave barrier all take the duration end, while the row packer, the group box, the canvas and the arrows keep the painted footprint. `TrackCursor` carries both ends (`x` for time, `maxX` for the painted edge). showcase, non-working-hide and non-working-show moved; size-and-capacity did not (its clamped bar has no item after it in its lane). A clamped bar may paint past its wave boundary, and the barrier theorem test and [`waves.md`](./waves.md) §8.4 compare duration ends. (f) needed no code (decision 9). The register keeps six entries, each a clamped bar's own drawn width: showcase `ship`, `brief` and `announce`, non-working-hide `qa`, non-working-show `qa`, size-and-capacity `f1`. `finalize-coverage.json` moves with layout changes too.
- **F5 (region anchors).** `buildIncludeRegions` seeds each region's dated anchors into the region context's edge maps, so a lane `after:kickoff` starts on the region's anchor as C resolves it. F5 drew nothing new; a later change draws a region's anchors and milestones (see Known open gaps). Only anchors are seeded: C resolves a region's milestones after its lanes, so no item sees them. With waves, C's region walk sees only the wave edges and A keeps seeding only those. `nested` moved (its region bars after `kickoff` one day right), and the 50 `region-scope` entries went, so the register holds no `region-scope` entry.
- **F7 (the caption cap).** `measureItem` truncates a spilled caption that would end past one column beyond the axis end, through the new `AxisColumns` (`axis-columns.ts`) and `layoutSpillCluster`, which `sequenceItem` shares; finalize f2 grows the axis by that one column. The column is labelled like any other: it gets its grid line and date label only where `label-every`, the default thinning and the narrow-column and edge rules give it one (decision 12's clarification; a fix-up that forced its label was reversed after the run); a caption that ends inside the added column is not cut but still adds it, cut or not. A cut line keeps at least its first character and the meta line is never cut, so a short title in a narrow column can cut hard (dependencies `Deploy` to `Depl…`). The full title is the item's first-child `<title>` tooltip, joined with the wave tooltip when both apply. `PositionedItem.titleTruncated` is new. Under an explicit `length:` that ends mid-column, the added column is the full one after the partial column. 22 samples moved, 15 with a cut title.
- **F4 (floor and warm start).** `scheduleFloorX` floors each item's start by C's, and `solveWaveBarriers` seeds its first pass with C's `S_k` and `E_k`; seeding `S_k` alone left 7 of the 12 wave samples at their cold 2 passes. Under `show` the floor compares the placed, snapped start, so an unsnapped `after:` date that `NL.I1008` reads stays put. Output is byte-identical and `waveSolve.passes` drops (`waves.nowline` 4 to 1). `schedule-lower-bound.test.ts` holds the precondition on every sample and the 60 generated roadmaps.
- **F6 (the status dot).** `MIN_BAR_WIDTH_FOR_DOT_PX` is `2 * ITEM_STATUS_DOT_INSET_RIGHT_PX` (24). Its consumers are the two spill decisions (`sequenceItem`, `measureItem`), the first-line reserve (`itemTitleFirstLineRightReservePx`) and the layout insight; `MIN_BAR_WIDTH_FOR_LINK_AND_DOT_PX` (41) already assumed a dot at its in-bar position and is unchanged, and the renderer reads `dotSpills`. No sample has a bar 17 to 23 px wide, so G1 and G3 are byte-identical on all 60 samples and no snapshot or golden moved; the tests pin 23 and 24 px (`item-bar-geometry.test.ts`, and bars of 23, 20 and about 24.4 px laid out in `layout.test.ts`). The existing "ignores decorations that spill out of a narrow bar" case moved to 23 px, since the dot (24) and the footnote digits (23) no longer have a width where the dot is inside and the digits spill. The MCP insight test's width cap moved from 320 to 400 px for the same reason: its logo-less bars were 17 to 23 px wide and now spill the dot, so the cap keeps them over 24 px and the logo's bars under it.
- **The register** held only the six clamped-bar entries named under F3, each `(b)` with the reason "presentation: bar drawn at its minimum width (decision 6)", until m4.15 m1 removed them with the minimum width; the date-truth, container-span and arrow-port invariant tests of [`true-width-layout.md`](./true-width-layout.md) §6 replace it.
- **Milestones and `before:` (decision 14, after m4.11).** Two time paths still read the painted end after F3; both moved to the duration end, closing two of the known open gaps. A milestone predecessor (`MilestonePredecessor`) carries `endX`, its end in time (`entityRightEdges`, an item's duration end), beside `x`, the painted bar edge its arrow starts from. An after-only milestone sits on the latest `endX`, the day C gives it, which is 6 px right of a bar's visual edge (in the gutter) and, after a clamped bar, left of its painted end; a dated milestone overruns only when a predecessor's `endX` passes its date, so a clamped bar whose duration ends on the date no longer turns it red. Flow dedupe and the binding predecessor compare `endX`; a non-binding predecessor draws a slack arrow only when both its `endX` and its painted edge are left of the milestone. `before:` flags an item when its duration end passes the cap; the red tail still runs from the cap to the painted end. Decision 14 takes the dated overrun along. No export moved. 17 samples moved, each by its after-only milestones with their cut lines and slack-arrow ends: 6 px right in dependencies, isolate-include, long, `nested/` android, data, ios, platform and web, platform-2026 (both milestones), product, teams, isolate-include-multi, marker-left-overflow (whose canvas grows the same 6 px), late-row-shifts and text-wraps-inside-bars; 6 px right in `nested`, whose five region milestones are drawn since the region-marker change below (the iOS and Android region boxes widen the same 6 px to keep the label inside); and 4.18 px in showcase (`Launch` follows the clamped `announce`, so its duration end is only 4.18 px past the bar). In late-row-shifts and text-wraps-inside-bars the milestone now sits on the axis end, so its diamond adds one labelled column (f2), as a dated milestone on the last day already did, and `finalize-coverage.json` adds both to `extendTimeline` and `fitWidths`. No sample has a dated milestone after a clamped bar or a clamped `before:` item, so neither of those moved one. Seven layout snapshots move with them (dependencies, isolate-include, marker-left-overflow, text-wraps-inside-bars, and platform-2026 in light, dark and grayscale); 16 determinism cells move with them, `svg`, `html`, `png` and `pdf` of the four gate fixtures that carry an after-only milestone (platform-2026, platform-2026-dark, dependencies, isolate-include), and those four fixtures' `cli` pdf overrides; their `json`, `mermaid`, `msproj` and `xlsx` cells and every other fixture are unchanged. `milestone-time-end.test.ts` pins all of it, and [`waves.md`](./waves.md) Example 8 moves `ga` from 6 px left of W6 to W6.

### After m4.11

- **`after:` a parallel or a group.** This closes two of the gaps m4.11 recorded (engine C ignored `after:<parallel>` and `after:<group>`; engine A read a group's painted box). Engine C's `walkNode` registers a named parallel at its latest track end and a named group at its last child's end in `scope.itemEnd`, the map items already use, so `resolveAfterDay` resolves them (they were day 0); the map is rebuilt on each barrier pass and in each region, like the item ids. Engine A's `GroupNode.place` registers the group's `entityRightEdges` at `timeCursorX`, its compact end, not the painted box, which a spilled caption or a bar drawn at its minimum width widens (decisions 6 and 7 applied to the `after:` edge; the parallel already registered `maxTimeRight`). An after-only milestone that names a group or a parallel follows in both engines: C reads the same map, and A's `collectMilestonePredecessors` reads `entityRightEdges` for anything that is not an item. Of the exports, the XLSX dates move; MS Project and Mermaid write links, not dates, and do not change (see the gap below). No sample has the shape: every `examples/` and `tests/` file is byte-identical in light, dark and grayscale SVG and in xlsx, msproj and mermaid, and no snapshot, golden or register entry moved. `after-lane-cursor.test.ts` pins A and C equal for `after:` a parallel, a group, a group whose caption spills, a group whose last bar is clamped, and the same under waves; `schedule-lower-bound.test.ts` stays green (C only got later, and F4 floors A by C).

### Known open gaps

Found while building F2 to F8. All were there before m4.11, none is a register entry (the register holds A against C on item and wave spans only) and none is a follow-up row; they are recorded here so they are decided, not rediscovered.

- **Mermaid writes an inline date in `after:` as a task id.** `after:2026-03-15` becomes `after 2026-03-15`, an id the chart never declares; Mermaid skips an unknown id and, with none left, starts the task on the day the chart renders. Mermaid has no "no earlier than" a date, so the fix is a decision (write engine C's start date, or a hidden dated milestone to chain after), not a mapping. `inline-date-pins`, `inline-date-corners`, `late-row-shifts` and `weekends-show` have it. MS Project writes no link for the date and no constraint either. Found while closing the link-export gap below.
- **Mermaid continues a lane after a parallel's last track only.** Engine C starts the next item in the lane at the parallel's latest track end; the exporter chains it `after` the last track, so an earlier-ending last track starts it too soon. Mermaid's multi-id `after a b`, which the `after:` expansion below uses, can say it; changing it moves the Mermaid export of every sample with an item after a parallel, so it is its own change. Found with the gap above.

**Resolved after m4.11: an isolated region's anchors and milestones are drawn.** [`dsl.md`](./dsl.md) said they render inside the region, and the chart had never drawn them. Each region now packs its own anchors and milestones into a marker row under its label tab, with the host's packer and label rules bounded by the region's insets, and its lanes move down by the band (`nodes/region-markers.ts`, [`rendering.md`](./rendering.md#include-region)). Their cut lines stop at the region's last lane; a label that fits on neither side grows the canvas in f3, and f7 shifts a region's markers with it. Ids stay region-scoped: no reference crosses a file boundary in either direction, so the region's markers never join the host's band. With waves, a region's anchors are seeded into its edge maps after its lanes, for its milestones only, so the lanes still see only the wave edges. `nested`, `isolate-include` and `isolate-include-multi` moved in every theme, along with the `isolate-include` layout snapshot and its svg, html, png and pdf determinism cells; `waves-isolate` and `grammar-properties` are byte-identical.

**Resolved after m4.11: an isolated region draws its own dependency arrows.** `buildDependencies` read only the host's items, so neither an item-to-item `after:` inside a region nor the stub from a region anchor's cut line was drawn, though the same file rendered on its own drew them. `buildIncludeRegions` now hands each kept region's context to finalize, and f11 routes each region's edges among its own lanes with that context (`PositionedIncludeRegion.edges`); the renderer draws them inside the region group, under-bar edges beneath its lanes and the rest above. The same three samples moved again (the region stubs after `kickoff`, and `nested`'s item-to-item arrows), as did the `isolate-include` snapshot and its four render cells.

**Resolved after m4.11: an isolated region's footnotes are drawn.** A region's `footnote` reached neither the footnote panel nor its item's superscript, though [`dsl.md`](./dsl.md) listed footnotes with the region's content. Each region's context now carries its own footnote index, numbered on after the host's in include order (`indexFootnotes`' `precedingCount`), so its superscripts are drawn; f14 adds each region's footnotes to the one panel after the host's, under a heading row with the region's title (`PositionedFootnoteEntry.region`), and styles them from the region's own config. The maintainer chose the shared panel over a panel inside each region, which would have restarted numbering at 1 and put two different footnote 1s on one chart. No sample has a footnote in an included file, so no sample, snapshot or determinism cell moved.

**Resolved after m4.15: the link exports keep `after:` a parallel and a group.** MS Project linked `after:g` to the group's summary task, but a parallel has no task, so `after:p` wrote no link and the item started on the project start; Mermaid wrote the ids as they were (`after g`), and neither a group nor a parallel is a Mermaid task, so the reference named an id the chart never declared. MS Project now links `after:<parallel>` to every track's task, an item or a group track's summary task, and MS Project starts the successor at the latest of them, engine C's latest track end. The parallel gets no summary task of its own: that would add a row and renumber every later UID in every export with a parallel, for the same date. The shared parallel walk also writes a group track of a parallel nested in a group, which used to be dropped. Mermaid expands `after:` a group or a parallel, on an item or a milestone, to the tasks that end it: a group's last child, every parallel track, recursively, without duplicates; Mermaid's `after a b` starts at the latest end it names (`ganttDb.js`'s `getStartDate`), so the task lands on engine C's day. The MS Project date holds when each track's own tasks are on engine C's dates, which needs their in-track order written as `after:`, since the export writes no implicit lane sequencing. No sample has the shape: every `examples/` and `tests/` file is byte-identical in light, dark and grayscale SVG and in xlsx, msproj and mermaid, and no snapshot or determinism golden moved. `after-container.test.ts` in each exporter pins the links and runs the tool's own forward pass against the dates the xlsx export writes.
