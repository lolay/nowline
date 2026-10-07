```
--- KICKOFF: begin orchestration at [deep] ---

  Status: 1/4 groups done | last review: wave-1 PASS | current: m2p-4 s4-s6 [deep] | BLOCKED at gates 5 and 2 | updated 2026-10-07

  review: every-wave (log-only — parent writes Review log; human gates only where marked)

  Next model
    The [deep] tier at high effort; the skill's model picker names the model per tool.

  Prompt to paste into the next chat:
    Read specs/handoffs/plan-m2p-show-display-osprey.md on your branch of
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
| 1 [exec] m2p-4 s1-s3 | ~3.6M | ~$1.3 |
| 2 [deep] m2p-4 s4-s6 | ~7.3M | ~$3.9 |
| 3 [exec] m2p-4 s7-s8 | ~4.0M | ~$1.4 |
| 4 [exec] m2p-4 s9-s10 | ~2.0M | ~$0.70 |
| orchestrator | ~6.7M | ~$6.0 |
| **Total** | ~24M | ~$13 |

Expected values are estimates, good to about 2-3× per wave. Phases 1-3 actuals ran well above their anchors, so read these as a floor. The kickoff ran in the m2p planning session and is not in the orchestrator row.

# m2p Phase 4: `show` and the display setting

## Context

PR lolay/nowline#96 (m2p phases 1–3) merged to `main` as `9c0982d`. Under `calendar:business`, non-working days are hidden (`hide`, Phase 2). Phase 4 adds the second view, `show`, from the plan of record (`specs/handoffs/handoff-m2p-working-calendar.md` §6 Phase 4, decisions 8, 9, 11, 12; `specs/working-calendar.md` §4.2, §7.3, §7.5, §10 Example A):
- non-working days are drawn at full width as shaded bands;
- bars paint across them, but a bar ends at the end of its last working day, so the gap shows;
- it is chosen by a roadmap style key, `default roadmap non-working:show`, or by a render-time option on every surface.

**Precedence:** surface option, then the file's key, then `hide`.

**Scope and byte impact:**
- It is a pure opt-in. `hide` stays the default, and every existing output must stay byte-identical to `main`, which is this phase's main safety net.
- Engines B and C take no display input, so the schedule and every exporter's output are the same in both views.

**Shape and execution:**
- One PR from `main`.
- A new cloud session runs it with the personal-plan-orchestrate skill.
- The research behind this plan is three read-only code maps plus a design pass, all at `0a4f733` (tree equal to `9c0982d`). Line refs below are from that tree.

## Decisions

1. **The display lives on `TimeScale`** (`layout/src/time-scale.ts`).
   - New option `nonWorking?: 'hide' | 'show'`, plus the getter `showsNonWorking` (true only for `show` with `calendar.hasNonWorkingDays`).
   - Every new branch is gated on that one predicate. So `hide`, `calendar:full` and `calendar:custom` take the existing code paths verbatim.
   - Engine A reads `ctx.scale.showsNonWorking`, and there is no new `LayoutContext` field. Include regions already share `ctx.scale` (`include-node.ts:91`). The extension pass passes the option to the scale it rebuilds (`roadmap-node.ts:649`).
2. **Resolution** in `RoadmapNode.place`:
   - `isNonWorkingDisplay(options.nonWorking) ? options.nonWorking : headerStyle.nonWorking`.
   - `ResolvedStyle.nonWorking` defaults to `'hide'` (`style-resolution.ts:60-63`, `:131-138`).
3. **`TimeScale` under show** (handoff §5.2 show column):
   - `ppd = widthPx / daysBetween(d0, d1)`, `forward` is linear in calendar days, and `invert` returns a calendar date.
   - New `indexAtX(x)`.
   - New `startX(x)` moves x forward only when it lies in a non-working day (ε = 1e-6 day). A start inside a working day keeps its fraction, so a start mid-Friday after a 0.5d item stays mid-Friday, matching engine C.
   - New `advanceX(x, n)`: the end of the n-th working day from `startX(x)`, with fractions interpolated.
   - Under hide, and with no calendar: `startX` is the identity and `advanceX = x + n·ppd`.
   - Spot checks at 8 px/day, origin Mon 2026-01-05: `startX(40)=56`; `advanceX(16,5)=72`.
4. **Width sites** use one helper, `itemSpanPx(ctx, startX, days)`, in a new `layout/src/working-span.ts`.
   - Under hide it returns the legacy `days * ctx.timeline.pixelsPerDay` verbatim, so there is no float drift. Under show it returns `advanceX(startX, days) - startX`.
   - It replaces `layout.ts:443`, `layout.ts:1063-1065`, `swimlane-node.ts:310-312` and `group-node.ts:194-196`.
   - `predictItemBarExtraHeight` gains a `startX` parameter. Its callers (`swimlane-node.ts:315`, `group-node.ts:199`) pass the snapped predicted start, so prediction and placement use the same start and formula.
5. **Starts snap only where they become geometry:**
   - `sequenceItem`'s placed start, after `waveFloorX`, `wavePinOverrideOf` and `nonWorkingPinOf` have run on the pre-snap value;
   - group and parallel box left edges (a group's width is `max(snapped, timeCursorX, usedRightX) - snapped`);
   - the row packer's predicted extent and `firstChildStartX`.

   Cursor seeds, wave floors and include regions are not snapped. That keeps NL.I1008, NL.W1001 and their tie rules the same in both views, and keeps floors raw per decision 11. **This deviates from handoff §6's wording** ("the lane cursor, wave floors go through `startX`"), with the same geometry. The PR and the handoff say so.
6. **Markers** use `forward`, so a dated marker under show sits on its own date. `hiddenDate` is set only when `!showsNonWorking && !isWorkingDay` (`anchor-node.ts:65`, `milestone-node.ts:314`).
7. **Reading dates back from x** under show: `dayAtX` (`wave-layout.ts:195-197`) becomes `workingIndexOf(start, addDays(start, round((x-originX)/ppd)))`. Wave `startDate`/`endDate` and the NL.W1001, NL.I1008 and NL.I1007 texts then match engine C in both views. The hide branch is untouched.
8. **Extension pass under show** (`roadmap-node.ts:640-660`):
   - the overflow is `indexAtX(maxContentRightX)`, fed to the same `tickBoundaryAtOrAfter`;
   - the end is `dateAtWorkingIndex`;
   - the width is `daysBetween × ppd`;
   - the rebuilt scale keeps the display.
9. **Ticks.** `buildHeaderTicks` keeps routing on `hasNonWorkingDays` in both views, so week ticks fall on Mondays.
   - Under show, `fullUnitPx` (`view-preset.ts:351`) counts calendar days.
   - At month scale and above, a closing column with no working day is merged into the column before it. Engine B ends a window on Mon Feb 2 after a Sunday Feb 1 boundary, and hide already drops that column for having zero width.
   - A leading sliver keeps its tick, with the label dropped by the #92 edge rule. This is a known limit.
10. **Band model.** The `nonWorking` runs keep their meaning. Under show:
    - `x` and the right edge are clamped to the window; `from`/`through` keep their real dates;
    - new flag `band?: true` at the days and weeks scales, or when a run has titles (Phase 5);
    - never `seam`;
    - `nonWorkingDisplay: 'show'`. The types widen to `NonWorkingDisplay` (`types.ts:183-212`).
11. **Renderer.** `renderNonWorkingBands` emits `<g data-layer="non-working">` (the name must not contain "wave"; see `render.test.ts:1173`).
    - Placement: after the `swimlane-bg` loop and before `wave-bg` (`render.ts:~2905`).
    - Rects run from `chartBox.y` to `timeline.box` bottom (the seam/minor-grid span), with `fill = timeline.nonWorkingFill` and `fill-opacity = NON_WORKING_FILL_OPACITY`.
    - It returns `''` when no run has `band`, so hide emits no bytes.
    - Inside include regions it is re-emitted after the region rect and before `waveUnder` (`render.ts:~2098`) with `intersectBox`, and no clipPath.
12. **Tokens.**
    - `timeline.nonWorkingFill`: light `#64748b`, dark `#94a3b8`, grayscale `#737373` (`themes/shape.ts`, `light.ts`, `dark.ts`, `grayscale.ts`).
    - `NON_WORKING_FILL_OPACITY = 0.1` in `themes/shared.ts`, re-exported from `@nowline/layout`.
13. **Waves** follow decision 11 as written:
    - `E_k` is the latest member's logical end;
    - `S_{k+1} = max(E_k, forward(floor))`, using the raw floor;
    - only item starts snap. Snapping is monotone and idempotent, so the barrier still converges.
    - `onWaveBoundary` can differ between views; it only suppresses a doubled cut line.
14. **Lane utilization** is unchanged and documented. Segments follow the drawn boxes, and overlaps begin on working days, so the load classes match hide.
15. **Style key and NL.E0800** (core).
    - Add `non-working` to `STYLE_PROP_KEYS`, so Rule 20 rejects it raw on the roadmap line. Do not add it to `STYLE_PROP_ENUMS`; that avoids the uncoded message and the colour bypass at `nowline-validator.ts:965`.
    - Add `case 'non-working'` to `checkPropertyValues` for `DefaultDeclaration`, and a branch in `checkStylePropertyEnum` for style blocks. Anything other than `hide`/`show` gets exactly one **NL.E0800**:
      - EN: `Invalid non-working value "${value}". Use hide or show.`
      - FR: `Valeur non-working invalide « ${value} ». Utilisez hide ou show.`
    - Roadmap-only is not enforced, matching `minor-grid`.
    - Printer `KEY_ORDER`: `non-working` after `minor-grid`.
    - TextMate: the key goes in the style-key pattern (`grammars/nowline.tmLanguage.json:80`), and `hide|show` in the enum constants (`:91-92`).
16. **Shared helper:** new `layout/src/non-working-display.ts`, exported from `@nowline/layout` and re-exported from `@nowline/browser`.
    - It provides `NonWorkingDisplay`, `NON_WORKING_DISPLAYS`, `isNonWorkingDisplay`, and `parseNonWorkingDisplay(raw)`.
    - `parseNonWorkingDisplay` returns undefined for empty input, the value for `hide`/`show`, and throws a `RangeError` otherwise.
    - Core and the Action keep their own two-value checks, because they can't depend on layout.
17. **Surfaces.** "Unset" stays `undefined` everywhere. Copy `parseWidthArg` and MCP `width`, never the `theme` defaults.
    - **CLI:** `--non-working hide|show`, no short flag. An invalid value throws `CliError(InputError, 'nowline: invalid --non-working "x". Expected hide or show.')`. `serve` passes it too.
    - **Embed:** `initialize`, `render`, and the auto-scan inputs.
    - **Browser:** `RenderOptions.nonWorking`.
    - **Preview toolbar:** a dropdown "Non-working days: File / Hide / Show". `'file'` maps to undefined, like the theme dropdown's `'auto'`. Remember `closeSubMenus`.
    - **VS Code:** setting `nowline.preview.nonWorking` with values `file|hide|show` (default `file`). Precedence is toolbar, setting, file, hide; there is no `.nowlinerc` key.
    - **MCP:** `nonWorking` on `render` and `export`. It also goes to `collectMcpLayoutInsights` (`server.ts:692-702`) and the preview payload.
    - **Action:** input `non-working`, default `''`.
    - The Action and the VS Code CLI runner add `--non-working` only when it is set, because older CLIs reject unknown flags.
18. **Deliberate additions only:**
    - fixture `tests/weekends-show.nowline` (Example A plus a Wednesday-start bar, a group after a Friday end, and a Saturday milestone, with `default roadmap non-working:show`);
    - layout snapshot `weekends-show`;
    - determinism fixture `weekends-show` (`browser: false`).

    The determinism legs need no change, because the file key reaches layout without a render option.

## Change (critical files)

**Layout.** Under `packages/layout/src/`:
- new `non-working-display.ts` and `working-span.ts`;
- `time-scale.ts`;
- `layout.ts` (`LayoutOptions.nonWorking` at `:123`; `sequenceItem` at `:411-447`; `predictItemBarExtraHeight` at `:1060`);
- `nodes/swimlane-node.ts`, `nodes/group-node.ts`, `nodes/parallel-node.ts`;
- `nodes/roadmap-node.ts` (resolution; the show `spanDays` at `:258-260`; `setNonWorkingRuns` at `:121-130`; the extension pass);
- `nodes/anchor-node.ts`, `nodes/milestone-node.ts`;
- `wave-layout.ts:195`;
- `view-preset.ts` (`:320-375`, `:385-411`);
- `types.ts`, `style-resolution.ts`, the theme files, `index.ts`.

**Renderer:** `packages/renderer/src/svg/render.ts`.

**Core:**
- `src/language/nowline-validator.ts`;
- `src/i18n/codes.ts`, `messages.en.ts`, `messages.fr.ts`;
- `src/convert/printer.ts`;
- `grammars/nowline.tmLanguage.json`.

**Plumbing:**
- `packages/export/src/index.ts` (`RenderInputs` and `:270`);
- CLI: `args.ts`, `help.ts`, `commands/render.ts`, `commands/serve.ts`;
- embed: `index.ts`, `pipeline.ts`, `auto-scan.ts`;
- `browser/src/pipeline.ts` and `index.ts`;
- preview shell: `mount.ts`, `markup.ts`, `apply-result.ts`, `index.ts`;
- `preview/src/controller.ts`;
- MCP: `server.ts`, `diagnostics.ts`, `ui/payload.ts`, `ui/entry.ts`;
- VS Code: `package.json`, `extension.ts`, `preview/preview-panel.ts`, `preview/option-resolver.ts`, `render-pipeline.ts`, `webview/entry.ts`, `export/in-process.ts`, `export/cli-runner.ts`;
- Action: `action.yml`, `src/inputs.ts`, `src/cli.ts` (pull out a pure `buildRenderArgs`), `src/file-mode.ts`, `src/markdown-mode.ts`.

**Fixtures:**
- `tests/weekends-show.nowline`, `scripts/render-tests.mjs`, `tests/README.md`;
- `integration-tests/test/snapshot.helpers.ts` (`SAMPLES`);
- `integration-tests/determinism/spec.ts` (`FIXTURES`), plus `hashes.json` additions.

**Docs:**
- **Specs:**
  - `specs/rendering.md`: the shown days, the Styles row, Z-order, utilization and insight notes.
  - `specs/dsl.md`: the style table and rules 19 and 20.
  - `specs/cli.md`.
  - `specs/embed.md`, including the Action table.
  - `specs/ide.md`.
  - `specs/mcp.md`.
  - `specs/working-calendar.md`: status, §4.2, §7.3 (bands, layer, y-range, the month-scale rule, the sliver merge, snap sites), §7.5.
  - The handoff: status, the Phase 4 row, the decision 5 deviation note.
- **Man pages:** `man/nowline.1` and `man/fr/nowline.1`; `man/nowline.5` and `man/fr/nowline.5` (the key and NL.E0800).
- **READMEs:** CLI, embed, Action, VS Code.
- **Changelogs:** `CHANGELOG.md` and `packages/vscode-extension/CHANGELOG.md`, both under `### Added`, saying hide output is unchanged.

## Tests (fail without the change unless marked guard)

**Conventions:**
- Literal pixels are relative to `timeline.originX`, at 8 px/day, using `scale:1w start:2026-01-05 calendar:business`.
- Item boxes sit 6 px inside the logical extent.
- New tests import from `../src/index.js`.

**`layout/test/time-scale.test.ts`** (show scale: domain Jan 5 → Feb 2, range [0, 224])
- ppd is 8; `forward(Jan 10)=40`, `forward(Jan 30)=200`, `forward(Feb 2)=224`; `invert(40)=2026-01-10`.
- `startX`: 0→0, 16→16, 20→20, 40→56, 44→56, 48→56, `40-1e-9`→56.
- `advanceX`: (0,5)→40, (16,5)→72, (40,5)→96, (56,5)→96, (36,1)→60, (0,0.5)→4, (0,0)→0.
- **Guards:** hide (range [0, 160]) gives `startX(40)=40` and `advanceX(16,5)=56`. `calendar:full` with show gives `showsNonWorking` false and `advanceX(40,5)=80`.

**`layout/test/non-working-show.test.ts`** (new)

*Example A under show:*
- box left edges 6/62/118/174, right edges 34/90/146/202;
- milestone at 200;
- ticks `[0,'Jan 05'],[56,'Jan 12'],[112,'Jan 19'],[168,'Jan 26'],[224,undefined]`;
- width 224, `endDate` 2026-02-02;
- runs `[40,16,'2026-01-10','2026-01-11']`, `[96,16,…]`, `[152,16,…]`, `[208,16,'2026-01-31','2026-02-01']`, each with `band:true` and no `seam` or `titles`.

*Precedence* (W4 `box.x`):

| File key | Option | W4 `box.x` |
|---|---|---|
| none | none | 126 |
| none | `show` | 174 |
| `show` | none | 174 |
| `show` | `hide` | 126 |
| `hide` | `show` | 174 |

*Other cases:*
- **Engine C:** the schedule is identical with and without the key (W4 `['2026-01-26','2026-01-31']`).
- **Wednesday start** (`date:2026-01-07`, 1w): show 22–66, hide 22–50.
- **Containers:** after a 1w item, a group box is at 56 under show (40 under hide), with its child at 62 (46). A parallel behaves the same.
- **Sunday start:** band `[0,8,'2026-01-03','2026-01-04']`, first box at 14, ticks `[0,undefined]` then `[8,'Jan 05']`.
- **Month scale**, with a 3w item:
  - no run has `band`;
  - 2 ticks, the last at about 101.82 under show and about 72.73 under hide.
- **Saturday milestone** (Jan 31): 208 with no `hiddenDate` under show; 160 with `hiddenDate` under hide.
- **Now-line** on Sun Jan 11: 48 under show, 40 under hide.
- **NL.I1008** for `date:2026-01-10`: `{key:'date', pin:'2026-01-10', start:'2026-01-12'}` in both views, with the box at 62 under show. The `after:2026-01-10` tie cases inside a group and inside a parallel fire in both views.

**`layout/test/non-working-identity.test.ts`**
- Every full and custom input with `{nonWorking:'show'}` equals the default layout and carries no non-working keys.
- **Guard:** `{nonWorking:'hide'}` equals the default for `minimal`, `platform-2026` and `dependencies`.

**`layout/test/waves.test.ts`** (decision 11)

*Fixture:* waves `a`, `b`. Lane `s`: `x 1w a`, `z 1w b`. Lane `t`: `y 3d a`, `q 2d b date:2026-01-07`. File show.

*Show, expected:*
- `waves[0].endX` 40 and `waves[1].startX` 40;
- z and q boxes at 62;
- `endDate` 2026-01-10 and `startDate` 2026-01-12;
- NL.W1001 for q, `{wave:'b', key:'date', pin:'2026-01-07', start:'2026-01-12'}`, in both views;
- `capped` false.

*Floors and milestones:*
- Floor `after:2026-01-11`: `startX` 48 (hide 40), z at 62.
- Floor `after:2026-01-12`: `startX` 56.
- Monday milestone: `onWaveBoundary` true under hide, false under show.

**`layout/test/themes.test.ts`**
- `nonWorkingFill` is a 6-digit hex in each theme.
- Band over each row tint: contrast in [1.08, 1.30].
- Grid line over the band: ≥ 1.25.
- The grayscale fill is achromatic; the opacity is 0.1.

**Style resolution:** `resolveStyle('roadmap')` gives `nonWorking` `'hide'`, or `'show'` from the default line.

**`renderer/test/non-working.test.ts`**
- Example A under show: 4 rects at `o+40/96/152/208`, width 16, from `y = chartBox.y` down to the `timeline.box` bottom, light fill, `fill-opacity="0.1"`.
- Order: `swimlane-bg` < `non-working` < `wave-bg` < `grid`.
- Dark and grayscale use their own tokens.
- An include region re-emits the layer between the region rect and `data-layer="swimlane"`, clipped to the region, with no clipPath.
- **Guards:** no layer under hide or at month scale.

**Core**
- `validation.test.ts`:
  - `hide`/`show` are clean;
  - `maybe` and `#fff` each give exactly one NL.E0800 with the EN text;
  - a style block with a bad value gives one NL.E0800;
  - `roadmap r non-working:show` gives only the Rule 20 error;
  - the FR text matches.
- Printer: `minor-grid:true` prints before `non-working:show`.
- `lsp/test`: TextMate captures `non-working:` as a style key and `show` as an enum constant.

**Surfaces** (W3 writes these first, red, then plumbs). Every surface needs these three assertions:
1. The option set to `show` adds `data-layer="non-working"`.
2. File `show` with no option has the layer (unset stays undefined).
3. File `show` with the option `hide` has no layer.

Where they go:
- `cli/test/cli/args.test.ts`, and `cli/test/integration/cli.render.test.ts` (an invalid value fails with "Expected hide or show").
- `embed/test/manual-render.test.ts`, covering `render` and `initialize`.
- `browser/test/pipeline.test.ts`.
- `preview-shell/test/mount.test.ts` (3 options; Show posts `{nonWorking:'show'}`; the baseline doesn't set `overridden`) and `apply-result.test.ts`.
- `preview/test/controller.test.ts`.
- `mcp/test/mcp.smoke.test.ts`: render parity with `exportDocument`; `export` with `hide` on a file-show source; payload and arguments.
- `nowline-action/test/inputs.test.ts` (add `INPUT_NON-WORKING` to `INPUT_KEYS`).
- New `nowline-action/test/cli.test.ts`: the flag appears only when set.
- New `integration-tests/test/non-working-display.test.ts`: Mermaid, MS Project and XLSX bytes are identical for show and hide.
- VS Code has no test harness: typecheck plus a manual check.

## Byte identity (the gate for every wave)

1. **Baseline (s2, before any source edit):**
   - `make build && make test`;
   - `make compile TARGET=local && make determinism`;
   - hash every rendered `examples/**/*.svg` and `tests/*.svg` into `.scratch/m2p-p4/hide-baseline.sha256`.
2. **After W2 and at every later gate:**
   - `make build`, then `sha256sum -c` on the baseline: every line OK.
   - `make test` with no snapshot diff. Never set `UPDATE_LAYOUT_SNAPSHOTS`.
   - `make determinism` green.
3. **The fixture addition (s8):**
   - `UPDATE_DETERMINISM_GOLDENS=1 make determinism` after `make compile TARGET=local`.
   - `git diff -U0 hashes.json` must show only added `weekends-show:*` keys.
   - Then plain `make determinism`.
   - The new layout snapshot is the only new file under `__snapshots__/`.

## Out of scope (incidental findings, listed in the PR)

**Not in this phase:**
- Phase 5: declarations, band labels for titled runs, per-region calendars.
- LSP completion or hover for `hide`/`show`.
- A `.nowlinerc` key; per-block embed attributes; a VS Code test harness.

**Findings to list, not fix:**
- the colour bypass in the default-line enum check (`nowline-validator.ts:965`);
- roadmap-only style keys aren't enforced;
- style-value errors have no codes;
- `man/fr/nowline.1` lacks `--timezone`;
- `serve` and the Action accept only light/dark themes;
- `sequenceItem` ignores `start:` on direct parallel tracks;
- the TextMate `\b` style-key pattern matches the tail of a hyphenated key.

## Verification

- `make pre-commit` green.
- `make pack-mcpb`.
- `make bundle-size` under 200 KB (embed is 188.45 KB on `main`).
- Every byte-identity step above.
- `tests/weekends-show.svg` checked against Example A by eye at the final gate.
- CI green on the PR head, including the determinism gate.

## Hand-off from this session (after approval)

1. The PR #96 safety-net check-ins are over. The last one fired after the merge and was not re-armed.
2. This session has already committed this plan and its handoff to `claude/tender-babbage-mjx733`, restarted from `main` because #96 merged. That is the only thing it pushes for Phase 4.
3. Create a new cloud session with `create_session`:
   - repository `lolay/nowline`, starting from `claude/tender-babbage-mjx733`;
   - same environment, same model;
   - its prompt is the kickoff instruction above.
4. Give the user the new session's link, then stop. This session does not run any Phase 4 waves.

## Orchestration (personal-plan-orchestrate, as in Phases 1–3)

**Runner and branch:**
- A new cloud session starts from `claude/tender-babbage-mjx733`: `main` (`9c0982d`) plus one commit holding this plan and its handoff (`specs/handoffs/plan-m2p-show-display-osprey.md`, `handoff-m2p-show-display-osprey.md`).
- It works only on its harness-assigned branch, and opens the Phase 4 PR from there.
- Both files are removed as the branch's last commit.

**Waves:**
- Each wave is a Workflow with `model` and `effort` set for its tier, at high effort.
- W3's packages may run as parallel agents, because their files don't overlap.

**Gates (fail closed; a notification or a non-answer is never approval):**
- After W1: gates 5 and 2, asked together. That covers the canary check on which model ran, and the test review.
- Gate 1 on any error, a hide byte move, a `hashes.json` change other than the additions, or weak output.

**Commits:**
- Only on a green `make pre-commit`. W1's red tests are set aside at the gate.
- The W2 implementation is committed when green.
- Push before every wait.

**Every subagent prompt:**
- gives the exact trailers (`Assisted-by: Claude Code`, `Claude-Session: <the new session's link>`, `Co-authored-by: Claude <noreply@anthropic.com>`);
- says those trailers override any harness attribution reminder;
- forbids model names in commits, files, comments and the PR body.

**Artifacts:** `.scratch/orchestrate-plan-m2p-show-display-osprey-{wave}-{task}.md`.

## m2p Phase 4 steps

--- WAVE 1 [exec] ---

### s1 - [fast] Branch and toolchain (done)
`nvm use` 26.2.0 and `pnpm -v` 12.8.1. Then `make init && make build-fast`. The plan and handoff are already on the branch.

### s2 - [exec] Hide baselines (done)
Byte identity step 1. Done when the baseline hash file exists and determinism is green with the CLI leg run.

### s3 - [exec] Failing tests (layout, renderer, core) (done)
- Write every case in § Tests except Surfaces, with literal values.
- Run `make test`, parking packages as in Phase 2 when one failure hides the rest.
- Done when:
  - every new or updated test fails on an assertion, not a crash, where possible;
  - every guard is green;
  - nothing outside `*/test/` changed;
  - `make lint` passes.

--- STOP: gates 5 and 2 ---

--- WAVE 2 [deep] ---

### s4 - [deep] Implement layout and renderer
Decisions 1–14 and 16. One agent works serially, because the layout files overlap.

### s5 - [deep] Implement core
Decision 15.

### s6 - [deep] Prove hide unchanged, then commit
- Byte identity step 2.
- All s3 tests green.
- `make bundle-size`.
- Then `make pre-commit`, commit, push.
- Gate 1 on any hide byte move.

--- WAVE 3 [exec] ---

### s7 - [exec] Surfaces
Decision 17, test first, per package:
- export kernel and CLI (with `nowline.1` EN and FR, `cli.md`, CLI README);
- embed and browser;
- preview shell, preview and MCP;
- VS Code;
- the Action.

### s8 - [exec] Fixture, snapshot, determinism additions
Decision 18 and byte identity step 3.

--- WAVE 4 [exec] ---

### s9 - [exec] Docs
Everything under § Change "Docs". Done when `make lint` passes.

### s10 - [exec] Gates, commit, push, PR
1. Run § Verification in full.
2. Commit with the exact trailers, and push.
3. Open a PR to `main`, titled "Show non-working days as shaded bands (m2p phase 4)". The body follows the template. It lists the byte impact (none under hide; two deliberate additions), the decision 5, 9 and 10 deviations, and the incidental findings.
4. Subscribe to the PR, and drive it to green.

## Review log

review wave-1 (m2p-4 s1-s3) 92c9ec3..602bf3b: PASS - Node 26.2.0/pnpm 12.8.1, 40-hash hide baseline, determinism 266 green; 58 red tests on assertions, 2 TimeScale guards red only because startX/advanceX do not exist yet, printer order test cannot fail pre-change, indexAtX untested - 2026-10-07

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `orchestrator-wave-N`, or `wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`m2p-4-s1-s3`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` plus `<session-id>/subagents/**/agent-*.jsonl`. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (and `ephemeral_1h_input_tokens`, marked `1h`), output `output_tokens`. Calls with no `stop_reason` line: estimate output and mark the line `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.

Phase 1 ~$20.42; Phase 2 ~$66.4; Phase 3 ~$51.05. Phase 4 planning in the m2p session: 3 explorers and a design pass. Rows are added per wave by the executing session.

tokens wave-1 m2p-4-s1-s3 (claude-sonnet-5-5): input ~140 / cache read ~11M / cache write ~200k / output ~130k | ~$3.96 API-equiv (output est.) session 1ace5e35-cfdf-5791-b5ba-c2e888455b0c
tokens orchestrator-wave-1 plan-m2p-show-display-osprey (claude-opus-5-5): input ~40 / cache read ~2.3M / cache write ~100k 1h / output ~15k | ~$1.57 API-equiv (output est.) session 1ace5e35-cfdf-5791-b5ba-c2e888455b0c
