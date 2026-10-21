```text
--- KICKOFF: begin execution at [deep] ---

  Status: 1/2 groups done | last review: wave-1 PASS 2026-10-21 | current: s1 s4 s6 s7 s8 [exec] | updated 2026-10-21

  review: every-wave

  Suggested chat title: Wave 1 of 2 [deep] s2 s3 s5

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    Wave 1 of 2 [deep] s2 s3 s5
    In lolay/nowline, read specs/handoffs/plan-gallery-defects-tranquil.md. Begin execution at the top
    of the plan (WAVE 1: s2, s3, s5, in that order).
    On branch claude/eager-ride-sc6bpb (task branch): commit each finished step and push.
    Visual steps: show a before/after of 1-3 fixtures and wait for
    sign-off before implementing (s3 is already signed off).
        Before you stop, update plan progress: append ` (done)` to the
        headings you finished, update the Kickoff Status line, and flip the
        matching todos. Append one line per model this chat ran to the
        plan's "## Token log", counted and priced per its counting header:
          tokens wave-1 s2-s3-s5 (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv
    Then stop at the next STOP marker and report what you changed and
    any deviations from the plan.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [deep] s2 s3 s5 | ~9.5M | ~$5.0 |
| 2 [exec] s1 s4 s6 s7 s8 | ~3.9M | ~$1.6 |
| kickoff | ~1.5M | ~$1.0 |
| **Total** | ~15M | ~$7.6 |

Expected values are estimates, good to about 2-3× per wave.

# Gallery defect sweep (claude/eager-ride-sc6bpb)

## Context

Gary went through the review gallery (review.nowline.dev, build 821d502) and logged ten defects across examples/ and tests/. I rasterized the published SVGs and had three agents trace each one to its root cause. Two are housekeeping: continuation and minimal.fr aren't includes, they're just missing from the render manifest. The other eight are deliberate rule changes, so per AGENTS.md "Visual changes" each needs a before/after.

Decisions already made in this session:
- Slip view, variant B: mockup at /tmp/claude-0/-workspace-nowline/0539bbe0-54d4-5209-9ef9-9cb8b3a6854c/scratchpad/g/mpa3.png.
- Caption budget: max(1 column, 160px).
- After-block fix: the item after a parallel or group aligns with its first track. Untitled parallels keep their bracket.
- Region box: grow the canvas and keep the full padding.

Root causes:

| Defect | Cause |
|---|---|
| capacity `Sea…`, dependencies `Depl…`, isolate-include `Par…` / `Plugin b…` | Caption cap allows only one column past the axis end (`axis-columns.ts` `captionCapX`; spec rendering.md § Caption cap) |
| continuation, minimal.fr have no SVG | Not listed in `EXAMPLES` in `scripts/lib/render-manifest.mjs`. They aren't include children. |
| isolate-include / nested region box short | `includeRegionWidth` (`nodes/include-node.ts:160`) shrink-wraps to leaf bars + 32px |
| waves `Launch page` spills, `Rate limits` wraps | First line loses 21px to the status dot; "Launch" (45.24) misses the 45px first line by 0.24px (`fitItemCaption`, `nodes/item-node.ts:256-303`) |
| marker-predecessor-arrows left arrows | Intended by spec (rendering.md:368): an overrun arrow runs back from the late predecessor. Replaced by the slip view. |
| utilization-states `Cool` above `Burst A` | Untitled parallel keeps the 18px bracket band (theme default `bracket: dashed`), and `RowPacker.placeItem` returns the block's top y, not its first track's |
| waves-coarse: no glyph for `after:2026-11-02` | Wave floors render only as an italic gap label; no calendar glyph |
| waves-coarse: bottom `Waves:` list | Emitted because one wave is empty (`buildWaveLegend`, `nodes/wave-node.ts:619`), and then lists every wave |

## Approach

One commit per step on `claude/eager-ride-sc6bpb`, pushed after each one. Each visual step starts with a before/after of 1–3 fixtures, built with the `node packages/cli/dist/index.js <file> -o .scratch/…` flow, plus the `.nowline` excerpt. I stop for sign-off on that before implementing; s3 is already signed off. Each step closes with the real before/after, a `make pre-commit`, a deliberate snapshot and determinism bump (only the cells that moved), spec text updated in the same commit, and a line in `.changelog/eager-ride-sc6bpb.txt` (`changed` / `fixed`). No PR until asked.

Waves (per Gary): the deep steps run first as wave 1, then the exec steps as wave 2, with s1 [fast] folded into wave 2. Step IDs keep their original numbers.

--- WAVE 1 [deep] ---

### s2 - [deep] Caption cap: fit within max(1 column, 160px) (done)
- `AxisColumns.captionCapX`: replace "end of one column past the axis end" with "the end of the fewest whole columns past the axis end that hold the caption, if that end is within max(one column, `CAPTION_OVERHANG_BUDGET_PX = 160`) of the axis end; else the last whole-column boundary within that budget". It needs the caption's right edge, so it takes `spillRightX` as a parameter. `capCaptionAtAxisEnd` (`nodes/item-measure.ts:510`) passes `spill.rightX` and truncates only when the result still falls short.
- f2 `extendTimeline` (`phases/finalize.ts:566`) grows the axis to the boundary at or after `maxSpilledCaptionRightX`, capped by the same budget. Use the same `AxisColumns` call so the cap and the extension agree.
- Spec: rendering.md:299-301, plus a history note under scheduler-unification §8 decision 12. Tests: update `packages/layout/test/caption-cap.test.ts`, and add cases for a 60px caption at scale:1w (fits in 2 columns, not cut) and an overlong one (cut at the budget).

### s3 - [deep] Dated-milestone slip view (variant B, signed off) (done)
- Layout (`nodes/milestone-node.ts` dated branch, :256-281): when `maxPred.endX > x`, keep `center.x` at the planned date and add `slip: { x: maxPred.endX, y }` to the positioned milestone. Drop the overrun arrow (`overrunArrowStart`). Replace the overrun corridor in `collectSlackCorridors` with the slip span on the marker band, and teach `marker-band.ts` `markerArrows`/`packMarkerRow` to reserve the span planned→slipped plus the label at the slipped x on one row.
- Renderer (`packages/renderer/src/svg/markers.ts` `renderMilestoneCutLine`, :113-160): draw a red planned diamond with no cut line, a red 3-3 dotted span, and a navy diamond at the slipped x, with the label and the normal dashed cut line there. Retire the `arrow-overrun` marker def (`render.ts:115-119`, `waves.ts` `hasOverrunArrow`). This also removes the latent `- 6` direction bug.
- The slip is presentation only (amended after review, Gary 2026-10-21): the milestone's entity edge for downstream `after:` stays its `date:`, so engine C and the exports keep the declared date. The slipped x lands on a predecessor's end, which already drives f2 axis extension.
- Spec: rendering.md:368, :371; layout-phases.md:693-700; update the header comments in tests/milestone-overrun.nowline and tests/marker-predecessor-arrows.nowline. Tests: `chart-local-frame.test.ts`, `render.test.ts` "dated milestone overrun", `milestone-time-end.test.ts`, `marker-arrows.test.ts`, and `waves.test.ts` overrun case are rewritten to the slip shape.

### s5 - [deep] Region boxes reach the diagram's content, plus padding (done)
Revised twice in review. The region box's right edge is no longer the axis end. It is the furthest content anywhere in the diagram, host and every region: bars, spilled captions, anchors and milestones with their labels (a slipped milestone at its landing), and the now-line. A 24px box pad puts the dashed edge 16px past that point. f3 grows the canvas to hold it. The code is `diagramContentRightX` in `phases/finalize.ts`, and `includeRegionWidth` now takes `contentRightX`. Prototype commits: 4e252f3, 05076ba, f6aada5; finished in 01e0c62 with tests, spec, changelog, snapshots (isolate-include, waves-isolate), determinism, and coverage register. Signed off by Gary 2026-10-21.

```text
--- REVIEW: wave-1 [deep] ---

  Suggested chat title: Review wave 1 of 2 [deep] s2 s3 s5

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    Review wave 1 of 2 [deep] s2 s3 s5
    In lolay/nowline, read specs/handoffs/plan-gallery-defects-tranquil.md. Review the work completed in
    wave 1 (s2-s3-s5) against its spec: read `git diff <from>` and
    `git status`, where <from> is the commit after `..` on the last
    Review log line (for the first review, `git merge-base HEAD
    origin/main`), and check it against the plan steps and
    any acceptance criteria. This is READ-ONLY -- do not fix anything
    yourself and do not start the next wave. Append one line to the
    "## Review log" section of the plan file (create the section if
    absent), with <to> from `git rev-parse --short HEAD`:
      review wave-1 (s2-s3-s5) <from>..<to>: PASS|CONCERNS - <one-line note> - <YYYY-MM-DD>
    Append one line per model this chat ran to "## Token log",
    counted and priced per its counting header:
      tokens review-wave-1 s2-s3-s5 (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv
    If the verdict is CONCERNS, also set the Kickoff Status line to
    `BLOCKED at gate review-wave-1`, re-post the concern, and stop.
    On PASS, update the Status line `last review:` field and report back.
    On branch claude/eager-ride-sc6bpb (task branch): commit the plan update before you
    stop, and push.

---
```

```text
--- STOP: tier change [deep] -> [exec] ---

  Suggested chat title: Wave 2 of 2 [exec] s1 s4 s6 s7 s8

  Next model
    Cursor:      grok-4-7[effort=high,fast=false]   (or claude-sonnet-5-5[effort=high])
    Claude Code: /model sonnet              (/effort high)

  Prompt to paste into the next chat:
    Wave 2 of 2 [exec] s1 s4 s6 s7 s8
    In lolay/nowline, read specs/handoffs/plan-gallery-defects-tranquil.md. Execute WAVE 2: s1, s4, s6,
    s7, s8, in that order. Confirm wave 1's review is PASS first.
    On branch claude/eager-ride-sc6bpb (task branch): commit each finished step and push.
    Visual steps (s4, s6, s7, s8): show a before/after of 1-3 fixtures
    and wait for sign-off before implementing. s1 is a mechanical
    manifest edit: apply exactly what the plan says.
        Before you stop, update plan progress: append ` (done)` to the
        headings you finished, update the Kickoff Status line, and flip the
        matching todos. Append one line per model this chat ran to the
        plan's "## Token log", counted and priced per its counting header:
          tokens wave-2 s1-s4-s6-s7-s8 (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv
    Then stop at the next REVIEW marker and report what you changed and
    any deviations from the plan.

---
```

--- WAVE 2 [exec] ---

### s1 - [fast] Render continuation and minimal.fr (non-visual)
Add both to `EXAMPLES` in `scripts/lib/render-manifest.mjs` (continuation after `minimal`, minimal.fr beside `minimal`), with descriptions ("Backslash line continuation", "Localized output, fr-CA"). Gallery picks them up through `GALLERY_GROUPS`. No changelog fragment (internal).

### s4 - [exec] Item after a block aligns with its first track
- The header band and bracket are unchanged: an untitled parallel keeps its dashed bracket.
- `row-packer.ts`: `PackedRow.contentOffsetY`, set in `commitBlock` to `headerHeight + CONTAINER_BODY_PAD_PX` for blocks. `placeItem` adds it when the item fits on that row. Same for groups (`group-node.ts`).
- Spec: rendering.md:599-614 (a new "Join" y rule) and true-width-layout.md §3.2. Expected moves: utilization-states, dependencies, platform-2026 ×3, and any wave sample whose group has a header.

### s6 - [exec] First title line may use the dot's 4px clearance gap
In `fitItemCaption` (`nodes/item-node.ts:272-278`, `:289-297`), line 1 passes if it fits the hard limit `barWidth − leftInset − 17` (the dot's own left edge, no `ITEM_DECORATION_SPILL_GAP_PX`), not only the soft 45px. This only turns near-miss spills into wraps; captions that already fit don't move. "Launch" ends 3.76px clear of the dot. Spec rendering.md:258-262, :278. Moves: waves (+dark/grayscale) `Launch page`, possibly others.

### s7 - [exec] Calendar glyph on a wave with a date `after:`
- `wave-node.ts`: when `pickInlineDate([floor.ref])` (`inline-date-pin-geometry.ts`) yields a date from the wave's declared floor, whether or not it created a gap, set `strip.inlineDatePin: InlineDatePin` at the cell's left (`cell.x + INLINE_DATE_GLYPH_INSET_LEFT_PX`, vertically centred in the 20px strip). Reserve its width through `fitStripLabel`'s `extraWidth` and shift `labelDraw.x`.
- Renderer `renderWaveLabels` (`svg/waves.ts:332`) calls the exported `renderInlineDatePins([pin], w.style.text)` after the cell fill. The italic gap label stays, because it dates the gap.
- Spec: waves.md §9.1–9.2, rendering.md:331-333 (entity list gains waves). Moves: waves-coarse, waves-gap-deadline.

### s8 - [exec] Wave legend lists only waves the band doesn't name in full
`buildWaveLegend` (`wave-node.ts:620`): keep the trigger, but filter the list to waves that are empty, abbreviated (`labelKind !== 'title'`), or have dropped footnotes. Keep the `#k` numbering. waves-coarse reads `Waves: #4 Beta (TBD) (no items)`. Spec: waves.md §9.5 (:1046, :1715), rendering.md:665. Tests: `waves-model.test.ts` :258, :664, :741.

```text
--- REVIEW: wave-2 [deep] ---

  Suggested chat title: Review wave 2 of 2 [deep] s1 s4 s6 s7 s8

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    Review wave 2 of 2 [deep] s1 s4 s6 s7 s8
    In lolay/nowline, read specs/handoffs/plan-gallery-defects-tranquil.md. Review the work completed in
    wave 2 (s1-s4-s6-s7-s8) against its spec: read `git diff <from>` and
    `git status`, where <from> is the commit after `..` on the last
    Review log line (for the first review, `git merge-base HEAD
    origin/main`), and check it against the plan steps and
    any acceptance criteria. This is READ-ONLY -- do not fix anything
    yourself and do not start the next wave. Append one line to the
    "## Review log" section of the plan file (create the section if
    absent), with <to> from `git rev-parse --short HEAD`:
      review wave-2 (s1-s4-s6-s7-s8) <from>..<to>: PASS|CONCERNS - <one-line note> - <YYYY-MM-DD>
    Append one line per model this chat ran to "## Token log",
    counted and priced per its counting header:
      tokens review-wave-2 s1-s4-s6-s7-s8 (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv
    If the verdict is CONCERNS, also set the Kickoff Status line to
    `BLOCKED at gate review-wave-2`, re-post the concern, and stop.
    On PASS, update the Status line `last review:` field and report back.
        On PASS, this was the last wave, so also finish the plan: replace
        the Kickoff marker line with `--- KICKOFF: plan complete ---` and
        its Status line with `2/2 groups done | completed <YYYY-MM-DD>`,
        add the `actual tokens` and `actual $` columns to the Cost table
        from "## Token log" (your own lines included), and append the
        Completion summary, per plan-execution.md "Final completion".
    On branch claude/eager-ride-sc6bpb (task branch): commit the plan update before you
    stop, and push.

---
```

## Verification

- `make pre-commit` before every commit (lint + build + render + typecheck + test). Each step's new or updated Vitest case would fail without the change.
- Snapshots under `packages/integration-tests/test/__snapshots__/` and `determinism/hashes.json`: bumped deliberately per step, and the commit body names which ones moved and why.
- `packages/cli/test/convert/roundtrip.test.ts` stays green (s1 adds no grammar, but the new examples now run through it).
- After each step, re-render the affected fixtures to `.scratch/` and screenshot them (headless Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) for the before/after report. `make gallery` gives the full side-by-side.

## Review log

review wave-1 (s2-s3-s5) 821d502..9b89a89: CONCERNS - s3 slip is presentation-only (after: still reads date:), reversing the plan's "slipped x drives the entity edge for downstream after:" with no recorded sign-off or test; needs Gary's pick. s2 and s5 match, make pre-commit green. Nits: stale s5 "Pending" note, region-markers positionedEntry omits slipFromX - 2026-10-21
review wave-1 (s2-s3-s5) 9b89a89..0567a5d: PASS - Gary kept the s3 slip presentation-only; plan s3 amended to match, stale s5 note fixed. Open nit: region-markers positionedEntry omits slipFromX (masked by s5 region width) - 2026-10-21

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`s2-s3-s5`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`, matched by prefix when long; without the id, the newest `.jsonl` there), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl` in the same directory. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.10 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness (Cursor's grok-4-7 is $2.00 / $0.50 / $6.00), or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.

tokens kickoff plan-gallery-defects-tranquil (claude-opus-5-5): input ~140 / cache read ~11M / cache write ~220k 1h / output ~40k | ~$4.8 API-equiv
tokens wave-1 s2-s3-s5 (claude-opus-5-5): input ~450 / cache read ~63M / cache write ~360k 5m + ~910k 1h / output ~120k | ~$24 API-equiv
tokens review-wave-1 s2-s3-s5 (claude-opus-5-5): input ~34 / cache read ~2.1M / cache write ~110k 1h / output ~9.9k | ~$1.5 API-equiv
