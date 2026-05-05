# Nowline — CLI Specification

## Overview

The `nowline` command-line tool parses `.nowline` files and produces visual output. It is the primary interface for m2 and the foundation that all other tools build on.

The CLI is **verbless** by design: `nowline <input>` renders by default. Operations that aren't render are flags on the same invocation (`--serve`, `--init`, `--dry-run`). One shape, one CLI surface — matching the convention used by mmdc, dot, d2, pandoc, prettier, tsc.

**Package:** `@nowline/cli` in `lolay/nowline` monorepo.
**License:** Apache 2.0.
**Milestones:** the CLI ships in three parts: m2a (scaffold + `validate` / `convert` / `init` / `version` verbs + distribution pipeline), m2b (`render` + `serve` verbs, SVG output), m2b.5 (verbless redesign — current shape), m2c (every other output format on the same verbless invocation). Each depends on m1 DSL.

## Installation

### Package Managers

| Platform | Command |
|----------|---------|
| macOS | `brew install lolay/tap/nowline` |
| Linux / WSL | `brew install lolay/tap/nowline` or `sudo apt-get install nowline` (via PPA or .deb) |
| Windows | Direct download from GitHub Releases (`.exe`) |
| npm (any platform) | `npm install -g nowline` |

### Standalone Binaries

`bun compile` produces self-contained binaries (~55MB) with no runtime dependency. Published as GitHub Release assets for:

- macOS arm64 (Apple Silicon)
- macOS x64 (Intel)
- Linux x64
- Linux arm64
- Windows x64
- Windows arm64 (Parallels, Snapdragon laptops)

m2c introduces a **tiny / full** split — see [`specs/handoffs/m2c.md`](./handoffs/m2c.md) § 11. Both binaries share the same flag surface.

## CLI Surface

```
nowline <input> [options]

  <input>                Path to .nowline or .json file, or `-` for stdin
                         (required unless --init or --version or --help)

I/O options
  -f, --format <fmt>     Output format: svg, png, pdf, html, mermaid, xlsx, msproj
                         Default: inferred from -o extension, else .nowlinerc
                         `defaultFormat`, else svg
  -o, --output <path>    Output file path. Use `-` for stdout (Unix dash convention)
                         Default: <cwd>/<input-base>.<format>
                         Overwrites existing files without prompting.
  --input-format <fmt>   Force input format: nowline | json (default: by extension)

Mode flags (mutually exclusive)
  --serve [-p <port>]    Live HTTP preview; -o opt-in writes output on each rebuild
                         Default port: 4318. --open to open browser.
  --init [<name>]        Scaffold a starter .nowline file; positional becomes name
                         Default: roadmap.nowline in cwd
  --dry-run, -n          Run full pipeline (parse + validate + layout + format)
                         but skip the write step. Subsumes the old `validate` verb.
                         Exit 0 on success, 1 on validation error.

Render options
  -t, --theme <name>     light | dark
  --now <date>           "Now" anchor for now-line / date math (YYYY-MM-DD).
                         Default: today (the OS calendar date in UTC).
                         Pass `--now -` to suppress the now-line entirely
                         (Unix-`-` sentinel; same convention as `-o -`).
  --no-links             Omit link icons from output
  -s, --scale <n>        Raster scale factor (PNG only; default 1)
  --strict               Promote asset / sanitizer warnings to errors
  -w, --width <px>       Canvas width in pixels (default: 1280)
  --asset-root <dir>     Directory from which logo / image assets may be loaded

Format-specific options
  --page-size <size>     PDF page size: preset (letter | legal | tabloid |
                         ledger | a1..a5 | b3..b5), `content` for auto-fit,
                         or `WxHunit` for custom (e.g. 8.5x11in, 210x297mm).
                         Default: letter.
  --orientation <name>   PDF orientation: portrait | landscape | auto.
                         Default: auto.
  --margin <length>      PDF page margin. Bare numbers are points;
                         length suffixes (in, mm, cm) are accepted.
                         Default: 36pt (½ inch).
  --font-sans <ref>      Sans font for PNG/PDF: TTF/OTF path, or alias
                         (sf, helvetica, dejavu, etc.). Default: platform
                         probe → bundled DejaVu fallback.
  --font-mono <ref>      Mono font for PNG/PDF. Default: same as --font-sans
                         resolution chain.
  --headless             Skip platform font probe; force bundled DejaVu pair.
                         Byte-stable across machines.
  --start <date>         MS Project: anchor date (YYYY-MM-DD) for relative
                         roadmaps. Default: --now, then deterministic
                         fallback.

Logging (mutually exclusive)
  -v, --verbose          Print extra diagnostics to stderr (config path,
                         pipeline timings, font resolution, fallback decisions)
  -q, --quiet            Suppress non-error stderr

Standard
  -h, --help             Print help and exit 0
  -V, --version          Print version and exit 0
```

`nowline` with **zero arguments** prints help and exits 0 (matches git, kubectl, gh, cargo, docker). `nowline -f pdf` (has flags, no input) exits 2 with a "missing input file" error.

`-V` (uppercase) is `--version`; lowercase `-v` is `--verbose`. Matches curl / ssh / wget / gpg convention.

## Examples

```bash
nowline roadmap.nowline                          # writes ./roadmap.svg in cwd
nowline roadmap.nowline -f pdf                   # writes ./roadmap.pdf in cwd
nowline roadmap.nowline -o roadmap.pdf           # format inferred from extension
nowline roadmap.nowline -o -                     # stdout (Unix `-` convention)
nowline roadmap.json -f svg                      # JSON-AST input
cat foo.nowline | nowline -                      # stdin → ./roadmap.svg
nowline roadmap.nowline -f json -o roadmap.json  # convert (no separate verb)
nowline roadmap.nowline --dry-run                # validate-only; no file written
nowline roadmap.nowline --serve -p 8080          # live preview server
nowline --init                                   # scaffold ./roadmap.nowline
nowline --init my-project                        # scaffold ./my-project.nowline
nowline roadmap.nowline -f pdf -o report         # writes report.pdf (auto-extension)
nowline                                          # no args → prints help, exits 0
```

## Mode Flags

### Default — render

`nowline <input> [options]`. Renders `<input>` to the resolved format and writes to the resolved output path. This is the most common operation.

### `--serve`

Start a local dev server that watches a `.nowline` file and live-reloads the rendered output in the browser. Primarily for editors without a native preview panel (Neovim, Emacs, Sublime, etc.).

```bash
nowline roadmap.nowline --serve
nowline roadmap.nowline --serve --port 4400 --theme dark
nowline roadmap.nowline --serve -o roadmap.svg     # also writes file on each rebuild
```

Options:

| Flag | Default | Notes |
|------|---------|-------|
| `-p, --port <n>` | `4318` | Port to bind |
| `--host <host>` | `127.0.0.1` | Interface; `0.0.0.0` exposes on the LAN |
| `--open` | off | Open the browser on start |
| `-o, --output <path>` | none | Opt-in: also write the rendered output to this path on every rebuild. `-o -` is rejected for `--serve`. |

`--serve` rejects `--dry-run`.

### `--init [<name>]`

Scaffold a starter `.nowline` file in the current directory.

```bash
nowline --init                       # writes ./roadmap.nowline
nowline --init my-project            # writes ./my-project.nowline (extension appended)
nowline --init my-project.nowline    # writes ./my-project.nowline (literal)
nowline --init -o ./roadmaps/q1.nowline   # -o overrides path
```

The positional argument is the project *name*, not an input path.

- No extension → append `.nowline`.
- Already `.nowline` → literal.
- Other extension → exit 2 with `nowline: --init only scaffolds .nowline files; got "..."`.
- Missing positional → name `roadmap`.
- `-o` always overrides the default path.

Existing files at the destination are silently overwritten.

`--init` rejects `--dry-run`.

### `--dry-run` (`-n`)

Run the full pipeline (parse + validate + layout + format) but skip the write step. Replaces the old `nowline validate` verb. Works with any format — `nowline roadmap.nowline -f pdf --dry-run` exercises the PDF exporter without producing a file.

```bash
nowline roadmap.nowline --dry-run                     # validate .nowline → svg pipeline
nowline roadmap.nowline -f pdf --dry-run              # validate full PDF pipeline (m2c)
nowline roadmap.nowline --dry-run --format=json       # JSON diagnostics on stderr
```

Exit 0 on success, 1 on validation error.

### `--version` / `-V` and `--help` / `-h`

Print version or help to stdout and exit 0. Combined with any other flag, the standard flag wins (matches GNU coreutils).

## Behavior Contracts

### Format resolution

Precedence chain (first hit wins):

1. **`-f` / `--format` flag** — explicit always wins.
2. **`-o <path>` extension** — recognized output extension.
3. **`.nowlinerc` `defaultFormat`** — project-level default.
4. **`svg`** — built-in fallback.

Recognized extension → format map (also the canonical-extension table for auto-add):

| Extension | Format |
|-----------|--------|
| `.svg` | `svg` |
| `.png` | `png` |
| `.pdf` | `pdf` |
| `.html`, `.htm` | `html` |
| `.md`, `.markdown` | `mermaid` |
| `.xlsx` | `xlsx` |
| `.xml` | **not inferred** — ambiguous; `-f msproj` is required |
| any other | falls through to step 3 |

Conflict handling: if `-f` and `-o` extension disagree (e.g. `nowline foo.nowline -f pdf -o foo.png`), `-f` wins and the output file keeps whatever name the user wrote — no auto-rename. `-o -` (stdout) skips step 2 entirely.

### Output extension auto-add

After format is resolved, the output path may be rewritten:

- `-o <path>` ending in **no extension** → append the canonical extension for the resolved format. (`-o report -f pdf` → `report.pdf`.)
- `-o <path>` ending in the canonical extension for the resolved format → use as-is.
- `-o <path>` ending in any **other** extension → use as-is, no auto-rename. (`-o foo.txt -f pdf` writes PDF bytes to `foo.txt`.)
- Default-named output (no `-o`) is unaffected.
- `-o -` (stdout) skips auto-add.

### Default output filename

All default-named outputs land in **cwd**, never next to the input.

| Mode | Default path |
|------|--------------|
| Render with file input | `<cwd>/<input-base>.<format>` |
| Render with stdin | `<cwd>/roadmap.<format>` |
| Init | `<cwd>/<name>.nowline` (default name `roadmap`) |
| Convert (now `-f` + `-o`) | Same cwd rule |

Existing files are silently overwritten — matches POSIX redirection (`> file`), mmdc, d2, prettier, tsc.

### Stdout

- `-o -` is the only way to write to stdout (Unix dash convention; matches mmdc, d2, pandoc, ffmpeg).
- Textual formats (svg, html, mermaid, json, .nowline, msproj) always work on stdout.
- Binary formats (png, pdf, xlsx) on stdout: work if stdout is a pipe; refused with exit 2 if stdout is a TTY (`nowline: binary output (png) to terminal refused; use -o or pipe to a file`). Curl convention.

### Input

- Detected by extension: `.nowline` → DSL, `.json` → AST.
- `--input-format` overrides for unusual filenames or stdin.
- Stdin (`-`) defaults to `.nowline`.
- The standard `--` "end of options" marker handles filenames that start with `-`.

## Diagnostics

Default text format renders biome / oxc-style frames via `@babel/code-frame`:

```
roadmap.nowline:7:34 error: Unknown reference 'auth-refactro' in after — did you mean 'auth-refactor'?
  5 |   item auth-refactor "Auth refactor" size:l
  6 |   parallel after:auth-refactor
> 7 |     group audit-track "Audit Track" labels:security
    |                                     ^^^^^^^^^^^^^^^
  8 |       item audit-log "Audit log v2" size:xl before:code-freeze
```

JSON diagnostics (`--format=json` on `--dry-run`) emit `{ "$nowlineDiagnostics": "1", "diagnostics": Diagnostic[] }`. Diagnostic shape:

```ts
type Diagnostic = {
  file: string;
  line: number;        // 1-based
  column: number;      // 1-based
  severity: 'error' | 'warning';
  code: string;
  message: string;
  suggestion?: string;
};
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error (parse failure, invalid references) |
| 2 | Usage error (missing input, invalid flags, mutually-exclusive flags, format unavailable in this build, binary output to TTY, file not found, unreadable input) |
| 3 | Output error (cannot write to destination, exporter pipeline failure) |

## Piping and Composability

The CLI is designed for Unix composability:

```bash
# Pipe SVG to clipboard (macOS)
nowline roadmap.nowline -o - | pbcopy

# Validate all .nowline files in a directory
find . -name '*.nowline' -exec nowline {} --dry-run \;

# Render to PNG and open
nowline roadmap.nowline -f png -o /tmp/roadmap.png && open /tmp/roadmap.png

# Pipe AST JSON to jq for analysis
nowline roadmap.nowline -f json -o - | jq '.ast.roadmapEntries[]'

# Convert JSON AST back to .nowline text
nowline roadmap.json -f nowline -o roadmap.nowline
```

## Configuration

The CLI reads an optional `.nowlinerc` file (JSON or YAML) from the current directory or any parent directory:

```json
{
  "theme": "dark",
  "defaultFormat": "svg",
  "width": 1200,
  "quiet": false
}
```

CLI flags override config file values. Environment variables are not supported in m2 — keep it simple.

The `defaultFormat` key participates in the format-resolution chain (step 3): used when neither `-f` nor a recognized `-o` extension is present.

## Distribution Pipeline

1. **npm publish:** `@nowline/cli` published to npm. Users can `npx nowline roadmap.nowline` without global install.
2. **GitHub Releases:** `bun compile` binaries attached to each GitHub Release tag. Windows `.exe` binaries (x64, arm64) are the primary Windows distribution — direct download, no package manager needed.
3. **Homebrew:** Custom tap (`lolay/tap`) with a formula that downloads the macOS or Linux binary. Also works in WSL.
4. **apt:** `.deb` packages published to a PPA or GitHub Releases.

m2c introduces a tiny / full split (see [`specs/handoffs/m2c.md`](./handoffs/m2c.md) § 11). The flag surface is identical between the two; the tiny binary refuses formats it doesn't include with a "available in nowline-full" exit-2 message.

## Binary Size Budget

Target: **<60MB** per platform binary via `bun compile`. This is comparable to:

- Deno (~40MB)
- Bun itself (~50MB)
- D2 (~30MB, Go-based)

Acceptable for a developer tool installed once. The npm package is much smaller since it requires a Node.js/Bun runtime.
