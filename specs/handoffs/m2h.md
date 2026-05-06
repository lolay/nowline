# m2h Handoff — Sample isolate-include

## Scope

Bring the renderer's output into close visual parity with [`specs/samples/isolate-include.svg`](../samples/isolate-include.svg). Pairs a new [`examples/isolate-include.nowline`](../../examples/isolate-include.nowline) with a sibling [`examples/partner.nowline`](../../examples/partner.nowline) and adds the dashed-bordered isolate region with a label tab + external-link badge plus correct draw order so cross-region arrows render on top of the region fill.

**Milestone:** m2h
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline`

## What to Build

### 1. Example DSL

[`examples/isolate-include.nowline`](../../examples/isolate-include.nowline):

- `roadmap "Primary Release"` with `start:2026-01-05 scale:1w`.
- `anchor kickoff date:2026-01-05`.
- `swimlane core` with `core-api` (3w, after:kickoff) and `migrations` (2w, after:core-api).
- `swimlane integrations` with `bridge` (2w, after:[migrations, plugin-beta]).
- `milestone ga "GA" after:bridge`.
- `include "./partner.nowline" roadmap:isolate`.

[`examples/partner.nowline`](../../examples/partner.nowline):

- `roadmap "Partner - Vendor plugin roadmap"` with the same `start` / `scale`.
- `swimlane plugin` with `plugin-alpha` (4w, after:kickoff) and `plugin-beta` (2w, after:plugin-alpha).

Render with `--now 2026-02-02 --theme light`.

### 2. Renderer changes — `renderIncludeRegion`

The current implementation already draws a dashed-border rect with a label and a `include: <path>` text caption. m2h tightens the visuals:

- Replace the `text` + caption pair with a small white label-tab chiclet sitting on the top edge of the dashed border (`fill=#ffffff stroke=#8b5cf6`, ~300×22 px, rounded `rx=4`).
- Replace the path caption with a 14×14 colored tile (purple) holding the external-link arrow glyph, anchored to the right edge of the label tab.
- Set the dashed border to `stroke=#8b5cf6 stroke-width=1.5 stroke-dasharray="6 4"` to match the sample.
- Lift the box fill to `#fafaf9` so it reads as a distinct surface from the swimlanes (not transparent).
- Increase the region height to fit the included swimlane content (the layout already sizes this — see "Layout" below).

### 3. Layout changes — populate include-region children

`buildIncludeRegions` currently produces a placeholder 48 px box. m2h walks the included `ResolvedContent` (already parsed by `@nowline/core`) and renders the included swimlanes inside the region:

- Each isolated region grows to host its included swimlanes plus padding for the label tab.
- The region's swimlanes share the parent's timeline (same `originX`, `pixelsPerDay`, `today`).
- Cross-region dependency edges are routed through the existing `buildDependencies` pass; the dashed border doesn't block them.

For m2h's iteration loop, this can be approximated:

- Add a `nestedSwimlanes: PositionedSwimlane[]` field on `PositionedIncludeRegion`.
- The renderer draws the dashed region first, then the nested swimlanes inside, then anchor / milestone / dependency overlays in `renderSvg`.

### 4. Renderer draw order

`renderSvg` already draws cut lines + nowline AFTER swimlanes, edges, and includes. The cross-region edges naturally render on top of region fills because the include region is drawn before edges. The only adjustment is to make sure the include region's nested swimlanes render BEFORE the parent's anchors/cut-lines (so cut-lines overlay the include region).

## What NOT to Build

- No new include-resolution logic (handled by `@nowline/core`).
- No "include without isolate" rewrite (out of scope).
- No nested-include traversal beyond one level deep.
- No DSL grammar changes.
- Pixel-level sample matching — the bar is *same family*.

## Definition of Done

- [ ] `examples/isolate-include.nowline` and `examples/partner.nowline` exist and render without errors.
- [ ] The isolate region renders as a dashed purple rounded box with a label tab + external-link badge on the top edge.
- [ ] The included roadmap's swimlanes show inside the region with the parent timeline.
- [ ] Cross-region dependency arrows render on top of the region fill.
- [ ] Existing tests pass (any goldens that change are updated).
- [ ] m2h strikethrough applied to `specs/milestones.md`.

## Resolutions

1. **Region label tab uses the include's own roadmap title** when present, else the basename of the include path. Same convention as id→title resolution elsewhere.

2. **Included roadmap config is honored only for visuals nested inside the region.** Calendar / scale come from the parent (the region shares the parent's timeline). The include's own `default ...` declarations apply only to its own items.

3. **Swimlane band tinting in the include region uses purple-tinted variants** (`#ede9fe` tab fill, `#a78bfa` borders for items) so the region visually reads as a guest, not a parent lane.
