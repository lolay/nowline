# m4 handoff — Embed

Forward-looking onboarding for the m4 milestone. Pairs the existing
[`specs/embed.md`](../embed.md) (product surface, CDN, GitHub Action)
with the engineering reality after the m3 series shipped (m3a LSP,
m3b/c VS Code scaffold + live preview, m3d preview parity, m3e CLI
shell-out exports, m3f authoring commands).

## Where we are

**Building blocks already in place:**

- [`@nowline/core`](../../packages/core) — Langium parser, typed AST, validation. Pure TS,
  no native deps; entry point [`packages/core/src/index.ts`](../../packages/core/src/index.ts).
- [`@nowline/layout`](../../packages/layout) — Layout v2 measure/place tree (m2.5a–d)
  with capacity (m2j) and channel routing (m2k). Pure TS, only
  third-party deps are `d3-scale` and `d3-time` (both browser-safe).
- [`@nowline/renderer`](../../packages/renderer) — Positioned model → SVG string. Pure TS,
  zero runtime deps beyond `@nowline/layout`. Already consumed by
  `@nowline/vscode-extension`'s preview webview, which is the closest
  living analog to the embed surface.

**Not yet present:**

- No `lolay/nowline-embed` repo. Per [`specs/embed.md`](../embed.md)
  §Distribution and [`architecture.md`](../architecture.md#organization-and-repositories)
  the embed is its own OSS repo (not `packages/embed/` in the engine
  monorepo) so it consumes `@nowline/core` / `layout` / `renderer`
  via npm exactly the way external embedders would. Same posture as
  `lolay/nowline-action`. Bootstrapping it is the gating prerequisite
  for everything else in this milestone.
- No browser-bundle build pipeline. The new repo will introduce its
  own `esbuild`/`rollup` setup that produces a single minified IIFE
  for `<script>` tag loading; nothing in the engine monorepo
  currently ships browser-targeted artifacts.
- No `lolay/nowline-action` repo. Same pattern as nowline-embed —
  separate OSS repo per [`specs/embed.md`](../embed.md) §GitHub Action.
- No Firebase projects. Two projects need creating before the embed
  CDN deploy workflows can run:
  - `nowline-embed` (Spark plan to start; upgrade to Blaze when the
    custom domain is wired). Default site name `nowline-embed.web.app`,
    custom domain `embed.nowline.io`. Tag-triggered deploys only.
  - `nowline-embed-dev`. Default site name
    `nowline-embed-dev.web.app`, custom domain `embed.nowline.dev`.
    `main`-push deploys + per-PR ephemeral preview channels (7-day
    TTL) via [`FirebaseExtended/action-hosting-deploy`](https://github.com/FirebaseExtended/action-hosting-deploy).
  Each project needs a service-account JSON stored in the
  `lolay/nowline-embed` repo as `FIREBASE_SERVICE_ACCOUNT_PROD` and
  `FIREBASE_SERVICE_ACCOUNT_DEV` repo secrets.

## What this milestone needs to deliver

Per [`specs/embed.md`](../embed.md):

1. **`lolay/nowline-embed` sibling repo** (Apache 2.0) hosting
   `@nowline/embed` with:
   - `nowline.initialize({ theme, startOnLoad, selector })` and
     `nowline.render(source)` global API.
   - Auto-scan of `pre code.language-nowline` blocks on
     `DOMContentLoaded` when `startOnLoad: true` (default).
   - Single minified IIFE bundle at `dist/nowline.min.js`, **<150 KB
     gzipped** (Mermaid is ~200 KB; we have headroom).
   - Bundle banner injected with `version`, `sha`, `built-at` so any
     curl/devtools reveal exactly which build is being served.
   - Consumes `@nowline/core` / `layout` / `renderer` from npm at the
     latest compatible engine version — no `workspace:*` symlinks.
2. **CDN deploy infrastructure on `lolay/nowline-embed`:**
   - `deploy-prod.yml` — on tag push, build and deploy to
     `embed.nowline.io/{X.Y.Z}/`, rewrite `/{X.Y}/` and `/latest/`
     aliases.
   - `deploy-dev.yml` — on `main` push, build and deploy to
     `embed.nowline.dev/`. Bundle additionally `console.warn`s an
     unstable-build notice once per page load.
   - `pr-preview.yml` — on PR open/sync, deploy to a Firebase
     ephemeral channel via `FirebaseExtended/action-hosting-deploy`
     and post the URL as a PR comment.
3. **`lolay/nowline-action` sibling repo** (Apache 2.0) with two modes
   (file, markdown), action inputs per the spec table, and a no-Docker
   runner that installs `@nowline/cli` from npm.
4. **Browser-safety patch for `@nowline/core`** — `include-resolver.ts`
   imports `node:fs` and `node:path`, which break a browser bundle.
   Either skip include resolution in the embed (single-file mode) or
   inject a no-op resolver via DI. This patch lands in **this**
   monorepo because `@nowline/core` lives here; the embed repo
   consumes the patched version from npm.
5. **CI pipeline updates on `lolay/nowline-embed`** (not on this
   monorepo):
   - `bundle-size` step that fails if the gzipped bundle exceeds
     150 KB on every PR.
   - `compile-smoke` matrix that loads the bundled IIFE in headless
     Chromium / Firefox / WebKit (Playwright) and asserts
     `nowline.render('roadmap "x"…')` returns valid SVG.

## Key decisions to make early

These have to land before bundling work begins; defer them and the
rework cost compounds.

- **Bundler choice.** `esbuild` is fastest and the CLI already ships
  bun-compiled binaries (so esbuild's bundling story is the closest to
  what the rest of the monorepo does). Rollup is the safer choice if
  we want a true UMD/IIFE/ESM triple for older CDN consumers. Pick
  one and document; mixing is the worst of both worlds.
- **Include resolution policy in the browser.** Three options:
  1. **Skip silently** — embedded blocks are single-file by
     definition; warn at parse time when an `include` is encountered.
  2. **DI a no-op resolver** — keep the AST shape stable but resolve
     to an empty include set; lets the layout engine run unchanged.
  3. **HTTP-fetch resolver** — `fetch()` the include URL relative to
     the page. Powerful but opens a CORS rabbit hole and a perf
     surprise.
  Recommend (2) for the first cut; (3) is a future opt-in flag.
- **Theme detection.** `nowline.initialize({ theme: 'auto' })` should
  read `prefers-color-scheme` once on init; per-block override via
  the existing `nowline … theme:dark` directive. Nail down the
  precedence (init flag > directive > prefers-color-scheme) before
  the API ships.
- **API surface lock-in.** Once `nowline.initialize` and
  `nowline.render` are at `embed.nowline.io/{X.Y.Z}/` they're
  effectively forever — that exact-pin URL is `Cache-Control:
  immutable` for a year and embedders pinning to it expect the API
  contract to hold. Mirror Mermaid's surface where possible
  (`initialize`, `render`, `parse`, `init`) so users coming from
  Mermaid don't have to relearn.
- **Sibling-repo bootstrap timing.** Both new repos
  (`lolay/nowline-embed`, `lolay/nowline-action`) need the same
  `release.yml`-style infra that took m2a and m4.6 to set up.
  Bootstrap them first so they can publish from day one, rather than
  retrofitting after the engine npm packages exist.

## Suggested plan for the next session

Sequenced so each step unblocks the next; cross-repo work is called
out explicitly.

### Prerequisites (do once, in this order)

0a. **Create the two Firebase projects** (`nowline-embed`,
    `nowline-embed-dev`) on Spark plan; upgrade to Blaze when wiring
    the custom domain. Create one service-account per project.
0b. **DNS for `embed.nowline.io` and `embed.nowline.dev`** —
    Firebase-issued TXT verification + A/AAAA records on the
    `nowline.io` and `nowline.dev` zones.
0c. **Bootstrap `lolay/nowline-embed`** — empty repo, Apache 2.0,
    README, `.github/workflows/` skeleton. Mirrors
    `lolay/homebrew-tap` / `lolay/scoop-bucket` bootstrap pattern
    (see [`specs/release-bootstrap.md`](../release-bootstrap.md)).
    Store both Firebase service-account JSONs as
    `FIREBASE_SERVICE_ACCOUNT_PROD` and `FIREBASE_SERVICE_ACCOUNT_DEV`
    repo secrets.

### In `lolay/nowline` (this monorepo)

1. **Patch include-resolver for browser** — extract the `fs`/`path`
   work into an `IncludeResolver` interface, default to the existing
   Node implementation, accept a DI override. Snapshots stay
   byte-stable on CLI tests. Cut a `@nowline/core` patch release so
   the embed repo can consume the patched version from npm.

### In `lolay/nowline-embed` (new repo)

2. **Scaffold `@nowline/embed`** — `package.json`, `tsconfig.json`,
   `src/index.ts` skeleton with `initialize`/`render` signatures, no
   bundler yet. Depends on `@nowline/core` / `@nowline/layout` /
   `@nowline/renderer` from npm at the patched version from step 1.
   Wires a no-op `IncludeResolver`.
3. **Add esbuild (or rollup) bundler** — produce
   `dist/nowline.min.js` IIFE with banner injection (`version`,
   `sha`, `built-at`); add a CI size-check that fails on >150 KB
   gzipped; add a Playwright smoke that loads the IIFE in headless
   Chromium / Firefox / WebKit and renders a fixture.
4. **Wire deploy workflows** — `deploy-prod.yml` (tag → `embed.nowline.io/{X.Y.Z}/`,
   rewrites `/{X.Y}/` and `/latest/` aliases), `deploy-dev.yml`
   (`main` → `embed.nowline.dev/`), `pr-preview.yml` (PR → ephemeral
   channel).

### In `lolay/nowline-action` (other new repo)

5. **Bootstrap `lolay/nowline-action`** — separate repo work, but
   tracked here. Same bootstrap pattern as `nowline-embed`. First
   action release is its own milestone moment.

## Gotchas

- **Langium runtime size.** `@nowline/core`'s parser brings in the full
  Langium runtime, which is the bulk of any embed bundle. The 150 KB
  gzipped budget assumes Langium tree-shakes well; if it doesn't, the
  decision tree opens up: a hand-rolled `.nowline` parser (significant
  cost), pre-bundled grammars (medium cost), or a higher budget
  (cheap, but breaks the Mermaid-comparable promise). **Measure
  Langium's contribution before locking in any of the above.**
- **No `document` / `window` in tests.** The renderer is pure
  string-builder code — no DOM dependency — so vitest under `node`
  works today. The embed entry point will need `happy-dom` (already in
  the workspace's dev deps for vscode-extension tests) or `jsdom` for
  the auto-scan path.
- **`@nowline/renderer` outputs an SVG **string**, not a DOM
  fragment.** The embed wraps it with `element.outerHTML = svg`; CSS
  scoping (the renderer emits a `<style>` block scoped by a
  per-render id prefix already) is what keeps multi-block pages from
  bleeding styles. Verify this on a fixture with two blocks before
  shipping.
- **Source maps in production.** Ship source maps next to
  `dist/nowline.min.js` and serve them with the same `Cache-Control`
  as the bundle. Users get readable stack traces when they file
  embed bugs without enlarging the request that runs in their page.
- **CDN cache headers per tier.** `embed.nowline.io/{X.Y.Z}/` is
  `immutable` for a year — once you push it, it cannot be updated.
  `/{X.Y}/`, `/latest/`, and `embed.nowline.dev/` are short-TTL
  mutable. The deploy workflow must `firebase hosting:rewrite` the
  mutable aliases on each tag/main push (not just upload new
  immutable paths) for users to actually see updates.
- **GitHub Action versioning.** `lolay/nowline-action@v1` is a moving
  target; `@v1.2.3` is fixed. Tag both — `v1` as a moving major-tag
  pointer (force-pushed on each release) per GitHub's standard
  pattern, plus immutable point-version tags for users who pin.

## Files to reference

- [`specs/embed.md`](../embed.md) — the product spec (what to build).
- [`packages/renderer/src/index.ts`](../../packages/renderer/src/index.ts) — current renderer entry,
  closest analog for what `@nowline/embed` will wrap.
- [`packages/vscode-extension/src/preview/`](../../packages/vscode-extension/src/preview) — m3c live preview is the
  closest living example of "browser-side render harness around the
  same parse → layout → render pipeline". Patterns transfer directly.
- [`packages/core/src/language/include-resolver.ts`](../../packages/core/src/language/include-resolver.ts) — the
  only browser-safety blocker; refactor target for step 1.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — reference for how the
  engine repo's tag-driven multi-target deploy is wired; the embed
  repo's deploy workflows will share the SemVer / tag conventions but
  swap `bun --compile` for `esbuild` and `bun publish` for
  `firebase deploy`.
- [`specs/release-bootstrap.md`](../release-bootstrap.md) — the
  bootstrap recipe for the sibling embed and action repos, including
  Firebase project + DNS prerequisites.

## Out of scope for m4

- Embed analytics / telemetry. Mermaid doesn't ship this; we won't
  either. Privacy posture matches.
- Theme customization beyond light/dark. Custom-palette embed is a
  natural follow-up but doesn't gate the milestone.
- Plugin/transform hooks (`nowline.use(plugin)`). Defer until a real
  use case lands; resist API surface creep before v1.
- WASM builds. The renderer is pure JS string construction; no WASM
  speed-up to chase.
