<!--
Thanks for opening a PR. A few quick reminders:

- Keep diffs focused: one logical change per PR.
- Run `make pre-commit` locally before committing or pushing.
- For changes that touch the language or the published AST JSON schema, please open an issue first to discuss the shape.

See CONTRIBUTING.md for the full workflow.

The description is a review guide: a reviewer should get the change from the
part above the first <details> in about 2 minutes, on a phone, without having
seen the issue thread, the plan or the session behind it. So say what's true
today before what changes, give a linked issue's or plan's one-line content
inline, and use no label the reader would have to look up.

Tag each area of the diff with what the reviewer should do with it; the PR's
tier is the highest tag, and when an area could take two tags it takes the
deeper one.

- [study] read every line: DSL syntax, AST JSON, CLI flags, exporter output,
  persisted data, auth or input validation, anything hard to undo.
- [check] read the named hunks: control flow, error handling, rewritten or
  loosened tests, behavior-changing config or workflows.
- [skim] glance: refactors covered by tests, docs, renames.
- [skip] trust the tool: generated code, lockfiles, formatter passes (name it).

Drop any section or tier with nothing to say. A [skim] or [skip] PR keeps the
Review tier and Review time lines and can drop Before and after and the rest
of the guide. A [study] or [check] PR keeps Before and after, as
"None: <reason>" when there's nothing to show.
-->

## Summary

<!-- What does this change do, in one or two sentences? If the PR carries two changes, the title names both, or the deeper one. -->

## Motivation

<!-- What's true today, and what goes wrong or is missing? Link the issue, bug repro, or design doc, and say here what it says: a link alone isn't the motivation. -->

Closes #

## Before and after

<!--
The one view that explains the change, taken from the base commit and from this branch:

- Behavior for given input (a DSL construct, a CLI flag, an MCP tool input, a diagnostic): a table, one row per input or case.
- A contract (AST JSON, a package's exports, a config key): a table, one row per field.
- Control flow between packages: a Mermaid pair with the same node names.
- A user-visible change (renderer, CLI output, error messages): before/after output. A renderer change follows AGENTS.md "Visual changes": before/after renders with the `.nowline` lines that draw them. Same-repo PRs also get a review.nowline.dev build to link.

Further views go in the collapsible blocks below.
-->

| <what> | Before | After |
| --- | --- | --- |
| <input, field or case> | | |

## Review guide

Review tier: [check], because <reason>.
Blast radius: <who or what breaks if it's wrong; how reversible>.
Review time: ~N min

<!-- Reading order: contracts and the tests that define new behavior first. One line per area, saying what to confirm there, not what the diff contains. Link each path to its diff. -->

1. [check] `path`: <what to confirm there>
2. [skim] `path`

## Validation

<!--
Each check you ran with its result, and each one that applies but didn't run, with why. For example:

- `make pre-commit`: pass
- `packages/core/test/...`: new regression test, fails without this patch
- Re-rendered `examples/minimal.nowline`: SVG unchanged
- `make lint-man`: not run, no mandoc locally (CI covers it)
-->

## Rollback

<!-- How to undo it: revert the squash commit, plus anything a revert doesn't undo (a published package, a migrated file). -->

<!--
One collapsible block per tier present, deepest first; [study] starts open. Keep the blank line after <summary> or the Markdown inside won't render.

<details>
<summary>[check] Control flow and error handling</summary>

<further before/after: contracts table, Mermaid diagram, data, error handling>

</details>

<details>
<summary>Decisions</summary>

<alternatives ruled out, and why>

</details>
-->

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
