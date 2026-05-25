---
description: "Phase 4 of the Nowline agent-triage state machine. Triggered when a PR is opened or updated by copilot-swe-agent[bot]. Reads the diff, plan comment, CI status, and repo house rules, then emits exactly one PR label: agent-merge (auto-merge approved) or human-pr (needs human review). Judgment-only — cannot modify the PR diff."
on:
  pull_request:
    types: [opened, synchronize]
  bots:
    - "copilot-swe-agent[bot]"
if: github.event.pull_request.user.login == 'copilot-swe-agent[bot]'
engine:
  id: copilot
  model: claude-sonnet-4.5
imports:
  - shared/agentic-prelude.md
safe-outputs:
  add-labels:
    allowed: [agent-merge, human-pr]
    max: 1
  add-comment:
    max: 1
permissions:
  issues: read
  pull-requests: read
  contents: read
  statuses: read
  checks: read
timeout-minutes: 15
---

{{#runtime-import .github/agent-prompts/agent-review.md}}
