# Working calendar handoff: implementation plan (m2p)

> **Status: Phases 1-2 are implemented in PR lolay/nowline#96, still open; Phases 3-5 are not started.** This handoff turns [`working-calendar.md`](../working-calendar.md) into a phased plan for a fresh agent. It is self-contained: the decisions that close the spec's open questions are in §3, the codebase map is in §4, and the target API is in §5. Do not redo the research; re-verify line numbers instead (§1, step 2).

## 1. How to pick this up

1. **Scope is decided.** §3 closes every open question in `working-calendar.md` §11 and records the implementation choices made while writing this plan. The maintainer approved them by merging this handoff. Do not reopen one without new information.
2. **Re-verify code references.** Every `file:line` in §4 was checked against commit `9725e9d` (waves merged, October 2026). Before you trust a line number, re-run a grep for the symbol named in that row.
3. **Read `working-calendar.md` §3, §5 and §7 before coding.** They are normative. The worked examples in §10 double as test fixtures; the numbers in them are the acceptance criteria.
4. **One PR per phase,** merged in order, each ending with `make pre-commit` green (AGENTS.md; use `make` targets only). Phases 2 and 3 must land in the same release: do not cut a release between them, or the exporters disagree with the chart.
5. **Byte stability is the safety net.** A calendar with no non-working days must be the identity everywhere. Every `calendar:full` fixture, including all five waves snapshots, must stay byte-identical through every phase. If one moves, you broke the identity path.

## 2. Milestone and PR shape

Milestone **m2p — Working calendar** is already in `specs/milestones.md` (summary row, section, dependency chain). It follows m2o (waves) in the m2 series.

| Phase | PR | Ships | Byte impact |
|---|---|---|---|
| 0 | this handoff | milestone, spec status, this plan | none |
| 1 | calendar primitives | `WorkingCalendar` non-working set, index ↔ date functions, business weekend | none (no caller uses them yet) |
| 2 | working-day schedule, `hide` | engines B and C in working days, `TimeScale` hide mapping, window and ticks, now-line, wave floors, positioned `nonWorking` runs | every business-calendar render |
| 3 | exporters | XLSX, MS Project and Mermaid read the file's calendar | business-calendar `xlsx`, `msproj`, `mermaid` cells |
| 4 | `show` and the display setting | `non-working:` style key, `--non-working` on every surface, show mapping in engine A, shading | none by default (`hide` stays default) |
| 5 | declarations | `non-working` keyword, `date:` / `through:` / `every:`, includes, named seams and bands, exporter exceptions, editor and agent tooling | none for files without the keyword |

## 3. Decision log

| # | Decision | Chosen | Rejected | Why |
|---|---|---|---|---|
| 1 | Keyword | `non-working`, verified by the Phase 5 lexer spike before any other Phase 5 work | `nonworking`, `closure`, `holiday`, `off` | The maintainer asked for one name across declaration, setting, flag and model. If the spike shows the hyphenated keyword cannot lex cleanly, **stop and ask**; do not rename silently. |
| 2 | Ranges | `date:` plus optional inclusive `through:` | a list of dates (`date:[…]`) | One form is enough for m2p; a long shutdown reads better as a range. Lists can be added later without breaking anything. |
| 3 | Narrow columns under `hide` | A column narrowed by hidden days drops its label when the label does not fit (`estimateTextWidth` at `TIMELINE_TICK_LABEL_FONT_SIZE_PX`); the tick stays | Letting the label overflow into a neighbour | Extends the edge-column rule from #92. Applies only to columns that contain hidden days, so `calendar:full` stays byte-identical. |
| 4 | Thinning at the `days` scale under `hide` | Count visible columns. The default `labelEvery` for `days` becomes the number of working weekdays in the recurring pattern (5 for business). **Amended 2026-10-06 (maintainer, Phase 2):** at the `days` scale under `hide`, default thinning labels week starts instead, because "every N visible columns" drifts once a week has six working days. An explicit `label-every` still counts visible columns. | Keeping 7 | Seven visible columns is no longer a week once weekends are hidden. |
| 5 | Markers on a hidden day | The label is unchanged; the marker's SVG `<title>` carries its real ISO date | Adding the date to the label | Keeps marker-row packing unchanged; the seam already says the day is hidden. |
| 6 | Versioning | `### Changed` under `nowline v1`, no opt-in | An opt-in flag or a DSL version bump | The business calendar now does what `dsl.md` already says it does ("engineering working-day arithmetic"). |
| 7 | Per-swimlane calendars | Out of m2p | — | Spec §11.7: only on demand. |
| 8 | How `show` is built | **Natively:** engine A advances through the calendar at the few duration-to-width sites (`TimeScale.advanceX`, §5) and snaps starts (`TimeScale.startX`) | The spec §7.3 sketch: lay out in `hide` space, then project every x in a post-pass | The post-pass needs a start-or-end side for every x on every positioned field (item internals, glyphs, progress strips, arrows, wave strips). The native route touches only the sites in §4.2 and yields the same observable rules. `working-calendar.md` §7.3 is updated to say so. |
| 9 | `hide` needs no width changes | Under `hide`, x is linear in working index, so engine A's `days × pixelsPerDay` arithmetic is already correct; Phase 2 changes only the date ↔ x mapping | Routing engine A through `advanceX` in Phase 2 | Smaller Phase 2, and a sequenced business roadmap starting on a working day keeps its exact item geometry, which is the byte-diff check. |
| 10 | Week start | The first weekday after the recurring non-working run (Monday for sat/sun, Sunday for fri/sat). With no recurring days, week ticks keep stepping from the roadmap start | Always Monday; ISO weeks | Byte-stable for `calendar:full`; correct for any weekend. |
| 11 | Wave boundaries under `show` | A boundary stays at `E_k`, the end of the last working day of wave k. The next wave's items snap to the next working day, so a weekend can sit between the boundary and the first bar | Moving the boundary to the next working day | `S_{k+1} = max(E_k, floor)` is unchanged; only item starts snap. Under `hide` the two coincide. |
| 12 | Display precedence | `--non-working` (or the equivalent option on each surface) → the file's `default roadmap non-working:` → `hide` | A `.nowlinerc` key in m2p | Keeps the chain short. A `.nowlinerc` default can be added later (its place would be between the file and `hide`). |
| 13 | `every:` values | Lowercase three-letter English weekday names: `sun mon tue wed thu fri sat` | Full names, locale-aware names, numbers | Keywords and values stay English/ASCII (`milestones.md` m2m non-goals). |
| 14 | The preset weekend | `calendar:business` supplies `non-working weekend "Weekend" every:[sat, sun]`. A file's own `non-working weekend` replaces it (any preset) | A separate `weekdays:` property | One mechanism (spec §3.2). Until Phase 5 the preset weekend is the only source of non-working days. |
| 15 | Diagnostic codes | Assign at implementation from the next free numbers in each family (§4.5); placeholders NW1–NW7 are in spec §6 | — | Codes are cheap to pick and easy to collide; pick them in the PR that adds them. |
| 16 | Exporter calendar access | Phase 3 adds one exported resolver (Phases 1–2 build the calendar with `fromCalendarConfig` inside layout), `resolveWorkingCalendar(file, resolved)` → `{ config: CalendarConfig, working: WorkingCalendar }`, used by layout, engine C and every exporter; `RoadmapSchedule` carries the result. Exporter durations come from the same code path as layout (`deriveItemDurationDays` with the file's calendar and sizes), which also fixes the missing `q` and the ignored `size:` declarations | Passing `CalendarConfig` piecemeal; keeping the exporters' own duration tables | Three hardcoded calendars are how the surfaces drifted apart (§4.7). One resolver keeps Phase 5's declarations flowing to every exporter for free. |
| 17 | Incidental findings (§7.1) | Not fixed in m2p | Folding them in | Each is unrelated to the calendar; separate small PRs. |

## 4. Codebase map (as of `9725e9d`)

Condensed from three read-only research passes (time and scheduling; DSL plumbing; rendering, exporters and surfaces). Re-verify line numbers before you edit. "Phase" says when a row is touched.

### 4.1 Time primitives (`packages/layout/src/`)

| Where | What | Phase |
|---|---|---|
| `time-scale.ts:32-39` | Constructor: `spanDays = daysBetween(domain)` (`:36`), `pixelsPerDay = width / spanDays` (`:37`), a d3 `scaleTime` used only by `invert` (`:38`). The `calendar` option is stored (`:22, :29, :35`) and never read. | 2 |
| `time-scale.ts:46-48, 56-58` | `forward` (calendar days × ppd) and `forwardWithinDomain` (raw date compare, then `forward`). | 2, 4 |
| `time-scale.ts:65-66` | `invert`: continuous d3, not whole days. **No production caller** (only `test/time-scale.test.ts`). | 2 |
| `working-calendar.ts:19-26, 28-38` | Interface (`daysPerUnit`, `addUnits`, `isWorkingDay`) and `fromCalendarConfig`. `isWorkingDay` always returns true (`:36`). | 1 |
| `working-calendar.ts:40-72, 74-91` | `continuousCalendar` (unused), the standalone `daysPerUnit(unit, cal)` (used at `layout.ts:1339`). `addUnits` and `isWorkingDay` have no callers. | 1 |
| `calendar.ts:23-37, 39-62` | The `BUSINESS` / `FULL` presets and `resolveCalendar`. | 1 |
| `calendar.ts:67-85, 119-133` | `literalToDays`, `deriveItemDurationDays`: the day count engines A, B and C use as an offset or width. Durations stay in these units; only their placement changes. | — |
| `calendar.ts:235-244` | `daysBetween` (rounded) and `addDays`. **`addDays` silently truncates fractions** (`setUTCDate`). | 1, 2 |
| `dsl-utils.ts:24-30` | `parseDate`: UTC midnight. | — |
| `view-preset.ts:179-191` | `tickBoundaryAtOrAfter` (used by engine B and the extension pass). | 2 |
| `view-preset.ts:202-232` | `buildHeaderTicks`: the day/week path computes x by hand (`:211-218`) and labels with `addDays` (`:227`); the business week stride is `daysPerUnit('weeks')` = 5 calendar days, which is today's week drift. | 2 |
| `view-preset.ts:243-277` | `buildCalendarAlignedTicks` (#92): dates from `nextUnitStart`, x via `scale.forward` (`:255`). Already correct once `forward` is. | 2 |

### 4.2 Engine A, the pixel layout

**Entry and window.**

- `layout.ts:1834-1855` `layoutRoadmap` → `RoadmapNode.place`. `LayoutOptions` is at `layout.ts:118-129` (`theme`, `today`, `width`, `locale`); `LayoutContext` (`layout-context.ts:50-151`) carries `cal` (`:51`), `timeline` (`:67`), `scale` (`:68`), `calendar` (`:69`, only copied in production at `include-node.ts:92`) and `waves` (`:150`). It has no `today` or `locale`.
- `roadmap-node.ts:184-191` calls `computeDateWindow`; `:228-235` builds `calendar`, `ppd = pixelsPerUnit / daysPerUnit(unit)`, `spanDays`, `originX`; `:243-244` decides whether the now-line is in the window (raw date compare); `:260-264` builds the `TimeScale`; `:282, :298` pre-pack anchors and milestones through `forwardWithinDomain`; `:344` builds ticks; `:345-367` the timeline object; `:416` `createWaveLayoutState`; `:512-526` the barrier solve.
- `roadmap-node.ts:600-629`, the post-layout extension: pixels → days by hand (`:611`), `tickBoundaryAtOrAfter` (`:612-615`), `addDays` and `paddedDays × ppd` (`:616-618`), then a new scale in `ctx.scale` (`:624`). **Two scales coexist:** `buildMilestones` (`:587`) ran on the original; anchors (`:780`) and the now-line (`:787`) use the extended one. They agree only while `pixelsPerDay` and `originX` stay identical.

**Sites that convert pixels and days by hand** (bypassing `TimeScale`; Phase 2 must route each through `forward` / `invert`):

| Where | What |
|---|---|
| `wave-layout.ts:198-201` `dateAtX` | `round((x - originX) / ppd)` then `addDays`. Feeds wave dates and tooltips (`wave-node.ts:108-109, 147`) and the NL.W1001 pin text (`wave-layout.ts:181`). |
| `layout-insights.ts:208-218` | Reads a dated milestone's date back off its x for NL.I1007; its comment relies on "linear in calendar days". Prefer carrying the date, else use `invert`. |
| `view-preset.ts:211-227` | The day/week tick path (§4.1). |
| `roadmap-node.ts:611-618` | The extension pass (above). |

**Duration-to-width sites** (correct under `hide`, decision 9; Phase 4 routes them through `advanceX`): `layout.ts:435` (`naturalWidth = max(MIN_ITEM_WIDTH, durationDays × ppd)`), `layout.ts:459` (predicted visual width), `layout.ts:1054-1056` (height prediction), `swimlane-node.ts:310-312` (predicted end), `group-node.ts:194-196` (predicted width).

**Start-resolution sites** (Phase 4 `startX`): `sequenceItem` pins and `after:` (`layout.ts:407-433`), `resolveChildStart` / `resolvePinnedOrSequentialStart` (`layout.ts:1153-1194`), `waveFloorX` (`wave-layout.ts:123-125`) and its callers (`group-node.ts:98`, `parallel-node.ts:53`).

**Other engine A facts.**

- `before:` cap: `layout.ts:484-508` uses `forwardWithinDomain(date)`, the **start** of the pinned day. The spec now says so too (rule 7).
- The lane cursor ends at `logicalRight` (`layout.ts:842-843`); `swimlane-node.ts:336-337` advances `timeCursorX` to the box right plus `ITEM_INSET_PX`.
- Dated markers: `anchor-node.ts:34` and `milestone-node.ts:186` via `forwardWithinDomain`. An `after:` milestone's x is the predecessor's visual right edge, 6 px left of its logical end (`milestone-node.ts:66`).
- Include regions share the host's `timeline`, `scale` and `calendar` (`include-node.ts:73-125`).
- `buildNowline` (`layout.ts:1730-1796`) places `today` with `forwardWithinDomain` (`:1736`).
- Dead code: `_buildSwimlane` (`layout.ts:1196-1213`) and `formatDurationDays` (`calendar.ts:182-200`) have no callers. Leave them alone in this milestone.

**Pixel clamps** (stay in pixels in both views): `MIN_ITEM_WIDTH = 8` (`themes/shared.ts:67`), `ITEM_INSET_PX = 6` (`:240`), `TRACK_BLOCK_TAIL_GUTTER_PX = 8` (`:111`), `GUTTER_PX = 12` (`:254`), `WAVE_EDGE_TOLERANCE_PX = 0.5` (`wave-layout.ts:25`). Together, `MIN_ITEM_WIDTH` and `ITEM_INSET_PX` make any item narrower than 20 px advance the lane cursor to its start + 20 px (2.5 days at the default week scale): pre-existing divergence (b).

### 4.3 Engines B and C

**Engine B** (`layout.ts`):

- `computeDateWindow` (`:1294-1354`): start (`:1317`); `length:` through `literalDays` (`:1321`, a duplicate of `literalToDays` defined at `:1368-1386`); `computeContentEndDay` (`:1332-1338`); `tickBoundaryAtOrAfter` with the empty-roadmap fallback `4 × daysPerWeek` (`:1339-1351`); `endDate = addDays(start, finalDays)` (`:1353`).
- `computeContentEndDay` (`:1397-1636`): anchor dates (`:1417`), inline `after:` dates (`:1446-1448`), item pins (`:1479, :1481`), `after:` (`:1483`), wave apply / accumulate (`:1487-1490`), containers (`:1499-1524`), the barrier solve and region walk (`:1547-1578`), `maxDay` (`:1584`), milestones (`:1593, :1605`), regions without waves (`:1613-1627`), `today` (`:1630-1633`).

**Engine C** (`schedule.ts`, consumed only by the XLSX exporter today):

- Options `:88-91` (`today` only); the calendar is resolved at `:102`; start date `:107`.
- Anchor `daysBetween` → `addDays` round-trip (`:128-130`) and dated-milestone round-trip (`:301-302`): **keep the raw date** (rule 5); do not route these through the working index.
- Inline `after:` date (`:151`), duration (`:176`), pins (`:182, :184`), `after:` (`:186`), waves (`:190, :201`), `ScheduledItem` (`:193-194`: `end` is exclusive and fractions truncate), containers (`:206-228`), floors (`:248-253`), `summarizeWaves` (`:283-287`), after-only milestones (`:310-311`).

**Waves** (m2o, now on main):

- `solveWaveBarriers` (`wave-barrier.ts:55-84`) is unit-agnostic; only `origin` and `tolerance` carry units.
- `waveFloorDays` (`wave-barrier.ts:103-108`) converts floors with `daysBetween` (`:106`): switch to `workingIndexOf` (engines B and C).
- `createWaveLayoutState` (`wave-layout.ts:56-75`) converts floors with the unclamped `scale.forward` (`:66-69`): correct once `forward` is.
- `wavePinOverrideOf` (`wave-layout.ts:159-183`) and `isOnWaveBoundary` (`:186-192`) work in pixels; `dateAtX` is the only date read-back.
- The engine divergences (a)–(f) in [`handoff-m2o-waves.md`](./handoff-m2o-waves.md) §4.1 still apply. Do not fix them here.

**Now-line and `today`.** Option `layout.ts:120`; engine B `:1317, :1336, :1363-1366, :1630-1633`; engine A `roadmap-node.ts:188, :243-244, :787` and `layout.ts:1736`; NL.W1000 compares raw dates (`layout-insights.ts:257-270`). `resolve-today.ts` only produces a UTC-midnight date.

### 4.4 Positioned model, renderer and themes

- **Model.** `PositionedTimelineScale` (`layout/src/types.ts:133-183`): `box`, `ticks`, `pixelsPerDay` (`:137`), `originX` (`:139`), `startDate` / `endDate` (`:140-141`), panel geometry, `markerRow`, `waveStrip?`, `minorGrid` (`:179-182`). Built at `roadmap-node.ts:345-367`; the extension pass (`:619-627`) rebuilds only `endDate`, `box.width` and `ticks`, so it must also rebuild `nonWorking`. Optional keys are spread in only when present (`...(plan ? { waveStrip } : {})`, `:366`); do the same.
- **Renderer** (`renderer/src/svg/render.ts`). Emission order in `renderSvg` (`:2811-2958`): defs (`:2835-2845`, hatch patterns only when used), background, `timeline` (`:2863`), `wave-strip`, `swimlane-bg` (`:2870`), `wave-bg` (`:2873`, "over the lane rows and under the grid"), `grid` (`:2879`), `wave-boundary`, `wave-labels`, under-bar edges, `swimlane` (`:2900`), `include` (`:2905`), `wave-cross`, other edges, anchor and milestone cut lines (`:2919-2920`), `anchor` / `milestone` (`:2923-2924`), `nowline` (`:2927`), footnotes, legend, header, attribution.
  - **Bands (`show`)** go in a new layer between `swimlane-bg` and `grid`, beside `wave-bg`.
  - **Include regions paint an opaque rect** (`renderIncludeRegion` `:1941-2093`, rect `:1963-1974`) that hides every under-layer. Waves re-emit their tints and boundaries inside the region by plain rect intersection, no `clipPath` (`:2063-2071, :2082-2083`). Bands must do the same.
  - **Seams (`hide`)** go with the grid (`:2879-2884`) or with the cut lines (`:2919-2920`). `renderAnchorCutLine` (`:1712-1723`, 1 px, dash `1 3`) is the model for a lighter named seam.
  - **Named labels** pack into the marker row with `packMarkerRow` (`roadmap-node.ts:319-324`) and draw next to `:2923-2924`.
  - `renderMilestoneCutLine` skips its line on a wave boundary (`:1761`): precedent for not doubling a seam that coincides with a tick.
  - Every optional layer returns `''` when empty (`:2472, :2521, :2556`, …; rule stated at `:2231-2234`). Byte-stability tests: `renderer/test/render.test.ts:1152-1182` (layer order; a feature-free SVG has 3 filters, 3 markers, no pattern) and `layout/test/waves-byte-stability.test.ts` (optional model keys absent).
  - `RenderOptions` (`:133-145`) is renderer-only. The display setting is a layout option, not a renderer option.
- **Themes.** `themes/shape.ts:79-90` is the `timeline` token group (`gridLine`, `minorGridLine`, `tickMark`, `labelText`, `panelFill`, `border`); add `nonWorkingFill` and `nonWorkingSeam` there. Values per theme: `light.ts:127-134`, `dark.ts:125-132`, `grayscale.ts:126-133`. Opacity constants go in `themes/shared.ts` near the wave block (`:378-404`) and are re-exported from `layout/src/index.ts`. `themes/contrast.ts` has `contrastRatio`. `test/themes.test.ts` requires grayscale tokens to be achromatic (`:100-112`) and pins contrast floors for waves (`:125-154`); add floors for the new tokens (band vs lane tint, seam vs grid).

### 4.5 Grammar, validator, printer, includes, i18n (`packages/core/`)

**Run `make build-fast` first:** `src/generated/` is gitignored and can be stale in a fresh checkout.

| Area | Where | Notes |
|---|---|---|
| Config entries | `nowline.langium:24-25` `ConfigEntry` | Add `NonWorkingDeclaration`. Copy the `SymbolDeclaration` shape (`:44-47`) without the description. |
| Bare-word shim | `nowline.langium:79-82` `EntityName: ID \| 'wave'` | Add `'non-working'`. Also add it to the value rules that list `'wave'`: `BlockPropertyValue` (`:37-38`), `StylePropertyValue` (`:56-57`), `PropertyAtom` (`:190-191`). Leave `DefaultEntityType` (`:63-65`) alone. |
| Terminals | `nowline.langium:216-222` | `PROPERTY_KEY_WITH_COLON` and `ID` both allow hyphens. Langium (`token-builder.js:77-111`) gives each keyword `longer_alt` fallbacks in the order `PROPERTY_KEY_WITH_COLON`, `ID`, so `non-working:` lexes as a key and `non-working-team` / `nonworking` as `ID`. No hyphenated keyword exists yet. `maxLookahead: 4` (`nowline-module.ts:89-91`). |
| Ambiguity gate | `test/strings-and-ids/wave-identifier.test.ts` | Console spies (`:42-59`), `parseClean` (`:61-67`), lexer cases (`:88-99`), every bare-word slot (`:101-236`), residual cases (`:247-305`) and the validations-on parser build (`:307-330`, **the real gate**). Copy it as `non-working-identifier.test.ts`. Expected residual ambiguity: a bare `style` or `symbol` line followed by a `non-working …` line takes `non-working` as its name; a bare `style` / `symbol` is already NL.E0301. |
| Keyword tests | `test/parser/keywords.test.ts:315-440` | The `wave declaration` block is the template. |
| Printer | `src/convert/printer.ts:92-107` `configEntry` | The default case throws `Unknown config entry type`, so the new case ships with the grammar. Config entries print in source order (`:65-72`); there is no config sort. `KEY_ORDER` (`:4-28`): put `through` after `date` and `every` after it. |
| JSON AST | `src/convert/schema.ts:55-88`, `parse-json.ts:8-40` | Generic walkers; a new `ConfigEntry` alternative needs no JSON code and leaves existing hashes alone. |
| Validator registry | `nowline-validator.ts:431-556` | `SymbolDeclaration` checks at `:526` are the template. Do **not** register `checkEntityIdOrTitle`: id-less, title-less declarations are valid. |
| Own-key check | `checkSymbolDeclaration` `:1842-1888` | Use this pattern for `date` / `through` / `every`, **not** `checkUnknownEntityProperties` (`:1187-1218`), which skips `wave:` (`:1209`) and would silently accept `non-working x … wave:w`. |
| Duplicate ids | `checkDuplicateSymbolIds` `:1890-1911` | Template for NW5. |
| Dates | `checkPropertyValues` `case 'date': case 'start':` `:803-811` | Add `case 'through':` to get NL.E0405 for free. |
| Calendar rules | `checkCalendarBlockConsistency` `:1404-1441`, `checkCalendarBlock` `:1444-1471` | NW4 goes next to these. |
| Display key | `STYLE_PROP_KEYS` `:98-118`, `STYLE_PROP_ENUMS` `:149-164` | Add the key `non-working` with the values `hide` and `show`. The default branch of `checkPropertyValues` (`:950-977`) lets any colour-shaped value through (`:965`), so NW6 needs its own check. "Roadmap-only" is not enforced for `timeline-position` / `minor-grid` either; match them. |
| Type labels | `validator-utils.ts:105-113` `entityTypeLabel` / `describeNode`; LSP `ast-utils.ts:365-370` `entityKind` | Both turn `NonWorkingDeclaration` into `nonworking`. Special-case it to `non-working`. |
| Diagnostics | `acceptTr` `:399-410`; codes in `src/i18n/codes.ts` (union `:26-107`, `ALL_CODES` `:109-168`), `messages.en.ts:144-367`, `messages.fr.ts:168-385` | Coverage is enforced by `test/i18n/messages-coverage.test.ts`. Avoid uncoded text containing "requires" and "date:" (`diagnostics/index.ts:121-132` misclassifies it). |
| Includes | `include-resolver.ts:78-88` `ResolvedConfig`, `:177-183`, `:279-282`, `:416-441` `applyConfigMode`, `:486-500` `mergeMap`, `:539-557` `addConfigEntry` | Named styles and symbols are kept **only when named** (`:544-551`), so unnamed entries are dropped today. Non-working entries need a list (or slug keys, as `mergeContentMap` `:510-531` does) so unnamed ones always merge; named ones use parent-wins with the existing shadowing warning. Isolated regions keep the child's own config (`:117, :454-462`). |
| Style resolution | `layout/src/style-resolution.ts:60-63` (defaults), `:131-138` (`timeline-position`, `minor-grid`), `:209-237` (precedence; `default roadmap` is level 2) | Add `nonWorking: 'hide'`. `ResolvedStyle` in `types.ts:24-53`. |

**Next free diagnostic codes** (`codes.ts:5-19` lists the ranges):

| Rule (spec §6) | Range | Next free |
|---|---|---|
| NW1–NW5 (declarations) | `E0900–E0999` config blocks, unused | `NL.E0900`… |
| NW2 `through:` date shape | reuse `NL.E0405` | — |
| NW4 (`days-per-week` mismatch) | `W07xx` or a new config-warning slot; decide in the PR | `NL.W0703` |
| NW6 (`non-working:` value) | `E0800–E0899` style, unused | `NL.E0800` |
| NW7 (start moved off a hidden day) | `I10xx` layout insights | `NL.I1008` |

### 4.6 Option plumbing for the display setting

The file-level setting follows `minor-grid` (§4.5). The render-time override follows `--theme` / `--now` through every surface:

| Surface | Where |
|---|---|
| Layout | `LayoutOptions` `layout.ts:118-129`; read in `roadmap-node.ts:160-165`; `TimeScale` built at `:260-264`; timeline fields beside `minorGrid` / `waveStrip` (`:365-366`) and again in the extension path (`:619-627`). |
| Export kernel | `packages/export/src/index.ts`: `RenderInputs` `:87-135` (beside `width`, `noLinks`, `strict` at `:108-114`); `layoutRoadmap` call `:270-275`. |
| CLI | `cli/src/cli/args.ts` (`ParsedArgs` `:22-42`, options table `:123-136`, return `:255-261`); `cli/src/cli/help.ts` RENDER OPTIONS `:47-77`; `cli/src/commands/render.ts` (`produce` `:112-141`, `ProduceArgs` `:200-234`, `kernelInputs` `:275-289`; copy `parseTheme` `:527-538`); `commands/serve.ts:69-70, :157`; `man/nowline.1` (SYNOPSIS `:11-13`, options near `:182-184`) and `man/fr/nowline.1:191-193`; `specs/cli.md:70-90`. |
| Embed | `embed/src/index.ts` (`InitializeOptions` `:56-104`, `ResolvedConfig` `:106-120`, `renderOptionsFromConfig` `:153-161`); `embed/src/pipeline.ts` (`EmbedRenderOptions` `:27-56`, mapping `:82-90`); `embed/src/auto-scan.ts:10-35, :69-76`; `specs/embed.md`. |
| Browser pipeline | `browser/src/pipeline.ts` (`RenderOptions` `:115-162`, `layoutRoadmap` `:294-299`). |
| Preview shell | `preview-shell/src/mount.ts` (`ViewOptionsOverrides` `:56-60`, `ViewBaseline` `:67-72`, state `:197-202, :257-262`; copy the Show-links dropdown `:1338-1374`, `postViewOverrides` `:1377-1383`, `applyBaseline` `:1474-1497`); `markup.ts:46-48, :114-123, :178-179`; `apply-result.ts:78-89`; `preview/src/controller.ts:33, :46, :117-121, :144-162`. |
| VS Code | `package.json` `contributes.configuration` (theme `:100-116`; add `nowline.preview.nonWorking`); `src/extension.ts:250-278, :293-354, :431-436, :493-498, :533-541`; `src/preview/preview-panel.ts:15-49, :69-73, :201-211, :251-298, :318-332, :356-378`; `option-resolver.ts:16-58`; `render-pipeline.ts:29-62, :101-118`; `webview/entry.ts:26-44, :123-137`; `export/in-process.ts:90-147`; `export/cli-runner.ts:22-52, :279-294`. The extension has no tests. |
| MCP | `mcp/src/server.ts` (`render` schema `:581-629`, inputs `:654-661`; `export` schema `:809-856`, inputs `:877-887`; preview payload `:109-129`); `diagnostics.ts:162-209`; `ui/payload.ts:10-60`; `ui/entry.ts:87-96`. |
| GitHub Action | `nowline-action/action.yml:32-35`; `src/inputs.ts` (`ActionInputs` `:5-16`, copy `readTheme` `:40-46`, `parseInputs` `:68`); `src/cli.ts:42-65`; threaded through `file-mode.ts:23` and `markdown-mode.ts`; `README.md:106`. |
| Determinism legs | `integration-tests/determinism/{node-surface.ts:168-173, browser-surface.ts:113-121, cli-surface.ts:60-65}` build render inputs; only needed if a determinism fixture uses `show`. |

Option tests to model on: `cli/test/cli/args.test.ts:65`, `cli/test/integration/cli.render.test.ts:158-195`, `embed/test/manual-render.test.ts:37`, `browser/test/pipeline.test.ts:102`, `nowline-action/test/inputs.test.ts:47-80`, `preview-shell/test/{mount,apply-result}.test.ts`, `preview/test/controller.test.ts`, `mcp/test/mcp.smoke.test.ts`.

### 4.7 Exporters

**No exporter can reach the calendar today.** `resolveCalendar` and `CalendarConfig` are not exported from `layout/src/index.ts`; `RoadmapSchedule` (`schedule.ts:52-70`) does not carry the calendar it resolves at `:102`; `PositionedRoadmap` (`types.ts:853+`) has none either; `ExportInputs` (`export-core/src/types.ts:10-28`) is `{model, ast, resolved, sourcePath, today}`. Decision 16 fixes this first.

| Exporter | Today | Sites |
|---|---|---|
| MS Project | One hardcoded Mon–Fri Standard calendar for every file, including `calendar:full`. Item tasks carry no `<Start>`, so MS Project schedules them itself against that calendar; only dated milestones and anchors get a start. Durations: 5 / 22 / 252 per w / m / y, no `q` (480 minutes fallback). | `export-msproj/src/calendar.ts` (`dayBlock` `:14-36`, `buildCalendarsBlock()` `:38-57`, no arguments); call site `index.ts:143`; resource `CalendarUID` `:532`; project start `:111, :593-604`; item tasks `:224, :240, :380-382`; `duration.ts:22-43`. Tests: `test/export-msproj.test.ts` (calendar block `:17`, durations `:141-155`). |
| Mermaid | No `excludes`. `d` / `w` pass through (Mermaid reads `w` as 7 calendar days), `m` → 22d, `y` → 252d, `q` → `'1d'` fallback. `scheduleRoadmap` is called only for waves. | Header `index.ts:126-128` (`excludes` goes after `:128`); durations `:341`; `resolveStartDate` `:409-414`; `duration.ts:39-47`. Tests: `test/export-mermaid.test.ts`. |
| XLSX | Start / End from engine C (`index.ts:71`; `itemRow` `:350-382`, Duration `:369`, Start / End `:371-372`). The Duration column uses hardcoded 5 / 22 / 252, no `q`, regardless of `calendar:`. The Roadmap sheet (`:116-138`) does not show the calendar. | `duration.ts:24-43`; milestones `:415`, anchors `:449`, waves sheet `:507-522`. Tests: `test/export-xlsx.test.ts` (Duration `:144-167`, Start / End `:169-203`); fixture `test/helpers.ts:44` is business. |
| All three | `size:` goes through a hardcoded bucket table (`xs`, `sm`, …) and ignores the file's `size … effort:` declarations. | each exporter's `duration.ts` |

The export kernel (`packages/export/src/index.ts`) dispatches Mermaid (`:379-383`), MS Project (`:385-391`) and XLSX (`:393-397`); HTML, PNG and PDF consume the SVG.

### 4.8 Gates and fixtures

**Layout snapshots** (`integration-tests/test/snapshot.helpers.ts:73-117`, rendered with `FIXED_TODAY = 2026-02-09`, a Monday, `:50`): **19 samples, 14 business, 5 full.**

| Sample | Calendar | Date pins |
|---|---|---|
| minimal, minimal-fr | business (default), `2w` | none |
| platform-2026, -dark, -grayscale | business, `1w` | anchors 01-05, 03-02, 03-16; milestone 03-16 |
| dependencies | business (default), `1w` | 01-05, 03-02 |
| isolate-include (+ `partner.nowline`) | business (default) | 01-05 |
| nested-both-headers | business (default), `timeline-position:both minor-grid:true` | 01-06, 09-14 |
| capacity-items (`length:6w`), capacity-lanes, capacity, sizing | business (default) | none |
| text-wraps-inside-bars, title-line-breaks | business, `2w` | none |
| waves, -dark, -grayscale; waves-coarse; waves-isolate | **full** | waves-coarse has dates and `after:2026-11-02` |

**Determinism fixtures** (`integration-tests/determinism/spec.ts:94-161`): `clean-quarters` (`scale:1q`), `minimal`, `minimal-fr`, `platform-2026`, `platform-2026-dark`, `dependencies`, `capacity`, `sizing`, `nested-both-headers`, `isolate-include` are business; `waves` is full. `calendar:custom` appears only in `examples/product.nowline` and `tests/grammar-properties.nowline`, neither snapshotted.

**Unit tests to extend or fix:**

- `layout/test/time-scale.test.ts`: inline `businessCal` / `fullCal` (`:6-20`); the `tickDates` helper (`:25-31`) recovers dates from `pixelsPerDay`. Under `hide` that is wrong; switch it to `invert`.
- `layout/test/layout.test.ts:710-785`: the #92 month-scale tests also recover dates from `pixelsPerDay` (`:750-757`). The **business** one changes meaning in Phase 2: 17 months at 22 working days end in June 2027, not January. Update its expectations deliberately; the `calendar:full` one must not change.
- `layout/test/date-window.test.ts` (engine B), `schedule.test.ts` (engine C; early suites are business), `waves.test.ts`, `waves-model.test.ts`, `waves-byte-stability.test.ts`, `calendar.test.ts` (presets vs `dsl.md`), `themes.test.ts`, `renderer/test/render.test.ts` (helper `test/helpers.ts:22-34` takes `LayoutOptions`).

### 4.9 Editor, docs and agent tooling (Phase 5)

| Surface | Where |
|---|---|
| LSP | `packages/lsp/src/references/ast-utils.ts` (`collectNamedEntities` config loop `:162-165`, `declarationAt` `:321-337`, `entityKind` `:365-370`); `providers/completion.ts` (value completion exists only for status / icon / capacity-icon, `:86-115`; add `hide` / `show` and weekday names); `providers/hover.ts:90-99` (add `through`, `every`). Test template: `test/providers/waves.test.ts`. |
| TextMate | `grammars/nowline.tmLanguage.json`: copy the start-of-line `wave` pattern (`:50-55`) as `^\s*(non-working)(?![\w-])(?=\s)` (a plain `\b…\b` would match inside `non-working-team`); property keys `:65` (`through`, `every`); style keys `:80` (`non-working`); enum constants `:92` (`hide`, `show`). `packages/lsp/test/textmate-wave.test.ts:15-17` indexes patterns by position: append, or update it. |
| Snippets | `packages/vscode-extension/snippets/nowline.json` (wave snippet `:26-30`). |
| Man pages | `packages/cli/man/nowline.5`: FILE STRUCTURE `:43-45`, CONFIG SECTION and "Five config keywords" `:293-307`, `.Ss calendar` `:486-547` (add `.Ss non-working` after it), style keys `:1059-1063`, `:1392-1397`, validation `:1689-1708`. French `man/fr/nowline.5`: `:5-7`, `:335-350`, `:530`, `:1467-1473`, `:1782`. `nowline.1` options from `:122` (Phase 4). |
| MCP | `packages/mcp/src/reference-cheatsheet.ts` "Config / includes" `:56-58`. `schema-vocab.ts` has no config-keyword list (`entityTypes` `:23-37` is roadmap-only); adding one also touches `schemas.ts:105-107`, `server.ts:1348-1352` and `test/mcp.smoke.test.ts:626-634`. `nowline://reference` is generated from `nowline.5`; `examples/*.nowline` are bundled automatically. |
| Specs | `dsl.md`: Design Rule 1 count (`:15`), config prose (`:50`), Config Keywords table (`:159-168`), raw style list (`:321`), config section (`:787-980`), include collisions (`:692, :719-726`), validation (`:1157-1162, :1205-1206, :1242`). `ide.md:25-28, :44`. `rendering.md:149-151, :455-456`. `README.md:192-206`. |

## 5. Target API

### 5.1 `WorkingCalendar` (`packages/layout/src/working-calendar.ts`)

Extend the existing interface; keep `daysPerUnit` (duration arithmetic) exactly as it is.

```ts
export interface NonWorkingSet {
    weekly: ReadonlySet<number>;            // UTC weekdays, 0 = Sunday … 6 = Saturday
    dated: ReadonlyArray<NonWorkingRange>;  // Phase 5; empty before then
}

export interface NonWorkingRange {
    from: Date;          // UTC midnight
    through: Date;       // inclusive, UTC midnight
    id?: string;
    title?: string;
}

export interface NonWorkingRun {
    from: Date;          // first non-working date of a maximal run
    through: Date;       // last one, inclusive
    titles: string[];    // titles of the dated declarations inside it; empty for a plain weekend
}

export interface WorkingCalendar {
    daysPerUnit(unit: ScaleUnit): number;               // unchanged
    readonly hasNonWorkingDays: boolean;                // false → every function below is calendar-day math
    isWorkingDay(date: Date): boolean;
    /** Working days in [base, date). A non-working `date` counts as the next working day. */
    workingIndexOf(base: Date, date: Date): number;
    /** UTC midnight of the working day with this index (fractions floor to that day). */
    dateAtWorkingIndex(base: Date, index: number): Date;
    /** Maximal runs of consecutive non-working dates intersecting [from, to). */
    nonWorkingRuns(from: Date, to: Date): NonWorkingRun[];
    /** First weekday after the recurring run, or undefined with no recurring days (decision 10). */
    readonly weekStart: number | undefined;
}
```

- `fromCalendarConfig(cal, set?)` builds it. The business preset passes `weekly = {0, 6}`; full and custom pass an empty set.
- With an empty set, `workingIndexOf(base, d) === daysBetween(base, d)` and `dateAtWorkingIndex(base, i) === addDays(base, i)`. Unit-test that identity explicitly.
- Guard every loop: `every:` cannot cover all seven days (validator NW3), but dated ranges are unbounded, so cap index walks (for example, at 100 years of days) and throw a clear error past the cap.
- Index arithmetic must be O(weeks), not O(days), for long windows: count whole weeks with the weekly mask, then walk the remainder, then subtract dated non-working days that fall on working weekdays.
- `addUnits` and `continuousCalendar()` remain; check §4.1 for callers before changing them.

### 5.2 `TimeScale` (`packages/layout/src/time-scale.ts`)

```ts
export interface TimeScaleOptions {
    domain: [Date, Date];
    range: [number, number];
    calendar?: WorkingCalendar;
    nonWorking?: 'hide' | 'show';   // Phase 2 always passes 'hide'; Phase 4 wires the setting
}
```

| Member | `hide` (or no non-working days) | `show` |
|---|---|---|
| `pixelsPerDay` | `widthPx / workingIndexOf(d0, d1)` | `widthPx / daysBetween(d0, d1)` (today) |
| `forward(date)` | `originX + workingIndexOf(d0, date) × ppd`; a hidden date maps to the seam | `originX + daysBetween(d0, date) × ppd` (today) |
| `invert(x)` | a working date (replace the d3 `scaleTime` path) | a calendar date (today) |
| `startX(x)` (new) | identity | x of the start of the first working day at or after `invert(x)` |
| `advanceX(x, n)` (new) | `x + n × ppd` | x of the end of the n-th working day counted from `startX(x)`; fractions interpolate within the last day |

With no non-working days the two columns are identical; that is the identity path.

### 5.3 Positioned model (`packages/layout/src/types.ts`)

Add to `PositionedTimelineScale`, **only when the window contains a non-working day** (omit the fields otherwise; never emit `undefined` or `[]`; see the waves gotcha in `handoff-m2o-waves.md` §6):

```ts
nonWorkingDisplay?: 'hide' | 'show';
nonWorking?: Array<{ x: number; width: number; from: Date; through: Date; titles?: string[] }>;
```

## 6. Phased plan

### Phase 0: milestone and plan (done in this PR)

- `specs/milestones.md`: m2p row, section and chain entry.
- `specs/working-calendar.md`: status Accepted, pointer to this handoff, §7.3 note (decision 8), §11 marked decided.
- This file.

### Phase 1: calendar primitives

**Change**

- `working-calendar.ts`: §5.1. The business preset gets `weekly = {0, 6}`.
- No caller changes. `TimeScale`, the engines and the exporters keep calling the existing functions.

**Tests that fail without the change** (`packages/layout/test/working-calendar.test.ts`, new)

- Identity: with an empty set, `workingIndexOf` / `dateAtWorkingIndex` equal `daysBetween` / `addDays` over a multi-year range.
- Business: index of each date in the week of 2026-01-05; a Saturday and a Sunday both map to the Monday's index; `dateAtWorkingIndex(Mon Jan 5, 20)` is Mon Feb 2.
- Long range: index across 3 years matches a brute-force day walk (performance guard: completes well under a millisecond per call).
- `nonWorkingRuns(2026-01-05, 2026-02-02)` returns four runs: Jan 10–11, 17–18, 24–25 and Jan 31–Feb 1. `weekStart` is 1 for business and undefined for full.

**Exit:** `make pre-commit` green with **no** snapshot or determinism change.

### Phase 2: working-day schedule, `hide`

**Change**

- **`TimeScale`:** the `hide` column of §5.2, including `invert`. Callers that recover a date from x by hand (`(x - originX) / pixelsPerDay`, §4.2) switch to `invert`.
- **Engine B** (`computeContentEndDay`, `computeDateWindow`): day offsets become working-day indices. Pins convert with `workingIndexOf`; `length:` counts working days; the window end is `dateAtWorkingIndex`.
- **Engine C** (`scheduleRoadmap`): the same, and its output dates come from `dateAtWorkingIndex`. Keep each exporter's existing inclusive or exclusive end convention (§4.7); the finish is the end of the last working day.
- **Wave floors** (`wave … after:DATE`, anchor, dated milestone) convert through `workingIndexOf` in engines B and C, and through `forward` in engine A (§4.2).
- **Engine A:** nothing beyond `forward` / `invert` (decision 9). Verify by diff: bars of a sequenced business roadmap that starts on a working day do not move.
- **Window and ticks** (`view-preset.ts`, `roadmap-node.ts` extension pass): `tickBoundaryAtOrAfter` and the post-placement extension count working days. Week ticks follow decision 10. Month, quarter and year ticks keep the #92 rule (label from the boundary date, x from `forward`), which now lands hidden boundaries on the seam. Drop zero-width columns. Apply decisions 3 and 4.
- **Now-line:** through `forward`, so a hidden `today` sits on the seam.
- **Positioned model:** §5.3, `nonWorkingDisplay: 'hide'`, run widths 0. Rebuild the runs in the extension pass (`roadmap-node.ts:619-627`) along with the ticks.
- **Renderer:** at the `days` scale only, a faint seam line at each run (new token `timeline.nonWorkingSeam` in every theme, with a contrast test like the wave tokens'). Nothing at week scale and above.
- **Layout insight NW7:** an item whose pinned start (`date:`, `after:DATE`) falls on a non-working day moved; name the item, the pinned date and the date used.
- **Docs:** `dsl.md` § Calendar (replace the #92 sentence about a business `1m` bar being shorter than a month column), `rendering.md` § Timeline Scale (seam rule, week start, dropped columns), CHANGELOG `### Changed`.

**Tests that fail without the change**

- `working-calendar.md` §10 example A, `hide` column, as a `layoutRoadmap` test: W4 at 120–160 relative to the origin, milestone at 152, labels `Jan 05, Jan 12, Jan 19, Jan 26`.
- The same file under `calendar:full` is byte-identical to today (identity guard).
- Engine C on example A: W4 runs Jan 26 – Jan 30; the milestone date is unchanged.
- A roadmap starting on a Saturday: the origin is the Monday seam and nothing renders left of it.
- `today` on a Sunday: the now-line sits on the seam.
- Month ticks for a business span where Feb 1 2026 (a Sunday) is a boundary: the `Feb` column starts at the Monday.
- Waves: a business-calendar wave roadmap with an `after:DATE` floor on a weekend: the next wave opens on the following working day in engines A and C.

**Snapshots and determinism.** The 14 business-calendar layout snapshots and the 10 business determinism fixtures change; the five `calendar:full` waves samples must not (§4.8). Regenerate deliberately (`UPDATE_LAYOUT_SNAPSHOTS=1`; `make compile TARGET=local && UPDATE_DETERMINISM_GOLDENS=1 make determinism`). Diff each one: allowed changes are week-label text, date-pinned entities (anchors, milestones, `date:` / `after:DATE` items), the now-line, the window's right edge and anything sequenced after a moved pin. A sequenced bar that moves without a moved pin upstream is a bug. State the categories in the PR description (AI_POLICY.md asks for it).

### Phase 3: exporters read the calendar

**Change** (§4.7 has the sites)

- **One resolver first** (decision 16): export `resolveWorkingCalendar(file, resolved)` from `@nowline/layout`, make layout and engine C use it, and put the result on `RoadmapSchedule`. Exporter durations come from `deriveItemDurationDays` with the file's calendar and sizes, which fixes `q` and declared sizes at the same time.
- **XLSX:** the working-day duration column uses those durations instead of the hardcoded 5 / 22 / 252. Start / End come from engine C (already the case; they now carry working-day dates). Show the calendar on the Roadmap sheet.
- **MS Project:** `buildCalendarsBlock(working)` writes `<WeekDays>` from the calendar's weekly set; `calendar:full` marks all seven days working. Item tasks carry no `<Start>`, so this calendar is what MS Project schedules them against: it matters more than it looks.
- **Mermaid:** emit `excludes` with the weekly non-working days (`excludes saturday, sunday` for business) and emit durations as working-day `Nd` computed with the file's `days-per-*`, so Mermaid's own arithmetic matches.
- CHANGELOG: `### Changed` for business-calendar output; `### Fixed` for the `calendar:full` MS Project calendar, `q` durations and declared sizes in all three exporters.

**Tests:** each exporter's unit tests gain a business and a full case asserting the emitted calendar and durations; regenerate the affected determinism cells and confirm only those formats moved.

### Phase 4: `show` and the display setting

**Change**

- **Style key** `non-working: hide | show`, roadmap-only, beside `timeline-position` and `minor-grid` (§4.5): resolution, validation (NW6), defaults, `rendering.md` Styles table.
- **Option plumbing** on every surface in §4.6: CLI `--non-working`, help text and `nowline.1`; `@nowline/embed`; the VS Code preview setting; the browser pipeline and preview shell; MCP `render` / `export` input schemas; the GitHub Action input. Precedence per decision 12.
- **`TimeScale`:** the `show` column of §5.2.
- **Engine A:** every duration-to-width site in §4.2 goes through `advanceX`; every start-resolution site (pins, `after:`, the lane cursor, wave floors) goes through `startX`. `MIN_ITEM_WIDTH` and the other pixel clamps stay in pixels.
- **Renderer:** shaded bands in a new layer between `swimlane-bg` and `grid` (§4.4), token `timeline.nonWorkingFill`; re-emitted inside include regions the way wave tints are; plain weekends unshaded at month scale and above.
- **Docs:** `rendering.md` (bands, spanning rule), `cli.md`, `embed.md`, `ide.md`, `mcp.md`.

**Tests**

- §10 example A, `show` column: W4 at 168–208, milestone at 200, ticks at 0 / 56 / 112 / 168, bands at 40–56, 96–112, 152–168, 208–224.
- `hide` and `show` render the same schedule: engine C output is identical under both.
- Wave boundaries per decision 11.
- Each surface's option reaches layout (one test per surface, modelled on the existing `--theme` tests).

### Phase 5: `non-working` declarations

**Change**

1. **Lexer spike first.** A test that builds the parser with `skipValidations: false` and asserts: `non-working` lexes as the keyword; `non-working-team` lexes as `ID`; `non-working:` lexes as a property key, as `calendar:` and `wave:` do today; no ambiguity warnings. If any assertion fails, stop and ask (decision 1).
2. **Grammar:** `NonWorkingDeclaration` in `ConfigEntry`; extend the waves `EntityName` shim so bare-word uses keep parsing; add `non-working` wherever waves added `wave` for values.
3. **Printer and JSON:** the config-entry case (entries keep source order; the printer has no config sort), `through` and `every` in `KEY_ORDER`; no JSON code is needed (§4.5), but add round-trip coverage.
4. **Validator and i18n:** NW1–NW5 (spec §6) with EN and FR messages; `through:` and `every:` on other entities get the existing unknown-property warning.
5. **Includes:** config-merge with parent-wins and the existing shadowing warning; unnamed declarations always merge.
6. **Calendar:** declarations feed `NonWorkingSet` (`dated` and `weekly`); a file's `non-working weekend` replaces the preset's (decision 14); NW4 compares `days-per-week` with the recurring set.
7. **Rendering:** named runs get a labelled seam (`hide`) or labelled band (`show`) with the label packed into the marker row by the existing packer (spec §7.4).
8. **Exporters:** MS Project `<Exceptions>` for dated runs; Mermaid `excludes` with ISO dates.
9. **Tooling:** LSP completion and hover, TextMate grammar, snippets, `nowline.5`, MCP vocabulary and reference resources, `ide.md`, `dsl.md` (keyword tables, Design Rule 1 count, a `### Non-working Declaration` section, rules), README keyword table.
10. **Fixtures:** `examples/working-calendar.nowline` (holidays plus a summit), `tests/non-working-hide.nowline` and `tests/non-working-show.nowline` (one axis each), snapshots for both, a determinism fixture.

**Tests:** spec §10 examples B and C as layout tests (B in both views); the validator rules; include merge and override; the exporter exceptions; every bare-word use of `non-working` that parses today still parses.

## 7. Gotchas

**Identity path**

- **An empty non-working set must reproduce today exactly,** down to rounding: `workingIndexOf` must equal `daysBetween` (which rounds), not a floor. The five waves snapshots and every `calendar:full` test are the guard.
- **Omit optional model fields; never set them to `undefined` or `[]`;** emit no empty layer `<g>` and no unconditional defs (waves rule, `render.ts:2231-2234`).

**Dates**

- **`addDays` truncates fractions** (`setUTCDate`). Engine C's `ScheduledItem` end (`schedule.ts:193-194`) and the window end (`layout.ts:1353`) inherit that today. Do not "fix" it in passing; keep fractional handling identical on the identity path.
- **Dated milestones and anchors keep their calendar date** (rule 5). Engine C round-trips them through `daysBetween` → `addDays` (`schedule.ts:128-130, :301-302`); under a working index that round-trip would snap them. Keep the raw date.
- **`forwardWithinDomain` returns null outside the window.** The window is computed before the lanes run; wave floors already use the unclamped `forward` (`wave-layout.ts:66-69`). Keep it that way.
- **Two scales coexist after the extension pass** (§4.2). They agree only if `pixelsPerDay` and `originX` are identical; under `hide`, compute the extended scale's span in working days so `width / span` gives the same ppd.
- **`today` on a hidden day** goes to the seam, and NL.W1000's in-window test (`layout-insights.ts:257-270`) stays a raw date compare.

**Layout**

- **Pixel quirks stay pixels.** `MIN_ITEM_WIDTH` + `ITEM_INSET_PX` advance the cursor 20 px for short items, group caption spill feeds the lane cursor, and parallel tracks add an 8 px gutter (§4.2). Under `hide` these are fractions of a working day; under `show` a quirk can push a start onto a hidden day, where `startX` snaps it. Engine C never sees them (pre-existing divergences (b)–(d)); do not try to make the engines agree here.
- **The extension pass rebuilds the scale and ticks;** rebuild `nonWorking` there too.
- **Include regions are opaque;** re-emit bands inside them (§4.4).
- **`LayoutContext` has no `today` or `locale`;** the display setting needs a field (or travels on `timeline`).

**Parsing (Phase 5)**

- **Ship the `EntityName` addition with the keyword,** or existing ids spelled `non-working` break.
- **`printNowlineFile` throws on unknown config entries;** the printer case ships with the grammar.
- **The type name loses its hyphen** in `entityTypeLabel` and the LSP `entityKind` (§4.5).
- **`checkUnknownEntityProperties` skips `wave:`;** use an own-key check.
- **Unnamed config entries are dropped by the include resolver today** (§4.5).

**Snapshots**

- **Phase 2 moves 14 snapshots and 10 determinism fixtures at once.** Review them by category (§6, Phase 2), not by eye: render `platform-2026` and `dependencies` (date pins) and `minimal` (no pins) before and after, and check that no bar moved in the no-pin samples.

### 7.1 Incidental findings (not in m2p scope)

Found while mapping the code at `9725e9d`. None blocks this milestone (decision 17).

1. **The CLI ignores `.nowlinerc` `theme` and `width`.** `cli/src/commands/render.ts:119, :121` read only the flags, although `nowline.1` documents both keys. The VS Code extension does read the rc theme.
2. **Stale theme docs.** The `nowline.1` `-t` entry and the GitHub Action (`nowline-action/src/inputs.ts:40-46`) accept only `light | dark`; `grayscale` exists.
3. **MCP `render` describes `now` as "Omit to suppress",** but the code defaults to `todayUtc()` (`mcp/src/server.ts:599-602` vs `:653`).
4. **`LayoutOptions.width` has no effect.** `roadmap-node.ts:235` caps the canvas at `width`, then `:270` takes the max with the natural width, which always wins.
5. **Dead code:** `_buildSwimlane` (`layout.ts:1196-1213`) and `formatDurationDays` (`calendar.ts:182-200`).

## 8. Files to reference

- **Specs:** [`../working-calendar.md`](../working-calendar.md) (design, worked examples), [`../waves.md`](../waves.md) and [`handoff-m2o-waves.md`](./handoff-m2o-waves.md) (engines, barrier, keyword shim precedent), [`../dsl.md`](../dsl.md), [`../rendering.md`](../rendering.md), [`../cli.md`](../cli.md), [`../principles.md`](../principles.md).
- **Precedent PRs:** [#92](https://github.com/lolay/nowline/pull/92) (calendar-aligned ticks, `tickBoundaryAtOrAfter`, the edge-column label rule) and [#91](https://github.com/lolay/nowline/pull/91) (waves).
