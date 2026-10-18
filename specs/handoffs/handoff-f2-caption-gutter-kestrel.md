# Handoff: f2 caption overhang into the gutter (kestrel)

Branch: `claude/youthful-feynman-ykhg9y` (harness-assigned), cut from `main` at 6ad6008 (after lolay/nowline#189).

Session handoff for the follow-up to `specs/layout-phases.md` §9 "F3 (after m4.15)": should a spilled caption that overhangs the natural axis end by less than `GUTTER_PX` (12 px) still earn the one capped column f2 (`extendTimeline`) adds? Delete this file in the PR's last commit; anything durable moves into `specs/rendering.md` and `specs/layout-phases.md` §9.

## Done

s1, the measurement. Every `examples/**/*.nowline` and `tests/*.nowline` was laid out with `--now 2026-02-09`, with a probe step in front of f2 that read the rightmost spilled caption and the natural axis end (`AxisColumns.xAt(spanDays)`). 23 samples name `caption` among f2's causes, 19 of them alone. Overhang is the caption's estimated right edge past the natural axis end, in px:

| Sample | f2 causes | Overhang px |
|---|---|---|
| `tests/inline-date-corners.nowline` | caption | 0.40 |
| `examples/waves.nowline` | caption, afterMilestone | 7.94 |
| `tests/working-exceptions.nowline` | caption | 11.16 |
| `tests/waves-gap-deadline.nowline` | caption | 17.78 |
| `examples/sizing.nowline` | caption | 25.78 |
| `tests/non-working-hide.nowline` | caption | 33.78 |
| `examples/nested/data.nowline` | caption | 34.24 |
| `examples/dependencies.nowline` | caption, afterMilestone | 35.16 |
| `examples/inline-date-pins.nowline` | caption | 35.16 |
| `examples/isolate-include.nowline` | caption, afterMilestone | 35.16 |
| `examples/partner.nowline` | caption | 35.16 |
| `examples/waves-program.nowline` | caption | 35.16 |
| `tests/isolate-include-multi.nowline` | caption, afterMilestone | 35.16 |
| `tests/waves-isolate-team.nowline` | caption | 35.16 |
| `tests/waves-parallel-group.nowline` | caption | 35.16 |
| `examples/capacity.nowline` | caption | 36.90 |
| `tests/partner-multi.nowline` | caption | 38.10 |
| `examples/nested/android.nowline` | caption | 38.86 |
| `examples/nested/ios.nowline` | caption | 38.86 |
| `examples/nested/platform.nowline` | caption | 39.48 |
| `examples/nested/web.nowline` | caption | 39.48 |
| `examples/showcase.nowline` | caption | 65.84 |
| `tests/item-bumps-up.nowline` | caption | 79.84 |

Every column is 40 px (`scale:1w` at 8 px/day, or 5.71 px/day with weekends hidden) except `showcase` (80 px, months).

A throwaway hack (`columns.isPast(captionRightX - GUTTER_PX, axisDays)` in f2) rendered over the whole corpus in light moves exactly two SVGs: `tests/inline-date-corners` and `tests/working-exceptions`. `examples/waves` keeps its column, because its after-only milestone grows the axis anyway. The hack is reverted; the tree matches `main`.

What the two moved renders show:

- `inline-date-corners`: the axis ends at Apr 13 instead of Apr 20 and the canvas narrows by about 33 px. "Downstream" runs past the header box and the last gridline. The text estimate says 0.4 px; the rendered glyphs (PNG, bundled font) end about 5.5 px past the axis end.
- `working-exceptions`: the Jan 11 column goes and the canvas narrows by 23 px. "Ship" runs about 18 px past the last gridline and the header box. The marker band repacks its labels across the same rows.

## Pending

Waiting on the maintainer's pick (AGENTS.md "Visual changes"), asked as:

> Options: (A) no change, record "any caption past the axis end earns its column" as deliberate in `specs/rendering.md` § "Caption cap at the chart's end" and in `layout-phases.md` §9; (B) a `GUTTER_PX` tolerance in f2, moving `inline-date-corners` and `working-exceptions`. Recommendation: A.

Why A: the gutter is the air f1 keeps between content and the canvas edge, not room for content. A caption in it crosses the header box and the last gridline, and f1 then grows the canvas past it anyway. The overhang is measured on estimated text widths, which run short of the rendered glyphs (0.4 px estimated, about 5.5 px drawn on `inline-date-corners`). Only two samples would move, and both look worse.

## How to resume

- If A: edit `specs/rendering.md` § "Caption cap at the chart's end" and `specs/layout-phases.md` §9 "F3 (after m4.15)" to record the rule and the measurement. No code, no render change, so the PR gets `no-changelog`.
- If B: add the tolerance once in `AxisColumns` (for example, a `captionPast(x, days)` that allows `GUTTER_PX`), use it for both the caption test and the trace filter in f2 (`packages/layout/src/phases/finalize.ts`), and leave `captionCapX` alone (a caption inside the tolerance is under the cap, so no truncation). Add a regression test in `packages/layout/test/timeline-extension.test.ts` (`inline-date-corners` no longer fires f2), regenerate `finalize-coverage.json` where it moves, run the full render gate (light, dark, grayscale, xlsx, msproj, mermaid) on `main` and on the branch, and add a `changed` changelog fragment.
- The measurement probe is in `.scratch/zz-measure-overhang.test.ts`, which won't survive the container. To rerun it, copy it into `packages/layout/test/` and run it with vitest. It inserts a probe `FinalizeStep` in front of `extendTimeline`.
