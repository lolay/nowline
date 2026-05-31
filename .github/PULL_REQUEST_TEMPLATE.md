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

## AI assistance

<!--
Required. Name the specific agent + version, one per line. Write "None" if the PR is entirely hand-written.
Each AI-assisted commit also needs an Assisted-by: trailer. See AI_POLICY.md.
-->

Assisted-by: <e.g. Claude Opus 4.7, GPT-5.5, Cursor Composer 2.5, or "None">

## Checklist

- [ ] I ran `make pre-commit` locally.
- [ ] I added or updated tests where the change affects observable behavior.
- [ ] I updated documentation (READMEs, `specs/`, inline comments) where the change affects observable behavior.
- [ ] I have disclosed any AI assistance above with an `Assisted-by:` line (see [AI_POLICY.md](../AI_POLICY.md)).
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md) and agree to license my contribution under Apache 2.0.
