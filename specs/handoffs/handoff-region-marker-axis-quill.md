# Handoff: region markers and f2 (`extendTimeline`)

Session handoff, not a milestone handoff. Delete it in the PR's last commit.

Branch: `claude/funny-curie-7juxgw` (harness-assigned), cut from `main` at 6ad6008 (F2, lolay/nowline#189, merged).

## Done

- s1 confirmed the asymmetry on 6ad6008. The repro (`main.nowline` including `region2.nowline` including `region.nowline`, `--now 2026-02-09`): f2 does not fire, the axis ends at x 812 (2026-05-04), and the region's `late` anchor sits at centre x 812, radius 6, so its right half passes the axis end and crosses the region's dashed right border. `region2.nowline` on its own fires f2 with `datedMarker` and ends on 2026-05-11.
- Corpus scan (every `examples/**` and `tests/*.nowline`): region markers appear only in `examples/isolate-include`, `tests/isolate-include-multi` and `examples/nested`, and none is near its window's last day. The nearest is `nested` (region diamond right at 696 against an axis end of 2226).
- A hack that adds the region markers to f2's `datedMarker` / `afterMilestone` measure moved no corpus SVG (light theme, `diff -r` empty) and gave the repro the column (canvas 824 to 864). The hack is reverted.
- Slot rules: region markers are placed in `placeChart`, so they are part of the `placement` input f2 already reads. `checkFinalizeOrder` needs no change.

## Pending (question to the maintainer, verbatim)

Should f2 measure an isolated region's own anchors and milestones like the main chart's (option A, recommended), or keep them out and record why in `specs/rendering.md` (option B)?

## How to resume

On A: add the region loop to `extendTimeline` in `packages/layout/src/phases/finalize.ts` using `inc.anchors[].center.x` and `inc.milestones[].center.x` (dated or anchor gives `datedMarker`, after-only gives `afterMilestone`), add a repro fixture to `packages/layout/test/timeline-extension.test.ts` via `parseAndResolveFiles`, update `specs/layout-phases.md` (§3.5 f2 row, §9) and `specs/rendering.md` (Included Roadmap Region), regenerate `finalize-coverage.json` only if it moves (it should not), run the full render gate, add a changelog fragment (the repro's render moves even though no sample does).

On B: spec text only, PR labelled `no-changelog`.
