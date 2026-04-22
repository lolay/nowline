# m2b Handoff — Layout + SVG

## Scope

Turn a parsed `.nowline` file into a picture. Add the layout engine (`@nowline/layout`), the SVG renderer (`@nowline/renderer`), the `nowline render` command (SVG only), and `nowline serve` (local live-reload preview). No other output formats — PNG, PDF, HTML, Markdown+Mermaid, XLSX, and MS Project XML all ship in m2c on top of the same positioned model and SVG renderer.

**Milestone:** m2b
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline` (continue the OSS monorepo from m1 / m2a)

m2 continues:

- **m2a (shipped)** — CLI scaffold + `validate` + `convert` + `init` + `version` + distribution pipeline
- **m2b (this handoff)** — `@nowline/layout` + `@nowline/renderer` + `nowline render` (SVG) + `nowline serve`
- **m2c** — all other output formats (PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML)

## What to Build

### 1. Monorepo Additions

Add `packages/layout` and `packages/renderer` alongside the existing `packages/core` and `packages/cli`:

```
nowline/
  packages/
    core/        # @nowline/core (m1)
    cli/         # @nowline/cli (m2a)
    layout/      # @nowline/layout — AST → positioned model (NEW)
    renderer/    # @nowline/renderer — positioned model → SVG string (NEW)
  grammars/
    nowline.tmLanguage.json
  examples/
```

Dependency graph (enforced, no sideways or upward imports):

```
@nowline/cli ─┬─▶ @nowline/renderer ─▶ @nowline/layout ─▶ @nowline/core
              └─▶ @nowline/core                                    ▲
                                                                   │
@nowline/cli also keeps its direct @nowline/core dependency from m2a for validate/convert/init.
```

Both new packages publish to npm under the shared monorepo version. Both must be browser-safe: no `fs`, no `path`, no `process`, no `Buffer`, no Node-only imports. This is non-negotiable because m3 (embed) and m5 (editor) both load the same code in the browser.

### 2. `@nowline/layout` — Positioning Engine

Takes an `@nowline/core` AST and produces the **positioned model** described in `specs/rendering.md` § The Positioned Model. Pure computation; same output in Node and the browser given the same input.

**Inputs**

- A validated `NowlineFile` AST (the m1 AST, post include-resolution — m2b assumes the caller has already merged includes).
- A resolved theme (`light` or `dark`) and an optional explicit width. Theme selection collapses style defaults to a concrete color palette; everything else (spacing, corner radii, typography) is the same in both themes.

**Outputs**

A typed `PositionedRoadmap` containing every visual element listed in `specs/rendering.md` § The Positioned Model:

- Roadmap header (title, author, company-logo anchor + `logo-size` preset, Nowline attribution-mark anchor)
- Timeline scale (ticks, labels, thinning applied per the defaults in `specs/rendering.md` § Timeline Scale)
- Now-line x position (or `null` when today is outside range)
- Swimlane bands (recursive, with nested indentation via padding)
- Item bars (x, y, width from duration, height auto-computed from `text-size` + `padding` + content)
- Parallel regions, group regions (styled and unstyled distinguished)
- Anchors (diamonds at date x) with predecessor edges to referencing items
- Milestones (diamond in header + vertical cut line, fixed and floating)
- Dependency edges (orthogonal routing with rounded corners)
- Footnote indicators (superscript positions) and the footnote area below the chart
- Include regions (dashed border + label) for `roadmap:isolate` content
- Resolved styles on every entity (all 15 style properties from `specs/rendering.md` § Styles), computed via the precedence chain defined there

**Algorithms**

- **Duration → width** — positions and widths are derived from the roadmap's `scale:` (raw duration literal, default `1w`) and the configured calendar (`business` / `full` / `custom` — rules in `specs/dsl.md` § Calendar). The pixel-per-unit mapping is internal to layout; renderers do not recompute it.
- **Item sequencing** — within a swimlane, items flow left-to-right. An item's start x is the later of (the preceding item's end, the latest `after:` referent's end, zero). Anchors fix start points; `before:` constrains ends (with overflow rendered in red — layout emits a separate `overflow` geometry).
- **Parallel stacking** — children of a `parallel` block share an x-start and stack vertically with `spacing` between them. Region width = max child width. Groups inside parallel become sub-tracks.
- **Dependency routing** — orthogonal (Manhattan) paths with rounded corners per `specs/rendering.md` § Dependency Arrows. Keep edges separated when possible; allow routing under items when detours would be expensive. Output per-edge waypoint lists; renderers stroke them.
- **Include regions** — when the merged AST carries `roadmap:isolate` provenance (include resolver already records this in m1), the contained entities go inside a bounding rectangle with a region label.
- **Style resolution** — run the five-level precedence chain from `specs/rendering.md` § Style Precedence. Emit a resolved style per entity. Defaults-by-entity-type for `shadow` and `corner-radius` come from the tables in `specs/rendering.md`.

Layout is purely deterministic — same AST + same theme + same width ⇒ byte-identical positioned model. This property is what makes SVG diffs meaningful in tests.

### 3. `@nowline/renderer` — SVG Renderer

Takes a `PositionedRoadmap` and returns a single SVG string. Template-based (string composition); no SVG DOM, no external SVG library. Pure ESM.

**Shape**

```ts
export function renderSvg(model: PositionedRoadmap, options?: RenderOptions): Promise<string>;

export interface RenderOptions {
  theme?: "light" | "dark";
  width?: number;
  noLinks?: boolean;
  strict?: boolean;                  // promote asset warnings to errors
  resolveAsset?: AssetResolver;      // see architecture.md § Local Asset Resolution
  warn?: (message: string) => void;  // warning sink (default: console.warn)
}

export type AssetResolver = (relPath: string) => Promise<AssetBytes | null>;
export interface AssetBytes { bytes: Uint8Array; extension: string; }
```

`renderSvg` is async because asset resolution is async. Callers that render logo-free roadmaps will never await anything real — the promise resolves synchronously on the microtask queue.

Implement each visual element from `specs/rendering.md` § SVG Renderer:

- Roadmap header with embedded Nowline attribution mark (the mark is inlined as a small `<g>` — no external fetches). The mark is a link to `nowline.io`.
- **Company logo** (when the roadmap declares `logo:`) — rendered to the left of the title per `specs/rendering.md` § Roadmap Header. SVG sources are parsed, sanitized (strip `<script>`, external `href`, `<foreignObject>`), namespaced (`nl-logo-*`), and inlined as a `<g>`. Raster sources (`.png`, `.jpg`/`.jpeg`, `.webp`) are emitted as `<image href="data:image/<type>;base64,...">`. Bytes come from the injected `AssetResolver` (see `specs/architecture.md` § Local Asset Resolution) — the renderer never touches the filesystem directly. Missing/unsupported/corrupt assets emit a warning and the header renders without the logo; `--strict` promotes warnings to errors.
- Timeline scale with grid lines, tick marks, label thinning per the defaults in `specs/rendering.md` § Timeline Scale.
- **The now-line** — red vertical line, label "now", rendered with highest z-order among vertical lines. Omitted when today falls outside the range. This is the hero visual — get it right first.
- Item bars with status dots (the five built-in colors + neutral for custom), progress fill from `remaining`, link icons pattern-matched per `specs/rendering.md` § Item Bars, label chiclets, footnote superscripts.
- Swimlane bands with alternating subtle tints, PlantUML-style frame-tab labels, thin horizontal separator lines between siblings, nested swimlane indentation via inherited padding.
- Anchors (diamonds) and their Gantt-style predecessor lines.
- Milestones — diamond in header + solid vertical cut line; fixed vs. floating behavior per `specs/rendering.md` § Milestones; items extending past a fixed milestone's date render their overflow in red.
- Dependency arrows — stroke the orthogonal waypoint lists from layout. Rounded corners at bends.
- Footnotes — superscripts on referenced entities + numbered footnote area below the chart with description auto-styling (one step smaller, normal weight, same font).
- Include regions — dashed border, region label with external-link badge.
- Themes — `light` and `dark`. Theme is passed in via options; layout already baked resolved colors into the positioned model, so the renderer is "dumb" about palette.

**SVG hygiene**

- Deterministic ID generation for elements that need `id` (filters, gradients, arrow markers). Output is byte-stable across runs for the same input.
- No external font references. Emit the full font stack from the `font` preset (see `specs/rendering.md` § Font Presets) in the `font-family` attribute.
- All link icons are inlined as `<path>`s; no `<image href>` for icons, no data URIs for icons. The single exception is the roadmap company logo when the resolved source is a raster image (PNG/JPEG/WEBP) — that one intentionally uses `<image href="data:...;base64,...">` per the Roadmap header bullet above.
- Drop shadows use `<feDropShadow>` for `subtle`/`fuzzy`; `hard` is a duplicate shape offset behind the original.
- `viewBox` and explicit `width` / `height` attributes on the root `<svg>`; width and height are the computed canvas dimensions (or the caller-supplied width with proportional height).

### 4. `nowline render` (SVG only)

Wire the full command surface from `specs/cli.md` § `nowline render`, but reject non-SVG formats with a clear "available in m2c" message:

```
nowline render <input> [options]

Options:
  -o, --output <path>    Output file path (default: stdout)
  -f, --format <fmt>     Output format: svg (default: svg) — png/pdf/html/mermaid/xlsx/msproj in m2c
  -t, --theme <name>     Theme: light, dark (default: light)
  -w, --width <px>       Output width in pixels (default: auto-fit)
  --no-links             Omit link icons from output (still renders the text)
  --strict               Promote render warnings (including missing logo assets) to errors
  --quiet                Suppress non-error output
```

Behavior:

- **Pipeline** — `parseSource` (reuse m2a's `packages/cli/src/core/parse.ts`) → include-resolve (m1) → `layoutRoadmap` → `renderSvg` (with a Node `AssetResolver` rooted at the input file's directory; see `specs/architecture.md` § Local Asset Resolution). Validation errors exit 1 with the same diagnostic formatter `nowline validate` uses.
- **stdout default** — SVG to stdout when `-o` is absent, so `nowline render roadmap.nowline | pbcopy` works per `specs/cli.md` § Piping and Composability.
- **Binary-output guard** — the m2a stub in `packages/cli/src/io/write.ts` refuses binary payloads to a TTY. SVG is text, so m2b doesn't trip it; the stub is kept as-is for m2c.
- **stdin** — `nowline render -` reads `.nowline` from stdin for composability.
- **Unsupported formats** — `-f png` (and friends) exits 2 with "Format 'png' is not yet available in this release (ships in m2c)." Keep the flag parsing so scripts written against `specs/cli.md` fail with a helpful message rather than an unknown-flag error.
- **Exit codes** — unchanged from m2a (0 / 1 / 2 / 3).

### 5. `nowline serve`

Match the surface in `specs/cli.md` § `nowline serve`:

```
nowline serve <input> [options]

Options:
  -p, --port <n>         Port number (default: 3000)
  --open                 Open browser automatically
```

Behavior:

- Start a minimal HTTP server on `--port`. Serve:
  - `GET /` — an HTML shell that loads the SVG and opens a WebSocket (or server-sent-events — both are fine; pick one and stick with it).
  - `GET /render.svg` — current SVG.
  - `GET /events` (or `/ws`) — reload channel.
- Watch the input file with `fs.watch` (or `chokidar` if `fs.watch` proves flaky). On change: re-parse, re-layout, re-render; push a reload event; page either replaces the SVG in-place (preferred — preserves scroll) or does a full reload. On parse/validation error: push the diagnostic list to the page and render it as an overlay so the user sees the error text without tabbing back to the terminal.
- `--open` launches the default browser via the platform-appropriate command (`open` on macOS, `xdg-open` on Linux, `start` on Windows). Failure to open is a warning, not an error.
- The serve binary is Node-only (uses `http`, `fs.watch`). It must not be imported into the embed/editor bundles — guard by confining all Node imports to `packages/cli/src/commands/serve.ts`.
- **Exit codes** — 0 on clean shutdown (Ctrl-C), 2 when the input file disappears or becomes unreadable, 3 when the port is in use (report the port and exit; do not retry).

The watcher intentionally does not implement hot-module-replacement semantics — the SVG is small, and swapping a single `<svg>` element is both simpler and less surprising than HMR.

### 6. Themes

`light` and `dark` — implemented per `specs/rendering.md` as theme-conditional defaults baked into layout's style resolution. Same 15 style properties, same precedence chain, different built-in palette. A `style:` reference on an entity continues to win over the theme default. Document the two palettes in `packages/renderer/README.md`.

### 7. Performance Targets

These are not hard gates for m2b but are the thresholds we aim to maintain:

- Parse + layout + render a 100-item roadmap in **< 100 ms** on an M-series MacBook.
- Parse + layout + render on every file change in `nowline serve` in **< 150 ms** end-to-end (file change → browser repaint), so the loop feels live.
- Binary size ceiling from m2a (< 60 MB) still applies. Layout + renderer together should add no more than **~3 MB** to the compiled binary.

### 8. Tests

Use Vitest across all packages. Add:

- **`@nowline/layout` unit tests** — fixed inputs → assertions on key coordinates (item x/y/width for each m1 example), now-line x for a pinned fake `today`, dependency edge waypoints, include-region bounding boxes, style resolution (one test per precedence level), theme difference (identical geometry, distinct resolved colors).
- **`@nowline/renderer` unit tests** — snapshot the SVG for each m1 example and a curated set of edge fixtures (empty swimlane, single-child parallel, before-constraint overflow, dark theme, `--no-links`, out-of-range now-line, SVG-logo inlined, PNG-logo data-URI, missing-logo warning, `logo-size:xl` header bump, SVG-logo with `<script>` stripped). Commit snapshots; PRs that change them must be intentional.
- **`nowline render` integration tests** — spawn the built binary (same pattern m2a uses for the CLI integration tests), render each m1 example, assert exit 0 and non-empty SVG. A parse-error input must exit 1 with diagnostics on stderr. Unsupported-format input (e.g. `-f png`) must exit 2 with the "ships in m2c" message.
- **`nowline serve` integration tests** — spawn the binary, hit `/render.svg`, assert 200 + SVG body. Mutate the input file, wait for the reload event, re-fetch, assert the body changed. Shut down cleanly on SIGTERM. (Gate on `process.env.CI !== 'true' || process.platform !== 'win32'` if the Windows runner has fs-watch flakiness — document the skip.)
- **Determinism test** — render every m1 example twice (same input, same theme, same width) and assert byte-identical SVG. Regression guard for accidental non-determinism (random IDs, date-dependent output, map iteration order).
- **Distribution smoke test** — after each `bun compile`, run `<binary> render examples/minimal.nowline` in CI and assert exit 0 + SVG on stdout + the binary is still under 60 MB on disk.

### 9. Documentation

- `packages/layout/README.md` — brief overview, inputs/outputs, algorithm notes for the three non-obvious bits (sequencing, parallel stacking, orthogonal routing), how to run tests.
- `packages/renderer/README.md` — what it emits, deterministic-output guarantees, theme palettes, known limitations (no font downloads, no external resources), how to regenerate SVG snapshots.
- `packages/cli/README.md` — append `render` and `serve` sections. Document the m2c deferred formats with the exact exit-code/message behavior.
- Update the root `README.md` install table's "What you get" column to mention `render` and `serve` alongside `validate` / `convert` / `init`.

## What NOT to Build

- No PNG, PDF, HTML, Markdown+Mermaid, XLSX, or MS Project XML output (m2c)
- No interactive HTML+SVG hybrid renderer (m5 editor canvas)
- No drag-and-drop, selection, or two-way sync (m5)
- No browser embed script (m3)
- No GitHub Action (m3)
- No LSP server or IDE extensions (m4)
- No theme system beyond `light` / `dark` — no user-defined themes in m2b

m2b is **layout engine + SVG renderer + `render` (SVG only) + `serve`**. The output is a pair of new npm packages and two new commands on the existing `nowline` binary. The distribution pipeline from m2a does not change.

## Key Specs to Read

| Spec | What to focus on |
|------|------------------|
| `specs/rendering.md` | The positioned model, every visual element, the style precedence chain, SVG renderer behavior, font presets and shadow/corner-radius defaults, the now-line, orthogonal arrow routing, include-region visuals |
| `specs/cli.md` | `nowline render` + `nowline serve` surfaces; theme names; piping/composability examples that must keep working |
| `specs/architecture.md` | Package dependency graph, technology choices, build and release (unchanged from m2a) |
| `specs/dsl.md` | Scale/calendar semantics that drive the timeline; style properties — layout/renderer must implement all 15 |
| `specs/principles.md` | "Text is the source of truth" — render must never mutate the input or the AST |
| `specs/features.md` § m2b | Features 12, 19, 22, 23, 24, 25, 26, 27, 28 |
| `specs/milestones.md` | m2b/m2c split and dependency chain |
| `specs/handoffs/m2a.md` § Resolutions | CLI UX stack (citty, chalk, consola, @clack/prompts, @babel/code-frame), `$nowlineDiagnostics` envelope, `.nowlinerc` behavior — all reused by `render` and `serve` |

## Definition of Done

- [ ] `packages/layout` and `packages/renderer` exist and publish to npm under the shared monorepo version
- [ ] Dependency graph enforced: `@nowline/layout → @nowline/core`, `@nowline/renderer → @nowline/layout`, `@nowline/cli → @nowline/renderer`. No sideways or upward imports.
- [ ] Both new packages are browser-safe (no Node-only imports). Verified with a build that bundles them for the browser.
- [ ] Layout emits the complete positioned model in `specs/rendering.md` § The Positioned Model for all three m1 example files
- [ ] SVG renderer produces deterministic output (byte-identical across runs) for all three m1 example files in both themes
- [ ] `roadmap logo:` renders next to the title for all four supported formats (`.svg`, `.png`, `.jpg`, `.webp`); `logo-size:` presets scale as specified in `specs/rendering.md`; SVG sources are sanitized; missing/unsupported logos emit a warning and the header still renders; `--strict` turns those warnings into a non-zero exit
- [ ] `nowline render` supports `-o`, `-f svg`, `-t light|dark`, `-w`, `--no-links`, `--strict`, `--quiet`; stdin works; stdout is the default; validation failures exit 1 with diagnostics
- [ ] `nowline render -f png` (and other m2c formats) exits 2 with an informative "ships in m2c" message
- [ ] `nowline serve` starts, serves the SVG, live-reloads on file change, and shuts down cleanly on Ctrl-C
- [ ] Unit tests for layout cover sequencing, parallel stacking, dependency routing, style precedence, and theme palette
- [ ] SVG snapshot tests for each m1 example in both themes; a `--no-links` variant; an out-of-range now-line variant
- [ ] `nowline render` and `nowline serve` integration tests spawn the built binary and assert exit codes + output shape
- [ ] The compiled `bun compile` binary remains under 60 MB on all six targets
- [ ] Release workflow still produces working binaries + npm packages + `.deb` assets + Homebrew formula update (pipeline unchanged from m2a)
- [ ] `packages/layout/README.md`, `packages/renderer/README.md`, and the updated `packages/cli/README.md` are in place; root `README.md` mentions `render` and `serve`

## Open Questions for m2b

1. **Dependency edge routing algorithm.** Options: (a) naive Manhattan from source to target with rounded corners, letting overlaps happen; (b) channel-based routing with vertical lanes between swimlane rows; (c) force-directed offsets to separate parallel edges. (a) is simplest and ships; (b) is what dagre/cytoscape do for orthogonal layouts; (c) is overkill. Recommendation: (a) for m2b, revisit if it looks bad on real roadmaps. Whatever we pick should produce deterministic output.
2. **Font rendering fidelity.** The renderer emits a font stack only — no embedded/downloadable fonts — so item bar widths that wrap text depend on the viewer's resolved font. This is fine for SVG (scales to available space) but will matter for PDF in m2c. Decide whether to measure text with a bundled font metric (e.g., Inter metrics shipped alongside the renderer) or defer that to m2c when we actually need fixed pixel dimensions.
3. **"Today" source.** Layout needs a `today` input to place the now-line. Options: (a) `new Date()` at render time (non-deterministic); (b) explicit `--today YYYY-MM-DD` flag with `new Date()` as default; (c) a separate "layout is deterministic, renderer injects today" split. Recommendation: (b) — the flag defaults to today but is overridable for reproducible CI renders and for snapshot tests. Snapshot tests pin `today`.
4. **Serve transport.** WebSocket vs. server-sent events. WS is slightly more ceremony; SSE is a single `fetch`. We only need server→client, so SSE is a natural fit and lets us skip `ws`. Recommendation: SSE in m2b; revisit for m5 editor if bidirectional traffic is needed.
5. **Live-reload update strategy.** Full page reload vs. swap `<svg>` in place. In-place swap preserves scroll position and is nicer for "tweak the text, watch the picture move," but is slightly more code. Recommendation: in-place swap, with a full reload as the fallback when the page script is missing (robustness against older cached pages).
6. **`nowline serve` behavior on validation errors.** Options: (a) keep the last good SVG visible, overlay diagnostics; (b) replace the SVG with a red error panel; (c) show both side by side. (a) is less disruptive for the "typing while watching" workflow. Recommendation: (a).
7. **Include resolution source of truth.** m1's include resolver produces a merged AST. Layout should consume the merged AST but also needs include-provenance to render dashed `roadmap:isolate` regions. Confirm the merged AST carries enough metadata (source file URI per node) and, if not, expose a small side-channel from `@nowline/core` before wiring it into layout. This is the one m1 dependency that might surface a gap.
8. **Theme handling location.** Two valid designs: (a) layout resolves all colors per theme, renderer is dumb about palette; (b) layout resolves "theme roles" (e.g. `bg:surface-1`), renderer maps roles → hex per theme. (a) is simpler, (b) makes a third theme later additive. Recommendation: (a) for m2b; if users ask for custom themes, the upgrade to (b) is mechanical.
9. **CLI piping consistency.** `nowline render - -o -.svg` is nonsensical. Decide whether stdin+stdout is the default when neither is specified, whether `-` always means "the other stream," and whether SVG on stdout should be followed by a trailing newline (matters for `| pbcopy` workflows on macOS, which strips trailing newlines some tools add). Capture the decision in `packages/cli/README.md` the same way m2a did for exit codes.
10. **SVG logo sanitization library.** Two options: (a) a small in-house tokenizer/walker that strips the known-dangerous nodes (`<script>`, `<foreignObject>`, external `href`, `xlink:href`, inline `on*` attributes); (b) pull in `dompurify` with an SVG profile. (a) is zero-dep and keeps `@nowline/renderer` browser-safe out of the box but is security-sensitive code we maintain. (b) is well-tested but ships ~20 KB into the browser bundle. Recommendation: (a) with a very tight allow-list (only the SVG elements and attributes we expect in a company logo) rather than a deny-list, behind a short `sanitizeSvg()` helper with its own unit tests. Whichever we pick, log the choice in `packages/renderer/README.md`.
11. **Asset root / path escape policy for the Node resolver.** Decide the exact rule: (a) the input file's directory is the implicit root and `..` that escapes it is an error; (b) the input file's directory is the root, `..` is allowed, but paths outside the nearest `.git` / `.nowlinerc` ancestor are an error; (c) explicit `--asset-root <dir>` flag on `nowline render` with (a) as the default when the flag is absent. Recommendation: (c). Errors here are warnings by default, errors under `--strict`.

These can be resolved during implementation. Answers should be captured in the `@nowline/layout`, `@nowline/renderer`, and updated `@nowline/cli` READMEs, and appended to this handoff in a `## Resolutions` section (following the pattern set by `specs/handoffs/m2a.md`).
