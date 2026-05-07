# CLI distribution — single binary

**Status:** active. Supersedes [`specs/handoffs/m2c.md`](./handoffs/m2c.md) § 11 ("Tiny and Full CLI Distribution") and Resolution § 5 ("Tiny and full CLI distribution — two binaries from day one").

## Decision

Ship **one** compiled `nowline` binary per platform, bundling every `@nowline/export-*` package (SVG, PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML).

No `nowline-full` companion binary. No `@nowline/cli-full` npm package. No tiered Homebrew formulas. One Debian package. One artifact name pattern (`nowline-<os>-<arch>`).

## Why we reversed m2c

m2c § 11 was written with a budgeted assumption that `bun --compile` produced a small standalone binary on top of which the JS payload (parser, layout, renderer, exporters) and the heavy native deps (`resvg-js`, `pdfkit`, `exceljs`) would be the dominant size contributors. Under that assumption a "tiny" binary at ~50 MB and a "full" binary at ~58–62 MB looked like a meaningful 8–12 MB win for the most-installed download path.

Empirical measurement after m2k (macOS arm64, bun 1.3.13, current source) showed the assumption was wrong:

| Build | Compiled binary | JS payload (non-compiled) | Native asset |
|---|---|---|---|
| Bun runtime alone (`/opt/homebrew/Cellar/bun/.../bun`) | 60 MB | n/a | n/a |
| SVG-only (every `@nowline/export-*` external) | 61.6 MB | 1.5 MB | none |
| Tiny as m2c specified (PNG only) | 65.0 MB | 1.5 MB | resvg.node 3.5 MB |
| Full as m2c specified (every format) | 69.6 MB | 6.3 MB | resvg.node 3.5 MB |

Or as arithmetic: `60 (bun runtime) + ~1.5–6.3 (our JS) + 3.5 (resvg native) ≈ measured size`.

The bun runtime is **92% of the tiny binary**. The full set of optional exporters (PDFKit + ExcelJS + svg-to-pdfkit + the three pure-string exporters) adds only **5 MB** to the compiled binary because bun's tree-shaker is effective — ExcelJS shows 22 MB on disk but only ~1.7 MB ends up in the binary.

So the m2c split was paying:

- A doubled CI matrix (every PR ran 6 compile-smoke jobs instead of 3).
- A doubled release matrix (12 platform builds instead of 6).
- A second `.deb` per arch with `Conflicts:` / `Replaces:` plumbing.
- A second Homebrew formula with `conflicts_with` plumbing.
- A second npm package (`@nowline/cli-full`) as a shim.
- README + spec maintenance: every export package documenting "tiny vs full" status; CLI README documenting the runtime "not available in this build" error path; install copy explaining when to pick which.
- Source code: `compile.mjs` `--variant` plumbing; CLI render dispatch's `isMissingExporterError` / `buildMissingExporterMessage` machinery; tests for that machinery.

…in exchange for a **5 MB / 7%** size delta on the default download (or ~3.4 MB / 5% if we'd dropped only PNG from tiny).

The win didn't justify the surface area. We collapsed.

## What's preserved

- **Dynamic `import()` format dispatch** in [packages/cli/src/commands/render.ts](../packages/cli/src/commands/render.ts). Each format-specific exporter is loaded on demand. This costs nothing at runtime (bun bundles them all anyway), but it keeps the door open if a future profile change ever justifies re-introducing a tier — re-extracting an exporter would be a `compile.mjs` `--external` flag, not a source refactor.
- **Per-package boundary**: every `@nowline/export-*` package keeps its own `package.json`, README, dependencies, and tests. Library consumers (a Mermaid-only embed site, an LSP that wants only PDF) still install only the package they need; they don't inherit the CLI's "ship everything" choice. The collapse is purely a CLI distribution choice, not an architectural change.
- **The 60 MB bun-runtime ceiling is unchanged.** We can't shrink that without leaving `bun --compile`. If we ever did, the calculus that produced this single-binary decision would change.

## Size budget

- Ceiling: **75 MB** per platform binary, asserted in CI by [`packages/cli/scripts/compile.mjs`](../packages/cli/scripts/compile.mjs).
- Current measured macOS-arm64 binary: ~70 MB.
- Headroom: ~5 MB for future bun-runtime growth or modest exporter additions.
- If we breach 75 MB, the next conversation re-opens the tier question — but with measurements, not assumptions.

## When to revisit

Re-read this doc and re-measure if any of the following becomes true:

1. **Bun runtime drops materially** (e.g. `bun --compile --slim` lands a 20 MB runtime). Then the 5 MB exporter delta becomes a 25 MB delta and a tier potentially earns its keep.
2. **A new exporter adds > 5 MB to the compiled binary.** The current "everything fits in 70 MB" math depends on each exporter being small once tree-shaken; a heavyweight format would re-open the question.
3. **A new distribution channel emerges with hard size limits.** Today every channel (Homebrew, .deb, GitHub Release, npm) tolerates ~70 MB without complaint.
4. **Profile data shows users actually want a smaller download.** No one has asked yet; the current premise is "if we measured wrong, fix it; don't speculate."

## Distribution channels (current)

- **GitHub Releases:** six binaries per release (`nowline-macos-arm64`, `nowline-macos-x64`, `nowline-linux-x64`, `nowline-linux-arm64`, `nowline-windows-x64.exe`, `nowline-windows-arm64.exe`), plus the `nowline.1` man page (mdoc, hand-authored — see m2l in [`specs/milestones.md`](./milestones.md)).
- **Homebrew:** one `Formula/nowline.rb` in `lolay/tap`. Auto-updated by [`.github/workflows/release.yml`](../.github/workflows/release.yml). Installs the binary at `bin/nowline` and the man page at `share/man/man1/nowline.1` via a `resource "manpage"` block.
- **Debian/Ubuntu:** one `nowline_<version>_<arch>.deb` per arch. Installs the binary at `/usr/bin/nowline` and the man page at `/usr/share/man/man1/nowline.1.gz` (`gzip -n -9` for byte-stable output, per Debian policy 12.3). No `Conflicts:` / `Replaces:` plumbing.
- **npm:** `@nowline/cli` (a JS package that runs on user-installed Node 22+ or Bun). Much smaller than the standalone binary because the runtime is the user's. The `"man"` field in `package.json` makes `npm install -g` install the man page on Unix.
- **Library packages:** every `@nowline/core`, `@nowline/layout`, `@nowline/renderer`, `@nowline/export-core`, and `@nowline/export-*` continues to ship to npm independently.

## Related decisions retained from m2c

- **Per-format package boundary** (m2c Resolution § 1): unchanged. Seven packages plus `@nowline/export-core` is still the right shape because it serves **library** consumers (browsers, LSPs, embed scripts) that want format granularity. The CLI happens to bundle all of them; that's a CLI choice, not a packaging change.
- **Dynamic `import()` for format dispatch** (m2c § 3 "CLI import strategy"): unchanged. Still useful for cold-path avoidance and future flexibility.
- **Font resolver, asset pipeline, determinism contracts** (m2c § 10, etc.): unchanged. The collapse is only about which export packages bundle into the CLI binary; nothing about how those packages work.
