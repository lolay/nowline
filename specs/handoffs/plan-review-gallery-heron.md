# Build gallery: per-build QA site for examples/ and tests/

Status: m1 (done), paused for review before m2. Branch: `claude/compassionate-galileo-jizy6q`. Runner scratch, to be removed or promoted before merge.

m1 deviations: `publish.mjs` (planned as m2.s1) landed in m1, because `make gallery` runs the same collect + publish path CI will, keeping local history in `.gallery/data`, so no `GALLERY_PREV` is needed: run it on `main`, then on a branch. Added `make gallery-serve` (LAN http server) since the pixel diff and the history strip need http. In phone landscape the history strip hides (older/newer links stay) instead of sitting behind a toggle. m2 is now only `gallery.yml` plus Slack.

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
   - Every link and the strip are written statically, because the whole site is regenerated on each publish (see m2.s1). `history/<group>/<slug>.json` also ships for `compare.html`.
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

## Implementation

### m1 - Shared manifest and gallery generator (local)

#### s1 - Extract manifests [exec]
- Move the `MANIFEST` arrays from `scripts/render-samples.mjs` and `scripts/render-tests.mjs` into a new `scripts/lib/render-manifest.mjs`, which exports `EXAMPLES` and `TESTS`. Both render scripts import from there, and their behaviour is unchanged.
- Reorder `EXAMPLES` so it matches the progressive order in the root `README.md` § Examples (minimal → capacity → sizing → teams → product → long → nested → waves → waves-program, then the rest).
- Add an optional `description`. When it's absent, the generator falls back to the `.nowline` file's leading `//` comment block. Tests already carry these comments. Examples get descriptions lifted from the root README list.

#### s2 - Generator [deep]
- **Split into two stages**, because "changed" is only knowable once the previous build is in hand.
  - `scripts/gallery/collect.mjs` copies the rendered SVGs and their sources (with include children) into a raw build dir. It also writes a `manifest.json` holding the entries, sha256 per SVG and per source, and commit metadata: sha, subject, author name, author date (ISO), ref, and run URL. The metadata comes from `git log -1 --format=...`.
  - `scripts/gallery/build-pages.mjs <buildDir> [--prev <prevBuildDir>]` writes the HTML for that build, including the compare blocks and the source diff.
- **Code layout:**
  - Keep the HTML in small pure functions in `scripts/gallery/html.mjs`. Every embedded string goes through one `escapeHtml`.
  - The line diff is a small LCS in `scripts/gallery/diff.mjs`, so there's no dependency. The sources are small.
  - The compare, blink, slider, lockstep-scroll and nav behaviour lives in one inline script of about 150 lines, with no framework.
- Include children are found by parsing `include "..."` lines.
- `defaults-no-start-no-now` renders against today's date, so it gets an "expected to change every build" note and never counts as changed.

#### s3 - Make targets [exec]
- `make gallery` (depends on `build`) writes `.gallery/` (gitignored), which you can open locally via `file://`.
- `make gallery GALLERY_PREV=<dir>` compares against another local gallery, for example one built from `main` in a second worktree. That gives the same compare view before you push.
- Update `Makefile.md`.

#### s4 - Tests [exec]
- Add `node --test` specs under `scripts/gallery/`. They cover:
  - escaping;
  - prev/next wrap and ordering across groups, plus *Changed only* skipping;
  - description fallback and include discovery;
  - changed / new / unchanged / removed classification, and the drift vs source-edit split;
  - range classification between two non-adjacent manifests;
  - history rows, and older/newer-change resolution across a seeded history;
  - the line diff.
- Wire them into `make test`.

### m2 - Publish workflow

#### s1 - Site index script [deep]
- Add `scripts/gallery/publish-site.mjs <dataDir> <rawBuildDir> <outDir>`.
- `dataDir` holds **raw builds only**: per build, its SVGs, its sources and `manifest.json`. No HTML is stored.
- It adds the new raw build and prunes `dataDir` to the newest 100.
- Then it regenerates the **entire** HTML site into `outDir` from all retained raw builds. That covers every `b/<sha>/` page, each with `--prev` set to its predecessor, plus `builds.json`, the root `index.html`, `latest/` and `history/<group>/<slug>.json`.
  - Regenerating takes milliseconds at about 6,000 small pages.
  - Older builds pick up static "newer build" links and any template improvements.
  - Pruning never leaves stale history rows.
  - The oldest retained build shows "history starts here".
- With an Actions-source deploy, a `CNAME` file in the artifact is ignored, so the domain is set only in repo settings (see manual setup).
- It gets unit tests as well.

#### s2 - `.github/workflows/gallery.yml` [deep]
- Triggers on push to `main` (same `paths-ignore` as `canary.yml`) and on `workflow_dispatch` (any ref, labelled with its branch).
- **`render` job** (`contents: read`): checkout, `./.github/actions/setup-node-pnpm`, `make build`, then `collect`. It uploads the raw build dir as an artifact. The HTML is generated in `publish`, where the previous build is available.
- **`publish` job**:
  - Permissions: `contents: write`, `pages: write`, `id-token: write`.
  - `environment: github-pages`, with `url: ${{ steps.publish.outputs.url }}`. That's `b/<sha>/changes.html` when the build has changes, else `b/<sha>/`.
  - Steps:
    1. Check out the default branch's trusted scripts.
    2. Fetch the `gallery-data` branch into `data/`. On the first run it doesn't exist yet, so start empty.
    3. Download the render artifact.
    4. Run `publish-site.mjs data/ <raw> site/`.
    5. Commit `data/` as one orphan commit and force-push `gallery-data`. It's a bot-owned storage branch with no shared history with `main`, and branch rulesets only cover `~DEFAULT_BRANCH`. Identical SVGs dedupe to the same git blob, so the branch stays at a few MB.
    6. `actions/upload-pages-artifact` (`site/`) + `actions/deploy-pages`.
  - Concurrency: `gallery-publish`, `cancel-in-progress: false`.
  - Known gap: GitHub keeps one pending run per group, so a burst of three or more merges inside a publish window (about 1 min) can skip a middle hash. The merge queue makes this rare, and we accept it.
- Write the build URL to the job summary.

#### s3 - Notification [exec, mostly manual]
There's no Slack integration in the repo today. Use the GitHub Slack app with `/github subscribe lolay/nowline deployments`. Each `github-pages` deployment posts with its environment URL, which is the per-build page. That needs no secret and no code in nowline. Verify the posted link is the per-build URL. If it's only the root, add an incoming-webhook step as a follow-up.

### m3 - Docs [exec]
- `AGENTS.md` § OSS boundary: add "GitHub Pages deploy of the build gallery (`review.nowline.dev`, same repo)" to the permitted list.
- `specs/ci.md`: new section covering what `gallery.yml` runs, retention, the data branch, and the concurrency gap.
- `tests/README.md` § How they're rendered, and the root `README.md` § Examples: link to `review.nowline.dev`.
- No changelog fragment, since this is internal CI. The PR gets the `no-changelog` label.

### m4 - Hand off DNS to nowline-infra [fast]

Once the PR is up, queue a suggested-task card with `spawn_task`. It's a cloud session you start with one click, and its prompt stands alone:
- Work in `lolay/nowline-infra` (attach it with `add_repo`).
- Add a `CNAME` record from `review.nowline.dev` to `lolay.github.io.` in the `nowline.dev` zone, following the repo's existing DNS/Terraform pattern.
- Add the GitHub Pages org-verification `TXT` record (`_github-pages-challenge-lolay.nowline.dev`). The value comes from GitHub org Settings → Pages → Verified domains, so the session asks you for it rather than guessing.
- Open a PR there.

nowline itself never writes to nowline-infra. The card is a human-started session, so the push-direction rule holds.

## One-time manual setup (you)
1. Repo Settings → Pages → Source: **GitHub Actions**. Custom domain: `review.nowline.dev`. Enforce HTTPS.
2. In nowline-infra DNS, add a CNAME from `review.nowline.dev` to `lolay.github.io`. Verify `nowline.dev` at the org level (Settings → Pages → verified domains) to block subdomain takeover.
3. Run `/github subscribe lolay/nowline deployments` in the QA Slack channel.
4. This assumes the repo is public. Pages on a private repo needs a paid plan, and the site is public either way, which is fine since the sources are.

## Critical files
- New: `scripts/lib/render-manifest.mjs`, `scripts/gallery/{build-gallery,publish-site,html}.mjs` plus tests, `.github/workflows/gallery.yml`.
- Edited: `scripts/render-samples.mjs`, `scripts/render-tests.mjs`, `Makefile`, `Makefile.md`, `.gitignore` (`.gallery/`), `AGENTS.md`, `specs/ci.md`, `tests/README.md`, `README.md`.
- Reused: `scripts/lib/check-dist-fresh.mjs`, `.github/actions/setup-node-pnpm`, the CLI `dist/index.js` render path (unchanged).

## Verification
- Run `make pre-commit` (lint, build, typecheck, and test, including the new `node --test` specs), then `make pack-mcpb`.
- Build two local galleries, one from `main` and one from a branch that nudges a renderer constant. Run `make gallery GALLERY_PREV=...` and load the result in Playwright (Chromium) at 390x844 (phone), 956x440 (iPhone Pro Max landscape), 820x1180 (iPad portrait) and 1440x900.
  - Screenshot a changed entry at each size. It should be stacked on the phone in portrait, and side by side in phone landscape, on the iPad and on desktop. In landscape, the compact chrome should leave at least 60% of the height for the diagrams.
  - Open `changes.html` and `compare.html` across a three-build range. The counts should match the nudged entries, and Diff mode should highlight the shifted pixels.
  - Check that blink and slider work, that actual-size panes scroll in lockstep, and that *Changed only* navigation skips unchanged entries.
  - Check that phone width in fit mode has no horizontal page scroll.
- Run `publish-site.mjs` against a temp site seeded with 101 fake builds. The oldest should be pruned, and changed badges should be correct.
- After merging: trigger `workflow_dispatch` on the branch, confirm the deployment URL loads on a phone and `latest/` redirects, and confirm the Slack post links the build.
