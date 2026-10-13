# Handoff: nowline review follow-ups (lantern)

- **Plan:** `specs/handoffs/plan-nowline-review-lantern.md`
- **Branch:** `claude/ecstatic-babbage-qsrxbx` in `lolay/nowline` (task branch the cloud session was assigned; fast-forwarded from 86ac76c to origin/main 0062df3 at kickoff). One working directory: `/workspace/nowline`.
- **Mode:** unattended, confirmed 2026-10-13 in session 8c78f794-2944-59bb-8116-4413104e9100 (`harness=claude-code runner=cloud`). Guard 3x min $50 (limit ~$63 against ~$21 expected). Fix-up cap 2 per group.
- **Status:** complete 2026-10-13. 4/4 groups done, every review PASS after fix-ups 2-fix and 3-fix. Branch head 96f582f plus the completion commit. Nothing is in flight.
- **Spend:** ~$52.44 against ~$21 expected (guard limit ~$63, not tripped). The figure includes the pre-kickoff review conversation in the orchestrator-kickoff line; the earlier explore agents are not counted.
- **Resume:** nothing to resume. Next actions are Gary's: whether to open a PR, and the cleanup commit (see Completion summary).

## Pending question (verbatim)

Asked 2026-10-13 at completion: open a PR for this branch? It needs a cleanup commit first, removing the plan, this handoff and the review doc (or promoting the review doc to `specs/`).

## Done

- m1.s1 (c233919): `specs/handoffs/review-since-v086-lantern.md`, the public-repo review with file:line refs re-checked at HEAD.
- m2.s1-s6 (8e636a2..8759cdd): MCP theme/pageSize/nonWorking through shared normalizers; malformed `.nowlinerc` is a usage error (exit 2); `sanitizeSvg` drops `class`; LSP offers `calendar`; stale comments and public docs fixed; Renovate `@nowline/**` rule. Four `release-note:fixed` fragments. `make ci` green.
- m3.s1-s3 (5583e59..4fc1c28): `specs/scheduler-unification.md` (R1, proposed m4.11), `specs/core-ast-utilities.md` (R3, m4.12), `specs/surface-options.md` (R4, m4.13). Review CONCERNS, then fix-up 2-fix (1ee9465..f49c01a) PASS: gate G1 renders every sample directly on both commits in all three themes.
- m3.s4 (de36917): `specs/layout-phases.md` (R2, proposed m4.14). Review CONCERNS, then fix-up 3-fix (96f582f) PASS: `renderable.ts:45-68` ref, `createLayoutContext` chart parameter.

## Review log verdicts, fix-ups, retries, checkpoints

- review wave-1 (nowline m1 s1) 0357e12..c233919: PASS. No fix-ups, retries or checkpoints.
- gate-4 (entering m2) passed unattended as a checkpoint.
- review wave-1 (nowline m2 s1-s6) aa4631f..8759cdd: PASS. No fix-ups or retries.
- gate-4 (entering m3) and gate-2 (into [deep]) passed unattended as checkpoints.
- review wave-2 (nowline m3 s1-s3) ba86954..4fc1c28: CONCERNS: (1) gate G1 in all three specs skips 6 samples `make build` never renders and its loop exits with only the last `cmp`'s status; (2) `surface-options.md:27` cites stale `load-config.ts` lines; (3) `surface-options.md:45` says MCP parses three times, it's twice. Fix-up 2-fix next.
- review wave-2-fix (nowline m3 s1-s3) 4fc1c28..f49c01a: PASS (1 of 2 fix-ups used).
- gate-7 (into [xdeep], planned) passed unattended as a checkpoint.
- review wave-3 (nowline m3 s4) 4eef354..de36917: CONCERNS: `layout-phases.md:365` cites `renderable.ts:237-251`, the file has 68 lines (intended 45-68). Non-blocking: §3.8 `createLayoutContext` sketch lacks the chart y fields. Fix-up 3-fix next.
- gate-7 for 3-fix approved by Gary (`approve 3-fix`), 2026-10-13.
- review wave-3-fix (nowline m3 s4) de36917..96f582f: PASS (1 of 2 fix-ups used).

## Decisions so far

- Gary, 2026-10-13: this run covers only the public repos (`lolay/nowline`, and `lolay/nowline-action` as a release mirror that gets no direct edits). Write nothing about the private sibling repos (`nowline-app`, `nowline-api`, `nowline-infra`, `nowline-site`, `nowline-workspace`, `nowline-commercial`) into this repo; their findings are his own follow-up.
- wave-1 (nowline m1 s1), 2026-10-13: HEAD's source equals 0062df3, and six of the plan's file:line refs had drifted. Corrected values: `packages/cli/src/commands/render.ts` `loadConfigFor` is lines 520-533 (the plan's m2 s2 text says 519-532); `layout.ts` status tints start at :531 (not :568); `sequenceItem` is 410-928; `calendar-resolver.ts` classifier `declarationRule` is 105-135; LSP hover is `packages/lsp/src/providers/hover.ts:136-149`; `style-resolution.ts` label precedence is 178-196. Use these over the plan's numbers.
- wave-2 (nowline m3 s1-s3), 2026-10-13, accepted by review: proposed milestone IDs m4.11 (R1), m4.12 (R3), m4.13 (R4); R2 takes the next ID in wave 3. Engine C is the canonical day scheduler; engine B is deleted into `schedule.extent.contentEndDay`. The review's "engine A floors from C" is not byte-identical today (divergences (a) and (e) make A start earlier than C in 3 samples), so R1 defers it to follow-up F4. Behaviour-only changes no sample exercises are marked *behaviour* with a changelog fragment. Recommended home for `stageRoadmap` is `@nowline/renderer`. Line refs written after m2 use post-m2 numbers (`loadConfigFor` is now `render.ts:525-541`).
- wave-2 probe finding, 2026-10-13: engine A and engine C disagree on 10 of 53 samples (showcase: Ship at day 20 in the chart, day 40 in XLSX/MS Project/Mermaid); engine C leaves isolated-region items unscheduled in 4 samples; engine B's window is too short in 6. `make build` renders only the slugs in `scripts/render-samples.mjs` and `scripts/render-tests.mjs`, so a byte-identical gate must render every `examples/**.nowline` and `tests/*.nowline` directly.
- wave-2-fix, 2026-10-13, accepted by review: the shared gate G1 (in all three specs) runs `make build-fast` on base and step, takes the sample list from the base's `git ls-files 'examples/**.nowline' 'tests/*.nowline'` (60 files), renders each with `node packages/cli/dist/index.js <f> --theme <t> --now 2026-02-09 -o -` in light, dark and grayscale, stores SVG plus exit status per file, and compares the trees with `diff -r`. About 2m50s per commit. `make build` misses 13 samples (6 standalone plus 7 include files under `examples/nested/` and `examples/waves-program/`). The R2 spec should reuse this G1 verbatim.
- wave-3 (nowline m3 s4), 2026-10-13, accepted by review: R2 is m4.14. Its m1-m2 can land before R1; m3-m4 (edits to `RoadmapNode.place`) wait for R1 m1-m2; m5.s1 on depends hard on R1 m1.s3 and m2.s1. Byte-changing fixes are follow-ups F1-F3. Probe found two shipping layout bugs: L1, the beside-header card is placed from the header-rows bottom computed before the marker re-pack (`roadmap-node.ts:515`, used at 1027-1033), so it sits 26 px above the grown marker band in dependencies, late-row-shifts and marker-left-overflow (fix F1 changes those renders and goldens); L2, the now-pill row is reserved only when today is inside the original window (397-399) while the now-line uses the extended scale, so `platform-2026.nowline` with `length:1w` and `--now 2026-03-17` draws the line with no pill row, and NL.W1000 stays silent (no sample hits it).

## Environment notes

- `node_modules` is not installed in `/workspace/nowline`: run `pnpm install --frozen-lockfile` before building or testing. The npm registry is reachable through the session proxy.
- Node is 22.22.0 (`.nvmrc` pins 26.2.0 for development; `engines.node` is `>=22`). pnpm 12.8.1 is installed. If a build or test needs Node 26 and fails on 22, say so under `env:` rather than working around it.
- `make ci` runs lint, build, typecheck and test; CLI integration tests need a prior build (`make build` or `pnpm -r build`).
- wave-1 (m2): Node 22.22.0 is enough for `make ci`. A single package build needs its workspace deps built first: `pnpm -r --filter <pkg>... build` (`pnpm --filter @nowline/cli build` alone fails with TS2307 for `@nowline/config`). `pnpm lint` has 7 pre-existing `noTemplateCurlyInString` warnings in `mcp.smoke.test.ts`; it exits 0.
- wave-2: `make build-fast` works on Node 22.22.0.

## Deviations from plan

- The run pauses after the kickoff answer for Gary's `/compact` (his request), before wave 1 launches.
- Fix-ups 2-fix [deep] and 3-fix [xdeep] ran (reasons in the Review log); 3-fix stopped at gate 7 and ran on Gary's approval.
- Cost ran ~2.5x the estimate (~$52 vs ~$21): the spec workers laid out every sample to measure divergence.

## Completion summary

**Completed**: 2026-10-13

**What shipped**: On `claude/ecstatic-babbage-qsrxbx`, 0062df3..96f582f. m1 wrote the public-repo review (`specs/handoffs/review-since-v086-lantern.md`). m2 landed six quick fixes with four `release-note:fixed` fragments and `make ci` green: MCP theme, pageSize and nonWorking go through the shared normalizers; a malformed `.nowlinerc` is a usage error (exit 2); `sanitizeSvg` drops `class`; LSP offers the `calendar` icon; stale comments and public docs are fixed (codes.ts, embed.md, AGENTS.md, architecture.md, triage.yaml, CONTRIBUTING); and the shared Renovate preset exempts `@nowline/**` from the release-age wait. m3 wrote four refactor specs, each with byte-identical migration steps and the same G1 gate (every sample rendered directly on both commits, in all three themes): `specs/scheduler-unification.md` (R1, proposed m4.11), `specs/core-ast-utilities.md` (R3, m4.12), `specs/surface-options.md` (R4, m4.13) and `specs/layout-phases.md` (R2, m4.14).

**Deviations from plan**:
- The run paused after the kickoff answer for Gary's `/compact` (his request) and resumed from the pasted Kickoff prompt.
- Unattended checkpoints passed: gate-4 (entering m2), gate-4 (entering m3), gate-2 (into [deep]), gate-7 (into the planned [xdeep] wave 3).
- Fix-up 2-fix [deep]: wave-2 review CONCERNS. Gate G1 skipped samples `make build` never renders (13 in all) and exited with only the last `cmp`'s status. Two stale `load-config.ts` refs, and MCP render said to parse three times (it's twice). Fixed, PASS.
- Fix-up 3-fix [xdeep]: wave-3 review CONCERNS. `layout-phases.md` cited `renderable.ts:237-251` in a 68-line file. Unplanned [xdeep] work stopped at gate 7. Gary approved (`approve 3-fix`); fixed, PASS.
- No automatic retries.
- Cost: ~$52.44 against ~$21 expected, under the ~$63 guard. Waves 2 and 3 ran 2.5-3.7x their estimates because the workers laid out all samples to measure engine divergence and fixup frequency.
- R1 departs from the review's "engine A floors from C". That change isn't byte-identical today, so it is deferred to follow-up F4.

**Follow-ups**:
- Before merge: the cleanup commit removes this plan and its handoff, and either removes `specs/handoffs/review-since-v086-lantern.md` or promotes it to `specs/`.
- Add milestones m4.11-m4.14 to `specs/milestones.md` if the four specs are accepted, and answer each spec's Open questions.
- Layout bug L1: the beside-header card sits 26 px above a grown marker band in 3 samples (`roadmap-node.ts:515` vs 1027-1033). The fix changes renders and goldens (R2 F1).
- Layout bug L2: when today is past the original window, the now-line is drawn without its pill row, and NL.W1000 stays silent.
- Chart vs export schedule divergence: 10 of 53 samples disagree (showcase: Ship at day 20 in the chart, day 40 in XLSX, MS Project and Mermaid). Engine C leaves isolated-region items unscheduled in 4 samples (R1 F1-F4).
- Carried from the review, not in this plan: msproj `<StartDate>` ignores `start:`; R5 (render.ts and view-preset.ts splits); R6 (generated keyword lists and a published grammar artifact).
