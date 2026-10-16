# Handoff: review gallery (heron)

- **Branch:** `claude/compassionate-galileo-jizy6q` (lolay/nowline), assigned by the cloud harness.
- **Plan:** [`plan-review-gallery-heron.md`](plan-review-gallery-heron.md), orchestrated with `personal-plan-orchestrate`.
- **Mode:** pending (proposed unattended: harness=claude-code runner=cloud).
- **Done before this run:** m1, the local review gallery, in `8e0a60a` and `ac13df1` (pre-orchestration, reviewed by hand: `make pre-commit` and `make pack-mcpb` green, Playwright screenshots at four viewports).
- **Waves:** 1 `[exec]` m2 s1-s3 (source in the render block, persistent view settings, browser e2e); 2 `[deep]` m3 s1 (lines, baselines, retention); 3 `[exec]` m3 s2-s3 (PR pages, PR e2e). m4-m6 (publish workflow, docs, DNS handoff) are a later run.
- **Spend:** $0 of ~$11 expected; guard max(3x, $50) = $50.
- **Next unit:** wave 1 `[exec]` nowline m2 s1-s3, after the kickoff answer.
- **Resume:** paste the plan's Kickoff prompt into a new session.
- **Pending question:** the kickoff question (mode and session).

## Decisions so far

- Hosting is GitHub Pages at `review.nowline.dev` (not Firebase); raw build history lives on an orphan `gallery-data` branch; the whole site is regenerated each publish.
- `make gallery` uses the same collect + publish path as CI; local history accumulates in `.gallery/data`.

## Environment notes

- env: Node in this container is 22.22 while `.nvmrc` pins 26.2.0; `make doctor` passes and Node 22 is a supported CI cell.
- env: Chromium is at `/opt/pw-browsers/chromium` (revision 1194, Playwright 1.56); the repo pins Playwright 1.63, so don't run `playwright install` here: launch with `executablePath` (`NOWLINE_E2E_CHROMIUM=/opt/pw-browsers/chromium`).
- env: `make build` takes a few minutes; `make pre-commit` about 5-8 minutes. Wait on a long background command with `timeout 590 tail -f <log> | grep -m1 <marker>`, not `sleep`.
- env: `scripts/gallery/assets/gallery.js` is linted by Biome with `nursery/noFloatingPromises` as an error: prefix fire-and-forget promises with `void`.
