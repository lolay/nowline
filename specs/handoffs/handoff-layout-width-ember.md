# Handoff: LayoutOptions.width no-op

Branch: `claude/stoic-darwin-r467wd` (harness-assigned).

## Done

Research only. Traced the regression (`9116144`, 2026-04-29; floor removed in `33e5bc8`), inventoried every surface that passes `width`, and measured natural canvas widths across `examples/`, `tests/`, snapshots and determinism fixtures. Findings and options are in [`plan-layout-width-ember.md`](./plan-layout-width-ember.md).

## Pending question (verbatim to the user)

Pick one: (a) real maximum with default unset (recommended), (a-1280) maximum keeping the 1280 default, (b) floor/stretch, (c) remove, (d) output scaling. Also, for (a): best-effort cap (timeline fits, text spill may overflow) or iterate to get closer?

## Resume

After the pick: failing test in `packages/layout/test/` plus a CLI `--width` test, implement in `packages/layout/src/nodes/roadmap-node.ts` (lines ~246, ~325-340, ~385), then docs (help.ts, `packages/cli/man/` en + fr, `specs/cli.md`, `specs/rendering.md`, VS Code `nowline.preview.width` description), `CHANGELOG.md` `## [Unreleased]`, `make pre-commit`.

## Gotchas

- Clone was shallow; `git fetch --unshallow origin main` before `git log -L`.
- CLI syntax is `nowline <input> [options]` (no `render` subcommand); `--now` seeds the now-line.
- Remove these two handoff files (or promote) as the last commit before merge.
