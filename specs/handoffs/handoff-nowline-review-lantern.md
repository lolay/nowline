# Handoff: nowline review follow-ups (lantern)

- **Plan:** `specs/handoffs/plan-nowline-review-lantern.md`
- **Branch:** `claude/ecstatic-babbage-qsrxbx` in `lolay/nowline` (task branch the cloud session was assigned; fast-forwarded from 86ac76c to origin/main 0062df3 at kickoff). One working directory: `/workspace/nowline`.
- **Mode:** unattended, confirmed 2026-10-13 in session 8c78f794-2944-59bb-8116-4413104e9100 (`harness=claude-code runner=cloud`). Guard 3x min $50 (limit ~$63 against ~$21 expected). Fix-up cap 2 per group.
- **Status:** 3/4 groups done. Wave 2 (`nowline m3 s1-s3`) reviewed CONCERNS (three spec defects, see the Review log). Next unit: fix-up 2-fix [deep] on `nowline m3 s1-s3` (1 of 2 allowed), then wave 3 [xdeep] `nowline m3 s4` (gate 7 passes unattended as a checkpoint).
- **Spend:** ~$27.24 against ~$21 expected (wave 2 ran ~$13.5 against ~$5 planned: the worker probed all 53 samples to measure engine divergence). Guard limit ~$63, not tripped. The orchestrator-kickoff line covers this session from its start, so it includes the review conversation that preceded the kickoff (the explore agents are not counted).
- **Resume:** paste the plan's Kickoff prompt into a session on this branch.

## Pending question (verbatim)

None. Gary answered the kickoff question `unattended` (2026-10-13), compacted, then pasted the Kickoff prompt; mode re-confirmed by that paste.

## Done

- m1.s1 (c233919): `specs/handoffs/review-since-v086-lantern.md`, the public-repo review with file:line refs re-checked at HEAD.
- m2.s1-s6 (8e636a2..8759cdd): MCP theme/pageSize/nonWorking through shared normalizers; malformed `.nowlinerc` is a usage error (exit 2); `sanitizeSvg` drops `class`; LSP offers `calendar`; stale comments and public docs fixed; Renovate `@nowline/**` rule. Four `release-note:fixed` fragments. `make ci` green.
- m3.s1-s3 (5583e59..4fc1c28): `specs/scheduler-unification.md` (R1, proposed m4.11), `specs/core-ast-utilities.md` (R3, m4.12), `specs/surface-options.md` (R4, m4.13). Review CONCERNS; fix-up pending.

## Review log verdicts, fix-ups, retries, checkpoints

- review wave-1 (nowline m1 s1) 0357e12..c233919: PASS. No fix-ups, retries or checkpoints.
- gate-4 (entering m2) passed unattended as a checkpoint.
- review wave-1 (nowline m2 s1-s6) aa4631f..8759cdd: PASS. No fix-ups or retries.
- gate-4 (entering m3) and gate-2 (into [deep]) passed unattended as checkpoints.
- review wave-2 (nowline m3 s1-s3) ba86954..4fc1c28: CONCERNS: (1) gate G1 in all three specs skips 6 samples `make build` never renders and its loop exits with only the last `cmp`'s status; (2) `surface-options.md:27` cites stale `load-config.ts` lines; (3) `surface-options.md:45` says MCP parses three times, it's twice. Fix-up 2-fix next.

## Decisions so far

- Gary, 2026-10-13: this run covers only the public repos (`lolay/nowline`, and `lolay/nowline-action` as a release mirror that gets no direct edits). Write nothing about the private sibling repos (`nowline-app`, `nowline-api`, `nowline-infra`, `nowline-site`, `nowline-workspace`, `nowline-commercial`) into this repo; their findings are his own follow-up.
- wave-1 (nowline m1 s1), 2026-10-13: HEAD's source equals 0062df3, and six of the plan's file:line refs had drifted. Corrected values: `packages/cli/src/commands/render.ts` `loadConfigFor` is lines 520-533 (the plan's m2 s2 text says 519-532); `layout.ts` status tints start at :531 (not :568); `sequenceItem` is 410-928; `calendar-resolver.ts` classifier `declarationRule` is 105-135; LSP hover is `packages/lsp/src/providers/hover.ts:136-149`; `style-resolution.ts` label precedence is 178-196. Use these over the plan's numbers.
- wave-2 (nowline m3 s1-s3), 2026-10-13, accepted by review: proposed milestone IDs m4.11 (R1), m4.12 (R3), m4.13 (R4); R2 takes the next ID in wave 3. Engine C is the canonical day scheduler; engine B is deleted into `schedule.extent.contentEndDay`. The review's "engine A floors from C" is not byte-identical today (divergences (a) and (e) make A start earlier than C in 3 samples), so R1 defers it to follow-up F4. Behaviour-only changes no sample exercises are marked *behaviour* with a changelog fragment. Recommended home for `stageRoadmap` is `@nowline/renderer`. Line refs written after m2 use post-m2 numbers (`loadConfigFor` is now `render.ts:525-541`).
- wave-2 probe finding, 2026-10-13: engine A and engine C disagree on 10 of 53 samples (showcase: Ship at day 20 in the chart, day 40 in XLSX/MS Project/Mermaid); engine C leaves isolated-region items unscheduled in 4 samples; engine B's window is too short in 6. `make build` renders only the slugs in `scripts/render-samples.mjs` and `scripts/render-tests.mjs`, so a byte-identical gate must render every `examples/**.nowline` and `tests/*.nowline` directly.

## Environment notes

- `node_modules` is not installed in `/workspace/nowline`: run `pnpm install --frozen-lockfile` before building or testing. The npm registry is reachable through the session proxy.
- Node is 22.22.0 (`.nvmrc` pins 26.2.0 for development; `engines.node` is `>=22`). pnpm 12.8.1 is installed. If a build or test needs Node 26 and fails on 22, say so under `env:` rather than working around it.
- `make ci` runs lint, build, typecheck and test; CLI integration tests need a prior build (`make build` or `pnpm -r build`).
- wave-1 (m2): Node 22.22.0 is enough for `make ci`. A single package build needs its workspace deps built first: `pnpm -r --filter <pkg>... build` (`pnpm --filter @nowline/cli build` alone fails with TS2307 for `@nowline/config`). `pnpm lint` has 7 pre-existing `noTemplateCurlyInString` warnings in `mcp.smoke.test.ts`; it exits 0.
- wave-2: `make build-fast` works on Node 22.22.0.

## Deviations from plan

- The run pauses after the kickoff answer for Gary's `/compact` (his request), before wave 1 launches.
