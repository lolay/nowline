# Plan: make `LayoutOptions.width` do something (or remove it)

Status: (done) picked (a), best-effort cap with a ppd floor, default unset. Implemented on `claude/stoic-darwin-r467wd`.

## Finding

`width` has been a no-op in layout since `9116144` (2026-04-29, "align renderer/layout with specs/samples (m2d-m2h)").

- `c7eac56` (m2b, 2026-04-22) introduced it as a **floor that stretched the chart**: `chartRightX = width`, `totalChartWidth = max(width - chrome, natural)`, canvas = `max(width, natural + 16)`. `--width` worked then.
- `9116144` switched to content-fit and documented `width` as a *maximum* (`max(480, min(width, desired))`), but kept the m2b line `chartRightX: Math.max(chartRightX, originX + totalChartWidth + 16)`. That max always restores `desired`, so the cap never applied. Only the 480 px floor did anything.
- `33e5bc8` (2026-05-03) dropped the 480 floor ("no floor"). From then on `width` has had zero effect on any byte.
- Confirmed on `main` (`56345c7`): `examples/long.nowline` renders 2219.76 px wide with no flag, `-w 900` and `-w 4000`.

The m2b handoff documented the flag as `Output width in pixels (default: auto-fit)`; `specs/cli.md`, `help.ts` and the man pages later changed to `(default: 1280)`, which has been false since 2026-04-29. `specs/ide.md` already treats `nowline.preview.width = 0` as "unset".

## Surfaces that pass `width`

All of them flow only into `layoutRoadmap` (export kernels never read it):

- CLI `-w/--width` (`args.ts`, `render.ts` `parseWidthArg`, integer >= 320) and `.nowlinerc` `width` (`@nowline/config`, `specs/cli.md` example).
- VS Code `nowline.preview.width` (preview, in-process export, CLI-runner export; `.nowlinerc` disagreement check).
- `@nowline/embed` (`width` option and config), `@nowline/browser` pipeline, `@nowline/export` `RenderInputs.width`.
- MCP render tools (`width` schema field). **The MCP review raster depends on cap semantics**: `server.ts` re-renders at `min(width, REVIEW_MAX_WIDTH=1024)` so the inspection PNG stays under 1024 px. Today it does not, so models get review rasters over 2000 px wide for big roadmaps.
- `packages/nowline-action`: does not expose or pass `width`.

## Natural canvas widths today (default render)

- `examples/` (20 SVGs): 4 over 1280: `product` 1382.64, `long` 2219.76, `teams` 2229.04, `nested` 2238.32.
- `tests/` (26 SVGs): 3 over 1280: `text-wraps-inside-bars` 1462.64, `waves-coarse` 1538.69, `nested-both-headers` 1699.76.
- Snapshots (22, `packages/integration-tests/test/__snapshots__/`): 3 over 1280: `text-wraps-inside-bars`, `waves-coarse`, `nested-both-headers`. Range 418 to 1700 px; 19 are under 1280.
- Determinism (13 fixtures, `GATE_TODAY` 2026-02-09): only `nested-both-headers` (1699.76) is over 1280. Layout-dependent cells are `svg`, `html`, `png`, `pdf` (Node) and `svg`, `png` (browser); `json` (AST), `mermaid`, `msproj`, `xlsx` don't read layout geometry.
- Only layout test that passes `width`: `layout-insights.test.ts` (640 and 1280); it asserts insights, not geometry.

## Options

### (a) Real maximum: shrink pixels-per-day to fit, default unset (recommended)

`width` caps the canvas: when `desiredCanvas > width`, scale `ppd` by `(width - chrome) / naturalWidth`. Default becomes unset (auto-fit), which is what every render does today.

Caveat: text does not scale. Spilled captions, run labels and the beside-mode header card can still push the canvas past `width` after `growChartRightX`. Either accept that as a documented best-effort cap (timeline fits, text spill may overflow), or iterate the pass once or twice with a tighter `ppd` and accept whatever remains. A `ppd` floor is also needed so a 320 px cap on a two-year roadmap doesn't produce zero-width bars.

Byte impact with default unset: **none**. No snapshot, `examples/`, `tests/` or determinism cell changes; only renders that pass `width` change. Fixes the MCP review raster as a side effect.

Variant (a-1280): keep the documented 1280 default. Changes 4 examples (`product`, `long`, `teams`, `nested`), 3 tests and 3 snapshots (`text-wraps-inside-bars`, `waves-coarse`, `nested-both-headers`), and 6 determinism cells (`nested-both-headers` × node svg/html/png/pdf, browser svg/png). Shrinking `ppd` on those also reflows captions (more spill), so it's a visible regression on the densest examples. Not recommended.

### (b) Minimum / floor: pad or stretch to at least `width`

Restores m2b behavior. Two sub-choices: pad (canvas widens, timeline keeps natural `ppd`, empty space on the right) or stretch (`ppd` grows so the timeline fills). Stretch is the m2b behavior and reads better.

Byte impact with default unset: none. With default 1280: every render narrower than 1280 changes, i.e. 16 of 20 examples, 23 of 26 tests, 19 of 22 snapshots and 12 of 13 determinism fixtures' layout cells. That reverses the deliberate content-fit decision from m2d-m2h. Not recommended with a default.

### (c) Deprecate and remove

Drop `-w/--width`, `.nowlinerc width`, `nowline.preview.width`, the embed/browser/export/MCP fields, and `LayoutOptions.width`. Zero byte change. Breaking for anyone passing `-w` (the CLI would reject the unknown flag; we could keep accepting it with a deprecation warning for one minor). The MCP review raster loses its intended cap and needs a different fix (downscale the inspection PNG via `pngScale`). Makes the `.nowlinerc` width card moot.

### (d) Output scaling, not layout

Keep layout content-fit; `width` sets the root `<svg width>` attribute (and PNG pixel width) while `viewBox` stays natural, so everything, text included, scales uniformly. Hard guarantee, trivial to implement. Byte impact with default unset: none. Downsides: it duplicates PNG `--scale`, text gets small on big roadmaps, and the preview/embed already strip the `width` attribute, so it does nothing there.

## After the pick

Failing test first (`packages/layout/test/`, plus a CLI test that `--width` changes output), then implementation, then help text, man pages (en, fr), `specs/cli.md`, `specs/rendering.md`, VS Code setting description, `CHANGELOG.md` under `## [Unreleased]`. Any snapshot change listed by name in the PR. `make pre-commit` gate.
