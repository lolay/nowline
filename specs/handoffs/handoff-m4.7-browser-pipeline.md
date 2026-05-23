# m4.7 handoff — Browser pipeline + preview shell + LSP worker + showcase

m4.7 has shipped. This handoff is the record of what landed, the
decisions that locked in during implementation, and the small list of
follow-ups that are deliberately deferred.

The milestone's job was an extraction: peel three browser-flavoured
chunks of glue out of `@nowline/embed` and `@nowline/vscode-extension`
into standalone, framework-agnostic packages so commercial browser
surfaces (Free SPA at `free.nowline.io`, future browser-hosted IDE
wrappers) can stand on the same battle-tested OSS code instead of
forking. Nothing about this milestone widened the OSS scope past
today's tools — it's a refactor reshaping existing code into smaller,
more reusable units, plus a canonical sample roadmap (`examples/showcase.nowline`)
to drive empty states.

## Where we are

m4.7 lands as four new packages and one new example, all Apache-2.0,
shipped in lock-step with the rest of the workspace through the
existing `release.yml` pipeline.

**Shipped:**

- [`packages/browser/`](../../packages/browser) (`@nowline/browser`)
  — single-call browser pipeline. `parseSource(source, options)` and
  `renderSource(source, options)` consolidate the previously-duplicated
  parse → resolveIncludes → layout → render → diagnostics glue from
  `packages/embed/src/pipeline.ts` and
  `packages/vscode-extension/src/preview/render-pipeline.ts`.
  `readFile` and `assetResolver` are pluggable so the embed keeps its
  warn-once no-op and VS Code keeps its `node:fs`-backed include
  resolver without `@nowline/browser` itself importing `node:fs`.
  Re-exports the canonical showcase source string via
  [`src/generated/showcase.ts`](../../packages/browser/src/generated/showcase.ts)
  (regenerated from `examples/showcase.nowline` by
  [`scripts/bundle-showcase.mjs`](../../packages/browser/scripts/bundle-showcase.mjs)
  on every `prebuild` / `pretest` so the string can't drift).
- [`packages/preview-shell/`](../../packages/preview-shell)
  (`@nowline/preview-shell`) — framework-agnostic viewport chrome.
  `mountPreview(rootEl, options) → PreviewHandle` ships zoom, pan,
  Figma-style keyboard presets (`1`/`2`/`3`/`0`), Fit Page / Fit
  Width, a minimap with click-to-recenter, and a clickable
  diagnostic table — all the ~1000 LOC of behaviour that previously
  lived inline in
  `packages/vscode-extension/src/preview/shell-html.ts`. CSS uses
  neutral `--nl-preview-*` custom properties; a documented
  `VSCODE_THEME_BRIDGE_CSS` export maps them to VS Code's
  `--vscode-*` palette so the extension keeps its theme without
  baking VS Code knowledge into the package.
- [`packages/lsp-worker/`](../../packages/lsp-worker)
  (`@nowline/lsp-worker`) — browser-side packaging of `@nowline/lsp`.
  `./worker` is a Web Worker entry that wires `createNowlineServices`
  (with `EmptyFileSystem` from `langium`) over
  `BrowserMessageReader` / `BrowserMessageWriter` from
  `vscode-jsonrpc/browser`. `./client` is a CodeMirror-friendly
  client adapter exposing the LSP surface from `specs/lsp.md` §
  Capability surface — `didOpen` / `didChange` / `didClose`,
  `onDiagnostics`, `completion`, `hover`, `definition`,
  `references`, plus a wire-protocol guard that throws if the server
  ever advertises non-`Incremental` `textDocumentSync` or if a caller
  attempts a whole-document `didChange`.
- [`examples/showcase.nowline`](../../examples/showcase.nowline) —
  two swimlanes (engineering + marketing), a linear flow with one
  parallel block containing a `Build` group, one `kickoff` anchor,
  one `launch` milestone. Renders to ~770 × 700 px at `scale:1m` —
  comfortable for a typical browser viewport. Wired into
  [`packages/cli/scripts/bundle-templates.mjs`](../../packages/cli/scripts/bundle-templates.mjs)
  as `nowline --init --template showcase` alongside
  `minimal` / `teams` / `product`; round-tripped by
  [`packages/cli/test/convert/roundtrip.test.ts`](../../packages/cli/test/convert/roundtrip.test.ts).

**Consumer rewires:**

- `@nowline/embed`'s pipeline is now a thin shim that wraps
  `renderSource` / `parseSource` from `@nowline/browser`, preserves
  the Mermaid-shaped throwing-error contract, and keeps the
  page-scoped warn-once latch for skipped `include` directives.
  Auto-scan, the Mermaid surface (`render` / `parse` / `initialize` /
  `init` / `run`), the dev auth gate, the esbuild bundler, and the
  175 KB gzipped CI gate all stayed put.
- `@nowline/vscode-extension`'s render pipeline shrank to a
  Node-`fs`-backed `readFile` + `createAssetResolver(assetRoot)`
  forwarded to `renderSource`. The webview's `shell-html.ts` is now
  a small CSP-aware HTML wrapper that loads a bundled
  `preview-webview.js` script (produced by
  [`packages/vscode-extension/scripts/bundle.mjs`](../../packages/vscode-extension/scripts/bundle.mjs))
  which in turn calls `mountPreview` from `@nowline/preview-shell`.
  The host ↔ webview `postMessage` protocol is unchanged, so
  `extension.ts` handlers and the m3c integration tests don't shift.

## Decisions that locked in during implementation

- **Pluggable `readFile`, not a baked-in resolver.** The plan listed
  two seams: `readFile` (per-document include resolution) and
  `assetResolver` (per-render logo/asset lookup). Both are pluggable
  on `RenderOptions`; the embed passes `noOpIncludeReadFile`, the
  VS Code shim passes a `node:fs`-backed reader, and downstream
  browser surfaces (Free SPA) can plug in whatever they need. The
  alternative — a baked-in browser-only no-op — would have forced
  every browser host that wanted multi-file rendering to fork the
  pipeline.
- **`diagnostic-row.ts` adapters live in `@nowline/browser`, not in
  a sibling package.** `fromLexerError`, `fromParserError`,
  `fromLangiumDiagnostic`, `fromResolveDiagnostic`,
  `fromRenderWarning` are zero-VS-Code coupling and both consumers
  need them. A dedicated `@nowline/diagnostics` package would have
  bought nothing today and added one more publish target.
- **`@nowline/preview-shell` has no engine dependency.** The package
  takes pre-rendered SVG strings and `DiagnosticRow[]` from its
  consumer; it doesn't link `@nowline/core` / `@nowline/layout` /
  `@nowline/renderer`. That keeps the package usable in any browser
  app that wants a Nowline-shaped viewport without paying for the
  engine bundle when render happens server-side.
- **`vscode-jsonrpc` pinned to `8.2.0`.** `vscode-languageserver-protocol@3.17.5`
  expects exactly that minor; `vscode-jsonrpc@8.2.1` shipped a
  changed `ProtocolNotificationType` shape that broke
  `connection.sendRequest` overload resolution on the client side
  (`Argument of type 'ProtocolRequestType' is not assignable to
  parameter of type 'string'`). Pinning means the worker package is
  the only place in the workspace that pins the dep; everything else
  resolves via `vscode-languageserver-protocol`'s own peer.
- **CodeMirror is the documented client surface; integration is a
  consumer's job.** `client.ts` exports `didOpen` / `didChange` /
  `didClose` / `onDiagnostics` / `completion` / `hover` /
  `definition` / `references` as plain functions. Building the
  `@codemirror/lint` / `@codemirror/autocomplete` / `@codemirror/view`
  extensions on top of these is downstream wiring — the OSS package
  doesn't take a CodeMirror dep so it can also be consumed by Monaco,
  raw textareas, or whatever future browser editor lands.
- **In-process LSP test harness uses a hand-rolled `FakePort`, not
  happy-dom's `MessageChannel`.** happy-dom ships stub
  `MessagePort.postMessage` / `start` / `close` (every method body
  is a TODO — see [`lib/event/MessagePort.js`](../../packages/lsp-worker/node_modules/happy-dom/lib/event/MessagePort.js)
  in the installed dep). A 30-LOC `FakePort` pair driving each other's
  `onmessage` handler is the entire test contract `BrowserMessageReader` /
  `BrowserMessageWriter` actually exercise; running against the real
  thing waits for a Playwright follow-up.
- **Showcase template renders at `scale:1m`, not `scale:2w`.** First
  draft used `scale:2w` and produced a 2450 × 509 px SVG — too wide
  for a "typical browser viewport (~1000 × 600)" empty state. Bumping
  to `scale:1m` collapsed the timeline to 770 × 701 px without
  trimming any content. The DSL shape (two swimlanes + linear flow +
  one parallel + group + anchor + milestone) is exactly the plan's
  brief; only the time scale moved.

## What shipped

**Tests delivered:**

- [`packages/browser/test/pipeline.test.ts`](../../packages/browser/test/pipeline.test.ts)
  — 13 cases covering the noop-include path with warn callback,
  injected `readFile` resolving stub includes, the diagnostic union
  (parse error → `kind: 'diagnostics'`; render warning + strict false
  → `kind: 'svg' + warnings`; render warning + strict true →
  `kind: 'diagnostics'`), `assetResolver` injection threading through
  to `renderSvg`, and `idPrefix` isolation between renders.
- [`packages/preview-shell/test/mount.test.ts`](../../packages/preview-shell/test/mount.test.ts)
  — happy-dom suite covering `setSvg` injection, `setDiagnostics`
  switching to the diagnostics view, `fitPage` / `fitWidth` /
  `getZoom` / `setZoom` math, keyboard presets, minimap presence /
  click-to-recenter, and `dispose()` tearing the root down. A small
  `stubViewportDims` helper sets `clientWidth` / `clientHeight` on
  the mocked root since happy-dom doesn't compute layout.
- [`packages/lsp-worker/test/worker-roundtrip.test.ts`](../../packages/lsp-worker/test/worker-roundtrip.test.ts)
  — drives the worker through the `FakePort` pair: clean
  `initialize` with `TextDocumentSyncKind.Incremental`,
  `publishDiagnostics` after `didOpen` with malformed source, empty
  diagnostics after `didOpen` with valid source, and a runtime
  guard rejecting whole-document `didChange` (no range) with a
  thrown error.
- [`packages/cli/test/integration/cli.init.test.ts`](../../packages/cli/test/integration/cli.init.test.ts)
  — `--init --template showcase` integration test that asserts the
  scaffold's headline shape (two swimlanes, a `parallel`, a
  `group`, an `anchor`, a `milestone`) so a future template edit
  can't silently swap it for something smaller.
- [`packages/cli/test/convert/roundtrip.test.ts`](../../packages/cli/test/convert/roundtrip.test.ts)
  — `showcase.nowline` joined the allow-list so text → JSON → text
  and JSON → text → JSON round-trip cleanly on every PR.

**Bundle-size invariant:** `pnpm --filter @nowline/embed check-size`
stayed under the existing 175 KB gzipped gate after Slice B. No
budget-bump needed; the consolidation was net-zero in
publish-shape.

**Files that became thin shims:**

- [`packages/embed/src/pipeline.ts`](../../packages/embed/src/pipeline.ts)
  — was the full parse → render pipeline; now wraps
  `renderSource` / `parseSource` from `@nowline/browser`, preserving
  the embed's throwing-error contract and the page-scoped warn-once
  latch.
- [`packages/vscode-extension/src/preview/render-pipeline.ts`](../../packages/vscode-extension/src/preview/render-pipeline.ts)
  — was the VS Code-flavoured pipeline (validation, fs-include
  resolution, render warning interception); now provides a
  `node:fs`-backed `readFile` + `createAssetResolver(assetRoot)` and
  forwards to `renderSource`.
- [`packages/vscode-extension/src/preview/shell-html.ts`](../../packages/vscode-extension/src/preview/shell-html.ts)
  — was ~1000 LOC of inline HTML/CSS/JS; now a CSP-aware HTML
  wrapper that loads the bundled `preview-webview.js`.
- [`packages/embed/src/no-op-include-resolver.ts`](../../packages/embed/src/no-op-include-resolver.ts)
  and `packages/vscode-extension/src/preview/diagnostic-row.ts` were
  deleted; their exports now live in `@nowline/browser`.

## Carried forward — out of scope for this PR

- **Playwright cross-browser smoke for `@nowline/lsp-worker`.**
  happy-dom + `FakePort` is the contract test. Cross-browser parity
  (Chromium / Firefox / WebKit) is a follow-up once a public URL
  exists to point Playwright at, paralleling the same deferral in
  the m4 embed handoff.
- **CodeMirror / Monaco extension factories.** `@nowline/lsp-worker/client`
  ships the LSP surface as plain functions; building
  `@codemirror/lint` / `@codemirror/autocomplete` / hover extensions
  on top is downstream wiring. The Free SPA will be the first
  consumer; the patterns it adopts will inform whether they belong
  in this package or stay external.
- **Theme bridges beyond VS Code.** `VSCODE_THEME_BRIDGE_CSS` ships
  in `@nowline/preview-shell`. React / Svelte / Tailwind wrappers
  are downstream — the package's CSS custom properties are the
  documented integration seam, and consumers paste in their own
  bridge stylesheet.
- **Pre-bundled grammars or a hand-rolled parser** to chase
  smaller bundle size. The 175 KB ceiling still has ~12 KB
  headroom; the 200 KB review trigger documented in the m4 handoff
  is the next escalation, not m4.7's responsibility.

## Carried forward — m4 close-out (separate PR)

m4.7 deliberately leaves m4's row in the milestones table open
because the prod CDN deploy (`embed.nowline.io`) hasn't actually
executed end-to-end yet. The follow-up that closes m4 is a small
release-cut PR:

1. Cut the next release tag — first release tag after `v0.2.5`.
2. Verify `curl -I https://embed.nowline.io/latest/nowline.min.js`
   returns 200 with the cache headers from `specs/embed.md` §
   Distribution.
3. Strike through the m4 row in [`specs/milestones.md`](../milestones.md)
   table and the `### m4 — Embed (browser bundle)` section header.
4. Move the "Carried forward" Firebase block in
   [`handoff-m4-embed.md`](./handoff-m4-embed.md) into "What
   shipped" with the release tag + release.yml run ID.
5. Refresh the stale `pending` lines in
   [`specs/embed.md`](../embed.md) Bootstrap-status and
   [`packages/embed/README.md`](../../packages/embed/README.md).

That PR is intentionally not bundled with m4.7 because (a) closing
m4 needs a successful production deploy as evidence, and (b) m4.7
should land without depending on the CDN deploy succeeding.

## Files to reference

- [`specs/milestones.md`](../milestones.md) § m4.7 — Original
  deliverables list.
- [`specs/architecture.md`](../architecture.md) — Workspace map and
  dependency graph (already updated as part of the m4.7 doc-only
  PR).
- [`specs/lsp.md`](../lsp.md) § Browser worker packaging — Wire
  protocol for `@nowline/lsp-worker`.
- [`specs/embed.md`](../embed.md) — `@nowline/embed` cross-references
  to `@nowline/browser`.
- [`packages/browser/package.json`](../../packages/browser/package.json),
  [`packages/preview-shell/package.json`](../../packages/preview-shell/package.json),
  [`packages/lsp-worker/package.json`](../../packages/lsp-worker/package.json)
  — Public API exports and dependency surface for each new package.
