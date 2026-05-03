# tests/ — Renderer manual validation fixtures

Tiny `.nowline` files that stress one renderer behavior each. They are **not** representative roadmaps the way [`examples/`](../examples) is — every file here exists to make a single layout / rendering axis visible at a glance, so when something regresses you can tell which axis broke.

Pair this with the byte-stable snapshot suite at [`packages/layout/test/__snapshots__/`](../packages/layout/test/__snapshots__/):

- The snapshot suite catches *any* drift on the curated examples (canonical regression gate).
- The fixtures here are for *human eyeballing* of specific behaviors — nobody asserts byte-equality on them.

## How they're rendered

`pnpm build` (or `pnpm render`) runs [`scripts/render-tests.mjs`](../scripts/render-tests.mjs) which writes a sibling `.svg` next to every `.nowline` in this folder. The SVGs are gitignored — they are CLI output, not source. To skip rendering during build (e.g. while iterating on a broken renderer) set `NOWLINE_SKIP_RENDER=1`.

## Starter fixtures

Each file is a near-clone of [`examples/minimal.nowline`](../examples/minimal.nowline) (one swimlane, three items) so the diff between fixtures is the property under test.

| File | What it stresses |
|---|---|
| [`large-roadmap-title.nowline`](large-roadmap-title.nowline) | Header card sizing with a long roadmap title — must not overlap the timeline panel. |
| [`large-swimlane-title.nowline`](large-swimlane-title.nowline) | Swimlane chiclet width with a long swimlane title — and any first-row top-pad collapse logic. |
| [`text-fits-inside-bars.nowline`](text-fits-inside-bars.nowline) | Inside-bar layout branch: every item is wide enough that title + meta sit *inside* the bar (no spill). |
| [`text-spills-right.nowline`](text-spills-right.nowline) | Right-spill branch: every item is too narrow for its title, so title + meta render to the right of the bar. |

## Adding a new fixture

1. Add `tests/<slug>.nowline` with the smallest possible body that exhibits the behavior.
2. Append an entry to the `MANIFEST` in [`scripts/render-tests.mjs`](../scripts/render-tests.mjs) with a `now` date that falls inside the fixture's timeline.
3. Document what the fixture validates in the table above.
4. Run `pnpm render` and inspect `tests/<slug>.svg`.

Behaviors worth covering as the harness grows: dense-anchor collision stacking, parallel + group brackets, footnote panel placement, cross-lane dependency arrows, dark-theme palette spot check, and items with overlong owner / footnote glyphs.
