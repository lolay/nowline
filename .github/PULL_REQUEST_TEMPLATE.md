<!--
Thanks for opening a PR. A few quick reminders:

- Keep diffs focused: one logical change per PR.
- Run `pnpm build && pnpm -r lint && pnpm -r test` locally before pushing.
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

- [ ] I ran `pnpm build && pnpm -r lint && pnpm -r test` locally.
- [ ] I added or updated tests where the change affects observable behavior.
- [ ] I updated documentation (READMEs, `specs/`, inline comments) where the change affects observable behavior.
- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md) and agree to license my contribution under Apache 2.0.
