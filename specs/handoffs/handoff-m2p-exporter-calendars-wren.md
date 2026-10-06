# Handoff: m2p Phase 3 (exporters read the file's calendar)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-exporter-calendars-wren.md`, as the branch's last commit before merge.

## Where things stand

- **Branch:** `claude/tender-babbage-mjx733`. PR lolay/nowline#96 covers phases 1–2 and is open.
- **Phases 1–2 are done:**
  - commits `4a596b6`, `df7286c`, `980beae`, `bf86c5d`;
  - CI is green on `bf86c5d`, including the browser determinism leg;
  - the PR is waiting on maintainer review.
- **Phase 3 plan:** [`plan-m2p-exporter-calendars-wren.md`](./plan-m2p-exporter-calendars-wren.md). It was drafted from three read-only code maps and then checked against the code by a separate review agent. That agent's fixes are folded in: the baseline method, test literals that fail today, the custom fixture, the exact existing-test sites, the Mermaid number format and snap point, and the missing docs.
- **The plan is not approved.** Nothing is implemented and no wave has been dispatched.

## Pending question

Approval of the Phase 3 plan.
- The maintainer asked for it with "Ok, let's create the plan for phase 3".
- The session was in plan mode, but a worker restart dropped plan mode before the plan could be presented, so it is re-presented for approval.
- No answer means no dispatch.

## How to resume

With explicit approval, orchestrate as in Phases 1–2:
1. Dispatch wave 1 (`[exec]`, s1–s3) as a one-agent Workflow on sonnet/high. Its prompt quotes § Decisions, § Change, § Tests and § Determinism verbatim. It also gives the exact commit trailers and forbids model names.
2. Stop at gates 5 and 2 after wave 1.

## Gotchas

- **The compiled CLI is stale.** `packages/cli/dist-bin/` is from Phase 2. Capture baselines with `node packages/cli/dist/index.js`, and run `make compile TARGET=local` before regenerating goldens.
- **Expected movers.** All 11 xlsx and 11 mermaid cells, and 5 msproj cells. No Mermaid date may move. The full `waves` cells move as fixes.
- **`make` targets only.** nowline commits only on a green `make pre-commit`. Never run `playwright install`.
