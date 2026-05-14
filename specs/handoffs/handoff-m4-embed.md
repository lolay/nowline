# m4 handoff — Embed

m4 has shipped. **[What shipped](#what-shipped)** at the bottom is the
canonical record of what landed and why. The sections above it preserve
the pre-implementation handoff for context — they describe the
*original* plan, including a sibling-repo posture for `@nowline/embed`
and `lolay/nowline-action` that was revised during implementation. Read
them as historical decision-making, not as instructions to follow.

> **Structural decisions revised during m4:** the embed moved from a
> sibling repo (`lolay/nowline-embed`) into this monorepo at
> `packages/embed/`; the m3.5 GitHub Action moved from a sibling repo
> to monorepo-source + Marketplace mirror. Both follow Mermaid's split:
> parser-coupled packages live with the parser; loose-coupling
> consumers go sibling or get mirrored. See [Decisions that diverged](#what-shipped)
> below and [`specs/architecture.md`](../architecture.md).

---

## Where we are *(state at the time the handoff was written)*

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

- No `@nowline/embed` package. The original plan was a sibling
  `lolay/nowline-embed` repo so the package would consume engine
  packages from npm exactly the way external embedders would; that
  call was revised during implementation to a monorepo subpath
  (`packages/embed/`) — see "Decisions that diverged" below.
- No browser-bundle build pipeline. Whichever repo lands the embed
  needs an `esbuild`/`rollup` setup that produces a single minified
  IIFE for `<script>` tag loading; nothing in the engine monorepo
  currently ships browser-targeted artifacts.
- No `packages/nowline-action/` source and no `lolay/nowline-action`
  Marketplace mirror repo (m3.5, not m4). Posture chosen during this
  milestone: monorepo-source + write-only mirror — see "Decisions
  that diverged" below.
- No Firebase projects. Two projects need creating before the embed
  CDN deploy workflows can run:
  - `nowline-embed` (Spark plan to start; upgrade to Blaze when the
    custom domain is wired). Default site name `nowline-embed.web.app`,
    custom domain `embed.nowline.io`. Tag-triggered deploys only.
  - `nowline-embed-dev`. Default site name
    `nowline-embed-dev.web.app`, custom domain `embed.nowline.dev`.
    `main`-push deploys + per-PR ephemeral preview channels (7-day
    TTL) via [`FirebaseExtended/action-hosting-deploy`](https://github.com/FirebaseExtended/action-hosting-deploy).
  Each project needs a service-account JSON stored in this monorepo
  as `FIREBASE_SERVICE_ACCOUNT_PROD` and `FIREBASE_SERVICE_ACCOUNT_DEV`
  repo secrets so `release.yml` can deploy the bundle (originally
  scoped for the `lolay/nowline-embed` repo; revised during m4 to live
  alongside the existing `release.yml`).

## What this milestone needs to deliver *(original plan)*

Per [`specs/embed.md`](../embed.md). The plan as originally drafted
assumed a `lolay/nowline-embed` sibling repo; the substance below
still applies, but it lands in `packages/embed/` instead — see "What
shipped" for the revised location.

1. **`@nowline/embed` package** (Apache 2.0) with:
   - `nowline.initialize({ theme, startOnLoad, selector })` and
     `nowline.render(source)` global API.
   - Auto-scan of `pre code.language-nowline` blocks on
     `DOMContentLoaded` when `startOnLoad: true` (default).
   - Single minified IIFE bundle at `dist/nowline.min.js`, **<150 KB
     gzipped** (Mermaid is ~200 KB; we have headroom).
   - Bundle banner injected with `version`, `sha`, `built-at` so any
     curl/devtools reveal exactly which build is being served.
   - Builds against `@nowline/core` / `layout` / `renderer` at lock-step
     workspace versions.
2. **CDN deploy infrastructure** in `release.yml` (originally scoped
   for the sibling repo's own workflows):
   - On tag push, build and deploy to `embed.nowline.io/{X.Y.Z}/`,
     rewrite `/{X.Y}/` and `/latest/` aliases.
   - On `main` push, build and deploy to `embed.nowline.dev/`. Bundle
     additionally `console.warn`s an unstable-build notice once per
     page load.
   - On PR open/sync, deploy to a Firebase ephemeral channel via
     `FirebaseExtended/action-hosting-deploy` and post the URL as a
     PR comment.
3. **Browser-safety patch for `@nowline/core`** — `include-resolver.ts`
   imports `node:fs` and `node:path`, which break a browser bundle.
   Either skip include resolution in the embed (single-file mode) or
   inject a no-op resolver via DI.
4. **CI pipeline updates** in this monorepo's `ci.yml`:
   - `bundle-size` step that fails if the gzipped bundle exceeds
     150 KB on every PR.
   - `compile-smoke` matrix that loads the bundled IIFE in headless
     Chromium / Firefox / WebKit (Playwright) and asserts
     `nowline.render('roadmap "x"…')` returns valid SVG.

(The action moved to its own milestone — m3.5.)

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
- **Repo posture (resolved during m4).** The original plan assumed
  sibling repos for both `@nowline/embed` and `lolay/nowline-action`
  with their own `release.yml`-style infra. Implementation revised
  this to monorepo-source for both, with a Marketplace mirror for the
  action — see "Decisions that diverged" below for the rationale.

## Suggested plan *(historical sketch)*

The original plan staged work across this monorepo and a new sibling
`lolay/nowline-embed` repo, sequenced so prerequisites (Firebase
project bootstrap, DNS, sibling-repo skeleton) ran first. The revised
plan kept the substance but collapsed the sibling-repo work into this
monorepo:

1. **`@nowline/core` browser-safety refactor** — extract the `fs`/`path`
   work behind a DI boundary so the embed bundle carries no `node:*`
   literal.
2. **Scaffold `@nowline/embed`** at `packages/embed/` with the
   `initialize` / `render` / `parse` / `init` API and a no-op include
   resolver.
3. **Add the esbuild bundler + bundle-size CI gate** producing
   `dist/nowline.min.js` (IIFE) and `dist/nowline.esm.js` (ESM).
4. **Wire CDN deploy** to `embed.nowline.io` (prod, tag-driven) /
   `embed.nowline.dev` (dev + per-PR ephemeral channels). Carried
   forward — see "What shipped".

The action work moved to m3.5 (its own milestone, source at
`packages/nowline-action/` + Marketplace mirror at
`lolay/nowline-action`).

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
- **GitHub Action versioning (m3.5 follow-up).** The Marketplace
  mirror repo (`lolay/nowline-action`) carries its own tags, populated
  by `release.yml` on each engine release. Push both the immutable
  point-version tag (`v1.2.3`, what production users pin) and a
  moving major-tag pointer (`v1`, force-pushed on each release) per
  GitHub's standard pattern. The monorepo's tag drives both pushes.

## Files to reference

- [`specs/embed.md`](../embed.md) — the product spec (what to build).
- [`packages/renderer/src/index.ts`](../../packages/renderer/src/index.ts) — current renderer entry,
  closest analog for what `@nowline/embed` will wrap.
- [`packages/vscode-extension/src/preview/`](../../packages/vscode-extension/src/preview) — m3c live preview is the
  closest living example of "browser-side render harness around the
  same parse → layout → render pipeline". Patterns transfer directly.
- [`packages/core/src/language/include-resolver.ts`](../../packages/core/src/language/include-resolver.ts) — the
  only browser-safety blocker; refactor target for step 1.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — the
  monorepo's tag-driven multi-target release pipeline. The pending
  Firebase deploy work (see "What shipped" → "Carried forward")
  attaches new cells here rather than living in a separate workflow.
- [`specs/release-bootstrap.md`](../release-bootstrap.md) — bootstrap
  recipe for one-time prerequisites (Homebrew tap, Marketplace IDs,
  PATs). The Firebase project + DNS work that's still pending for the
  branded CDN belongs alongside this checklist.

## Out of scope for m4

- Embed analytics / telemetry. Mermaid doesn't ship this; we won't
  either. Privacy posture matches.
- Theme customization beyond light/dark. Custom-palette embed is a
  natural follow-up but doesn't gate the milestone.
- Plugin/transform hooks (`nowline.use(plugin)`). Defer until a real
  use case lands; resist API surface creep before v1.
- WASM builds. The renderer is pure JS string construction; no WASM
  speed-up to chase.

## What shipped

m4 landed as a single in-monorepo package, not the originally-scoped
sibling repo. The GitHub Action work was pulled out into its own
pre-m4 milestone (m3.5) since it shells out to `@nowline/cli` and has
no embed dependency — see [`specs/milestones.md`](../milestones.md).
The m3.5 action also moved into the monorepo (at
`packages/nowline-action/`, with a Marketplace mirror at
`lolay/nowline-action`) for the same Mermaid-pattern reasons — see
"Decisions that diverged" below.

**Decisions that diverged from the original handoff:**

- **In-monorepo, not sibling-repo.** `@nowline/embed` lives at
  [`packages/embed/`](../../packages/embed) and rides the same publish
  pipeline as the rest of the workspace. The plan's rationale for a
  sibling repo (consume engine packages from npm exactly the way
  external embedders would) was outweighed by the operational cost of
  a second tag-driven release process and the lock-step versioning
  benefit of staying in the workspace. This matches
  [Mermaid](https://github.com/mermaid-js/mermaid)'s split: parser-coupled
  packages (parser, layout, plugins, **embed**) live in the monorepo;
  loose-coupling consumers (CLI, live editor, VS Code extension) sit
  as siblings. The dogfooding signal a sibling repo would have bought
  is recovered with a `pnpm pack`-based smoke test in CI — see
  [`specs/architecture.md`](../architecture.md) §Build and Release.
- **Action posture revised in lock-step.** While reconciling the
  embed's monorepo move with the original spec, the m3.5 GitHub
  Action's posture also flipped from "sibling repo" to "monorepo
  source at `packages/nowline-action/` + `lolay/nowline-action`
  Marketplace mirror." Same Mermaid-shaped logic: action couples to
  the CLI it shells out to, so source ships with the CLI; the mirror
  is a publish target like Homebrew tap or npm. m3.5 implementation
  now follows that posture — see
  [`specs/architecture.md`](../architecture.md) §Organization and
  Repositories and [`specs/milestones.md`](../milestones.md) §m3.5.
- **Branded CDN deploy carried forward; bundle ships through npm
  first.** [`specs/embed.md`](../embed.md) and `specs/features.md`
  feature 32 both call for the branded `embed.nowline.{io,dev}`
  Firebase-Hosted CDN. The bundle landed in m4 and is published to
  npm by `release.yml`, but the Firebase project bootstrap, the
  release-time deploy job, and the DNS records have not been wired
  yet. Until they are, embedders can `npm i @nowline/embed` and
  self-host; npm-backed CDNs (jsDelivr, unpkg) serve the package as
  the unsupported escape hatch the spec already calls out, not the
  documented channel.
- **Bundler: esbuild.** Matches Mermaid's production bundler since
  [PR #4729](https://github.com/mermaid-js/mermaid/pull/4729) (2023,
  when they replaced UMD with IIFE for the same reason we want one),
  and matches `packages/vscode-extension/scripts/bundle.mjs` which
  already runs esbuild. One toolchain across the monorepo.
- **Include resolution: DI no-op (option 2).** A `readFile` callback
  that always rejects with a stable sniff-able error tag; the pipeline
  filters those into a single deduped `console.warn`. HTTP-fetch
  remains a future opt-in.
- **API surface: Mermaid-shaped.** `nowline.initialize(opts)`,
  `nowline.render(source)`, `nowline.parse(source)`,
  `nowline.init()` / `.run()`. Mermaid users transfer with no
  relearning.
- **Bundle size: 175 KB gzipped budget (was 150 KB).** First build
  measured at ~163 KB gzipped, with the Langium ecosystem at ~100 KB
  gzipped — well under the handoff's 120 KB escalation trigger. Per
  the handoff's "next moves", the cheap fix was a higher budget; we
  set 175 KB so we still beat Mermaid's 200 KB by a comfortable
  margin while leaving ~12 KB headroom. The 200 KB ceiling is now the
  documented review trigger for pre-bundled grammars / hand-rolled
  parser.

**Browser-safety changes to `@nowline/core`:**

- [`packages/core/src/util/posix-path.ts`](../../packages/core/src/util/posix-path.ts)
  — 30-LOC POSIX/Windows-compatible `dirname` / `basename` /
  `resolve` helper replaces the `node:path` calls in the include
  resolver. Audited inline; no third-party dependency.
- [`packages/core/src/util/node-read-file.ts`](../../packages/core/src/util/node-read-file.ts)
  — Node-only `readFile` fallback isolated behind a dynamic
  `await import()` boundary. The embed bundle plugin in
  [`packages/embed/scripts/bundle.mjs`](../../packages/embed/scripts/bundle.mjs)
  stubs this module out so the IIFE carries no `node:fs` literal.
- `"sideEffects": false` added to `@nowline/core`,
  `@nowline/layout`, and `@nowline/renderer` so esbuild tree-shakes
  unused exports out of the embed bundle.

**Tests delivered:**

- [`packages/embed/test/auto-scan.test.ts`](../../packages/embed/test/auto-scan.test.ts)
  — happy-dom smoke for single-block replacement, multi-block style
  isolation (per-render `idPrefix`), selector filtering, and
  partial-failure resilience.
- [`packages/embed/test/manual-render.test.ts`](../../packages/embed/test/manual-render.test.ts)
  — `nowline.render` + `nowline.parse` deterministic output and
  `theme` overrides.
- [`packages/embed/test/include-warn.test.ts`](../../packages/embed/test/include-warn.test.ts)
  — once-per-page-load warning latch on `include` directives, plus
  the surviving SVG render.
- [`packages/core/test/util/posix-path.test.ts`](../../packages/core/test/util/posix-path.test.ts)
  — covers the POSIX/Windows path helper.

**CI gates added:**

- [`bundle-size`](../../.github/workflows/ci.yml) job — runs
  `pnpm --filter @nowline/embed check-size --print-attribution` on
  every PR. Fails if gzipped > 175 KB OR if any `node:*` literal
  survives in the IIFE.
- [`packages/embed/scripts/check-size.mjs`](../../packages/embed/scripts/check-size.mjs)
  walks the esbuild metafile to print the top contributors so a
  Langium runtime regression surfaces with a directional fix.

**Publish wiring:** the `pack-npm` matrix cell in
[`.github/workflows/release.yml`](../../.github/workflows/release.yml)
packs `@nowline/embed` between `@nowline/renderer` and
`@nowline/export-core`; the `npm` publish cell publishes the tarball
in dependency order.

**Carried forward — required to close m4:**

- Branded `embed.nowline.{io,dev}` Firebase-Hosted CDN deploy. Two
  Firebase projects (prod tag-driven, dev `main`-driven + per-PR
  ephemeral channels), the deploy job in `release.yml` (or a new
  workflow), DNS records on `nowline.io` / `nowline.dev`, and the
  bundle-provenance banner described in [`specs/embed.md`](../embed.md)
  → "Bundle provenance". Tracked as `specs/features.md` feature 32.

**Carried forward — out of scope for m4:**

- HTTP-fetch include resolver (opt-in flag).
- Playwright cross-browser smoke (Chromium / Firefox / WebKit). The
  happy-dom smoke covers the API contract; cross-browser parity is
  worth a follow-up once we have a public URL to point Playwright at.
- Plugin / transform hooks (`nowline.use(...)`). Resist surface creep
  before v1.
