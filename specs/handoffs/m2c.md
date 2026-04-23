# m2c Handoff — Export Formats

## Scope

Complete `nowline render` by adding every output format beyond SVG: **PNG, PDF, HTML, Markdown+Mermaid, XLSX, and MS Project XML.** Each format is an adapter on top of the positioned model from m2b — PNG rasterizes SVG, PDF walks the positioned model, HTML embeds SVG, Mermaid transpiles the AST, XLSX reshapes the AST into sheets, MS Project XML projects the AST into tasks. No new CLI commands, no new grammar, no new package graph beyond an `@nowline/export` package to keep Node-only dependencies off the browser path.

**Milestone:** m2c
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline` (continue the OSS monorepo from m1 / m2a / m2b)

m2 continues:

- **m2a (shipped)** — CLI scaffold + `validate` + `convert` + `init` + `version` + distribution pipeline
- **m2b (shipped)** — `@nowline/layout` + `@nowline/renderer` + `nowline render` (SVG) + `nowline serve`
- **m2c (this handoff)** — all other `nowline render` formats (PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML)

## What to Build

### 1. Monorepo Additions

Add one package, `@nowline/export`, alongside the existing four. Keep `@nowline/renderer` SVG-only and browser-safe; everything that depends on Node-only libraries or WASM blobs lives in `@nowline/export`.

```
nowline/
  packages/
    core/         # @nowline/core (m1)
    layout/       # @nowline/layout (m2b)
    renderer/     # @nowline/renderer (m2b) — SVG only, browser-safe, no heavy deps
    export/       # @nowline/export (NEW) — PNG, PDF, HTML, Mermaid, XLSX, MS Project XML
    cli/          # @nowline/cli (m2a/m2b)
  grammars/
    nowline.tmLanguage.json
  examples/
```

Dependency graph (enforced, no sideways or upward imports):

```
@nowline/cli ─┬─▶ @nowline/export ──▶ @nowline/renderer ──▶ @nowline/layout ──▶ @nowline/core
              ├─▶ @nowline/renderer                                                     ▲
              └─▶ @nowline/core ◀────────────────────────────────────────────────────────┘
```

Why a new package instead of growing `@nowline/renderer`:

- resvg-js (WASM blob), PDFKit, and ExcelJS would add megabytes to the browser bundle used by m3 (embed) and m4 (editor live preview). Those consumers never need PNG/PDF/XLSX — they always have an SVG.
- Keeping the split lets `@nowline/renderer` stay zero-runtime-dep and browser-safe, which m2b already established as a non-negotiable constraint.
- m3 and m4 import `@nowline/renderer` directly; only `@nowline/cli` (and later a server or CI consumer) imports `@nowline/export`.

The `@nowline/export` package publishes to npm under the shared monorepo version. It is **not** required to be browser-safe — explicit Node imports are fine, and WASM initialization can read from disk.

### 2. `@nowline/export` Surface

One entry per format, thin wrappers over the per-format implementation modules:

```ts
import type { PositionedRoadmap } from '@nowline/layout';
import type { NowlineFile, ResolveResult } from '@nowline/core';

export interface ExportInputs {
    model: PositionedRoadmap;   // from @nowline/layout
    ast: NowlineFile;           // original AST (needed for XLSX / Mermaid / MSProj)
    resolved: ResolveResult;    // include-resolved data (for XLSX sheet joins)
    sourcePath: string;         // '<stdin>' when piped
}

export interface PngOptions   { scale?: number; /* default 2 */ background?: string; }
export interface PdfOptions {
    title?: string;
    author?: string;
    pageSize?: PdfPageSize;                         // default { preset: 'letter' }
    orientation?: 'portrait' | 'landscape' | 'auto'; // default 'auto'
    margin?: PdfLength;                             // default { value: 36, unit: 'pt' }
}

// Named presets cover both systems; custom dimensions are unit-tagged; 'content'
// sizes the page to the content's bounding box plus margin (no scaling, ever —
// a 100-inch roadmap produces a 100-inch page).
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

export interface HtmlOptions  { title?: string; embedAssets?: boolean; /* default true */ }
export interface MermaidOptions { lossyComment?: boolean; /* default true */ }
export interface XlsxOptions  { includeHiddenColumns?: boolean; }
export interface MsProjOptions { projectName?: string; startDate?: string; /* YYYY-MM-DD */ }

export function exportPng(inputs: ExportInputs, svg: string, options?: PngOptions): Promise<Uint8Array>;
export function exportPdf(inputs: ExportInputs, options?: PdfOptions): Promise<Uint8Array>;
export function exportHtml(inputs: ExportInputs, svg: string, options?: HtmlOptions): Promise<string>;
export function exportMermaid(inputs: ExportInputs, options?: MermaidOptions): string;
export function exportXlsx(inputs: ExportInputs, options?: XlsxOptions): Promise<Uint8Array>;
export function exportMsProjXml(inputs: ExportInputs, options?: MsProjOptions): string;
```

Contract:

- Each function is deterministic given the same `inputs + options` and the same pinned `today`. Timestamps that would break determinism (e.g. PDF `CreationDate`) are set from `inputs.ast` metadata or a caller-injected override, not `new Date()`.
- Binary outputs return `Uint8Array`; text outputs return `string`. Callers handle stdout/TTY guards — `@nowline/export` is IO-agnostic.
- No function ever writes to disk. All IO stays in `@nowline/cli`.

### 3. PNG — SVG → raster via resvg-js (WASM)

- Depend on `@resvg/resvg-js` (WASM build). Keep the WASM lazily loaded so importing `@nowline/export` does not pay the cost until PNG is actually asked for.
- Pipeline: `renderSvg(model)` → `resvg.render(svg, { fitTo: { mode: 'width', value: scale * model.width }, background })` → PNG bytes.
- Default `scale: 2` (retina). `--scale N` on the CLI overrides.
- Font stack: resvg needs fonts registered. Ship the same system-font fallback chain the SVG renderer emits, plus bundled DejaVu Sans as a last-resort fallback so headless CI renders remain readable. Register once per process; reuse across invocations.
- Deterministic: resvg is deterministic for a fixed input + fixed loaded fonts; document the pinned resvg version in `packages/export/README.md`.
- Size budget: resvg-js adds ~6 MB; account for it in the 60 MB binary ceiling. If the bun-compile bundle blows the budget, gate PNG/PDF behind a "full" build and ship a "slim" build without them (open question below).

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
- **Unit conversion.** Everything resolves to PDF points (1 pt = 1/72 in) before handoff to PDFKit: `pt = pt`, `in = pt × 72`, `mm = pt × 2.83465`, `cm = pt × 28.3465`. The conversion lives in `@nowline/export/src/pdf/units.ts` with unit tests on each direction.
- **Validation.** Unknown preset → exit 2 with a list of valid names. Malformed custom size (missing unit, non-numeric, mixed units, zero/negative) → exit 2 with a pointer at the malformed token. Margin larger than half the page → exit 2 ("margin consumes the entire page"). All errors cite the CLI flag that caused them.
- Fonts: embed DejaVu Sans/Mono for determinism. PDFKit's `font()` reads from disk; embed the TTF files as byte arrays in `@nowline/export` and register them on each PDF run (not process-wide, so tests stay isolated).
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

### 9. CLI Wiring — extend `nowline render`

`packages/cli/src/commands/render.ts` already parses `-f`. m2b rejects every non-`svg` value. In m2c:

- Accept `svg, png, pdf, html, mermaid, xlsx, msproj` (plus alias `ms-project`). Reject anything else with the m2a-style "unknown format" error (exit 2).
- Format resolution precedence:
  1. Explicit `-f` flag.
  2. `-o` extension (`.svg`, `.png`, `.pdf`, `.html`/`.htm`, `.md`/`.markdown`, `.xlsx`, `.xml`). `.xml` requires an explicit `-f msproj` since `.xml` is ambiguous; otherwise the CLI errors with a helpful message.
  3. Default `svg` (unchanged).
- Add the `--scale N` flag documented in `specs/cli.md` § `nowline render`. Only honored for PNG; warn and ignore on other formats.
- Add PDF page controls, only honored for `-f pdf` (warn and ignore on other formats):
  - `--page-size <value>` — preset name (`letter`, `legal`, `tabloid`, `ledger`, `a5`–`a1`, `b5`–`b3`), custom `WxHunit` (e.g. `8.5x11in`, `210x297mm`, `21x29.7cm`, `612x792pt`), or `content` (page = content dimensions; no scaling, no page ceiling). Default `letter`.
  - `--orientation <portrait|landscape|auto>` — default `auto`. Ignored with `--page-size content`.
  - `--margin <length>` — unit-tagged (`36pt`, `0.5in`, `10mm`, `1cm`). Default `36pt`.
  - Extend `.nowlinerc` keys the same way m2a did for `theme` / `width`: `pdfPageSize`, `pdfOrientation`, `pdfMargin`. CLI flags override config.
- stdout rules:
  - Text formats (SVG, HTML, Mermaid, MS Project XML): allowed on stdout. No trailing newline (consistent with m2b's m2a-compatible decision).
  - Binary formats (PNG, PDF, XLSX): refuse to write to a TTY. The m2a stub in `packages/cli/src/io/write.ts` already guards this — extend the error message to point users at `-o <file>`. Binary to a piped stdout is allowed (for `nowline render … -f png | imgcat` etc.).
- stdin rules: `nowline render -` reads `.nowline` from stdin for every format. No change from m2b.
- Add `--start YYYY-MM-DD` for MS Project anchoring (specific to that format; error when passed with any other `-f`).
- Validation failures still exit 1. Asset/font warnings behave per m2b: warn by default, exit 1 under `--strict`.
- Reuse the m2b render pipeline (`parseSource → resolveIncludes → layoutRoadmap → renderSvg`) and then branch on format after the SVG is in hand (PNG/HTML/PDF can share the SVG; Mermaid/XLSX/MSProj skip the renderer and go straight from AST to exporter).

### 10. Asset Resolution and Fonts

- Logos (`roadmap logo:`) continue to use m2b's `AssetResolver`. PNG renders should embed logos via resvg's image loading hooks (SVG logos re-use the sanitized inline copy; raster logos stream through as base64 data URIs just like in SVG).
- Fonts for PNG (resvg) and PDF (PDFKit) must be deterministic. Bundle DejaVu Sans Regular/Bold and DejaVu Sans Mono inside `packages/export/assets/fonts/` — they are licensed for redistribution and give consistent metrics on every platform. The CLI pays the ~1 MB cost; the browser-facing `@nowline/renderer` stays untouched.
- System fonts are still listed first in the font stack so authored SVG renders locally match system rendering; the bundled fonts are a last-resort fallback.

### 11. Performance Targets

Not hard gates, but target for a 100-item roadmap on an M-series MacBook:

- SVG render — same m2b target (< 100 ms).
- PNG — < 500 ms end-to-end (includes WASM init amortized; steady-state subsequent calls < 250 ms).
- PDF — < 500 ms.
- HTML — < 100 ms (it's ~SVG plus a fixed prelude).
- Mermaid — < 50 ms (pure string work).
- XLSX — < 500 ms (ExcelJS workbook serialization is the long pole).
- MS Project XML — < 100 ms.
- Binary ceiling from m2a (< 60 MB) still applies. Add resvg-js + PDFKit + ExcelJS + bundled fonts — total estimate ~10–12 MB. If it goes over, see Open Question 5 (slim vs full build).

### 12. Tests

Use Vitest across all packages. Add:

- **`@nowline/export` unit tests**, per format:
  - **PNG** — render each m1 + m2b example, hash the PNG output, commit the hashes. Re-renders byte-match. Separate tests assert header bytes (`\x89PNG\r\n\x1a\n`), dimensions equal `scale * model.width × scale * model.height`, and resvg emits no warnings on the stock fixtures.
  - **PDF** — render each example, hash the PDF. A small "PDF sanity" test checks the `%PDF-1.`-prefix, the object count is plausible, and `pdfjs` can round-trip it without errors (pull `pdfjs-dist` into `devDependencies` for the test only).
  - **HTML** — snapshot the full HTML string per example + theme. Smoke test that the embedded SVG round-trips through a real browser (Playwright optional; skip in CI if too heavy — document the skip).
  - **Mermaid** — snapshot the Markdown string per example. A separate test passes the emitted `mermaid` block through `@mermaid-js/mermaid-cli` (if already available) to assert it parses; gated on `mmdc` being on `PATH`.
  - **XLSX** — open each workbook with ExcelJS and assert sheet names, column headers, row counts, and conditional-format rules. Hash the zip contents for a "nothing drifted" regression check (ExcelJS is deterministic given the same input).
  - **MS Project XML** — snapshot the XML string per example; a secondary test validates it against the project schema using `libxmljs` (optional dev dep). At minimum, assert the root element and namespace are correct and every `<Task>` has a `UID`.
- **Determinism test** — re-export every format twice from the same input + same `today` and assert byte-identical output. Catches accidental `new Date()` leaks.
- **`nowline render` CLI integration tests**:
  - stdout + `-f svg` (regression from m2b).
  - `-o path.<ext>` for each format, with extension-inferred format.
  - `-f png` + `--scale 3` writes a larger file than `--scale 1`.
  - `-f xlsx` refuses to write to a TTY.
  - `-f msproj` with no `--start` produces a valid XML with today's date; with `--start 2026-01-06`, the first task's start matches.
  - Ambiguous `.xml` extension without `-f` exits 2 with the expected message.
  - `-f pdf --strict` with a missing logo exits 1 (inherits m2b's strict behavior).
- **Distribution smoke test** — after each `bun compile`, additionally run `<binary> render examples/minimal.nowline -f png -o /tmp/m.png` and assert exit 0 + non-zero file. Add similar smokes for `pdf` and `xlsx`. Assert binary stays under 60 MB on all six targets.

### 13. Documentation

- `packages/export/README.md` — one short section per format: dependency used, known limitations, determinism notes, how to regenerate snapshots.
- `packages/cli/README.md` — replace the m2b "ships in m2c" placeholders with full `-f` format documentation. Document the `.xml` ambiguity rule and `--scale` / `--start` flags explicitly. Update the exit-code table if anything changed.
- `packages/renderer/README.md` — brief note that PNG/PDF are exported by `@nowline/export` rather than by the renderer, and why. Keeps intent visible for m3/m4 consumers.
- Root `README.md` — update the "What you get" / examples section to mention the new formats. Add a one-line example: `nowline render roadmap.nowline -f pdf -o roadmap.pdf`.
- `specs/rendering.md` — add or update the XLSX/Mermaid/MSProj sections with any decisions taken during implementation (no spec drift — keep the spec the source of truth).
- `specs/cli.md` § `nowline render` — add `--page-size`, `--orientation`, `--margin`, and `--start` to the canonical flag table, document the default (`letter` / `auto` / `36pt`), and list the supported preset names. Keep the handoff and the spec in sync.

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
| `specs/cli.md` § `nowline render` | Format list, `--scale`, `--width`, stdin/stdout piping, exit codes |
| `specs/architecture.md` § Technology Choices | resvg-js / PDFKit / ExcelJS rationale, binary-size expectations |
| `specs/architecture.md` § Local Asset Resolution | Asset resolver contract that PNG/PDF must honor when embedding logos |
| `specs/features.md` § m2c | Features 13, 14, 15, 16, 18, 18b (scoring rubric + notes) |
| `specs/milestones.md` § m2c | Scope boundary vs. m2b and m3 |
| `specs/handoffs/m2b.md` § Resolutions | Theme-in-layout, sanitizer, asset-root policy — all reused unchanged |
| `specs/handoffs/m2a.md` § Resolutions | CLI UX stack, exit codes, `$nowlineDiagnostics` envelope |

## Definition of Done

- [ ] `packages/export` exists and publishes to npm under the shared monorepo version
- [ ] Dependency graph enforced: `@nowline/export → @nowline/renderer → @nowline/layout → @nowline/core`. `@nowline/cli` depends on `@nowline/renderer` and `@nowline/export`. No sideways or upward imports.
- [ ] `@nowline/renderer` remains browser-safe (no change from m2b). `@nowline/export` is Node-only and does not bleed into browser bundles.
- [ ] `nowline render -f <format>` works for all of: `svg`, `png`, `pdf`, `html`, `mermaid`, `xlsx`, `msproj`
- [ ] `-o <path>` infers the format from the extension for every unambiguous case (`.svg`, `.png`, `.pdf`, `.html`, `.md`, `.xlsx`). `.xml` without `-f msproj` exits 2 with a helpful message.
- [ ] Binary formats refuse to write to a TTY; piped binary stdout is allowed.
- [ ] Each format is deterministic given the same input, same `--today`, and same pinned dependency versions. Enforced by snapshot/hash tests.
- [ ] PNG respects `--scale N`; PDF embeds DejaVu fonts; HTML is self-contained (works when opened from `file://`).
- [ ] PDF `--page-size` accepts imperial presets (`letter`, `legal`, `tabloid`, `ledger`), metric / ISO 216 presets (`a5`–`a1`, `b5`–`b3`), custom `WxHunit` dimensions in `pt` / `in` / `mm` / `cm`, and `content` (page = content dimensions, no scaling, no ceiling). Default is `letter`. `--orientation auto` rotates based on content aspect; `--margin` accepts unit-tagged lengths. Unknown presets, malformed dimensions, and over-large margins all exit 2 with targeted diagnostics.
- [ ] XLSX workbook matches `specs/rendering.md` § XLSX Export exactly — sheet names, column order, conditional formatting.
- [ ] Mermaid output parses through `mmdc` for every m1/m2b example (or documented skip if `mmdc` unavailable in CI).
- [ ] MS Project XML imports cleanly into Microsoft Project (spot-checked manually; documented in the Resolutions section).
- [ ] `--strict` promotes asset/font warnings to non-zero exit across every format (not just SVG).
- [ ] Unit tests for each format cover shape + determinism; CLI integration tests cover format selection + extension inference + TTY guard + `--scale` + `--start`.
- [ ] The compiled `bun compile` binary remains under 60 MB on all six targets. If it doesn't, see Open Question 5 and ship the slim/full split.
- [ ] Release workflow still produces working binaries + npm packages (now including `@nowline/export`) + `.deb` assets + Homebrew formula update.
- [ ] `packages/export/README.md` exists; `packages/cli/README.md` and the root `README.md` have full format documentation; the m2b "ships in m2c" placeholders are gone.

## Open Questions for m2c

1. **Package boundary — one `@nowline/export` vs. one package per format.** Options: (a) single `@nowline/export` with one module per format (current recommendation); (b) one package each (`@nowline/export-png`, `@nowline/export-pdf`, …) so consumers opt in format-by-format and keep bundles small; (c) keep everything in `@nowline/renderer` and guard Node imports with dynamic `import()` so browser bundlers can tree-shake them. (a) is simplest to ship; (b) is nicer for third-party consumers that want one format; (c) is the most friction-free for monorepo dev. Recommendation: (a) for m2c; revisit if a serverless consumer complains about cold-start size. Document the decision in `packages/export/README.md`.

2. **PDF page strategy — resolved during handoff drafting.** Default **US Letter (8.5 × 11 in) portrait** with `--orientation auto` flipping to landscape when the content is wider than tall. Users select any of the named presets (imperial: `letter`, `legal`, `tabloid`, `ledger`; metric / ISO 216: `a5`–`a1`, `b5`–`b3`), a custom `WxHunit` (`8.5x11in`, `210x297mm`, `21x29.7cm`, `612x792pt`), or **`content`** (page adopts the content's own dimensions + margin; no scaling, no upper bound — a 100-inch roadmap produces a 100-inch PDF, which is fine for digital viewing). Fixed-page content larger than the printable area scales uniformly down to fit; smaller content is left at 1:1 and centered. Single page per roadmap — pagination is explicitly deferred. Name deliberately *not* `fit`, since that term means "shrink to fit" in every other export tool and would be the exact opposite of what this mode does. Still open: whether to accept Microsoft-style preset-with-orientation sugar (`a4-landscape` = `--page-size a4 --orientation landscape`).

3. **PNG font story.** resvg accepts a fontdb you build up ahead of time. Options: (a) register system fonts via `fontdb.load_system_fonts()` + bundled DejaVu as fallback (non-deterministic across machines); (b) only the bundled DejaVu fonts, guaranteeing pixel parity across every machine at the cost of worse-looking renders if the user wrote their SVG for a fancier stack; (c) user-supplied font directory via `--font-path` + bundled DejaVu fallback (configurable). Recommendation: (b) for determinism-first (matches our overall philosophy), with a documented `--font-path` escape hatch landing in a follow-up if needed.

4. **Mermaid loss discipline.** Mermaid's gantt diagrams are weaker than Nowline's model in multiple dimensions (no groups, no labels, no footnotes, limited statuses). Options for the dropped data: (a) drop silently and add a single trailing `%%` comment enumerating the drops (recommended); (b) emit a separate Markdown table below the `mermaid` block listing the dropped data verbosely; (c) emit a warning to stderr and require `--force` for the export to proceed. (a) keeps the output clean; (b) is honest but noisy; (c) is hostile. Recommendation: (a) plus a `--strict` short-circuit that errors if the AST contains features Mermaid cannot represent.

5. **Slim vs. full CLI build if we blow the 60 MB budget.** `bun compile` currently sits around ~50 MB with m2b. resvg + PDFKit + ExcelJS + bundled fonts could plausibly take us over the ceiling. Options: (a) drop DejaVu Mono; (b) switch from PDFKit to a lighter PDF backend (svg2pdf.js, ~200 KB); (c) ship two binaries: `nowline` (SVG + HTML + Mermaid + MSProj XML — tiny) and `nowline-full` (adds PNG + PDF + XLSX). Recommendation: aim for (a)+(b) inside a single binary; fall back to (c) only if the full version still breaches 60 MB. Decide before the release workflow change lands.

6. **MS Project `<Calendar>` fidelity.** MSProject refuses some imports without an embedded base calendar. Options: (a) emit the minimal calendar MSProject requires (standard 8-hour day, Mon–Fri) and a single resource calendar; (b) skip calendars and rely on MSProject's import-time defaults (brittle); (c) honor the Nowline `calendar:` config (`business` / `full` / `custom`) and translate working days / non-working days into MSProject's calendar shape. Recommendation: (a) for m2c, (c) as a follow-up once someone files a bug about their non-standard week.

7. **HTML pan/zoom library.** Options: (a) hand-rolled ~100 LOC script using pointer events and CSS transforms; (b) bundle a tiny library like `svg-pan-zoom` (~30 KB). (a) keeps HTML self-contained with no third-party code to audit; (b) is better-tested and has more features. Recommendation: (a) for the MVP; revisit if users want pinch-zoom / reset buttons.

8. **XLSX numeric vs. string durations.** Items carry `duration:` values like `2w` that aren't numbers. Options: (a) write the raw literal (`"2w"`) so the sheet round-trips textually; (b) resolve to working days and write a number (e.g. `10` for 2w under `business`); (c) two columns, "Duration" (text) and "Duration (days)" (number). (a) is faithful to the source; (b) is what MS Project expects; (c) is both. Recommendation: (c) — MS Project parity column design already implies dual representation.

9. **MSProject lossy mapping warnings.** Every export run will drop `labels:`, `footnote`, `bracket`, etc. Options: (a) log a single "X features dropped: …" summary to stderr; (b) log one warning per dropped entity; (c) silent export, documented loss list in the CLI `--help`. Recommendation: (a). Under `--strict`, (a) still exits non-zero so CI pipelines can catch it.

10. **Determinism for XLSX zip ordering.** ExcelJS can emit zip entries in insertion order but the underlying archiver may re-sort on some platforms. Spend an afternoon on this before the tests turn flaky. Options: (a) post-process the buffer to re-pack with a pinned entry order (fiddly); (b) depend on a known-deterministic ExcelJS release and pin it; (c) accept non-determinism and only hash the decoded workbook content, not the zip bytes. Recommendation: (b) for simplicity, (c) for test robustness. Decide on (c) when writing the XLSX tests.

11. **Exit code for "valid input, export tool choked."** E.g. resvg fails to parse a sanitized SVG, PDFKit throws on a weird glyph, ExcelJS rejects a sheet name longer than 31 chars. Options: (a) exit 1 (treat like validation); (b) exit 3 (output error); (c) new exit code 4 (exporter error). (b) is closest to the truth — the input is fine, the output pipeline failed — and keeps the exit-code table short. Recommendation: (b). Capture in `packages/cli/README.md`.

These can be resolved during implementation. Answers should be captured in the `@nowline/export` README and updated `@nowline/cli` README, and appended to this handoff in a `## Resolutions` section (following the pattern set by `specs/handoffs/m2a.md` and `specs/handoffs/m2b.md`).
