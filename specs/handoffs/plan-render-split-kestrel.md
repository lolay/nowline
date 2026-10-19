```text
--- KICKOFF: begin orchestration at [deep] ---

  Status: 1/4 groups done | last review: wave-1 PASS | current: nowline m2 s1-s7 [exec] | updated 2026-10-19 | UNREVIEWED ab7a1d2 7e82fce 53949f0 1634869 22db375

  mode: unattended | proposed unattended (harness=claude-code runner=cloud; CLAUDE_CODE_REMOTE=true, harness-assigned branch) | guard 3x min $50 | fixups 2 | confirmed 2026-10-19 session fc39e88b-27a2-56ea-85a4-6bbd2b2c56ef: Unattended (Recommended)

  review: every-wave (log-only)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-render-split-kestrel.md. The plan is already tagged.
    On branch claude/lucid-cannon-6tq5ly (task branch): subagents commit each finished step.
    Run in unattended mode.
    Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's procedure,
    and pause only where the recorded mode stops. Do not execute plan
    work inline. Update plan progress after each wave returns per the
    skill's procedure. The mode line above is the kickoff answer. If the
    Status line shows BLOCKED, re-post that question and wait; otherwise
    record the mode, print the kickoff summary and begin dispatching.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [exec] m1 s1-s7, m2 s1-s7 | ~8.3M | ~$3.3 |
| 2 [deep] m3 s1-s6 | ~8.8M | ~$4.7 |
| 3 [exec] m4 s1 | ~1.3M | ~$0.65 |
| orchestrator | ~7.3M | ~$6.3 |
| **Total** | ~26M | ~$15 |

Expected values are estimates, good to about 2-3× per wave.

# R5: split the SVG renderer by layer, move its measurement into layout

Refactor R5 from [`specs/review-since-v086.md`](../review-since-v086.md). `packages/renderer/src/svg/render.ts` is about 3,190 lines with 62 top-level functions. Split it into modules by layer as a pure move, then move the layout math the renderer still recomputes into `@nowline/layout` so the renderer only draws.

Prerequisites checked on `origin/main` at `5b17389266cd15022c0ccb349dbb84f17bb4e9dc`: `packages/layout/src/phases/` exists (date-window, measure, place, finalize) and `specs/milestones.md` strikes m4.14 and m4.15.

Branch: `claude/lucid-cannon-6tq5ly` (harness-assigned task branch). Base: `5b17389`.

## Rules every step keeps

- **Byte-identity.** Every step leaves every render byte-identical. Proof is the parity harness from m1.s1 (`specs/handoffs/r5-parity.sh check` exits 0) plus a green `make pre-commit`, which runs the integration snapshots under `packages/integration-tests/test/__snapshots__/` and the determinism goldens. Never update a snapshot or golden, and never run `make determinism-update`. Any byte that moves is a bug in the step: fix it, or, in m3 only, drop that move and record it as a follow-up (m3 "Leave rule").
- **`make pre-commit` before every commit.** Not a partial check (AGENTS.md "`make pre-commit` is non-negotiable"). If it fails for an environmental reason, fix the environment first and say so on an `env:` line.
- **Public surface unchanged.** No import path outside `packages/renderer` changes. `packages/renderer/src/index.ts` keeps exporting `renderSvg` and the option types from `./svg/render.js`. Tests that import `__internal` keep working.
- **Code style.** TypeScript is 4-space indented; TS-to-TS imports keep the `.js` suffix; no emojis. Match the surrounding comment density: a moved function keeps its doc comment verbatim. A new module opens with a one-paragraph comment saying which layer it draws.
- **Type location.** `FontFamilies`, `RenderOptions`, `AssetBytes` and `AssetResolver` stay declared in `render.ts` (they are the option types). Modules import them with `import type { ... } from './render.js'`; a type-only import is erased, so it adds no runtime cycle. Runtime imports only go from `render.ts` (or a later module) to an earlier module, never back into `render.ts`.
- **Move order is leaves first**, so a moved module only imports modules already moved. The call graph at `5b17389` (comments excluded): `renderItem` uses `hatchOverlay` (waves) and the item helpers; `renderNonWorkingBands` uses `intersectBox`; `renderIncludeRegion` uses swimlanes, markers, edges, non-working bands and the wave tints, boundaries and crossings; `renderSwimlane` uses `renderCapacitySuffix` and `estimateCaptionWidthPx`.
- **Out of scope:** `packages/layout/src/view-preset.ts` (stable at about 670 lines; left as is), `packages/layout/src/phases/finalize.ts`, and any behaviour change.
- **No changelog fragment.** Nothing user-visible changes; the PR gets the `no-changelog` label. `make changelog-check` must pass.

## Parity harness (built in m1.s1)

`specs/handoffs/r5-parity.sh`, a bash script, tracked on the branch and removed with the plan before the PR. State lives under `$(git rev-parse --git-common-dir)/r5-parity/`, inside `.git`, so biome, tsc and vitest never see it and it survives across steps in one container. A new container rebuilds it from the script.

- `r5-parity.sh baseline`: when `<state>/baseline/.done` is missing, create a detached worktree of `5b17389266cd15022c0ccb349dbb84f17bb4e9dc` at `<state>/base` (`git worktree add --detach`), run `make -C <state>/base init build-fast`, render the matrix below with that worktree's `packages/cli/dist/index.js` into `<state>/baseline/`, then touch `.done`. Idempotent.
- `r5-parity.sh check`: run `baseline` first if needed, then render the matrix with this checkout's `packages/cli/dist/index.js` (it must exist: run after `make build` or `make pre-commit`) into a fresh `<state>/head/`, then `diff -r <state>/baseline <state>/head`. Exit non-zero on any difference, printing the differing paths.
- **Matrix:** every `*.nowline` under `examples/` and `tests/` (the base worktree's list for the baseline, this checkout's for head; the lists must match), each rendered with `--theme light`, `--theme dark` and `--theme grayscale`, plus one `--theme light --non-working show` render, all with `--now 2026-06-15` so the now-line doesn't move with the clock. Output path `<out>/<file path>.<variant>.svg`. Record each render's exit status and stderr in `<out>/<file path>.<variant>.log`, so a file that fails to render must fail the same way on both sides.

The script runs the CLI with `node` directly; that is a read-only render of fixtures, not a build, test or publish command, so it doesn't bypass the Makefile rule.

--- WAVE 1 [exec] ---

### m1 - Split the leaf layers (pure move)

Each step moves the named declarations out of `packages/renderer/src/svg/render.ts` into the named new module under `packages/renderer/src/svg/`, verbatim (bodies, doc comments and section comments unchanged), adds `export` to what other modules use, and imports them back into `render.ts`. Nothing is renamed, reordered within a function, or reformatted beyond what biome requires. Acceptance for every step: the declarations are gone from `render.ts`, `make pre-commit` is green, `specs/handoffs/r5-parity.sh check` exits 0, and no file under `packages/integration-tests/test/__snapshots__/` or any determinism golden changed.

#### s1 - [exec] Add the parity harness and record the baseline (done)

Write `specs/handoffs/r5-parity.sh` as the "Parity harness" section above specifies, make it executable, and run `baseline` then `check` on the unchanged tree; `check` must exit 0. Then prove it can fail: temporarily change one emitted attribute in `render.ts` (say a `stroke-width`), run `make build-fast` and `check`, confirm a non-zero exit naming the changed files, and revert the change (rebuild so `dist/` matches source). Commit only the script. Note the render count and the wall time of a `check` in the artifact.

#### s2 - [exec] Move the shared drawing primitives to primitives.ts (done)

Move `WEIGHT_NUM`, `textSizePx`, `fontAttrs`, `strokeDash`, `relativeLuminance`, `pickStatusDotPalette`, `estimateCaptionWidthPx`, `rectFrame` and `intersectBox` (from the waves section; the non-working bands use it too) to `primitives.ts`, with the `WEIGHT_NUM` comment block above it.

#### s3 - [exec] Move the waves layer to waves.ts (done)

Move everything after the `// --- Waves (specs/waves.md §9) ---` divider up to (not including) `renderSvg`, except `intersectBox` (already in primitives): the `WAVE_*` constants, `WaveHatchKind`, `barFill`, `waveHatchKind`, `waveHatchUrl`, `waveHatchPatternDef`, `hasOverrunArrow`, `usedWaveHatchKinds`, `hatchOverlay`, the wave-cell helpers and `WaveCellCorners`, `renderWaveStrip`, `renderWaveTints`, `renderWaveBoundaries`, `waveTextWidth`, `renderWaveLabels`, `renderWaveCrossings`, `legendSwatchFill` and `renderWaveLegend`. `hasOverrunArrow` is a defs check `renderSvg` makes; it goes with the waves only because it sits in that section today; if it reads better in `markers.ts` later (m1.s6), move it there in that step and say so.

#### s4 - [exec] Move the timeline and grid to timeline.ts (done)

Move `renderGridLines`, `renderNonWorkingBands`, `renderNonWorkingLabels`, `calendarLabelText` and `renderTimeline`.

#### s5 - [exec] Move the now-line and its pill to nowline.ts (done)

Move `renderNowline`, `squaredEdgeX`, `renderNowPillBg` and `renderNowPillLabel`.

#### s6 - [exec] Move anchors, milestones and cut lines to markers.ts (done)

Move `renderAnchor`, `renderAnchorCutLine`, `renderMilestone`, `hiddenDateTitle` and `renderMilestoneCutLine`. `renderMilestone` uses `renderInlineDatePin`, which is still in `render.ts` until m2.s2: move `renderInlineDatePin`, `renderInlineDatePins` and `hasAfterPin` here too if that keeps runtime imports one-way, or into a small `date-pins.ts` that both markers and items import. Pick one and record it under decided.

#### s7 - [exec] Move the dependency edges to edges.ts (done)

Move `SLACK_DASH`, `renderEdge`, `legPaths`, `splitSlackPath` and `roundedOrthogonalPath`.

### m2 - Split the composite layers (pure move)

Same rules and acceptance as m1. After m2.s7, `render.ts` holds only its imports, the option types, `renderSvg`, `__internal` and the re-exports tests or `index.ts` need.

#### s1 - [exec] Move the header, attribution mark and logo embedding to header.ts

Move `renderHeader`, `renderAttributionMark`, `embedLogo` and `bytesToBase64`.

#### s2 - [exec] Move the item layer to item.ts

Move `renderCapacitySuffix`, `META_SUFFIX_DX_EM`, `META_ICON_EM_PER_CHAR`, `renderItemMetaLine`, the inline date-pin helpers if m1.s6 left them in `render.ts`, and `renderItem`, unchanged.

#### s3 - [exec] Move containers and swimlanes to swimlanes.ts

Move `renderContainer`, `renderTrackChild`, `LANE_UTILIZATION_HEIGHT_PX`, `utilizationColor`, `renderLaneUtilization`, `renderSwimlaneBg` and `renderSwimlane` (and any lane-badge constant only they use).

#### s4 - [exec] Move the footnotes panel to footnotes.ts

Move `renderFootnotes`.

#### s5 - [exec] Move include regions to include-region.ts

Move `renderIncludeRegion`.

#### s6 - [exec] Split renderItem into named steps

In `item.ts`, break `renderItem` (about 360 lines) into named helpers in drawing order, for example the tooltip, bar frame and hatch, progress strip, status dot, inline pins, caption (title and meta, inside or spilled), footnote indicators and link icon. The emitted string must stay identical: same parts in the same order, same attribute order. `renderItem` becomes a short sequence of calls. Keep the existing comments with the code they describe. Acceptance as m1, plus: no helper over about 80 lines, and `renderItem` itself under about 60.

#### s7 - [exec] Leave render.ts as the entry point

Make `render.ts` hold only imports, the option types, `renderSvg`, `__internal` and any re-exports. Remove the `void escAttr; void escText;` lines if `render.ts` no longer imports those helpers. Add a short comment at the top of `render.ts` that lists the layer modules in the z-order `renderSvg` draws them. Acceptance as m1, plus: `grep -c '^function\|^async function\|^const' packages/renderer/src/svg/render.ts` shows nothing but `renderSvg` and `__internal`.

--- WAVE 2 [deep] ---

### m3 - Move measurement out of the renderer

Goal: where layout already computes a value the renderer recomputes, or should compute it, layout computes it once and the positioned model (`packages/layout/src/types.ts`) carries it, so the renderer reads it and only draws. Every move must leave every render byte-identical, with the same proof as m1.

**Leave rule.** If a move can't be byte-identical (layout's value differs from the renderer's in some case, or carrying it would need a behaviour change), don't make it: revert that part, keep the step's commit to what did move (an empty commit if nothing did), and record the item as a follow-up in the survey doc's "Left as follow-ups" list with the reason and a fixture that shows the difference. The PR lists those.

New fields on positioned types are additive and internal to the layout-to-renderer handoff. Don't change any `Theme` token value, `LayoutOptions`, `layoutRoadmap`'s signature, or any exporter. Add a unit test in `packages/layout/test/` for each value layout now computes (the new field's value on a small roadmap), per AGENTS.md "Tests".

#### s1 - [deep] Survey the renderer's measurement

Read every module under `packages/renderer/src/svg/` and list each place it measures text or derives geometry rather than reading the positioned model: at least `estimateCaptionWidthPx` (a copy of layout's `estimateTextWidth`, `packages/layout/src/text-measure.ts`), `waveTextWidth` and the wave label halo widths (`packages/layout/src/nodes/wave-node.ts:257` computes the same bold width), the status-key table and `pickStatusDotPalette` in `renderItem` (deferred here by `specs/layout-phases.md` §2 non-goals), `relativeLuminance` (layout has its own in `themes/contrast.ts`, which handles non-hex input differently), the capacity suffix and meta-line x positions (`renderCapacitySuffix`, `renderItemMetaLine`; layout has `estimateCapacitySuffixWidth`), and the lane badge width in `renderSwimlane`. For each: file and function, what it computes, layout's counterpart if any, whether the values agree for every input the renderer can see, and a verdict (move in s2-s5, or leave with a reason). Write it to `specs/handoffs/r5-measurement-survey-kestrel.md` (tracked, removed with the plan) and commit it. If the survey finds a candidate the steps below don't cover, put it in s6. Acceptance: the doc exists, each entry cites code, `make pre-commit` is green.

#### s2 - [deep] One text-width estimator

Delete the renderer's `estimateCaptionWidthPx` and use layout's `estimateTextWidth` (export it from `@nowline/layout` if it isn't). Where layout already computed the width the renderer recomputes (wave strip label halos, bold superscript widths), carry it on the positioned wave model and read it. Acceptance: no text-width formula remains under `packages/renderer/src/`, byte-identical, `make pre-commit` green.

#### s3 - [deep] Status-dot colour from layout

Move the status-key table, `pickStatusDotPalette` and the luminance test it needs into layout, so each positioned item carries its resolved status-dot colour and `renderItem` reads it. Reconcile the two `relativeLuminance` copies only if every input the renderer passes gives the same value from layout's; otherwise keep the renderer's semantics in the moved code and say so. Acceptance: `renderItem` has no status table and no luminance call, byte-identical, `make pre-commit` green.

#### s4 - [deep] Caption meta and capacity suffix positions from layout

Have layout compute the x positions `renderItemMetaLine` and `renderCapacitySuffix` derive (the meta separator, the tight icon width, the suffix start after the preceding text) and carry them on the positioned item and lane capacity, so the renderer stops estimating text widths there. Acceptance: those two functions take positions, not widths; byte-identical; `make pre-commit` green.

#### s5 - [deep] Lane badge and remaining wave geometry from layout

Move the lane footnote-badge width in `renderSwimlane` and any wave-label geometry the survey found still derived in `waves.ts` (halo boxes, superscript offsets computed from text widths) into layout's positioned lane and wave models. Acceptance: as s4.

#### s6 - [deep] Remaining survey items

Do the moves the survey listed that s2-s5 didn't cover, under the leave rule. If there are none, make an empty commit saying so. Acceptance: every survey entry is marked moved (with its commit) or left (with its reason) in the survey doc; `make pre-commit` green.

--- WAVE 3 [exec] ---

### m4 - Close out the docs

#### s1 - [exec] Mark R5 done and fix stale references

In `specs/review-since-v086.md`, update the R5 bullet to done: `render.ts` split into the layer modules (name them), the measurement moved per the survey, `view-preset.ts` left as is (stable at about 670 lines), and the follow-ups the survey left, if any. Fix references that point into the old `render.ts` layout: `specs/layout-phases.md` §2's `renderer/src/svg/render.ts:1079-1086` (the status-key table, now in layout per m3.s3 or left per the survey), and `specs/export-determinism.md`'s mention if it now points at the wrong file. Don't rewrite historical milestone text in `specs/milestones.md` or `specs/rendering-v2.md`. Acceptance: `make pre-commit` and `make changelog-check` green; no other file changes.

## Review log

review wave-1 (nowline m1 s1-s7) 831468b..8938c21: PASS - pure moves verbatim into primitives, waves, timeline, nowline, markers, edges; 252 parity renders identical; pre-commit green; passed unattended: gate 4 - 2026-10-19

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`nowline-m1-s1-s7`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`, matched by prefix when long; without the id, the newest `.jsonl` there), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl` in the same directory. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.
tokens orchestrator-kickoff plan-render-split-kestrel (claude-opus-5-5): input ~70 / cache read ~6M / cache write ~0 5m + ~180k 1h / output ~35k | ~$3.33 API-equiv
tokens wave-1 nowline-m1-s1-s7 (claude-sonnet-5-5): input ~92 / cache read ~4.5M / cache write ~130k / output ~27k | ~$1.50 API-equiv (output est.) session fc39e88b-27a2-56ea-85a4-6bbd2b2c56ef
tokens review-wave-1 nowline-m1-s1-s7 (claude-opus-5-5): input ~32 / cache read ~470k / cache write ~39k / output ~10k | ~$0.50 API-equiv (output est.) session fc39e88b-27a2-56ea-85a4-6bbd2b2c56ef
tokens orchestrator-wave-1 nowline-m1-s1-s7 (claude-opus-5-5): input ~20 / cache read ~2.2M / cache write ~0 5m + ~30k 1h / output ~7.8k | ~$0.82 API-equiv
tokens wave-1 nowline-m2-s1-s7 (claude-sonnet-5-5): input ~56 / cache read ~2.9M / cache write ~84k / output ~19k | ~$0.98 API-equiv (output est.) session fc39e88b-27a2-56ea-85a4-6bbd2b2c56ef
