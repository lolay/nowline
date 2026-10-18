# Review gallery

Rendered `examples/*.svg` and `tests/*.svg` are build output and gitignored, so manual QA used to mean cloning, building and opening files side by side. The review gallery publishes every build of `main` and every same-repo PR push as a mobile-friendly site at [review.nowline.dev](https://review.nowline.dev): each `.nowline` beside its diagram, compared with a baseline build, with prev/next through entries and an index of the last 100 builds. A deploy notification links straight to the build's changes page for spot checks from a phone.

The code is [`scripts/gallery/`](../scripts/gallery) (`collect.mjs`, `publish.mjs`, `serve.mjs`, `lib/`, `assets/`), with `node:test` specs in `scripts/gallery/test/` and the browser leg in `packages/integration-tests/test/review-gallery.e2e.test.ts`. The Make targets are `gallery`, `gallery-collect`, `gallery-publish`, `gallery-serve` and `gallery-e2e` ([`Makefile.md`](../Makefile.md)). How CI collects and publishes, the trust model, retention and the concurrency gap are in [`ci.md` § Review gallery](./ci.md#review-gallery).

## Hosting: GitHub Pages + custom domain, not Firebase

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
5. **Source:** a **Source** toggle in each compare block's toolbar (open by default on entry pages, collapsed on the changes digest) shows the `.nowline` directly under the render(s). When the source changed, it's a line-aligned two-column table (prev | this, deletions red on the left, additions green on the right) at 768px and up with layout *Auto* or *Side*, and a unified +/- list when stacked. Unchanged source is a single column. Each file sits in its own `<details>`: the main file open, includes (`nested/`, `waves-program/`, `partner-multi`, `waves-isolate-team`) collapsed unless they changed. `compare.html` cards carry no source; their titles link to the entry page.
6. **Build history for this item:** a second nav row steps through builds for the *same* entry, so you can walk back to when it changed.
   - `‹ Older build` / `Newer build ›` move one build at a time.
   - `« Older change` / `Newer change »` jump to the nearest build where this item's SVG hash differs from the build before it.
   - A compact strip shows one dot per retained build (up to 100), filled where the item changed. Tapping a dot jumps to that build.
   - Every link and the strip are written statically, because the whole site is regenerated on each publish (see `ci.md`). `history/<group>/<slug>.json` also ships for `compare.html`.
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

## View settings

Mode (side / blink / slider / diff), layout (auto / stack / side), size (fit / actual), Source open or closed, and *Changed only* are one global preference that carries from item to item, build to build, and onto the changes digest and range compare.

- Each lives in `localStorage` (every access in try/catch) and rides as query params on every in-gallery link: `?mode=blink&layout=side&size=fit&src=1&changed=1`, so the view survives private browsing and a pasted link opens the same view. External and raw-SVG links carry none.
- URL params win over storage; an invalid param falls back to storage, then the default.
- Picking a mode or layout on one digest card applies it to every card.
- The Source and *Changed only* defaults hold until the viewer first chooses; a per-build default is never written back as a preference.

## Lines, baselines and retention

- **Lines.** Every build belongs to a line: `main`, `pr-<n>`, or under `make gallery` the current git branch. A line is classified by the manifest's `pr` field, not its name, so a local branch called `pr-12` is a branch line. `builds.json` in the data dir is `{ "lines": { "main": [ids], "pr-123": [ids] } }`, newest first; the original flat `{ "builds": [ids] }` reads as the `main` line.
- **Build ids** are bound to their line and commit: a bare 12-char sha on `main`, `pr-<n>-<head12>` for a PR, `<branch-slug>-<sha12>` for a local branch. Publish refuses an id that doesn't match, or one another line already owns.
- **Manifest fields** (`collect.mjs`): `line`, and for PR builds `pr: { number, title, url, headRef, headSha, baseSha }`. In CI the checkout is the PR merge commit, so the PR facts come from `GALLERY_*` environment variables (`GALLERY_LINE`, `GALLERY_PR_NUMBER`, `GALLERY_PR_TITLE`, `GALLERY_PR_URL`, `GALLERY_HEAD_REF`, `GALLERY_HEAD_SHA`, `GALLERY_BASE_SHA`, `GALLERY_AUTHOR`, `GALLERY_DATE`); a PR build's `sha` is the head sha, so its id is unique per push. Locally the line is `git rev-parse --abbrev-ref HEAD`.
- **Baseline** (`baseId`, chosen at publish time and stored in the build's data manifest):
  - a `main` build compares with the previous build in the `main` line;
  - a PR build compares with the `main` build whose sha is `pr.baseSha`; if none is retained, with the newest retained `main` build that is an ancestor of `pr.baseSha` (`git merge-base --is-ancestor`, so the publishing checkout needs full history); if none, it has no baseline;
  - a local branch's first build compares with the newest `main` build; later builds compare with the previous build in their own line.
- **Statuses**, changed-only navigation and the changes digest follow `baseId`. Per-entry history rows and older/newer build and change navigation stay within the build's own line.
- **Retention** (`publish.mjs`): `--keep` (default 100) for `main` and each local branch line; `--keep-pr` (default 10) per PR line; `--open-prs <numbers>` drops every `pr-<n>` line not listed (omitted: keep all), but never the line just published. Raw builds no line lists are deleted, except a build that a retained build in another line compares against.

## Pull request pages

- **Root index:** sections **Main**, **Pull requests** (each PR: `#<n>` linked to the PR, title, author, latest push's sha and local time, counts vs main, link to its changes page), then **Branches** (local non-main lines).
- `pr/<n>/` redirects to the PR's latest push; `pr/<n>/builds.html` lists its pushes with counts.
- A PR build's header: `PR #<n> · <title> · <headRef>`, then head sha, author and date, then `vs main <base sha>` (linked to that build), then `vs previous push`, a range compare with the line's earlier push when there is one.
- The site's `builds.json` carries `line` and `pr` per build; `compare.html`'s pickers group builds by line.
- `latest/` points at the newest `main` build.

## Untrusted builds

In CI the raw build comes from a PR's code, so `publish.mjs` treats every manifest field and file as untrusted ([`lib/validate.mjs`](../scripts/gallery/lib/validate.mjs)) and changes nothing on disk until the whole build validates:

- ids, group ids and slugs are plain names; source paths are relative, without `..`, and resolve to regular files inside the raw build (no symlinks); only the files the manifest names are copied in;
- shas are lowercase hex before they reach git;
- `repoUrl` is an `https://github.com/<owner>/<repo>` URL, the run and PR links sit under it, and every link is rendered only if it is `https:`;
- exactly one trust flag says what the caller expects: `--pr <n>` (the build must be PR n's), `--trusted-main` (a `main` build), or `--trusted-local` (`make gallery`; refused under GitHub Actions). `--repo` and `--sha` pin the repository and commit;
- stored manifests are re-validated on every publish, and a malformed one fails it.
