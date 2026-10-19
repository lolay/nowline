# tests/ — Renderer manual validation fixtures

Tiny `.nowline` files that stress one renderer behavior each. They are **not** representative roadmaps the way [`examples/`](../examples) is — every file here exists to make a single layout / rendering axis visible at a glance, so when something regresses you can tell which axis broke.

> **Rule of thumb — where does a new `.nowline` go?**
>
> - **`tests/`** (this folder) — you're creating a visual to *exercise a renderer behavior*: sized titles, text-fit vs spill, dependency arrows, isolate-include with multiple lanes, etc. The file exists so a human can eyeball "did this axis regress?". SVG output is gitignored.
> - **[`examples/`](../examples)** — you're adding a *representative, user-facing* roadmap: a `nowline --init` template, a doc screenshot source, or a sample-fidelity reference that pairs with [`specs/samples/`](../specs/samples).
>
> If the file's purpose is "see how the renderer handles X", it belongs here — not in `examples/`.

Pair this with the byte-stable snapshot suite at [`packages/integration-tests/test/__snapshots__/`](../packages/integration-tests/test/__snapshots__/) (driven by [`packages/integration-tests/test/snapshot.helpers.ts`](../packages/integration-tests/test/snapshot.helpers.ts)):

- The snapshot suite catches drift on representative `examples/*.nowline` files and on selected renderer matrices that live under `tests/` (canonical regression gate). Listing a file in `SAMPLES` there is an ongoing commitment.
- Many fixtures here are for *human eyeballing* only — they are not all snapshotted.

## How they're rendered

`pnpm build` (or `pnpm render`) runs [`scripts/render-tests.mjs`](../scripts/render-tests.mjs) which writes a sibling `.svg` next to every entry in the `TESTS` list of [`scripts/lib/render-manifest.mjs`](../scripts/lib/render-manifest.mjs) (curated list of `tests/*.nowline` sources). The SVGs are gitignored — they are CLI output, not source. To skip rendering during build (e.g. while iterating on a broken renderer) set `NOWLINE_SKIP_RENDER=1`.

To see each fixture's source and render together, and step through them with a previous-vs-this compare, run `make gallery` (then open `.gallery/site/index.html`, or `make gallery-serve` to browse from a phone). Each run is compared against the one before it, so running it on `main` and then on your branch shows what your change moved. [`Makefile.md`](../Makefile.md) has the details. CI publishes the same gallery for every build of `main` and every same-repo PR at [review.nowline.dev](https://review.nowline.dev) ([`specs/ci.md` § Review gallery](../specs/ci.md#review-gallery)).

## Starter fixtures

Most files are near-clones of [`examples/minimal.nowline`](../examples/minimal.nowline) (one swimlane, three items) so the diff between fixtures is the property under test. A few fixtures (e.g. `isolate-include-multi`) need extra shape to exercise what they exist for — keep that shape as small as the behavior allows.

| File | What it stresses |
|---|---|
| [`large-roadmap-title.nowline`](large-roadmap-title.nowline) | Header card sizing with a long roadmap title — must not overlap the timeline panel. |
| [`large-swimlane-title.nowline`](large-swimlane-title.nowline) | Swimlane chiclet width with a long swimlane title — and any first-row top-pad collapse logic. |
| [`text-fits-inside-bars.nowline`](text-fits-inside-bars.nowline) | Inside-bar layout branch: every item is wide enough that title + meta sit *inside* the bar (no spill). |
| [`text-spills-right.nowline`](text-spills-right.nowline) | Right-spill branch: every item is too narrow for its title, so title + meta render to the right of the bar. |
| [`text-wraps-inside-bars.nowline`](text-wraps-inside-bars.nowline) | Title wrap branch: a title too wide for one line wraps to two lines *inside* the bar (bar grows 16px with its meta line) instead of spilling, so the next chained item stays on the row. The issue's Platform / Web / Mobile roadmap plus a wrapped title with a link icon (caption starts past the 14px tile), and a "Dot clearance" lane: the first title line also stops short of the status dot / footnotes / `before:` glyph, so "Authentication refactor" in a linked 2w bar spills instead of running under the dot. A wrapped item with *no* meta line can't be written in the DSL (every item needs `duration:` or `size:`, which renders as meta); that case is covered by layout unit tests. Single-word titles still spill: see `text-spills-right` and `item-bumps-up`. |
| [`title-line-breaks.nowline`](title-line-breaks.nowline) | Explicit `\n` line breaks in item titles: the author's lines are authoritative (no auto-wrap, no 2-line cap). The issue's `"Technology\nSelection"`, a break that splits a title that would fit one line, a 3-line title that stays in-bar (bar grows 32px with its meta line), `\\n` as the literal text `\n`, a too-wide line that spills the whole block to the right as stacked lines, and a break with a link icon and a footnote so line 1 has to clear the footnote digit. |
| [`item-bumps-up.nowline`](item-bumps-up.nowline) | Topmost-fit row packing: a long middle item pushes itself to row 2, but the trailing item bumps back up to row 1 alongside the first item instead of claiming a fresh row. |
| [`late-row-shifts.nowline`](late-row-shifts.nowline) | Geometry that must follow a bar when layout moves it down after placing it: a wrapped item that lands back on row 0 grows that row after rows 1-3 were placed, and a marker band that outgrows its sizing moves the whole chart down. Dependency-arrow ends, the milestone slack arrow, and the calendar glyphs on an item, a filled group and a parallel must all sit on their final boxes. |
| [`marker-predecessor-arrows.nowline`](marker-predecessor-arrows.nowline) | Slack and overrun arrows whose predecessor is an anchor or milestone: each leaves its source marker's own row in the marker band, and the band packs around the arrows. Alpha floats after an anchor and an item, Beta after Alpha, Review (dated) is overrun by Alpha, Cut (dated) is overrun by the Code freeze anchor, and the isolated region ([`marker-predecessor-partner.nowline`](marker-predecessor-partner.nowline)) repeats the pattern on its own marker row. Pinned by `packages/layout/test/chart-local-frame.test.ts`. |
| [`milestone-overrun.nowline`](milestone-overrun.nowline) | A dated milestone overrun by an item: the line, diamond and label render red, with a red dotted arrow from the overrunning bar's end back to the line; an on-time dated milestone beside it stays in ink. Anchor, milestone and wave overruns live in `marker-predecessor-arrows` and `waves-gap-deadline`. |
| [`isolate-include-multi.nowline`](isolate-include-multi.nowline) | `roadmap:isolate` include where the child has multiple swimlanes — how a multi-lane isolated region stacks against the parent's own lanes. Uses [`partner-multi.nowline`](partner-multi.nowline) as its included child. |
| [`capacity-items.nowline`](capacity-items.nowline) | Every shape of item-level `capacity:` suffix / `capacity-icon:` (multiplier, built-in SVG icons, decimal, percent sugar, inline literal, custom symbol, none). |
| [`capacity-lanes.nowline`](capacity-lanes.nowline) | Lane-level `capacity:N` chiclet variants across the same icon matrix plus owner stacking. |
| [`size-and-capacity.nowline`](size-and-capacity.nowline) | Size + capacity interaction matrix (driver token, derived duration, capacity suffix, overrides). |
| [`utilization-states.nowline`](utilization-states.nowline) | Lane utilization underline: healthy, warn threshold, over capacity, coalesced segments, custom thresholds, opt-out. |
| [`nested-both-headers.nowline`](nested-both-headers.nowline) | Tall roadmap with `timeline-position:both` (mirrored date strip) and `minor-grid:true`. |
| [`header-height-xl.nowline`](header-height-xl.nowline) | `header-height:xl` with `timeline-position:both`, waves and markers: both tick panels grow to 40 px with centered date labels, and everything below the top panel moves down. |
| [`header-height-none.nowline`](header-height-none.nowline) | `header-height:none` with `timeline-position:both`: no date strip at either end, the now-pill, wave strip and marker row stack directly, and the now-line stops at the last swimlane. Validates with the warning `NL.W0704`. |
| [`waves-empty.nowline`](waves-empty.nowline) | An empty wave between two populated ones: it spans no time, draws a hollow marker on the shared boundary, reads "(no items)" in the legend, and reports `NL.I1006`. |
| [`waves-parallel-group.nowline`](waves-parallel-group.nowline) | Waves with `parallel` tracks in different waves, an id-only `group api-track wave:w1` and an anonymous `group wave:w2` that assign their children and draw nothing themselves (no bracket, no id label; specs/waves.md §9.7), and a titled group that spans a boundary and keeps its bracket. |
| [`waves-gap-deadline.nowline`](waves-gap-deadline.nowline) | Wave start floors (anchor and inline date) that each open a gap (the inline-date gap shows its gap label; the one-week anchor gap is too narrow for one), plus a dated milestone `after:<wave>` that the wave overruns: overrun cut line styling and `NL.I1007`. |
| [`waves-isolate.nowline`](waves-isolate.nowline) | A `roadmap:isolate` region taking part in the wave barrier: region ids stay private but the waves are global. Uses [`waves-isolate-team.nowline`](waves-isolate-team.nowline) as its included child, which re-declares the same waves. |
| [`waves-coarse.nowline`](waves-coarse.nowline) | Waves at `scale:1m`: seven waves including an empty one, a start-floor gap, a styled wave, two stacked marker rows, background work crossing boundaries, and a `group wave:x` on a boundary. |
| [`weekends-show.nowline`](weekends-show.nowline) | The `show` display of a business calendar (`default roadmap non-working:show`): each weekend is a full-width shaded band, a bar paints across it but ends at the end of its last working day, a Wednesday-start bar crosses a weekend, a group after a Friday end starts on the next Monday, and a Saturday milestone sits on its own date inside a band. Example A of [`specs/working-calendar.md`](../specs/working-calendar.md) §10 plus three extra lanes. Snapshotted and in the determinism gate. |
| [`working-exceptions.nowline`](working-exceptions.nowline) | Titled `working` declarations labelled in the marker row (`Release crunch · +1d`), with no cut line under `hide` and no band under `show`: a working Saturday next to a Friday milestone, a two-day working weekend (`+2d`), a weekday make-up day inside Winter break that splits the closure into two labelled seams, and an untitled working Saturday that draws nothing. [`specs/working-calendar.md`](../specs/working-calendar.md) §7.4. Rendered under `hide`; pass `--non-working show` for the other view. |
| [`marker-left-overflow.nowline`](marker-left-overflow.nowline) | Anchor and milestone labels (dated and after-only) that fit on neither side of their marker in a one-week chart beside the header card: the canvas grows on the right so each label sits right of its marker instead of falling back onto the card. Snapshotted. |
| [`non-working-recurrence.nowline`](non-working-recurrence.nowline) | Week tick labels under a bounded recurrence (`every:fri start:… end:…`) with the default `non-working:hide`: nine weeks narrowed to 32 px form one run, and their labels alternate instead of all dropping; a lone Juneteenth week keeps the plain narrow-column rule and drops its label ([`specs/working-calendar.md`](../specs/working-calendar.md) §7.2). Snapshotted. |
| [`logo-beside.nowline`](logo-beside.nowline) | Company `logo:` in the default beside header: a 4:1 wordmark ([`assets/logo-wordmark.svg`](assets/logo-wordmark.svg), viewBox only) at `logo-size:md` draws 144 x 36 left of the title, widening the card by its slot. |
| [`logo-above-xl.nowline`](logo-above-xl.nowline) | Company `logo:` in `header-position:above` at `logo-size:xl`: a 512 px square mark ([`assets/logo-mark.svg`](assets/logo-mark.svg)) scales down to 72 px, the band grows from 72 to 92 px, and the text centers beside the logo. |

### Multi-file fixtures

A fixture that needs an `include` target (like `isolate-include-multi`) keeps its child `.nowline` **next to it in this folder**, not in `examples/`. Only the composite fixture gets a `TESTS` entry in [`scripts/lib/render-manifest.mjs`](../scripts/lib/render-manifest.mjs); the child is a fixture dependency, not a demo, and doesn't need standalone rendering.

## Adding a new fixture

1. Add `tests/<slug>.nowline` with the smallest possible body that exhibits the behavior. If it needs an `include` target, colocate the child `.nowline` in this folder too.
2. Append an entry to `TESTS` in [`scripts/lib/render-manifest.mjs`](../scripts/lib/render-manifest.mjs) with a `now` date that falls inside the fixture's timeline. Only add an entry for the composite/top-level fixture, not for every included child.
3. Document what the fixture validates in the table above, and in a leading `//` comment block in the fixture itself (the review gallery shows that comment as the fixture's description).
4. Run `pnpm render` and inspect `tests/<slug>.svg`.

Behaviors worth covering as the harness grows: dense-anchor collision stacking, parallel + group brackets, footnote panel placement, cross-lane dependency arrows, dark-theme palette spot check, and items with overlong owner / footnote glyphs.
