# Handoff: m2p Phase 5a (declarations reach the schedule)

**Temporary runner file.** It rides the branch and is removed, with `plan-m2p-5a-kestrel.md` and `spike-m2p-5a-kestrel/`, as the 5a branch's last commit before merge.

## Where things stand

- **Phases 1–4** are on `main` (lolay/nowline#96 as `9c0982d`, lolay/nowline#97 as `c74c795`). This branch, `claude/beautiful-turing-yolfjg`, starts from `main` `27187f3`.
- **Lexer spike: passed** on the first run, for both keywords (`spike-m2p-5a-kestrel/`). The grammar stub was reverted; the test is kept for s1/s3.
- **5a plan:** [`plan-m2p-5a-kestrel.md`](./plan-m2p-5a-kestrel.md). It was drafted from three read-only code maps (core DSL plumbing; calendar and engines; gates, fixtures and docs) and a layout probe that injected the equivalent `CalendarRule`s through a mocked resolver to produce the literal test values. The probe file was deleted.
- **Nothing is implemented** and no execution session exists.

## Pending question

Approval of the 5a plan. The maintainer asked: "Stop for my approval. Don't implement anything. After approval, the plan runs in another new session with personal-plan-orchestrate, each wave a one-agent Workflow with the tier's model and effort, as Phase 4 did." No answer means no new session.

## How to resume

With explicit approval:
1. The planning session creates a new cloud session from this branch, using the plan's kickoff prompt.
2. That session runs the plan with personal-plan-orchestrate and stops at gates 5 and 2 after wave 1.

## Gotchas

- **The calendar engine is already complete** (`working-calendar.ts`): 5a only translates declarations into `CalendarRule`s in `calendar-resolver.ts`. Do not touch the engines.
- **Run titles follow input order** in `titledRules`; the resolver must sort rules canonically, or decision 18's reorder invariance fails.
- **`fromCalendarConfig` throws** when an unbounded stretch has no working weekday; the resolver falls back to the preset.
- **NW4 fires on two shipped `calendar:custom` files** (`examples/product.nowline`, `tests/grammar-properties.nowline`) by spec design; it is a warning, so render bytes don't move.
- **5a and 5b ship in the same release:** Mermaid has no dated `excludes` and MS Project no `<Exceptions>` until 5b.
- **Node 26.2.0** from the official tarball (checksummed) on `PATH` in every shell; `make` targets only; never `playwright install`.
