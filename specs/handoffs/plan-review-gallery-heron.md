# Review gallery: per-build QA site for examples/ and tests/

```text
--- KICKOFF: begin orchestration at [deep] ---

  Status: 0/3 groups done | last review: — | current: nowline m2 s1-s3 [exec] | BLOCKED at gate mode | updated 2026-10-16

  mode: pending | proposed unattended (harness=claude-code runner=cloud; cloud runner, branch assigned by the harness) | guard 3x min $50 | fixups 2

  review: every-wave (log-only)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-review-gallery-heron.md. The plan is already tagged.
    On branch claude/compassionate-galileo-jizy6q (task branch): subagents commit each finished step.
    Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's procedure,
    and pause only where the recorded mode stops. Do not execute plan
    work inline. Update plan progress after each wave returns per the
    skill's procedure. The mode line above is the kickoff answer. If the
    Status line shows BLOCKED, re-post that question and wait; otherwise
    record the mode, print the kickoff summary and begin dispatching.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [exec] nowline m2 s1-s3 | ~3.3M | ~$1.4 |
| 2 [deep] nowline m3 s1 | ~6.1M | ~$3.2 |
| 3 [exec] nowline m3 s2-s3 | ~3.0M | ~$1.2 |
| orchestrator | ~5.7M | ~$5.0 |
| **Total** | ~18M | ~$11 |

Expected values are estimates, good to about 2-3× per wave.

## Context

Rendered `examples/*.svg` and `tests/*.svg` are local build output, gitignored (`.gitignore:62-75`). Nothing renders them anywhere shareable, so manual QA means cloning, building, and opening files side by side. The ask: every build on `main` publishes a mobile-friendly site at a stable URL. That site shows each `.nowline` with its diagram, steps through entries with prev/next, and keeps an index of the last 100 builds. A notification then links straight to the new build for spot checks from a phone.

## Decision: GitHub Pages + custom domain, not Firebase

The site is served by GitHub Pages from this repo, at `review.nowline.dev` (CNAME to `lolay.github.io`). Once the custom domain is set, `lolay.github.io/nowline/*` 301s to `review.nowline.dev`, and visitors never land on a github.io URL.

A repo's Pages site gets exactly one domain. So the hostname is generic (`review`), and the content is split into sections by path: `examples` and `tests` today, room for exporter output or other per-commit review material later, all without a new domain.

We're not using Firebase because the project already reversed exactly that setup. `specs/embed.md:192` retired the Firebase `embed.nowline.dev` CDN to cut the only `nowline → nowline-infra` deploy dependency, along with its WIF wiring and "CDN history-reconstruction scripts". Firebase here would bring all of that back. Pages needs no cloud credential (`GITHUB_TOKEN` + `pages: write`). The only infra touch is a one-time DNS record that a human adds in nowline-infra, which is pull-direction and allowed.

How publishing works:
- The Pages source is set to **GitHub Actions**, so no branch is served.
- Each run uploads the finished site as a Pages artifact, and `actions/deploy-pages` swaps it in. Every deploy replaces the whole site.
- To keep 100 builds across deploys, the raw inputs (SVGs, sources, manifests, no HTML) live on an orphan `gallery-data` branch in this repo. Each run regenerates the whole site from that branch.
- The cost: a default `git clone` also fetches that branch, adding a few MB that dedupe across builds. If that ever matters, the ref can move to `refs/gallery/data`, which default clones don't fetch, with the same workflow logic.

Pages is still a new outbound publish surface, so `AGENTS.md` § OSS boundary gets one new permitted line. That line is the sign-off point.

## Site shape

```
review.nowline.dev/
  index.html                 last 100 builds, newest first: short sha, subject, date, ref, # changed
  latest/index.html          redirect to newest build (bookmark / Slack target)
  builds.json                same list, machine-readable
  compare.html               range digest: ?from=<sha>&to=<sha> (client-side)
  history/<group>/<slug>.json   per-item row per retained build (older/newer change nav)
  b/<sha>/changes.html       digest: every changed entry's compare on one page
  b/<sha>/index.html         one build: header (sha → commit, run link, date), "changed only" filter,
                             thumbnail grid sectioned Examples then Tests, "changed" badges
  b/<sha>/manifest.json      entries + sha256 of each SVG (drives "changed vs previous build")
  b/<sha>/<group>/<slug>.html   entry page
  b/<sha>/<group>/<slug>.svg    the render
```

### Entry page: previous vs. this build

The comparison is the centrepiece. "Previous" means the previous published build in `builds.json`, which on `main` is normally the parent commit.

1. **Header:** title, description, render params (`theme`, `now`), and a status chip: `changed` / `unchanged` / `new`, each against `<prev-sha>` as a link.
2. **Compare block** (when changed): the previous SVG and this one. Each pane has a caption: short sha (linking to the commit), commit subject, author, and commit date in the viewer's local time.
   - "Person" means the commit **author**, not the committer: on squash merges the committer is `GitHub`. The non-compare views (unchanged, new) carry the same caption for this build.
   - **Layout:** at 768px and wider (desktop and iPad, portrait included) they sit side by side as `prev | this`, like `sdiff`. Below 768px (phones) they stack vertically, prev on top.
   - **Phones in landscape:** an iPhone 17 Pro Max held sideways is about 956x440 CSS px, so it crosses 768 and goes side by side.
     - The page sets `viewport-fit=cover` and pads with `env(safe-area-inset-*)` to clear the Dynamic Island.
     - Under `(max-height: 500px)` the header and both nav rows collapse into one compact row, and the history strip moves behind a toggle, so the diagrams get the height.
   - **Layout override:** *Auto / Stack / Side by side*, remembered in `localStorage` and wrapped in try/catch. A wide timeline is sometimes easier to read stacked, even on a desktop.
   - **Modes:** a segmented toggle offers *Side by side* (the default), *Blink* (one frame, tap or auto-flip every 700ms between prev and this, which is the fastest way to spot a 2px shift on a phone), and *Slider* (overlaid, drag to wipe between them).
   - **Sizing:** a *Fit / Actual size* toggle applies to both panes. Under *Actual size* the two panes scroll horizontally in lockstep, so the same timeline region stays aligned.
   - **Zoom:** tapping a pane opens that raw SVG for native pinch-zoom.
3. **Unchanged:** a single diagram with "identical to `<prev-sha>`".
4. **New:** a single diagram with "new in this build".
5. **Source:** the escaped `.nowline`. When the source itself changed since the previous build, a line diff (+/- gutter) sits above the full source. Included children (`nested/`, `waves-program/`, `partner-multi`, `waves-isolate-team`) appear in collapsed `<details>`.
6. **Build history for this item:** a second nav row steps through builds for the *same* entry, so you can walk back to when it changed.
   - `‹ Older build` / `Newer build ›` move one build at a time.
   - `« Older change` / `Newer change »` jump to the nearest build where this item's SVG hash differs from the build before it.
   - A compact strip shows one dot per retained build (up to 100), filled where the item changed. Tapping a dot jumps to that build.
   - Every link and the strip are written statically, because the whole site is regenerated on each publish (see the publish step, m4). `history/<group>/<slug>.json` also ships for `compare.html`.
7. **Item navigation:** a sticky bottom bar holds `‹ Prev · 12 / 57 · Next ›`, a *Changed only* switch, and an Index link.
   - With *Changed only* on, prev/next skips unchanged entries. It's a query flag carried on the links, and it defaults on when the build has any changes.
   - Swipe and arrow keys also navigate.
   - One sequence runs through Examples and then Tests.

Dark mode follows `prefers-color-scheme`. There are no external assets. The diagrams are embedded as `<img>`, so any script inside an SVG never runs in the page.

### Changes digest: one page per build, everything that moved

`b/<sha>/changes.html` is the spot-check page, and the Slack link points here when anything changed.

- **Summary line:** for example, "12 changed (9 renderer drift, 3 source edits) · 1 new · 0 removed · 44 unchanged vs `<prev-sha>`", plus both commits' sha, author and date.
  - *Renderer drift* means the SVG changed while the `.nowline` didn't, which is the unexpected kind.
  - *Source edit* means both changed, which is expected.
  - Drift is listed first.
- **Body:** one scrolling page holding every changed entry's compare block inline, with the same side-by-side / stacked layout rules and per-card Blink / Slider / Diff modes. Each card has a header linking to its full entry page.
  - A *Collapse all / Expand all* switch shrinks cards to thumbnail pairs, so a phone can flick through 12 changes in a few seconds.
- **Diff mode** (also on entry pages):
  - Both SVGs are drawn to a canvas client-side. Pixels that differ are painted magenta over a faded copy of the current render, and the card shows "≈ N px changed".
  - It needs no dependency and no CI rasterising. The SVGs are same-origin, so the canvas isn't tainted.
  - A 1-2px nudge that hides in side-by-side shows up as a bright outline.
- **Range digest:** `compare.html?from=<sha>&to=<sha>` builds the same digest client-side from the two builds' manifests, for when several builds landed between checks.
  - The root index gets "compare" pickers on each row.
  - A per-viewer "since your last visit" link (last seen sha kept in `localStorage`, wrapped in try/catch) shows up when available.
  - An item that changed and then changed back reads as unchanged, which is correct for a range.

The root index shows each build's counts (drift / edits / new / removed), so a quiet build is obvious without opening it.

The build index lists changed entries first, then new, then unchanged, then removed (slugs present in the previous build but gone now). Each changed tile shows a small prev/this thumbnail pair.

Previous SVGs are referenced by relative path into `b/<prev-sha>/`, so nothing is copied. A build only compares against one that is still inside the 100-build window.

## m1 - Local review gallery (done before this run)

Shipped on this branch in `8e0a60a` (render lists moved to `scripts/lib/render-manifest.mjs`) and `ac13df1` (`make gallery`, `make gallery-serve`, `scripts/gallery/{collect,publish,serve}.mjs`, `scripts/gallery/lib/{source,diff,model,html}.mjs`, `scripts/gallery/assets/gallery.{js,css}`, 18 `node:test` specs under `scripts/gallery/test/` wired into `make test` and `make ci-platform`). Everything below builds on that code; read it before changing it.

## m2 - Source in the render block, persistent view settings, browser e2e

Common to every step in m2 and m3:
- Repo rules: `AGENTS.md` (Makefile only, 4-space TypeScript and JS, `.js` suffix on TS imports, no emojis). Run `make pre-commit` and see it pass before each commit; a step's commit is not done until it is green.
- No changelog fragment: this is internal tooling.
- Local check of the generated site: `make gallery` (or `node scripts/gallery/collect.mjs .gallery/raw` then `node scripts/gallery/publish.mjs --data .gallery/data --raw .gallery/raw --site .gallery/site` when the renders are already built), then `make gallery-serve GALLERY_PORT=<free port>` in the background and drive it with Playwright.

--- WAVE 1 [exec] ---

#### s1 - [exec] Show the source inside the render block

Show the `.nowline` source within each compare block, collapsible, instead of the separate Source section at the bottom of entry pages.

- **Toggle.** Every compare block on entry pages and on the changes digest gets a **Source** button in its toolbar, next to Fit / Actual size. Open, the source appears directly under the render(s), inside the same block. Default: open on entry pages, collapsed on the changes digest. *Collapse all* on the digest also collapses sources. (s2 makes the state persist across pages; s1 only needs the per-page default and the toggle.)
- **sdiff view.** When the previous and this build both exist and the source differs, show a two-column, line-aligned table per file: prev | this. Changed rows are highlighted: deleted lines on the left in red, added lines on the right in green, blank cells keeping rows aligned. Show the whole file (sources are under 250 lines).
- **Unified view on phones.** The pair collapses to a unified +/- list when the panes are stacked: CSS shows the pair at 768px and up with layout *Auto*, or whenever the layout is *Side*; the unified list when the layout is *Stack* or the screen is narrower than 768px, mirroring the `.panes` rules in `gallery.css`.
- **Unchanged source** (drift, unchanged, new, first build): a single column with this build's source.
- **Includes** (`examples/nested/*`, `examples/waves-program/*`, `tests/partner-multi`, …): each file in its own `<details>`; the main file open, includes collapsed unless that include changed.
- Remove the old bottom Source section from entry pages (`sourcePanel` in `scripts/gallery/lib/html.mjs`).
- `compare.html` (client-side range compare) gets no source; its card titles already link to the entry page.

Implementation:
- `scripts/gallery/lib/diff.mjs`: add `sideBySideRows(diff)`, zipping each run of `-` lines with the `+` lines that follow into aligned `{ left, right, kind }` rows, kind `same | change | del | add`.
- `scripts/gallery/lib/html.mjs`: replace `sourcePanel` with a `sourceBlock(sources)` that renders `.source-row` holding, per file, a `.source-pair` table and a `.source-unified` list. All text through the `html` tag so it is escaped. `compareBlock` takes `sources` and emits the `.source-row` inside the section; `renderChangesPage` passes each card's sources.
- `scripts/gallery/publish.mjs`: pass `entrySources(...)` to the changes digest too (reuse the per-item value it already computes for entry pages).
- `scripts/gallery/assets/gallery.js`: `buildCompare` keeps the server-rendered `.source-row` instead of clearing it; add the Source toggle (sets `section.dataset.source = open | closed`); *Collapse all* closes every section's source.
- `scripts/gallery/assets/gallery.css`: `.source-row` below the panes or stage; `.source-pair` as `grid-template-columns: minmax(0,1fr) minmax(0,1fr)` with monospace cells, each column scrolling horizontally on its own, highlights reusing `--add-bg` / `--del-bg`; pair vs unified visibility as above; under `(max-height: 500px)` the source block is capped at 50vh with its own scroll.

Acceptance:
- `scripts/gallery/test/source.test.mjs`: `sideBySideRows` cases for a modification, a pure add, a pure delete and identical input.
- `scripts/gallery/test/publish.test.mjs`: entry-page assertions updated to the new markup (the `swimlane s "S2"` line appears as an added row in the right-hand column, the old bottom panel is gone), and a changes-digest card contains a `.source-row`.
- No page has horizontal page scroll at 390x844 with the source open (long lines scroll inside their column).

#### s2 - [exec] Carry view settings across pages

Today *layout* and *size* persist across pages but the compare *mode* resets to side by side on every page. Make every view setting one global preference that carries from item to item, build to build, and onto the changes digest and range compare: mode (side / blink / slider / diff), layout (auto / stack / side), size (fit / actual), Source open or closed, and Changed only.

- Keep each in `localStorage` (every access in try/catch, as `store` in `gallery.js` already does).
- Also carry the current values as query params on every in-gallery link (prev/next, history row links and dots, older/newer build, tiles, crumbs, range-compare cards): `?mode=blink&layout=side&size=fit&src=1&changed=1`, so the view survives private browsing or blocked storage and a pasted link opens the same view. Skip external links (commit URLs, run URLs) and raw-SVG links.
- URL params win over storage when both exist.
- Picking a mode on one card of the changes digest applies it to every card, as layout already does.
- Blink restarts its flip on page load; a page opened in Diff mode computes its diff immediately.
- The Source default (open on entry pages, collapsed on the digest) applies only until the viewer first toggles it; after that their choice is used everywhere.
- Fold the existing `changed` param handling in `setupEntryNav` into the same mechanism.

Implementation: in `scripts/gallery/assets/gallery.js`, one `prefs` object read from URL then storage (`mode, layout, size, src, changed`), a `linkWithPrefs(href)` helper applied to all in-gallery `<a>`, and every widget reading its mode from `prefs`; any change re-applies to all widgets and rewrites the links in place.

Acceptance: covered by s3's e2e assertions; s2 must leave `make pre-commit` green.

#### s3 - [exec] Browser e2e for the gallery

Add an automated browser test of `gallery.js`, following the repo's existing browser legs (`make mcp-app-e2e`, `packages/integration-tests/vitest.mcp-app.config.ts`, `packages/integration-tests/test/mcp-app-preview.e2e.test.ts`).

- `scripts/gallery/serve.mjs`: export `createGalleryServer(siteDir)` (returns a Node `http.Server`); the CLI becomes a thin wrapper.
- `packages/integration-tests/test/review-gallery.e2e.test.ts` plus `packages/integration-tests/vitest.review-gallery.config.ts`. The default config already excludes `**/*.e2e.test.ts`, so `make test` and the macOS/Windows cells never need a browser. Import the `.mjs` gallery modules with a dynamic `import()` of a computed path, as the MCP e2e does for sibling builds, so `tsc` doesn't resolve them.
- Fixture: synthetic raw builds written to a temp dir (one entry with renderer drift, one with a source edit in an include, one volatile, one unchanged; three builds so a range exists), published with `publish()` and served on an ephemeral port by `createGalleryServer`. Drift SVGs must differ visibly (a moved `<rect>` or changed `<text>`), so the pixel diff has something to count.
- Launch Chromium with `executablePath: process.env.NOWLINE_E2E_CHROMIUM || undefined`.
- Assertions:
  - pick Blink, then Next: the next item opens in Blink with layout and size kept; repeat for Diff and Slider;
  - the same carry-over with storage blocked (a context whose `localStorage` throws, for example via an init script), through URL params;
  - Changed only skips unchanged items, and the counter reads `n / N changed`;
  - the Source toggle shows the pair table on desktop (1440x900) and the unified list at 390x844, and its state persists to the next page;
  - Diff mode reports a non-zero changed-pixel count on the drift entry;
  - older/newer build and older/newer change links land on the right build;
  - no horizontal page scroll at 390x844 and 956x440; panes side by side at 956x440 and 820x1180;
  - no console errors on any visited page;
  - the range compare page classifies the three-build range correctly.
- New Make target `gallery-e2e` (help text says it needs a browser and isn't in `make ci`): unless `NOWLINE_E2E_CHROMIUM` is set, `pnpm --filter @nowline/integration-tests exec playwright install chromium`; then `pnpm --filter @nowline/integration-tests exec vitest run --config vitest.review-gallery.config.ts`. Add it to `.PHONY` and document it in `Makefile.md` beside `mcp-app-e2e`. CI wiring is m4, not this step.

Acceptance: `make gallery-e2e NOWLINE_E2E_CHROMIUM=/opt/pw-browsers/chromium` passes in this container, and the test fails if `gallery.js` stops carrying the mode across pages (check by temporarily breaking it locally; don't commit that).

## m3 - Branch and PR support

Scope: branches with an open PR in this repo, plus any local branch under `make gallery`. Fork PRs are excluded (their SVGs would be untrusted content on our origin). The CI wiring (ci.yml artifact, `gallery.yml` on `workflow_run`, commit status) is m4, not this milestone; m3 makes the scripts and site ready for it.

--- WAVE 2 [deep] ---

#### s1 - [deep] Lines, baselines and retention in the data model

- **Lines.** Every build belongs to a line: `main`, `pr-<n>`, or locally the current git branch. `builds.json` in the data dir becomes `{ "lines": { "main": [ids], "pr-123": [ids] } }`, newest first. Read the m1 shape `{ "builds": [ids] }` as the `main` line (existing local `.gallery/data`).
- **Manifest fields** (`collect.mjs`): `line`, and for PR builds `pr: { number, title, url, headRef, headSha, baseSha }`. In CI the checkout is the PR merge commit, so take the PR facts from environment variables the workflow will set (`GALLERY_LINE`, `GALLERY_PR_NUMBER`, `GALLERY_PR_TITLE`, `GALLERY_PR_URL`, `GALLERY_HEAD_REF`, `GALLERY_HEAD_SHA`, `GALLERY_BASE_SHA`, `GALLERY_AUTHOR`, `GALLERY_DATE`); a PR build's `sha` is the head sha and its id stays unique per push. Locally the line is `git rev-parse --abbrev-ref HEAD`, and `main` when on `main`.
- **Baseline** (`baseId`, chosen at publish time and stored in the build's data manifest):
  - a `main` build compares with the previous build in the `main` line;
  - a PR build compares with the `main` build whose sha is `pr.baseSha`; if none is retained, with the newest retained `main` build that is an ancestor of `pr.baseSha` (ancestry from an injectable function, `git merge-base --is-ancestor` / `git rev-list` by default, so tests can fake it); if none, no baseline (first build);
  - a local non-main line's first build compares with the newest `main`-line build; later builds compare with the previous build in their own line.
- **Statuses**, changed-only navigation and the changes digest follow `baseId`. Per-entry history rows and older/newer build and change navigation stay within the build's own line.
- **Retention** (`publish.mjs`): `--keep` (default 100) for `main`; `--keep-pr` (default 10) per PR line; `--open-prs <comma-separated numbers>` drops every `pr-<n>` line not listed (omitted: keep all). Prune raw builds no line references, except a `main` build that a retained PR build uses as its baseline.
- **Make:** new target `gallery-collect` (collect only, no `build` prerequisite, `GALLERY_DIR`-aware); `gallery` becomes `build` then `gallery-collect` then publish. Update `Makefile.md`.
- Keep the existing site rendering working for `main`; s2 adds the PR pages.

Acceptance (`node:test` in `scripts/gallery/test/`):
- baseline: exact base sha, ancestor fallback, no main build at all, local branch first build and later builds;
- the m1 `builds.json` shape migrates to the `main` line;
- per-line retention, closed-PR pruning, and a pruned-but-referenced main baseline kept;
- a PR build's statuses are computed against main, not against its own previous push;
- `collect` reads the `GALLERY_*` variables.

--- WAVE 3 [exec] ---

#### s2 - [exec] PR pages and headers

- **Root index:** two sections, **Main** (the last builds, as now) and **Pull requests** (each PR line: `#<n>` linked to the PR URL, title, author, latest push's sha and local time, its counts vs main, link to its changes page).
- `pr/<n>/index.html` redirects to the PR line's latest build; `pr/<n>/builds.html` lists the line's pushes with counts.
- A PR build's header (build index, changes page, entry pages): `PR #<n> · <title> · <headRef>`, then head sha, author and date, then `vs main <base sha>` (linked to that build), then a `vs previous push` link to `compare.html?from=<previous push id>&to=<this id>` when the line has an earlier push.
- `builds.json` in the site gains `line` and `pr` per build; `compare.html`'s data and pickers include PR builds, labelled by line.
- `latest/` keeps pointing at the newest `main` build.

Acceptance: `node:test` cases for the root page's PR section, `pr/<n>/` redirect and list, and the PR header links; `make pre-commit` green.

#### s3 - [exec] Branch and PR browser tests

Extend `packages/integration-tests/test/review-gallery.e2e.test.ts` (from m2.s3) with a fixture that has a `main` line and one PR line of two pushes. Assert: the root page lists the PR; `pr/<n>/` lands on its latest push; the PR build's statuses compare against main (an entry the PR changed shows as changed even if the previous push had the same SVG); the `vs previous push` link opens a range compare with the right counts; settings still carry across PR pages.

Acceptance: `make gallery-e2e NOWLINE_E2E_CHROMIUM=/opt/pw-browsers/chromium` passes; `make pre-commit` green.

## Later milestones (not in this run)

These follow after review of m2 and m3, in a later run; they stay untagged until then.

### m4 - Publish workflow
- `ci.yml` canonical cell (ubuntu, Node 26): after `make ci`, `make gallery-collect` with the PR's `GALLERY_*` facts from the event, upload `gallery-raw`; on `push` to `main` and same-repo `pull_request` only, never `merge_group`, condition `!cancelled()`. Run `make gallery-e2e` in the Linux job that already provisions Chromium.
- `.github/workflows/gallery.yml` on `workflow_run` of CI (`completed`), default-branch context, never executing PR code, skipping forks and runs without the artifact: download `gallery-raw` (`actions: read`), fetch the orphan `gallery-data` branch, `publish.mjs --open-prs <open PR numbers>` (`pull-requests: read`), commit `gallery-data` as one orphan commit and force-push it, `actions/upload-pages-artifact` + `actions/deploy-pages` (`pages: write`, `id-token: write`, `environment: github-pages` with the changes-page URL), and an informational commit status `review/renders` on the head sha linking to the changes page (`statuses: write`). Concurrency `gallery-publish`, `cancel-in-progress: false`.
- Slack: the GitHub Slack app, `/github subscribe lolay/nowline deployments`.

### m5 - Docs
- `AGENTS.md` § OSS boundary: add "GitHub Pages deploy of the review gallery (`review.nowline.dev`, same repo)" to the permitted writes.
- `specs/ci.md`: what `gallery.yml` runs, retention, the data branch, the concurrency gap, the e2e leg.
- `tests/README.md`, root `README.md` § Examples: link to `review.nowline.dev`. `no-changelog` label.

### m6 - Hand off DNS to nowline-infra
Once the PR is up, queue a suggested-task card for `lolay/nowline-infra`: a `CNAME` from `review.nowline.dev` to `lolay.github.io.` in the `nowline.dev` zone following its existing DNS pattern, and the GitHub Pages org-verification `TXT` record (`_github-pages-challenge-lolay.nowline.dev`, value from org Settings → Pages → Verified domains, asked of Gary, never guessed); open a PR there. nowline itself never writes to nowline-infra.

## One-time manual setup (you)
1. Repo Settings → Pages → Source: **GitHub Actions**. Custom domain: `review.nowline.dev`. Enforce HTTPS.
2. In nowline-infra DNS, add a CNAME from `review.nowline.dev` to `lolay.github.io`. Verify `nowline.dev` at the org level (Settings → Pages → verified domains) to block subdomain takeover.
3. Run `/github subscribe lolay/nowline deployments` in the QA Slack channel.
4. This assumes the repo is public. Pages on a private repo needs a paid plan, and the site is public either way, which is fine since the sources are.

## Critical files
- New: `scripts/lib/render-manifest.mjs`, `scripts/gallery/{build-gallery,publish-site,html}.mjs` plus tests, `.github/workflows/gallery.yml`.
- Edited: `scripts/render-samples.mjs`, `scripts/render-tests.mjs`, `Makefile`, `Makefile.md`, `.gitignore` (`.gallery/`), `AGENTS.md`, `specs/ci.md`, `tests/README.md`, `README.md`.
- Reused: `scripts/lib/check-dist-fresh.mjs`, `.github/actions/setup-node-pnpm`, the CLI `dist/index.js` render path (unchanged).

## Review log

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`nowline-m2-s1-s3`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl`. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input × in + cache read × cached + 5m write × in × 1.25 + 1h write × in × 2.00 + output × out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.
