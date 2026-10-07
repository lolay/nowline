# Handoff: m2p Phase 4 (`show` and the display setting)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-show-display-osprey.md`, as the Phase 4 branch's last commit before merge.

## Where things stand

- **Phases 1–3** merged in lolay/nowline#96 as `9c0982d` on `main`.
- **Phase 4 plan:** [`plan-m2p-show-display-osprey.md`](./plan-m2p-show-display-osprey.md). It was drafted in the m2p session from three read-only code maps (engine A and `TimeScale`; style key, validation and renderer; option plumbing on every surface) and a design pass, all at a tree equal to `9c0982d`.
- **Plan approved; orchestration running** in session https://claude.ai/code/session_019XnAqjLpNjhKnEgWQTkaen on branch `claude/tender-babbage-mjx733`.
- **Wave 1 done** (`602bf3b`): Node 26.2.0 in `$HOME/node-v26.2.0-linux-x64/bin` (container-local, reinstall if the container is new), 40-hash hide baseline in `.scratch/m2p-p4/hide-baseline.sha256` (container-local; rebuild from `9c0982d` if lost), 58 red tests committed.

## Pending question

Gates 5 and 2, asked together: the canary (wave 1 ran on Sonnet at high effort, confirmed from the transcript) and the review of wave 1's red tests (`92c9ec3..602bf3b`) before Opus wave 2 (s4-s6) is dispatched. No answer means no wave 2.

## How to resume

With explicit approval, dispatch wave 2 [deep] (s4-s6) as a one-agent Opus high Workflow per the plan, then waves 3 and 4. If the container is new, reinstall Node 26.2.0 and rebuild the hide baseline from `9c0982d` before wave 2 edits source.

## Gotchas

- **Hide must stay byte-identical** to `main`: every layout snapshot, every determinism cell, every rendered example. The baselines are taken in s2, before any source edit.
- **Snapshots and goldens:** only additions (`weekends-show`), never changes.
- **`make` targets only.** Never run `playwright install`.
