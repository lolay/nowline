# Nowline — Layout Phases

**Status: Proposed (design only, no code yet).** Proposed milestone ID: **m4.14** (not yet entered in [`milestones.md`](./milestones.md)). This is refactor R2 from [`handoffs/review-since-v086-lantern.md`](./handoffs/review-since-v086-lantern.md): split `RoadmapNode.place` into date-window, measure, place and finalize phases, so the post-placement fixups run as one ordered pass over an explicit context. It builds on [`rendering-v2.md`](./rendering-v2.md) (m2.5c, the measure/place node model) and on [`scheduler-unification.md`](./scheduler-unification.md) (R1, one day-level scheduler). Every `file:line` below was checked at the commit that adds this spec (source identical to 0062df3 plus the m2 fixes of the same review).

## 1. Problem

m2.5c promised a tree of measure/place nodes with `layout.ts` collapsed "to the composition root (~300 L)" (`rendering-v2.md:201`). At HEAD `layout.ts` is 1,934 lines, `nodes/roadmap-node.ts` is 1,325, and `RoadmapNode.place` (`packages/layout/src/nodes/roadmap-node.ts:272-1128`) is one 856-line method. Only `ItemNode` implements `Renderable` (`nodes/item-node.ts:300`), and its `measure` reports the bar without the growth that wrapped titles and chip rows add (`item-node.ts:307-316`).

### 1.1 One method does four jobs

| Phase it really is | Lines of `RoadmapNode.place` | What happens |
|---|---|---|
| Date window | 279-312 | theme, locale, working calendar, view preset, sizes, style context; the window from engine B (`deps.computeDateWindow`, 305-312) |
| Measure | 314-558 | roadmap style (318-342); header sizing (344-365); pixels per day (374-388); header rows (397-407); time scale (412-417); marker pre-pack (418-498); timeline y and the beside-card push (499-515); timeline (517-541); marker placements (543-558) |
| Place | 560-761 | context literal (560-591); edge seeds (593-603); footnote index (605-609); lane passes, wave barrier and corridor rerun (611-728); regions (740-750); milestones (756-761) |
| Finalize | 763-1127 | the fixups P7 to P20 of §1.2, then the model |

Nothing marks the boundaries. The phases share locals (`markerRowY`, `headerRowsBottomY`, `finalChartRightX`, `spanDays`) and one mutable `LayoutContext` that mixes placement state with the canvas extent (`layout-context.ts:125-136`), and later blocks patch objects that earlier blocks built.

### 1.2 Inventory of post-placement mutations

A probe run for this spec instrumented a copy of the built layout package and laid out all 60 samples of gate G1's list (light theme, `--now 2026-02-09`) to count where each mutation changes something. "Corpus" is that count out of 60.

**In `RoadmapNode.place`**

| # | Mutation | Code | Must run after | Must run before | Corpus |
|---|---|---|---|---|---|
| P1 | Wave barrier: every lane and every region is placed up to n + 1 times; each pass resets the entity maps (624-635) and region placements are thrown away (694-696); the last pass is kept and the state frozen (703) | 683-705 | edge seeds, footnote index | everything that reads a placement | 12 (2 to 4 passes) |
| P2 | Slack-corridor rerun: corridors from the kept pass's milestone predecessors, then every lane is placed again with them | 721-728 | P1 (floors with the frozen `S`/`E`) | P3, P4, P6 | 6 |
| P3 | Canvas grows to the rightmost spilled caption | 738 | P2 | P4 (regions read the canvas), P8 | 26 |
| P4 | Regions placed once more and kept, each fitted to the canvas as it is now (`include-node.ts:157`) | 745-750 | P3 | P7 (reads region bars), P9 | 5 have regions |
| P5 | `chartBottomY`, `swimlaneBottomY`, `timeline.box.height` from the last lane or region | 752-754 | P4 | P6, P12, P13 | all |
| P6 | Milestones: x from the kept pass; a floating milestone writes a provisional row and label box (`milestone-node.ts:235-258`); cut lines from the current chart y | 761 | P2, P5 | P7, P8 | all with milestones |
| P7 | Timeline extension: when a leaf bar, marker or milestone passes the window, grow it to the next tick, **replace `ctx.scale`**, rebuild the ticks and calendar runs, grow the canvas | 774-812 | P3, P4, P6 | P8, P9, P10, P14, P15, P17 | 6 (canvas grows in 5) |
| P8 | Canvas grows for a marker label that fits neither side; the canvas is final after this | 819-851 | P6, P7 (final runs) | P9, P10 | 1 |
| P9 | Lane bands re-stretched to the canvas, regions re-fitted | 861-866 | P8 (#93) | P12 | 32 change a lane; 0 change a region |
| P10 | Unified marker re-pack replaces every placement of the pre-pack | 873-890 | P8 | P11 | 5 move a pre-packed marker |
| P11 | Placements pushed onto milestones, titled runs, working exceptions and marker midpoints | 895-923 | P10 | P12, P15, P16 | 9 move a milestone |
| P12 | Marker band growth: when the re-pack needs more rows than the pre-pack, grow the band, the timeline and the chart y by `deltaY`, and shift every lane, region, milestone cut line and slack arrow | 930-959 | P10, P11 | P13 to P20 | 3 |
| P13 | Bottom tick panel below the chart | 971-976 | P12 | P17, P18 | 3 |
| P14 | Waves: spans, strip, boundaries, crossings; writes `waveTooltip` onto placed items (`nodes/wave-node.ts:218-221`), crossings onto regions, the strip placeholder | 981-992 | P7, P12 | P18 | 12 |
| P15 | Anchors from the final placements, scale and chart y | 994-995 | P7, P10, P12 | — | all with anchors |
| P16 | Dependency edges, ports read off the final boxes | 996-997 | P12 and every row shift (#80) | — | all |
| P17 | Now-line on the final scale and canvas | 1002 | P7, P8, P13 | — | see L2 |
| P18 | Wave legend; grows `chartBottomY` | 1007-1010 | P13, P14 | P19 | 5 |
| P19 | Footnote panel, built a second time (the first build at 607 only fills the index) | 1013-1015 | P18 | P20 | all |
| P20 | Header box, card, logo, text inset, attribution box and canvas height | 1019-1094 | P19 | — | 59 beside, 1 above; the card pushes the timeline down in 16 |

**In the node files**

| # | Mutation | Code | Ordering dependency | Corpus |
|---|---|---|---|---|
| N1 | A row that grows after later rows exist shifts every later row's children down (`shiftTrackChildY`) | `row-packer.ts:239-251` | nothing may capture an item's y before its track is done; ports derive from final boxes since #80 (`item-port-geometry.ts`) | 5 |
| N2 | Lane band width set to the canvas at placement, overwritten by P9 | `nodes/swimlane-node.ts:405-410` | provisional until P8 | all |
| N3 | None in `GroupNode`; its child loop is the lane loop (§1.6) | `nodes/group-node.ts:158-262` | — | — |
| N4 | A second hand-built context, wave edges seeded into it, a provisional fit overwritten by P9; regions get an empty footnote index (92-93) and no corridors (104) | `nodes/include-node.ts:76-121`, `:157` | provisional until P8 | 5 |
| N5 | `waveTooltip` written onto background items placed long before | `nodes/wave-node.ts:218-221` | after the kept placements (P2, P4) | 12 |
| N6 | Inside `sequenceItem`: the resolved style is mutated with the status tint (571-581), and the box `ItemNode.place` returned is made taller afterwards (696-699) | `layout.ts:571-581`, `:696-699` | the row packer must predict the second one (§1.4) | all |
| N7 | Provisional marker placement and label box for a floating milestone, overwritten by P10 and P11 | `nodes/milestone-node.ts:235-258` | provisional until P10 | all with floating milestones |

### 1.3 Ordering bugs

Three fixes since v0.8.6 were ordering bugs in this list:

- **#80** (2761335): N1 and P12 moved bars but left behind geometry captured when each item was placed (arrow ports, slack attach y, inline-date glyphs).
- **#93** (fe59c3d): P9 ran before P7, so lane bands kept the pre-extension width and region fits read it.
- **b82abb3**: P7 was added because a spill-inclusive lane cursor pushed bars past the last tick.

The probe found two more that ship today:

- **L1, the beside card misses a grown marker band.** The card's bottom is placed at `headerRowsBottomY` (`roadmap-node.ts:1027-1033`), a value computed from the pre-pack row count (515). P12 grows the band but not that value, so in the three samples where the band grows, the card ends one marker row (26 px) above the header rows it is meant to hug (1021-1026): `examples/dependencies.nowline` (card bottom 74, rows bottom 100), `tests/late-row-shifts.nowline` (74, 100), `tests/marker-left-overflow.nowline` (100, 126). Fixing it changes those renders (F1, §5).
- **L2, a now-line without its pill row.** The pill row is reserved only when `today` falls inside the natural window (397-399), but the now-line is placed on the extended scale (1002; `buildNowline`, `layout.ts:1815`). With `length:` set, engine B ignores `today`, so a `today` between the natural and the extended end draws the now-line with no row for its pill: `examples/platform-2026.nowline` with `length:1w` added and `--now 2026-03-17` lays out with `pillRowHeight` 0 and the pill on the tick panel's y. NL.W1000 compares with the extended end (`layout-insights.ts:276-281`), so it stays silent. No sample hits this (m6.s1).

### 1.4 The row-height predictor is a copy of the sequencer

- `ItemNode.measure` returns the band height (`item-node.ts:307-316`). The bar's real height is set after `ItemNode.place` returns (`layout.ts:696-699`).
- The row packers need that height before they place the item, so `predictItemBarExtraHeight` (`layout.ts:1071-1161`) re-derives width, style, progress, meta line, caption fit and chip pack. Its comment says it mirrors "the caption-fit, chip-pack and caption-spill arithmetic in `sequenceItem` so prediction and placement agree byte-for-byte" (`layout.ts:1062-1063`).
- The lane and group loops derive the width a third time (`swimlane-node.ts:320-326`, `group-node.ts:201-207`) and keep a safety-net `max` for when the two disagree (`swimlane-node.ts:383-389`, `group-node.ts:254-260`). On the corpus they never disagree (probe), because the shared sub-helpers (`resolveItemMeta`, `resolveItemProgress`, `collectItemFootnoteIndicators`, `resolveTitleFirstLineReserve`, `fitItemCaption`, `resolveCaptionTitleLines`) are called from both; a new input to the bar height has to be added to both.

### 1.5 Header geometry lives in three places

`sizeBesideHeader` (`layout.ts:1271-1331`) reaches `RoadmapNode` through `deps`; the above-mode height, header box, `chartLeftX` and `chartTopY` are worked out in `place` (`roadmap-node.ts:348-365`), the card push in 500-511 (with `HEADER_CARD_TOP_INSET` at 98), and the card box, logo, text inset and header object at 1017-1054 and 1082-1094. #144 threaded the logo slot through all three. m2.5c left "the logo inside a `RoadmapHeaderNode`" open (`rendering-v2.md:292`).

### 1.6 Copies in the node layer

- **The lane and group child loops are the same code.** Diffing `swimlane-node.ts:276-391` against `group-node.ts:158-262` with comments stripped and `laneLeftX`/`groupContentLeftX` and `cursor`/`innerCursor` renamed leaves one line: the content iterated (`lane.content`, `node.content`).
- **Five `*Deps` interfaces.** `SwimlaneNodeDeps` (`swimlane-node.ts:84-113`), `GroupNodeDeps` (`group-node.ts:47-76`) and `IncludeNodeDeps` (`include-node.ts:35-60`) restate `LayoutHelpers` (`layout-context.ts:160-192`) member for member; `ParallelNodeDeps` (`parallel-node.ts:21-28`) is a subset; `RoadmapNodeDeps` (`roadmap-node.ts:234-264`) extends it with five orchestration helpers that stay in `layout.ts` only to avoid an import cycle (`roadmap-node.ts:6-10`). `sequenceItem`'s `ownerOverride` (`layout.ts:414`) appears in four of them and no caller passes it.
- **Two hand-built `LayoutContext`s**, `roadmap-node.ts:560-591` and `include-node.ts:76-116`. A field added to `LayoutContext` has to be added to both.

### 1.7 Status tints live in the sequencer

`layout.ts:531-581` holds three tint tables picked by theme name and the theme defaults they compare against (`#0f172a`, `#ffffff`, `#94a3b8`, `#9e9e9e`), which must match `entities.item.bg` and `fg` in `themes/light.ts:57-66`, `themes/dark.ts:56-64` and `themes/grayscale.ts:58-65`. The border colours already come from `theme.status`. m2.5d moved every renderer palette into `Theme` (`themes/shape.ts:100-103`); these stayed behind.

## 2. Goals and non-goals

**Goals**

1. `RoadmapNode.place` becomes four phase calls. Each phase is a module with a typed input and output.
2. Every mutation of §1.2 that runs after placement becomes a named step of one ordered finalize pass over an explicit `FinalizeContext` (scale, canvas, marker band, chart extent). The order is a checked table, and reading a slot before its writer ran throws.
3. Placement never reads the canvas, and item measurement never reads placement state.
4. The row-height prediction is `ItemNode.measure`; `predictItemBarExtraHeight` is deleted.
5. One `HeaderNode` owns beside and above sizing, the logo slot and the text inset.
6. One child loop for lanes and groups, one helper interface, one `LayoutContext` builder.
7. Status tints are theme tokens.
8. Every migration step renders every sample byte-identically (G1, G2). L1 is fixed outside the migration (F1); L2 is fixed in a step marked *behaviour*.

**Non-goals**

- Changing any rendered byte inside the migration (§5).
- A separate measure pass for lanes, groups and parallels. Their height is the result of row packing on x positions, so measuring them would be placing them twice; they stay single-pass, and the docs say so.
- Changing scheduling, start rules or barrier semantics (R1), or the row-packing algorithm: topmost fit and the N1 shift stay.
- The renderer, including its own status-key table (`renderer/src/svg/render.ts:1079-1086`); that is R5.
- Removing P7. It is needed while engine A's pixel quirks can pass engine C's days ([`scheduler-unification.md`](./scheduler-unification.md) §3.3).
- Public API: `layoutRoadmap`, `LayoutOptions` and `PositionedRoadmap` keep their shape; `Theme` gains one token group (§3.9).

## 3. Design

### 3.1 The four phases

| Phase | Module | Input | Output | Never touches |
|---|---|---|---|---|
| 1. Date window | `layout/src/phases/date-window.ts` | file, resolved, options, the schedule (R1) | `RoadmapScope`, `DateWindow` | pixels |
| 2. Measure | `phases/measure.ts` | scope, window | `MeasuredRoadmap`: header, axis, header bands, marker estimate, timeline | placement state |
| 3. Place | `phases/place.ts` | scope, window, measured | `PlacedChart` | the canvas |
| 4. Finalize | `phases/finalize.ts` | everything above | `PositionedRoadmap` | re-placing content |

```ts
// nodes/roadmap-node.ts, after m5
place(file: NowlineFile, resolved: ResolveResult, options: LayoutOptions, schedule: RoadmapSchedule): LayoutResult {
    const helpers: LayoutHelpers = { sequenceOne }; // §3.8
    const scope = resolveScope(file, resolved, options);
    const window = resolveDateWindow(file, resolved, options, scope, schedule);
    const measured = measureRoadmap(file, resolved, options, scope, window);
    const chart = placeChart(resolved, scope, window, measured, helpers);
    return finalizeRoadmap(new FinalizeContext(file, resolved, options, scope, window, measured, chart));
}
```

### 3.2 Phase 1: date window

```ts
export interface RoadmapScope {
    themeName: ThemeName;
    theme: Theme;
    locale: string;
    styleCtx: StyleContext;
    /** `default roadmap`: header position and height, timeline position, minor grid, non-working. */
    roadmapStyle: ResolvedStyle;
}

export interface DateWindow {
    cal: CalendarConfig;
    calendar: WorkingCalendar;
    preset: ViewPreset;
    sizes: Map<string, ResolvedSize>;
    schedule: RoadmapSchedule;
    startDate: Date;
    /** The natural end. Finalize step f2 may extend the axis past it; nothing else moves it. */
    naturalEndDate: Date;
    /** Working days in the natural window. */
    spanDays: number;
    /** Calendar days under `non-working:show`, else `spanDays`. */
    timelineDays: number;
    nonWorking: NonWorkingDisplay;
}
```

The window comes from R1's `computeDateWindow(file, schedule, today, scale)` ([`scheduler-unification.md`](./scheduler-unification.md) §3.3), which moves out of `layout.ts` into this module; the schedule arrives through R1's `LayoutOptions.schedule` or is built by `layoutRoadmap` (R1 m2.s1). The end is named `naturalEndDate` so that no later code mistakes it for the axis end after f2.

### 3.3 Phase 2: measure

Measure sizes everything the chart is laid out around, before any lane is placed: the header (`HeaderNode.measure`, §3.7), pixels per day and the time scale (today's 374-417), the header rows, and the marker band.

```ts
export interface MeasuredRoadmap {
    header: MeasuredHeader;
    axis: { originX: number; ppd: number; naturalWidth: number; scale: TimeScale };
    bands: HeaderBands;
    /** Ticks and calendar runs for the natural window; f2 refreshes them. */
    timeline: PositionedTimelineScale;
    markers: MarkerEstimate;
}

export interface HeaderBands {
    timelineY: number;
    pillRowHeight: number;
    tickPanelY: number;
    tickPanelHeight: number;
    waveStripY: number;
    markerRowY: number;
    /** Rows the pre-pack needed. f7 grows the band when the final pack needs more. */
    estimatedMarkerRows: number;
    /** Bottom of the header rows as estimated here; the beside card hugs this today (L1). */
    estimatedRowsBottomY: number;
    chartTopY: number;
    /** Height of the mirrored bottom tick panel (f8); 0 when there is none. */
    bottomTickPanelHeight: number;
}

export interface MarkerEstimate {
    /** Date-pinned anchors and milestones with their x; they seed the entity edges. */
    datePinned: ReadonlyArray<MarkerEntry & { date: Date; isMilestone: boolean }>;
    /** Pre-pack placements, already at the band's y. */
    placements: Map<string, MarkerRowPlacement>;
}
```

The band is an estimate because two of its inputs are only known in finalize: floating milestones (their x comes from placement) and the calendar runs of an extended axis. The pre-pack and the final pack call the same `packMarkerRow`; the entry assembly and the placement-to-y conversion, written twice today (422-428 with 486-497, and 548-558 with 880-890), move into one `MarkerBand` module (`nodes/marker-band.ts`) together with `packMarkerRow`, `markerLabelsRightX` and the run and exception entries (`roadmap-node.ts:122-191`, `:1196-1313`). That module is also where #143's period bracket would add a span entry.

### 3.4 Phase 3: place

Place builds the root context (§3.8), seeds the entity edges from the date-pinned markers, indexes the footnotes once, runs the lanes inside the barrier driver (P1), reruns them with corridors (P2), places the regions once more and keeps them (P4), and places the milestones (P6).

```ts
export interface PlacedChart {
    /** Entity maps and placed items of the kept pass; finalize reads them, never writes placements. */
    ctx: LayoutContext;
    swimlanes: PositionedSwimlane[];
    includes: PositionedIncludeRegion[];
    /** x, slack arrows and overrun; f6 adds the row and label box and builds `PositionedMilestone`. */
    milestones: MilestonePlacement[];
    laneEntries: SwimlaneDeclaration[];
    /** Rightmost bar or spilled caption of the kept lane pass (today's `pass.maxRightX`). */
    maxRightX: number;
    /** Bottom of the last lane or region (today's P5). */
    bottomY: number;
    waveSolve?: { passes: number; capped: boolean };
}
```

Rules the phase keeps:

- **No canvas.** `chartRightX` leaves `LayoutContext`. Lanes leave their width to f4 (N2), regions are fitted only in f4 (N4), and milestones get their row and label box only from f5 and f6 (N7). Each of these provisional values is overwritten today before it reaches the model (P9, P10, P11), so dropping them changes no byte.
- **Natural scale.** Placement uses the natural window's scale. f2 keeps the origin and pixels per day, so x positions stay valid, and it never re-places. A pin past the natural end would stay dropped even if f2 later covers it; engine C's window includes every pin, so this cannot happen today.
- **Wave tooltip where the item is placed.** `waveTooltip` is set by the item's placement from `waveRoleOf` and the locale strings in the scope, instead of by a walk in `buildWaves` (N5).
- **The corridor rerun stays as it is.** Corridors carry pass-1 y values; the comment at 712-720 argues that their x stays valid across the rerun and says nothing about their y. R2 does not change this; the coverage register (§6) would show any change.

### 3.5 Phase 4: finalize context and the ordered pass

```ts
export class FinalizeContext {
    readonly scope: RoadmapScope;
    readonly window: DateWindow;
    readonly measured: MeasuredRoadmap;
    readonly chart: PlacedChart;
    /** The canvas right edge: `grow` until f3 freezes it, `final` only after. */
    readonly canvas: CanvasExtent;
    /** The axis scale. f2 may replace it; `finalScale()` throws before f2 ran. */
    get scale(): TimeScale;
    finalScale(): TimeScale;
    extendScale(scale: TimeScale): void;
    /** The final marker pack, set by f5; reading it earlier throws. */
    markerBand(): MarkerBand;
    /** Chart top, bottom of the lanes, bottom including the panels below them. */
    readonly chartY: { top: number; swimlaneBottom: number; bottom: number };
    /** Pieces of the model the steps produce. */
    readonly draft: ModelDraft;
}

export class CanvasExtent {
    constructor(private rightX: number) {}
    /** The single mutator (today's `growChartRightX`, `roadmap-node.ts:118-120`). */
    grow(x: number): void; // throws once frozen
    freeze(): void;
    get final(): number; // throws before freeze
}

export interface FinalizeStep {
    readonly name: string;
    readonly reads: readonly FinalizeSlot[];
    readonly writes: readonly FinalizeSlot[];
    run(fx: FinalizeContext): void;
}
```

The pass is a constant list, run in order. Its order is today's except f1, which moves from between P2 and P4 to the head of finalize; with placement canvas-free (m3.s3) nothing between the two positions reads the canvas.

| Step | Was | Reads | Writes |
|---|---|---|---|
| f1 `growCanvasForSpill` | P3 | `chart.maxRightX` | canvas |
| f2 `extendTimeline` | P7 | leaf bars of lanes and regions, markers, milestones, window | scale, timeline, canvas |
| f3 `growCanvasForMarkerLabels` | P8 | every marker entry, final runs and exceptions | canvas, then freezes it |
| f4 `fitWidths` | P9, N2, N4 | canvas (final) | lane and region widths |
| f5 `packMarkers` | P10 | canvas (final), marker entries | marker band |
| f6 `placeMarkers` | P11, N7 | marker band | milestone rows and labels, runs, exceptions, marker midpoints |
| f7 `growHeaderRows` | P12 | marker band, header bands | chart top, lane bottom, chart bottom, lane and region y, milestone cuts and slack arrows, timeline height |
| f8 `bottomTickPanel` | P13 | chart bottom | chart bottom, timeline |
| f9 `waves` | P14 | scale (final), chart top, lane bottom, timeline, lanes, regions | waves, crossings |
| f10 `anchors` | P15 | scale (final), marker band, chart top, lane bottom | anchors |
| f11 `dependencyEdges` | P16 | final boxes, marker midpoints | edges |
| f12 `nowline` | P17 | scale (final), canvas, lane bottom, timeline | now-line |
| f13 `waveLegend` | P18 | waves, canvas, chart bottom | legend, chart bottom |
| f14 `footnotePanel` | P19 | chart bottom, canvas | footnotes |
| f15 `header` | P20 | chart bottom, canvas, header bands (estimated rows bottom) | header |
| f16 `attribution` | P20 | footnotes, chart bottom, canvas | attribution box, canvas height |

- **Checked order.** Each slot has one rule. The canvas, the scale and the marker band are final after f3, f2 and f5, and the chart top and lane bottom after f7: nothing writes a final slot again, and only the step that makes a slot final may read it before then. The chart bottom is a cursor that f7, f8 and f13 advance and f14 to f16 only read. A unit test checks the table against these rules. #93 broke exactly such a rule (lanes read the canvas before the extension had finished growing it). L1 and L2 are reads of measure-phase estimates, which the check cannot see; that is why f15 names the estimate it reads, and why m6.s1 moves the pill row into f7.
- **Guards.** `canvas.final`, `finalScale()` and `markerBand()` throw when read before their writer. The order is static, so a guard can only fire on a code change, and every layout runs every step, so the corpus tests exercise every guard.
- **Patches stay where they must.** f6 and f7 still write into milestones, lanes and regions built earlier, because the marker rows and the chart top are only known after placement. The difference is that they are the only writers, they run once, at one place in the order, and they say what they write. Placing the chart in local coordinates and translating it once would remove f7's shift but can change bytes (F2).

### 3.6 Items are measured once

```ts
// nodes/item-measure.ts
export interface ItemMeasure {
    node: ItemDeclaration;
    /** The snapped start the bar is measured at (`ctx.scale.startX`). */
    startX: number;
    durationDays: number;
    /** Logical width, `MIN_ITEM_WIDTH` clamp included. */
    naturalWidth: number;
    visualWidth: number;
    /** Resolved style with the status tint applied (a copy, never the shared object). */
    style: ResolvedStyle;
    status: StatusKind;
    progress: number;
    meta: ResolvedItemMeta;
    link: { icon: LinkIconKind; href?: string };
    chips: { samples: ChipSample[]; outside: boolean; pack: SpillChipPack | null; rowCount: number };
    footnoteIndicators: number[];
    caption: { fit: ItemCaptionFit; iconSpills: boolean; lines: string[] };
    /** Growth over the band height: max(title extra, chip extra). */
    barExtra: number;
}

export function measureItem(node: ItemDeclaration, startX: number, ctx: LayoutContext): ItemMeasure;
```

- `measureItem` is the front half of `sequenceItem` (`layout.ts:416-699` without the start resolution and the `before:` caps): duration, width, style and tint, progress, meta line, chip samples, caption fit, title and chip growth. It reads the scope, the scale and the footnote index, never an entity edge or a placed item.
- `ItemNode` is built from the measure, so `ItemNode.measure` returns `{ width: naturalWidth, height: bandwidth + barExtra }`, and `ItemNode.place` returns the final box: no caller patches its height (N6).
- The row track (§3.8) measures each item at its predicted start and uses `width` for the desired end and `height` for the row pitch, `step + (height - bandwidth)`; it hands the measure to placement, which reuses it. Parallel tracks, which reach `sequenceItem` directly, measure where they place. `predictItemBarExtraHeight`, `computeChipBarExtra`'s second caller and the width math in the two loops go.
- **Why this is byte-identical.** The lane and group loops predict at `ctx.scale.startX(resolveChildStart(…))` and `sequenceItem` places at `ctx.scale.startX(waveFloorX(resolvePinnedOrSequentialStart(props, cursor.x, cursor.x)))` with `cursor.x` set to that same start: a pin returns the same pin, `after:` returns `max(cursor.x, refs) = cursor.x`, and the wave floor is idempotent. The predictor's `!!link` equals `parseLinkIcon(link).icon !== 'none'`, and its missing `ownerOverride` is never passed. So the predicted and the placed bar come from the same inputs, and with one function they come from the same code. The safety-net `max` becomes an equality the tests assert.

### 3.7 `HeaderNode`

```ts
// nodes/header-node.ts
export interface MeasuredHeader {
    position: 'beside' | 'above';
    titleLines: string[];
    authorLines: string[];
    cardWidth: number;
    /** Card height, grown when the logo is taller than the text. */
    cardHeight: number;
    textCardHeight: number;
    /** Width the logo takes left of the text, gap included; 0 without a logo. */
    logoSlot: number;
    logo?: ScaledLogo;
    /** Beside: the card's box width, which is also `chartLeftX`. Above: 0. */
    chartLeftX: number;
    /** Above: the band height, bumped for an `xl` logo. */
    aboveHeight: number;
    chartTopY: number;
    /** Beside: the lowest the header rows may end so the card fits (card + 4 px inset). */
    minRowsBottomY: number;
}

export class HeaderNode {
    constructor(input: { title: string; author?: string; style: ResolvedStyle; logo?: ScaledLogo });
    measure(): MeasuredHeader;
    place(measured: MeasuredHeader, frame: { rowsBottomY: number; chartBottomY: number; canvasRightX: number }): PositionedHeaderParts;
}
```

`HeaderNode` splits measure from place but does not take the `Renderable` signature, which is built around a time scale and a band (`renderable.ts:237-251`) that a header has no use for; m6.s2 updates that file's comment to say which nodes measure.

- `measure` absorbs `sizeBesideHeader` and `HEADER_CARD_OUTER_PAD` (`layout.ts:1271-1331`), the above height, `chartLeftX` and `chartTopY` (`roadmap-node.ts:348-365`) and the card's minimum (508-510 with `HEADER_CARD_TOP_INSET`). Measure-phase code turns `minRowsBottomY` into `timelineY` as today (511).
- `place` absorbs the header box, card box, logo box and text inset (1017-1054) and the header object (1082-1094); f16 adds the attribution box.
- f15 passes `rowsBottomY: bands.estimatedRowsBottomY`, today's value. F1 changes it to the grown band's bottom.
- This answers m2.5c's open question (`rendering-v2.md:292`): the logo slot lives in the header node; drawing it stays in the renderer.

### 3.8 One loop, one helper interface, one context builder

```ts
// nodes/row-track.ts: the loop of swimlane-node.ts:276-391 and group-node.ts:158-262
export interface RowTrackResult {
    children: PositionedTrackChild[];
    /** Compact cursor: bar logical ends and block ends only. */
    timeCursorX: number;
    packer: RowPacker;
}
export function sequenceRowTrack(
    content: SwimlaneDeclaration['content'] | GroupBlock['content'],
    origin: { leftX: number; firstRowY: number },
    ctx: LayoutContext,
    helpers: LayoutHelpers,
): RowTrackResult;
```

`SwimlaneNode` keeps its tab and top-pad logic and `GroupNode` its chiclet, header band and box; both call `sequenceRowTrack` and read `usedHeight`, `usedRightX` and `timeCursorX` from the result.

**Helpers.** m1.s2 replaces the four node `*Deps` with `LayoutHelpers` and drops `ownerOverride`. As code leaves `layout.ts`, the members become direct imports: `newCursor` (`layout-context.ts`), `estimateTextWidth` (`text-measure.ts`), `sequenceItem` (`nodes/item-node.ts`), `resolveChildStart` (a `start-rules.ts` beside R1's `start-terms.ts`), and `predictItemBarExtraHeight` goes. `RoadmapNodeDeps` goes when its five helpers move into phase modules (`date-window.ts`, `header-node.ts`, `dependency-edges.ts`, `nowline-node.ts`, `collectItems` with the edges). What remains injected is `sequenceOne`, the dispatcher that groups and parallels call for nested blocks; importing it would form a group, parallel and dispatcher cycle (open question 4).

**Context builder.** Both literals become one function in `layout-context.ts`:

```ts
/** The per-file half of a context: the root file, or an isolated region. */
export interface ContextSource {
    config: Pick<ResolvedConfig, 'styles' | 'defaults' | 'symbols'>;
    content: Pick<ResolvedContent, 'sizes' | 'labels' | 'teams' | 'persons'>;
}
export function createLayoutContext(
    source: ContextSource,
    shared: { theme: Theme; cal: CalendarConfig; timeline: PositionedTimelineScale; scale: TimeScale; calendar: WorkingCalendar; bandScale: BandScale; waves?: WaveLayoutState },
    init: { footnotes?: FootnoteIndex; markerRowPlacements?: Map<string, MarkerRowPlacement> },
): LayoutContext;
```

`ResolveResult` and `IsolatedRegion` both satisfy `ContextSource`. A region passes no footnotes and no marker placements, as today (`include-node.ts:92-93`, `:105`), and the caller seeds the wave edges as today. When R1 m2.s3 adds the schedule to the context, it is one field in `shared`.

### 3.9 Status tints become theme tokens

`Theme` gains one group, with the same keys as `status` and `statusDot`:

```ts
/** Item bar fill per status when the item's resolved `bg` is the theme's item default (m2d Resolution 3). */
statusTint: { done: string; inProgress: string; atRisk: string; blocked: string; planned: string; neutral: string };
```

| Token | light | dark | grayscale |
|---|---|---|---|
| `done` | `#ecfdf5` | `#052e16` | `#ebebeb` |
| `inProgress` | `#eff6ff` | `#172554` | `#e4e4e4` |
| `atRisk` | `#fffbeb` | `#422006` | `#eeeeee` |
| `blocked` | `#fee2e2` | `#7f1d1d` | `#dcdcdc` |
| `planned`, `neutral` | `#f8fafc` | `#1e293b` | `#f5f5f5` |

`measureItem` applies `statusTint[key]` when `style.bg === theme.entities.item.bg` and `theme.status[key]` when `style.fg === theme.entities.item.fg`, on a copy of the style. Those defaults equal today's hard-coded constants in all three themes, and the values move verbatim, so the output is the same.

### 3.10 Byte-identity rules for every step

1. Keep each coordinate's arithmetic as written: the same operands in the same order. The renderer rounds to two decimals (`renderer/src/svg/xml.ts:54-58`), so a regrouped sum one ulp off can flip a value that sits on a half-cent.
2. Keep the order of side effects inside placement: entity-edge writes, flow keys, the `nextParallelId`/`nextGroupId` counters, the wave accumulator.
3. Drop a provisional value only where every path overwrites it before the model, and name the overwrite in the PR (N2, N4, N7).
4. Keep a stale read that the output depends on, under a name that says so (`estimatedRowsBottomY`, `naturalEndDate`), until its fix lands (F1, m6.s1).
5. Keep the model's key set: a field omitted when absent stays omitted.

### 3.11 Relation to R1, R3 and R4

- **R1** owns the day schedule and the start rules; R2 consumes them. The date-window phase is built on R1's API, and R2's item measure is the single place R1 m2.s3's duration read ends up.
- **R3** rewrites `collectItems` on `ast-walk.ts` (its m1.s3) and removes the `stripColon` copy at `roadmap-node.ts:1323-1325`; R2 only moves `collectItems` (m5.s5). Whichever lands second rebases.
- **R4**'s `stageRoadmap` calls `layoutRoadmap` with the same options; R2 changes nothing it sees.

## 4. Migration plan

Every step is one PR, independently mergeable, and passes these gates:

- **G1, sample renders.** Render every `examples/**.nowline` and `tests/*.nowline` sample directly with the CLI, on the base commit and on the step, in each built-in theme with `--now 2026-02-09`, and compare every render's SVG bytes and exit status: any difference fails the gate, wherever it falls in the list.
  ```sh
  git worktree add ../base origin/main && (cd ../base && make init build-fast)
  make build-fast
  (cd ../base && git ls-files 'examples/**.nowline' 'tests/*.nowline') >../samples.txt
  render_all() {  # $1 = checkout to render with, $2 = output directory
      rm -rf "$2" && mkdir -p "$2"
      while read -r f; do
          for t in light dark grayscale; do
              out="$2/${f%.nowline}.$t.svg"
              mkdir -p "${out%/*}"
              (cd "$1" && node packages/cli/dist/index.js "$f" --theme "$t" --now 2026-02-09 -o -) >"$out" 2>/dev/null
              echo "exit $?" >"$out.status"
          done
      done <../samples.txt
  }
  render_all ../base ../g1-base && render_all . ../g1-step
  diff -r ../g1-base ../g1-step
  ```
  (`diff -r` exits non-zero when any SVG or exit status differs, and lists every difference rather than the last. The sample list is the base's, so a sample the step deletes or breaks fails too. The gate does not use `make build`, which renders only the slugs listed in `scripts/render-samples.mjs` and `scripts/render-tests.mjs` and so skips `examples/continuation`, `examples/minimal.fr`, `tests/grammar-properties`, `tests/grammar-properties-include`, `tests/partner-multi` and `tests/waves-isolate-team`, and renders the seven include files under `examples/nested/` and `examples/waves-program/` only through their parents. At the commit that adds this spec all 180 renders exit 0, and two runs on that commit give identical trees, in about three minutes.)
- **G2, snapshots.** `make pre-commit` passes without `UPDATE_LAYOUT_SNAPSHOTS`.

No step touches an exporter or the schedule, so R1's G3 does not apply; a step that turns out to touch either runs G3 as [`scheduler-unification.md`](./scheduler-unification.md) §4 defines it. The probe of §1.2 shows that the corpus never exercises a region re-fit, a predictor mismatch or L2, so G1 cannot see a regression there: the steps that touch those add a unit fixture. No step adds a changelog fragment except where noted.

**Dependencies on R1.** A *hard* dependency needs an R1 API; a *soft* one only edits lines R1 also edits, so whichever lands second rebases. R1 §8 question 4 asks for R1 m1 and m2 before any R2 step that edits `RoadmapNode.place`; this plan follows it.

| R2 step | Needs R1 first | Kind | Why |
|---|---|---|---|
| m1.s1, m1.s2, m1.s4 | — | — | themes, types and helper moves outside `place` |
| m1.s3 | — | soft (R1 m2.s3) | R1 m2.s3 edits the duration reads in both loops; after m1.s3 there is one loop to edit |
| m2.s1, m2.s2 | — | soft (R1 m2.s3) | both move the item's duration read; after m2 it is one line in `measureItem` |
| m3.s1 to m3.s3 | R1 m1, m2 | soft | edit `RoadmapNode.place` and `LayoutContext`, which R1 m1.s3, m2.s1 and m2.s3 edit |
| m4.s1, m4.s2 | R1 m1, m2 | soft | edit `RoadmapNode.place` |
| m5.s1 | R1 m1.s3, m2.s1 | **hard** | the phase consumes `computeDateWindow(file, schedule, …)` and `LayoutOptions.schedule`; before them it would wrap engine B and be redone |
| m5.s2 to m5.s5, m6 | R1 m1.s3, m2.s1 | **hard**, through m5.s1 | built on the date-window phase; m5.s5 also moves the start rules after R1 m1.s4 |

No R2 step needs R1 m3 (tests) or R1's follow-ups. R1 F3 would make f2 rarer and R1 F4 would cut P1's passes; neither changes this plan.

### m1 - Seams that need no phase

#### s1 - Status tints become theme tokens

Add `Theme.statusTint` to `themes/shape.ts` and the three themes (§3.9); `sequenceItem` reads the tokens and compares with `theme.entities.item.bg`/`fg`, on a copy of the style. Test: per theme, a default item takes the tint of each status and an item with an explicit `bg:` keeps it. G1, G2.

#### s2 - One helper interface

Replace `SwimlaneNodeDeps`, `GroupNodeDeps`, `IncludeNodeDeps` and `ParallelNodeDeps` with `LayoutHelpers` (or a `Pick` of it); drop `sequenceItem`'s unused `ownerOverride`. No runtime change. G1, G2.

#### s3 - One row-track loop for lanes and groups

Add `nodes/row-track.ts` (`sequenceRowTrack`, §3.8); `SwimlaneNode` and `GroupNode` call it. Covered by the lane and group tests, `late-row-shifts` and the attach-geometry sweep. G1, G2.

#### s4 - Marker band and corridor helpers leave `roadmap-node.ts`

Move `packMarkerRow`, `markerLabelsRightX`, the run and exception entries and their ids into `nodes/marker-band.ts`, and `collectSlackCorridors` (`roadmap-node.ts:1144-1194`) into `nodes/milestone-node.ts`, beside the helpers it reuses. A move; the calls in `place` keep their names. G1, G2.

### m2 - Items are measured once

#### s1 - `measureItem` and the full `ItemNode.measure`

Add `nodes/item-measure.ts` with `measureItem` and the helpers it needs (`statusFromProp`, `resolveItemProgress`, `resolveItemMeta`, chip sampling, `computeChipBarExtra`, `collectItemFootnoteIndicators`, `resolveTitleFirstLineReserve`, `parseLinkIcon`); `ItemNode` takes the measure and returns the grown height from `measure` and `place`; `sequenceItem` measures, then places. Test: for every placed item in the corpus, `ItemNode.measure().height` equals the placed box height. G1, G2.

#### s2 - Derive the prediction from the measure

The row track calls `measureItem` at the predicted start, takes the desired end and the row pitch from it, and hands the measure to `sequenceItem`; delete `predictItemBarExtraHeight` and its `LayoutHelpers` slot; replace the two safety-net `max` calls with the pitch (equal by construction, asserted in a test). Unit fixtures for a wrapped title, a spilled chip column and a narrow-bar link spill, because the corpus never exercised a mismatch. G1, G2.

### m3 - Placement and its context

#### s1 - One `LayoutContext` builder

Add `createLayoutContext` (§3.8); `RoadmapNode.place` and `buildIncludeRegions` call it. G1, G2.

#### s2 - Footnotes indexed once

Split `buildFootnotes` into `indexFootnotes(footnotes)` (index and hosts, pure) and the panel; place indexes once, the panel is built once where P19 builds it today. G1, G2.

#### s3 - Placement stops reading the canvas

Lanes no longer set their width (N2), regions are fitted only after P8 (N4), and milestones no longer compute a provisional row and label box (N7, with `decideLabelBoxForCanvas`): `MilestoneNode.place` returns a `MilestonePlacement`, and the positioned milestone is built where P11 patches it today. `chartRightX` moves from `LayoutContext` into a `CanvasExtent` that `RoadmapNode.place` owns until m5.s4; the builders that read it after placement (`buildNowline`, `buildWaveLegend`, `buildFootnotes`) take it as an argument. Test: every milestone the model carries has a re-pack placement; the snapshot invariant (lanes span the canvas, regions stay inside it) still holds. Unit fixture for a region whose bars reach the canvas edge, because no sample exercises a re-fit. G1, G2.

### m4 - `HeaderNode`

#### s1 - Measure the header

Add `nodes/header-node.ts` with `HeaderNode.measure` (§3.7); move `sizeBesideHeader` there and drop it from `RoadmapNodeDeps`. The header-height and header-logo tests cover beside, above and every logo size. G1, G2.

#### s2 - Place the header

`HeaderNode.place` builds the header box, card, logo box and text inset from the measure and `estimatedRowsBottomY`. G1, G2.

### m5 - The four phases

#### s1 - The date-window phase

Add `phases/date-window.ts` with `resolveScope` and `resolveDateWindow` (§3.2); `computeDateWindow` moves there from `layout.ts` and leaves `RoadmapNodeDeps`. `date-window.test.ts` imports it from the new module. G1, G2.

#### s2 - The measure phase

Add `phases/measure.ts` with `measureRoadmap` (§3.3): axis, header bands, marker estimate through `MarkerBand`, timeline. G1, G2.

#### s3 - The place phase

Add `phases/place.ts` with `placeChart` (§3.4): context, seeds, footnote index, the barrier passes, the corridor rerun, the kept regions, the milestones, and the background wave tooltip set at placement (N5). The waves, wave-barrier and waves-byte-stability tests cover the passes. G1, G2.

#### s4 - The finalize context and the ordered pass

Add `phases/finalize.ts`: `FinalizeContext`, `CanvasExtent` with `freeze`, the scale and marker-band guards, and steps f1 to f16 as a constant table (§3.5); f1 moves to the head of finalize. Tests: the order check, the guards, and the coverage register (§6), seeded from §1.2. G1, G2.

#### s5 - The composition root shrinks

`RoadmapNode.place` is the four calls of §3.1. `collectItems`, `buildDependencies` and `buildNowline` move to `dependency-edges.ts` and `nowline-node.ts`, the start rules to `start-rules.ts`; `RoadmapNodeDeps` is deleted; `layout.ts` keeps `layoutRoadmap` and `LayoutOptions`. G1, G2.

### m6 - After the phases

#### s1 - *Behaviour:* reserve the now-pill row on an extended axis

f7 becomes `growHeaderRows` in full: when f2 brought `today` into the axis and the pill row is 0, the header rows grow by `NOW_PILL_HEIGHT_PX` above the tick panel, so the tick panel, wave strip, marker band and chart move down together, in the same shift as the marker-band growth; the new timeline y follows the beside-card rule of today's 511 rather than adding the height blindly (open question 2). Regression test from the L2 repro; no sample changes. Fragment `fixed`. G1, G2.

#### s2 - Update the specs

[`rendering-v2.md`](./rendering-v2.md) (the phases, which nodes measure, the header answer), [`rendering.md`](./rendering.md) where it describes the extension pass, [`waves.md`](./waves.md) §8.4 (the pass-loop order names the finalize steps), and the header comment of `renderable.ts`. Docs only.

## 5. Follow-ups outside this migration

Each changes rendered bytes, so none belongs to the byte-identical plan. Each is one PR with a deliberate snapshot bump and a changelog fragment.

| # | Change | Changes | Evidence |
|---|---|---|---|
| F1 | f15 passes the grown band's bottom, so the beside card hugs the header rows after f7 (L1) | the three samples whose band grows; two of them have snapshots (`dependencies.svg`, `marker-left-overflow.svg`), and `dependencies` has determinism goldens | §1.3 |
| F2 | Place the chart in local coordinates and translate it once in finalize, so f7's conditional shift disappears | possibly any sample: a translated sum can round differently (§3.10, rule 1) | §3.5 |
| F3 | After R1 F3 keeps pixel quirks out of the lane cursor, measure how often f2 still fires; if never on the corpus, report it as a layout insight instead of growing silently | whatever R1 F3 changes | [`scheduler-unification.md`](./scheduler-unification.md) §1.3 |

## 6. Test strategy

- **G1 and G2 on every step** (§4).
- **Coverage register** (m5.s4): `packages/layout/test/finalize-coverage.test.ts` lays out every sample through an internal trace hook on `FinalizeContext` and records which steps changed something (the canvas grew, the axis was extended, a lane width or a marker moved, the band grew), and compares the result with a committed `finalize-coverage.json` seeded from §1.2. A refactor that silently stops a step from firing fails; so does a sample edit that drops the last coverage of a step, which tells the author to add a fixture.
- **Order check** (m5.s4): the reads and writes of §3.5 are consistent; a test edits a copy of the table to move f4 before f2 and expects the check to fail.
- **Guards** (m5.s4): growing a frozen canvas, reading the canvas before f3, the final scale before f2 and the marker band before f5 each throw.
- **Measure equals placement** (m2): the placed height of every corpus item equals its measure; unit fixtures for the cases the corpus does not reach (§4).
- **Existing tests stay**: the #93 and #80 regressions in `layout.test.ts`, `positioned-shift.test.ts`, the attach-geometry sweep, the snapshot invariants in `snapshot.test.ts`, the header, logo, waves and working-calendar suites.
- **Theme tokens** (m1.s1): tsc enforces the group in all three themes; a test checks a default item's tint per status and theme, and that an explicit `bg:` wins.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A provisional value removed in m3.s3 was read somewhere after all | the overwrite of each is named (P9, P10, P11); G1; the snapshot invariant and the "every milestone has a placement" test |
| A regrouped sum flips a rounding | rule 1 of §3.10; G1 on 180 renders; F2 kept out of the plan |
| The corpus does not reach a step, so G1 is blind to it | the coverage register lists what each step is covered by; fixtures for region re-fit, predictor cases and L2 |
| Rebase churn with R1, which edits the same lines | the dependency table of §4; place-touching steps wait for R1 m1 and m2, as R1 asks |
| `FinalizeContext` turns into the next god object | it owns four mutable slots (scale, canvas, marker band, chart y) and a draft; each step is a small function with declared reads and writes |
| `Theme` is a published type, and a third party that builds its own `Theme` literal fails to compile | the change is additive; the DSL has no custom themes, and nothing in this repo builds a `Theme` outside the three built-ins |
| The guards throw in production | the order is static, so a guard fires only on a code change, and every layout runs every step in the tests |

## 8. Open questions for Gary

1. **Milestone ID.** `m4.14` for this work, after `m4.11` (R1), `m4.12` (R3) and `m4.13` (R4)? *Recommendation:* yes, and schedule it after R1 m2 as the review's priority order already implies.
2. **L2, the now-line on an extended axis.** Reserve the pill row and shift the chart (m6.s1 as written), or draw no now-line when `today` is outside the natural window and let NL.W1000 compare with the natural window too? *Recommendation:* reserve the row; the axis visibly covers today, so the line belongs there.
3. **F1, the beside card.** Fix it after m5, changing `dependencies`, `late-row-shifts` and `marker-left-overflow` and two snapshots? *Recommendation:* yes; the code's own comment says the card hugs the header rows.
4. **The last injected helper.** Keep `sequenceOne` injected, or import it and accept a runtime-safe ESM cycle between `group-node.ts`, `parallel-node.ts` and the dispatcher? *Recommendation:* keep it injected; one callback costs less than a cycle the next reader has to reason about.
