# m9 handoff — Phase B: Tri-state Lane Utilization Indicator

> Phase A (effort-based sizing, m1–m8) closed in commit `514d764`. All
> 622 monorepo tests pass; every `examples/*.svg` re-renders byte-stable
> against disk. This handoff captures where the project sits *before*
> Phase B starts and what m9–m14 need to deliver.

## Where we are

**Phase A landed (m1–m8):**

- `size <id> ["title"] effort:<duration>` declarations replace the old
  `duration` entity in [`packages/core/src/language/nowline.langium`](../../packages/core/src/language/nowline.langium).
- Items derive their bar duration as `effort ÷ item_capacity` (capacity
  defaults to `1`); explicit `duration:<literal>` always wins; see
  `deriveItemDurationDays` and `deriveTotalEffortDays` in
  [`packages/layout/src/calendar.ts`](../../packages/layout/src/calendar.ts).
- `remaining:` accepts both percent (`30%`) and single-engineer effort
  literals (`0.5d`, `1w`); literal form normalizes against
  `totalEffortDays` with overflow clamped to 0 + soft validator
  warning. Eight tests in
  [`packages/layout/test/sizing.test.ts`](../../packages/layout/test/sizing.test.ts) pin the contract.
- Renderer paints an inline size chip on the meta line (`<title-or-id>
  <duration> [capacity-suffix]`) — see [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts)
  `renderItemMetaLine`.
- Lane capacity **badge** rendering works (inside the frame tab); item
  capacity **suffix** rendering works (on the meta line).
- All capacity helpers (`parseCapacityValue`, `formatCapacityNumber`,
  `resolveCapacityIcon`, `estimateCapacitySuffixWidth`) live in
  [`packages/layout/src/capacity.ts`](../../packages/layout/src/capacity.ts) under unit test.

**Phase A *not* implemented (intentional — Phase B's job):**

- The lane **overload underline** described in [`specs/rendering.md`](../rendering.md) §
  "Lane overload underline" has no rendering or layout code. The
  current `overcapacity:show|hide` property is grammar-validated only;
  toggling it has no visible effect because nothing computes the
  concurrent-load function `f(x) = Σ items[i].capacity for items active
  at x`. Comments in `capacity.ts` and `types.ts` mark the gap as "the
  overload sweep in m8" — that's now Phase B m12.
- No tri-state thresholds — current spec only knows binary "over /
  not over".

## What Phase B (m9–m14) needs to deliver

The user's framing from planning:

> Expand the lane `overcapacity:` visual into a tri-state (green,
> yellow, red) indicator with customizable `utilization-warn-at:N` and
> `utilization-over-at:N` thresholds.

Concretely, that decomposes into:

1. **New DSL surface** for two threshold properties valid on `swimlane`
   and `default swimlane`:
   - `utilization-warn-at:N` (percent or decimal) — at or above this
     load fraction the lane paints **yellow**.
   - `utilization-over-at:N` — at or above this fraction the lane
     paints **red**. Below `warn` the lane paints **green** (when load
     > 0) or nothing (when load = 0).
   - Defaults TBD in m9; suggested: `warn-at:75%`, `over-at:100%` so
     the legacy "concurrent > capacity" boundary stays meaningful.
   - Decide in m9 whether `overcapacity:show|hide` survives as a
     master toggle or is supplanted by `over-at:none` / removal.
2. **Validator coverage**: positive percent/decimal, `warn-at ≤
   over-at`, both require the lane to declare `capacity:`, defaults
   when omitted, ban on parallel/group/item.
3. **Layout sweep**: compute `f(x)` per timestep, classify each
   half-open segment into `ok | green | yellow | red`, emit a
   `PositionedLaneUtilization` (segments + classification + active
   thresholds) on `PositionedSwimlane`.
4. **Renderer**: paint the tri-state underline along the band's bottom
   edge using the segments. Color per classification (theme tokens —
   see palette TBD in m13). `overcapacity:hide` (or whatever survives
   m9's deprecation call) suppresses the entire underline.
5. **Examples + tests**: extend `examples/capacity-lanes.nowline`
   (or add a sibling) so the three states are visible side by side;
   update the SVG snapshot.

## Key decisions already made (Phase A learnings to carry forward)

- **One handoff per milestone transition**, kept short and version-
  controlled (per the workspace rule). Phase A used commit-message
  bullets in lieu of formal handoffs because each step was small;
  Phase B is bigger and benefits from formal handoff notes per
  transition.
- **`size:NAME` chip uses `title ?? id-as-typed`** — the case-
  preservation rule (you chose this in m6). Any new author-facing
  surface in Phase B should follow the same `title-when-provided` rule
  rather than mutating identifier case.
- **Capacity helpers are pure and live in `capacity.ts`**, not on a
  node. Phase B should add `computeLaneLoadSegments(items, scale)` (or
  similar) next to them — same testability discipline.
- **Renderer reads positioned-model fields, not raw AST.** The
  renderer must not reach back into `SwimlaneDeclaration`; the layout
  is responsible for resolving thresholds against defaults and putting
  the result on `PositionedSwimlane.utilization` (or similar).
- **Snapshot byte-stability is the gate.** Every Phase A milestone
  ended with `pnpm -r run test` green and `git status` clean after
  re-running the example renderer; Phase B should follow the same
  loop.

## Suggested plan

> Six-milestone cadence parallels Phase A (specs → grammar → validate
> → layout → renderer → close). Adjust if the spec call in m9 changes
> the surface meaningfully.

### m9 — Spec the tri-state surface

- Decide whether `overcapacity:show|hide` is **deprecated**,
  **collapsed into** the new thresholds, or **kept as a master mute**.
- Update [`specs/dsl.md`](../dsl.md) § Capacity:
  - Add `utilization-warn-at:N` and `utilization-over-at:N` to the
    swimlane property table.
  - Document the validation rules (positive numbers, ordering,
    requires `capacity:`, default values).
  - Document interaction with `overcapacity:` (per the call above).
- Update [`specs/rendering.md`](../rendering.md) § Lane overload underline:
  - Replace the binary "over / not over" contract with a tri-state
    contract (green / yellow / red).
  - Define theme palette tokens (e.g.
    `theme.swimlane.utilizationOk`, `…Warn`, `…Over`).
  - Pin segment derivation rules (half-open `[t, t+δ)` segments,
    classification cutoffs, what happens at exact threshold boundaries).
- Add a worked example showing the three states side by side.
- Pause for review before m10.

### m10 — Grammar + AST

- Extend the property-key set in [`packages/core/src/language/nowline.langium`](../../packages/core/src/language/nowline.langium)
  to recognize `utilization-warn-at:` and `utilization-over-at:`.
- Run `pnpm --filter @nowline/core langium:generate` and verify the AST
  exposes the new keys via `EntityProperty` lookups (no new
  declaration type expected — they're properties on existing
  `swimlane` and `default swimlane`).

### m11 — Validation

- Add rules in [`packages/core/src/language/nowline-validator.ts`](../../packages/core/src/language/nowline-validator.ts):
  - Positive decimal or `%` literal; reuse `parseCapacityValue` shape.
  - `warn-at ≤ over-at` when both present.
  - Both require `capacity:` on the same lane (or inherited via
    `default swimlane`).
  - Ban on `parallel`, `group`, `item`.
  - Decide on the `overcapacity:` future and emit a deprecation
    diagnostic if appropriate.
- Add tests to [`packages/core/test/validation/validation.test.ts`](../../packages/core/test/validation/validation.test.ts)
  mirroring the existing capacity-rule fixtures.

### m12 — Layout: load sweep + utilization model

- Add `computeLaneLoadSegments(items, scale)` to
  [`packages/layout/src/capacity.ts`](../../packages/layout/src/capacity.ts) (or a sibling
  `lane-utilization.ts` if it grows past ~80 LOC). Walks the lane's
  items, computes a step function over time, returns a list of
  `{ startX, endX, load }` segments.
- Add `classifyLoadSegment(load, capacity, thresholds)` returning
  `'ok' | 'green' | 'yellow' | 'red'`.
- Extend [`packages/layout/src/types.ts`](../../packages/layout/src/types.ts) with
  `PositionedLaneUtilization` and add it to `PositionedSwimlane`.
- Wire it into [`packages/layout/src/nodes/swimlane-node.ts`](../../packages/layout/src/nodes/swimlane-node.ts) —
  resolve the thresholds (lane → default → built-in default), call the
  sweep, hang the result on the positioned lane.
- New test file `packages/layout/test/lane-utilization.test.ts` with
  fixtures covering: no items, all green, warn band, over band,
  threshold-boundary edge cases, items with `capacity:50%` partial
  load, sized items contributing only their derived bar window.

### m13 — Renderer

- Update theme palettes in [`packages/layout/src/themes/light.ts`](../../packages/layout/src/themes/light.ts)
  and [`packages/layout/src/themes/dark.ts`](../../packages/layout/src/themes/dark.ts) with the new
  utilization tokens.
- In [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts), draw the
  underline (1 `<rect>` per segment, or one `<path>`). Suppression
  rule (`overcapacity:hide` or its m9 successor) wins outright.
- Add tests under `packages/renderer/test/render.test.ts` (or a new
  `render-utilization.test.ts`) asserting the SVG fragments per
  classification.

### m14 — Examples + close-out

- Update [`examples/capacity-lanes.nowline`](../../examples/capacity-lanes.nowline) (or add a
  sibling, e.g. `examples/utilization.nowline`) so the three states
  are visible side by side; add it to
  [`scripts/render-samples.mjs`](../../scripts/render-samples.mjs) if it's a new file.
- Run the same close-out loop Phase A used in m8: full `pnpm -r run
  build`, full `node scripts/render-samples.mjs`, full `pnpm -r run
  test`, confirm `git status` clean (or commit deliberate snapshot
  drift).
- Write `specs/handoffs/handoff-m15-….md` if Phase C is queued; mark
  Phase B complete here otherwise.

## Gotchas

- **`overcapacity:show|hide` is exposed today but does nothing.** No
  example currently relies on a visible underline. m9's call on
  whether to deprecate the property determines whether m11 emits a
  warning vs silently subsumes it.
- **The load function must agree with the `capacity:` semantics on
  items.** `capacity:0.5` means a half-engineer slot — the load it
  contributes during its window is `0.5`, *not* `0.5 × duration`.
  Pin this in m9's spec rewrite and in m12's tests.
- **Segments must use half-open intervals** so adjacent items at the
  same boundary don't double-count. Mirror the existing day-arithmetic
  conventions in [`packages/layout/src/calendar.ts`](../../packages/layout/src/calendar.ts).
- **`PositionedSwimlane` shape stability matters.** Adding a new
  optional field is fine; reshaping existing ones forces snapshot
  regeneration across every example. Prefer additive.
- **Tests run via `pnpm` which is not in the sandbox by default.**
  Phase A worked around this by running with `required_permissions:
  ["all"]` for `pnpm -r run build` / `test`. The same applies for
  Phase B.
- **No `.cursor/plans/` file is checked into the repo.** The
  size-and-utilization plan referenced during planning lived in the
  IDE-managed planning folder; the canonical OSS milestone list lives
  in [`specs/milestones.md`](../milestones.md). If you want Phase B to appear in the
  OSS roadmap (it's currently absent — `specs/milestones.md` jumps
  from m2i to m3 IDE), update that table in m9.

## Files to reference

**Specs:**
- [`specs/dsl.md`](../dsl.md) § Capacity (lines ~165–172, ~330–410, ~1037–1046).
- [`specs/rendering.md`](../rendering.md) § Lane overload underline (lines ~277–296).
- [`specs/milestones.md`](../milestones.md) — OSS milestone canonical list (currently
  doesn't include Phase B).

**Layout:**
- [`packages/layout/src/capacity.ts`](../../packages/layout/src/capacity.ts) — pure helpers; the load sweep
  belongs nearby.
- [`packages/layout/src/calendar.ts`](../../packages/layout/src/calendar.ts) — `deriveItemDurationDays`,
  `deriveTotalEffortDays`, `formatDurationDays`; mirror their patterns
  for any new helpers.
- [`packages/layout/src/types.ts`](../../packages/layout/src/types.ts) — `PositionedSwimlane`,
  `PositionedCapacity`; add `PositionedLaneUtilization` here.
- [`packages/layout/src/nodes/swimlane-node.ts`](../../packages/layout/src/nodes/swimlane-node.ts) — `resolveLaneCapacity`
  (~line 65) is the closest analogue for `resolveLaneUtilization`.

**Validator:**
- [`packages/core/src/language/nowline-validator.ts`](../../packages/core/src/language/nowline-validator.ts) — capacity rules
  ~17a–17e are the template.

**Renderer:**
- [`packages/renderer/src/svg/render.ts`](../../packages/renderer/src/svg/render.ts) — `renderSwimlane`
  family is where the underline draw call lands.

**Tests:**
- [`packages/layout/test/capacity.test.ts`](../../packages/layout/test/capacity.test.ts) — pattern for the load-sweep
  test file.
- [`packages/layout/test/sizing.test.ts`](../../packages/layout/test/sizing.test.ts) — example of the layout
  test style established in Phase A.
- [`packages/renderer/test/render.test.ts`](../../packages/renderer/test/render.test.ts) — pattern for new
  utilization rendering assertions.
- [`scripts/render-samples.mjs`](../../scripts/render-samples.mjs) — registry of example files; add new
  examples here.
