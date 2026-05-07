# m2c Handoff — Export Formats

## Scope

Complete the verbless render command (m2b.5) by adding every output format beyond SVG: **PNG, PDF, HTML, Markdown+Mermaid, XLSX, and MS Project XML.** Each format is an adapter on top of the positioned model from m2b — PNG rasterizes SVG, PDF walks the positioned model, HTML embeds SVG, Mermaid transpiles the AST, XLSX reshapes the AST into sheets, MS Project XML projects the AST into tasks. No new CLI commands, no new grammar. Seven new packages — one per format plus a shared `@nowline/export-core` — keep Node-only dependencies off the browser path, let third-party consumers install only the formats they use, and make the tiny / full CLI distribution split a package-list decision rather than a code refactor.

**Milestone:** m2c
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline` (continue the OSS monorepo from m1 / m2a / m2b)

m2 continues:

- **m2a (shipped)** — CLI scaffold + `validate` + `convert` + `init` + `version` + distribution pipeline
- **m2b (shipped)** — `@nowline/layout` + `@nowline/renderer` + `nowline render` (SVG) + `nowline serve`
- **m2b.5 (shipped)** — verbless CLI redesign (`nowline <input>` is render; `--serve`, `--init`, `--dry-run` mode flags)
- **m2c (this handoff)** — all other render formats (PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML)

## What to Build

### 1. Monorepo Additions

Add **seven** packages: one shared `@nowline/export-core` plus one package per format. Keep `@nowline/renderer` SVG-only and browser-safe; Node-only libraries and WASM blobs live in the per-format export packages. The split is deliberate — see Resolutions § 1 for the reasoning, but the short version is: granular consumer installs (an embed site that only wants Mermaid should not pull in resvg WASM or ExcelJS), independent release cadences (resvg / PDFKit / ExcelJS major bumps don't force majors on unrelated consumers), smaller CVE blast radius per consumer, and — crucially for this milestone — it makes the tiny/full CLI split in § 11 a package-list choice rather than a code restructuring.

```
nowline/
  packages/
    core/              # @nowline/core (m1)
    layout/            # @nowline/layout (m2b)
    renderer/          # @nowline/renderer (m2b) — SVG only, browser-safe, no heavy deps
    export-core/       # @nowline/export-core (NEW) — shared types, font resolver,
                       #   asset-resolver wrapper, unit converter. Node-only, zero
                       #   heavy deps. Every export-* package depends on this.
    export-png/        # @nowline/export-png      (+ @resvg/resvg-js ~6 MB WASM)
    export-pdf/        # @nowline/export-pdf      (+ pdfkit + fontkit ~2.5 MB)
    export-html/       # @nowline/export-html     (pure strings, zero heavy deps)
    export-mermaid/    # @nowline/export-mermaid  (pure strings, zero heavy deps)
    export-xlsx/       # @nowline/export-xlsx     (+ exceljs ~3 MB)
    export-msproj/     # @nowline/export-msproj   (pure strings, zero heavy deps)
    cli/               # @nowline/cli (m2a/m2b)
  grammars/
    nowline.tmLanguage.json
  examples/
```

Dependency graph (enforced, no sideways or upward imports):

```
                                ┌──▶ @nowline/export-png     ──┐
                                ├──▶ @nowline/export-pdf     ──┤
                                ├──▶ @nowline/export-html    ──┤
@nowline/cli ──▶ @nowline/export-core ──▶ @nowline/renderer ──▶ @nowline/layout ──▶ @nowline/core
                                ├──▶ @nowline/export-mermaid ──┤                            ▲
                                ├──▶ @nowline/export-xlsx    ──┤                            │
                                └──▶ @nowline/export-msproj  ──┘                            │
                                                                                            │
@nowline/cli ─────────────────────────────────────────────────────────────────────────────► @nowline/core
```

Concrete rules:

- Every `@nowline/export-*` package depends on `@nowline/export-core` (shared types and font/asset utilities) and on *only* the layers it actually consumes:
  - `export-png` and `export-html` — depend on `@nowline/renderer` (they consume SVG).
  - `export-pdf` — depends on `@nowline/layout` (walks the positioned model directly; does not consume SVG).
  - `export-mermaid`, `export-xlsx`, `export-msproj` — depend on `@nowline/core` and `@nowline/layout` (walk AST + include-resolved data).
- `@nowline/export-core` depends on nothing heavier than `@nowline/core` and `@nowline/layout` (for type imports). No `@resvg/*`, no `pdfkit`, no `exceljs`. The shared core stays light so any consumer picking one format pays only for that format's deps plus the common core.
- Heavy deps are **direct** dependencies of the specific export-* package that needs them — not hoisted into `export-core` — so `npm install @nowline/export-mermaid` does not touch resvg or ExcelJS.
- All seven packages publish to npm under the shared monorepo version (lockstep versioning, same as m1/m2a/m2b). Lockstep is a deliberate simplification for m2c; switching to independent versions is a follow-up if a consumer asks for it.
- `@nowline/renderer` stays browser-safe (no change from m2b). Of the export packages, only `@nowline/export-html` *could* be browser-safe (pure string concatenation); treat it as Node-only for m2c and revisit if m3 needs a browser bundle of it.

The CLI depends on all seven packages by default. The tiny/full CLI split (§ 11) drops individual export packages from the tiny binary's import list rather than touching any source code.

### 2. Export-Package Surfaces

Shared types and utilities live in `@nowline/export-core`; every format-specific package exports exactly one `export*` function. Consumers import only the packages they use.

```ts
// @nowline/export-core — shared types, font resolver, asset-resolver wrapper,
//   unit converter. Imported by every @nowline/export-* package and by @nowline/cli.
import type { PositionedRoadmap } from '@nowline/layout';
import type { NowlineFile, ResolveResult } from '@nowline/core';

export interface ExportInputs {
    model: PositionedRoadmap;   // from @nowline/layout
    ast: NowlineFile;           // original AST (needed for XLSX / Mermaid / MSProj)
    resolved: ResolveResult;    // include-resolved data (for XLSX sheet joins)
    sourcePath: string;         // '<stdin>' when piped
}

// PDF page-size types live in export-core so CLI flag parsing can validate them
// without having @nowline/export-pdf in the tiny-build dep list.
export type PdfPageSize =
    | { kind: 'preset'; name: PdfPresetName }
    | { kind: 'custom'; width: PdfLength; height: PdfLength }
    | { kind: 'content' };

export type PdfPresetName =
    // Imperial (ANSI / US)
    | 'letter'   //  8.5 x 11    in   (default)
    | 'legal'    //  8.5 x 14    in
    | 'tabloid'  // 11   x 17    in  (ANSI B portrait)
    | 'ledger'   // 17   x 11    in  (ANSI B landscape)
    // Metric (ISO 216)
    | 'a5' | 'a4' | 'a3' | 'a2' | 'a1'
    | 'b5' | 'b4' | 'b3';

export type PdfLengthUnit = 'pt' | 'in' | 'mm' | 'cm';
export interface PdfLength { value: number; unit: PdfLengthUnit; }

// Font resolver — see § 10.
export interface ResolvedFont { /* …see § 10… */ }
export function resolveFonts(options: { fontSans?: string; fontMono?: string; headless?: boolean }):
    Promise<{ sans: ResolvedFont; mono: ResolvedFont }>;
```

```ts
// @nowline/export-png
import type { ExportInputs } from '@nowline/export-core';
export interface PngOptions { scale?: number; /* default 2 */ background?: string; }
export function exportPng(inputs: ExportInputs, svg: string, options?: PngOptions): Promise<Uint8Array>;
```

```ts
// @nowline/export-pdf
import type { ExportInputs, PdfPageSize, PdfLength } from '@nowline/export-core';
export interface PdfOptions {
    title?: string;
    author?: string;
    pageSize?: PdfPageSize;                           // default { kind: 'preset', name: 'letter' }
    orientation?: 'portrait' | 'landscape' | 'auto';  // default 'auto'
    margin?: PdfLength;                               // default { value: 36, unit: 'pt' }
}
export function exportPdf(inputs: ExportInputs, options?: PdfOptions): Promise<Uint8Array>;
```

```ts
// @nowline/export-html
import type { ExportInputs } from '@nowline/export-core';
export interface HtmlOptions { title?: string; embedAssets?: boolean; /* default true */ }
export function exportHtml(inputs: ExportInputs, svg: string, options?: HtmlOptions): Promise<string>;
```

```ts
// @nowline/export-mermaid
import type { ExportInputs } from '@nowline/export-core';
export interface MermaidOptions { lossyComment?: boolean; /* default true */ }
export function exportMermaid(inputs: ExportInputs, options?: MermaidOptions): string;
```

```ts
// @nowline/export-xlsx
import type { ExportInputs } from '@nowline/export-core';
export interface XlsxOptions { includeHiddenColumns?: boolean; }
export function exportXlsx(inputs: ExportInputs, options?: XlsxOptions): Promise<Uint8Array>;
```

```ts
// @nowline/export-msproj
import type { ExportInputs } from '@nowline/export-core';
export interface MsProjOptions { projectName?: string; startDate?: string; /* YYYY-MM-DD */ }
export function exportMsProjXml(inputs: ExportInputs, options?: MsProjOptions): string;
```

Contract (applies to every export-* package):

- Each function is deterministic given the same `inputs + options` and the same pinned `today`. Timestamps that would break determinism (e.g. PDF `CreationDate`) are set from `inputs.ast` metadata or a caller-injected override, not `new Date()`.
- Binary outputs return `Uint8Array`; text outputs return `string`. Callers handle stdout/TTY guards — export packages are IO-agnostic.
- No function ever writes to disk. All IO stays in `@nowline/cli`.
- Every export package re-exports its own options type under a stable name so CLI code and third-party consumers can `import type { PdfOptions } from '@nowline/export-pdf'` without crossing into the format's implementation module.

**CLI import strategy.** `@nowline/cli` imports the six format packages via **dynamic `import()`** from the `render` command's format-dispatch switch, not via static top-level `import` statements. This keeps the tiny/full CLI split clean: the tiny binary is produced by a `bun compile` pass that declares `@nowline/export-pdf`, `@nowline/export-xlsx`, `@nowline/export-mermaid`, `@nowline/export-html`, and `@nowline/export-msproj` as excluded, and the dynamic import sites fail at runtime with a "this format requires nowline-full" error rather than at build time. The full binary includes every export package and every dynamic import resolves successfully.

### 3. PNG — SVG → raster via resvg-js (WASM)

- `@nowline/export-png` declares `@resvg/resvg-js` as a direct dependency (WASM build). Dynamic-load the WASM inside `exportPng()` itself so even importing `@nowline/export-png` at the module level doesn't evaluate the WASM blob until PNG is actually invoked.
- Pipeline: `renderSvg(model)` → `resvg.render(svg, { fitTo: { mode: 'width', value: scale * model.width }, background })` → PNG bytes.
- Default `scale: 2` (retina). `--scale N` on the CLI overrides.
- Fonts: resolve via `resolveFonts()` (see § 10) and register the returned TTF bytes into resvg's `fontdb` before calling `render()`. Register once per process; reuse across invocations. Do **not** let resvg call its own `load_system_fonts()` — we control the stack ourselves so PNGs are reproducible.
- Deterministic: resvg is deterministic for a fixed input + fixed loaded fonts; document the pinned resvg version in `packages/export-png/README.md`.
- Size budget: resvg-js adds ~6 MB; the tiny CLI builds (§ 11) include `@nowline/export-png` because SVG + PNG is the common-case "visual output" pair, so the tiny binary absorbs this cost. Heavier deps (PDFKit, ExcelJS) are gated into the full build.

### 4. PDF — positioned model → vector PDF via PDFKit

- Depend on `pdfkit`. Walk the `PositionedRoadmap` the same way the SVG renderer does; each emitter has a one-to-one PDF counterpart (`<rect>` → `doc.rect()`, `<path>` → `doc.path()`, `<text>` → `doc.text()` with the resolved font, shadow filters → PDFKit's `fillOpacity` + offset re-draws).
- **Page sizing.** Default is **US Letter (8.5 × 11 in)**. Authors can pick any combination of:
  - A **named preset**, either imperial (`letter`, `legal`, `tabloid`, `ledger`) or metric / ISO 216 (`a5`, `a4`, `a3`, `a2`, `a1`, `b5`, `b4`, `b3`). Names are case-insensitive.
  - A **custom size** with an explicit unit suffix: `8.5x11in`, `210x297mm`, `21x29.7cm`, `612x792pt`. The width/height separator is a lowercase `x`. Mixing units in one expression is rejected with a clear error.
  - **`content`** — the page adopts the content's own dimensions (rendered bounding box + `--margin`). No scaling — a 100-inch-wide roadmap produces a 100-inch-wide PDF. This is for digital viewing where "paper" is irrelevant and the whole chart should be visible in one page at 1:1. `content` wins over `--orientation` (the page's aspect is the content's aspect).
    - Why not `fit`? Every other print/export tool uses "fit" to mean *shrink content to fit a fixed page*, which is the opposite of what this does. `content` reads as "the page size is the content size" with no ambiguity.
- **Orientation.** `--orientation` takes `portrait`, `landscape`, or `auto` (default). `auto` inspects the content's rendered aspect ratio: content wider than tall flips to landscape; taller than wide stays portrait. Explicit `portrait` / `landscape` override. Ignored when `--page-size content` is in effect.
- **Margin.** `--margin` takes a unit-tagged length (`36pt`, `0.5in`, `10mm`, `1cm`); default `36pt` (≈ 0.5 in). Applied symmetrically on all four sides. Respected for both fixed sizes and `content`.
- **Scaling.**
  - With a **fixed page** (preset or custom): content box is centered inside `(page − 2 × margin)`. If the content at 1:1 pixels-to-points is wider or taller than the available area, scale uniformly down to fit (aspect-preserving); never scale up (a tiny roadmap stays tiny rather than bloating to fill the page).
  - With **`--page-size content`**: no scaling, ever. The page *is* the content. A 10-in-wide roadmap → 10-in page; a 100-in-wide roadmap → 100-in page. PDF readers handle zoom; the file just has to carry the right dimensions.
- No pagination — single page per roadmap in m2c. Pagination is a follow-up if fixed-page content routinely overflows.
- **Unit conversion.** Everything resolves to PDF points (1 pt = 1/72 in) before handoff to PDFKit: `pt = pt`, `in = pt × 72`, `mm = pt × 2.83465`, `cm = pt × 28.3465`. The conversion lives in `@nowline/export-core/src/units.ts` (shared so CLI flag parsing can validate `--margin` and `--page-size` custom dimensions without importing `@nowline/export-pdf`). Unit tests cover each direction.
- **Validation.** Unknown preset → exit 2 with a list of valid names. Malformed custom size (missing unit, non-numeric, mixed units, zero/negative) → exit 2 with a pointer at the malformed token. Margin larger than half the page → exit 2 ("margin consumes the entire page"). All errors cite the CLI flag that caused them.
- Fonts: resolve via `resolveFonts()` (see § 10) and call `doc.registerFont('sans', bytes)` / `doc.registerFont('mono', bytes)` per run (not process-wide, so tests stay isolated). PDFKit embeds a subset of each registered font automatically — only the glyphs actually used, with a randomized subset tag, matching Pages/Keynote/Numbers behaviour.
- Vector output, not a raster of the SVG. The positioned model's geometry is the source of truth; the PDF is a separate rendering pipeline that shares no string generation with the SVG path.
- Deterministic: pin the PDFKit version; set `info.CreationDate` / `info.ModDate` from `inputs.ast` or `options.today` (not `new Date()`); set `/ID` from a hash of the input bytes so identical inputs produce identical `%PDF-...` outputs byte-for-byte.

### 5. HTML — self-contained page embedding the SVG

- One HTML document containing:
  - The SVG inlined inside a centered container.
  - A minimal `<style>` block controlling page background (matches selected theme's chart surface), max-width, and print rules (`@media print { ... }` so `Ctrl/Cmd+P` from the HTML yields a usable print).
  - A small `<script>` that enables pan + zoom (mouse wheel, drag) on the SVG. Keep to ~100 LOC, no framework.
  - Page title = roadmap title; `<meta name="generator" content="nowline <version>">` for provenance.
- Output is a single string — no external resources, no remote fonts, no CDN. `options.embedAssets` defaults to `true` so raster logos remain embedded; `false` shortens the file at the cost of portability.
- Works when opened as `file://…` — no same-origin issues.

### 6. Markdown+Mermaid — transpile AST → Mermaid `gantt`

- Walk the **merged AST** (from `resolveIncludes()`), not the positioned model — Mermaid rounds to its own scheduling, so pixel coordinates are irrelevant.
- Emit a Markdown file with:
  - `#` heading = roadmap title.
  - Optional description paragraph from `roadmap description` if present.
  - A single fenced ` ```mermaid ... ``` ` block containing a `gantt` diagram.
  - A trailing comment (Mermaid-style `%%`) listing Nowline features that were dropped (labels, footnotes, `remaining`, `owner`, nested swimlanes beyond one level, parallel/group semantics beyond date math).
- Mapping (per `specs/rendering.md` § Markdown+Mermaid Bridge):
  - Swimlanes → `section` blocks. Only the top level; nested swimlanes flatten with a dotted name.
  - Items → tasks: `id :status, startRef, duration` where `status` is Mermaid's `done`/`active`/`crit`/nothing based on the closest Nowline equivalent.
  - `after:` → Mermaid's `after id` clause. Multi-after uses Mermaid's space-separated syntax when supported, otherwise falls back to the latest predecessor only and records the loss in the trailing comment.
  - Anchors with `date:` → `milestone` entries.
  - Milestones → `milestone` entries with an explicit `:milestone, date, 0d` form.
  - `labels:`, `footnote`, `remaining:`, `owner:`, `before:`, `parallel`, `group` → dropped; noted once in the trailing comment.
- Dates: if the roadmap has a `start:`, compute absolute dates for each task and emit them; otherwise emit relative `after:` references only. Mermaid tolerates both.

### 7. XLSX — ExcelJS workbook

- Depend on `exceljs`. Follow the five-sheet layout in `specs/rendering.md` § XLSX Export exactly (Roadmap / Items / Milestones / Anchors / People and Teams).
- Formatting:
  - Excel Tables on Items / Milestones / Anchors / People and Teams with auto-filters.
  - Freeze the header row on every data sheet.
  - Auto-fit column widths based on content; cap at ~60 characters for descriptions.
  - Conditional formatting on the Status column per the spec (green/blue/yellow/red/gray).
- Semicolon-delimit multi-value cells (`after`, `before`, `labels`) so the workbook opens cleanly in Excel, Numbers, and Google Sheets.
- Embed the roadmap's `generated` timestamp from `inputs.ast` or `options.today` — never `new Date()` — so snapshot tests are byte-stable. ExcelJS writes a deterministic zip entry order when given the same input.
- No chart sheet in m2c — the stacked-bar Gantt view is deferred (feature 18's note).

### 8. MS Project XML — lossy export for PM tool import

- Emit Microsoft Project's XML format (`<?xml …?>` + `<Project xmlns="http://schemas.microsoft.com/project">`). This is the only export that goes through MS Project's own import path and has to honor its schema; validate against MSProject's XSD if one is available.
- Mapping (per `specs/rendering.md` § Output Formats MS Project XML row):
  - Items → `<Task>`.
  - Swimlanes → summary `<Task>` entries with `Summary=true`; items under them get `OutlineLevel` bumped.
  - Groups → nested summary tasks.
  - `parallel` → sibling tasks sharing a predecessor.
  - `after:` → `<PredecessorLink>` with `Type=1` (FS).
  - Milestones → tasks with `Milestone=true` and `Duration=0`.
  - `owner:` → `<Resource>` + `<Assignment>`.
  - `labels:`, `footnote`, `style:`, `bracket`, `progress` overflow, etc. → dropped; log an explicit "lossy export" note to stderr so the user knows.
- Dates: MS Project needs absolute start dates. When the Nowline roadmap is purely relative, use `options.startDate` (or the `--start` CLI flag defaulting to today) to anchor everything. Document that the export is not round-trippable.
- Output is a string; the caller writes it as UTF-8 with a BOM (MSProject accepts both, but the BOM helps some Windows tools).

### 9. CLI Wiring — extend the default render mode

`packages/cli/src/commands/render.ts` (the verbless render handler from m2b.5) already parses `-f`. m2b/m2b.5 rejects every non-`svg`/`json`/`nowline` value. In m2c:

- Accept `svg, png, pdf, html, mermaid, xlsx, msproj` (plus alias `ms-project`). Reject anything else with the m2a-style "unknown format" error (exit 2).
- Format resolution precedence:
  1. Explicit `-f` flag.
  2. `-o` extension (`.svg`, `.png`, `.pdf`, `.html`/`.htm`, `.md`/`.markdown`, `.xlsx`, `.xml`). `.xml` requires an explicit `-f msproj` since `.xml` is ambiguous; otherwise the CLI errors with a helpful message.
  3. Default `svg` (unchanged).
- Add the `-s, --scale N` flag documented in `specs/cli.md`. Only honored for PNG; warn and ignore on other formats.
- Add PDF page controls, only honored for `-f pdf` (warn and ignore on other formats):
  - `--page-size <value>` — preset name (`letter`, `legal`, `tabloid`, `ledger`, `a5`–`a1`, `b5`–`b3`), custom `WxHunit` (e.g. `8.5x11in`, `210x297mm`, `21x29.7cm`, `612x792pt`), or `content` (page = content dimensions; no scaling, no page ceiling). Default `letter`.
  - `--orientation <portrait|landscape|auto>` — default `auto`. Ignored with `--page-size content`.
  - `--margin <length>` — unit-tagged (`36pt`, `0.5in`, `10mm`, `1cm`). Default `36pt`.
  - Extend `.nowlinerc` keys the same way m2a did for `theme` / `width`: `pdfPageSize`, `pdfOrientation`, `pdfMargin`. CLI flags override config.
- Add font-resolver controls (honored for `-f pdf` and `-f png`; silently ignored for text formats):
  - `--font-sans <path|alias>` / `--font-mono <path|alias>` — explicit override. An absolute path wins immediately; aliases (`sf`, `segoe`, `dejavu`, `helvetica`, `arial`, `liberation`, `noto`, `ubuntu`, `cantarell`, `menlo`, `consolas`) short-circuit the platform probe list for that role.
  - `--headless` — skip the system-font probe and go straight to the bundled DejaVu pair. Used by tests, CI, and deterministic pipelines. Implied by `NOWLINE_HEADLESS=1`.
  - Environment: `NOWLINE_FONT_SANS`, `NOWLINE_FONT_MONO`, `NOWLINE_HEADLESS`. CLI flag > env > `.nowlinerc` > probe > bundled.
  - `.nowlinerc` keys: `fontSans`, `fontMono`, `headlessFonts` (boolean).
- stdout rules:
  - Text formats (SVG, HTML, Mermaid, MS Project XML): allowed on stdout. No trailing newline (consistent with m2b's m2a-compatible decision).
  - Binary formats (PNG, PDF, XLSX): refuse to write to a TTY. The m2a stub in `packages/cli/src/io/write.ts` already guards this — extend the error message to point users at `-o <file>` (curl-style). Binary to a piped stdout is allowed (for `nowline … -f png -o - | imgcat` etc.).
- stdin rules: `nowline -` reads `.nowline` from stdin for every format. No change from m2b/m2b.5.
- Add `--start YYYY-MM-DD` for MS Project anchoring (specific to that format; error when passed with any other `-f`).
- Validation failures still exit 1. Asset/font warnings behave per m2b: warn by default, exit 1 under `--strict`.
- Reuse the m2b render pipeline (`parseSource → resolveIncludes → layoutRoadmap → renderSvg`) and then branch on format after the SVG is in hand (PNG/HTML/PDF can share the SVG; Mermaid/XLSX/MSProj skip the renderer and go straight from AST to exporter).

### 10. Asset Resolution and Fonts

**Logos.** Continue to use m2b's `AssetResolver` unchanged. PNG re-uses the sanitized inline copy for SVG logos and streams raster logos through as base64 data URIs exactly like the SVG renderer does — resvg loads inline data URIs without a network fetch.

#### Font strategy — system first, one bundled fallback

The design is **system fonts where present, one bundled headless fallback when not**. On a dev machine the PDF/PNG looks native (SF Pro on macOS, Segoe UI on Windows, distro default on Linux); in CI, Docker, and any compiled binary shipped somewhere font-bare the resolver drops straight through to the single bundled DejaVu pair. One code path, no platform-conditional test matrices.

**Resolution order** (`packages/export-core/src/fonts/resolve.ts`). Each role (`sans`, `mono`) runs the five-step resolver independently and stops at the first step that succeeds:

1. **Explicit flag** — `--font-sans <path|alias>` / `--font-mono <path|alias>`.
2. **Environment** — `NOWLINE_FONT_SANS` / `NOWLINE_FONT_MONO`.
3. **Headless override** — `--headless` or `NOWLINE_HEADLESS=1`. Skips the probe list and goes straight to step 5. The resolver also auto-selects this path when it detects `CI=true` with no TTY unless the user has opted out via `.nowlinerc`.
4. **Platform probe list** — walk the table below, `fs.existsSync` on each entry, first hit wins. Cached per process (`serve` resolves once on startup; CLI invocations resolve fresh so tests stay isolated).
5. **Bundled fallback** — `packages/export-core/assets/fonts/DejaVuSans.ttf` and `DejaVuSansMono.ttf`. These are the only two TTFs we ship, and they live in `@nowline/export-core` so every format that consumes fonts picks up the same bytes.

**Platform probe list.** The resolver carries `{ path, face? }` tuples — collections (`.ttc`) need the face selected explicitly.

*macOS:*

| Role | Path | Notes |
|---|---|---|
| sans | `/System/Library/Fonts/SFNS.ttf` | Variable font; pre-instance via fontkit at `wght: 400` and `wght: 700` before handing bytes to PDFKit / resvg. |
| sans (fallback) | `/System/Library/Fonts/Helvetica.ttc` | Faces `Helvetica`, `Helvetica-Bold`. |
| sans (fallback) | `/System/Library/Fonts/Supplemental/Arial.ttf` | |
| mono | `/System/Library/Fonts/SFNSMono.ttf` | Static, multi-weight. |
| mono (fallback) | `/System/Library/Fonts/Menlo.ttc` | Faces `Menlo-Regular`, `Menlo-Bold`. |
| mono (fallback) | `/System/Library/Fonts/Monaco.ttf` | |

*Windows* (use `process.env.WINDIR ?? 'C:\\Windows'` and `path.join`; never hardcode backslashes):

| Role | Path |
|---|---|
| sans | `%WINDIR%\Fonts\segoeui.ttf` (+ `segoeuib.ttf` bold, `segoeuii.ttf` italic) |
| sans (fallback) | `%WINDIR%\Fonts\arial.ttf` (+ `arialbd.ttf`, `ariali.ttf`) |
| sans (fallback) | `%WINDIR%\Fonts\tahoma.ttf` / `verdana.ttf` |
| mono | `%WINDIR%\Fonts\consola.ttf` (+ `consolab.ttf`) |
| mono (fallback) | `%WINDIR%\Fonts\cour.ttf` (Courier New) |

*Linux* (spans Debian/Ubuntu, Fedora, Arch, and user trees — nothing is guaranteed, which is precisely why the bundled fallback exists):

| Role | Path |
|---|---|
| sans | `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` (Debian/Ubuntu) |
| sans | `/usr/share/fonts/dejavu/DejaVuSans.ttf` (Fedora) |
| sans | `/usr/share/fonts/TTF/DejaVuSans.ttf` (Arch) |
| sans | `/usr/share/fonts/liberation/LiberationSans-Regular.ttf` |
| sans | `/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf` |
| sans | `/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf` |
| sans | `/usr/share/fonts/ubuntu/Ubuntu-R.ttf` |
| sans | `/usr/share/fonts/cantarell/Cantarell-Regular.otf` |
| sans (user) | `$XDG_DATA_HOME/fonts/**` (default `~/.local/share/fonts`) |
| sans (user) | `~/.fonts/**` (legacy) |
| mono | `…/DejaVuSansMono.ttf` → `LiberationMono-Regular.ttf` → `UbuntuMono-R.ttf` → `NotoSansMono-Regular.ttf` |

User-local trees (`$XDG_DATA_HOME/fonts`, `~/.fonts`) are probed by filename rather than walked — we only look for the specific filenames above, not arbitrary fonts the user may have installed. Keeps the resolver fast and predictable.

**Variable-font handling (SFNS.ttf).** SF Pro ships as a continuous-axis VF on macOS 10.15+. PDFKit wants a fixed instance. The resolver pre-instances through fontkit:

```ts
import fontkit from '@foliojs-fork/fontkit';
const font = fontkit.openSync('/System/Library/Fonts/SFNS.ttf');
const regular = font.getVariation({ wght: 400 }); // bytes for registerFont
const bold    = font.getVariation({ wght: 700 });
```

Instancing happens once per resolver call and produces stable byte output across macOS point releases where Apple may shift the VF's default axis location. SF Pro has no italic axis on the bundled file; PDFKit falls back to a skew transform for italics, which reads correctly in a roadmap. Older macOS (10.14 and below) shipped `SFNSText.ttf` + `SFNSDisplay.ttf` — out of support, not probed; the resolver falls through to Helvetica.

**Bundled fallback.** Ship exactly two files under `packages/export-core/assets/fonts/`: `DejaVuSans.ttf` (~740 KB) and `DejaVuSansMono.ttf` (~330 KB). Total ~1.1 MB, carried by `@nowline/export-core` so every format picks up the same bytes. Bold / italic are synthesized by PDFKit's faux-bold + skew when the real face isn't present; acceptable for a roadmap tool. Bold / oblique real faces can be added later if users complain, behind a one-line config change.

**Licensing.**

- **DejaVu** — ship `packages/export-core/assets/fonts/LICENSE-DejaVu.txt` next to the TTFs and reference it in `packages/export-core/README.md`. The DejaVu license (Bitstream Vera + public-domain additions) is MIT-compatible; redistribution is allowed with notice.
- **SF Pro / SF Mono** — embedded only when rendering **on macOS**. PDFKit embeds a subset (only the glyphs actually used, with a randomized subset tag), the same mechanism Apple's own Pages, Keynote, and Numbers use when exporting to PDF. Apple's EULA restricts redistribution of the font files themselves, not artifacts rendered from them — the PDF case is materially the same as rendering to a PNG, which nobody questions. If Apple ever objects, the one-line fix is to drop `SFNS.ttf` / `SFNSMono.ttf` out of the probe list; Helvetica / Menlo are already next in line and the rest of the pipeline doesn't change. Document this explicitly in `packages/export-core/README.md` under "Fonts — licensing notes".
- **Segoe UI / Consolas** — same argument applies on Windows (EULA covers the file, not rendered artifacts; Arial / Courier New are the drop-in fallbacks).
- **Linux system fonts** (DejaVu, Liberation, Noto, Ubuntu, Cantarell) — all ship under SIL OFL or similarly liberal licenses; nothing additional to include.

**Resolver API.**

```ts
export interface ResolvedFont {
    name: string;                                  // 'DejaVu Sans', 'SF Pro', etc.
    bytes: Uint8Array;                             // full TTF, ready for PDFKit / resvg
    source: 'flag' | 'env' | 'headless' | 'probe' | 'bundled';
    path?: string;                                 // undefined for bundled / in-memory VF slices
    face?: string;                                 // for .ttc collections
}
export function resolveFonts(options: {
    fontSans?: string;
    fontMono?: string;
    headless?: boolean;
}): Promise<{ sans: ResolvedFont; mono: ResolvedFont }>;
```

Both exporters call `resolveFonts()` from `@nowline/export-core` so PDF and PNG stay in lockstep on the resolved stack. `--strict` turns a bundled-fallback path (i.e. the resolver landed at step 5 while not explicitly headless) into a warning — the export still succeeds, so CI without system fonts isn't forced into `--headless` — but the stderr line makes it obvious the render was unstyled.

**Why this design and not the alternatives.**

- Bundling every variant costs ~3–4 MB per platform and gives the same pixels no matter what the author's roadmap actually needs. Most authors want SF Pro / Segoe UI when they run locally.
- System-only fails on Alpine, slim Docker images, trimmed server installs, and most CI runners — exactly the environments where determinism matters most.
- The hybrid costs 1.1 MB, renders natively on dev machines, and stays deterministic everywhere else with one flag (`--headless`) or one env var.

### 11. Tiny and Full CLI Distribution

> **Status:** Superseded by [`specs/cli-distribution.md`](../cli-distribution.md). Empirical measurements after m2k showed the bun runtime is ~92% of the compiled binary, the full set of optional exporters adds only ~5 MB, and removing PNG saves only ~3.4 MB. The two-tier split was paying ~5% size dividend for the cost of doubled CI matrix, two Homebrew formulas, two npm packages, and a parallel release/distribution channel. We now ship a single `nowline` binary (~70 MB) with every export format. The dynamic `import()` dispatch pattern documented below is preserved — the door for a future tiered split stays open if a profile change ever justifies one. Section retained as a historical decision record.

Ship **two** compiled CLI binaries on every platform, produced from the same `@nowline/cli` source by toggling which export packages are bundled:

| Build | Formats included | Extra packages vs. m2a | Approx. binary size |
|---|---|---|---|
| `nowline` (tiny, default) | `svg`, `png` | `@nowline/export-core`, `@nowline/export-png` | ~50 MB (m2a ~45 + resvg-js ~6) |
| `nowline-full` | tiny **+** `pdf`, `html`, `mermaid`, `xlsx`, `msproj` | adds `@nowline/export-pdf`, `-html`, `-mermaid`, `-xlsx`, `-msproj` | ~58–62 MB |

**Rationale for this split.** SVG is the native roadmap output; PNG is how most users share roadmaps (Slack, email, PR attachments, docs). That pair covers the common case and wants to be in the default binary. PDF, HTML, Mermaid, XLSX, and MS Project XML are workflow-specific (handed to executives, embedded in existing docs, piped to PM tools) — users who need them will happily download a separate `nowline-full` build. The split keeps the default download lean and leaves room under the 60 MB ceiling for future features without forcing a re-shuffle. PNG stays in tiny rather than falling back to "pipe SVG through `rsvg-convert`" because (1) our `exportPng()` resolves fonts through the same pipeline as the rest of the CLI (§ 10) and embedded logos through the same asset resolver / `sanitizeSvg()` path, so PNG is byte-reproducible across platforms in the same way SVG is; (2) external converters substitute fonts against whatever is on the user's system (Arial / Helvetica where we picked SF Pro), and their librsvg version drifts, neither of which we can control; (3) Windows has no first-class `librsvg`-based CLI in winget / Chocolatey / Scoop — the "just install `rsvg-convert`" story doesn't hold on the platform where installing extras is hardest. Trade-off accepted: ~6 MB of the ~50 MB tiny binary goes to resvg-js WASM. See Resolution § 5 for the full rejected-alternatives list (SVG-only tiny, three-tier split, runtime format downloads, fat single binary).

**How the split is produced.** One source tree, one CLI entry point, one test suite — the difference is a compile flag. `packages/cli/build/tiny.ts` and `build/full.ts` each call `bun build --compile --external <excluded packages>` with different externals lists:

```
tiny  : externals = ['@nowline/export-pdf', '@nowline/export-html',
                     '@nowline/export-mermaid', '@nowline/export-xlsx',
                     '@nowline/export-msproj']
full  : externals = []   (all seven export-* packages bundled)
```

The CLI's format dispatch uses dynamic `import()` (see § 2) so excluded packages fail at runtime when the user asks for them, not at build time. The runtime error is:

```
nowline: the 'pdf' format is not available in this build.
Install 'nowline-full' from https://github.com/lolay/nowline/releases or:
  npm install -g @nowline/cli-full
```

**How the binaries are distributed.**

- Release workflow: matrix step produces `nowline-<os>-<arch>` (tiny) and `nowline-full-<os>-<arch>` (full) side-by-side. Both get attached to the same GitHub Release.
- Homebrew: two formulas, `nowline` (tiny) and `nowline-full`. Installing `nowline-full` replaces / conflicts with `nowline`.
- Scoop (Windows): two manifests, `nowline` and `nowline-full`.
- `.deb`: two packages with `Conflicts: nowline | nowline-full` so `apt` won't install both side-by-side.
- npm: `@nowline/cli` (tiny, default) and `@nowline/cli-full` (full). `@nowline/cli-full` has a dependency on every `@nowline/export-*` package; `@nowline/cli` depends only on `@nowline/export-core` + `@nowline/export-png`.

**CI coverage.** The compile smoke in `.github/workflows/ci.yml` and `release.yml` runs both variants for every OS/arch target:

- Tiny smoke: `nowline --version`, `nowline examples/minimal.nowline -o -` (SVG), `nowline examples/minimal.nowline -f png -o /tmp/m.png` (PNG), `nowline examples/minimal.nowline -f pdf -o /tmp/m.pdf` → assert exit 2 + the "nowline-full" error message.
- Full smoke: same as tiny plus `-f pdf`, `-f html`, `-f mermaid`, `-f xlsx`, `-f msproj` all exit 0 with non-empty output.

**Binary-size ceiling.** 60 MB for tiny (unchanged from m2a); 65 MB for full. If the tiny binary ever breaches 60 MB, the next move is re-evaluating what belongs in it — m2c does not pre-commit to a third tier or a new name. The two-tier split is the shape we're shipping and the one we'll defend.

**Why not one tiered binary with runtime downloads.** Rejected because it defeats the "single binary, no network at runtime" story m2a established. Users who want PDF shouldn't need to think about whether their build environment has network egress.

### 12. Performance Targets

Not hard gates, but target for a 100-item roadmap on an M-series MacBook:

- SVG render — same m2b target (< 100 ms).
- PNG — < 500 ms end-to-end (includes WASM init amortized; steady-state subsequent calls < 250 ms).
- PDF — < 500 ms.
- HTML — < 100 ms (it's ~SVG plus a fixed prelude).
- Mermaid — < 50 ms (pure string work).
- XLSX — < 500 ms (ExcelJS workbook serialization is the long pole).
- MS Project XML — < 100 ms.
- Binary ceiling from m2a (< 60 MB) still applies. Add resvg-js + PDFKit + ExcelJS + bundled fonts — total estimate ~10–12 MB. If it goes over, see Resolution § 5 (tiny vs full build).

### 13. Tests

Use Vitest across all packages. Add:

- **Per-package export unit tests**, one test suite per `@nowline/export-*` package:
  - **PNG** — render each m1 + m2b example, hash the PNG output, commit the hashes. Re-renders byte-match. Separate tests assert header bytes (`\x89PNG\r\n\x1a\n`), dimensions equal `scale * model.width × scale * model.height`, and resvg emits no warnings on the stock fixtures.
  - **PDF** — render each example, hash the PDF. A small "PDF sanity" test checks the `%PDF-1.`-prefix, the object count is plausible, and `pdfjs` can round-trip it without errors (pull `pdfjs-dist` into `devDependencies` for the test only).
  - **HTML** — snapshot the full HTML string per example + theme. Smoke test that the embedded SVG round-trips through a real browser (Playwright optional; skip in CI if too heavy — document the skip).
  - **Mermaid** — snapshot the Markdown string per example. A separate test passes the emitted `mermaid` block through `@mermaid-js/mermaid-cli` (if already available) to assert it parses; gated on `mmdc` being on `PATH`.
  - **XLSX** — open each workbook with ExcelJS and assert sheet names, column headers, row counts, and conditional-format rules. Hash the zip contents for a "nothing drifted" regression check (ExcelJS is deterministic given the same input).
  - **MS Project XML** — snapshot the XML string per example; a secondary test validates it against the project schema using `libxmljs` (optional dev dep). At minimum, assert the root element and namespace are correct and every `<Task>` has a `UID`.
- **Determinism test** — re-export every format twice from the same input + same `today` and assert byte-identical output. Catches accidental `new Date()` leaks.
- **Font resolver tests** (`packages/export-core/test/fonts/resolve.test.ts`):
  - `--font-sans /abs/path.ttf` → resolver returns `source: 'flag'`, bytes match the file, probe list is not touched.
  - `NOWLINE_FONT_SANS` env → `source: 'env'`.
  - `--headless` → `source: 'headless'` (implementation-wise same bytes as `'bundled'`).
  - macOS probe list on a mocked filesystem: `SFNS.ttf` present → `source: 'probe'`, name `'SF Pro'`, bytes non-empty and parseable by fontkit; `SFNS.ttf` absent but `Helvetica.ttc` present → face `'Helvetica'`; both absent → bundled fallback.
  - Windows probe list with mocked `WINDIR` → first existing of `segoeui.ttf` / `arial.ttf` / `tahoma.ttf` wins.
  - Linux probe list → Debian, Fedora, and Arch DejaVu paths each resolve on their respective mocked filesystems; with nothing present → bundled fallback.
  - Variable font: stub `SFNS.ttf` with a real-ish VF test fixture, assert `getVariation({ wght: 400 })` produces stable bytes across two resolver calls (no timestamp / random tag in the output).
  - `--strict` + bundled-fallback path → resolver returns `source: 'bundled'` and the CLI emits a single stderr warning; without `--strict` the warning is silent.
  - Alias resolution: `--font-sans sf` on macOS resolves to `SFNS.ttf`; `--font-sans dejavu` on any platform resolves to the bundled file.
- **CLI integration tests** (verbless render — `nowline <input>`):
  - stdout via `-o -` + `-f svg` (regression from m2b/m2b.5).
  - `-o path.<ext>` for each format, with extension-inferred format.
  - `-f png` + `-s 3` writes a larger file than `-s 1`.
  - `-f xlsx` to a TTY refuses with the curl-style "binary output … refused" message.
  - `-f msproj` with no `--start` produces a valid XML with today's date; with `--start 2026-01-06`, the first task's start matches.
  - Ambiguous `.xml` extension without `-f msproj` exits 2 with the expected message.
  - `-f pdf --strict` with a missing logo exits 1 (inherits m2b's strict behavior).
- **Distribution smoke tests** — per § 11, compile smokes run **both** the tiny and full binaries for every OS / arch target. Tiny asserts `svg` + `png` succeed and `pdf` / `html` / `mermaid` / `xlsx` / `msproj` each exit 2 with the "nowline-full" error message. Full asserts every format exits 0 with non-empty output. Binary-size assertion: tiny ≤ 60 MB, full ≤ 65 MB, on all six targets.

### 14. Documentation

- `packages/export-core/README.md` — describe the shared surface: `ExportInputs`, `resolveFonts()`, unit converter, PDF page-size types. License notes for bundled DejaVu live here.
- `packages/export-<format>/README.md` (six files — png / pdf / html / mermaid / xlsx / msproj) — one page each: install, dependency used, options shape, known limitations, determinism notes, how to regenerate snapshots. The tiny vs. full note lives on `export-pdf` / `-html` / `-mermaid` / `-xlsx` / `-msproj` so users who hit the runtime "not available in this build" error have a landing page with install instructions.
- `packages/cli/README.md` — replace the m2b "ships in m2c" placeholders with full `-f` format documentation, document the tiny vs. full distinction (which formats live where, how to get `nowline-full`), the `.xml` ambiguity rule, and `--scale` / `--start` / `--page-size` / `--orientation` / `--margin` / `--font-sans` / `--font-mono` / `--headless` flags explicitly. Update the exit-code table if anything changed.
- `packages/renderer/README.md` — brief note that PNG / PDF and other export formats live in `@nowline/export-*` packages rather than in the renderer, and why. Keeps intent visible for m3/m4 consumers.
- Root `README.md` — update the "What you get" / examples section to mention the new formats. Add a one-line example: `nowline roadmap.nowline -f pdf -o roadmap.pdf`.
- `specs/rendering.md` — add or update the XLSX/Mermaid/MSProj sections with any decisions taken during implementation (no spec drift — keep the spec the source of truth).
- `specs/cli.md` § Render options — add `--page-size`, `--orientation`, `--margin`, and `--start` to the canonical flag table, document the default (`letter` / `auto` / `36pt`), and list the supported preset names. Keep the handoff and the spec in sync.

## What NOT to Build

- No new CLI commands. `render` is the only surface that grows.
- No new grammar, no new AST fields. Every format reads from the existing AST + positioned model.
- No interactive HTML+SVG editor (m5).
- No browser embed script (m3).
- No PNG streaming / progressive PDF — full-document in memory is fine for roadmaps of realistic size.
- No custom PDF templates, no Word/DOCX, no PowerPoint/PPTX (not in the spec).
- No round-trip from MS Project / XLSX back into `.nowline` — one-way export only. Round-tripping is a future milestone if it ever materializes.
- No font downloads at runtime. The bundled font fallback is the ceiling.
- No cloud rendering service. Everything runs locally in the CLI binary.

m2c is **one new package + six new exporters wired through one existing command**. The distribution pipeline from m2a does not change structurally — only the dependency list and binary size do.

## Key Specs to Read

| Spec | What to focus on |
|------|------------------|
| `specs/rendering.md` § Output Formats | Full format table, XLSX sheet definitions, Mermaid bridge rules, MS Project mapping conventions |
| `specs/rendering.md` § XLSX Export | Per-sheet columns, conditional-format rules, MS Project column parity table |
| `specs/cli.md` § Render options | Format list, `-s/--scale`, `-w/--width`, stdin/stdout piping, exit codes |
| `specs/architecture.md` § Technology Choices | resvg-js / PDFKit / ExcelJS rationale, binary-size expectations |
| `specs/architecture.md` § Local Asset Resolution | Asset resolver contract that PNG/PDF must honor when embedding logos |
| `specs/features.md` § m2c | Features 13, 14, 15, 16, 18, 18b (scoring rubric + notes) |
| `specs/milestones.md` § m2c | Scope boundary vs. m2b and m3 |
| `specs/handoffs/m2b.md` § Resolutions | Theme-in-layout, sanitizer, asset-root policy — all reused unchanged |
| `specs/handoffs/m2a.md` § Resolutions | CLI UX stack, exit codes, `$nowlineDiagnostics` envelope |

## Definition of Done

- [ ] Seven new packages exist and publish to npm under the shared monorepo version: `@nowline/export-core`, `@nowline/export-png`, `@nowline/export-pdf`, `@nowline/export-html`, `@nowline/export-mermaid`, `@nowline/export-xlsx`, `@nowline/export-msproj`.
- [ ] Dependency graph enforced per § 1: each `@nowline/export-*` package depends only on `@nowline/export-core` plus the minimum layer it actually consumes (renderer for png/html, layout for pdf, core+layout for mermaid/xlsx/msproj). Heavy deps (`@resvg/resvg-js`, `pdfkit`, `exceljs`) are direct dependencies of the single format package that needs them — never hoisted into `@nowline/export-core`. No sideways or upward imports.
- [ ] `@nowline/renderer` remains browser-safe (no change from m2b). No `@nowline/export-*` package leaks into browser bundles.
- [ ] `@nowline/cli` imports the six format packages via dynamic `import()` so the tiny build can exclude them via `bun build --external` without touching source code.
- [ ] `nowline <input> -f <format>` works for all of: `svg`, `png`, `pdf`, `html`, `mermaid`, `xlsx`, `msproj` (plus `json`, `nowline` from m2b.5)
- [ ] `-o <path>` infers the format from the extension for every unambiguous case (`.svg`, `.png`, `.pdf`, `.html`, `.md`, `.xlsx`). `.xml` without `-f msproj` exits 2 with a helpful message.
- [ ] Binary formats refuse to write to a TTY; piped binary stdout is allowed.
- [ ] Each format is deterministic given the same input, same `--today`, and same pinned dependency versions. Enforced by snapshot/hash tests.
- [ ] PNG respects `--scale N`; HTML is self-contained (works when opened from `file://`).
- [ ] PDF and PNG share the font resolver from § 10: `--font-sans` / `--font-mono` / `--headless` (plus `NOWLINE_FONT_SANS` / `NOWLINE_FONT_MONO` / `NOWLINE_HEADLESS` env) win over the platform probe list (macOS SF → Helvetica; Windows Segoe → Arial; Linux DejaVu → Liberation → Noto → Ubuntu → Cantarell), which wins over the bundled `DejaVuSans.ttf` + `DejaVuSansMono.ttf` pair. `SFNS.ttf` is pre-instanced through fontkit before embedding. `--headless` / `NOWLINE_HEADLESS=1` short-circuits to the bundled pair for deterministic CI renders. `--strict` warns when a non-headless run lands on the bundled fallback.
- [ ] PDF `--page-size` accepts imperial presets (`letter`, `legal`, `tabloid`, `ledger`), metric / ISO 216 presets (`a5`–`a1`, `b5`–`b3`), custom `WxHunit` dimensions in `pt` / `in` / `mm` / `cm`, and `content` (page = content dimensions, no scaling, no ceiling). Default is `letter`. `--orientation auto` rotates based on content aspect; `--margin` accepts unit-tagged lengths. Unknown presets, malformed dimensions, and over-large margins all exit 2 with targeted diagnostics.
- [ ] XLSX workbook matches `specs/rendering.md` § XLSX Export exactly — sheet names, column order, conditional formatting.
- [ ] Mermaid output parses through `mmdc` for every m1/m2b example (or documented skip if `mmdc` unavailable in CI).
- [ ] MS Project XML imports cleanly into Microsoft Project (spot-checked manually; documented in the Resolutions section).
- [ ] `--strict` promotes asset/font warnings to non-zero exit across every format (not just SVG).
- [ ] Unit tests for each format cover shape + determinism; CLI integration tests cover format selection + extension inference + TTY guard + `--scale` + `--start`.
- [ ] Tiny + full CLI split per § 11: the tiny `nowline` binary bundles `svg` + `png` only (≤ 60 MB on all six targets); the full `nowline-full` binary bundles every format (≤ 65 MB). Tiny binaries exit 2 with the "not available in this build" error when asked for an excluded format. Both variants build from the same CLI source via `bun build --external`.
- [ ] Release workflow produces working tiny + full binaries for every OS / arch combo, publishes every new npm package (`@nowline/export-core`, six `@nowline/export-*`, and `@nowline/cli-full`) in dependency order, and updates `.deb` / Homebrew / Scoop for both tiny and full channels.
- [ ] Every new package has a README (`packages/export-core/README.md` + six `packages/export-<format>/README.md`); `packages/cli/README.md` and the root `README.md` have full format + tiny-vs-full documentation; the m2b "ships in m2c" placeholders are gone.

## Open Questions for m2c

No items are open at the start of m2c — every question raised during drafting (package boundary, PDF page strategy, font story, Mermaid loss discipline, tiny vs. full CLI, MS Project `<Calendar>` fidelity, HTML pan/zoom, XLSX duration representation, MSProject lossy warnings, XLSX zip determinism, exporter-failure exit code) has a decision in the Resolutions section below. Any new questions that surface during implementation should be captured in the appropriate `@nowline/export-*` README and updated `@nowline/cli` README, then appended to the Resolutions section (following the pattern set by `specs/handoffs/m2a.md` and `specs/handoffs/m2b.md`).

## Resolutions

Decisions taken ahead of or during m2c implementation. Each resolution is also reflected in the relevant package README so later milestones inherit the decisions in-context.

1. **Package boundary — one package per format plus a shared core; seven packages total.** Decided during handoff drafting. Ship `@nowline/export-core` (shared types, font resolver, asset-resolver wrapper, unit converter; zero heavy deps) plus six format packages: `@nowline/export-png` (+ `@resvg/resvg-js`), `@nowline/export-pdf` (+ `pdfkit` + `fontkit`), `@nowline/export-html` (pure strings), `@nowline/export-mermaid` (pure strings), `@nowline/export-xlsx` (+ `exceljs`), `@nowline/export-msproj` (pure strings). Every format package depends on `@nowline/export-core` plus only the Nowline layer it actually consumes (renderer for png/html, layout for pdf, core+layout for mermaid/xlsx/msproj). Heavy deps stay **direct** dependencies of the single package that needs them — never hoisted into the core — so a Mermaid-only consumer installing `@nowline/export-mermaid` never touches resvg, ExcelJS, or PDFKit. `@nowline/cli` imports format packages via dynamic `import()` so tiny/full distribution (Resolution 5 below) is a `bun build --external` list, not a source-code split. Rejected: (a) monolithic `@nowline/export` — simpler to publish but forces lockstep version bumps across unrelated heavy deps (resvg going 4.x majors the whole package even for Mermaid-only consumers), blocks third-party Lambda / serverless users who don't want to load 12 MB of unused dep trees on every cold start, and makes the tiny/full CLI a source-level refactor instead of a compile flag; (b) dumping everything back into `@nowline/renderer` — breaks the browser-safe contract m2b spent effort establishing. All seven packages version in lockstep with the rest of the monorepo for m2c; per-package semver independence is a documented follow-up if/when a consumer complains.

2. **PDF page strategy — US Letter default + ISO/ANSI presets + custom `WxHunit` + `content`.** Decided during handoff drafting. `exportPdf()` defaults to **US Letter (8.5 × 11 in) portrait**, with `--orientation auto` flipping to landscape when the content's rendered aspect is wider than tall; explicit `portrait` / `landscape` override. `--page-size` accepts named presets (imperial: `letter`, `legal`, `tabloid`, `ledger`; metric / ISO 216: `a5`–`a1`, `b5`–`b3`; case-insensitive), a custom `WxHunit` expression (`8.5x11in`, `210x297mm`, `21x29.7cm`, `612x792pt`; mixed units rejected), and the special value **`content`** which sizes the page to the content's bounding box plus margin — no scaling, no upper bound, a 100-inch roadmap produces a 100-inch PDF. `--margin` takes a unit-tagged length (default `36pt`). With a fixed page, content larger than `(page − 2 × margin)` scales uniformly down to fit (aspect-preserving, never up); content smaller than the printable area renders at 1:1 and is centered. With `--page-size content`, no scaling ever — the page adopts the content's aspect, so `--orientation` is ignored. Single page per roadmap; pagination is explicitly deferred until fixed-page overflow becomes a real complaint. The keyword is deliberately **not** `fit`, because every other print tool uses "fit" to mean "shrink content to a fixed page" — the inverse of what `content` does. CLI flags (`--page-size`, `--orientation`, `--margin`) mirror into `.nowlinerc` as `pdfPageSize`, `pdfOrientation`, `pdfMargin`; flags override config. Unknown presets, malformed dimensions, mixed units, and margins consuming more than half the page all exit 2 with targeted diagnostics. Microsoft-style preset-with-orientation sugar (`a4-landscape` = `--page-size a4 --orientation landscape`) is **rejected** — the explicit two-flag form is unambiguous, composes with `--orientation auto`, and keeps preset parsing a single lookup rather than a split-then-lookup with edge cases (`a4-legal`? `letter-portrait-auto`?). Authors who want the shorthand can alias it in their shell.

3. **PNG / PDF font story — system-first with one bundled headless fallback.** Decided during handoff drafting. PDF and PNG share a single resolver (§ 10) that prefers, in order: explicit flag (`--font-sans` / `--font-mono`), environment (`NOWLINE_FONT_SANS` / `NOWLINE_FONT_MONO`), headless override (`--headless` / `NOWLINE_HEADLESS=1`), the per-platform probe list (SF Pro / SF Mono on macOS with fontkit VF instancing, Segoe UI / Consolas on Windows, DejaVu → Liberation → Noto → Ubuntu → Cantarell on Linux), then the bundled `DejaVuSans.ttf` + `DejaVuSansMono.ttf` pair shipped inside `@nowline/export-core`. Bold / italic synthesis falls back to PDFKit's faux-bold and skew transforms when the real face is not present. `--strict` emits a stderr warning when a non-headless run lands on the bundled fallback (the export still succeeds — that's for author awareness, not gating). Vendor fonts (SF, Segoe, Consolas) are embedded as PDF subsets, the same mechanism Apple's Pages/Keynote/Numbers and Microsoft Word/PowerPoint use when exporting to PDF; EULAs govern the font *files*, not the rendered artefact — the PDF case is materially the same as the uncontroversial PNG case. If that stance ever needs to change, dropping the vendor entries from the probe list is a one-line fix; Helvetica / Arial / Courier New slot in automatically. Rejected: (a) bundling every variant (~4 MB per platform for pixels most users never need); (b) system-only (fails on Alpine / slim Docker / bare CI, which is exactly where determinism matters most). The hybrid costs ~1.1 MB and keeps local dev native-looking while headless CI stays reproducible. Flag shape is `--font-sans` / `--font-mono` (kebab-case, one flag per role) rather than a namespaced `--font:sans` / `--font:mono` — kebab-case matches every other flag in the CLI, parses natively in the arg-parser libraries we're choosing between, maps cleanly to camelCase `.nowlinerc` keys (`fontSans`, `fontMono`), and avoids shell quoting oddities around `:`. No `--font-path <dir>` directory-scan flag ships in m2c: the single-file `--font-sans /abs/path.ttf` form and the alias table (`sf`, `segoe`, `dejavu`, `helvetica`, `arial`, `liberation`, `noto`, `ubuntu`, `cantarell`, `menlo`, `consolas`) already cover bespoke-font needs without a font-discovery scan (Postscript-name matching, family resolution, etc.) that would be a project unto itself.

5. **Tiny and full CLI distribution — two binaries from day one.** *Superseded by [`specs/cli-distribution.md`](../cli-distribution.md): we now ship a single ~70 MB `nowline` binary with every export format. The bun runtime turned out to dominate compiled-binary size (~92%), so the two-tier split paid only ~5% size dividend. Original rationale retained below as a historical record.* Decided during handoff drafting, spec'd in § 11. Ship `nowline` (tiny, ~50 MB) bundling `@nowline/export-core` + `@nowline/export-png`; ship `nowline-full` (~58–62 MB) bundling every `@nowline/export-*` package for users who need PDF, HTML, Mermaid, XLSX, or MS Project XML. Same CLI source, difference is a `bun build --external <excluded packages>` list; CLI uses dynamic `import()` for format dispatch so excluded formats fail at runtime with a clean "install nowline-full" error, not at build time. Distributed as parallel channels: Homebrew (`nowline` / `nowline-full`), Scoop (Windows), `.deb` (with `Conflicts`), npm (`@nowline/cli` / `@nowline/cli-full`). CI runs both-variant smokes on every OS / arch target. Tiny binary-size ceiling remains the m2a 60 MB target; full is 65 MB. **Why PNG specifically belongs in tiny** (rather than a smaller SVG-only tier): (i) font fidelity — `exportPng()` resolves through the same font pipeline as the rest of the app (§ 3 / § 10), so a roadmap rendered to PNG picks SF Pro on macOS, Segoe on Windows, bundled DejaVu on headless, byte-for-byte reproducibly, whereas any external SVG-to-PNG converter uses whatever fonts happen to be on the user's system and will typically substitute Arial / Helvetica where Nowline picked something else; (ii) asset pipeline cohesion — embedded logos / icons already flow through `sanitizeSvg()` and the asset resolver, so PNG inherits the same `file://` handling, relative-path resolution, and security stripping the SVG path gets, which a third-party converter reimplements inconsistently or not at all; (iii) determinism contract — the m2a promise that "the same `.nowline` + same binary yields the same bytes" extends cleanly to PNG only if the rasterizer is ours; handing off to `rsvg-convert` means outputs vary by the user's librsvg version and font cache; (iv) Windows has no packaged `librsvg`-based CLI (neither winget, Chocolatey, nor Scoop ship it cleanly — you're in MSYS2 or WSL territory), so a "just pipe it through `rsvg-convert`" story works on macOS / Linux but not on the platform where installing extra tools is hardest, breaking the cross-platform parity m2a established; (v) PNG is the common-case share format (Slack / email / PR attachments / Jira / Notion), so the one format most users actually export after SVG deserves to be zero-friction. Cost is ~6 MB of the ~50 MB tiny binary — real but bounded. Rejected: (a) one fat binary with everything bundled (would breach 60 MB and force every user to download PDFKit + ExcelJS even if they never use them); (b) PDFKit → svg2pdf.js lightweight swap (loses vector fidelity from the positioned model — PDF would become a raster of the SVG, which defeats the reason for vector PDF in the first place); (c) runtime format downloads (defeats the "single binary, no network at runtime" story from m2a); (d) SVG-only tiny with PNG in full-only (the font / asset / determinism / Windows arguments above apply specifically to this option — the 6 MB savings doesn't pay for losing those properties on the most-used non-SVG format); (e) a three-tier split (SVG-only / SVG+PNG / everything) — two tiers is simpler to reason about for both users ("which binary do I want?" has a two-answer decision tree) and for releases (matrix stays 2×6 = 12 binaries rather than 3×6 = 18), and the implementation doesn't hinge on it. If the tiny binary ever exceeds 60 MB, m2c does **not** pre-commit to splitting it — the decision gets re-opened with its own handoff, not auto-resolved by a previously-reserved name; at that point, pulling PNG out into a hypothetical `nowline-svg` tier would be one option and the external-converter recipe in `packages/export-png/README.md` becomes the intended workaround for users who compile their own tiny-without-PNG build in the meantime.

6. **MS Project `<Calendar>` fidelity — emit a minimal Standard base calendar.** Decided option (a). `exportMsProjXml()` always emits a `<Calendars>` block containing one base calendar (`UID="1"`, `Name="Standard"`, `IsBaseCalendar="true"`) with `<WeekDays>` enumerating Monday–Friday as working (08:00–12:00 / 13:00–17:00, matching Microsoft's own default template) and Saturday–Sunday as non-working, plus one resource calendar (`UID="2"`, `Name="Standard"`, `IsBaseCalendar="false"`, `BaseCalendarUID="1"`) that every exported `<Resource>` references by default. This is the minimum that reliably makes MSProject accept the import across versions. Emitted `<Task>` durations resolve against this Standard calendar, so a `duration: 2w` item lands on the same 10 working days Nowline computed under its own `business` calendar — Nowline's default. Nowline's richer `calendar:` configuration (`full` for 7-day weeks, `custom` for per-region holidays / half-days / non-standard working hours) is **not** honored in m2c: authors who use those will see their durations render correctly against the Standard MSProject calendar but lose the custom non-working-day metadata. A single-line stderr note fires in that case (`nowline: msproj export normalized calendar '<name>' → Standard (Mon–Fri, 8h)`), distinct from the lossy-feature warning. Rejected: (b) skipping the calendar block entirely, because MSProject's import-time defaults vary by installed template and have been observed to reject calendar-less imports outright on some versions; (c) full `calendar:` fidelity (translating `custom` working weeks into MSProject's `<WorkWeek>` + `<Exception>` structures), which is mechanically possible but is a project unto itself and is deferred to a follow-up milestone once a real user files a bug about their non-standard week. Deterministic: calendar UIDs are fixed (`1` / `2`), working-time strings are stable across runs, no timestamps in the calendar block.

7. **HTML pan/zoom — hand-rolled ~100 LOC script, no third-party library.** Decided option (a). `exportHtml()` emits an inline `<script>` that wires `pointerdown` / `pointermove` / `pointerup` (with pointer capture) to a `translate()` transform on the embedded roadmap container, `wheel` to a `scale()` transform anchored at the cursor, and keyboard shortcuts (arrow keys for pan, `+` / `-` for zoom, `0` to reset) so the no-mouse path works out of the box. Target budget ~100 LOC including comments; zero npm deps, no CSP exceptions beyond the inline `<script>` already needed, no third-party audit surface. Rejected (b) `svg-pan-zoom` (~30 KB minified) because the HTML export is slated to evolve beyond "embed the renderer's SVG verbatim" — once it emits DOM-native elements (absolutely-positioned `<div>`s for bars, CSS borders / gradients for styling, real `<a>` tags instead of SVG `<a>` shims, `<details>` for footnote disclosure), the pan/zoom layer has to move to CSS transforms on a DOM container anyway and an SVG-specific library becomes legacy. The hand-rolled script generalizes cleanly across that transition: same pointer / keyboard handlers, different transform target (the SVG root today, a wrapper `<div>` tomorrow). Pinch-zoom on touch devices is explicitly out of scope for m2c — desktop viewing is the target use case, touch support is a documented follow-up once the first mobile-review complaint lands. Accessibility: keyboard controls cover the no-mouse path; screen-reader users see the underlying SVG's `<title>` / `<desc>` unchanged. Deterministic: the script is a string-literal bake; no runtime randomness, no timestamps, no user-agent branching.

8. **XLSX duration representation — numeric working days, single column.** Decided option (b). `exportXlsx()` resolves every `duration:` literal to a **number of working days** under the active calendar and writes it to the single `Duration (days)` column. `duration: 2w` under `business` (Nowline's default, Mon–Fri, 8h) writes `10`; under `full` (seven-day week) writes `14`; under `custom` writes whatever the calendar resolver computes. Same calendar used by `exportMsProjXml()` (§ 6: Standard, Mon–Fri, 8h), so XLSX and MSProject duration columns agree numerically for the default and diverge only in the documented places for `full` / `custom`. Fractional durations (`1.5d` under `business`, sub-day values under a custom calendar) round half-up to the nearest whole day — sub-day precision would require a separate hours column and no author has asked. Items without `duration:` (milestones, anchor-only items) leave the cell empty rather than writing `0`, so Excel's `SUM` / `AVG` aggregates behave sensibly. The raw literal survives in the Nowline source for anyone who round-trips. Rejected (a) (write the raw `"2w"` string) because Excel sort / filter / aggregate all break on text durations and the XLSX export loses its main reason to exist. Rejected (c) (two columns: "Duration" text + "Duration (days)" numeric) for column bloat — the sheet already carries ~10 columns (id, name, owner, start, finish, duration, dependencies, labels, footnotes, style) and two duration columns invite confusion about which is canonical, with the answer always being the numeric one. Deterministic: same calendar input → same number, no locale-sensitive formatting.

10. **XLSX zip determinism — pin ExcelJS, fall back to decoded-content hash if binary hash flakes.** Decided option (b) with (c) as a documented, pre-wired fallback. `@nowline/export-xlsx` pins ExcelJS at an **exact** version (`"exceljs": "4.4.0"`, not `"^4.4.0"`) and ships a Renovate / Dependabot rule that flags minor and patch upgrades for manual review with a mandatory snapshot diff. The default test asserts on the raw `.xlsx` byte hash (option (b) path) and also runs a secondary assertion that decodes the zip via `fflate` and hashes `{entry path → SHA-256 of entry bytes}` pairs, so regressions in entry ordering surface as a readable diff rather than a bare "hash mismatch". If CI ever sees the raw-bytes hash disagree across Linux / macOS / Windows, the package flips to the decoded-content hash as the primary assertion (option (c) path) and this resolution gets a dated postscript — the escape hatch is already wired, not a future refactor. Authors can preview the fallback locally with `NOWLINE_XLSX_HASH_DECODED=1` when filing determinism bug reports. Rejected (a) (post-processing the ExcelJS buffer to rewrite the zip with a pinned central-directory order) because it re-implements archiver internals inside `@nowline/export-xlsx`, adds measurable write-time overhead on larger sheets, and couples the package to whatever zip library we pick forever. Deterministic regardless of which path wins: ExcelJS version is pinned, hashing is stable, insertion order is explicit in the exporter.

11. **Exit code for exporter-pipeline failures — exit 3.** Decided option (b). When the input parses cleanly, layout succeeds, and the renderer / exporter itself chokes (resvg rejecting a sanitized SVG, PDFKit throwing on a glyph it can't shape, ExcelJS rejecting a sheet name > 31 chars, fontkit failing to instance a variable font, the asset resolver finding a corrupted PNG on disk), the CLI exits **3 (output error)**. Matches the existing m2a exit-code table: `0` success, `1` validation error, `2` usage error, `3` output error. Stderr carries a format-prefixed one-liner (`nowline: pdf export failed: <message from underlying library>`) so users can grep by format when a whole-repo render loop partially fails. Rejected (a) exit 1 (conflates "your input is bad" with "your input is fine but our pipeline broke" — users can't tell from the exit code whether to fix their `.nowline` file or file a bug); (c) new exit code 4 (adds a row to the exit-code table for a case that already fits cleanly under `3 output error`; "output error" already implies the whole write path, not just filesystem I/O). Distinct from the "format not available in this build" case in § 11 of *What to Build* (tiny binary asked for PDF), which exits `2` because that is a usage error — the user asked for a format this binary doesn't carry. `packages/cli/README.md` gets a row in the exit-code table with both scenarios as examples.

**Lossy export policy (applies to Mermaid, MS Project XML, and XLSX).** These three formats are best-effort renderings of a model they cannot fully represent — Mermaid has no groups/labels/footnotes, MS Project has no labels/footnote/bracket/style, XLSX has no native visual-chart or nested-swimlane concept. Loss on these formats is therefore **never an error**, including under `--strict`. Each lossy exporter succeeds on any valid AST and surfaces the drops in a format-appropriate way (Mermaid trailing `%%` comment, MS Project stderr summary, XLSX "what this sheet does not carry" note on the Roadmap sheet), so reviewers can always see exactly what was left behind without the CLI rejecting the work. Callers that need a lossless snapshot should export SVG, PDF, or HTML alongside the lossy format. `--strict` continues to promote **asset/font warnings** to a non-zero exit across every format — that's a fixable author problem, not an inherent format-expressivity gap.

4. **Mermaid loss discipline — drop silently with a trailing `%%` comment.** Decided option (a), consistent with the lossy-export policy above. `exportMermaid()` walks the merged AST, emits the `gantt` block, and appends a single Mermaid-style `%%` comment enumerating every Nowline feature that was dropped (`labels:`, `footnote`, `remaining:`, `owner:`, `before:`, nested swimlanes beyond one level, `parallel`, `group` beyond date math), with a per-feature count so reviewers can see the shape of the loss at a glance. The comment is deterministic (features listed in a stable order, no timestamps). `--strict` does **not** promote loss to an error for Mermaid. Option (b)'s verbose Markdown table and (c)'s `--force` gating are rejected for being noisy and hostile, respectively. `MermaidOptions.lossyComment` defaults to `true`; setting it to `false` suppresses the comment for callers that want a bare `gantt` block (e.g. embedding in existing docs that track loss elsewhere).

9. **MSProject lossy mapping warnings — single stderr summary; never an error.** Decided option (a), consistent with the lossy-export policy above. Every `exportMsProjXml()` run prints one line to stderr of the shape `nowline: msproj export dropped <N> features: labels (12), footnote (3), bracket (1), style (…)` — stable ordering, stable counts, no per-entity spam. The counts are computed during the mapping walk and emitted before the XML is flushed. `--strict` does **not** promote this summary to a non-zero exit; the file still writes successfully. Option (b)'s per-entity warning stream is rejected for drowning CI logs on real roadmaps; option (c)'s silent export is rejected for hiding drops that authors care about. The summary line is suppressed entirely when nothing was dropped.
