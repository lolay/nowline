# Handoff: dated milestone overrun paints red (ember)

Branch: `claude/intelligent-shannon-fvomdr`, cut from `main` at `8f093e8` (marker-predecessor arrow fix merged as lolay/nowline#193).

## Status

Waiting on the maintainer's call (AGENTS.md "Visual changes" gate). Nothing implemented yet.

Pending question, verbatim: "Fix the renderer to the spec (diamond, label and overrun arrow red, in each theme's `milestoneDiamond.cutLineOverrun`), and drop the spec's 'overflowing predecessor bars also show their overflow in red' clause?"

## Findings

- `specs/rendering.md` Milestones, "Fixed (date-driven) milestone" has said line, diamond and label render red since the first spec commit (`3be0980`, 2026-04-22).
- The m2b renderer (`c7eac56`) drew the overrun arrow red. `9116144` ("align renderer/layout with specs/samples") replaced it with ink because no hand-tuned reference under `specs/samples/` has an overrun. No sample ever showed a red diamond or label. So the renderer drifted; the spec is the intent.
- Theme tokens `milestone.dashedInk` / `milestone.overrun` are unused anywhere (dead since m2b). `milestone.overrun` is `#ef4444` in light, 3.8:1 on white: too weak for 10 px label text. `milestoneDiamond.cutLineOverrun` passes on every marker band: light `#b91c1c` 6.5:1, dark `#ef4444` 4.7:1 on `#0f172a`, grayscale `#4a4a4a` 8.9:1.
- Bar overflow clause: nothing implements it. The red overflow tail exists only for `before:` caps (`sequence-item.ts`, `hasOverflow`). For an item predecessor the overrun arrow already spans exactly the overflow (bar end back to the line), so a tail would duplicate it. Markers have no bar; a wave overrun draws no arrow (waves.md §5.3).
- Samples that overrun today (render every examples/ and tests/ file, grep the light cut-line red): `tests/marker-predecessor-arrows` (Review, Cut, region Partner due), `tests/marker-predecessor-partner` (Partner due), `tests/waves-gap-deadline` (Execute complete). No fixture covers an item predecessor overrunning a dated milestone; add one.

## Planned implementation (once approved)

`packages/renderer/src/svg/render.ts`: `renderMilestone` fill and label use `cutLineOverrun` when `m.isOverrun`; `renderMilestoneCutLine` arrow stroke likewise with a new `${idPrefix}-arrow-overrun` marker; the marker def is emitted only when some host or region milestone draws an overrun arrow, so other SVGs stay byte-identical. Then renderer test (fails on main), new item-overrun fixture under `tests/`, render all samples light/dark/grayscale + xlsx/msproj/mermaid on main and branch (`.scratch/render-all.sh` pattern, `--now 2026-03-01`), diff, spec update, `.changelog/claude-intelligent-shannon-fvomdr.txt` `fixed` fragment.

Delete this file in the PR's last commit.
