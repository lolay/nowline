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

- No `@nowline/embed` package. The monorepo has 14 packages; embed is
  the 15th.
- No browser-bundle build pipeline. Every existing package ships
  Node-targeted ESM via `tsc`; embed needs a bundler (esbuild/rollup)
  that produces a single minified IIFE for `<script>` tag loading.
- No `lolay/nowline-action` repo. The GitHub Action is part of m4 per
  [`specs/embed.md`](../embed.md) §GitHub Action but lives in a
  sibling OSS repo, not in this monorepo.

## What this milestone needs to deliver

Per [`specs/embed.md`](../embed.md):

1. **`@nowline/embed` package** in this monorepo with:
   - `nowline.initialize({ theme, startOnLoad, selector })` and
     `nowline.render(source)` global API.
   - Auto-scan of `pre code.language-nowline` blocks on
     `DOMContentLoaded` when `startOnLoad: true` (default).
   - Single minified IIFE bundle at `dist/nowline.min.js`, **<150 KB
     gzipped** (Mermaid is ~200 KB; we have headroom).
   - `npm publish` lights up jsDelivr and unpkg automatically — no
     extra deploy step.
2. **`lolay/nowline-action` sibling repo** (Apache 2.0) with two modes
   (file, markdown), action inputs per the spec table, and a no-Docker
   runner that installs `@nowline/cli` from npm.
3. **Browser-safety patch for `@nowline/core`** — `include-resolver.ts`
   imports `node:fs` and `node:path`, which break a browser bundle.
   Either skip include resolution in the embed (single-file mode) or
   inject a no-op resolver via DI.
4. **CI pipeline updates**: new `bundle` step that asserts the
   gzipped size budget on every PR; new `compile-smoke` matrix entry
   that loads the bundled IIFE in a headless browser and asserts
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
  `nowline.render` are on jsDelivr they're effectively forever. Mirror
  Mermaid's surface where possible (`initialize`, `render`, `parse`,
  `init`) so users coming from Mermaid don't have to relearn.
- **Sibling-repo bootstrap timing.** The action repo (`lolay/nowline-action`)
  needs the same `release.yml`-style infra that took m2a and m4.6 to
  set up. Bootstrap it first so the action can publish from day one,
  rather than retrofitting it after the npm package exists.

## Suggested plan for the next session

Five logically separate commits to keep review surface narrow:

1. **Scaffold `@nowline/embed`** — `package.json`, `tsconfig.json`,
   `src/index.ts` skeleton with `initialize`/`render` signatures, no
   bundler yet. Build with plain `tsc` first; assert it imports cleanly
   from `@nowline/core`/`@nowline/layout`/`@nowline/renderer`.
2. **Patch include-resolver for browser** — extract the `fs`/`path`
   work into a `IncludeResolver` interface, default to the existing
   Node implementation, accept a DI override. Embed wires in a no-op
   resolver. Snapshots stay byte-stable on CLI tests.
3. **Add esbuild (or rollup) bundler** — produce
   `dist/nowline.min.js` IIFE; add a CI size-check step that fails if
   the gzipped bundle exceeds 150 KB. Add a smoke that loads the IIFE
   in `happy-dom` (already a dep elsewhere) and renders a fixture.
4. **Wire publishing** — `release.yml` already handles npm publish
   for the workspace; add the embed package to the `publish` matrix.
   No CDN action needed (jsDelivr/unpkg are pull-from-npm).
5. **Bootstrap `lolay/nowline-action`** — separate repo work, but
   tracked here. Mirrors `lolay/homebrew-tap` / `lolay/scoop-bucket`
   bootstrap pattern (see [`specs/release-bootstrap.md`](../release-bootstrap.md)).
   First action release is its own milestone moment.

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
- **Source maps in production.** Mermaid ships source maps to
  `dist/`; jsDelivr serves them automatically. Match that posture so
  users get readable stack traces when they file embed bugs.
- **CDN cache invalidation.** jsDelivr caches `@latest` aggressively
  (~12 hours). Document `@version-pinned` URLs in the README as the
  recommended production pattern; reserve `@latest` for prototypes.
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
  only browser-safety blocker; refactor target for commit 2.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — the existing publish matrix;
  add the embed cell here.
- [`specs/release-bootstrap.md`](../release-bootstrap.md) — the
  bootstrap recipe for the sibling action repo.

## Out of scope for m4

- Embed analytics / telemetry. Mermaid doesn't ship this; we won't
  either. Privacy posture matches.
- Theme customization beyond light/dark. Custom-palette embed is a
  natural follow-up but doesn't gate the milestone.
- Plugin/transform hooks (`nowline.use(plugin)`). Defer until a real
  use case lands; resist API surface creep before v1.
- WASM builds. The renderer is pure JS string construction; no WASM
  speed-up to chase.
