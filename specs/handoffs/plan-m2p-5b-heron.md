```
--- KICKOFF: plan complete ---

  Status: 3/3 groups done | completed 2026-10-12
  mode: unattended | proposed unattended (harness=claude-code runner=cloud; plan written in a planning session, kickoff question asked by the executing session) | guard 3x min $50 | fixups 2 | confirmed 2026-10-12 session d2e6b266-7085-567a-b805-c4269ef5a3e8: unattended

  review: every-wave (log-only — parent writes Review log; human gates only where marked)

  Next model
    The [deep] tier at high effort; the skill's model picker names the model per tool.

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-m2p-5b-heron.md. The plan is already tagged.
    On branch claude/plan-m2p-5b-heron-5bcx5v (task branch): subagents commit each finished step.
    Run in unattended mode.
    Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's procedure,
    and pause only where the recorded mode stops. Do not execute plan
    work inline. Update plan progress after each wave returns per the
    skill's procedure. The mode line above is the kickoff answer. If the
    Status line shows BLOCKED, re-post that question and wait; otherwise
    record the mode, print the kickoff summary and begin dispatching.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ | actual tokens | actual $ |
|---|---|---|---|---|
| 1 [exec] m2p-5b s1-s3 | ~14M | ~$5.0 | ~11M (output est.) | ~$4.06 (output est.) |
| 2 [deep] m2p-5b s4-s6 | ~16M | ~$7.0 | ~6.6M (output est.) | ~$3.47 (output est.) |
| 3 [exec] m2p-5b s7-s10 | ~18M | ~$6.5 | ~19M (output est.) | ~$6.06 (output est.) |
| orchestrator | ~6M | ~$4.0 | ~5.6M | ~$3.89 |
| **Total** | ~54M | ~$23 | ~42M | ~$17.48 |

Same basis as the 5a plan (the standard's per-step anchors doubled, since Phase 4 ran about 2× its table), scaled up for 5b's wider surface: six packages, two man pages and three new fixtures against 5a's three packages. Each figure is good to about 2-3×. The guard limit is 3× or $50, whichever is higher: ~$69. The planning session (three code maps, a layout and packing probe) is not in the table.

# m2p Phase 5b: declarations on the chart and in exports

## Context

Phase 5a is on `main` as `e3b2479` (lolay/nowline#115): a file's `non-working` and `working` declarations reach the language, the validator, the one calendar resolver and engines A, B and C. A titled dated run already carries `titles` on the positioned model, but nothing draws them, MS Project has no `<Exceptions>`, and Mermaid writes only weekday names. **5a and 5b ship in the same release** (milestone handoff §1 item 4): until 5b lands, Mermaid lays a holiday-spanning `Nd` across the holiday and MS Project doesn't know about the closure.

5b, from the plan of record (`specs/handoffs/handoff-m2p-working-calendar.md` §6 Phase 5b, §7 gotchas; `specs/working-calendar.md` §7.2, §7.4, §8, §10):
- labelled seams under `hide` and labelled bands under `show`, packed into the marker row;
- MS Project `<Exceptions>` and Mermaid dated `excludes`;
- LSP completion and hover, TextMate, a snippet, the MCP vocabulary and cheatsheet, `ide.md`;
- three fixtures with their snapshots and a determinism fixture;
- docs.

**Byte impact:** none for files without the keywords. Every existing layout snapshot, determinism cell, rendered SVG and Mermaid / MS Project export stays byte-identical. The deliberate additions: two snapshot samples (`non-working-hide`, `non-working-show`), one determinism fixture (`working-calendar`, eight cells), one rendered example and two rendered test fixtures.

**Research basis.** Three read-only code maps and a scratch probe at `a758c72` (`main`, 2026-10-12). The probe ran Node 26.2.0 with `make init && make build-fast`, laid out Example B in both views, called the exported `packMarkerRow` with the Launch milestone and a `Thanksgiving · 2d` entry, temporarily logged the re-pack's real chart bounds from the untracked `dist/`, and exported Example B, Example D and Example E row 1 through the CLI. It was then deleted, and `dist/` was restored. Every `file:line` below was re-read at `a758c72`.

**What the probe found:**
- Under `hide` the titled run sits at x 24, on the major `Nov 30` tick, so `seam` (days scale, off a grid line only, `layout/src/view-preset.ts:445`) is not set. 5b needs its own flag (decision 2).
- The re-pack's chart bounds for Example B are `chartLeftX` 120 and `chartRightX` 250.32 under `hide` (originX 132; 282.32 under `show`). A 98.6 px label at x 24 fits neither right (ends at 128.6 against 118.32, relative to the origin) nor left (starts at −80.6 against −12). `packMarkerRow` then falls back to the left (`roadmap-node.ts:1107-1117`) and the label would draw over the beside header card. Decision 3 grows the canvas for run labels instead.
- Today's Mermaid for Example B is `excludes saturday, sunday` with `Checkout :checkout, 2026-11-23, 5d`. Mermaid ends that bar on Nov 27, while engine C ends it on Dec 2 (exclusive). Adding the two ISO dates makes Mermaid agree with engine C.
- Today's MS Project base calendar for Example B ends `</WeekDays>` then `</Calendar>`, with no `<Exceptions>`. Its `<StartDate>` is the export date (a known limit, spec §8), so exceptions are absolute dates that are independent of it.

## Decisions

1. **Label text.** The run's `titles` joined with `, `, then ` · Nd`, where N counts the days in `[from, through]` whose weekday is in the open-ended week's `workingWeekdays` (`WorkingCalendar.workingWeekdays`, `layout/src/working-calendar.ts:92`).
   - This counts the working days the closure removes, which matches the DSL's `d` as a working day. The separator is U+00B7 with one space on each side.
   - The suffix is dropped when N is 0 (a titled run made only of weekend days).
   - Example B (Thu Nov 26 to Sun Nov 29) gives `Thanksgiving · 2d`. The spec's own example gives `Company summit · 3d` for a Wed to Fri summit. Example E's run gives `Alpha, Beta · 2d`.
   - Only dated, titled, non-working rules give a run titles (`titledRules`, `working-calendar.ts:482-493`). A titled bounded recurrence or a titled `working` rule is never labelled on the chart. That is intended and documented in s9.
2. **Model** (`PositionedNonWorkingRun`, `layout/src/types.ts:209-230`). A run with `titles` gains:
   - `label: string` (decision 1);
   - `labelBox: BoundingBox` and `labelSide: 'left' | 'right'`, in the marker row's coordinates, exactly like `PositionedMilestone.labelBox` / `labelSide` (`types.ts:661`, and `:634-635` on anchors);
   - `cut: true`, under `hide` only, at every scale. The renderer draws the named cut line there. It is independent of `seam`, which keeps its Phase 4 meaning: unnamed, days scale, off a grid line. Spec §7.2: "A named seam always draws."

   Every key is omitted when the run has no titles. The milestone handoff's §7 gotcha applies: never `undefined` or `[]`. Weekend runs never carry titles, so `non-working-identity.test.ts` and every existing model stay deep-equal.
3. **Packing** (`layout/src/nodes/roadmap-node.ts`):
   - **Entity.** A titled run is a `MarkerEntity` (`:1021-1028`) with `id` `nonworking:<ISO from>`, `centerX` = `run.x` (the seam under `hide`, the band's left edge under `show`), `radius` 0, `title` = the label, `fontSize` 10 and `bold` false.
   - **Order.** Run entries are appended after the anchors and milestones in both packs. `packMarkerRow` sorts by `centerX` with a stable sort (`:1065`), so a run that ties a marker on x is placed after it.
   - **Both packs.** `hasMarkerEntities` (`:295`) also counts titled runs, so a file whose only marker-row content is a titled run gets a marker row.
     - The pre-pack (`:329-375`, pack at `:370`) needs the runs before `timeline` exists (`:396`). Build the provisional run list from `timeScale` (`:310`) with `buildNonWorkingRuns` (`view-preset.ts:421-448`). The ticks only decide `seam`, and the titled entries don't depend on it.
     - The unified re-pack (`:714-750`) reads the final runs, which `setNonWorkingRuns` refreshes after the extension pass (`:688`).
     - Write the placements back onto the runs beside the milestone write-back (`:755-761`). Use the same `centerY` arithmetic, `labelBox.y = centerY − 4`.
   - **Canvas growth (run labels only).** Before the swimlane widths are fixed (`:700-705`), and after the extension pass (`:673-690`), check every titled run. If its right-side label would overrun `ctx.chartRightX` and its left-side label would start before `chartLeftX`, call `growChartRightX(ctx, run.x + MARKER_LABEL_GAP_PX + labelWidth + GUTTER_PX)` (`:112`). The packer then places it on the right.
     - Anchors and milestones keep today's fallback, so no existing file moves.
     - This is the probe's Example B case under `hide`: without it the label lands at −80.6, over the header card.
   - **Gotcha** (milestone handoff §7): the extension pass rebuilds the runs (`:688`). Labels must be computed from the final runs, never from the copies the pre-pack used.
4. **Renderer** (`packages/renderer/src/svg/render.ts`). There is one new function, `renderNonWorkingLabels(t, palette, fonts)`. It emits `<g data-layer="non-working-label">` and is called right after the milestone cut lines (`:3009`) and before the marker diamonds (`:3012`), so the cut lines sit over the bars, as milestone cut lines do. For each run with `label`:
   - with `cut`: a `<line>` at `x1 = x2 = run.x`, `y1 = labelBox.y + 4` (the label row's centre), `y2 = t.box.y + t.box.height` (the timeline bottom, as the bands use), stroke `timeline.nonWorkingSeam`, width 1, dash `1 3`;
   - then a `<text>` copied from `renderAnchor`'s label (`:1752-1769`): `x` is `labelBox.x`, or its right edge with `text-anchor="end"` on the left side; `y = labelBox.y + 8` (centre + 4); `font-family` sans, `font-size` 10, fill `timeline.labelText`.

   It returns `''` when no run has a label, so there is no empty `<g>` (milestone handoff §7). It needs no new theme token. The layer name carries no "wave". Include regions are opaque: the region re-emission (`:2148-2152`) concerns bands only and is unchanged, and labels live in the global marker row.
5. **One derivation for the exporters.** `@nowline/layout` gains `calendarExceptions(working, from, to): CalendarException[]`. It lives in `working-calendar.ts` and is exported from `index.ts` beside `type WorkingCalendar` (`:194`).
   - The type: `interface CalendarException { from: Date; through: Date; working: boolean; titles?: string[] }`. `from` and `through` are UTC midnight, `through` inclusive.
   - Each exception is a maximal run of consecutive days whose `isWorkingDay` differs from `workingWeekdays.has(day.getUTCDay())`, split wherever the state flips.
   - **Horizon:** `[from, to)` together with every finite bound of every rule in `working.rules`: its `dates`, and `start` / `end` when set. A half-open bounded recurrence is expanded only inside that horizon. So a declared holiday outside the roadmap window is still exported, and nothing iterates forever.
   - **Titles:** the titles of the dated or ranged rules (no `every`) whose `working` equals the exception's state and that cover any day of it. They follow `working.rules` order (the resolver's canonical order), de-duplicated. The key is omitted when there are none.
   - The exporters call it with `inputs.model.timeline.startDate` and `endDate`.
   - `CalendarRule` and `NonWorkingRun` stay unexported.
6. **MS Project** (`packages/export-msproj/src/calendar.ts`).
   - `buildCalendarsBlock(workingWeekdays)` (`:40-61`) gains a second parameter, `exceptions: readonly CalendarException[]`. When the list is non-empty, it writes `<Exceptions>` in base calendar UID 1 right after `</WeekDays>`: one `<Exception>` per entry.
   - Children follow the MSPDI schema order (`EnteredByOccurrences`, `TimePeriod`, `Occurrences`, `Name`, `Type`, …, `DayWorking`, `WorkingTimes`):
     - `EnteredByOccurrences` 0;
     - `TimePeriod` with `FromDate` `<from>T00:00:00` and `ToDate` `<through>T23:59:00`;
     - `Occurrences` 1;
     - `Name`: the titles joined with `, `, passed through `escapeXml` (`xml.ts:5-12`), omitted without titles;
     - `Type` 1 (daily);
     - `DayWorking` 0 or 1;
     - for a working exception, the same `WorkingTimes` as `dayBlock` (`:23-36`), 08:00–12:00 and 13:00–17:00.
   - Indentation copies `dayBlock`'s house style: a child element sits at its container's indent (compare `<WeekDays>` and `<WeekDay>`, both 6 spaces).
   - No `<WorkWeeks>`. A bounded recurrence becomes one exception per run of days it changes, and the exceptions never overlap. s9 updates spec §8, which says "`<WorkWeeks>` where a bounded recurrence changes the week".
   - The call site is `export-msproj/src/index.ts:148`.
7. **Mermaid** (`packages/export-mermaid/src/index.ts`).
   - One `excludes` line (`:150-152`): the weekday names from `excludedWeekdays` (`:449-453`), then the ISO date of every day in every non-working exception, ascending, all comma-separated.
   - The line is emitted when either list is non-empty, so `calendar:full` with a holiday now gets `excludes 2026-11-26` where it had none.
   - Working exceptions can't be expressed. Mermaid's parser has an undocumented `includes` keyword, but the gantt docs don't list it and GitHub's bundled Mermaid may lack it. They are counted instead: `DropCounts` (`:76-104`) gains `workingDay` (days), formatted `working-day` and ordered last in `formatDrops` (`:503-525`), with a `formatDropKey` case.
   - s9 documents the gap as a known limit in spec §8.
8. **Tooling.**
   - **TextMate** (`grammars/nowline.tmLanguage.json`):
     - The line-start keyword pattern (`:50-55`) widens to `^\s*(wave|non-working|working)(?![\w-])(?=\s)`. It stays at index 0, so `textmate-wave.test.ts:15-17`, which indexes patterns by position, keeps working.
     - The general keyword list (`:58`) is unchanged: `item working` stays an identifier.
     - The property-key list (`:65`) gains `end` and `every`.
     - Weekday names are not coloured as enum values, since they'd colour ids such as `item sat`.
   - **Completion** (`packages/lsp/src/providers/completion.ts`, `acceptValueCompletions` `:78-125`):
     - `every:` offers `sun mon tue wed thu fri sat` (EnumMember, detail `weekday`);
     - `non-working:` offers `hide` and `show` (EnumMember, detail `non-working display`).
     - The keywords already come from Langium's grammar completion. s2 adds a test, and adds code only if it fails.
   - **Hover** (`hover.ts`, `ast-utils.ts`):
     - `NonWorkingDeclaration` and `WorkingDeclaration` join the `NamedEntity` union (`ast-utils.ts:132-150`) and `declarationAt` (`:314-341`).
     - They do not join `collectNamedEntities` (`:159-165`): nothing references a declaration by id, so it must not show up in reference completion, definition or rename.
     - `hoverFor` surfaces `date`, `every`, `start`, `end` for those two kinds only. Other kinds keep the list at `hover.ts:90-99`, so item hovers don't change.
     - `entityKind` (`:365-372`) already returns `non-working` / `working`.
   - **Snippets** (`packages/vscode-extension/snippets/nowline.json`, after `Wave` at `:25-29`), with no choice lists (`lsp/test/snippets.test.ts:40-47` allows choices only for `scale`, `status`, `size`):
     - `Non-working days`, prefix `non-working`: `non-working ${1:id} "${2:Title}" start:${3:2026-11-26} end:${4:2026-11-27}$0`;
     - `Working exception`, prefix `working`: `working ${1:id} "${2:Title}" date:${3:2026-01-10}$0`.
   - **MCP** (`packages/mcp/src/`):
     - `schema-vocab.ts` gains `configKeywords: ['scale', 'calendar', 'style', 'symbol', 'default', 'non-working', 'working']` and `calendarDeclarationKeys: ['date', 'start', 'end', 'every']`, plumbed through `SchemaOutputSchema` (`schemas.ts:105-107`) and the `schema` tool (`server.ts:1366-1368`);
     - `reference-cheatsheet.ts` gains a short "Working calendar" section before "Config / includes" (`:56-58`), with Example B's declaration line and one sentence on `hide` / `show`.

## Change (critical files)

**Layout** (`packages/layout/src/`):
- `types.ts` (decision 2);
- `nodes/roadmap-node.ts` (decision 3);
- a label helper (decision 1) in `view-preset.ts` beside `buildNonWorkingRuns`;
- `working-calendar.ts` and `index.ts` (decision 5).

**Renderer:** `packages/renderer/src/svg/render.ts` (decision 4).

**Exporters:**
- `packages/export-msproj/src/calendar.ts` and `index.ts`;
- `packages/export-mermaid/src/index.ts`;
- `packages/export-msproj/README.md:82-84`;
- `packages/export-mermaid/README.md:61-64`.

**Tooling:**
- `grammars/nowline.tmLanguage.json`;
- `packages/lsp/src/providers/completion.ts` and `hover.ts`;
- `packages/lsp/src/references/ast-utils.ts`;
- `packages/vscode-extension/snippets/nowline.json`;
- `packages/mcp/src/schema-vocab.ts`, `schemas.ts`, `server.ts` and `reference-cheatsheet.ts`.

**Fixtures** (s8):
- `examples/working-calendar.nowline`;
- `tests/non-working-hide.nowline` and `tests/non-working-show.nowline`;
- `scripts/render-samples.mjs` (19 → 20 entries) and `scripts/render-tests.mjs` (24 → 26, `MANIFEST` `:35`);
- `packages/integration-tests/test/snapshot.helpers.ts` `SAMPLES` (`:73-120`, 20 → 22) and the two new `__snapshots__` files;
- `packages/integration-tests/determinism/spec.ts` `FIXTURES` (`:94-170`, 12 → 13) and `hashes.json` (8 new cells).

**Docs** (s9):
- `specs/rendering.md`:
  - the positioned-model bullet (`:55`);
  - the Bands rule (`:169`, "its label belongs to Phase 5");
  - a labelled-seams rule beside it;
  - the Z-order list (`:637`), which gains `non-working-label` after the cut lines.
- `specs/working-calendar.md`:
  - status;
  - §7.4 "as built";
  - §7.5 new keys;
  - §8:
    - the MS Project row (`<Exceptions>`, no `<WorkWeeks>`, decision 6);
    - the Mermaid row;
    - the Phase 5a paragraph (now "5a and 5b");
    - known limits: Mermaid has no working exceptions; only dated titled rules are labelled.
  - §10 Example B: the labels and both exports.
- `specs/dsl.md` `### Non-working Declaration` (`:989-1057`): the title row (`:1011`, "a later phase draws it") now says how the label reads.
- `packages/cli/man/nowline.5` (`:581`, "a label for it is not drawn yet") and `packages/cli/man/fr/nowline.5` (`:630-631`), with the translation stamp (`fr/nowline.5:8`).
- `specs/ide.md`:
  - TextMate keyword and property rows (`:25`, `:27`);
  - Autocomplete (`:44`);
  - Hover (`:48`).
- `specs/handoffs/handoff-m2p-working-calendar.md`:
  - the status line (`:3`): 5a merged as `e3b2479`, 5b implemented;
  - the 5b row (`:25`).
- `README.md` keyword table (`:194-207`), if a row needs the label.
- `CHANGELOG.md` `### Added` (`:9`).

## Tests (fail without the change unless marked guard)

**Conventions** (as in 5a):
- Layout tests use `parseAndResolve` and `layoutRoadmap(file, resolved, { theme: 'light', today: utc(2026, 2, 9), nonWorking })`. Reuse the helpers in `layout/test/non-working-declarations.test.ts:32-121` (`withDeclarations`, `lay`, `runsOf`, `box`, `milestoneX`, `THANKSGIVING` `:123`, `EXAMPLE_B_BODY` `:126`).
- Pixels are relative to `timeline.originX` (132 for Example B, a beside header 120 wide plus `GUTTER_PX` 12).
- Label widths are `estimateTextWidth` = characters × 10 × 0.58 (`text-measure.ts:15`), × 1.05 for bold milestones. `Thanksgiving · 2d` is 17 characters, so 98.6 px. `Launch` is 36.54 px.
- Marker rows are 26 px apart. `timeline.markerRow.y` is row 0's centre, and a label box's `y` is its row centre − 4.
- **Probed** values came from the planning probe at `a758c72`. **Derived** values follow from the probed bounds and decisions 1-3, and were not run, because they need the change. A derived literal that disagrees after an honest implementation is gate 1, never a silent edit.

**Example B, both views** (`layout/test/non-working-declarations.test.ts`, new describe `Example B labels (5b)`). Today's model values (spec §10: boxes, ticks, `endDate`, the run `x`/`width`/`from`/`through`/`titles`/`band`) stay exactly as the existing 5a cases (`:138-217`) assert them. Those cases stay green and untouched (guard).

| | hide | show |
|---|---|---|
| titled run | `label` `Thanksgiving · 2d`; `cut: true`; `labelSide` `right`; `labelBox` x 30, width 98.6, height 12 (derived) | `label` `Thanksgiving · 2d`; no `cut`; `labelSide` `right`; `labelBox` x 30, width 98.6 (probed) |
| run row | 0: `labelBox.y` = `markerRow.y − 4` (derived) | 1: `labelBox.y` = `markerRow.y + 22` (probed) |
| Launch milestone | x 24 (`hiddenDate` `2026-11-28`); `labelSide` `right`; `labelBox` x 36, width 36.54; row 1: `center.y` = `markerRow.y + 26` (derived) | x 40; `labelSide` `right`; `labelBox` x 52, width 36.54; row 0: `center.y` = `markerRow.y` (probed) |
| `markerRow.height` | 52, was 26 (derived) | 52, was 26 (probed) |
| model `width` | 272.6 = 132 + 30 + 98.6 + 12, was 250.32 (derived, decision 3 canvas growth) | 282.32, unchanged (probed) |
| weekend run `2026-12-05`–`2026-12-06` | no `label`, `labelBox`, `labelSide` or `cut` key | same |

- **Packing against a milestone on the same date** is the `hide` column. Launch (Nov 28, hidden) and the run share x 24. Launch is placed first (decision 3's order) on row 0, right. The run's right side collides and its left side starts before `chartLeftX`, so it takes a new top row on the right. Launch moves to row 1.
- **Without canvas growth** (a regression pin): under `hide`, `labelSide` must not be `left`. Today's fallback would give x −80.6.
- **Engine C** is unchanged from 5a: checkout `2026-11-23`–`2026-12-02`, qa `2026-12-02`–`2026-12-04`.
- **Example E's titles** (the fixture of `layout/test/calendar-resolver.test.ts:387-401`: `non-working "Beta" start:2026-12-24 end:2026-12-25` and `non-working "Alpha" date:2026-12-24` on `roadmap r "R" start:2026-12-21 scale:1w`, business): the run's `label` is `Alpha, Beta · 2d`, in either declaration order.
- **A weekend-only titled run** (`non-working "Sat off" date:2026-11-28` on Example B's roadmap, no Thanksgiving) has `label` `Sat off`, with no suffix.
- **A file whose only marker-row content is a titled run** (Example B without the milestone) has `markerRow.height` 26, where it would otherwise be 0.
- **Guard:** Example B without the declaration, and every existing layout test, stay deep-equal. No run outside the titled ones gains a key (`non-working-identity.test.ts` untouched).

**Renderer** (`packages/renderer/test/non-working.test.ts`, beside the seam tests `:81-173` and band tests `:270-393`):
- **hide, Example B:**
  - exactly one `<g data-layer="non-working-label">`;
  - inside it one `<line>` with `x1="156"` and `x2="156"` (132 + 24), `stroke="#a0aec0"`, `stroke-width="1"`, `stroke-dasharray="1 3"`, `y1` = the run's `labelBox.y + 4` and `y2` = `timeline.box.y + timeline.box.height`;
  - one `<text x="162" … font-size="10" fill="#64748b">Thanksgiving · 2d</text>`, with no `text-anchor`.
- **show, Example B:**
  - the layer holds the `<text x="162">` and no `<line>`;
  - the band `<rect>` is unchanged from today.
- **Left side:** a model whose run has `labelSide: 'left'` renders `text-anchor="end"` at `labelBox.x + labelBox.width`. Build that model by hand, as the seam tests do.
- **Dark and grayscale:** the line uses `#6b7a90` / `#9a9a9a` and the text `#cbd5e1` / `#737373` (`themes/dark.ts:128-131`, `grayscale.ts:129-132`).
- **Order:** the layer comes after the last milestone cut line and before the first `data-layer="milestone"`.
- **Guard:** a model with no labelled run emits no `non-working-label` string at all, in either view (Example A, and `weekends-show`).

**`calendarExceptions`** (`layout/test/calendar-exceptions.test.ts`, new). Each case takes `resolveWorkingCalendar(file, resolved).working` and the model's `timeline.startDate` / `endDate`, with dates as ISO strings:
- Example B: `[{ from: '2026-11-26', through: '2026-11-27', working: false, titles: ['Thanksgiving'] }]`.
- Example D (spec §10: Example A plus `working crunch "Crunch Saturday" date:2026-01-10`): `[{ from: '2026-01-10', through: '2026-01-10', working: true, titles: ['Crunch Saturday'] }]`.
- Example E row 1 (`non-working every:fri start:2026-01-12 end:2026-01-25`): `[{ from: '2026-01-16', through: '2026-01-16', working: false }, { from: '2026-01-23', through: '2026-01-23', working: false }]`, with no `titles` key.
- Example E row 2 (`working every:sat start:2026-01-12 end:2026-01-25` and `non-working date:2026-01-17`): `[{ from: '2026-01-24', through: '2026-01-24', working: true }]`. Jan 17 matches the open week, so it isn't an exception.
- Example E's titles (Beta and Alpha above): `[{ from: '2026-12-24', through: '2026-12-25', working: false, titles: ['Alpha', 'Beta'] }]`, in either declaration order.
- Outside the window: Example B plus `non-working newyear "New Year" date:2027-01-01` also yields `{ from: '2027-01-01', through: '2027-01-01', working: false, titles: ['New Year'] }`.
- Half-open: Example A plus `non-working every:wed start:2026-01-20` yields one exception per Wednesday from 2026-01-21 up to the window end, and none after it.
- **Guard:** every preset with no declarations gives `[]`.

**MS Project** (`packages/export-msproj/test/calendar.test.ts`, plus Example B through the kernel in `integration-tests/test/non-working-declarations-export.test.ts`):
- Example B: the base calendar (UID 1) contains exactly this, right after the `      </WeekDays>` line:

  ```
        <Exceptions>
        <Exception>
          <EnteredByOccurrences>0</EnteredByOccurrences>
          <TimePeriod>
            <FromDate>2026-11-26T00:00:00</FromDate>
            <ToDate>2026-11-27T23:59:00</ToDate>
          </TimePeriod>
          <Occurrences>1</Occurrences>
          <Name>Thanksgiving</Name>
          <Type>1</Type>
          <DayWorking>0</DayWorking>
        </Exception>
        </Exceptions>
  ```

  It is followed by `    </Calendar>`. The resource calendar (UID 2) is unchanged. `<WeekDays>` still marks Saturday and Sunday non-working (the kernel test's `weekDays` helper, `:59-69`).
- Example D: one `<Exception>` with `FromDate` / `ToDate` `2026-01-10`, `Name` `Crunch Saturday`, `DayWorking` 1, and the two `WorkingTime` blocks of `dayBlock`.
- Example E row 1: two `<Exception>` blocks (`2026-01-16`, `2026-01-23`) and no `<Name>` inside `<Exceptions>`.
- Escaping: a title `R&D "offsite"` gives `<Name>R&amp;D &quot;offsite&quot;</Name>`.
- **Guard:** `BUSINESS_WEEK_DAYS` (`:65-144`) and every existing exporter test stay green. Example C (`non-working weekend every:[fri, sat]`, open-ended only) has no `<Exceptions>`.

**Mermaid** (`packages/export-mermaid/test/calendar.test.ts`, and the kernel test):
- Example B: `    excludes saturday, sunday, 2026-11-26, 2026-11-27`, exactly one `excludes` line. Today's task lines stay as they are (`Checkout :checkout, 2026-11-23, 5d`, `QA :qa, after checkout, 2d`, `Launch :milestone, launch, 2026-11-28, 0d`). No drop summary.
- Example D: `    excludes saturday, sunday`, and the drop summary `%% Mermaid lossy export — Nowline features dropped:` / `%% working-day (1)`.
- Example E row 1: `    excludes saturday, sunday, 2026-01-16, 2026-01-23`.
- `calendar:full` with `non-working h date:2026-03-02`: `    excludes 2026-03-02`.
- **Guard:** Example C keeps `    excludes friday, saturday` (5a's test at `non-working-declarations-export.test.ts:71-75`), and business with no declarations keeps `    excludes saturday, sunday`.

**LSP** (new `packages/lsp/test/providers/calendar-declarations.test.ts`, modelled on `waves.test.ts`):
- **Completion:**
  - on a blank line after `config`, the labels include `non-working` and `working`;
  - after `every:` and after `every:[mon, `, the `EnumMember` items are exactly the seven weekday labels, in `sun`…`sat` order (Langium may add keyword items beside them; don't assert on those);
  - after `default roadmap non-working:`, the `EnumMember` items are exactly `hide` and `show`.
- **Hover:** on `thanksgiving` in Example B's declaration, the Markdown is exactly `` **non-working `thanksgiving`** ``, `_Thanksgiving_`, a blank line, `` - `start:` 2026-11-26 ``, `` - `end:` 2026-11-27 ``, joined with `\n`. On `crunch` in Example D it starts `` **working `crunch`** `` and lists `` - `date:` 2026-01-10 ``. On `every:[thu, fri]` it renders `` - `every:` thu, fri ``.
- **No leakage:** `after:` completion in Example B doesn't offer `thanksgiving`, and go-to-definition and references on `thanksgiving` return nothing new.
- **Guard:** `hover.test.ts`, `completion.test.ts` and `waves.test.ts` stay green untouched.

**TextMate** (`packages/lsp/test/textmate-non-working.test.ts`, extended):
- The line-start keyword captures `non-working` in `non-working thanksgiving "Thanksgiving" date:2026-11-26` and `working` in `  working crunch date:2026-01-10`.
- It captures neither in `non-working-team`, `working-group`, `item working`, `after:working`, `non-working:show`, or a bare `working`.
- The property-key pattern captures `every` in `non-working w every:[sat, sun]`, and `end` in `start:2026-01-01 end:2026-01-02`.
- `default roadmap non-working:show` still captures `non-working` as a style key (existing test).
- **Guard:** `textmate-wave.test.ts` and `textmate-hyphen-boundaries.test.ts` green untouched.

**Snippets** (`packages/lsp/test/snippets.test.ts`): the `non-working` and `working` snippets, with their placeholders at the defaults inside `nowline v1\n\nconfig\n\n<line>\n\nroadmap r "R" start:2026-01-05\n`, validate with no diagnostics.

**MCP** (`mcp.smoke.test.ts:625-638`): `schema` returns `configKeywords` containing `non-working` and `working`, and `calendarDeclarationKeys` equal to `['date', 'start', 'end', 'every']`. The cheatsheet test, if one exists, asserts the new section; otherwise assert `reference` with no format contains `non-working`.

## Byte identity (the gate for every wave)

1. **Baseline (s1, before any source edit):**
   - `make build && make test`;
   - `make compile TARGET=local && make determinism`;
   - hash the 43 rendered SVGs (19 `examples/*.svg` from `render-samples.mjs`, 24 `tests/*.svg` from `render-tests.mjs`) into `.scratch/m2p-5b/svg-baseline.sha256`;
   - export Mermaid and MS Project for every tracked `examples/**/*.nowline` and `tests/*.nowline` with the built CLI (`node packages/cli/dist/index.js <file> -f mermaid -o <out>`, the same for `msproj`) into `.scratch/m2p-5b/export-baseline/`.
     - The determinism gate covers only 12 fixtures, and MS Project's `<StartDate>` is the export date, so pass `--now 2026-02-09` on both runs. The planning probe confirmed that it pins `<StartDate>2026-02-09T08:00:00</StartDate>`.
     - Note the files the CLI rejects, and skip them both times.
2. **After s3, after W2, after s7, and at the final gate:**
   - `make build`, then `sha256sum -c` on the SVG baseline: every line OK;
   - the export re-run, `diff -r` against the export baseline: empty;
   - `make test` with no snapshot diff (never set `UPDATE_LAYOUT_SNAPSHOTS` before s8);
   - `make compile TARGET=local && make determinism` green, with `git diff --exit-code packages/integration-tests/determinism/hashes.json` (until s8).
3. **Deliberate additions (s8 only):**
   - `git diff --stat main -- '**/__snapshots__/**'` lists exactly two new files and no modified ones;
   - `git diff main -- packages/integration-tests/determinism/hashes.json` adds exactly the eight `working-calendar:*` cells and changes no other line.

## Out of scope

- **Per-region calendars** for isolated includes (decision 7 of the milestone handoff; not in m2p).
- **XLSX:** the Calendar row stays the open week's summary. Listing exceptions there is a possible follow-up, not 5b (the milestone handoff names no XLSX change).
- **Labels for titled bounded recurrences or titled `working` rules** (decision 1). Documented, not built.
- **Mermaid `includes`** (decision 7).
- **Findings to list in the PR, not fix:**
  - anchors and milestones keep the left fallback that can draw over a beside header (`roadmap-node.ts:1107-1117`); decision 3's growth covers run labels only;
  - the general TextMate keyword list (`:58`) still lacks `wave`;
  - the `build-fast` help text says "~30-SVG" (43 before 5b, 46 after).

## Verification

- `make pre-commit` green;
- `make pack-mcpb`;
- `make bundle-size` under 200 KB (record the before and after; 5b adds a little layout and renderer code);
- every byte-identity step above;
- CI green on the PR head, including the determinism gate.

## Orchestration (personal-plan-orchestrate, as in 5a)

**Runner and branch:**
- This plan reaches `main` through its own plan-only PR, as 5a's did (lolay/nowline#114).
- The executing session runs on its harness-assigned branch, cut from `main` after that PR merges. If that branch differs from the one in the Kickoff prompt, it rewrites the prompt's `On branch` line (the skill allows exactly that) and opens the 5b PR from there.
- The plan and its handoff are removed as the branch's last commit.

**Toolchain (every agent):**
- The container ships Node 22. Install the official Node 26.2.0 linux-x64 tarball into `$HOME`, verify it against `SHASUMS256.txt`, and put its `bin` first on `PATH` in every shell (shell state does not persist between calls).
- pnpm 12.8.1 is preinstalled at `/opt/node22/bin/pnpm`. Append `/opt/node22/bin` to `PATH` after Node 26's `bin`.
  - Never run `corepack enable` with Node 26: its pnpm shim looks for `bin/pnpm.cjs`, which pnpm 12 no longer ships, and `make init` fails with `MODULE_NOT_FOUND`. The planning probe hit this.
  - Never run `playwright install`.
- Makefile targets only, for build, test, lint, format and determinism; `make format` fixes Biome drift. Single-file Vitest runs are allowed for red/green iteration inside a step, never as a gate.

**Waves:**
- Each wave is a one-agent Workflow with `model` and `effort` set for its tier, at high effort.
- W2's three steps run serially in one agent: the renderer reads the model s4 builds.

**Gates (fail closed; a notification or a non-answer is never approval):**
- After W1: gate 2. The step-up from exec to deep is the review point for the tooling and the red layout and renderer tests before Opus spend.
- Gate 1 on any error, any byte move outside s8's deliberate additions, a derived literal that disagrees, or weak output.

**Commits:**
- `make pre-commit` before every commit.
- One exception, as in Phase 4 and 5a: the s3 red-test commit. Its `make pre-commit` run may fail only in the tests s3 adds (listed in the commit body); lint must pass.
- Push before every wait.

**Every subagent prompt:**
- gives the exact trailers, in this order: `Claude-Session: <the executing session's link>`, then `Assisted-by: Claude Code` last, with no `Co-authored-by`;
- says those trailers override any harness attribution reminder;
- forbids model names in commits, files, comments and the PR body;
- says subagents commit when told and never push.

**Artifacts:** `.scratch/orchestrate-plan-m2p-5b-heron-{wave}-{task}.md`.

## m2p 5b steps

--- WAVE 1 [exec] ---

### s1 - [exec] Toolchain and baselines (done)
- If `main` has moved past `a758c72`, merge it into the branch first (a merge commit, no rebase). Re-check every `file:line` this plan cites, and the probe's bounds (Example B: `chartLeftX` 120, `chartRightX` 250.32 / 282.32). Gate 1 if a cited site or a probed value moved.
- Install the toolchain (§ Orchestration), then `make init && make build-fast`.
- Then byte identity step 1, before any source edit.
- Done when both baselines exist and determinism is green with `hashes.json` unchanged.

### s2 - [exec] Tooling, test first (done)
- Decision 8, test first: write the LSP, TextMate, snippet and MCP cases from § Tests red, then implement.
- Update `specs/ide.md` (`:25`, `:27`, `:44`, `:48`) in this step, since it describes exactly this behaviour.
- Done when those tests are green, byte identity step 2 passes (tooling touches no render path) and `make pre-commit` is green. Then commit.

### s3 - [exec] Failing tests for labels and the renderer (done)
- Write the layout and renderer cases in § Tests (Example B labels, the packing pin, Example E's label, the weekend-only label, the marker-row-only file, the renderer cases), with their literals. `calendarExceptions` and the exporters are tested first in s7, so W2's commit gate can go green.
- Done when:
  - each new case fails on an assertion, not a crash, where possible;
  - every guard is green;
  - nothing outside `*/test/` changed;
  - `make lint` passes.
- Commit per § Orchestration's exception.

--- STOP: gate 2 ---

```
  Suggested chat title: Wave 2 of 3 [deep] m2p-5b s4-s6
  Tier change [exec] -> [deep]: review W1 (tooling committed green; s3 red layout and renderer tests) before Opus spend.
  Next model: Claude Code Opus 5.5 at high effort; Cursor Opus 5.5 high.
  Scope: s4-s6 only; halt at the end of W2 and report.
```

--- WAVE 2 [deep] ---

### s4 - [deep] Labels, packing and canvas growth (done)
Decisions 1-3. Done when every s3 layout case is green with its literal unchanged. A derived literal that disagrees is gate 1: report the value, the reason, and whether the decision or the literal is wrong.

### s5 - [deep] Renderer (done)
Decision 4. Done when every s3 renderer case is green.

### s6 - [deep] Prove nothing moved, then commit (done)
- Byte identity step 2 in full, then `make bundle-size`, then `make pre-commit`.
- Then commit and push.
- Gate 1 on any byte move.

--- WAVE 3 [exec] ---

### s7 - [exec] Exceptions, MS Project and Mermaid (done)
- Decisions 5-7, test first: write the `calendarExceptions`, MS Project and Mermaid cases from § Tests red, then implement.
- Done when they are green, byte identity step 2 passes (export diff empty: no existing fixture has a dated or bounded rule) and `make pre-commit` is green. Then commit.

### s8 - [exec] Fixtures, snapshots, determinism (done)
- Write the three fixtures. Each is in canonical printer form: run `node packages/cli/dist/index.js <file> -f nowline -o -` and keep its output, so the `examples/` round-trip test (`packages/cli/test/convert/roundtrip.test.ts`) passes. Each opens with a comment block like `tests/weekends-show.nowline:3-14`.
  - `tests/non-working-hide.nowline`: Example B renamed `roadmap non-working-hide "Named days hidden"`, plus `non-working summit "Company summit" start:2026-12-09 end:2026-12-11` and a third item `item rollout "Rollout" duration:2w`, so the chart shows `Thanksgiving · 2d`, `Company summit · 3d` and the shared-x packing with Launch.
  - `tests/non-working-show.nowline`: the same body with `default roadmap non-working:show` in its config and `roadmap non-working-show "Named days shown"`. The one stressed axis is the view.
  - `examples/working-calendar.nowline`, "holidays plus a summit": a user-grounded quarter.
    - `roadmap working-calendar "Holiday quarter" start:2026-11-02 scale:1w calendar:business`.
    - Declarations: `non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27`, `non-working winter-break "Winter break" start:2026-12-24 end:2027-01-01`, `non-working summit "Company summit" start:2027-01-13 end:2027-01-15` and `working launch-prep "Launch prep Saturday" date:2027-01-23`.
    - Content: two swimlanes (`platform`: API v2 3w, Data migration 2w, Hardening 2w; `web`: Design refresh 2w, Build 4w, Beta 1w), `anchor kickoff date:2026-11-02` and `milestone launch "Launch" date:2027-01-29`.
    - The winter break label reads `Winter break · 7d`. The worker may adjust durations only to clear a diagnostic, and says so in the commit body.
- `make build` renders them. Check each SVG contains its labels (`grep -c 'Thanksgiving · 2d'` and the others).
- Add the render entries: `render-samples.mjs` `{ slug: 'working-calendar', source: 'examples/working-calendar.nowline', theme: 'light', now: NOW }`, and `render-tests.mjs` `non-working-hide` and `non-working-show` with `now: '2026-11-25'`.
- Add `SAMPLES` entries `non-working-hide` and `non-working-show` (dir `tests`, light) with a comment "m2p phase 5b: labelled seams and bands; the only deliberate additions". Then `UPDATE_LAYOUT_SNAPSHOTS=1 make test` once, and inspect both new snapshot files.
- Add `FIXTURES` entry `{ id: 'working-calendar', sourceFile: 'working-calendar.nowline', dir: 'examples', theme: 'light', browser: false }` after `weekends-show`. Then `make compile TARGET=local && make determinism-update`, and `make determinism` green.
- Done when byte identity step 3 holds and `make pre-commit` is green. Then commit.

### s9 - [exec] Docs (done)
Everything under § Change "Docs". The `working-calendar.md` §10 Example B text must match § Tests literally (labels, the MS Project block, the Mermaid line). Done when `make lint` passes and the man-page translation gate (`packages/cli/test/man/translation-parity.test.ts`) is green: the French `nowline.5` carries every English change first, and only then is its stamp replaced with the line the failing test prints. Then commit.

### s10 - [exec] Gates, commit, push, PR (done)
1. Run § Verification in full.
2. Commit with the exact trailers, and push.
3. Remove this plan and its handoff as the last commit, and push.
4. Open a PR to `main`, titled "Draw and export named non-working days (m2p phase 5b)". The body follows the repo template (`.github/PULL_REQUEST_TEMPLATE.md`: Summary, Motivation, How I tested this, Screenshots / terminal output, AI assistance, Checklist) and lists:
   - the byte impact (none for files without the keywords; the deliberate additions by name);
   - that 5a and 5b now ship together;
   - the decision 6 deviation from spec §8 (no `<WorkWeeks>`), now written into the spec;
   - the findings from § Out of scope.
5. Subscribe to the PR, and drive it to green. A maintainer queues it; a failure in the merge queue's run counts as red CI.

## Review log

review wave-1 (nowline s1,s2,s3) 72b4376..84f3b6d: PASS - baselines under .scratch/m2p-5b/ (43 SVG hashes, 52 Mermaid/MS Project export pairs pinned with --now 2026-02-09); probe bounds re-checked unchanged; s2 tooling matches Decision 8 (rename and references skip calendar declarations since declarationAt now returns them; snippet test wraps in a roadmap with a swimlane because NL.E0004 rejects the plan's swimlane-less wrapper); s3 adds 12 layout and 7 renderer red cases, all assertion failures, literals match § Tests; make lint green - 2026-10-12
review wave-2 (nowline s4,s5,s6) 9a6b159..50206d6: PASS - Decisions 1-4 implemented; all 12 s3 layout and 7 renderer cases green with literals unchanged, no test file edited; byte identity step 2 clean (43 SVG hashes, 52 export pairs, snapshots, determinism hashes.json); bundle 193.33 KB of 200 KB (192.84 before); pre-pack packs against a right edge widened for provisional run labels (not in decision 3, accepted: no effect on files without titled runs); passed unattended: gate 2 - 2026-10-12
review wave-3 (nowline s7,s8,s9,s10) 09eb264..fb564b5: PASS - calendarExceptions, MS Project <Exceptions> and Mermaid dated excludes plus working-day count match Decisions 5-7 with the § Tests literals; three fixtures canonical, SVGs carry their labels, byte identity step 3 holds (two new snapshots, eight working-calendar hashes.json cells only); docs incl. working-calendar.md §10 literal match, French nowline.5 stamp replaced; § Verification green, s10 empty; PR drafted, not opened; minor doc nits noted, not defects - 2026-10-12

## Token log

**Counting header (Claude Code)** — as in the 5a plan (`plan-m2p-5a-kestrel.md`, lolay/nowline#114):

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `orchestrator-wave-N`, or `wave-N-fix`; `<group-id>` is the wave's group id with hyphens (`m2p-5b-s1-s3`); `<model>` is `message.model` without a date suffix. Round to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` plus `<session-id>/subagents/**/agent-*.jsonl`. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (and `ephemeral_1h_input_tokens`, marked `1h`), output `output_tokens`. Calls with no `stop_reason` line: estimate output and mark the line `(output est.) session <id>`.
- Rates, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.

Phase 1 ~$20.42; Phase 2 ~$66.4; Phase 3 ~$51.05; Phase 4 ~$27.6; Phase 5a expected ~$18. Rows are added per wave by the executing session.

tokens orchestrator-resume plan-m2p-5b-heron (claude-opus-5-5): input ~34 / cache read ~2M / cache write ~0 5m + ~190k 1h / output ~12k | ~$2.16 API-equiv
tokens wave-1 nowline-s1-s2-s3 (claude-sonnet-5-5): input ~130 / cache read ~8.7M / cache write ~200k / output ~64k | ~$2.88 API-equiv (output est.) session d2e6b266-7085-567a-b805-c4269ef5a3e8
tokens review-wave-1 nowline-s1-s2-s3 (claude-opus-5-5): input ~50 / cache read ~1.5M / cache write ~82k / output ~24k | ~$1.18 API-equiv (output est.) session d2e6b266-7085-567a-b805-c4269ef5a3e8
tokens orchestrator-wave-1 nowline-s1-s2-s3 (claude-opus-5-5): input ~14 / cache read ~980k / cache write ~0 5m + ~19k 1h / output ~8.6k | ~$0.52 API-equiv
tokens wave-2 nowline-s4-s5-s6 (claude-opus-5-5): input ~96 / cache read ~5.9M / cache write ~150k / output ~48k | ~$2.90 API-equiv (output est.) session d2e6b266-7085-567a-b805-c4269ef5a3e8
tokens review-wave-2 nowline-s4-s5-s6 (claude-opus-5-5): input ~20 / cache read ~400k / cache write ~59k / output ~10k | ~$0.57 API-equiv (output est.) session d2e6b266-7085-567a-b805-c4269ef5a3e8
tokens orchestrator-wave-2 nowline-s4-s5-s6 (claude-opus-5-5): input ~22 / cache read ~1.9M / cache write ~0 5m + ~30k 1h / output ~18k | ~$0.99 API-equiv
tokens wave-3 nowline-s7-s8-s9-s10 (claude-sonnet-5-5): input ~200 / cache read ~17M / cache write ~250k / output ~98k | ~$4.93 API-equiv (output est.) session d2e6b266-7085-567a-b805-c4269ef5a3e8
tokens review-wave-3 nowline-s7-s8-s9-s10 (claude-opus-5-5): input ~32 / cache read ~1.2M / cache write ~110k / output ~16k | ~$1.13 API-equiv (output est.) session d2e6b266-7085-567a-b805-c4269ef5a3e8
tokens orchestrator-wave-3 nowline-s7-s8-s9-s10 (claude-opus-5-5): input ~3 / cache read ~420k / cache write ~0 5m + ~15k 1h / output ~810 | ~$0.22 API-equiv

## Completion summary

**Completed**: 2026-10-12
**What shipped**: m2p phase 5b on `claude/plan-m2p-5b-heron-5bcx5v` (`72b4376..fb564b5`, ten step commits over three waves, every review PASS). Titled dated non-working runs are labelled in the marker row (`Thanksgiving · 2d`), with a named dotted cut line under `hide` and a label at the band's edge under `show`, and the canvas grows on the right for run labels. `calendarExceptions` in `@nowline/layout` feeds MS Project `<Exceptions>` and Mermaid dated `excludes` (working exceptions counted as `working-day`). LSP completion and hover, TextMate, two snippets, the MCP vocabulary and cheatsheet, three fixtures with their snapshots and a determinism fixture, and docs (working-calendar.md, rendering.md, dsl.md, ide.md, exporter READMEs, nowline(5) en/fr, CHANGELOG). No existing byte moved.
**Deviations from plan**:
- Kickoff question deferred to the executing session; answered `unattended`. The branch is this session's assigned `claude/plan-m2p-5b-heron-5bcx5v`, not the planning session's `claude/hopeful-dirac-g9dll4`.
- Gate 2 (exec to deep, before wave 2) passed as an unattended checkpoint. No retries, no fix-ups.
- Wave 2 committed per step (s4 under the red-test exception for the s3 renderer cases, s6 empty) instead of one s6 commit.
- s10 split: the worker ran Verification and made the empty s10 commit and drafted the PR; removing the plan and handoff, opening the PR and subscribing wait for the maintainer.
- Pre-pack packs against a right edge widened for provisional run labels (beyond decision 3; no effect on files without titled runs).
- calendarExceptions walks merged windows rather than one span (same result as decision 5's horizon). The working-calendar example's anchor gained the title "Kickoff".
**Follow-ups**:
- Anchors and milestones keep the left fallback that can draw over a beside header (`packMarkerRow`).
- The general TextMate keyword list lacks `wave`.
- The `build-fast` help text says "~30-SVG"; it is 46 now.
- The 5a CHANGELOG entry still calls the exports "phase 5b"; fine while 5a and 5b ship together, worth a tidy at release cut.
