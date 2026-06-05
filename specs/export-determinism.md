# Nowline — Export Determinism

## Precedent

**Every surface that exports a roadmap produces byte-for-byte identical
output for the same source, the same render inputs, and the same pinned
toolchain version.** A `.nowline` file exported to PDF from the CLI, the VS
Code extension, the `@nowline/mcp` server, the Free web app, or the Pro web
app yields the same bytes — same SHA-256. The same holds for SVG, PNG, HTML,
Mermaid, XLSX, MS Project XML, and canonical JSON.

This is a hard design precedent, not an aspiration. New surfaces inherit it;
they do not get to re-implement export.

## Why this is achievable

Three properties of the existing engine make byte-identity tractable rather
than a fight against the runtime:

1. **Text layout is a deterministic approximation, not font-metric
   measurement.** `@nowline/layout` and `@nowline/renderer` size text with a
   fixed `text.length * fontSize * 0.58` em-ratio (see
   `packages/layout/src/nodes/item-node.ts`,
   `packages/renderer/src/svg/render.ts`). No surface calls
   `canvas.measureText()` or reads real glyph advances during layout, so the
   **SVG geometry is identical in every JS environment**. This is the
   linchpin: had layout measured real fonts, browser-vs-Node divergence would
   make byte-identity effectively impossible.

2. **The format exporters are already reproducible by construction.**
   `@nowline/export-pdf` pins `CreationDate` / `ModDate` / `/ID` / `Producer`
   to `inputs.today`; `@nowline/export-xlsx` pins workbook timestamps and runs
   a `normalizeZipTimestamps()` pass to remove per-entry zip nondeterminism.
   Neither calls `new Date()` in the output path.

3. **Dates and locale are explicit inputs, not ambient reads.** `today` and
   `locale` are threaded through `layoutRoadmap`; date formatting is forced to
   `timeZone: 'UTC'`. Nothing in the export path reads the system clock,
   system time zone, or `navigator.language`.

So the problem is not "make the exporters deterministic" — it is "make every
surface run the *same* deterministic code with the *same* inputs."

## Invariant

> Output bytes are a pure function of `(source, render inputs, pinned
> toolchain version)`. The host environment contributes **I/O only** — never
> a single byte of the artifact.

Anything a surface does beyond *getting the source in* and *getting the bytes
out* is a determinism leak and a precedent violation.

## The shared kernel: `@nowline/export`

All eight formats are produced by one package, `@nowline/export`
(`packages/export/`). It owns the full pipeline — parse → resolve includes →
layout → `renderSvg` → format exporter — and is the **only** code path to an
exported artifact. No surface re-implements any stage.

The kernel is runtime-agnostic. It takes a `HostEnv` for the few things that
legitimately differ between environments, and every implementation of that
interface must return identical bytes:

```ts
interface HostEnv {
  readSource(path: string): Promise<string>;      // include + asset text reads
  readAsset(path: string): Promise<Uint8Array>;    // logos, icons
  loadWasm(): Promise<ArrayBuffer>;                // resvg.wasm bytes
}

interface RenderInputs {
  today: Date;             // explicit UTC midnight — never Date.now()
  locale: string;          // explicit — never navigator.language / system
  theme: ThemeName;
  fonts: ResolvedFontPair; // pinned font byte buffers — see Contract
  // format-specific options (pageSize, orientation, margin, pngScale, …)
}

function exportDocument(
  source: string,
  format: ExportFormat,
  inputs: RenderInputs,
  host: HostEnv,
): Promise<Uint8Array>;
```

Today this pipeline exists twice — the CLI's `produce()` and the VS Code
extension's `packages/vscode-extension/src/export/in-process.ts`. Extracting
`@nowline/export` collapses them into one implementation so they can no longer
drift; each surface's host glue shrinks to a thin `HostEnv`.

## Determinism contract

Every surface emitting a **canonical** export must pin all of the following.
Deviating on any row forfeits the byte-identity guarantee for that export.

| Axis | Rule |
|------|------|
| **Rasterizer** | `@resvg/resvg-wasm` on every surface — including the CLI and the browser apps. WASM execution is bit-reproducible across hosts; native `@resvg/resvg-js` is not (CPU/SIMD variance) and cannot run in a browser. Browser `<canvas>` rasterization is **banned** for canonical export — it uses the host browser's SVG renderer and system fonts. |
| **Fonts** | Canonical export embeds the **bundled** font bytes (DejaVu sans/mono from `@nowline/export-core`), identical SHA on every surface. Bundled DejaVu is the default; system-font probing requires an explicit `--use-system-fonts` opt-in and forfeits the guarantee (see Non-goals). |
| **`today` / now-line** | Always an explicit `Date` argument (UTC midnight). No surface calls `new Date()` / `Date.now()` in the export path. |
| **Locale** | Explicit string; defaults to a fixed canonical locale, never the host's. |
| **Toolchain version** | All surfaces pin the **same** `@nowline/*`, `@resvg/resvg-wasm`, `pdfkit`, and `exceljs` versions. Byte-identity is scoped *per release*; the version is part of the contract, not incidental. |
| **Line endings** | LF for every text format (SVG, HTML, Mermaid, MS Project XML, JSON). |
| **Document metadata** | PDF `CreationDate`/`ModDate`/`/ID`/`Producer` and XLSX workbook + zip timestamps pinned to `inputs.today` (already implemented; the contract makes it mandatory). |

## Surfaces

| Surface | Runtime | How it achieves byte-identity |
|---------|---------|-------------------------------|
| `@nowline/cli` | Node / Bun binary | Imports `@nowline/export` directly; Node `HostEnv`. Switches `@nowline/export-png` from native `@resvg/resvg-js` to `@resvg/resvg-wasm`. |
| `@nowline/mcp` (OSS) | Node (`npx`) | Imports `@nowline/export` directly, fully in-process — **no CLI shell-out** (see [`mcp.md`](./mcp.md)). Same runtime, same `HostEnv` as the CLI. |
| `vscode-extension` | Node (extension host) | Imports `@nowline/export`; the existing `in-process.ts` becomes its thin `HostEnv`. The preview "Save PNG" path delegates to the kernel so it matches "Export…". |
| Free / Pro web apps | Browser | Import `@nowline/export`; browser `HostEnv` fetches `resvg.wasm` + bundled fonts. Canonical export uses `@resvg/resvg-wasm`, not `<canvas>`. Owned by [`lolay/nowline-app/specs/export-determinism.md`](https://github.com/lolay/nowline-app/blob/main/specs/export-determinism.md). |
| Cloud MCP / REST API | Go (`nowline-api`) | Cannot import the JS kernel (Go-only, single sanctioned subprocess). Achieves byte-identity structurally by shelling out to the **same pinned `nowline` CLI binary** that uses the kernel. Owned by [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md). |

The cloud surface is the one deliberate exception to "import the kernel": its
hard architectural rule is Go-everywhere with `nowline` as the only
subprocess, so it inherits byte-identity from the pinned CLI version rather
than re-implementing the pipeline.

## PNG rasterizer correction

`specs/architecture.md` historically described `@nowline/export-png` as "PNG
via `@resvg/resvg-js` (WASM)" with "no native addons". That label was
inaccurate: `@resvg/resvg-js` is a native NAPI `.node` addon. This precedent
makes the label true by moving every surface — CLI included — to
`@resvg/resvg-wasm`. The measured cost (spike, m-export-determinism) is
≤ 1.76 % of pixels differing in sub-pixel anti-aliasing; dimensions, colors,
layout, and text positions are identical. WASM is also strictly *more*
reproducible than native code, so this trade buys determinism rather than
spending it.

## The ICU caveat

`@nowline/layout` formats timeline tick labels with
`date.toLocaleString(locale, { timeZone: 'UTC' })`. `Intl` / `toLocaleString`
depends on the **ICU/CLDR data bundled in each JS engine** — Node, Bun, and
browsers can ship different ICU versions, which can change a month
abbreviation or quarter label for some locales. That would diverge the SVG
*text content itself*, upstream of rasterization. True cross-engine
byte-identity therefore requires replacing `Intl`-based date formatting in
layout with a small self-contained formatter (or pinning ICU data). This is
the only place where the engine, not the code, leaks into the bytes; the
implementation plan treats it as a prerequisite, not an afterthought.

The gate (below) measures this empirically: it classifies each cell as
ICU-dependent or not by re-exporting with `toLocaleString` stubbed, and only
records a `browser` override where the browser's bytes *actually* diverge from
Node's. Under the current pinned toolchain (Node 26 + Chromium) **no cell
diverges** — the bundled CLDR data agrees — so the gate asserts full
cross-engine byte-identity for the whole fixture set today. The caveat stands
as a latent risk: the day an engine ships different CLDR data, the gate turns
red and the divergence is recorded as a pinned `browser` override rather than
silently absorbed.

## The PDF compression caveat

PDFKit compresses each content stream with `FlateDecode`, which runs through
the **host runtime's zlib**. Bun's zlib and Node's zlib emit different — both
valid — compressed bytes for identical input, so the `bun compile` CLI binary's
PDF is not byte-identical to the kernel-in-Node PDF. This is the one
binary↔Node divergence on the Node surfaces; every other format is identical
across the compiled binary and the kernel. The gate records it as a pinned
`cli` override per `pdf` cell rather than hiding it, and asserts the override
still differs from the Node bytes — so if a future change makes the kernel's
PDF deflate runtime-independent (a fixed `zlib` build, or `compress:false`),
the now-stale override turns the gate red and is dropped in the re-baseline.

## Enforcement

A cross-surface golden-file gate, not a hope. The fixture set
(`packages/integration-tests/determinism/`) is run through three surfaces:

- **(a)** the compiled `bun compile` CLI binary — what users actually run;
- **(b)** the kernel in Node — the canonical bytes;
- **(c)** the kernel in a headless browser (Vitest browser mode +
  Playwright/Chromium) — the same `@resvg/resvg-wasm` raster path behind both
  "Export… → PNG" and "Copy as PNG", so one browser PNG hash covers both.

For every fixture × format the gate computes a SHA-256 and asserts:

1. the kernel-in-Node bytes (b) match the checked-in `node` golden — the
   toolchain-version regression detector;
2. the compiled binary (a) equals the Node bytes — except the recorded `cli`
   overrides (every `pdf`; see § The PDF compression caveat), which stay pinned
   and must still diverge;
3. the live ICU-dependence classification matches the stored `icu` flag, so a
   cell can never silently change category;
4. the browser bytes (c) equal the Node bytes for every clean cell, and equal a
   recorded `browser` override where the deferred Intl leak makes them diverge
   (none today; see § The ICU caveat).

The goldens live in
`packages/integration-tests/determinism/hashes.json`, checked in and bumped
only as a deliberate, reviewed act on a toolchain-version change
(`make determinism-update`). The gate runs as a **dedicated CI job**
(`make determinism` + `make determinism-browser`), kept out of the multi-OS
unit-test matrix on purpose: it needs a compiled binary (Bun) and a browser
(Playwright), and the binary-format goldens (pdf/png) are pinned per toolchain
version in one canonical environment rather than per OS.

**Source-path normalization.** Two exporters echo the source path into their
bytes — the JSON serializer (`file.uri`) and the PDF `Subject`. That path is an
*input*, not engine output, and is machine-specific (`/Users/you/…` vs
`/home/runner/…`), so the gate strips the volatile directory (keeping the
stable basename) from every artifact before hashing, uniformly on all surfaces.
Every other byte is compared verbatim. This keeps the checked-in goldens
portable across checkouts and CI without weakening the cross-surface
comparison.

## Non-goals and explicit opt-outs

- **System fonts.** A user may pass `--use-system-fonts` (or `--font-sans` /
  `--font-mono`) to render with installed system fonts. This is an explicit
  opt-in that forfeits the byte-identity guarantee, because system font files
  differ across machines. The default — bundled DejaVu — is the canonical,
  reproducible path. System fonts are never probed unless the user opts in.
- **Browser `<canvas>` quick-grab.** The Free/Pro preview toolbar's "Save PNG"
  may continue to offer a fast `<canvas>` rasterization as a *non-canonical*
  convenience, clearly distinct from canonical export. It is never the
  artifact the determinism gate checks.
- **Cross-version identity.** Byte-identity holds within a single pinned
  toolchain version. A different `@nowline/*` release may legitimately change
  bytes; that is what the checked-in golden hashes record.

## Copy semantics

The distinction between canonical and non-canonical is most visible in the
VS Code extension's copy actions.

| Action | Output | Canonical? | Mechanism |
|--------|--------|-----------|-----------|
| **Copy SVG** (toolbar) | Engine SVG string | Yes | Webview posts engine-rendered SVG to extension; extension writes it via `env.clipboard`. The SVG equals `nowline -f svg`. |
| **Copy PNG** (toolbar, happy path) | Canvas rasterization | **No** | Webview rasterizes via `<canvas>` and calls `navigator.clipboard.write()` directly (no extension host round-trip). VS Code's `env.clipboard` is text-only, so the host cannot write image bytes. This is the documented non-canonical exception. |
| **Copy PNG fallback** (temp file written when clipboard unavailable) | Kernel PNG | Yes | Extension calls `exportInProcess(..., 'png', ...)`, which uses the kernel + `@resvg/resvg-wasm`. Matches `Nowline: Export… → PNG` byte-for-byte. |
| **Save PNG** (toolbar "Save" button) | Kernel PNG | Yes | Same `exportInProcess` path; canvas bytes from the webview are discarded. |
| **Export… → PNG** (command palette) | Kernel PNG | Yes | `exportInProcess` pipeline. |

The in-clipboard PNG on the happy path is the **only** non-canonical output in
the entire VS Code surface. It is non-canonical by necessity (not by design),
and it is clearly labelled as such in [`specs/ide.md`](./ide.md).

## Cross-references

- Kernel placement + dependency graph: [`architecture.md`](./architecture.md)
- OSS MCP in-process surface: [`mcp.md`](./mcp.md)
- Font resolution chain: `packages/export-core/src/fonts/resolve.ts`
- Web app surfaces: [`lolay/nowline-app/specs/export-determinism.md`](https://github.com/lolay/nowline-app/blob/main/specs/export-determinism.md)
- Cloud MCP / API surfaces: [`lolay/nowline-api/specs/mcp.md`](https://github.com/lolay/nowline-api/blob/main/specs/mcp.md)
