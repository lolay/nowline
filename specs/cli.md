# Nowline — CLI Specification

## Overview

The `nowline` command-line tool parses `.nowline` files and produces visual output. It is the primary interface for m2 and the foundation that all other tools build on.

**Package:** `@nowline/cli` in `lolay/nowline` monorepo.
**License:** Apache 2.0.
**Milestones:** the CLI ships in three parts: m2a (scaffold + `validate`, `convert`, `init`, `version` + distribution pipeline), m2b (`render` with SVG output + `serve`), m2c (other output formats for `render`). Each depends on m1 DSL.

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

## Commands

### `nowline render`

Render a `.nowline` file to a visual output.

```
nowline render <input> [options]

Arguments:
  input                  Path to .nowline file (required)

Options:
  -o, --output <path>    Output file path (default: stdout for SVG, required for PNG/PDF)
  -f, --format <fmt>     Output format: svg, png, pdf, html, mermaid, xlsx, msproj (default: svg)
  -t, --theme <name>     Theme: light, dark (default: light)
  -w, --width <px>       Output width in pixels (default: auto-fit)
  --scale <n>            Scale factor for PNG output (default: 2)
  --no-links             Omit link icons from output
  --quiet                Suppress non-error output
```

Examples:

```bash
nowline render roadmap.nowline                           # SVG to stdout
nowline render roadmap.nowline -o roadmap.svg            # SVG to file
nowline render roadmap.nowline -o roadmap.png -f png     # PNG
nowline render roadmap.nowline -f mermaid -o roadmap.md  # Mermaid markdown
```

### `nowline validate`

Parse and validate a `.nowline` file without rendering. Exits with code 0 on success, non-zero on errors.

```
nowline validate <input>

Arguments:
  input                  Path to .nowline file (required)

Options:
  --format <fmt>         Error format: text, json (default: text)
```

Output on error:

```
roadmap.nowline:7:34 error: Unknown reference 'auth-refactro' in after — did you mean 'auth-refactor'?
roadmap.nowline:12:1 error: Circular dependency: audit-log → sso → audit-log
```

### `nowline convert`

Convert between `.nowline` text and JSON (AST). Input format is detected automatically from the file extension (`.nowline` or `.json`). Useful for tooling integration, programmatic generation, and CI pipelines.

```
nowline convert <input> [options]

Arguments:
  input                  Path to .nowline or .json file (required)

Options:
  -o, --output <path>    Output file path (default: stdout)
  -f, --format <fmt>     Output format: json, nowline (default: inferred from output extension, or opposite of input)
```

Examples:

```bash
nowline convert roadmap.nowline                           # text → JSON to stdout
nowline convert roadmap.nowline -o roadmap.json           # text → JSON file
nowline convert roadmap.json                              # JSON → text to stdout
nowline convert roadmap.json -o roadmap.nowline           # JSON → text file
nowline convert roadmap.nowline | jq '.items[]'           # pipe AST to jq
```

### `nowline init`

Create a starter `.nowline` file in the current directory.

```
nowline init [options]

Options:
  --name <name>          Roadmap name (default: "My Roadmap")
  --template <t>         Template: minimal, teams, product (default: minimal)
```

### `nowline serve` (m2b)

Start a local dev server that watches a `.nowline` file and live-reloads the rendered output in the browser. Primarily for editors without a native preview panel (Neovim, Emacs, Sublime, etc.).

```
nowline serve <input> [options]

Arguments:
  input                  Path to .nowline file (required)

Options:
  -p, --port <n>         Port number (default: 3000)
  --open                 Open browser automatically
```

### `nowline version`

Print the version and exit.

```
nowline version
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error (parse failure, invalid references) |
| 2 | File not found or unreadable |
| 3 | Output error (cannot write to destination) |

## Piping and Composability

The CLI is designed for Unix composability:

```bash
# Pipe SVG to clipboard (macOS)
nowline render roadmap.nowline | pbcopy

# Validate all .nowline files in a directory
find . -name '*.nowline' -exec nowline validate {} \;

# Convert to PNG and open
nowline render roadmap.nowline -f png -o /tmp/roadmap.png && open /tmp/roadmap.png

# Pipe AST JSON to jq for analysis
nowline convert roadmap.nowline | jq '.items[] | select(.status == "at-risk")'
```

## Configuration

The CLI reads an optional `.nowlinerc` file (JSON or YAML) from the current directory or any parent directory:

```json
{
  "theme": "dark",
  "defaultFormat": "svg",
  "width": 1200
}
```

CLI flags override config file values. Environment variables are not supported in m2a/m2b/m2c — keep it simple.

## Distribution Pipeline

1. **npm publish:** `@nowline/cli` published to npm. Users can `npx nowline render ...` without global install.
2. **GitHub Releases:** `bun compile` binaries attached to each GitHub Release tag. Windows `.exe` binaries (x64, arm64) are the primary Windows distribution — direct download, no package manager needed.
3. **Homebrew:** Custom tap (`lolay/tap`) with a formula that downloads the macOS or Linux binary. Also works in WSL.
4. **apt:** `.deb` packages published to a PPA or GitHub Releases.

## Binary Size Budget

Target: **<60MB** per platform binary via `bun compile`. This is comparable to:

- Deno (~40MB)
- Bun itself (~50MB)
- D2 (~30MB, Go-based)

Acceptable for a developer tool installed once. The npm package is much smaller since it requires a Node.js/Bun runtime.
