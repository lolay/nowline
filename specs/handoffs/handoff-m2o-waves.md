# Waves handoff: implementation plan (m2o)

> **Status: in progress (m2o).** Delivered as one PR with one commit per phase; the work is orchestrated as tasks. This handoff turns [`waves.md`](../waves.md) into a phased plan. It is self-contained: a fresh agent can pick it up without redoing the research behind it, which covered prior art, the scheduling engines, the renderer, the include resolver and the validator.

## 1. How to pick this up

1. **Scope is decided.** The maintainer adopted every recommendation in §9 (and `waves.md` §13): start floors ship in v1; include agreement is strict, comparing resolved floor dates; no column tint by default; MS Project and Mermaid stay AST-only; a single milestone, m2o.
   - [`../waves/README.md`](../waves/README.md) lists the feedback questions for the mockup. Read any answers that came back before you change the visuals.
2. **Re-verify code references.** Every `file:line` in this document was checked against commit `4f771b4` (October 2026), and §4.0 records what changed by `26129db`. Before you trust a line number, re-run the grep in that row of §4.
3. **Read `waves.md` §3–§9 before coding.** §5 (semantics), §6 (rules), §8 (layout) and §9 (rendering) are normative, and their normative parts are mirrored into `dsl.md` and `rendering.md`. The worked examples in §11 double as test fixtures.
4. **Gate every phase.** Run `make pre-commit` for each phase, and re-run it after any later edit (AGENTS.md). Use `make` targets only.
5. **Phase 0 is being done now.** It creates milestone m2o in `specs/milestones.md`, moves the spec to `specs/waves.md` and this handoff into `specs/handoffs/`, and mirrors the normative text into `dsl.md`, `rendering.md` and `ide.md`. Phases 1–7 follow, one commit each.

## 2. Milestones

The maintainer chose the single milestone (§9, question 5); Phase 0 adds it to `specs/milestones.md`. The split below is kept for reference only.

**Chosen: a single milestone, `m2o — Waves`.**

- DSL enhancements live in the m2 series by logical position, not by shipping date.
- `specs/milestones.md` already places m2l, m2m and m2n there, though they landed after m3c, and m2n (inline date pins) is labelled a "DSL enhancement".
- m2o is the next free letter.

**Optional split, not used:**

| Milestone | Phases | Ships |
|---|---|---|
| m2o — Waves: DSL and validation | 0–3 | grammar, AST, printer, validator, i18n, include rule 12. Files parse and validate; layout ignores waves. |
| m2p — Waves: layout and rendering | 4–5 | barrier scheduling in all three engines, strip, boundaries, background cues |
| m2q — Waves: exporters and tooling | 6–7 | XLSX, MS Project, Mermaid, LSP, TextMate, man pages, MCP vocabulary, examples |

The split is safe because m2o leaves wave-free output byte-identical, and a waved file still renders, just without barriers. If you split, add a temporary validator warning to m2o saying that waves are not yet laid out, and remove it in m2p.

**Text for `specs/milestones.md`, single-milestone form** (links are relative to `specs/`):

Summary-table row, inserted after the m2n row:

```
| m2o | Waves | Apache 2.0 | `wave <id> ["title"]` roadmap declarations and a `wave:` property on item / group / parallel: strict, sequential barriers spanning every swimlane (no item in wave k+1 starts before every item in wave k ends); items without a wave are background work, drawn hatched; optional constant start floors (`wave … after:<anchor | dated milestone | date>`); include rule 12 (every participating file declares the same waves, NL.E0202); least-fixpoint barrier pass in all three scheduling engines; wave strip, teal boundary lines, legend; XLSX `Wave` column + `Waves` sheet, MS Project wave-end tasks, Mermaid `section Waves`; codes NL.E1100–E1106, NL.W1100–W1101, NL.E0202, NL.W0701–W0702, NL.W1001–W1002, NL.I1006–I1007 (EN + FR) |
```

Details section, inserted after `### ~~m2n — Inline date pins~~`:

```
### m2o — Waves

Strict, sequential barriers that span swimlanes. Declared once (`wave build "Build"`), assigned with `wave:<id>` on item / group / parallel, inherited downward. A wave opens for every lane at the instant the previous wave's slowest member ends. Items with no wave are background work: never held back by a barrier, drawn hatched. Spec: [`specs/waves.md`](./waves.md) | Handoff: [`specs/handoffs/handoff-m2o-waves.md`](./handoffs/handoff-m2o-waves.md)
```

Dependency chain: insert `→ m2o` after `m2n` in the chain diagram. Then add one sentence to the paragraph about m2l, m2m and m2n saying that m2o is a DSL enhancement in the same logical position.

## 3. Decision log

Each decision below was made on purpose. Do not reopen one without new information.

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Name | `wave` | `phase` (may overlap, reads as a type of work, implies gate approval, collides with k8s status), `stage` (Stage-Gate approval, CRM status), `column` (a rendering term; collides with `scale` columns), `cycle`/`sprint`/`iteration`/`train` (fixed cadence; a non-goal), `batch`, `tranche`, `epoch`, `horizon` | Argo CD sync waves and AWS deployment waves have exactly this barrier; PMs know the word from migration planning. The spec opens with the strictness sentence, because migration waves often overlap. Full table: `waves.md` §2. |
| Sequencing | Strict total order by declaration; never concurrent, never overlapping | Overlap or lag; a wave dependency graph (`wave w3 after:w1`); concurrent wave tracks; order inferred from usage | A wave spans every lane, so it owns its stretch of time. Overlap makes the barrier advisory. A wave graph would be a second scheduler. Concurrency already has lanes, `parallel` and `group`. (`waves.md` §3.1) |
| Membership model | `wave:` property on item, group and parallel, inherited downward | Containment (waves holding items or lanes), a sticky property, a per-lane divider line, a wave block in a lane, member lists on the declaration | An item has one parent; containment breaks unique ids and include merge; sticky and position-based forms are invisible. (`waves.md` §3.3) |
| Items with no wave | Background work. **No diagnostic, no `wave:none` value.** | A warning per lane (NL.W1100 in the panel draft); an error; an explicit `wave:none` | The maintainer chose no warning. Background work is marked visually instead (next row). |
| Background visual | Hatch overlay on the bar plus dashed boundary crossings; members unchanged; a legend key | Dashed outline (collides with `border:dashed` author styles), reduced opacity (reads as done or disabled), a stripe on every member (marks the majority, adds clutter), a glyph (too subtle) | Mark the exception, not the rule. Hatch is the one visual channel the renderer does not use today. (`waves.md` §9.3) |
| Wave `after:` | Constants only: anchor, dated milestone, one ISO date | Other waves, items | Keeps waves sequential and cycle-free. A floor opens a labelled gap. |
| Wave `before:` / deadlines | Rejected on waves (NL.E1105); use a dated milestone `after:<wave>` | `before:` on a wave | Reuses the existing milestone overrun visual and adds NL.I1007. |
| `before:` on items | Soft, as today: painted overflow plus NL.I1003. A miss the structure guarantees gets the warning NL.W1100. | An error | Waves must never block a render because of a date miss. |
| Forward references | Ignored by layout, as today. Roadmaps with waves get NL.W1101. | Honouring them | Honouring them would change behaviour the moment a file gains its first wave line. |
| Include agreement | Ordered ids and resolved floor dates must match in every participating `merge` or `isolate` file, in both directions (NL.E0202). Presentation drift is a warning (NL.W0701). | Parent-wins merge; per-file waves; a shared `waves.nowline` provider | The user's requirement. Modelled on include rule 11 (`start:`). The provider pattern needs deferred validation and an LSP that resolves includes, so it was deferred (`waves.md` §12). |
| Multi-file pattern | Every participating file re-declares its waves | A shared provider file | Matches how `examples/nested/*` re-declares sizes and labels; every file stays standalone-renderable with full editor support. |
| Layout algorithm | Least fixpoint: rerun the existing lane loop with updated floors, at most n+1 passes. One driver serves engines A, B and C. | A wave-major segment walk (rewrites `SwimlaneNode.place`); a day-space pre-pass feeding pixel floors (not pixel-exact) | Smallest change, pixel-exact, byte-stable. (`waves.md` §8.1) |
| Engine divergences | Kept, and pinned by a test. No wave-only cursor rule. | Fixing them in this work | Fixing them is a separate PR with a deliberate snapshot bump. |
| Default look | No column tint. A strip with alternating cells, and 2 px teal boundaries under the bars. | Alternating column tint (four-tone checkerboard; unreadable in grayscale) | `style:` with `bg` opts a wave into a tint. |
| Milestone on a boundary | Keeps its diamond, drops its cut line | Drawing both lines | Two vertical lines in one place read as a bug (seen in the mockup). |
| Untitled `group wave:x` | Draws nothing | Today's default `bracket: solid` | Otherwise a slate `[` sits on every boundary. |
| CLI output | Unchanged: text mode prints warnings only when a run fails | Printing wave warnings on success | Rejected, so `cli.md` stays consistent. |
| Codes | E1100–E1106, W1100–W1101 (waves range); E0202 (include); W0701–W0702 (ignored input); W1001–W1002, I1006–I1007 (layout) | — | Next free codes as of `4f771b4` (§4.6). |

## 4. Codebase map (as of `4f771b4`; see §4.0 for `26129db`)

Condensed from four read-only research passes over layout, renderer, core plumbing and prior art. Re-verify line numbers before you edit.

### 4.0 Re-verified at `26129db`

The map below was written at `4f771b4`. It was re-verified at `26129db` (October 2026), and these are the differences that matter for waves. Line numbers elsewhere in §4 were not rewritten, so re-grep before you trust one. `waves.md` has already been corrected for every spec-level item.

**Layout**

- **`length:` is a minimum, not a cap.** Content past it grows the date window to the next tick boundary (CHANGELOG `[Unreleased]`, Fixed). Waves past `length:` grow the window like any other content. Floors are still computed from unclamped declaration dates (`waves.md` §5.3).
- **Arrow ports come from final boxes.** `LayoutContext` no longer has `entityVisualLeftX`/`RightX`; dependency-arrow and slack-arrow ports are derived from the final item boxes in `placedItems`. A barrier pass therefore resets `placedItems` and `itemFlowKey` along with the entity edge maps.
- **Pass loop placement.** The loop wraps `runSwimlaneLoop` plus the region pass inside `RoadmapNode.place`, and must finish before, in order: the slack-corridor rerun, `growChartRightX` and the final region placement, the post-placement extent growth (which measures bars and markers, grows the date window and replaces `ctx.scale`), and the marker re-pack with its `deltaY` shift. `buildWaves` runs after all of those. Every pass, including the slack rerun, resets the edge maps to the anchor and dated-milestone baseline and re-seeds the wave edges. Slack corridors are collected only after convergence (`waves.md` §8.4).
- **Pass count is an upper bound.** By the end of pass p, at least `E_1..E_p` are exact; floors can make later waves exact sooner. The example counts (4, 3, 2) come from running the algorithm (`waves.md` §8.3).
- **Layout insights see only the positioned model** and walk lanes only. Hence the new `PositionedRoadmap.waveSolve?: { passes, capped }` for NL.W1002, and NL.W1001 must also be collected from include-region items (`waves.md` §8.7).

**i18n**

- `MessageArgs<K>` is inferred from the parameters of the en-US message function (`packages/core/src/i18n/index.ts`). There is no message-variant pattern yet: model variants as one function taking a discriminated `{ reason, … }` argument.

**Renderer**

- `<defs>` is always emitted (shadow filters, arrowheads). Byte stability therefore means no new `<defs>` children, not no `<defs>`; the hatch patterns go inside the existing element, with ids `${idPrefix}-wave-hatch-dark` / `-light` (the embed tests forbid ids shared across SVGs).
- Tests treat the first `<rect>` in an item `<g>` as the bar, so the hatch overlay is a second rect drawn after it, inset by half the stroke width with the same corner radius.
- The group bracket dash is `3 2`, not `3 3` (§4.3 is corrected); the parallel bracket dash is `3 3`.
- `@kittl/svg-to-pdfkit` 0.1.12 supports `<pattern>` fills, so the PDF path should draw the hatch without the stripe fallback. Keep the PDF test.

**Tests and gates**

- There are 14 SVG snapshots, not 12. The determinism gate is not part of `make ci`: run `make compile TARGET=local`, then `make determinism`.
- No theme contrast tests exist yet; Phase 5 adds the first ones.
- `snippets.test.ts` allows choice lists only for `scale`, `status` and `size`, so a `wave` snippet uses plain placeholders.
- `attach-geometry`, `caption-clearance` and `container-glyph-clearance` sweep every top-level file in `examples/` and `tests/`, so new wave fixtures are swept automatically and must pass them.

**CLI**

- The CLI does not call the resolver itself; resolver errors reach it through `@nowline/export`. Coded resolver diagnostics will travel on a typed error and be reported like validator diagnostics (localized, `--diagnostic-format json`, exit 1). Uncoded include errors keep today's behaviour exactly (exit 3, same message).

**Docs**

- The §7 findings are all resolved (#73, #74). `principles.md:45` and the `README.md` Entities table were fixed there, so Phase 0 and Phase 7 no longer carry those fixes.

### 4.1 Scheduling: three engines

| Engine | Units | Entry point | Used for |
|---|---|---|---|
| **A. Pixel layout** (source of truth) | px | `layoutRoadmap` `layout.ts:1535` → `RoadmapNode.place` `nodes/roadmap-node.ts:132` → `runSwimlaneLoop` `roadmap-node.ts:426-449` → `SwimlaneNode.place` `swimlane-node.ts:209` → `resolveChildStart` `layout.ts:972-1000` and `sequenceItem` `layout.ts:207-783` → `GroupNode.place` `group-node.ts:81`, `ParallelNode.place` `parallel-node.ts:41` | SVG and the positioned model |
| **B. Day-space extent** | days | `computeContentEndDay` `layout.ts:1190-1339`, called from `computeDateWindow` `layout.ts:1114-1153` | Time-axis domain only |
| **C. Day-space schedule** | days → Date | `scheduleRoadmap` `schedule.ts:72-216` | XLSX exporter only (`export-xlsx/src/index.ts:68`) |

**Pass structure (all three engines).**

- There is one forward pass. Lanes run in declaration order, children in document order. There is no topological sort and no fixpoint.
- The only rerun is the slack-corridor second pass (`roadmap-node.ts:463-482`).
- That rerun resets the entity maps to the anchor and dated-milestone baseline (`roadmap-node.ts:410-412, 465-477`).

**The interleaving failure that makes waves need a fixpoint.** Lane `a` (a1 w1 2w, a2 w2 1w) is placed before lane `b` (b1 w1 4w). a2 needs `barrier = max(a1.end, b1.end) = 4w`, but b1 hasn't been placed yet, so a2 lands at 2w.

**Engine A data.** `LayoutContext` (`layout-context.ts:50-156`) holds:

- `entityLeftEdges` and `entityRightEdges` (`:71-72`): the logical boundaries that `after:` and `before:` read;
- `placedItems`: every placed item by draw key; dependency-arrow and slack-arrow ports are derived from its final box when arrows are built (`item-port-geometry.ts`). A ref that is not a placed item (anchor, milestone, group, parallel, wave) reads `entityRightEdges` for its x;
- `itemFlowKey` and `currentFlowKey` (`:103, :111`);
- `slackCorridors` (`:128`) and `markerRowPlacements` (`:135`);
- `chartTopY`, `chartBottomY`, `swimlaneBottomY` and `chartRightX` (`:136-147`).

Items register their edges only when they have an explicit id (`layout.ts:683-686`).

**Start precedence in engine A.**

- `resolveChildStart` (`layout.ts:972-1000`) resolves `date:` ?? `start:` (through `forwardWithinDomain`), then `after:`, then `seqDefault`.
- `sequenceItem` (`layout.ts:239-257`) resolves `date:`, then `max(cursor.x, …after refs)`.
- Parallel children reach `sequenceItem` directly (`parallel-node.ts:64-69`).

**Engine B and C data.** Maps `itemEnd`, `anchorEnd` and `milestoneEnd` (`schedule.ts:86-88`; `layout.ts:1199-1201`). `resolveAfterDay` returns **0 for unknown refs** (`schedule.ts:98-105`).

**Divergences between A and B/C**, all pre-existing:

| # | Divergence | Where |
|---|---|---|
| a | In A, `after:` is not floored by the lane cursor; C uses `max(prevEnd, after)` | `layout.ts:997` vs `schedule.ts:143` |
| b | The `MIN_ITEM_WIDTH` 8 px clamp makes short items end later in A | `layout.ts:259`, `shared.ts:67` |
| c | Group caption spill leaks into the lane cursor, through `blockEnd = box.x + box.width` | `swimlane-node.ts:279`, `group-node.ts:219-225` |
| d | 8 px `TRACK_BLOCK_TAIL_GUTTER_PX` after group tracks inside a parallel | `group-node.ts:226` → `parallel-node.ts:72`; `shared.ts:104` |
| e | `after:` on a group nested in a parallel: honoured in C, ignored in A | `group-node.ts:85`; `schedule.ts:166-177` |
| f | A uses a monotone `timeCursorX`; B and C use the last child's `prevEnd` | `swimlane-node.ts:262`; `schedule.ts:120-124` |

**Silently ignored today** (relevant to NL.W1101 and to the order check):

- **Forward references.** An `after:` target in a later lane, or later in the same lane, is a map miss in A (`layout.ts:253, 994`) and resolves to 0 in B and C. The validator only checks that the id exists (`nowline-validator.ts:1580-1605`).
- **Floating milestones.** `after:` or `before:` pointing at a floating milestone is never seen: floating milestones are resolved after all lanes (`buildMilestones` `roadmap-node.ts:524`).
- **Swimlane `after:`.** It is specified (dsl.md) but not implemented in any engine.
- **Isolated regions.** Their anchors and milestones are never positioned (`include-node.ts:120`), and their items are excluded from dependency edges (`roadmap-node.ts:650`).

**Hook points for waves**

- **Floors:** `resolveChildStart` (`layout.ts:972`), `sequenceItem` (`layout.ts:239-257`), the swimlane block start (`swimlane-node.ts:270, 292`), group children (`group-node.ts:125, 152`), `firstChildStartX` (`swimlane-node.ts:183`), and the container starts (`group-node.ts:85`, `parallel-node.ts:45`).
- **Accumulating member ends:** at the item logical end (`swimlane-node.ts:322`, `layout.ts:732`).
- **Pass loop:** around `runSwimlaneLoop` and the region pass (`roadmap-node.ts:426-513`).
- **Extent:** `computeContentEndDay` must apply barriers. The ticks cover only the domain (`view-preset.ts:139-158`).

**Isolated regions.**

- `buildIncludeRegions` (`include-node.ts:62-172`) runs **after** the main lanes, with a fresh `childCtx`: empty entity maps, empty marker placements and empty slack corridors (`include-node.ts:76-115`).
- It shares `timeline`, `scale`, `calendar` and `bandScale` with the host.
- Engine B recurses into regions with fresh maps (`layout.ts:1318-1331`); engine C ignores regions.

### 4.2 Header geometry and the positioned model

**Header row stack** (`roadmap-node.ts:214-312`), top to bottom:

| Row | Height | Source |
|---|---|---|
| now-pill | `NOW_PILL_HEIGHT_PX` = 16 | `shared.ts:197`; only when today is in range |
| tick panel | `TIMELINE_TICK_PANEL_HEIGHT_PX` = 24 | `shared.ts:89`; 0 when `timeline-position:bottom` |
| marker rows | `rows × MARKER_ROW_PITCH_PX` (26) | `marker-geometry.ts:19` |
| gap | 8 | `roadmap-node.ts:299-300` |

The chart starts at `chartTopY = timelineY + headerRowsHeight + 8` (`roadmap-node.ts:380`).

**The renderer draws the marker-row panel at `tickPanelY + tickPanelHeight`** (`render.ts`, `renderTimeline`), not from `markerRow.y`. Inserting the strip means changing that computation as well as the layout math.

**Marker re-pack.** A pre-pack runs before the lanes (`roadmap-node.ts:291-298`); a unified re-pack runs after floating milestones (`roadmap-node.ts:526-569`, `packMarkerRow` `:876-949`). If the re-pack needs more rows, everything below shifts by `deltaY` (`roadmap-node.ts:596-629`). **Build `PositionedWave` after this shift.**

**Cut lines.** `cutTopY = ctx.chartTopY`, `cutBottomY = ctx.swimlaneBottomY` (`anchor-node.ts:57-58`, `milestone-node.ts:245-246`).

**Positioned types** (`packages/layout/src/types.ts`), with the shapes to mirror:

- `PositionedSwimlane` (`:410-450`: `bandIndex` drives tint alternation);
- `PositionedLaneUtilization` / `PositionedUtilizationSegment` (`:469-491`: x-ranged segments);
- `PositionedMilestone` (`:517-536`);
- `PositionedTimelineScale` (`:133-174`);
- `PositionedRoadmap` (`:618-641`).

**Floating milestones.** `centerX` is the maximum of the predecessors' **visual** right edges, which sit 6 px left of the logical edge (`milestone-node.ts:49-65, 179-184`).

**There are no multi-row headers.** `rendering-v2.md` describes `HeaderRow[]`, but `ViewPreset` is single-row (`view-preset.ts:22-29`).

### 4.3 Renderer and themes

**Z-order in `renderSvg`** (`render.ts:2112-2236`):

1. defs (`:2126-2138`)
2. background
3. `renderTimeline` (`:2156`)
4. `renderSwimlaneBg` (`:2161`)
5. `renderGridLines` (`:2167`, function `:562-627`; major lines start at `tickPanelY`)
6. under-bar edges (`:2177`)
7. lanes (`:2182`)
8. include regions, with an opaque fill (`:2187`)
9. edges (`:2192`)
10. cut lines (`:2198-2199`, bare `<line>` elements)
11. markers (`:2202-2203`)
12. now-line (`:2206`)
13. footnotes, header, attribution and logo

**Elements to reuse or mirror.**

- **Lane background:** one opaque rect, `rowTintEven`/`rowTintOdd`, with its stroke acting as the separator (`renderSwimlaneBg` `:1437-1453`).
- **Group:** `fill-opacity` 0.18 (`renderGroup` `:1182-1310`). The default themes give groups `bracket: 'solid'` (`:1253-1285`), so unstyled groups are **not** invisible today.
- **Include region:**
  - its rect sits at `box.x + 8`, `width − 16`, dashed (`renderIncludeRegion` `:1843-1974`);
  - its opaque fill hides earlier layers, so the wave layers must be re-emitted inside it;
  - its source-path halo (`:1944-1952`) is the precedent for label halos.
- **Hatching and patterns:** the renderer has no `<pattern>` and no hatching anywhere. This is why hatch was chosen for background work.

**Dash patterns already in use.** Author `border:` styles (`strokeDash`, `:469`), group brackets (`3 2`), parallel brackets (`3 3`), anchor cut lines (`1 3`), milestone cut lines (`ACCENT_DASH_PATTERN` `6 4`, `shared.ts:182`), slack arrows (`3 3`) and overflow edges (`4 2`).

**Themes.**

- The renderer reads only `model.palette`, with no `theme ===` branches (`render.ts:2119`).
- The `Theme` interface lives in `themes/shape.ts:34-216`, and tsc enforces it on `light.ts`, `dark.ts` and `grayscale.ts`.
- These tokens are dead (declared but never read): `swimlane.bandEven`, `bandOdd`, `separator`, `frameTabText`, `frameTabMuted`.
- `layer` attributes are asserted in `renderer/test/render.test.ts` and in the CLI integration tests.

### 4.4 Grammar, validator, printer

**Grammar** (`packages/core/src/language/nowline.langium`).

- **Where the new declaration goes.** The `RoadmapEntry` alternation is at `:70-73`. Copy the shape of `SizeDeclaration` / `StatusDeclaration` (`:101-109`).
- **Property keys need no grammar change.** `PROPERTY_KEY_WITH_COLON` (`:204`) wins on longest match, and `NowlinePropertyKeyValueConverter` strips the colon (`nowline-module.ts:32-43`).
- **Keyword precedent.** `'person'` is listed in `PropertyAtom` (`:173-174`) and `StylePropertyValue` (`:53-54`) because the lexer prefers keywords over `ID`. `wave` needs the same treatment, plus an `EntityName` rule for name slots.
- **Do not hand-edit the generated parser.** `packages/core/src/generated/` is regenerated by `prebuild`/`pretest`.

**Validator** (`packages/core/src/language/nowline-validator.ts`).

| Thing | Where | Note for waves |
|---|---|---|
| `ENTITY_KNOWN_PROPS` | `:232-279` | Add `WaveDeclaration: {after}` and `wave` on Item/Parallel/Group. Otherwise every `wave:` gets NL.W0700 (`checkUnknownEntityProperties` `:1204-1234`). |
| `registerValidationChecks` | `:461-578` | Register the WaveDeclaration checks (pattern: Size/Status `:561-572`) plus the file-scope `checkWaves`. Do **not** register `checkEntityIdOrTitle` for waves; it would duplicate E1100. `GroupBlock` does not register it either: anonymous groups are valid. |
| `DEFAULT_ENTITY_TYPES` / `DEFAULT_BANNED` | `:177-212` | `DEFAULT_BANNED` is typed `Record<DefaultEntityType, …>`. Leave `DefaultEntityType` unchanged; `wave` on default lines is handled in the wave rules. |
| `checkPropertyValues` | `:757-999` | No `wave` case. The list form is checked only in the wave rules. |
| `checkForwardReferences` | `:1512-1566` | The `size:`/`status:` model, "declared earlier than the top-level entry". `wave:` follows the same model. |
| `checkReferenceResolution` + `collectReferenceableIds` | `:1580-1605`, `:2115-2138` | `addEntry` adds every top-level entry's `name`, so wave ids become valid `after:`/`before:`/`on:` targets **with no code change**. Layout must actually honour them, through the seeds. |
| `checkInlineDatePins` | `:1621-1684` | Allow inline dates on a wave's `after:`. Skip E0411 on a wave's `before:`. |
| `checkCircularDependencies` | `:1687-1776` | A WHITE/GRAY/BLACK DFS over `after:`/`before:` edges, reporting an uncoded error. Skip a wave's own `after:` edges. It cannot see barrier edges, which is why E1103 exists. |
| `registerEntity` | `:2036-2062` | Add an `isWaveDeclaration` branch, so that E0300 covers waves. |
| `acceptTr` | `:448-459` | Use it for every new coded diagnostic. Many older checks still use uncoded `accept`. |

**Include resolver** (`packages/core/src/language/include-resolver.ts`).

- **`resolveFile`** (`:185-294`) seeds the parent first (`:209-212`), which is why the parent wins, then processes includes depth-first.
- **Children are parsed with `validation:false`** (`:316`). That is why wave S and P rules must run in the resolver for children.
- **Roadmap modes.** `applyRoadmapMode` (`:347-388`) handles `ignore` (returns), `isolate` (pushes an `IsolatedRegion`, `:358-366`) and `merge` (`mergeContentMap` per kind, `:376-384`).
- **Collisions.** `mergeContentMap` (`:410-429`) warns on every key collision, even when both entries are the same object, as in a diamond. Waves must bypass it entirely.
- **The rule-11 `start:` check** (`:273-287`, with `readStartProp` `:46-52` and `formatStartMismatch` `:54-66`) is the template for rule 12.
  - It is **uncoded**: `ResolveDiagnostic` is `{severity, message, sourcePath, line?}` (`:104-109`), and the message is hard-coded English.
  - Consumers: the browser `fromResolveDiagnostic` sets `code: 'include'` (`packages/browser/src/diagnostic-row.ts:81-90`); the export kernel throws on any error (`packages/export/src/index.ts:277-283`); MCP checks severity (`packages/mcp/src/diagnostics.ts:148`).
- **Caching.** The `processed` cache (`:122`) stores each file's `{config, content}`.
- **Placement of rule 12.** Run it after the include loop, not beside the `start:` check, so that it does not depend on include order.
- **Content maps and helpers to extend:**
  - `ResolvedContent` (`:80-92`);
  - `emptyContent` (`:134-147`);
  - `collectExplicitRoadmapIds` (`:458-496`);
  - `addRoadmapEntry` (`:557-581`).

**i18n** (`packages/core/src/i18n/`).

- **Ranges** are listed in the header comment of `codes.ts` (`:1-22`).
- **Every code appears in three places:** the `MessageCode` union, `ALL_CODES`, and `messages.en.ts`. The `messages-coverage.test.ts` test enforces it.
- **`messages.fr.ts`** may omit keys, which then fall back to en-US. The m2n precedent shipped French anyway; U+00A0 punctuation spacing applies.
- **Codes free as of `4f771b4`:** the whole E11xx/W11xx range, plus E0202, W0701, W0702, W1001 and I1006. Allocated today:
  - E0001–E0005, E0100–E0104, E0200–E0201, E0300–E0301;
  - E0400–E0408 and E0410–E0413 (E0409 is a gap);
  - E0500–E0505, E0600;
  - W0700, W1000, I1000–I1005.

**Printer and JSON** (`packages/core/src/convert/`).

- **Printer.** The `roadmapEntry` switch (`printer.ts:133-156`) throws `Unknown roadmap entry type` by default (`:153-154`), so the wave case must ship with the grammar. `KEY_ORDER` is at `:4-25`; unknown keys sort alphabetically after the known ones.
- **Schema.** `schema.ts` `serializeNode` is generic, and `NOWLINE_SCHEMA_VERSION = '1'` (`:4`).
- **Round-trip.** The allow-list is in `packages/cli/test/convert/roundtrip.test.ts:10-16`. The CLI copies of `printer.ts` and `schema.ts` are re-exports only; CONTRIBUTING's "update `packages/cli/src/convert/printer.ts`" is stale.
- **JSON-hash risk.** The determinism `json` format serializes the AST key by key (`packages/export/src/index.ts:170-199`). A new `RoadmapEntry` alternative is safe. A new array on an existing AST node type would change every JSON hash.

**Layout's view of the AST.** `propValue` and `propValues` (`packages/layout/src/dsl-utils.ts:10-22`) are generic, so `propValue(item.properties, 'wave')` works as is.

### 4.5 Editor, docs and agent tooling

| Surface | Where | Change |
|---|---|---|
| LSP references | `packages/lsp/src/references/ast-utils.ts`: `REFERENCE_PROP_KEYS` `:61-74`, `NamedEntity` `:123-140`, `collectNamedEntities` `:180-196`, `declarationAt` `:307-322` | Add `wave`. This drives definition, hover, references, rename and completion. |
| Completion | `packages/lsp/src/providers/completion.ts`: `REF_KEY_TO_KINDS` `:29-42`, `kindFor` `:171-202` | Add wave kinds. |
| Symbols / hover | `providers/document-symbols.ts:83-94`, `providers/hover.ts:68-77` | Add a wave symbol and wave hover facts. |
| TextMate | `grammars/nowline.tmLanguage.json`: keyword regex `:52`, property-key regex `:59` | Use a separate start-of-line `wave` pattern. Then sync with `packages/vscode-extension/scripts/sync-grammar.mjs`; never edit the copy. |
| Snippets | `packages/vscode-extension/snippets/nowline.json` | Add `wave` and `item-wave`. |
| Man pages | `packages/cli/man/nowline.5`: ROADMAP SECTION `:509` (`.Ss milestone` `:783`), ITEM PROPERTIES `:919`, Dependencies `:1303`, References `:1410`, Includes `:1561` (`start:` text `:1603-1615`), Defaults `:1639`, EXAMPLES `:1684`. Also `packages/cli/man/fr/nowline.5`. | `nowline://reference` is generated from the man page (`packages/mcp/scripts/bundle-resources.mjs:17-19`). |
| MCP vocabulary | `packages/mcp/src/schema-vocab.ts` (`entityTypes` `:25-38`, `itemPropertyKeys` `:44-57`), `packages/mcp/src/reference-cheatsheet.ts` | Hand-maintained; this is the anti-hallucination list. `nowline://examples` bundles every top-level `examples/*.nowline` automatically. |
| Keyword lists in docs | `specs/dsl.md:15` (count), `:49` (prose), `:170-187` (table); the `README.md` Entities table | `dsl.md` in Phase 0; `README.md` in Phase 7. `principles.md:45` already points at Design Rule 1 and needs no change. |

### 4.6 Exporters

| Package | Consumes | Wave mapping |
|---|---|---|
| `export-html`, `export-pdf`, `export-png` | the SVG | Free. Check that the PDF path (`@kittl/svg-to-pdfkit`) draws the hatch `<pattern>`. |
| `export-xlsx` (`src/index.ts:53-95`, `ITEM_HEADERS` `:131-149`) | AST plus engine C | A `Wave` column, and a `Waves` sheet. Engine C must apply barriers, or Start/End will disagree with the SVG. |
| `export-msproj` (`src/index.ts:82-226`, `emitTask` `:347-373`) | AST only; emits only explicit `after:` (`:333`) | Wave-end milestone tasks, plus FS links. |
| `export-mermaid` (`src/index.ts:97-159`; `section Anchors` `:118-127`; `startTokenFor` `:315-319`) | AST only | `section Waves`, with wave-end milestones dated from engine C. |

### 4.7 Gates and fixtures

- **SVG byte snapshots.**
  - 14 files under `packages/integration-tests/test/__snapshots__/*.svg`, listed in `SAMPLES` (`snapshot.helpers.ts:74-95`), rendered with `FIXED_TODAY = 2026-02-09`.
  - Regenerate only deliberately, with `UPDATE_LAYOUT_SNAPSHOTS=1`.
  - `packages/layout/test/__snapshots__/` does not exist.
- **Determinism goldens.**
  - `packages/integration-tests/determinism/{spec.ts, hashes.json}`, with fixtures at `spec.ts:97-155`.
  - `UPDATE_DETERMINISM_GOLDENS=1` rewrites the whole map. Build the compiled binary first, and check that the diff contains only additions.
- **Rendered manifests.** `scripts/render-samples.mjs` and `scripts/render-tests.mjs` render only the files they list.
- **Patterns to copy for tests.**
  - `packages/core/test/include/include.test.ts` R5 block (`:167+`, using `makeFs` and `parseAtPath`);
  - `packages/core/test/validation/inline-date-pins.test.ts`;
  - `packages/layout/test/schedule.test.ts`, with its `buildSchedule` helper;
  - `packages/layout/test/helpers.ts` `parseAndResolve`.

### 4.8 How the mockup was made

`samples/checkout-relaunch.svg` is today's renderer output with the wave visuals spliced in. A future agent can reproduce it, or replace it with real output once Phase 5 lands.

1. **Write a wave-free equivalent of the sample.**
   - Use the same lanes and items, but drop the anonymous group, because it draws nothing.
   - Give each lane's first item in waves 2 and 3 the undocumented `date:` pin at the barrier date: Feb 16 and Apr 13. `date:` pins draw no glyph, and they sidestep the forward-reference loss.
   - Give the milestones `date:` values on the boundaries.
2. **Lay out the equivalent** with `@nowline/core`, `@nowline/layout` and `--now 2026-03-09`.
3. **Shift the model.** Move every y at or below `tickPanelY + tickPanelHeight` down by 20, and grow every box that straddles that line.
4. **Render, then edit the SVG:**
   - move the marker-row panel rect down by 20;
   - insert the strip after the `timeline` layer;
   - insert the boundaries and labels after the `grid` layer;
   - delete the milestone cut lines that sit on boundaries;
   - add the hatch pattern and its overlay on the `on-call` bar, plus the crossings;
   - add the legend before the attribution.
5. **Rasterize** with `exportPng` from `@nowline/export-png` at scale 2, so the PNG uses Nowline's bundled fonts.

## 5. Phased plan

Each phase is one PR and ends with `make pre-commit` green.

### Phase 0: Fold the spec in and create the milestone

**Files**

- **`specs/milestones.md`:** paste the §2 text.
- **Move the proposal files:**
  - this handoff → `specs/handoffs/handoff-m2o-waves.md`;
  - `waves.md` → `specs/waves.md`, with Status Accepted;
  - samples → `examples/` in Phase 7. Remove `specs/waves/` once it is empty.
  - Fix the relative links in both moved files: `../dsl.md` becomes `./dsl.md`, and `./handoff.md` becomes `./handoffs/handoff-m2o-waves.md`.
- **`specs/dsl.md`:**
  - Design Rule 1 count ("currently 22");
  - File Structure prose (`:49`);
  - the Roadmap Keywords table;
  - a new `### Wave Declaration` section after "Status Declaration";
  - the Item and Parallel/Group property tables;
  - Dependencies and Anchoring (wave ids as targets);
  - rules 24, 24a, 25 and 27;
  - value rule 15 (`wave:` forward declaration);
  - structural rule placement;
  - the banned-on-default text;
  - the include category table and Collision Handling (waves exempt);
  - new include rule 12;
  - a `### Wave rules` subsection;
  - the "Unstyled group" text (the default bracket, and the `wave:` group exception).
- **`specs/rendering.md`:**
  - the Positioned Model list (`:28-45`);
  - Timeline Scale (the strip row);
  - a new `### Waves` section: strip, boundaries, milestone-on-boundary rule, background hatch, legend, styled waves, include re-emit;
  - the Styles table;
  - the wave token table, styled like `:364-370`;
  - XLSX (the `Wave` column and Sheet 6, "Waves");
  - MS Project;
  - Mermaid.
- **`specs/ide.md`:** the keyword and autocomplete rows.

**Exit:** the maintainer has approved the open questions (§9), and a second reviewer has re-derived every example table in `waves.md` §11.

**Exit status (met).** The maintainer adopted every §9 recommendation. An independent re-derivation of every valid §11 table found no numeric mismatches.

### Phase 1: Grammar, AST, printer

**Files**

- **`nowline.langium`:**
  - add `WaveDeclaration`;
  - add `EntityName returns string: ID | 'wave'`;
  - change every `name=ID` to `name=EntityName`, and `PersonMemberRef` to `ref=EntityName`;
  - add `'wave'` to `PropertyAtom`, `StylePropertyValue` and `BlockPropertyValue`.
- **Regenerate** through `make build-fast`.
- **`printer.ts`:** add the `WaveDeclaration` case, and put `'wave'` in `KEY_ORDER` between `'owner'` and `'after'`.
- **`CHANGELOG.md` `[Unreleased]`:**
  - `### Added`: the `wave` declaration and the `wave:` property;
  - `### Changed`: stray `wave:` keys now get NL.W0702 instead of NL.W0700, and the NL.E0411 text changes.

**Tests that fail without the change**

- `packages/core/test/parser/keywords.test.ts`: the wave declaration forms.
- New `packages/core/test/strings-and-ids/wave-identifier.test.ts`:
  - every bare-word use in `waves.md` §4.7 still parses;
  - `wave-1`, `waves` and `wave:` lex as expected;
  - the parser self-analysis (`skipValidations: false`) reports no definition errors, and a `console.warn` spy shows no ambiguity warnings;
  - the residual ambiguity in `waves.md` §4.7 is pinned by tests.
- `packages/cli/test/convert/printer.test.ts`:
  - a wave declaration prints;
  - `item a duration:2w owner:sam wave:w1 after:x` round-trips in canonical order;
  - `wave:[w1]` prints as `wave:w1`.

**Exit:** every existing parser, printer and round-trip test passes, and the determinism `json` hashes are unchanged.

### Phase 2: Wave rules, validator, i18n

**Files**

- **New `packages/core/src/language/waves.ts`, exported from `src/index.ts`:**
  - `ownWaves`, `effectiveWave`, `leadWave` and `waveFloorDate`;
  - `checkWaveDeclarations` (the S rules: E1100, E1105, E1106);
  - `evaluateWaveProperties` (the P rules: E1101, E1102, E1104, W0702, and rule 23 for `wave` on default lines);
  - `evaluateWaveOrder` (the G rules: E1103 with every variant, W1100, W1101), walking in layout order with `resolve(r, v)` and suppressing cascades.
  - Every rule returns findings shaped `{ severity, code, args, node, property? }`.
- **`nowline-validator.ts`:** the changes listed in §4.4.
- **`codes.ts`, `messages.en.ts` and `messages.fr.ts`:**
  - the codes: E1100–E1106, W1100–W1101, E0202, W0701, W0702, W1001, W1002, I1006, I1007;
  - the range comment;
  - message variants keyed by a `reason` argument;
  - the new NL.E0411 text.

**Tests that fail without the change**

- New `packages/core/test/validation/waves.test.ts`:
  - one case per rule, WV1–WV12;
  - Examples 13, 14, 15, 20 and 21 with their exact diagnostics, including the a3 run folding and no suggestion for `w9`;
  - zero diagnostics for Examples 1–6 and 8–12, the W1101 pair for Example 7, and both Example 13 fixes clean;
  - the `join` variant;
  - the container forms of `after-item` and `after-wave`;
  - a parallel block with no id or title, named by position;
  - precedence: no E0411 on a wave's `before:`, no double report for `wave w2 after:nope`;
  - `wave w2 after:gate` together with `milestone gate date:… after:w2` gives no cycle error;
  - **an item with no wave in a roadmap with waves produces no diagnostic**.
- `messages-coverage.test.ts` passes.
- `inline-date-pins.test.ts`: a wave's `after:DATE` is accepted, and E0410, E0412 and E0413 fire on waves.

**Exit:** the validator's output over `examples/` and `tests/` is byte-identical to the baseline.

### Phase 3: Include resolver and coded resolver diagnostics

**Files**

- **`include-resolver.ts`:**
  - optional `ResolvedContent.waves`, seeded from the file's own valid waves; waves bypass `mergeContentMap`;
  - wave ids added to `collectExplicitRoadmapIds`;
  - title-only slugs that equal a wave id are re-keyed;
  - recorded include edges, with a post-loop rule-12 pass: the four E0202 variants, plus W0701;
  - `ResolveDiagnostic.code?` and `args?`;
  - S and P rules for participating children; WV2 collisions across files; G once per layout scope, skipping findings that lie entirely inside the root.
- **`waves.ts`:** `buildWavePlan(resolved)` and `localizeResolveDiagnostic(locale, d)`.
- **Consumers:**
  - the CLI render and serve commands (`packages/cli/src/commands/render.ts`, `serve.ts`): coded resolver diagnostics go through the validator formatter and exit `ValidationError`;
  - the export kernel throws a typed error carrying the diagnostics;
  - the browser `diagnostic-row.ts` uses `code ?? 'include'`;
  - the MCP `validate` tool includes the coded diagnostics.

**Tests that fail without the change**

- A new `describe('R6: wave agreement across includes')` block in `include.test.ts`:
  - Examples 16, 17, 18 and 19;
  - zero wave shadow warnings in a diamond;
  - include-order independence;
  - `roadmap:ignore` and vocabulary-only children exempt;
  - a lanes-only child participates;
  - `parent-none`;
  - floor mismatch, and two textually different floors with the same resolved date passing;
  - a cross-file barrier chain reports E1103 with the child's path and line.
- `cli.render.test.ts`: a coded resolver error exits 1, with `file:line`; a fixture without waves has identical exit code and stderr bytes.

**Exit:** R1–R5 are untouched and green, and existing include diagnostics have no `code` key.

### Phase 4: Scheduling in engines A, B and C

**Files**

- **New `packages/layout/src/wave-barrier.ts`:** the driver, `WaveLayoutState`, `floorAndAccumulate`, and floors computed from unclamped declaration dates.
- **`layout-context.ts`:** `waves?`.
- **`types.ts`:** `PositionedWave` (schedule fields), optional `PositionedRoadmap.waves`, `PositionedItem.waveRole` and `wavePinOverride`, and `PositionedMilestone.onWaveBoundary` and `overrunByWave`.
- **`layout.ts`:**
  - floors in `resolveChildStart` and `sequenceItem`, plus accumulation;
  - the engine B driver in `computeContentEndDay`, with an in-pass one-level region walk (keep the post-hoc recursion for n = 0);
  - `buildDependencies` skips wave refs;
  - `layoutRoadmap` wires up `buildWavePlan`.
- **`schedule.ts`:** the engine C driver, `resolveAfterDay` for wave ids, a one-level region walk, and `RoadmapSchedule.waves?`.
- **`nodes/roadmap-node.ts`:**
  - seeds the wave edges into the baseline maps (`entityRightEdges[w] = E_k`, which a floating milestone's predecessor lookup reads for any ref that is not a placed item);
  - a pass loop around `runSwimlaneLoop` plus the region pass, with in-loop region placements discarded;
  - the slack rerun and the final region placement each run once, frozen;
  - `collectSlackCorridors` skips wave refs.
- **`swimlane-node.ts`, `group-node.ts` and `parallel-node.ts`:** container floors (own wave and lead wave).
- **`include-node.ts`:** the `childCtx` shares `waves` and receives the seeds.
- **`milestone-node.ts`:** the `wave:<id>` flow key, no slack arrows, `overrunByWave`, and `onWaveBoundary`.
- **`layout-insights.ts`:** W1001, W1002, I1006 (aggregated one / many / all) and I1007.
- **`i18n.ts`:** "held by", "no items", the gap and background labels (en and fr).

**Tests that fail without the change**

- New `packages/layout/test/waves.test.ts`:
  - every valid example's table in engine A (x converted to weeks through `pixelsPerDay`) and in engine C, asserting that they are equal;
  - A = B = C on the domain end for Example 19;
  - spans, `heldBy` and `floorRef`;
  - pass counts of 4, 3 and 2 for Examples 1, 19 and 16;
  - the 12 px gutter invariant;
  - the lead floor;
  - a floor past the `length:` window (which grows the window, `length:` being a minimum);
  - a floating milestone bound to a wave sits exactly at `E_k`, with `onWaveBoundary` set;
  - an empty first wave;
  - nested regions contribute nothing;
  - divergence (d) is pinned;
  - W1002 on a forced invalid input;
  - a model without waves has none of the new keys;
  - a seeded random-roadmap property test for the barrier theorem and termination.
- `schedule.test.ts`: barrier cases.
- `layout-insights.test.ts`: the new insight codes.

**Exit:** the 14 SVG snapshots and `hashes.json` pass without `UPDATE_*` flags (`make pre-commit`, then `make compile TARGET=local` and `make determinism`).

### Phase 5: Tokens, strip, background cues, renderer

**Files**

- **`themes/shape.ts`, `light.ts`, `dark.ts` and `grayscale.ts`:** the `wave` token group (`waves.md` §9.10).
- **`themes/shared.ts`:** the constants.
- **`roadmap-node.ts`:**
  - the strip row in the header math (`:299-312`);
  - the legend height added before `buildFootnotes`.
- **New `nodes/wave-node.ts`:** strip cells, the label fit chain, tooltips, empty markers, gap labels, the placeholder, boundaries, crossings, the legend and styles. It runs after the marker `deltaY` shift.
- **`render.ts`:**
  - new layers: `wave-strip`, `wave-bg`, `wave-boundary`, `wave-labels` and `wave-cross`;
  - the hatch overlay drawn right after the bar fill for `waveRole === 'background'`;
  - hatch `<pattern>` defs only when used;
  - the marker-row panel moved below the strip;
  - milestone cut lines skipped when `onWaveBoundary` is set;
  - no bracket for an untitled, unstyled `group wave:x`;
  - re-emitted wave layers inside `renderIncludeRegion`;
  - everything gated on `model.waves`.
- **The mockup in `specs/waves/samples/` is the visual target.**

**Tests that fail without the change**

- `renderer/test/render.test.ts`:
  - layers and z-order, with no new `<defs>` children (no hatch patterns) when there are no waves;
  - strip alternation;
  - the label fit chain;
  - empty-wave diamonds;
  - the placeholder;
  - the gap label;
  - styled tints;
  - `border:none`;
  - the boundary span;
  - the milestone cut line suppressed on a boundary;
  - the hatch overlay and pattern choice by fill luminance;
  - crossings;
  - the legend rules;
  - group brackets;
  - the region re-emit clip.
- `themes.test.ts`: tokens defined in every theme, and the contrast floors.
- `export-pdf.test.ts`: a hatched bar renders. If not, implement the stripe-line fallback.

**Exit:** the old snapshots are byte-identical. Review a visual checklist in light, dark and grayscale:

- strip-to-column continuity through two marker rows;
- boundary versus grid at `scale:1w`;
- label degradation at `scale:1m`, and the legend;
- an empty wave, a gap, and the placeholder;
- the now-line in the strip;
- `timeline-position:bottom`;
- a styled wave with a dark `bg`;
- `group wave:x` on a boundary;
- hatch on a light bar and on a dark bar;
- crossings;
- the region re-emit.

### Phase 6: Exporters

**Files**

- **XLSX:** a conditional `Wave` column and a `Waves` sheet.
- **MS Project:** wave-end milestone tasks, barrier FS links, floor predecessors, and drop counting.
- **Mermaid:** `section Waves` before the lanes, previous-wave tokens in `startTokenFor`, and floor drop counting.

**Tests that fail without the change**

- Exporter tests for each mapping:
  - the XLSX dates equal `PositionedWave` dates on the waves fixture;
  - every Mermaid `after` token references an id defined earlier.
- A determinism fixture, `waves` (`browser: false`), that adds **new** `hashes.json` entries only.

**Exit:** existing exporter hashes are unchanged.

### Phase 7: LSP, editor grammar, docs, examples, fixtures

**Files**

- **LSP and editor:** everything in §4.5, the man pages (en and fr), the MCP vocabulary and cheatsheet, the `wave` row in the `README.md` Entities table, and `packages/core/README.md`.
- **Examples:**
  - move `specs/waves/samples/checkout-relaunch.nowline` to `examples/waves.nowline`;
  - add `examples/waves-program.nowline` plus `examples/waves-program/{web,api}.nowline` (Example 16).
- **Fixtures in `tests/`:** `waves-empty`, `waves-parallel-group`, `waves-gap-deadline`, `waves-isolate` (with its child file), and `waves-coarse`. `waves-coarse` uses `scale:1m` and six or more waves, including an empty one, a gap, a styled wave, two marker rows, background crossings and `group wave:x` on a boundary.
- **Manifests:** add entries to `scripts/render-samples.mjs` and `scripts/render-tests.mjs`.
- **Snapshots and other test lists:**
  - `snapshot.helpers.ts` `SAMPLES` += `waves`, `waves-dark`, `waves-grayscale`, `waves-coarse` and `waves-isolate`;
  - `roundtrip.test.ts` `EXAMPLES += 'waves.nowline'`;
  - `packages/core/test/parser/examples.test.ts` += `waves`.

**Tests:** the LSP provider tests:

- definition, references and rename from `wave:build`, `after:build` and `on:build`;
- renaming `wave wave` edits the name token, not the keyword;
- completion after `wave:`;
- hover;
- plus the new snapshot, round-trip and parse entries.

**Exit:** the close-out loop is clean: `make build`, then `git status` shows only intended changes, the round-trip allow-list is green, and the CHANGELOG reflects the final surface.

## 6. Gotchas

**Parsing**

- **The `EntityName` shim ships with the keyword.** Ship them in the same PR, or existing v1 ids spelled `wave` break.
- **Call it `EntityName`, not `Identifier`,** so that the generated guard cannot shadow the validator's `isIdentifier`.
- **`printNowlineFile` throws on unknown entries,** so the printer case ships with the grammar.
- **`langium generate` is not an ambiguity gate.** Nowline sets `maxLookahead: 4`, so the runtime parser uses Chevrotain LL(k) (not ALL(*)) with grammar validations skipped, and nothing is logged at parse time. The gate is a test that builds the parser with `skipValidations: false` (`waves.md` §4.7 "Phase 1 check"); a `console.warn` spy is only belt-and-braces.

**Validation and includes**

- **Children are parsed with `validation:false`,** so the wave rules for children must run in the resolver.
- **In merge mode, a child's `after:` can resolve to a parent item** through layout's shared maps. Per-file analysis never sees that edge, which is why G also runs on merged scopes.
- **`mergeContentMap` warns even in diamonds,** where both entries are the same object. Waves must bypass it.
- **Compare resolved floor dates, not text.** Never resolve floors through `resolveAfterDay` or `milestoneEnd`, which are filled only after the lane walk.
- **Title-only slug keys can equal a wave id.** Re-key them after the include loop.

**Layout**

- **Reset and re-seed every pass.** Otherwise pass 2 starts honouring forward references.
- **Region placements inside the loop are discarded.** The final region placement runs once, frozen. Engine B recurses into every region level today; in wave mode, B and C walk exactly one level, matching engine A.
- **Floors use unclamped dates.** `forwardWithinDomain` returns null outside the date window (`roadmap-node.ts:254-255`). `length:` is a minimum now, but the initial window is still computed before the lanes run.
- **`calendar:business` places dates by calendar-day distance but uses 5-day weeks:** one `scale:1w` column is 5 calendar days, and tick labels step by 5 days. Use `calendar:full` for date fixtures; the sample does.

**Rendering**

- **The renderer derives the marker-row panel y from the tick panel,** not from `markerRow.y`.
- **Unstyled groups are not invisible today.** The default themes draw `bracket: solid`, so the no-bracket rule for `group wave:x` must be gated.
- **Boundaries coincide with major grid lines at `scale:1w`.** Keep the 2 px weight and the contrast tests.
- **Draw the strip's backing panel in the timeline layer,** before the grid.
- **A milestone sitting exactly on a boundary must drop its cut line** (tolerance 0.5 px), or two vertical lines overlap.

**Diagnostics**

- **Nothing warns about items with no wave.** By design, a forgotten `wave:` is visible only as a hatched bar. The README asks testers whether that is obvious enough. If feedback says no, the cheapest addition is an opt-in check, never a default warning. That would be a new decision, so record it in §3.

**Byte stability**

- **Omit optional model fields; never set them to `undefined` or `[]`.**
- **Emit no unconditional `<defs>` children (hatch patterns only when used) and no empty `<g>` layers.**
- **Gate exporter columns, sheets and sections on waves existing.**

## 7. Incidental findings (resolved)

Found during the research and confirmed at `4f771b4`. None blocked waves. **All five are resolved:** 1 by #74, and 2–5 by #73. They are kept as a record.

1. **The printer throws on `symbol`.** *(Resolved by #74.)* `configEntry` in `packages/core/src/convert/printer.ts:89-102` has no `SymbolDeclaration` case. `printNowlineFile`, and therefore JSON → text conversion, throws `Unknown config entry type` for any file that declares a `symbol`.
2. **The quarter length drifts between code and spec.** *(Resolved by #73.)* `calendar:full` uses `daysPerQuarter: 91` in `packages/layout/src/calendar.ts:35`, but `specs/dsl.md:781` says 90.
3. **The snippets offer invalid values.** *(Resolved by #73.)* `packages/vscode-extension/snippets/nowline.json` offers `1mo` as a `scale` choice (`:5`), which is not a valid duration literal. It also offers `backlog` as a status (`:17`, `:24`), which is not a built-in status.
4. **LSP built-in statuses are incomplete.** *(Resolved by #73.)* `BUILTIN_STATUSES` (`packages/lsp/src/references/ast-utils.ts:77-83`) lacks the `active` and `completed` aliases.
5. **Keyword counts and tables are stale.** *(Resolved by #73.)* `specs/principles.md:45` says "~17 keywords". `README.md:192-205` lists `duration` as a keyword and omits `size` and `symbol`.

## 8. Files to reference

- **Specs:** [`../waves.md`](../waves.md), [`../dsl.md`](../dsl.md), [`../rendering.md`](../rendering.md), [`../ide.md`](../ide.md), [`../cli.md`](../cli.md), [`../principles.md`](../principles.md), and the precedent handoffs [`handoff-m2n-inline-date-pins.md`](./handoff-m2n-inline-date-pins.md) and [`handoff-m9-utilization.md`](./handoff-m9-utilization.md).
- **Critical code:**
  - `packages/core/src/language/{nowline.langium, nowline-validator.ts, include-resolver.ts}`
  - `packages/core/src/convert/printer.ts`
  - `packages/core/src/i18n/{codes.ts, messages.en.ts, messages.fr.ts}`
  - `packages/layout/src/{layout.ts, schedule.ts, layout-context.ts, types.ts, layout-insights.ts}`
  - `packages/layout/src/nodes/{roadmap-node.ts, swimlane-node.ts, group-node.ts, parallel-node.ts, include-node.ts, milestone-node.ts}`
  - `packages/layout/src/themes/*`
  - `packages/renderer/src/svg/render.ts`
  - `packages/export-{xlsx,msproj,mermaid}/src/index.ts`
  - `packages/lsp/src/references/ast-utils.ts`

## 9. Open questions for the maintainer (decided)

The maintainer adopted every recommendation below for m2o; the same list is in `waves.md` §13.

1. **Ship wave start floors in v1?** *Recommendation:* yes.
2. **How strict should include agreement be?** *Recommendation:* ids, order and resolved floors must match (an error); presentation drift is a warning.
3. **Default look.** *Recommendation:* no column tint; use the strip and the boundary lines.
4. **MS Project and Mermaid stay AST-only.** *Recommendation:* accept the approximation for the first release.
5. **Single milestone or the three-milestone split** (§2)? *Recommendation:* a single m2o, unless the layout phase needs to slip independently.
