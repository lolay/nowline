# Handoff: m4.13 surface options (plan-surface-options-heron)

Session handoff for the `personal-plan-orchestrate` run of
`specs/handoffs/plan-surface-options-heron.md`. Removed (or promoted) in the
last commit before the PR merges.

## Branch and mode

- Repo `lolay/nowline`, branch `claude/serene-archimedes-ida865` (assigned by
  the cloud session; task branch). Started on it; nothing cut.
- Mode: unattended, confirmed 2026-10-13 by Gary in session 3d92f75d (harness=claude-code runner=cloud),
  re-confirmed the same day by the pasted Kickoff prompt after Gary's `/compact`.
- Guard: 3x the Cost table Total, min $50 (about $66). Fix-up cap 2 per group.

## Done

- Plan written and approved by Gary (2026-10-13). Kickoff block, wave
  markers, Cost table, Review log and Token log written.
- Wave 1 [deep] nowline m1 s1: a2fb3b2..5231496, review PASS.
- Wave 2 [exec] nowline m1 s2-s7: 910085c..e27c444, review PASS. m1 complete.
- Wave 3 [deep] nowline m2 s1: 7aaab18..d7f48cf (merge of origin/main ff8eb8b in 3de45e3), review PASS.
- Wave 4 [exec] nowline m2 s2: bf004a2..ea3707d, review PASS.
- Wave 5 [deep] nowline m2 s3: 8c735ef..e48332f, review PASS.
- Wave 6 [exec] nowline m2 s4-s7: 9b64c58..9d12547, review PASS, logged CONCERNS for a worker-disclosed breach (Makefile bypass, local only). Every plan step is committed.

## Review log verdicts, fix-ups, retries, checkpoints

- wave-1 (nowline m1 s1): PASS.
- wave-2 (nowline m1 s2-s7): PASS.
- wave-3 (nowline m2 s1): PASS (check_wave.py false positive on main's commit, see Deviations).
- wave-4 (nowline m2 s2): PASS.
- wave-5 (nowline m2 s3): PASS. Checkpoint: gate 2 ([deep] after [exec]) passed unattended before wave 5.
- wave-6 (nowline m2 s4-s7): CONCERNS (worker disclosed breach; review PASS). Gate 1, stopped.
- No fix-ups or retries. Checkpoints: gate 4 (new milestone m2) and gate 2 ([deep] after [exec]) passed unattended before wave 3.

## Spend

~$36.06 API-equiv so far (kickoff, planning, waves 1-6) of ~$22 expected. Over expected; under the ~$66 guard. Wave 2 ran ~$9.5 against ~$3.1 expected (Sonnet worker, 27M cache read over six steps), so the run will pass the expected total during m2; the guard is ~$66.

## Next unit

Depends on Gary's answer: a waiver leads to final verification and completion; a fix-up leads to unit 6-fix (re-run the s4-s7 gates through the Makefile only).

## Pending question

Wave 6 (m2.s4-s7, 9b64c58..9d12547) is done and its review passed, but the worker disclosed a breach, which stops the run at gate 1. It ran vitest directly (`npx vitest` on single files in packages/mcp and packages/cli, plus one `pnpm --filter @nowline/integration-tests exec vitest` browser run) instead of going through the Makefile. The reviewer also found one undisclosed `npm exec -- tsc --noEmit` in packages/cli. All of it was local and read-only: nothing was pushed, tagged or published, and the final gates ran through make. Reply `waive` to accept it and go to final verification (make ci, make pack-mcpb, changelog check), or `fix-up` to have a worker re-run every gate for s4-s7 through the Makefile only.

## How to resume

Paste the plan's Kickoff prompt.

## Decisions so far

- Plan-level (approved with the plan): `assetRoot` rc gets its own step,
  m1.s7; a relative rc `assetRoot` resolves against the `.nowlinerc`
  directory, a relative `--asset-root` flag against cwd; CLI width keeps the
  lenient `parseInt` rule (byte-identity); the VS Code extension gains a
  minimal vitest setup in m1.s4; one PR at the end with one commit per step.

- From wave 1 (review PASS), `packages/config/src/surface-options.ts`:
  surfaces register their own keys by passing their own `OptionSpecTable<S>`
  to `resolveOptions` and `rcLayer(config, specs)` (no mutable registry). Per
  key, the first layer whose value is not undefined/null wins; a bad winning
  value is reported and falls back to the default, lower layers unread. An
  empty string for width, pageSize or nonWorking means unset and still blocks
  lower layers (matches CLI `pickSetting`). An empty string for theme is an
  error, so in s2 the CLI must leave an empty `--theme ""` out of its flag
  layer to stay byte-identical. Errors come back in key order (theme, width,
  now, pageSize, nonWorking), so in s2 the CLI must throw the one it throws
  today (theme, then now, then width) to keep exit text unchanged.
  `mergeConfig` is untouched; s2 decides whether it goes.

- From wave 2 (review PASS): `mergeConfig` is deleted. CLI option resolution
  lives in `packages/cli/src/cli/options.ts`, MCP's in
  `packages/mcp/src/options.ts` (MCP now depends on `@nowline/config`; the
  Makefile pack/publish order puts config before mcp). `ASSET_ROOT_SPEC` is a
  separate exported spec in `@nowline/config`, not a member of
  `SURFACE_OPTION_SPECS`. `loadConfigFor` returns `{config, path}`. An empty
  `--asset-root` means unset and blocks the rc value. In `--serve` only the
  asset root goes through the new resolution (`resolveAssetRootOption`);
  m2.s7 moves the rest. MCP `timezone` is on render, export and validate
  (validate also gained `now`); convert takes neither and uses the local
  default. MCP timezone error text: `Invalid timezone: <parser text without
  the nowline: prefix>`. VS Code: setting width 0 means unset; any other bad
  width wins, falls back to fit-content and yields a warning row (code
  `invalid-option`), not an error row. A bad rc theme stays silently ignored.
  The extension resolves a relative rc assetRoot against the rc directory.
- From wave 3 (review PASS), `packages/renderer/src/stage.ts`: `staged.logo`
  is `LogoDimensions` for now; m2.s2 widens it to `LoadedLogo`. Core's
  `RawDiagnostic` stands in for the spec's nonexistent `RawDocumentDiagnostic`.
  Services type is `LangiumSharedCoreServices`. Two additions beyond spec
  §3.3: `include-error` also carries `resolved: ResolveResult` (the kernel's
  `IncludeResolveError` and the browser need every resolver diagnostic), and
  optional `StageInputs.isToleratedIncludeError(diag)`, which the browser
  passes (its no-op tag check) in m2.s4 so single-file mode reaches layout.
  m2.s7 should add both to spec §3.3 when it marks the spec implemented.
  `langium ~4.4.0` and `@nowline/core` are renderer runtime deps. Layout
  options are picked by name, not spread.
- From wave 4 (review PASS): `loadLogo` returns `LoadedLogo` (renderer
  `logo.ts`, exported). `renderSvg` embeds `RenderOptions.logo` only when its
  `ref` equals the positioned logo's `assetRef`, else resolves as before; a
  loaded logo embeds even without an `assetResolver`. The kernel passes
  `logo` inside `renderWith` (portable and both font-pinned renders).
  Browser and `--serve` pass `logo.dimensions` to layout and `logo` to
  `renderSvg`. Test: `packages/integration-tests/test/logo-read-once.test.ts`.
- From wave 5 (review PASS): R1 (m4.11) not on origin/main, so the schedule
  and wave plan stay with R1's m2.s2 (decision 1). The staged result gains
  `layout: StageLayout` (the five layout values, picked by name), with new
  exported types `StageLayout` and `StagedRoadmap` (re-exported from
  `@nowline/export`). `exportStaged(stage, format, inputs, host)` is public
  and throws a plain Error naming the first differing key (theme, today by
  `getTime()`, width, locale, nonWorking). `exportStaged` does not apply the
  stage's error mapping: a caller that stages for itself owns `invalid`,
  `include-error`, routed warnings and logo-load warnings; `exportStaged`
  applies `noLinks`, `strict` and `onWarning` to the render only. The
  kernel's mapping (`stageDocument`) stays internal; m2.s5 and m2.s6 decide
  whether to export it. Mermaid, msproj, xlsx and json no longer render an
  SVG, so render-time warnings no longer reach them (spec §6 accepts this).
- Follow-ups for m2.s7: add all three additions to spec §3.3 (`resolved`,
  `isToleratedIncludeError`, `layout`), and fix the stale `kernel-N` comment
  in `packages/integration-tests/test/export-json-envelope.test.ts:3` (the
  synthetic URI is now `memory:///stage-N.nowline`).
- From wave 6 (review PASS): `@nowline/export` now exports `stageForExport`
  and `acceptStagedRoadmap` (the kernel's staging and error mapping), used by
  MCP and the CLI. In the CLI a throwing stage or uncoded include error is
  held and thrown after the font and PDF checks. MCP `review: true` at width
  over 1024 stages a second time (different layout), reusing the document.
  Serve under `--strict` throws `render warnings (--strict): ...` as an error
  frame. `cli/theme.ts`, `cli/non-working.ts` and `resolveAssetRootOption`
  are deleted; `resolveCliOptions` takes an optional `cwd`. m4.13 is struck
  through in the milestones table and marked implemented.

## Milestone handoff m1 -> m2

m1 (one options schema) is complete: `@nowline/config` owns the option
schema and every surface (CLI render, MCP, VS Code) resolves through it, with
the three behaviour changes (one width rule, MCP local now plus `timezone`,
rc `assetRoot`) landed with docs and fragments. m2 (one staging function)
starts with `stageRoadmap` in `@nowline/renderer`. `--serve` still has its
own resolution except asset root; m2.s7 moves it onto m1's resolution.
R1 (m4.11) had not landed on main as of this wave; m2.s3 re-checks.

## Environment notes

- Cloud runner: Chromium at `/opt/pw-browsers`; do not run `playwright install`.
- Gate reference renders go in `.scratch/gates/ref-<sha>/` (gitignored),
  built from the last merged `origin/main`: c34804c at kickoff, ff8eb8b
  since wave 3 (`ref-ff8eb8b`, identical to `ref-c34804c`).
  `.scratch/gates/run.sh` exists, and `.scratch/gates/formats.sh` renders the
  G3 png/pdf/html/xlsx/msproj/mermaid set.
- `make pre-commit` takes longer than the 120 s tool timeout: run it in the
  background. `make determinism` here runs 210 tests and skips 104 (the
  CLI-binary and browser legs).
- `make determinism-browser` can't run here: Playwright 1.63 wants
  chromium_headless_shell-1243, `/opt/pw-browsers` has 1194, and the make
  target runs `playwright install` first (forbidden). CI covers it.
- The Makefile has no per-package test target, which is what pushed the
  wave-6 worker to raw vitest while iterating.
- Node on this runner is v22.22.0, not `.nvmrc`'s 26.2.0; `make init` and
  `make pre-commit` pass on it. `node_modules` may be missing in a fresh
  container: run `make init` first.
- `mandoc` is not installed, so `make lint-man` can't run; the French man
  page restamp uses the sha256 the parity test computes, and that test passes.
- New workspace dependency edges need hand edits to `pnpm-lock.yaml`;
  `make init` (frozen lockfile) accepts them.
- The extension's parity test imports CLI and MCP modules by relative source
  path, since neither is a package export.

## Deviations from plan

- Gate 4 (m1 -> m2) asks for a milestone handoff file
  (`specs/handoffs/handoff-m{N}-{topic}.md`). This plan's m1/m2 are the
  spec's internal migration milestones inside repo milestone m4.13, so a
  `handoff-m2-*.md` would collide with the repo's own milestone numbering.
  The milestone handoff is a section of this session handoff instead.
- The parent's bookkeeping commits a2fb3b2 and 910085c put
  `Claude-Session:` below `Assisted-by:`; later bookkeeping commits put it
  above. Step commits are correct. Left as is: they are pushed, rewording
  would change the worker SHAs the Review log cites, and the squash merge
  drops them.
- Wave 3: `check_wave.py` failed on ff8eb8b only, origin/main's own commit
  (subject not starting with the step ID, Co-authored-by, no trailers),
  reached through the merge commit the plan's run-wide rule requires. The
  checker walks `from..HEAD` including the merge's second parent. Both
  first-parent commits (3de45e3, d7f48cf) pass. A fix-up would have to
  reword a commit on main, which the plan forbids (never rebase), so the
  wave is logged PASS with the failure quoted in its note instead of
  CONCERNS. Any later wave that merges main gets the same handling, after
  the same check (upstream commit on origin/main, first-parent commits
  clean).
