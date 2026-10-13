# Nowline — Scheduler Unification

**Status: Accepted (design only, no code yet).** Milestone **m4.11** in [`milestones.md`](./milestones.md); decisions in the last section. This is refactor R1 from [`review-since-v086.md`](./review-since-v086.md): one day-level scheduler instead of three hand-synced copies. Every `file:line` below was checked at the commit that adds this spec (source identical to 0062df3 plus the m2 fixes of the same review).

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

Divergences (b), (c), (d) and (f) can only make A **later** than C. Divergences (a) and (e), and a pin before the roadmap start, can make A **earlier**. That asymmetry decides what A may take from C (§3.4).

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

So the flagship samples already show the cost of three engines: the showcase's XLSX, MS Project and Mermaid exports date `Ship` and the `Launch` milestone a month later than its chart, and the waves sample's exports start `Launch page` two weeks earlier than its chart.

### 1.4 The cost of copies

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

- Fixing divergences (a) to (f). Each changes rendered output or exporter output and needs a maintainer decision and a deliberate snapshot or golden bump (§5).
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

**Why A cannot simply floor every start from C yet.** "Engine A floors from C" would mean `startX = max(A's start, forward(C.start))`. That is the identity only when C's start is a lower bound of A's. Divergences (b), (c), (d) and (f) keep it a lower bound, but (a), (e) and pins before the roadmap start make A start earlier than C, and the probe shows (a) in three samples. Flooring would move those bars. For the same reason C's `S_k` cannot warm-start A's pixel barrier passes ([`waves.md`](./waves.md) §8.3, last paragraph). Once (a) and (e) are resolved one way or the other (§5, F1 and F2), C becomes a lower bound everywhere and both become possible without changing output: Kleene iteration from any lower bound of the least fixpoint reaches the same fixpoint, in fewer passes.

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
| Item starts | A's own rule | unchanged (divergences (a), (e)) | — |
| Barrier `S_k`/`E_k` | A's own pixel passes | unchanged | the barrier must hold on A's own ends ([`waves.md`](./waves.md) §8.6) |

`startTermsOf` returns the parsed terms, not a start:

```ts
export interface StartTerms {
    /** `date:` when it parses, else `start:` when it parses (`date:` wins). */
    pin?: { key: 'date' | 'start'; raw: string; date: Date };
    /** `after:` elements in source order: an ISO date or an id. */
    after: ReadonlyArray<{ raw: string; date: Date } | { raw: string; ref: string }>;
}
```

The day walker keeps `max(prevEnd, …after)`; the pixel walker keeps `max(laneLeftX, …after)`. F1 settles divergence (a) in C's favour (§8, decision 3): the pixel walker's rule becomes `max(laneCursor, …after)`, a one-line change with a test that names it.

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
  (`diff -r` exits non-zero when any SVG or exit status differs, and lists every difference rather than the last. The sample list is the base's, so a sample the step deletes or breaks fails too. The gate does not use `make build`, which renders only the slugs listed in `scripts/render-samples.mjs` and `scripts/render-tests.mjs` and so skips `examples/continuation`, `examples/minimal.fr`, `tests/grammar-properties`, `tests/grammar-properties-include`, `tests/partner-multi` and `tests/waves-isolate-team`, and renders the seven include files under `examples/nested/` and `examples/waves-program/` only through their parents. At the commit that adds this spec all 180 renders exit 0, and two runs on that commit give identical trees, in about three minutes.)
- **G2, snapshots.** `make pre-commit` passes without `UPDATE_LAYOUT_SNAPSHOTS`.
- **G3, exporter bytes** (steps that touch exporters or the schedule). For every sample, `nowline <file> -f xlsx`, `-f msproj` and `-f mermaid` with `--now 2026-02-09` give the same bytes on both commits, and `make determinism` passes without `UPDATE_DETERMINISM_GOLDENS`.

No step adds a changelog fragment except where noted.

### m1 - Engine B becomes a projection of engine C

#### s1 - Add the engine divergence register

Add `packages/layout/test/engine-divergence-register.test.ts` and `engine-divergences.json`. The test lays out every roadmap under `examples/` and `tests/`, compares A's logical span of every named item (and every wave span) with C's, and checks the mismatches against the committed register, keyed by sample and item, each classified (a) to (f) or `region-scope`. A new mismatch fails; so does a registered one that disappears. Seed it from HEAD (§1.3). Test-only.

#### s2 - Give engine C engine B's scope

Implement §3.2: `ScheduleOptions.plan`, `RoadmapSchedule.plan`, `.resolved`, `.extent`; the `reach` hook; non-wave region scheduling. Add an oracle test that keeps a frozen copy of today's `computeContentEndDay` under `test/` and asserts `extent.contentEndDay` equals it for every sample, the 60 generated roadmaps of `waves.test.ts:1456-1491`, and fixtures for each scope rule (empty `group after:`, nested region, region milestone, undated anchor, waves with an empty trailing wave). The register's `region-scope` entries disappear in this step. G1, G2, G3.

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

Move the §11 tables into a new `packages/layout/test/schedule-waves.test.ts` that asserts them on C. In `waves.test.ts`, `expectTable` and `expectWaves` assert A against the same tables and drop `engineCWeeks` / `engineCWaveSpans` (`:196-206`, `:1072-1084`). Each example is still checked twice, against the spec's numbers instead of against each other. Test-only.

#### s2 - Retire the remaining agreement tests and the oracle

Split `layout.test.ts:2139-2198` and `working-day-schedule.test.ts:533-595` into a pixel expectation and a day expectation; drop "the two engines report equal wave dates", which the register covers. Delete the frozen `computeContentEndDay` oracle from m1.s2. Rewrite `date-window.test.ts` against `computeDateWindow(file, schedule, …)` and add direct `extent` tests. Test-only.

#### s3 - Update the specs

[`waves.md`](./waves.md) §8.2, §8.5 and §8.6 (engine B removed, the register replaces "avoid by construction"), [`working-calendar.md`](./working-calendar.md) and [`rendering.md`](./rendering.md) where they name engine B, and the `schedule.ts` header. Docs-only.

## 5. Follow-ups outside this migration

Each of these changes rendered or exported bytes, so none is part of the byte-identical plan above. They still belong to m4.11: each lands with whichever planned step it combines with best, and that PR names the snapshot or golden bump, carries a changelog fragment, and removes its register entries.

| # | Change | Changes | Evidence |
|---|---|---|---|
| F1 | Divergence (a), decided: `after:` on a lane or group child starts at `max(previous item end, refs)`, so it only ever delays (A adopts C). [`dsl.md`](./dsl.md) gains that sentence | the SVG of 3 samples; `showcase` draws Ship on day 40, matching its exports | showcase, sizing, late-row-shifts |
| F2 | Decide divergence (e): `after:` on a group inside a parallel | as F1 | no sample today |
| F3 | Keep the pixel quirks (b), (c), (d), (f) out of the lane cursor, or document them as presentation | SVG of 7 samples | §1.3 |
| F4 | After F1 and F2: floor A's starts from C, and warm-start A's barrier passes from C's `S_k` | nothing (same fixpoint); `waveSolve.passes` drops | §3.1 |

## 6. Test strategy

- **Register** (m1.s1): the A/C differences on the real corpus are an explicit, reviewed list. A refactor that introduces a new one fails; a fix that removes one must delete its entry.
- **Oracle** (m1.s2 to m3.s2): the frozen engine B proves `extent.contentEndDay` is the same number on every sample, the generated corpus and scope fixtures before B is deleted, then goes away.
- **Direct tables** (m3.s1): the §11 worked examples assert C in days and A in px against the spec's own numbers. The barrier theorem on 60 generated roadmaps (`waves.test.ts:1456-1491`) stays A-only.
- **Reuse** (m2.s1, m2.s2): `buildWavePlan` and `scheduleRoadmap` run once per kernel export (spy); `layoutRoadmap` rebuilds the schedule when handed one built from another `ResolveResult`; each exporter still runs without `inputs.schedule`.
- **Gates** G1 to G3 on every step (§4).

## 7. Risks

| Risk | Mitigation |
|---|---|
| A scope rule of B is missed and a window changes on a file outside the corpus | the oracle covers the generated corpus and one fixture per scope rule; the register shows any new mismatch |
| Region items in `byNode` change an exporter's bytes | exporters walk the root AST only; G3 on every sample |
| A caller hands `layoutRoadmap` a stale schedule | identity check on `schedule.resolved`; a mismatch rebuilds |
| The register becomes a rubber stamp (entries added to make CI green) | entries carry a divergence letter; only (a) to (f) and `region-scope` are valid, and adding one needs a reason in the PR |
| Engine A still has its own start rule, so "one scheduler" is only true in days | stated as a non-goal; F1 to F4 close it, and R2 moves A's passes into an explicit phase |
| The published `ExportInputs` shape changes | the new field is optional; exporters fall back to scheduling themselves |

## 8. Decisions

Gary, 2026-10-13:

1. **Milestone ID.** Yes: m4.11, with R3 as m4.12, R4 as m4.13 and R2 as m4.14.
2. **Region sizes in the window.** Yes: m1.s3 uses the region's own sizes and ships a `fixed` fragment; no sample changes.
3. **Divergence (a), the meaning of `after:` on a lane item (F1).** The exports' reading: an item with `after:` starts once both the previous item in its lane and every referenced item have finished, so `after:` only ever delays. Engine A adopts C's rule in F1, which changes the chart for `showcase`, `sizing` and `late-row-shifts`, and [`dsl.md`](./dsl.md) states the rule. This reverses the draft's recommendation (chart canonical).
4. **Order with R2.** Yes: m1 and m2 land before R2's first step that touches `RoadmapNode.place`.
