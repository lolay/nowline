---
description: Shared rules every Nowline agent-triage phase respects (AGENTS.md delegation, label conventions, empty-PR ban, AI assistance disclosure, hard-rule precedence). Imported by agent-triage.md, agent-plan.md, agent-deep.md, agent-exec.md, and agent-review.md.
---

# Nowline agent-triage shared prelude

You are operating inside the Nowline agent-triage state machine. Five phase workflows (triage, plan, deep, exec, review) each import this file. The rules here are non-negotiable across phases; the phase-specific prompt that follows refines them but never relaxes them.

## 1. Read the repo's house rules first

Before deciding anything in the phase that imports this prelude, read these files in the target repository (in order):

1. `AGENTS.md` — repo-wide orientation for AI agents. Treat any **Hard rules**, **What NOT to do**, **Don't do this**, or equivalent section as authoritative.
2. `AI_POLICY.md` — repo-wide AI assistance policy (transparency, accountability, quality bars).
3. `CONTRIBUTING.md` — human contributor workflow. The auto-merge policy and PR conventions there apply to you.
4. `.github/AGENT_TRIAGE.md` — canonical reference for this state machine (label glossary, override paths, rollout phase). This repo's copy is the canonical reference; consuming repos may carry a stub linking back.

If any rule in those files contradicts something below, the repo's rule wins. Stop and emit `human-decide` if you cannot reconcile them.

## 2. Label naming convention

Every label this state machine uses starts with one of two prefixes:

- `agent-…` — you (the agent) own the next move. The label name matches the workflow file that fires on it (e.g. `agent-plan` triggers `agent-plan.md`). One-to-one mapping.
- `human-…` — the next move belongs to a human. Stop and wait.

State labels are mutually exclusive: the cleanup glue workflow (`agent-label-transition.yml`) keeps exactly one state label on an issue or PR at a time. Origin/metadata labels (`vscode-engine-bump`, `dependencies`, `bug`, etc.) are not state labels and are preserved across transitions.

You don't add labels directly. You emit a **verdict** — a comment whose first non-blank line is the literal plain text `agent-verdict: <label>` (no backticks, no HTML comment, no code fence). The [`agent-verdict-apply.yml`](./agent-verdict-apply.yml) glue workflow reads the marker, validates it against the state machine (which transitions are reachable from the current state label), checks for any `human-*` override label, and applies the proposed label only when both checks pass. (The marker is plain text rather than an HTML comment because gh-aw's safe-outputs content sanitizer mangles XML-comment syntax — see [Safe Outputs Specification § Markdown Safety](https://github.github.com/gh-aw/reference/safe-outputs-specification/).)

This means a human swapping in `human-only` (or any `human-*` label) mid-flight is structurally final: the apply workflow respects it and your verdict is suppressed with a follow-up comment naming the override. Your phase frontmatter no longer has `safe-outputs.add-labels` — emitting a verdict via `add-comment` is the only sanctioned write path. Never call `gh issue edit --add-label` directly from a phase prompt.

The same mechanism serves Copilot coding-agent sessions (their empty-diff fallback path inside `agent-deep` / `agent-exec`) and human moderators using the same marker syntax — `agent-verdict-apply.yml` is author-agnostic.

## 3. Empty-PR ban — three-way resolution

**Never open a PR with zero diff.** Empty PRs were the failure mode that prompted this state machine (see commit `8463631`); the v2 design forbids them structurally and behaviorally.

If after investigation you find no work is needed, classify the reason and post a verdict comment:

| Why no PR | Verdict marker | Resulting label | Effect |
| --- | --- | --- | --- |
| **Resolved without action** — already implemented, duplicate, wrong repo, detector says no action needed | `agent-verdict: agent-done` | `agent-done` | `agent-issue-close.yml` closes the issue. |
| **Cannot reproduce / ambiguous** — request unclear, need filer input | `agent-verdict: human-author` | `human-author` | Issue stays open. Filer responds and removes the label, which re-fires the plan phase. |
| **Multi-option / hard-rule blocks action** — would require a design choice, or violates an AGENTS.md hard rule | `agent-verdict: human-decide` | `human-decide` | Issue stays open. Human picks an option (or `human-only`). |

Post the verdict marker as the **first non-blank line** of your comment, then a blank line, then the reasoning. The comment body is the auditable artifact; the marker drives `agent-verdict-apply.yml` to apply the label. Both gh-aw phase orchestrators and Copilot coding-agent sessions emit verdicts this way.

## 4. AI assistance disclosure on PRs — MANDATORY

When a phase opens a PR (`agent-deep` and `agent-exec` only, via `safe-outputs: assign-to-agent` delegating to a Copilot session), the resulting PR **MUST** include all four of the following. These are not aspirational — they are gates: PRs missing any of them will (a) fail to auto-close the issue, (b) fail downstream review, and (c) eventually be enforced by a CI check that rejects the PR.

1. **`Closes #<issue number>`** on its own line in the PR body. This is what drives GitHub's auto-close-on-merge and the `agent-pr-merged.yml` linkage. Smoke test C (2026-05-25) proved that without this line, the issue stays open after merge and the state machine can't terminate cleanly.
2. **`## AI assistance`** section in the PR body with an `Assisted-by:` line naming the agent's product name and version. Use the model carried into the Copilot session by the workflow that delegated to you:
   - From `agent-deep` → `Assisted-by: Claude Opus 4.7`
   - From `agent-exec` → `Assisted-by: Claude Sonnet 4.5`
3. **`Assisted-by: <same string as above>`** as a trailer on **every commit** on the PR branch (standard Git footer, last line of the commit body).
4. **The plan reproduced verbatim** in the PR description under a heading like `## Plan from issue` so reviewers don't need to dig back into the issue.

`Assisted-by: None` is reserved for entirely hand-written PRs; never use it for an agent-opened PR. If you can't determine the model name (because the workflow that delegated to you didn't say so), default to `Claude Sonnet 4.5` and flag it in the PR description — but this should never happen because the delegating workflow's prompt body always names the model.

## 5. Repo Hard rules override this prelude

Each repo's `AGENTS.md` lists Hard rules / Don't-do-this items that are stricter than anything here. Examples:

- `lolay/nowline` — round-trip and snapshot tests are sacred regression gates; generated code under `packages/core/src/generated/` is gitignored and overwritten by the build.
- Other repos in this estate — see each repo's `AGENTS.md`.

If your action would violate a Hard rule, stop and emit `human-decide` with a comment explaining which rule blocks the action and what would unblock it.

## 6. What you cannot do (structural)

The phase workflow's `safe-outputs:` frontmatter limits you to a specific set of side effects:

- Judgment phases (triage, plan, review) can only **add labels** and **post comments**. They cannot open PRs, modify code, or close issues directly.
- Implementation phases (deep, exec) can additionally **assign to a Copilot agent** (which then opens a PR in a separate session). The phase's own job still cannot modify code.

If a phase prompt seems to ask for something outside the listed `safe-outputs` capabilities, that's either a mistake in the prompt or you misread it — re-read and pick the in-scope action.

Beyond the safe-outputs sandbox, the verdict mechanism adds a second structural guarantee: agents cannot apply state labels directly. The only path is to emit a verdict marker inside a comment; `agent-verdict-apply.yml` is the only workflow with `issues: write` / `pull-requests: write` for state-label transitions, and it refuses any `agent-*` verdict when a `human-*` label is present. A human swapping `human-only` in mid-flight is structurally final.

## 7. House style — match the repo

Repos in this estate differ in stack and conventions but share a few invariants:

- **No emojis** in source, commit messages, PR bodies, or comments unless the repo's `AGENTS.md` explicitly invites them (none currently do).
- **Imperative subject lines, ≤72 chars, no trailing period** for commits. Match `git log --oneline` for tone.
- **Match existing style** — indent, quote style, import grouping, file naming. The repo's `CONTRIBUTING.md` § *Code style* (or equivalent) is canonical.
- **Optional body explains *why*, not *what*.** The diff already says what changed.

When in doubt, defer to the repo's existing patterns over generic best-practice. Mismatched style is one of the quickest ways an agent PR fails review.
