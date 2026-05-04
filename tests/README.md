# tests/ — Renderer manual validation fixtures

Tiny `.nowline` files that stress one renderer behavior each. They are **not** representative roadmaps the way [`examples/`](../examples) is — every file here exists to make a single layout / rendering axis visible at a glance, so when something regresses you can tell which axis broke.

> **Rule of thumb — where does a new `.nowline` go?**
>
> - **`tests/`** (this folder) — you're creating a visual to *exercise a renderer behavior*: sized titles, text-fit vs spill, dependency arrows, isolate-include with multiple lanes, etc. The file exists so a human can eyeball "did this axis regress?". SVG output is gitignored.
> - **[`examples/`](../examples)** — you're adding a *representative, user-facing* roadmap: a `nowline --init` template, a doc screenshot source, or a sample-fidelity reference that pairs with [`specs/samples/`](../specs/samples). Examples are tracked by the byte-stable snapshot suite in [`packages/layout/test/__snapshots__/`](../packages/layout/test/__snapshots__/), so every addition is an ongoing regression-gate commitment.
>
> If the file's purpose is "see how the renderer handles X", it belongs here — not in `examples/`.

Pair this with the byte-stable snapshot suite at [`packages/layout/test/__snapshots__/`](../packages/layout/test/__snapshots__/):

- The snapshot suite catches *any* drift on the curated examples (canonical regression gate).
- The fixtures here are for *human eyeballing* of specific behaviors — nobody asserts byte-equality on them.

## How they're rendered

`pnpm build` (or `pnpm render`) runs [`scripts/render-tests.mjs`](../scripts/render-tests.mjs) which writes a sibling `.svg` next to every `.nowline` in this folder. The SVGs are gitignored — they are CLI output, not source. To skip rendering during build (e.g. while iterating on a broken renderer) set `NOWLINE_SKIP_RENDER=1`.

## Starter fixtures

Most files are near-clones of [`examples/minimal.nowline`](../examples/minimal.nowline) (one swimlane, three items) so the diff between fixtures is the property under test. A few fixtures (e.g. `isolate-include-multi`) need extra shape to exercise what they exist for — keep that shape as small as the behavior allows.

| File | What it stresses |
|---|---|
| [`large-roadmap-title.nowline`](large-roadmap-title.nowline) | Header card sizing with a long roadmap title — must not overlap the timeline panel. |
| [`large-swimlane-title.nowline`](large-swimlane-title.nowline) | Swimlane chiclet width with a long swimlane title — and any first-row top-pad collapse logic. |
| [`text-fits-inside-bars.nowline`](text-fits-inside-bars.nowline) | Inside-bar layout branch: every item is wide enough that title + meta sit *inside* the bar (no spill). |
| [`text-spills-right.nowline`](text-spills-right.nowline) | Right-spill branch: every item is too narrow for its title, so title + meta render to the right of the bar. |
| [`item-bumps-up.nowline`](item-bumps-up.nowline) | Topmost-fit row packing: a long middle item pushes itself to row 2, but the trailing item bumps back up to row 1 alongside the first item instead of claiming a fresh row. |
| [`isolate-include-multi.nowline`](isolate-include-multi.nowline) | `roadmap:isolate` include where the child has multiple swimlanes — how a multi-lane isolated region stacks against the parent's own lanes. Uses [`partner-multi.nowline`](partner-multi.nowline) as its included child. |

### Multi-file fixtures

A fixture that needs an `include` target (like `isolate-include-multi`) keeps its child `.nowline` **next to it in this folder**, not in `examples/`. Only the composite fixture gets a `MANIFEST` entry in [`scripts/render-tests.mjs`](../scripts/render-tests.mjs); the child is a fixture dependency, not a demo, and doesn't need standalone rendering.

## Adding a new fixture

1. Add `tests/<slug>.nowline` with the smallest possible body that exhibits the behavior. If it needs an `include` target, colocate the child `.nowline` in this folder too.
2. Append an entry to the `MANIFEST` in [`scripts/render-tests.mjs`](../scripts/render-tests.mjs) with a `now` date that falls inside the fixture's timeline. Only add an entry for the composite/top-level fixture, not for every included child.
3. Document what the fixture validates in the table above.
4. Run `pnpm render` and inspect `tests/<slug>.svg`.

Behaviors worth covering as the harness grows: dense-anchor collision stacking, parallel + group brackets, footnote panel placement, cross-lane dependency arrows, dark-theme palette spot check, and items with overlong owner / footnote glyphs.
