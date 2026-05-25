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
4. `.github/AGENT_TRIAGE.md` — canonical reference for this state machine (label glossary, override paths, rollout phase). The OSS source-of-truth lives at `lolay/nowline/.github/AGENT_TRIAGE.md`; the commercial source lives at `lolay/nowline-infra/.github/AGENT_TRIAGE.md`; consuming repos may carry a stub linking back.

If any rule in those files contradicts something below, the repo's rule wins. Stop and emit `human-decide` if you cannot reconcile them.

## 2. Label naming convention

Every label this state machine uses starts with one of two prefixes:

- `agent-…` — you (the agent) own the next move. The label name matches the workflow file that fires on it (e.g. `agent-plan` triggers `agent-plan.md`). One-to-one mapping.
- `human-…` — the next move belongs to a human. Stop and wait.

State labels are mutually exclusive: the cleanup glue workflow (`agent-label-transition.yml`) keeps exactly one state label on an issue or PR at a time. Origin/metadata labels (`cursor-engine-sync`, `dependencies`, `bug`, etc.) are not state labels and are preserved across transitions.

You add labels by emitting them through `safe-outputs: add-labels`. Never call `gh issue edit --add-label` directly from a phase prompt; the safe-outputs sandbox is the only sanctioned write path.

## 3. Empty-PR ban — three-way resolution

**Never open a PR with zero diff.** Empty PRs were the failure mode that prompted this state machine (see commit `8463631`); the v2 design forbids them structurally and behaviorally.

If after investigation you find no work is needed, classify the reason and emit one terminal label:

| Why no PR | Label to emit | Effect |
| --- | --- | --- |
| **Resolved without action** — already implemented, duplicate, wrong repo, detector says no action needed | `agent-done` | `agent-issue-close.yml` closes the issue. |
| **Cannot reproduce / ambiguous** — request unclear, need filer input | `human-author` | Issue stays open. Filer responds and removes the label, which re-fires the plan phase. |
| **Multi-option / hard-rule blocks action** — would require a design choice, or violates an AGENTS.md hard rule | `human-decide` | Issue stays open. Human picks an option (or `human-only`). |

In every case, post a comment alongside the label that explains the reasoning. The comment is the auditable artifact; the label is the routing hint.

## 4. AI assistance disclosure on PRs

When a phase opens a PR (`agent-deep` and `agent-exec` only, via `safe-outputs: assign-to-agent` delegating to a Copilot session), the resulting PR must include:

- `Closes #<issue number>` in the PR body — drives GitHub's auto-close on merge and the `agent-pr-merged.yml` linkage.
- An `Assisted-by: <agent name and version>` trailer on each commit, and the same line repeated under the `## AI assistance` section of the PR template. Use the agent's product name and version (e.g. `Assisted-by: Claude Opus 4.6`, `Assisted-by: Claude Sonnet 4.5`). See the target repo's `AI_POLICY.md` for the full convention.
- The plan reproduced verbatim in the PR description so reviewers don't need to dig back into the issue.

`Assisted-by: None` is for entirely hand-written PRs; never use it for an agent-opened PR.

## 5. Repo Hard rules override this prelude

Each repo's `AGENTS.md` lists Hard rules / Don't-do-this items that are stricter than anything here. Examples:

- `lolay/nowline` — round-trip and snapshot tests are sacred regression gates; generated code under `packages/core/src/generated/` is gitignored and overwritten by the build.
- `lolay/nowline-infra` — `terraform apply` always requires a prior `terraform plan`; `stacks/org/`, `stacks/site/`, and `bootstrap/` are protected by `prevent_destroy`; only WIF, no static service-account keys.
- `lolay/nowline-app`, `lolay/nowline-api`, `lolay/nowline-site` — see each repo's `AGENTS.md`.

If your action would violate a Hard rule, stop and emit `human-decide` with a comment explaining which rule blocks the action and what would unblock it.

## 6. What you cannot do (structural)

The phase workflow's `safe-outputs:` frontmatter limits you to a specific set of side effects:

- Judgment phases (triage, plan, review) can only **add labels** and **post comments**. They cannot open PRs, modify code, or close issues directly.
- Implementation phases (deep, exec) can additionally **assign to a Copilot agent** (which then opens a PR in a separate session). The phase's own job still cannot modify code.

If a phase prompt seems to ask for something outside the listed `safe-outputs` capabilities, that's either a mistake in the prompt or you misread it — re-read and pick the in-scope action.

## 7. House style — match the repo

Repos in this estate differ in stack and conventions but share a few invariants:

- **No emojis** in source, commit messages, PR bodies, or comments unless the repo's `AGENTS.md` explicitly invites them (none currently do).
- **Imperative subject lines, ≤72 chars, no trailing period** for commits. Match `git log --oneline` for tone.
- **Match existing style** — indent, quote style, import grouping, file naming. The repo's `CONTRIBUTING.md` § *Code style* (or equivalent) is canonical.
- **Optional body explains *why*, not *what*.** The diff already says what changed.

When in doubt, defer to the repo's existing patterns over generic best-practice. Mismatched style is one of the quickest ways an agent PR fails review.
