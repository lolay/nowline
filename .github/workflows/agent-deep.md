---
description: "Phase 3 (deep model) of the Nowline agent-triage state machine. Triggered by agent-deep label. Verifies a ## Plan comment exists, sanity-checks it against repo Hard rules, then delegates to a Copilot coding-agent session (Opus) that writes the code and opens a PR."
on:
  issues:
    types: [labeled]
if: github.event.label.name == 'agent-deep'
engine:
  id: copilot
  model: claude-opus-4.7
imports:
  - shared/agentic-prelude.md
safe-outputs:
  assign-to-agent:
    model: claude-opus-4.7
  add-labels:
    allowed: [agent-done, human-author, human-decide]
    max: 1
  add-comment:
    max: 1
permissions:
  issues: read
  pull-requests: none
  contents: read
timeout-minutes: 20
---

{{#runtime-import .github/agent-prompts/agent-deep.md}}
