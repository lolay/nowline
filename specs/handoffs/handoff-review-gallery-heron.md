# Handoff: review gallery (heron)

- **Branch:** `claude/compassionate-galileo-jizy6q` (lolay/nowline), assigned by the cloud harness.
- **Plan:** [`plan-review-gallery-heron.md`](plan-review-gallery-heron.md), orchestrated with `personal-plan-orchestrate`.
- **Mode:** unattended, confirmed 2026-10-16 in session 4adab00a (harness=claude-code runner=cloud). Session choice: new session, started with `create_session` on this branch.
- **Done before this run:** m1, the local review gallery, in `8e0a60a` and `ac13df1` (pre-orchestration, reviewed by hand: `make pre-commit` and `make pack-mcpb` green, Playwright screenshots at four viewports).
- **Waves:** 1 `[exec]` m2 s1-s3 (source in the render block, persistent view settings, browser e2e); 2 `[deep]` m3 s1 (lines, baselines, retention); 3 `[exec]` m3 s2-s3 (PR pages, PR e2e). m4-m6 (publish workflow, docs, DNS handoff) are a later run.
- **Spend:** ~$35.36 logged against ~$11 expected (~$18.44 of it the session before kickoff); guard $50, never tripped.
- **Done this run:** wave 1 `[exec]` m2 s1-s3 in `b72b6de`, `2581435`, `0c1a82b` (`make pre-commit` green per step; `make gallery-e2e` 10/10; deliberate mode-carry break turned 3 tests red).
- **Done this run:** wave 2 `[deep]` m3 s1 in `7f423c9` (39/39 node:test, gallery-e2e 10/10, m1 data dir migrated).
- **Done this run:** wave 3 `[exec]` m3 s2-s3 in `846dbd8`, `c1fd456`, wave 1 review fixup in `ae13dc0` (42 node:test, gallery-e2e 15/15). A container restart interrupted wave 3 after `ae13dc0`; a resumed agent kept the uncommitted s2 diff.
- **Done this run:** fixup 2 in `337a95e`: untrusted raw builds validated before publish (names, paths, symlinks, shas, PR line, https-only links), plus the review nits (50 node:test, gallery-e2e 15/15). Reviewed after the skill became readable: wave-3-fix PASS; wave-2-fix CONCERNS (a PR artifact can reuse an existing build's id and replace main history; `--pr` optional).
- **Group ranges:** nowline m2 s1-s3 `1511b51..0c1a82b` (+ 1-fix `ae13dc0`); nowline m3 s1 `81a3577..7f423c9` (+ 2-fix `337a95e`); nowline m3 s2-s3 `0a6d26d..c1fd456` (+ 3-fix in `337a95e`). Merged `origin/main` in `c34581f`.
- **Bookkeeping reformatted** to the skill's grammar (step `(done)` markers, Review/Token log rows) once the skill was readable from `GaryRudolph/public`; this run's work commits don't start with step IDs.
- **Done this run:** 2-fix2 in `237a480`: build ids bound to their line and PR head, cross-line ids refused, publish requires `--pr <n>` / `--trusted-main` / `--trusted-local`, links pinned to github.com, null-proto lines, only named files copied (59 node:test, gallery-e2e 15/15).
- **Review log:** wave-1 CONCERNS, wave-2 CONCERNS, wave-3 CONCERNS; wave-1-fix PASS, wave-3-fix PASS, wave-2-fix CONCERNS, wave-2-fix2 PASS.
- **Status:** plan complete 2026-10-16. m4-m6 stay untagged for a later run.
- **Resume:** paste the plan's Kickoff prompt into a new session.
- **Pending question:** Open the PR, or not yet? A cleanup commit before merge would remove this handoff and the plan, or promote what's durable (the gallery's trust model and data layout) to `specs/`.

## m4 must-dos (from fixup 2)

- Publish PR runs with `publish.mjs --pr <number>` taken from the `workflow_run` event, never the artifact; `--trusted-main` only when the run was a push to `main` from this repo; never `--trusted-local` (refused under GitHub Actions). Publish now refuses to run without one of them.
- Set `GALLERY_HEAD_SHA` and the other `GALLERY_PR_*` facts in the collect step; without `pr.headSha` publish rejects a PR build.
- Consider `--repo ${{ github.repository }}` so repoUrl must equal this repo (2-fix2 review nit).
- Publish non-PR artifacts only when the triggering run was a push to `main`; skip forks; download the artifact by the triggering run id into a fresh directory.
- `fetch-depth: 0` in the publish job for the PR ancestor fallback.
- m5: state in `specs/ci.md` that same-repo PR SVGs are served on the gallery origin (collaborator trust model).

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

- fixup 2: added `--pr <n>` / `expectPr`; stored manifests are re-validated and a malformed one fails the whole publish; PR lines classified by manifest `pr.number`, so a local `pr-12` branch is a branch line.

- m3.s2: root index has Main, Pull requests, then Branches (local non-main lines); compare pickers grouped by line with `<optgroup>`; "since your last visit" tracks main only.

- m3.s1: local branch lines retain by `--keep` (plan only named main/PR); any cross-line baseline is kept, not only main-for-PR; the just-published line is never dropped by `--open-prs`; a PR without `baseSha` compares with newest main; build ids are `pr-<n>-<head12>` and `<branch-slug>-<sha12>` for non-main lines.

- m2.s1: *Collapse all* on the digest hides sources via `body.collapsed` CSS instead of writing the Source preference, so it doesn't clobber the viewer's global choice.
- m4 note: the PR ancestor fallback needs full history (`fetch-depth: 0`) in the job running `publish.mjs`; shallow clones give PR builds no baseline.
