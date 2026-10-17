# True-width layout

Status: **built** (milestone m4.15: m1 to m4 of §5, lolay/nowline#174, lolay/nowline#175, lolay/nowline#176). Every open question of §8 is decided. [`rendering.md`](./rendering.md) is the normative description of the drawing; this spec keeps the rules' reasoning and the migration record. Handoff: [`handoffs/handoff-m4.15-true-width-layout.md`](./handoffs/handoff-m4.15-true-width-layout.md).

## 1. Problem

*This section describes the chart before m4.15; none of it is true of the chart now.*

The chart drew dates that were not the plan's dates. The scheduler (engine C, `scheduleRoadmap`) and the exports agree on every start and end since m4.11, but the chart widens anything too short to draw:

- **Bars.** A bar gives up `ITEM_INSET_PX` (6 px) on each side and is drawn at least `MIN_ITEM_WIDTH` (8 px), so nothing is narrower than 20 px. At the default weekly scale (40 px a week, 8 px a working day) that is 2.5 days: a one-day task is drawn two and a half times its length.
- **Chains.** Consecutive short tasks overlap their widened bars, so the row packer drops each one a row. Five one-day tasks become a five-row staircase smeared across a week and a half, and their captions truncate (`Rate li…`).
- **Markers.** Since lolay/nowline#167 an after-only milestone sits on its predecessor's duration end and `before:` compares the duration end ([`scheduler-unification.md`](./scheduler-unification.md) §9, decision 14), so the dates are right; but the bar is still drawn wider than its duration, so a milestone after a short task lands inside that task's bar, and a slack arrow or `before:` overflow tail still starts at the painted edge.
- **Containers.** Group and parallel boxes take horizontal space (a chiclet, a `[` bracket, padding), so their painted edge differs from their dates. m4.11 had to split the lane cursor into a time end (`TrackCursor.x`) and a painted edge (`maxX`), and keeps six register entries for bars drawn wider than their duration ([`scheduler-unification.md`](./scheduler-unification.md) §8 decisions 6 and 7).

The specs never decided this. [`rendering.md`](./rendering.md) says a bar's width "is determined by `duration`" and never mentions the minimum; [`dsl.md`](./dsl.md) says items shorter than `scale:` "may" render as "labelled annotations", which [`rendering.md`](./rendering.md) never defines. Decision 6 of the scheduler spec is the only ruling, and it calls the widened bar presentation.

## 2. Principle

**Every date-bearing mark sits exactly on its date**: bar starts and ends, milestones, anchors, wave edges and the ends of dependency arrows. To get there the chart spends vertical space, never time.

Out of scope, by decision:

- **No variable-width items.** No minimum duration feeds back into the schedule; the chart and the exports keep one set of dates.
- **No variable-width columns.** One pixels-per-day across the axis; equal durations look equal everywhere.
- **No auto-zoom.** The column width stays what `scale:` gives. A short item is short.
- **No merging.** Each item keeps its own bar and caption; chains of short items are not collapsed into a run.

## 3. Rules

### 3.1 Bars

- A bar spans exactly `[x(start), x(end)]` from the schedule. There is no minimum width and no horizontal inset that widens it; the floor is 1 px.
- Each bar gives up a 1 px seam on each side, from inside its dates, so two bars that abut in time show a 2 px gap between their strokes. A bar too short for both seams and the 1 px floor shrinks its seams instead, staying centred in its dates (`itemBarInsetPx`), so a seam never widens a bar.
- Corner radius is `min(theme radius, width / 2, height / 2)`: short bars become pills, then lines.
- Bar height, the caption model (title line plus meta line) and the in-bar decorations are unchanged by this spec. Where a decoration does not fit, it spills into the caption cluster right of the bar, as before (`layoutSpillCluster`, the `MIN_BAR_WIDTH_FOR_*` thresholds). The progress strip is drawn at the bar's true width.

### 3.2 Captions and rows

- A caption that fits inside its bar stays inside; otherwise it sits right of the bar, as before, including the one-column cap at the chart's end (m4.11 F7).
- **Rows never move up.** The next child of a track (lane or group) stays on the previous child's row if its bar and caption fit there, and otherwise drops to the first row below that fits. It never moves above the previous child. The packer before m4.15 was first-fit from the top, which could put an item above the work before it (`Release` above `Integration` in the nested-parallels stress case, §6).
- Collisions use the painted footprint (bar, spilled caption, container header), so a long caption pushes the next item down rather than right.

### 3.3 Groups and parallels

A container no longer takes horizontal space. It is drawn above and around its content, never beside it:

- **Header**: the title over a bracket that spans exactly the container's dates. A group's bracket is solid, a parallel's dashed. The title starts at the container's start and may run past the bracket's end; the packer treats it as footprint.
- **Body**: a shaded rectangle spanning exactly the container's dates, from the header down to below the last child, with padding above and below the content (6 px each). There is no left or right padding.
- **Nesting** adds one header and its padding per level. A parallel stacks its children's tracks vertically inside its body.
- **Styles**: the body shading takes the container's `bg`. The default themes give groups and parallels distinct light tints. The left `[` bracket, the styled group's box and title chiclet (`GROUP_TITLE_TAB_*`) and `GROUP_BRACKET_LABEL_OVERHANG_PX` retire. `bracket:` keeps its values and now styles the header bracket (`none` hides it); see §8 O5.
- A wave-only group (no title, no `style:`, no `labels:`, carries `wave:`) still draws nothing.

### 3.4 Dependencies

Arrows are drawn only for `after:` on items, as before, and they run on the dates:

- **Ports.** An arrow leaves the **middle of the source's last day** through its bottom edge (top edge when the target is above) and lands, arrowhead first, on the **middle of the target's first day** on its top edge (bottom edge when the source is below). When a bar is shorter than a day, the port is the bar's middle. Day centres, not date lines: in a chain the source's successor starts exactly on the source's end date, so a leg on the date line runs down the successor's edge and points at the wrong item.
- **Route.** Vertical from the source port to the gap between rows below (or above) the source, horizontal in that gap to the target's port column, vertical to the target. Legs pass behind bars, crossing them at right angles, never along an edge.
- **Slack.** The horizontal leg is dotted when the target waits (its length is the slack) and solid when the target starts the day the source ends.
- **Sources** that are a group or a parallel leave from the bottom of their body at their end date.
- **No arrow where position already says it**: lane order; a target on the same row that starts where its source ends; an item that starts exactly on an anchor (it touches the anchor's line). A target on the same row that waits gets a dotted horizontal leg at the row's midline.
- **Channels.** Arrows sharing a gap take offset lanes (2.5 px apart). Arrows landing in the same day share its centre column; see §8 O1.
- **Regions.** An isolated region routes its own arrows among its own lanes (lolay/nowline#166); the same rules apply there.

### 3.5 Markers

- **Anchors** keep the cut line and diamond. An item that starts on the anchor touches the line; an item that starts later gets a dotted stub from the line to its start.
- **Milestones** sit on the scheduler's date, `after:` ones included (already so since lolay/nowline#167). Non-binding predecessors keep their dotted slack line; with true-width bars its start, the painted edge, is the end date.
- **`before:` overflow** compares the duration end (lolay/nowline#167); with true-width bars the red tail runs from the cap to the end date.
- **Isolated regions** draw their own markers, arrows and footnotes (lolay/nowline#166) with the host's rules, so every rule here applies inside a region too.
- **Waves** are unchanged. A bar can no longer paint past its wave's closing edge.

## 4. What this replaces

| Before m4.15 | Since m4.15 |
|---|---|
| `MIN_ITEM_WIDTH` clamp and `ITEM_INSET_PX` gutter on bars | true width, 1 px floor, 1 px seam |
| [`scheduler-unification.md`](./scheduler-unification.md) §8 decisions 6 and 7 | superseded: nothing drawn wider than its dates |
| `TrackCursor.x` (time) and `maxX` (painted) | one end; the painted footprint lives only in the row packer |
| six `(b)` entries in `test/engine-divergences.json` | none; the register can be replaced by the invariant tests of §6 |
| styled group box, title chiclet, left `[` bracket | header bracket and shaded body |
| channel-grid routing through bar gutters (m2k) | date-port routing through row gaps |
| [`dsl.md`](./dsl.md)'s "labelled annotations" for items finer than `scale:` | removed; short items draw at their width |
| `MilestonePredecessor.x` (painted edge) beside `endX` (duration end), from lolay/nowline#167 | equal once bars are true width; one can go |

`scheduleFloorX` (m4.11 F4) becomes an identity on every sample once nothing widens a start, and can be removed with the register. m1 removed both; the barrier seed of F4 stays.

## 5. Migration plan

Each milestone renders every `examples/` and `tests/` file in light, dark and grayscale with `--now 2026-02-09` and compares the xlsx, msproj and mermaid exports, as m4.11 did. The review gallery (`make gallery`, lolay/nowline#169) shows each moved render beside its baseline for review. Unlike m4.11 this milestone moves nearly every sample on purpose, so each step lists the samples, snapshots and determinism cells it moves, and none is bumped without that list. The exports should not move at all: they read the schedule, which this milestone does not touch.

### m1 - Bars at true width

Drop the `MIN_ITEM_WIDTH` clamp and the `ITEM_INSET_PX` gutter from bar geometry (`sequence-item.ts`, `item-measure.ts`, `item-bar-geometry.ts`); add the 1 px seam and the radius rule. Collapse `TrackCursor` to one end. Change the row packer to "never moves up" (`row-track.ts`). Delete the `(b)` register entries and `scheduleFloorX` once the invariant test of §6 passes. Arrows still route with the old router; their ports read the new boxes.

As built (m1):

- Bar geometry: `naturalWidth` is the item's span in time (`itemSpanPx`), the box is inset by `itemBarInsetPx` and is `itemVisualWidth` wide; `MIN_ITEM_WIDTH` is 1 and `ITEM_SEAM_PX` is 1. `ITEM_INSET_PX` stays for the lane gutter and container headers until m2. The renderer caps a bar's corner radius at half its width and height.
- `TrackCursor` has only `x`, the time end. A parallel's box, a group's box and `after:` all read it.
- The row packer places each child on the last row or a new row below it, so it never has rows below a growing row to shift (the retroactive row shift is gone; `tests/item-bumps-up` and `tests/late-row-shifts` keep their names and say so). An item whose own slack arrow runs left (an overrun) drops to a row that arrow can cross, since the work before it can no longer be pushed down out of its way; a corridor whose source is still to come in the track never bumps an earlier item.
- A parallel's box spans only its dates, so its row also reserves what its tracks spill past it (a caption, a group's box); the next child drops a row rather than landing on it. `test/no-overlap.test.ts` checks that no item's bar lands on another's bar or spill, on every sample and the 60 generated roadmaps.
- `test/date-truth.test.ts` checks every item of every sample and of the 60 generated roadmaps. With it green, the divergence register is empty and `scheduleFloorX` is gone; `schedule-lower-bound.test.ts` still guards the barrier seed.
- Interim: arrows still use the old router, which can route an elbow through the 2 px seam between abutting bars until m3.

### m2 - Containers above their content

Replace the group and parallel geometry (`group-node.ts`, `parallel-node.ts`, `container-header-geometry.ts`, `group-title-tab-geometry.ts`) and their renderer: header band, bracket, shaded body, vertical padding. Map `bg` and `bracket:` per §3.3. Inline-date glyphs on containers move into the header band beside the title.

As built (m2):

- Geometry: a container's `box` runs from its header's top to its body's bottom and spans exactly its children's earliest start and latest end in time (`TrackCursor.startX` carries a child's start up, as `x` carries its end). `headerHeight` (18 px, `CONTAINER_HEADER_BAND_PX`) is set when there is a title, a glyph or a visible bracket; the bracket line sits 13 px down with end ticks to the body. The body pads its content 6 px above and below; the cursor adds the inter-row gap after it, so the doubled gap a group used to leave below itself is gone.
- `container-header-geometry.ts` holds every constant and helper both sides read (`containerChrome`, `containerHeaderTitleX`, `containerHeaderRightX`). `group-title-tab-geometry.ts`, the `GROUP_TITLE_TAB_*` constants, `GROUP_BOTTOM_PAD_PX`, `GROUP_BRACKET_LABEL_OVERHANG_PX` and `ITEM_INSET_PX` are gone (`GUTTER_PX` is now 12 on its own), and so are their exports from `@nowline/layout`.
- Footprint: the row track reserves what a container paints past its end, its header (title and glyphs, plus 6 px) and its children's spills, recursively; the canvas grows to the same extent (`trackChildPaintedRightX`, which now counts an item's decorations only when something spills).
- Styles: the renderer's `renderContainer` draws both kinds. The default themes set `group` and `parallel` `bg` to distinct tints, filled at 0.12; a parallel's default `bracket` is now `dashed`. The header title takes the header's ink (a group's `fg`, a parallel's bracket stroke), not `text:`, since it sits on the lane band: `platform-2026`'s `text: white`, chosen for the old chiclet, would have vanished.
- O3: the title runs past the bracket and the packer keeps it as footprint, so nothing in its track lands under it; no ellipsis is needed in m2. O4: a body nested one level takes a half-strength tint (0.06), and below depth 2 it is outlined instead of filled; the two kinds' tints already alternate when groups and parallels nest. O5: both keys keep their values, `bracket:` styling the header bracket and `bg` the body. No DSL change.
- A `before:` glyph keeps the 6 px inset from the container's end, so a sibling that starts on that end, level with the header, clears it (`container-glyph-clearance.test.ts` caught the flush version).
- `test/container-span.test.ts` checks the §6 container invariant on every sample and the 60 generated roadmaps. Interim, until m3: the old router's obstacles now model only the bracket's end ticks.

### m3 - Date-port arrows

Replace the channel-grid router for item dependencies (`dependency-edges.ts`, `edge-routing.ts`, `item-port-geometry.ts`) with §3.4, in the host and in each isolated region: day-centre ports, gap channels with offsets, dotted slack legs, the no-arrow cases. Anchor stubs and milestone slack lines follow §3.5.

As built (m3):

- Ports: `PositionedItem.dateSpan` records an item's dates in x at placement (nothing moves horizontally afterwards); `item-port-geometry.ts` builds each arrow end from it and the final box, and `edge-routing.ts` puts the source port at `end - min(day / 2, span / 2)` and the target port at `start + min(day / 2, span / 2)`. A group or parallel source reads its box, which spans its dates since m2, and leaves the bottom of its body.
- Gaps: the router computes the free bands between source and target over the leg's x-range, around bars with their spills, container header bands, container body bottoms and lane and region edges (each kept 1 px clear). It takes the gap whose vertical legs keep more than 1 px from every bar and container edge, then the one whose legs cross the fewest bars and headers, then the one nearest the source. "Fewest crossings" is a deliberate reading of "the gap below the source": a leg hidden behind a row of bars reads as broken, and the first gap below the source is the answer whenever it crosses nothing. With no free gap at all the leg runs just past the source and passes behind whatever is there.
- Lanes are 2.5 px apart, the first offset toward the source so the head keeps its leg; past a gap's room arrows share the least crowded lane. The default 8 px row gap holds three.
- **O1, resolved: bundling.** Arrows landing in one day column share a lane in a gap, so they merge into one trunk over the target. With the crossing rule a fan-out from one source to targets starting the same day comes out as one trunk down the source's last day that branches just above each target (`tests/text-wraps-inside-bars`, API to the three SDKs), the shape O1 recommends.
- **O6, resolved as recommended.** The renderer draws each head as a path (7 px across, 5 px along the leg) instead of a `<marker>`, narrowed to the target's painted width, and a 3 px dot below that (`headWidth`, `head` on `PositionedDependencyEdge`, which drops `kind`). The `-arrow` marker defs stay, now used only by milestone slack lines (and one unused one), so samples without arrows keep their bytes.
- Every arrow paints behind the bars, in the host and in each region (the old under-bar layer), at 1.1 px. The horizontal leg is dotted (`3 3`) when the target waits.
- No-arrow cases: a same-row target that starts where its source ends, and an item that starts on its anchor or `after:` milestone. That removed every arrow from 11 samples, all of them `after:kickoff` items that start on `kickoff` plus `partner`'s abutting chain; `tests/late-row-shifts` gains an "Anchor stub" lane so the corpus keeps a waiting anchor dependent.
- Milestone slack and overrun lines start on the predecessor's end date; `MilestonePredecessor.x` is gone (its `endX` is the start). Slack corridors read the same x.
- The channel grid (`ChannelGrid`, `collectRoutingObstacles`, the bracket nudge, the minimum stubs, the under-bar fallback) is deleted; nothing else used it.
- `test/arrow-ports.test.ts` checks the §6 arrow invariant on every sample and the 60 generated roadmaps, from engine C's dates rather than `dateSpan`; it fails on main's router (`inline-date-pins`, `text-wraps-inside-bars` and the generated set). Focused cases come from the prototype's `five-days`, `after-container` and same-row samples.

Markers needed no step of their own: lolay/nowline#167 already placed milestones and `before:` on duration ends, and m1 makes the painted edge equal the end date.

### m4 - Spec and docs

Rewrite [`rendering.md`](./rendering.md) "Item Bars", "Parallel and Group Rendering", "Dependency Arrows", "Milestones" and "Before Constraints" to this spec; remove the annotation sentence from [`dsl.md`](./dsl.md) and restate `bracket:`; add the changelog fragment (`changed`) naming every visible change; update the VS Code extension changelog if the preview's look is mentioned there.

As built (m4):

- m1 to m3 each rewrote their own sections and shipped their own `changed` fragment (`true-width-bars.txt`, `true-width-containers.txt`, `true-width-arrows.txt`), so m4 changed only documents and adds no fragment. It rewrote "Item Bars" (true width, seam, floor, radius), "Item Flow" (rows never move up), "Milestones" and "Before Constraints" in [`rendering.md`](./rendering.md), with the wave-boundary gutter there and in [`waves.md`](./waves.md); dropped the "labelled annotations" sentence from [`dsl.md`](./dsl.md) and gave `parallel` the same drawing note as `group`; marked [`scheduler-unification.md`](./scheduler-unification.md) §8 decisions 6 and 7, and decision 14's painted-edge clause, superseded; and closed m4.15 in [`milestones.md`](./milestones.md). The `nowline(5)` man page (English and French, and so the MCP `nowline://reference` resource built from it) still described a group as a bounding box with a title chiclet and `bracket:` as parallel-only; it now describes the header and body and the header bracket. Neither the VS Code extension's changelog nor its README describes the preview's look, so neither changed.
- The browser prototype (`specs/handoffs/true-width-prototype/`) is removed; its stress cases are kept below (§6) and in the focused tests that grew from them. It is in git history at aa0c0a1 if it is ever wanted again.
- No render, snapshot, determinism cell or export moved.

## 6. Test strategy

The divergence register compared A and C span by span. This milestone replaces it with invariants that hold on every sample and on the 60 generated roadmaps of `test/generated-roadmaps.ts`:

- **Date truth**: every placed item's bar `[x0, x1]` lies inside the scheduled start and end, mapped through the time scale, and within one seam of each (a bar under the 1 px floor may end past its end by less than a pixel). Every milestone and anchor `x` equals its scheduled date.
- **Containers**: a group or parallel's bracket and body span exactly its children's earliest start and latest end.
- **Rows**: in every track, each child's row is at or below the previous child's; no two bars on one row overlap.
- **Arrows**: every dependency arrow starts in the source's last day and ends in the target's first day; no arrow leg runs along a bar edge (no vertical leg within 1 px of a bar's left or right edge over that bar's height).

Each m-step also adds the focused cases it changes, and keeps `schedule-lower-bound.test.ts` green until m1 removes the floor.

The design was checked against five stress files in a browser prototype (removed in m4), each built to break one rule, all at `scale:1w`:

- **five-days**: five one-day tasks chained in one lane, then `milestone after:` the last. The old chart drew a five-row staircase over a week and a half; the true-width chart draws five 6 px bars 8 px apart, one per day; each caption spills right and drops the next bar a row, so the chain still steps down but spans exactly its five days, and the milestone sits on the fifth day's end.
- **after-container**: a parallel of a 2-week and a 4-week track, then a group whose last item has a one-day duration and a long title, and items in other lanes `after:` the parallel and `after:` the group, plus a milestone `after:` the group. It checks that a container source leaves the bottom of its body at its end date, and that the spilled caption does not move the group's end.
- **nested-parallels**: a parallel of groups, one holding a parallel of groups, with `after:` into a nested group and across lanes to a nested item, a group and the outer parallel. It checks header stacking per level, the alternating tints and "rows never move up" (the old packer put `Release` above `Integration`).
- **parallel-groups**: a parallel of a two-day and a four-day group of one-day items, then one item after the join and a milestone after it. It checks that the join is the latest track end and that the parallel's header and body span exactly its dates.
- **sprint**: three lanes of one-day items starting `after:` an anchor, crossing `after:` lists between lanes, a second anchor, and milestones `after:` items mid-lane. It checks day-centre ports in chains, bundling into one target day, and the anchor no-arrow case.

`arrow-ports.test.ts` keeps focused cases from five-days, after-container and the same-row shapes.

## 7. Risks

- **Height.** Chains of tasks shorter than their caption cost one row each. Accepted: vertical space is the budget. §8 O2 covers very long chains.
- **Every chart changes.** Users who knew the old look will notice. The changelog has to say why (dates are now exact) and show what moved.
- **Arrow density.** At weekly scale a day is 8 px; more than about three arrows landing on one day crowd its column (§8 O1).
- **Readability of thin bars.** A 1 px bar is a line. Its caption and tooltip carry its identity; colour carries status.

## 8. Decisions

Each began as an open question with a recommendation; m2 and m3 settled them (the "As built" notes of §5).

- **O1. Arrows landing on one day.** Bundled: arrows into the same target day share a lane in a gap and merge into one trunk that branches just above the targets (m3).
- **O2. Very long chains of short items.** No special case: each short item costs a row when its caption does not fit, as §7 accepts. Merging into runs was considered and set aside (§2). Revisit only with real files that hurt.
- **O3. Container titles wider than their span.** The title runs past the bracket and the row packer keeps it as footprint, so nothing in its track lands under it. Because nothing can, no ellipsis is needed (m2).
- **O4. Nested shading.** A body nested one level takes a half-strength tint (0.06 against 0.12), and below depth 2 it is outlined instead of filled, so tints never compound three deep; groups and parallels already alternate their two tints when they nest (m2).
- **O5. `bracket:` and `style:` on containers.** Both keys keep their values: `bracket:` styles the header bracket (`solid` for a group, `dashed` for a parallel by default, `none` hides it), `bg` fills the body. No DSL change (m2).
- **O6. Arrowheads on thin bars.** The head narrows to the target's painted width and becomes a 3 px dot below that (m3).

## 9. Related fixes found during design

Separate from this milestone, each its own change:

- ~~The `scale` block's `pixels-per-unit` is read by the layout (`view-preset.ts`) but rejected by the validator.~~ Fixed: the layout no longer reads it. `dsl.md` never documented the key, and a width knob in the block would be the auto-zoom §2 rules out, so the column width comes from `scale:` alone.
- ~~The `scale` block's `unit` is read by the layout (`view-preset.ts`) but rejected by the validator, the same gap as `pixels-per-unit` was.~~ Fixed: the layout no longer reads it. `dsl.md` never documented the key, and `scale:<duration>` on the roadmap already picks the unit, so the unit comes from `scale:` alone.
- The MS Project export writes no link for `after:` a parallel, and the Mermaid export names group and parallel ids it never declares ([`scheduler-unification.md`](./scheduler-unification.md) §9).
