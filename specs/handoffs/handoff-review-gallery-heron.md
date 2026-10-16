# Handoff: review gallery (heron)

- **Branch:** `claude/compassionate-galileo-jizy6q` (lolay/nowline), assigned by the cloud harness.
- **Plan:** [`plan-review-gallery-heron.md`](plan-review-gallery-heron.md), orchestrated with `personal-plan-orchestrate`.
- **Mode:** unattended, confirmed 2026-10-16 in session 4adab00a (harness=claude-code runner=cloud). Session choice: new session, started with `create_session` on this branch.
- **Done before this run:** m1, the local review gallery, in `8e0a60a` and `ac13df1` (pre-orchestration, reviewed by hand: `make pre-commit` and `make pack-mcpb` green, Playwright screenshots at four viewports).
- **Waves:** 1 `[exec]` m2 s1-s3 (source in the render block, persistent view settings, browser e2e); 2 `[deep]` m3 s1 (lines, baselines, retention); 3 `[exec]` m3 s2-s3 (PR pages, PR e2e). m4-m6 (publish workflow, docs, DNS handoff) are a later run.
- **Spend:** ~$18.44 logged against ~$11 expected; almost all of it is the session before kickoff (m1 build and planning), logged as one combined orchestrator-kickoff line. Guard max(3x, $50) = $50; projected before wave 1 ~$19.8.
- **Done this run:** wave 1 `[exec]` m2 s1-s3 in `b72b6de`, `2581435`, `0c1a82b` (`make pre-commit` green per step; `make gallery-e2e` 10/10; deliberate mode-carry break turned 3 tests red).
- **Done this run:** wave 2 `[deep]` m3 s1 in `7f423c9` (39/39 node:test, gallery-e2e 10/10, m1 data dir migrated).
- **Next unit:** wave 3 `[exec]` nowline m3 s2-s3, plus the wave 1 review fixup.
- **Resume:** paste the plan's Kickoff prompt into a new session.
- **Pending question:** none.

## Decisions so far

- Hosting is GitHub Pages at `review.nowline.dev` (not Firebase); raw build history lives on an orphan `gallery-data` branch; the whole site is regenerated each publish.
- `make gallery` uses the same collect + publish path as CI; local history accumulates in `.gallery/data`.

## Environment notes

- env: Node in this container is 22.22 while `.nvmrc` pins 26.2.0; `make doctor` passes and Node 22 is a supported CI cell.
- env: Chromium is at `/opt/pw-browsers/chromium` (revision 1194, Playwright 1.56); the repo pins Playwright 1.63, so don't run `playwright install` here: launch with `executablePath` (`NOWLINE_E2E_CHROMIUM=/opt/pw-browsers/chromium`).
- env: `make build` takes a few minutes; `make pre-commit` about 5-8 minutes cold, under a minute once `node_modules` and builds are warm. `make gallery-e2e` ~12s with the preinstalled Chromium. Wait on a long background command with `timeout 590 tail -f <log> | grep -m1 <marker>`, not `sleep`.
- env: `scripts/gallery/assets/gallery.js` is linted by Biome with `nursery/noFloatingPromises` as an error: prefix fire-and-forget promises with `void`.
- env: Biome format drift in `scripts/gallery` and `packages/integration-tests` fails the gate; run `node_modules/.bin/biome format --write <paths>` first. The 9 warnings in `packages/cli`, `export-mermaid`, `mcp` are pre-existing and don't fail.
- env: Playwright for ad-hoc scripts: `packages/integration-tests/node_modules/playwright/index.mjs`.

## Deviations

- m3.s1: local branch lines retain by `--keep` (plan only named main/PR); any cross-line baseline is kept, not only main-for-PR; the just-published line is never dropped by `--open-prs`; a PR without `baseSha` compares with newest main; build ids are `pr-<n>-<head12>` and `<branch-slug>-<sha12>` for non-main lines.

- m2.s1: *Collapse all* on the digest hides sources via `body.collapsed` CSS instead of writing the Source preference, so it doesn't clobber the viewer's global choice.
- m4 note: the PR ancestor fallback needs full history (`fetch-depth: 0`) in the job running `publish.mjs`; shallow clones give PR builds no baseline.
