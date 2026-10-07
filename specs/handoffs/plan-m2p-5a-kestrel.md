```
--- KICKOFF: begin orchestration at [deep] (pending approval) ---

  Status: 0/3 groups done | last review: — | current: m2p-5a s1-s5 [exec] | updated 2026-10-07

  review: every-wave (log-only — parent writes Review log; human gates only where marked)

  Next model
    The [deep] tier at high effort; the skill's model picker names the model per tool.

  Prompt to paste into the next chat:
    Read specs/handoffs/plan-m2p-5a-kestrel.md on your branch of
    lolay/nowline. The plan is already tagged. Run the
    personal-plan-orchestrate skill from the top: dispatch each wave as a
    one-agent Workflow with the tier's model and effort, pause only at the
    marked STOP gates, and update plan progress after each wave. You are
    the kickoff destination chat; begin immediately.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [exec] m2p-5a s1-s5 | ~12M | ~$4.5 |
| 2 [deep] m2p-5a s6-s8 | ~14M | ~$6.0 |
| 3 [exec] m2p-5a s9-s10 | ~10M | ~$3.5 |
| orchestrator | ~6M | ~$4.0 |
| **Total** | ~42M | ~$18 |

These are the standard's per-step anchors doubled, because Phase 4 actuals ran about 2× its Cost table (~$27.6 against ~$13), and waves that build and test the whole repo ran 3× their anchors. Each figure is good to about 2-3×. The planning session (spike, three code maps, a layout probe) is not in the table.

# m2p Phase 5a: declarations reach the schedule

## Context

Phases 1–4 are on `main` (`9c0982d`, `c74c795`). The calendar engine already does everything 5a needs: `CalendarRule` (`layout/src/working-calendar.ts:35-48`) models dated days and lists, inclusive ranges, weekly recurrences open or bounded on either side, and `working` exceptions, and `buildCalendar` (`:225-268`) resolves precedence as decision 18 says (dated beats bounded beats open-ended, working wins ties). The only gap is that nothing in a file can feed it: `resolveWorkingCalendar` (`layout/src/calendar-resolver.ts:25-31`) always passes the preset's rules.

5a adds the syntax and wires it to that one resolver, from the plan of record (`specs/handoffs/handoff-m2p-working-calendar.md` §6 Phase 5a; decisions 1, 2, 13, 14, 15, 16, 18, 19, 20 with the 2026-10-06 amendments; `specs/working-calendar.md` §3-§6, §10):
- two config keywords, `non-working` and `working`, with `date:` (one date or a list), `start:` / `end:` (inclusive) and `every:` (weekday names);
- validation NW1–NW5 with EN and FR text;
- include merge;
- the declarations reach engines A, B and C and, through `RoadmapSchedule.calendar`, every exporter.

**Lexer spike: passed.** Run in the planning session before any other work. With a minimal grammar stub (`specs/handoffs/spike-m2p-5a-kestrel/nowline.langium.patch`), the test (`…/non-working-identifier.test.ts`, 35 cases) passes on the first run:
- `non-working` and `working` lex as keywords;
- `non-working-team`, `working-group`, `nonworking`, `workings` and `non-workingday` lex as `ID`;
- `non-working:` and `working:` lex as property keys;
- every bare-word slot that accepts `wave` takes each word as a name;
- the parser builds with `skipValidations: false`.

Residuals are the waves class only: a bare `style`, `symbol`, `non-working` or `working` line takes the next line's keyword as its id. The full `make test` run was green with the stub, and all 51 `.nowline` files in the repo produced byte-identical JSON ASTs with and without it. No file in `examples/`, `tests/`, `specs/` or any test fixture uses either word as an id. The stub was reverted, so `main`'s tree is still the baseline.

**Scope and byte impact:** none for files without the keywords. Every layout snapshot, determinism cell and rendered example stays byte-identical, and nothing is added to `__snapshots__/` or `hashes.json` (fixtures are 5b). One deliberate diagnostic change: NW4 fires on `calendar:custom` files whose `days-per-week` differs from 7 with no `every:` declaration (spec §6, §9.1), which includes `examples/product.nowline` and `tests/grammar-properties.nowline`. It is a warning, so render bytes don't move.

**Shape and execution:**
- One PR from `main`, on the harness branch of the executing session.
- A new cloud session runs it with personal-plan-orchestrate.
- The research behind this plan was three read-only code maps and a layout probe (a mocked resolver, now deleted) at `f7d3d94` (`main` `27187f3` plus the spike commit). Line refs below are from that tree.

## Decisions

1. **Two grammar rules, the spike's patch verbatim.**
   - Rules: `NonWorkingDeclaration: 'non-working' (name=EntityName)? (title=STRING)? (properties+=EntityProperty)*;` and `WorkingDeclaration` with `'working'`. Both are `ConfigEntry` alternatives (`nowline.langium:24-25`). There is no description slot.
   - Both words go into `EntityName` (`:81`), `BlockPropertyValue` (`:37`), `StylePropertyValue` (`:56`) and `PropertyAtom` (`:190`), with comments matching the `wave` ones. `DefaultEntityType` is unchanged.
   - Two rules rather than one with a `kind` field: each keyword gets its own `$type` in the JSON AST (spec §8 names `NonWorkingDeclaration`), and the printer and type labels switch on `$type` as they already do.
2. **Property shapes** (decisions 2, 13):
   - `date:` takes one `DATE_LITERAL` or a list;
   - `start:` and `end:` take one date each, inclusive;
   - `every:` takes one name or a list of `sun mon tue wed thu fri sat`.
   - The grammar accepts any `EntityProperty`; the validator enforces the shapes.
3. **Printer and JSON.**
   - New `configEntry` cases call `this.simpleEntity('non-working' | 'working', entry, 0)` (`printer.ts:93-108`). Config entries keep source order.
   - `KEY_ORDER` (`:4-29`): `every` goes immediately before `start` (`:22`) and `end` immediately after it (decision 20), so a declaration prints `date`, `every`, `start`, `end`.
   - No JSON code changes (`schema.ts`, `parse-json.ts` are generic).
   - Known side effect: an unknown `end:` or `every:` on any other entity now prints in that position instead of alphabetically after the known keys. No file in the repo has one; the round-trip and byte gates confirm it.
4. **Validator.** One shared `checkCalendarDeclaration(decl, accept)` is registered for both types, beside `SymbolDeclaration` (`nowline-validator.ts:534`). It does not register `checkEntityIdOrTitle`: id-less, title-less declarations are valid.
   - **NL.E0900, NW1 shape.** Exactly one of three shapes: `date:` alone; `start:` + `end:` without `every:` (a range); or `every:` with optional `start:` and/or `end:`. Anything else is one NL.E0900 on the declaration. That covers no properties, `date:` with any other key, and a lone `start:` or `end:`.
   - **NL.E0901, own keys.** Allowed keys are `date`, `start`, `end` and `every`. Any other key, including `style:`, `labels:`, `link:` and `wave:`, is NL.E0901 on the property. This copies the own-key pattern of `checkSymbolDeclaration` (`:1861-1906`), not `checkUnknownEntityProperties` (`:1204-1235`), which skips `wave:`.
   - **NL.E0902.** `start:` or `end:` given a list.
   - **NL.E0405 for every date.** `checkPropertyValues` gains `case 'end':` beside `case 'date': case 'start':` (`:811`), per decision 20. List elements of `date:` are checked inside `checkCalendarDeclaration`, one NL.E0405 per bad element, because `checkPropertyValues` only checks single values and widening it would add errors on other entities.
   - **NL.E0903, NW2.** `end:` is before `start:` (equal is fine).
   - **NL.E0904 / NL.E0905, NW3.** E0904 is a value that isn't a weekday name; E0905 is a duplicate weekday within one `every:`.
   - **NL.E0906, NW3, an unbounded stretch with no working day.**
     - Let *O* be the open-ended week: the file's `non-working … every:` without `start:`/`end:`, plus the business preset's Sat/Sun unless the file declares `non-working weekend`, minus the file's open-ended `working … every:`.
     - If *O* covers all seven days, report E0906 on each open-ended `non-working` declaration.
     - Then, for each `non-working … every:` with exactly one bound, if *O* ∪ its days covers all seven, report E0906 on it.
     - A recurrence bounded on both sides may close all seven days. The rule is the validator's mirror of `buildCalendar`'s `RangeError` (`working-calendar.ts:240-244`) for the root file.
   - **NL.W0703, NW4.** `days-per-week` differs from 7 − |*O*|, using the same *O*. Report it on the custom block's `days-per-week` property when a custom block exists, else on the roadmap's `calendar:` property, else on the first open-ended declaration, else on the roadmap declaration. Business with no declarations has |*O*| = 2 against 5, so it is quiet. Full with no declarations is 0 against 7, also quiet. Example C (`non-working weekend every:[fri, sat]` on business) is 2 against 5, quiet. Custom with 5 and no `every:` is 0 against 5, so it warns.
   - **NL.E0907, NW5.** A duplicate id within one file, per keyword: `non-working x` with `working x` is fine.
   - **Out of scope here.** Include collisions use the resolver's shadowing warning (decision 6). The validator sees only its own file, so a `non-working weekend` in an include does not feed *O*. That limit is documented, not fixed.
   - **NL.W0700 elsewhere.** `every:` or `end:` on any other entity gets the existing NL.W0700 unchanged (neither key is in `ENTITY_KNOWN_PROPS`, `:259-309`). A test pins it.
   - **Type labels.** `entityTypeLabel` (`validator-utils.ts:105`) returns `non-working` for `NonWorkingDeclaration`. The LSP `entityKind` (`lsp/src/references/ast-utils.ts:365`) does the same. `WorkingDeclaration` already gives `working`.
5. **Codes and messages** (decision 15; ranges from `codes.ts:5-20`). Every message ships in EN and FR, the coverage test requires both, and each is emitted through `acceptTr`. Messages contain no uncoded "requires … date:" text (`diagnostics/index.ts:127`).

   | Code | EN | FR |
   |---|---|---|
   | NL.E0900 | `A ${kind} declaration takes date:, or start: and end:, or every: with optional start: and end:.` | `Une déclaration ${kind} prend date:, ou start: et end:, ou every: avec start: et end: facultatifs.` |
   | NL.E0901 | `Unknown ${kind} property "${key}". Allowed: date, start, end, every.` | `Propriété ${kind} inconnue « ${key} ». Autorisées : date, start, end, every.` |
   | NL.E0902 | `${key}: on a ${kind} declaration takes one date, not a list.` | `${key}: sur une déclaration ${kind} prend une seule date, pas une liste.` |
   | NL.E0903 | `end: ${end} is before start: ${start}.` | `end: ${end} précède start: ${start}.` |
   | NL.E0904 | `Invalid weekday "${value}". Use sun, mon, tue, wed, thu, fri or sat.` | `Jour de semaine invalide « ${value} ». Utilisez sun, mon, tue, wed, thu, fri ou sat.` |
   | NL.E0905 | `Weekday "${value}" is listed more than once.` | `Le jour « ${value} » apparaît plusieurs fois.` |
   | NL.E0906 | `This leaves no working day in the week with no end date. Keep at least one weekday working.` | `Il ne reste aucun jour ouvré dans la semaine sans date de fin. Gardez au moins un jour ouvré.` |
   | NL.E0907 | `Duplicate ${kind} id "${name}".` | `Identifiant ${kind} « ${name} » en double.` |
   | NL.W0703 | `days-per-week is ${daysPerWeek}, but the week leaves ${working} working days.` | `days-per-week vaut ${daysPerWeek}, mais la semaine laisse ${working} jours ouvrés.` |

   `${kind}` is `non-working` or `working`, verbatim in both languages. The Rule 20 / dsl.md rule numbers come in s9.
6. **Includes** (`core/src/language/include-resolver.ts`).
   - `ResolvedConfig` (`:78-88`) gains `calendarDeclarations: Array<NonWorkingDeclaration | WorkingDeclaration>`, initialized in `emptyConfig()` (`:177`).
   - `addConfigEntry` (`:539-557`) appends every declaration, named or not; unnamed ones always merge, never collide.
   - In `applyConfigMode` (`:416-441`), a child's named declaration is dropped, with the existing uncoded warning, when the target already holds one with the same keyword and name:
     - `Non-working "x" from child.nowline is shadowed by the parent's definition.`
     - `Working "x" from …` for the other keyword.
   - The same object reached twice (diamond) is skipped silently, as `mergeMap` does (`:486-500`).
   - `config:ignore` merges nothing.
   - An isolated region keeps the child's own declarations in its `IsolatedRegion.config` (`:454-462`). Layout keeps drawing regions on the host calendar (`include-node.ts:96`), so they have no effect there yet: per-region calendars stay out of m2p (decision 7). The spec and `dsl.md` say so.
   - Order inside the list carries no meaning (decision 7 below).
7. **The resolver** (`layout/src/calendar-resolver.ts`): the one place declarations become `CalendarRule`s, so engines A, B and C and the three exporters pick them up with no further change (decision 16).
   - It reads `resolved.config.calendarDeclarations` (root and merged includes).
   - It converts each declaration: `working` from the keyword; `dates` via `parseDate`; `start` / `end`; `every` from the weekday names (`sun` = 0 … `sat` = 6); `id` from the name; `title`.
   - It skips a declaration with a malformed value or shape (the validator reported it; includes are not validated), the same way `normalizeRule` (`working-calendar.ts:290-308`) drops malformed rules.
   - **Weekend replacement** (decision 14): when any `non-working` declaration is named `weekend`, the preset's rules are left out. That holds for any preset, but only business has a weekend.
   - **Canonical order** (decision 18): the rules are sorted by first date (none sorts first), then title, then id, then `working`, then the `every` mask, then start and end. The probe showed why: `titledRules` (`working-calendar.ts:482-493`) breaks ties by input order, so two titled rules starting the same day swap their `NonWorkingRun.titles` when the file is reordered. `rules` and every downstream list are then independent of file and include order.
   - **Robustness:** if `fromCalendarConfig` throws `RangeError` (an included file closes the whole week; the root file would have had NL.E0906), fall back to the preset calendar instead of crashing layout or export.
   - `ResolvedCalendar.working` docs say "the preset and the file's declarations".
   - Engine B's fallback `ctx.calendar ?? fromCalendarConfig(ctx.cal)` (`layout.ts:1404`) is only reached by tests that call `computeDateWindow` directly; leave it.
8. **Durations stay in estimate units** (decision 19). Nothing changes in `daysPerUnit`, `deriveItemDurationDays` or the exporters' `days`. A working exception pulls an end in; a holiday inside a bar pushes it out. That is the calendar's job, and engines A, B and C already ask it.
9. **Exporters move only through the calendar.**
   - For a file with an open-ended declaration (Example C), the MS Project `<WeekDays>`, the Mermaid `excludes friday, saturday` and the XLSX Calendar row (`business (Friday and Saturday off; 5/22/65/260 days per week/month/quarter/year)`) follow `workingWeekdays`.
   - Dated rules move engine C's dates in every exporter, but MS Project `<Exceptions>` and Mermaid's dated `excludes` are 5b. Until 5b, Mermaid lays a holiday-spanning `Nd` across the holiday.
   - So **5a and 5b ship in the same release**, as Phases 2 and 3 did. The handoff, the PR and the CHANGELOG entry say so.
10. **Run titles reach the model; no label is drawn** (5b).
    - Under `hide`, a titled run carries `titles` (already emitted by `buildNonWorkingRuns`, `view-preset.ts:421-448`).
    - Under `show`, a titled run is already `band: true` at every scale (`shownNonWorkingRun`, `:456-473`, Phase 4). So a titled holiday under `show` at month scale is shaded in 5a, unlabelled. Deliberate, and only for files with the keywords.

## Change (critical files)

**Core** (`packages/core/`):
- `src/language/nowline.langium` (apply `specs/handoffs/spike-m2p-5a-kestrel/nowline.langium.patch`, add the comments);
- `src/convert/printer.ts`;
- `src/language/nowline-validator.ts`, `validator-utils.ts`;
- `src/language/include-resolver.ts`;
- `src/i18n/codes.ts`, `messages.en.ts`, `messages.fr.ts`.

**LSP:** `packages/lsp/src/references/ast-utils.ts` (`entityKind` only; completion, hover, TextMate and snippets are 5b).

**Layout:** `packages/layout/src/calendar-resolver.ts` (and its doc comment). No engine file changes.

**Tests:**
- `packages/core/test/strings-and-ids/non-working-identifier.test.ts` (the spike, moved);
- `core/test/parser/keywords.test.ts`, `core/test/convert/printer.test.ts`, `cli/test/convert/printer.test.ts`, `core/test/validation/non-working-declarations.test.ts` (new);
- `core/test/include/include.test.ts`;
- `layout/test/calendar-resolver.test.ts`, `layout/test/non-working-declarations.test.ts` (new);
- `integration-tests/test/non-working-declarations-export.test.ts` (new);
- `lsp/test/references/` or the nearest existing `entityKind` test.

**Docs** (s9):
- `specs/working-calendar.md`: status; §4.1, §4.3, §4.4, §5.1, §6 and §9.2 in the new syntax; examples B and C rewritten; §11 Q1 and Q2 point at the decision log.
- `specs/dsl.md`:
  - Design Rule 1 (`:15`) count 22 → 24, with a justification like the `wave` one;
  - config prose (`:50`);
  - the Config Keywords table (`:159-168`);
  - a `### Non-working Declaration` section after `### Config Section`'s Calendar paragraph (`:811-859`), modelled on `### Wave Declaration` (`:556-607`);
  - include collisions (`:683, :692, :719-726`);
  - value rules (calendar group `:1158-1163`) and include rule 7 (`:1243`).
- `specs/handoffs/handoff-m2p-working-calendar.md`: status, the 5a row and §4 notes this plan corrected.
- `packages/cli/man/nowline.5`:
  - FILE STRUCTURE `:43-45`;
  - CONFIG SECTION "Five config keywords" `:302-307` → seven;
  - a `.Ss non-working and working` after `.Ss calendar` (`:486-547`), before the display `.Ss non-working` (`:548-584`), renaming that one to make the two distinct;
  - include text `:176-193`;
  - VALIDATION (Calendar `:1756-1775`, Includes `:1814-1881`).
- `man/fr/nowline.5`: the same places (`:5-7, :59-63, :345-350, :530-629, :1856-1875, :1918`).
- `README.md` keyword table (`:194-206`).
- `CHANGELOG.md` `### Added` (`:9`).

## Tests (fail without the change unless marked guard)

**Conventions:**
- Layout tests use `parseAndResolve` and `layoutRoadmap(file, resolved, { theme: 'light', today: utc(2026, 2, 9), nonWorking })` from `../src/index.js`, the helpers of `non-working-show.test.ts:1-100`.
- Pixels are relative to `timeline.originX` at `scale:1w`: 8 px per day, 40 px per business week under hide, 56 under show.
- An item box sits 6 px inside its logical extent, with an 8 px minimum width (`MIN_ITEM_WIDTH`).
- Engine C ends are exclusive.
- Every layout and engine C value below was produced in the planning probe with the equivalent `CalendarRule`s injected into the resolver, so the declarations must reproduce them exactly.

**Example B** (`layout/test/non-working-declarations.test.ts`):

```nowline
nowline v1

config

non-working thanksgiving "Thanksgiving" start:2026-11-26 end:2026-11-27

roadmap r "R" start:2026-11-23 scale:1w calendar:business

milestone launch "Launch" date:2026-11-28

swimlane a "A"
  item checkout "Checkout" duration:1w
  item qa "QA" duration:2d
```

| | hide | show |
|---|---|---|
| Checkout box | 6–34 (logical 0–40) | 6–66 (logical 0–72) |
| QA box | 46–54 (logical 40–56, minimum width) | 78–86 (logical 72–88) |
| Milestone x | 24, `hiddenDate` `2026-11-28` | 40, no `hiddenDate` |
| Ticks | `[0,undefined],[24,'Nov 30'],[64,undefined]` | `[0,'Nov 23'],[56,'Nov 30'],[112,undefined]` |
| Width, `endDate` | 64, 2026-12-07 | 112, 2026-12-07 |
| Runs | `[24,0,'2026-11-26','2026-11-29',['Thanksgiving']]`, `[64,0,'2026-12-05','2026-12-06']` (no `titles` key) | `[24,32,…,['Thanksgiving'],band]`, `[96,16,'2026-12-05','2026-12-06',band]` |

- **Engine C:** checkout `2026-11-23`–`2026-12-02` (5 days), qa `2026-12-02`–`2026-12-04` (2 days), launch `2026-11-28`, the same in both views.
- **`date:[2026-11-26, 2026-11-27]`** in place of `start:`/`end:` gives a deep-equal hide model and the same engine C.
- **Guard:** the file without the declaration lays out exactly as today (Checkout 6–34, QA 46–54, milestone 24 with `hiddenDate`, no titled run).

**Example C** (same file):

```nowline
config

non-working weekend "Weekend" every:[fri, sat]

roadmap r "R" start:2026-01-04 scale:1w calendar:business

swimlane a "A"
  item w1 "W1" duration:1w
  item w2 "W2" duration:1w
  item w3 "W3" duration:1w
```

- **hide:** boxes 6–34, 46–74, 86–114. Ticks `[0,'Jan 04'],[40,'Jan 11'],[80,'Jan 18'],[120,'Jan 25'],[160,'Feb 01'],[200,'Feb 08'],[240,undefined]`. The first run is `[40,0,'2026-01-09','2026-01-10']`, with no Saturday–Sunday run.
- **show:** boxes 6–34, 62–90, 118–146; ticks every 56 from `Jan 04`.
- **Engine C:** w1 `2026-01-04`–`2026-01-09`, w2 `2026-01-11`–`2026-01-16`, w3 `2026-01-18`–`2026-01-23`.
- **Validator:** no NL.W0703. `resolveWorkingCalendar(...).working.workingWeekdays` is `{0,1,2,3,4}`, and `weekStart` is 0.

**A working exception** (Example A of `non-working-show.test.ts:102-113` plus `working crunch "Crunch Saturday" date:2026-01-10`):
- **hide:** item boxes keep their x (6–34, 46–74, 86–114, 126–154). The milestone moves 152 → 160. Ticks `[0,'Jan 05'],[48,'Jan 12'],[88,'Jan 19'],[128,'Jan 26'],[168,'Feb 02'],[208,undefined]`. The first run is `[48,0,'2026-01-11','2026-01-11']`.
- **show:** W2 46–82, W3 94–138, W4 150–194; W4 was 174–202, so its end comes in by one day. The first run is `[48,8,'2026-01-11','2026-01-11',band]`.
- **Engine C:** w2 `2026-01-10`–`2026-01-16`, w3 `2026-01-16`–`2026-01-23`, w4 `2026-01-23`–`2026-01-30` (it was `2026-01-26`–`2026-01-31`).

**Precedence** (Example A plus the declarations, engine C W4 and the hide runs):

| Declarations | Engine C | hide runs |
|---|---|---|
| `non-working every:fri start:2026-01-12 end:2026-01-25` (bounded over the open week) | w2 `01-12`–`01-20`, w3 `01-20`–`01-28`, w4 `01-28`–`02-04` | `[72,0,'2026-01-16','2026-01-18']`, `[104,0,'2026-01-23','2026-01-25']` |
| `working every:sat start:2026-01-12 end:2026-01-25` + `non-working date:2026-01-17` (dated beats bounded) | w4 `01-24`–`01-30` | `[80,0,'2026-01-17','2026-01-18']`, `[128,0,'2026-01-25','2026-01-25']` |
| `non-working date:2026-01-14` + `working date:2026-01-14` (working wins a dated tie) | equal to Example A | equal to Example A |
| `non-working every:wed start:2026-01-12 end:2026-01-25` + `working every:wed start:2026-01-12 end:2026-01-25` (working wins a bounded tie) | equal to Example A | equal to Example A |

**Reorder invariance** (`layout/test/calendar-resolver.test.ts`):
- The three precedence files with their declarations in every order give deep-equal layout models and engine C.
- The same declarations moved into a `config:merge` include, in either order, also give deep-equal results.
- Two titled dated rules starting the same day (`non-working "Beta" start:2026-12-24 end:2026-12-25` and `non-working "Alpha" date:2026-12-24`), in either order: the run `2026-12-24`–`2026-12-27` has `titles` `['Alpha','Beta']`, and `working.rules.map(r => r.title)` is identical.

**Weekend replacement** (resolver tests):
- business + `non-working fridays every:fri` gives `workingWeekdays` `{1,2,3,4}` (it adds);
- business + `non-working weekend every:[fri, sat]` gives `{0,1,2,3,4}` (it replaces);
- full + `non-working weekend every:[sat, sun]` gives `{1,2,3,4,5}`;
- a child on `config:merge` declaring `non-working weekend every:[fri, sat]` replaces the preset in the parent.
- **Guard:** with no declarations, each preset's `rules` and `workingWeekdays` are unchanged.

**Robustness:** an included file with `non-working every:[sun, mon, tue, wed, thu, fri, sat]` neither throws in `layoutRoadmap` nor in `scheduleRoadmap`, and the calendar falls back to the preset.

**Exports** (`integration-tests/test/non-working-declarations-export.test.ts`):
- Example C: Mermaid has `excludes friday, saturday`; the XLSX Calendar row is `business (Friday and Saturday off; 5/22/65/260 days per week/month/quarter/year)`; MS Project marks Friday and Saturday non-working.
- Example B: the XLSX Checkout row ends `2026-12-02`.

**Core:**
- `strings-and-ids/non-working-identifier.test.ts`: the spike as kept.
- `parser/keywords.test.ts`: a `non-working declaration` block and a `working declaration` block, modelled on `wave declaration` (`:317-440`), one case per property shape.
- `convert/printer.test.ts` (core) and `cli/test/convert/printer.test.ts`:
  - `non-working x "X" every:[sat, sun] end:2026-03-01 start:2026-01-01` prints as `non-working x "X" every:[sat, sun] start:2026-01-01 end:2026-03-01`;
  - a config with a `style`, a `non-working`, a `working` and a `default` keeps that order;
  - each shape round-trips text → JSON → text and JSON → text → JSON;
  - a one-element list prints bare (`date:2026-01-01`), matching `renderProperty` (`:285-299`).
- `validation/non-working-declarations.test.ts`. Each code's EN text is asserted exactly and FR through `tr('fr', code, args)`, as in `validation.test.ts:1188-1260`:
  - NL.E0900:
    - no properties;
    - `date:` with `every:`;
    - `date:` with `start:`;
    - `start:` alone;
    - `end:` alone.
  - NL.E0901: `style:x`, and `wave:w` (proves the own-key check).
  - NL.E0902: `start:[2026-01-01, 2026-01-02] end:2026-01-03`.
  - NL.E0405:
    - `date:2026-13-01`;
    - `date:[2026-01-01, 2026-02-30]` (one error, on the bad element);
    - `end:2026-02-30` (via the new `case 'end':`).
  - NL.E0903: `start:2026-01-10 end:2026-01-09`; and `start:2026-01-10 end:2026-01-10` is clean.
  - NL.E0904: `every:funday`.
  - NL.E0905: `every:[sat, sat]`.
  - NL.E0906:
    - `non-working every:[mon, tue, wed, thu, fri]` on business (Sat/Sun from the preset);
    - `non-working every:[mon, tue, wed, thu, fri] start:2026-01-01` (half-open).
    - No E0906: `non-working every:[sun, mon, tue, wed, thu, fri, sat] start:2026-12-24 end:2027-01-01` (a closed window); and `non-working weekend every:[mon, tue, wed, thu, fri]` (it replaces the preset weekend, so Sat and Sun stay working; NL.W0703 fires, 2 against 5).
  - NL.W0703:
    - custom with `days-per-week: 6` and no declarations, on the property;
    - business with no `calendar:` property and `working every:sat` (6 against 5), on the declaration.
    - Quiet: business, full, Example C, and custom 7.
  - NL.E0907: two `non-working h`. A `non-working h` with a `working h` is clean.
  - NL.W0700 on `item x duration:1w every:mon`; NL.W0700 + NL.E0405 on `end:nope`.
  - Every valid shape from the spike's "accepts every property shape" case is diagnostic-free.
  - The type label in a message is `non-working`, not `nonworking`.
- `include/include.test.ts`, modelled on `symbols in resolved config` (`:322-391`):
  - unnamed declarations from parent and child both land in `calendarDeclarations`;
  - a named collision keeps the parent's and warns `Non-working "h" from child.nowline is shadowed by the parent's definition.`;
  - `working` and `non-working` with the same name don't collide;
  - a diamond doesn't warn;
  - `config:ignore` merges nothing;
  - `config:isolate` keeps the child's declarations in `isolatedRegions[0].config`, and the host's `resolveWorkingCalendar` ignores them.
- LSP: `entityKind` of a `NonWorkingDeclaration` is `non-working`.

**Identity guards:**
- `layout/test/non-working-identity.test.ts` and `waves-byte-stability.test.ts` stay green untouched.
- Every existing core, layout, export and integration test stays green with no snapshot or golden update.

## Byte identity (the gate for every wave)

1. **Baseline (s2, before any source edit):**
   - `make build && make test`;
   - `make compile TARGET=local && make determinism`;
   - hash the 41 rendered SVGs (19 `examples/*.svg` from `render-samples.mjs`, 22 `tests/*.svg` from `render-tests.mjs`) into `.scratch/m2p-5a/hide-baseline.sha256`;
   - dump the JSON AST of all 51 repo `.nowline` files into `.scratch/m2p-5a/ast-baseline.json`. No `make` target does this: the planning session used a throwaway Vitest file that parses every `.nowline` (outside `node_modules`, `dist` and dot-directories) with `test/helpers.ts` `parse(…, { validate: false })` and writes `JSON.stringify` of each AST without `$`-keys other than `$type`. Place it in `packages/core/test/` only while dumping, run it with Vitest directly, delete it, and never commit it.
2. **After s3, after W2, and at the final gate:**
   - `make build`, then `sha256sum -c` on the baseline: every line OK;
   - `make test` with no snapshot diff (never set `UPDATE_LAYOUT_SNAPSHOTS`);
   - `make compile TARGET=local && make determinism` green, with `git diff --exit-code packages/integration-tests/determinism/hashes.json`;
   - the AST dump equal to the baseline.
3. **No additions:** `git diff --stat main -- '**/__snapshots__/**' packages/integration-tests/determinism/hashes.json` is empty at the final gate.

## Out of scope

**In 5b, not here:**
- labelled seams and bands, and marker-row packing;
- MS Project `<Exceptions>` and Mermaid dated `excludes`;
- LSP completion and hover, TextMate patterns, snippets, the MCP cheatsheet and vocabulary, `ide.md`;
- `examples/working-calendar.nowline`, `tests/non-working-{hide,show}.nowline`, their snapshots and determinism cells.

**Not in m2p:** per-region calendars for isolated includes; NW4 seeing included declarations.

**Findings to list in the PR, not fix:**
- the include shadowing warnings and the symbol own-key and duplicate-id errors are uncoded;
- `checkPropertyValues` never date-checks list values on any entity;
- the `build-fast` help text says "~30-SVG" (41 now);
- `handoff-m2p-working-calendar.md` §4.8 says 19 snapshot samples (20 now);
- the general TextMate keyword list (`grammars/nowline.tmLanguage.json:58`) lacks `wave`;
- engine B's preset-only fallback at `layout.ts:1404`.

## Verification

- `make pre-commit` green;
- `make pack-mcpb`;
- `make bundle-size` under 200 KB (embed is 189.40 KB on `main`; the grammar grows it slightly);
- every byte-identity step above;
- CI green on the PR head, including the determinism gate.

## Hand-off from this session (after approval)

1. This planning session has committed the spike and this plan (plus its handoff) to `claude/beautiful-turing-yolfjg`, a branch off `main` `27187f3`. That is all it pushes for 5a.
2. Create a new cloud session with `create_session`:
   - repository `lolay/nowline`, starting from `claude/beautiful-turing-yolfjg`;
   - same environment, same model;
   - its prompt is the kickoff instruction above.
3. Give the user the new session's link, then stop. This session runs no 5a waves.

## Orchestration (personal-plan-orchestrate, as in Phase 4)

**Runner and branch:**
- The new session works only on its harness-assigned branch, and opens the 5a PR from there.
- The plan, its handoff and `specs/handoffs/spike-m2p-5a-kestrel/` are removed as the branch's last commit. The spike test lives on in `packages/core/test/strings-and-ids/` from s3.

**Toolchain (every agent):**
- The container ships Node 22. Install the official Node 26.2.0 linux-x64 tarball into `$HOME`, verify it against `SHASUMS256.txt`, and put its `bin` first on `PATH` in every shell (shell state does not persist between calls).
- pnpm 12.8.1 is already installed. Never run `playwright install`.
- Makefile targets only, for build, test, lint, format and determinism; `make format` fixes Biome drift. Single-file Vitest runs are allowed for red/green iteration inside a step, never as a gate.

**Waves:**
- Each wave is a one-agent Workflow with `model` and `effort` set for its tier, at high effort.
- W2's two steps run serially in one agent: both feed `ResolvedConfig`.

**Gates (fail closed; a notification or a non-answer is never approval):**
- After W1: gates 5 and 2, asked together. That is the canary check on which model ran, plus review of the grammar, validator and red tests before Opus spend.
- Gate 1 on any error, any byte move, any AST change for an existing file, a snapshot or `hashes.json` change, or weak output.

**Commits:**
- `make pre-commit` before every commit.
- One exception, Phase 4's precedent: the s5 red-test commit. Its `make pre-commit` run may fail only in the tests s5 adds (listed in the commit body); lint must pass.
- Push before every wait.

**Every subagent prompt:**
- gives the exact trailers, in this order: `Claude-Session: <the new session's link>`, then `Assisted-by: Claude Code` last;
- says those trailers override any harness attribution reminder;
- forbids model names in commits, files, comments and the PR body;
- says subagents commit when told and never push.

**Artifacts:** `.scratch/orchestrate-plan-m2p-5a-kestrel-{wave}-{task}.md`.

## m2p 5a steps

--- WAVE 1 [exec] ---

### s1 - [fast] Lexer spike (done in planning)
Ran before any other 5a work and passed on the first run (§ Context). The test and the grammar stub it ran against are in `specs/handoffs/spike-m2p-5a-kestrel/`. s3 moves the test to `packages/core/test/strings-and-ids/non-working-identifier.test.ts` unchanged, where it becomes the permanent ambiguity gate. If it fails after the move, gate 1: decision 1 says stop and ask, never rename.

### s2 - [exec] Toolchain and baselines
- Install the toolchain (§ Orchestration), then `make init && make build-fast`.
- Then byte identity step 1, before any source edit.
- Done when both baseline files exist and determinism is green with `hashes.json` unchanged.

### s3 - [exec] Grammar, printer, JSON, type labels
- Decisions 1–3, and the type labels from decision 4.
- Apply the spike patch, add the grammar comments, and move the spike test into place.
- Add the printer cases, `KEY_ORDER`, `entityTypeLabel` and the LSP `entityKind`.
- Add the keyword, printer and round-trip tests from § Tests.
- Done when:
  - the spike test is green;
  - byte identity step 2 passes, the AST dump included;
  - `make pre-commit` is green.
- Then commit.

### s4 - [exec] Validator and i18n
- Decisions 4–5, test first: write `validation/non-working-declarations.test.ts` red, then implement.
- Done when the file is green, the messages coverage test is green and `make pre-commit` is green. Then commit.

### s5 - [exec] Failing tests for includes, the resolver, layout and exports
- Write every remaining case in § Tests with its literal values: the include cases, resolver, Examples B and C, the working exception, precedence, reorder, weekend replacement, robustness and exports.
- Done when:
  - each new case fails on an assertion, not a crash, where possible;
  - every guard is green;
  - nothing outside `*/test/` changed;
  - `make lint` passes.
- Commit per § Orchestration's exception.

--- STOP: gates 5 and 2 ---

```
  Suggested chat title: Wave 2 of 3 [deep] m2p-5a s6-s8
  Tier change [exec] -> [deep]: review W1 (grammar, printer, validator committed green; s5 red tests) before Opus spend.
  Next model: Claude Code Opus 5.5 at high effort; Cursor Opus 5.5 high.
  Scope: s6-s8 only; halt at the end of W2 and report.
```

--- WAVE 2 [deep] ---

### s6 - [deep] Include merge
Decision 6. Done when the s5 include cases are green.

### s7 - [deep] Calendar resolver
Decisions 7–10. Done when every s5 resolver, layout and export case is green, with every literal unchanged. If a literal disagrees, the code is wrong unless the probe's injected rules differ from the declaration's meaning; then gate 1.

### s8 - [deep] Prove nothing moved, then commit
- Byte identity step 2 in full, then `make bundle-size`, then `make pre-commit`.
- Then commit and push.
- Gate 1 on any byte or AST move.

--- WAVE 3 [exec] ---

### s9 - [exec] Docs
Everything under § Change "Docs". The `working-calendar.md` examples must match § Tests literally. Done when `make lint` passes.

### s10 - [exec] Gates, commit, push, PR
1. Run § Verification in full.
2. Commit with the exact trailers, and push.
3. Remove the plan, its handoff and the spike directory as the last commit, and push.
4. Open a PR to `main`, titled "Add non-working and working declarations (m2p phase 5a)". The body follows the repo template and lists:
   - the byte impact (none for files without the keywords; NW4 on two custom-calendar files);
   - the same-release rule with 5b (decision 9);
   - the decision 3 printer side effect;
   - the findings from § Out of scope.
5. Subscribe to the PR, and drive it to green.

## Review log

## Token log

**Counting header (Claude Code)** — as in the Phase 4 plan (`plan-m2p-show-display-osprey.md`, PR lolay/nowline#97 history):

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `orchestrator-wave-N`, or `wave-N-fix`; `<group-id>` is the wave's group id with hyphens (`m2p-5a-s1-s5`); `<model>` is `message.model` without a date suffix. Round to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` plus `<session-id>/subagents/**/agent-*.jsonl`. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (and `ephemeral_1h_input_tokens`, marked `1h`), output `output_tokens`. Calls with no `stop_reason` line: estimate output and mark the line `(output est.) session <id>`.
- Rates, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.

Phase 1 ~$20.42; Phase 2 ~$66.4; Phase 3 ~$51.05; Phase 4 ~$27.6. Rows are added per wave by the executing session.
