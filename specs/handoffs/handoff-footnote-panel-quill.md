# Handoff: footnote panel overflow and numbering order

Branch: `claude/lucid-cannon-cieppf` (assigned by the harness). Base: `main` at 2853a46, which already carries the isolated-region footnotes (#166).

## Task

Two fixes in one PR, both waiting on a maintainer pick:

1. A footnote description can run past the canvas's right edge and clip (`renderFootnotes` places it at `titleX + max(120, title.length * 6)` with no measurement; `buildFootnotePanel` sizes the panel to the frozen canvas).
2. Numbering: `specs/dsl.md`, `specs/rendering.md` and `man/nowline.5` (en + fr) say document order; `indexFootnotes` / `buildFootnotePanel` sort by id (`localeCompare`), pinned by `packages/layout/test/footnote-index.test.ts`.

## Findings so far

- Repro (`--now 2026-02-09`) confirmed: canvas 344 px, description cut at "...contract is s".
- A throwaway prototype (env-switched, not committed) rendered all three overflow options: wrap (panel grows a row per extra line), ellipsis with `<title>` tooltip, and growing the canvas in f3. Under wrap, none of the 60 `examples/` + `tests/` samples changes today; none currently overflows.
- Switching to document order moves two samples: `examples/long.nowline` and `examples/platform-2026.nowline`.

## Pending question (asked verbatim, one AskUserQuestion call)

1. Overflow: wrap the description onto more rows / ellipsis + tooltip / grow the canvas.
2. Numbering: document order (change code) / sorted by id (correct specs + man pages).

## Resume

Read the answers, implement in layout (`footnote-node.ts`, maybe `finalize.ts` f3), make the renderer read the geometry, add tests, before/after `diff -r` of all samples in light/dark/grayscale, specs, changelog fragments, `make pre-commit`. Delete this file in the PR's last commit.
