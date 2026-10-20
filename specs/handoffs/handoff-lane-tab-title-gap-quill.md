# Handoff: lane frame-tab title-to-badge gap

Branch: `claude/determined-turing-78naja` (cut from `origin/main` at 0053ade, after lolay/nowline#201).

## Status

Diagnosed; prototype rendered; waiting on maintainer sign-off (AGENTS.md "Visual changes"). Nothing implemented in tracked code yet.

## Cause

`frameTabGeometry` estimates the 12px/600 title as `title.length * 6.5` (`FRAME_TAB_TITLE_PX_PER_CHAR`). Wide-glyph titles overrun it: in Chromium (system-ui resolves to Inter here) "Headcount" paints 63.7px against 58.5 estimated, eating 5.2 of the 6px `FRAME_TAB_INNER_GAP_PX`. Narrow titles overshoot ("Sprint pts" 56.1 vs 65). Measured title-to-next-element gaps in `tests/capacity-lanes`: 0.8 to 14.9px. Not an owner/no-owner issue; the gap is applied in both paths.

## Proposed fix (pending approval)

Replace the flat per-char factor with a width-class estimate in `frame-tab-geometry.ts`: narrow (` ijlI.,:;!'|\``) 0.28em, semi (`frt()[]{}/\1-_"`) 0.40em, wide (`mwMW@%`) 0.90em, other caps/digits 0.70em, everything else 0.60em, at 12px. Across all 64 lane titles in `examples/` + `tests/`, error drops from -8.5..+24px to about -1..+3.5px for typical titles. Gaps in `tests/capacity-lanes` become 5.5 to 8.3px.

Blast radius: 48 of 56 `examples/` + `tests/` renders change (every lane chiclet width shifts a few px); only `tests/size-and-capacity` changes canvas height (two lanes' first rows now align with the narrower tab). Integration snapshots and determinism hashes will need regenerating.

## Pending question

Approve the width-class estimator (all lane tabs re-fit), or prefer `max(flat, class)` (only under-estimated titles grow; fewer diffs, narrow titles keep their wide gaps)?

## Resume

Re-apply the prototype (a ~15-line `estimateFrameTabTitleWidth` in `packages/layout/src/frame-tab-geometry.ts`), then: regression test in `packages/layout/test/` asserting "Headcount" estimate >= its measured 63.7px and gap consistency, regenerate snapshots/hashes via the Makefile, `.changelog/claude-determined-turing-78naja.txt` (`release-note:fixed`), update the calibration comment, `make pre-commit`. Delete this handoff as the last commit before merge.
