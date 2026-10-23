<!--
Thanks for opening a PR. A few quick reminders:

- Keep diffs focused: one logical change per PR.
- Run `make pre-commit` locally before committing or pushing.
- For changes that touch the language or the published AST JSON schema, please open an issue first to discuss the shape.

See CONTRIBUTING.md for the full workflow.
-->

## Summary

<!-- What does this change do, in one or two sentences? -->

## Motivation

<!-- Why is this change needed? Link the issue, bug repro, or design doc. -->

Closes #

## How I tested this

<!--
Describe what you ran and what you saw. For example:

- `pnpm -r test` passes locally.
- Added a regression test in `packages/core/test/...` that fails without this patch.
- Re-rendered `examples/minimal.nowline` and confirmed the SVG is unchanged.
-->

## Screenshots / terminal output

<!-- If the change is user-visible (renderer, CLI output, error messages), include before/after. Delete this section if not applicable. -->

## Checklist

- [ ] I ran `make pre-commit` locally.
- [ ] I added or updated tests where the change affects observable behavior.
- [ ] I updated documentation (READMEs, `specs/`, inline comments) where the change affects observable behavior.
- [ ] I added a `.changelog/` fragment for any user-observable change, or the PR is labelled `no-changelog` (see [`.changelog/README.md`](../.changelog/README.md)).
- [ ] If this changes or removes behaviour a pending `.changelog/` fragment or `[Unreleased]` entry describes, I edited or deleted that entry instead of adding a contradicting one.
- [ ] I have disclosed any AI assistance below with an `Assisted-by:` line (see [AI_POLICY.md](../AI_POLICY.md)).
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md) and agree to license my contribution under Apache 2.0.

## AI assistance

<!--
Required, and keep it the last section: the squash commit on main is this description, and Git reads trailers only from the last paragraph.
Name the tool, not the model, one per line: Claude Code, Cursor, Codex, GitHub Copilot, Aider. Write "None" if the PR is entirely hand-written.
Each AI-assisted commit also needs the same Assisted-by: trailer. Never credit an agent with Co-authored-by. See AI_POLICY.md.
-->

Assisted-by: <e.g. Claude Code, Cursor, GitHub Copilot, or "None">
