# AI Policy

AI-assisted contributions are welcome. Nowline ships [`AGENTS.md`](./AGENTS.md) precisely so coding agents can orient themselves in the repo. The bar for review and merge is the same as for hand-written code: small, focused, in scope, tested, and explained.

This document covers what we expect when you (a human) open a PR that AI helped produce. The general workflow lives in [`CONTRIBUTING.md`](./CONTRIBUTING.md); this file only addresses AI-specific expectations.

## Transparency

Disclose AI involvement at two levels.

**On each AI-assisted commit**, add an `Assisted-By:` trailer naming the specific agent and version. The trailer is a standard Git footer (same shape as `Co-Authored-By:` / `Signed-off-by:`) so it survives squash-merge and stays grep-able in `git log`.

```
fix round-trip printer quoting for template strings

The printer was emitting bare double quotes inside ${...} interpolations,
which broke the JSON -> text -> JSON round-trip on examples/templated.nowline.
Quote the inner expression with the surrounding string's delimiter instead.

Assisted-By: Claude Opus 4.7
```

Use the agent's own product name and version: `Claude Opus 4.7`, `Claude Sonnet 4.6`, `GPT-5.5`, `Cursor Composer 2.5`, `Codex CLI`, `Aider`, etc. Multiple trailers are fine if more than one agent contributed.

**In the PR description**, repeat the same `Assisted-By:` line(s) under the `## AI assistance` section of the [PR template](./.github/PULL_REQUEST_TEMPLATE.md) so reviewers see the disclosure without clicking through commits. If the PR is entirely hand-written, write `Assisted-By: None`.

**For PRs opened by autonomous agents** (no human in the seat at submission time), put a single `🤖` in the PR title so we can triage it quickly. Autonomous-agent PRs are not penalized for the marker — it just routes review attention.

Optional but useful: a short note on *what* the AI did (e.g. "drafted the regex and the tests; I refactored the public API and rewrote the error messages"). This helps reviewers calibrate what to scrutinize.

## Accountability

You — the human pushing the button — own the PR. Specifically:

- **Human author.** PRs must be submitted from a real, human-owned GitHub account. Bot accounts used to ship AI output are not accepted.
- **You reviewed every line.** Proceed on the assumption that a reviewer will ask why a given line exists. If your honest answer is "the model wrote it and I didn't read it," the PR isn't ready.
- **You can explain it without re-prompting.** You should be able to walk through the change, the trade-offs, and the failure modes in your own words. Re-asking the AI to explain its own output during review is a signal that the PR was submitted too early.
- **You own the tests, edge cases, and scope fit.** The Apache 2.0 contributor grant applies regardless of who drafted the diff; submitting the PR is your warrant that you have the rights.

## Quality

Nowline has a deliberately narrow scope (see [`specs/principles.md`](./specs/principles.md)) and a high stability bar in the grammar, AST, and renderer snapshots. AI doesn't lower that bar.

- **Assistance, not automation.** Use AI to draft, refactor, or accelerate; don't paste output without refinement. AI-plausible-but-wrong code is the most common failure mode we see.
- **Match the existing style.** 4-space TypeScript, 2-space `.nowline`, no narration comments, no emojis in source / commits / user-facing output, named imports, `.js` import specifiers in TS. The style rules in [`CONTRIBUTING.md`](./CONTRIBUTING.md#code-style) are the canonical list.
- **Discuss before drafting non-trivial changes.** Anything touching the grammar, AST shape, layout, renderer, or scope-of-the-product still needs an issue-first discussion — whether you write the code or an agent does. PRs that skip that step may be closed without review.
- **Round-trips and snapshots are the regression gate.** If your change moves [`packages/cli/test/convert/roundtrip.test.ts`](./packages/cli/test/convert/roundtrip.test.ts) or [`packages/layout/test/__snapshots__/`](./packages/layout/test/__snapshots__/), say so explicitly and justify the new baseline.

## What we will close fast

To keep review capacity for legitimate work, we will close — without extensive back-and-forth — PRs that:

- Refactor grammar, printer, layout, or renderer code without a prior issue discussion.
- Expand the product scope past [`specs/principles.md`](./specs/principles.md) (issue tracking, resource leveling, whiteboard features, etc.).
- Update snapshots casually, with no explanation of the intentional visual or structural change.
- Come from bot accounts, or omit the required `Assisted-By:` disclosure when AI was clearly involved.
- Ask the reviewer to do the contributor's work (e.g. "can you tell me why this test fails?" with no investigation attached).

None of these are AI-specific failure modes — they're the same patterns that already burn human review time. We're listing them here because AI tooling makes it easier to produce them at volume.

## Licensing

By opening a PR you confirm that your contribution can be licensed under [Apache 2.0](./LICENSE), regardless of whether the diff was hand-written or AI-assisted. We do not currently require a CLA or DCO; if that changes, the announcement will be in an issue and [`CONTRIBUTING.md`](./CONTRIBUTING.md) will be updated.
