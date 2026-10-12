# Handoff: m2p Phase 5b (declarations on the chart and in exports)

**Temporary runner file.** It reaches `main` with [`plan-m2p-5b-heron.md`](./plan-m2p-5b-heron.md) through a plan-only PR, as 5a's plan did (lolay/nowline#114). The 5b branch removes both files as its last commit before merge.

## Where things stand

- **Phases 1–4 and 5a** are on `main`: lolay/nowline#96 as `9c0982d`, #97 as `c74c795`, #115 as `e3b2479`. The plan was written against `main` `a758c72` (2026-10-12).
- **Branch:** `claude/plan-m2p-5b-heron-5bcx5v`, the executing session's harness-assigned branch, cut from `main` at `7ac0d44` (the plan PR, lolay/nowline#117). The planning session's `claude/hopeful-dirac-g9dll4` is gone; the Kickoff prompt's `On branch` line now names this branch.
- **Mode:** unattended, confirmed 2026-10-12 by the executing session (session `d2e6b266-7085-567a-b805-c4269ef5a3e8`). Run complete.
- **Done:** wave 1 `[exec]` s1-s3, `72b4376..84f3b6d`, review PASS (s1 `2210b06` empty baseline commit, s2 `ad7b7cb` tooling, s3 `84f3b6d` red layout and renderer tests). Wave 2 `[deep]` s4-s6, `9a6b159..50206d6`, review PASS (s4 `a204075` labels and packing, s5 `20995fa` renderer, s6 `50206d6` empty: byte identity clean, bundle 193.33 KB of 200 KB). Wave 3 `[exec]` s7-s10, `09eb264..fb564b5`, review PASS (s7 `4a68dd7` exports, s8 `6b529a5` fixtures and snapshots, s9 `107a09f` docs, s10 `fb564b5` empty: § Verification green). Byte-identity baselines live in `.scratch/m2p-5b/` (gitignored; rebuild per § Byte identity step 1 if the container is lost).
  - The research is in the plan: three read-only code maps and a scratch probe.
  - The probe laid out Example B in both views, ran `packMarkerRow` with the real re-pack bounds, and exported Examples B, D and E row 1 to Mermaid and MS Project. It was deleted afterwards, and `dist/` was restored.
- **Next unit:** none; all 10 steps done. Pending: the maintainer's go to open the PR, plus the cleanup commit that removes this plan and handoff.
- **Spend:** ~$17.48 API-equiv (waves ~$4.06 / ~$3.47 / ~$6.06, orchestrator ~$3.89) against ~$23 expected; guard ~$69 never approached. The planning session is outside the Cost table.

## Pending question

Open the PR now? If yes, I'll first push a last commit removing `specs/handoffs/plan-m2p-5b-heron.md` and this handoff (s10 item 3), then open the PR to `main` with the draft below, subscribe to it, and drive CI to green. The other route keeps the files on the branch for now and stops here.

### PR draft (from wave 3's worker, reviewed)

**Title:** Draw and export named non-working days (m2p phase 5b)

**Body:**

```markdown
## Summary

A dated, titled `non-working` declaration is now labelled on the chart (`Thanksgiving · 2d`, `Company summit · 3d`) in both views, and the MS Project and Mermaid exports carry the declared days: MS Project gets `<Exceptions>` in its base calendar and Mermaid gets the ISO dates on its `excludes` line. The editor and agent tooling learn the two keywords. This is phase 5b of the working calendar (m2p).

- **Chart.** Under `hide` the label sits on a dotted cut line at the seam; under `show` it sits at the band's left edge. Both are packed into the marker row with the anchors and milestones, and the chart grows on the right when a label would otherwise fall onto the header card. The model gains `label`, `labelBox`, `labelSide` and (under `hide`) `cut` on a titled `PositionedNonWorkingRun`; the SVG gains `<g data-layer="non-working-label">`. Both are omitted when no run has a title.
- **Exports.** `calendarExceptions` in `@nowline/layout` is the one derivation: maximal runs of days whose working state differs from the open-ended week. MS Project writes one `<Exception>` per run (title as `<Name>`); Mermaid appends every closed day to `excludes`. Mermaid cannot express a working exception, so those days are counted as `working-day` in its `%%` summary.
- **Tooling.** LSP completion (`non-working` and `working` in `config`, weekday names after `every:`, `hide` / `show` after `non-working:`) and hover on a declaration, TextMate colouring, `non-working` and `working` snippets, the MCP `schema` keywords and a Working calendar section in the cheatsheet.
- **Docs and fixtures.** `working-calendar.md`, `rendering.md`, `dsl.md`, `ide.md`, both exporter READMEs, `nowline(5)` (en and fr), the CHANGELOG, and three fixtures: `examples/working-calendar.nowline`, `tests/non-working-hide.nowline`, `tests/non-working-show.nowline`.

**5a and 5b now ship together.** 5a (#115) put the declarations into the schedule, but until this PR Mermaid lays a holiday-spanning `Nd` across the holiday and MS Project does not know the closure. Do not cut a release between the two.

**Byte impact.** None for files without the keywords: every existing layout snapshot, determinism cell, rendered SVG and Mermaid / MS Project export is byte-identical. The deliberate additions, by name:

- two snapshot files: `non-working-hide.svg` and `non-working-show.svg`;
- one determinism fixture, `working-calendar` (eight new `hashes.json` cells, nothing else changed);
- one rendered example, `examples/working-calendar.svg`;
- two rendered test fixtures, `tests/non-working-hide.svg` and `tests/non-working-show.svg`.

**Deviation from spec section 8 (decision 6).** The spec said MS Project would get `<WorkWeeks>` "where a bounded recurrence changes the week". This PR writes `<Exceptions>` only: a bounded recurrence becomes one exception per run of days it changes, and the exceptions never overlap. The spec section 8 is updated in this PR to say so.

## Motivation

Phase 5a (#115) made the declarations affect the schedule, but nothing drew their titles and two exporters ignored the dated days (`specs/working-calendar.md` sections 7.4 and 8, `specs/handoffs/handoff-m2p-working-calendar.md` phase 5b). Without this the chart, Mermaid and MS Project disagree about a holiday inside a bar.

Closes #

## How I tested this

- `make pre-commit` passes locally (lint, build, typecheck, every Vitest suite), as does `make pack-mcpb`.
- `make bundle-size`: 193.33 KB of the 200 KB budget (192.84 KB before the layout and renderer changes).
- Byte identity, at the final gate: the 43 rendered SVGs of `examples/` and `tests/` all match their pre-change SHA-256; the Mermaid and MS Project exports of all 52 tracked `.nowline` files (pinned with `--now 2026-02-09`) diff empty; `make test` leaves every snapshot untouched; `make compile TARGET=local && make determinism` passes with `hashes.json` changed only by the eight `working-calendar:*` cells.
- Tests added before the code and seen failing: `layout/test/calendar-exceptions.test.ts`; the Example B label, packing, canvas-growth and renderer cases; MS Project `<Exceptions>` (Examples B, D, E, escaping); Mermaid dated `excludes` and `working-day`; LSP completion and hover; TextMate; snippets; MCP schema; the export kernel round trip for Example B. Guards pin Examples A and C and every preset without declarations.
- Rendered the three new fixtures to PNG and checked the labels, the cut lines and the marker-row packing by eye.

## Screenshots / terminal output

Example B, `hide`: labels `Thanksgiving · 2d` and `Company summit · 3d` on cut lines, Launch on the second marker row. `show`: the same labels at the bands' left edges. See `tests/non-working-hide.nowline` and `tests/non-working-show.nowline` (`make build` renders them).

Mermaid for Example B:

    excludes saturday, sunday, 2026-11-26, 2026-11-27

MS Project for Example B, base calendar after `</WeekDays>`:

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

## Findings, listed and not fixed here

- Anchors and milestones keep the left fallback that can draw over a beside header (`packMarkerRow`, `roadmap-node.ts`); the canvas growth in this PR covers run labels only.
- The general TextMate keyword list (`grammars/nowline.tmLanguage.json`) still lacks `wave`.
- The `build-fast` help text says "~30-SVG"; the render is 43 SVGs before this PR and 46 after.

Also by design: only dated, titled, non-working rules are labelled. A titled bounded recurrence or a titled `working` exception is not drawn on the chart (documented in `working-calendar.md` section 7.4).

## AI assistance

Assisted-by: Claude Code

## Checklist

- [x] I ran `make pre-commit` locally.
- [x] I added or updated tests where the change affects observable behavior.
- [x] I updated documentation (READMEs, `specs/`, inline comments) where the change affects observable behavior.
- [x] I have disclosed any AI assistance above with an `Assisted-by:` line (see [AI_POLICY.md](../AI_POLICY.md)).
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md) and agree to license my contribution under Apache 2.0. (the maintainer confirms this one)
```

## How to resume

The run is complete. From a cloud session on `claude/plan-m2p-5b-heron-5bcx5v`: remove the plan and this handoff in one commit, push, and open the PR with the draft above (only once the maintainer says go).

## Deviations

- **s10 is split** (see below): no retries and no fix-ups occurred in any wave.

- **Gate 2 passed as an unattended checkpoint** before wave 2 (exec to deep), per the recorded mode.
- **s10 is split.** Wave 3's worker runs § Verification and makes the s10 commit, and drafts the PR title and body in its artifact. Removing the plan and handoff, opening the PR and subscribing to it are outward or final steps: the orchestrator asks the maintainer at completion.
- **Wave 2 commits per step.** The plan has s6 commit and push; the orchestrator had s4 and s5 commit their own steps (s4 under the red-test exception for the s3 renderer cases), s6 an empty commit after the proof, and the parent push.

- **The kickoff question was deferred** (answered `unattended` on 2026-10-12 by the executing session). The skill asks it right after the plan is written. Here the planning session wrote the Kickoff block in its pending form (`mode: pending`, Status `BLOCKED at gate mode`, no mode line in the prompt) and left the question to the executing session. That session needs the maintainer's approval of the plan PR first, and was asked to drive only the 5b plan. `plan_state.py` reports only `gate-mode`.
- **Decision 6 deviates from spec §8** (no `<WorkWeeks>`). s9 updates the spec in the 5b PR.
- **Decision 3 adds a run-label canvas growth** that the milestone handoff doesn't mention. Without it, Example B's label under `hide` draws over the header card. The probe showed this.

## Decisions so far

The plan's Decisions section holds all eight. From wave 1 (review PASS):

- `declarationAt` now returns `NonWorkingDeclaration` / `WorkingDeclaration`, so the LSP rename and references providers skip them through a new `isCalendarDeclaration` helper (tests pin it). s9's docs should describe hover on declarations but no rename or references.
- The snippet validation test wraps each snippet in a roadmap that also has a swimlane and an item, because NL.E0004 rejects a roadmap with no swimlane; it asserts no diagnostics of any severity via a new `parseAndValidate` helper.
- s3's Launch show-column case already passes (it pins existing behaviour); the 12 red layout and 7 red renderer cases are the ones s4 and s5 turn green.

From wave 2 (review PASS):

- `nonWorkingRunLabel` (exported from `layout/src/view-preset.ts`) builds the label; `buildNonWorkingRuns` sets `label` and, under hide, `cut`; `labelBox` / `labelSide` come only from the re-pack of the final runs.
- The pre-pack packs against a right edge widened for the provisional run labels (beyond decision 3), so a label the later canvas growth puts on the right doesn't take the left fallback and oversize the marker band. `ctx.chartRightX` is untouched; files without titled runs see no change.
- Commit subjects use the bare step ID (`s7 ...`), as waves 1 and 2 did.
- Bundle size: 192.84 KB before wave 2, 193.33 KB after (200 KB budget).

## Environment notes

- **Node 26.2.0** from the official linux-x64 tarball, verified against `SHASUMS256.txt`, extracted into `$HOME`, with its `bin` first on `PATH` in every shell.
- **pnpm 12.8.1 is preinstalled** at `/opt/node22/bin/pnpm`. Append `/opt/node22/bin` to `PATH`. Do not run `corepack enable` under Node 26: its shim looks for `bin/pnpm.cjs`, pnpm 12 ships `bin/pnpm.mjs`, and `make init` fails with `MODULE_NOT_FOUND`.
- **`make init && make build-fast`** take about two minutes on a fresh container.
- **Vitest suppresses `console.log`**: a temporary probe test has to write to a file.
- **`pnpm -r` stops at the first failing package**, so with red tests in layout, `make pre-commit` never reaches renderer, integration or later packages; run their vitest per package to see them.
- **Write temp files only under the session scratchpad**: a redirect to a root path followed by `rm` trips the rm safety check.
- **MS Project `<StartDate>`** is the export date. `--now 2026-02-09` on the CLI pins it, which the byte-identity export baseline needs.

## Follow-ups

- Anchors and milestones keep the left fallback that can draw over a beside header (`packMarkerRow`).
- The general TextMate keyword list lacks `wave`.
- The `build-fast` help text says "~30-SVG"; it is 46 now.
- The 5a CHANGELOG entry still calls the exports "phase 5b"; worth a tidy at release cut.

## Gotchas

- **The extension pass rebuilds the runs** (`roadmap-node.ts:688`). Compute labels from the final runs, never from the pre-pack's copies.
- **The packer sorts by `centerX` with a stable sort.** Run entries go after the markers, so a marker wins a tie at the same x. Example B under `hide` is exactly that tie.
- **Omit every new model key on untitled runs.** Never `undefined` or `[]`, and no empty `<g data-layer="non-working-label">`.
- **`textmate-wave.test.ts` indexes grammar patterns by position.** Widen the existing line-start pattern at index 0; don't insert a new one before it.
- **Only dated, titled, non-working rules carry titles** (`titledRules`). A titled bounded recurrence or a titled `working` rule is never labelled.
- **The French `nowline.5` has a translation stamp** that `make test` checks. Carry every English edit into it, then replace the stamp with the line the failing test prints.
- **5a and 5b ship in the same release.** Don't let a release cut land between them.
