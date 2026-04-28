# @nowline/cli

The `nowline` command-line tool parses, validates, and renders `.nowline` roadmap files.

**License:** Apache 2.0
**Part of:** [`lolay/nowline`](https://github.com/lolay/nowline) monorepo

## Install

```bash
# macOS / Linux / WSL
brew install lolay/tap/nowline

# Debian / Ubuntu (download .deb from GitHub Releases)
curl -L -o nowline.deb https://github.com/lolay/nowline/releases/latest/download/nowline_amd64.deb
sudo dpkg -i nowline.deb

# Windows — direct .exe download from GitHub Releases
#   (unsigned; see SmartScreen walkthrough below)

# npm (any platform)
npm install -g @nowline/cli
# or one-shot: npx @nowline/cli roadmap.nowline -o -
```

## Usage

`nowline` is **verbless**: rendering is the default. Other modes are flags on the same command:

```bash
nowline <input> [options]              # render (default)
nowline <input> --serve [-p <port>]    # live HTTP preview
nowline --init [<name>]                # scaffold a starter file
nowline <input> --dry-run              # validate-only (no write)
nowline --help                         # print help
nowline --version                      # print version
nowline                                # no args → print help
```

### Examples

```bash
nowline roadmap.nowline                          # writes ./roadmap.svg in cwd
nowline roadmap.nowline -f pdf                   # writes ./roadmap.pdf in cwd  (m2c)
nowline roadmap.nowline -o roadmap.pdf           # format inferred from extension
nowline roadmap.nowline -o -                     # SVG → stdout (Unix dash)
nowline roadmap.json -f svg                      # JSON-AST input
cat foo.nowline | nowline -                      # stdin → ./roadmap.svg
nowline roadmap.nowline -f json -o roadmap.json  # convert text → JSON
nowline roadmap.nowline --dry-run                # validate-only; nothing written
nowline roadmap.nowline --serve -p 8080          # live preview on :8080
nowline --init                                   # ./roadmap.nowline
nowline --init my-project                        # ./my-project.nowline
nowline roadmap.nowline -f pdf -o report         # auto-extension → report.pdf
```

## Flags

### I/O

| Flag                       | Default                                | Notes                                          |
|----------------------------|----------------------------------------|------------------------------------------------|
| `-f, --format <fmt>`       | inferred                               | `svg`, `png`, `pdf`, `html`, `mermaid`, `xlsx`, `msproj`, `json`, `nowline`. |
| `-o, --output <path>`      | `<cwd>/<input-base>.<format>`           | `-` for stdout. Existing files silently overwritten. |
| `--input-format <fmt>`     | by extension; stdin → `nowline`        | `nowline` or `json`.                            |

### Mode flags (mutually exclusive)

| Flag                | Description                                                       |
|---------------------|-------------------------------------------------------------------|
| `--serve`           | Live HTTP preview. Opt-in `-o <path>` writes on each rebuild.     |
| `--init [<name>]`   | Scaffold a starter `.nowline` in cwd. Auto-appends `.nowline`.    |
| `-n, --dry-run`     | Run pipeline; skip the write. Replaces the old `validate` verb.   |

### Render options

| Flag                  | Default      | Notes                                       |
|-----------------------|--------------|---------------------------------------------|
| `-t, --theme <name>`  | `light`      | `light` \| `dark`.                          |
| `--today YYYY-MM-DD`  | system today | Override the now-line anchor.               |
| `--no-links`          | (off)        | Omit link icons from items.                 |
| `-s, --scale <n>`     | `1`          | Raster scale (PNG only; m2c).               |
| `--strict`            | (off)        | Promote asset / sanitizer warnings to errors. |
| `-w, --width <px>`    | `1280`       | Canvas width.                                |
| `--asset-root <dir>`  | input dir    | Root for `logo:` / image refs.              |

### Serve options

| Flag                 | Default     |
|----------------------|-------------|
| `-p, --port <n>`     | `4318`      |
| `--host <host>`      | `127.0.0.1` |
| `--open`             | (off)       |

### Logging (mutually exclusive)

| Flag             | Description                          |
|------------------|--------------------------------------|
| `-v, --verbose`  | Extra diagnostics on stderr.         |
| `-q, --quiet`    | Suppress non-error stderr.           |

### Standard

| Flag             | Description                          |
|------------------|--------------------------------------|
| `-h, --help`     | Print help, exit 0.                  |
| `-V, --version`  | Print version, exit 0.               |

## Behavior contracts

### Format resolution (precedence chain)

1. **`-f / --format` flag** — explicit always wins.
2. **`-o <path>` extension** — recognized: `.svg`, `.png`, `.pdf`, `.html`/`.htm`, `.md`/`.markdown` (mermaid), `.xlsx`, `.json`, `.nowline`. `.xml` is **ambiguous** and requires `-f msproj`.
3. **`.nowlinerc` `defaultFormat`** — project default.
4. **`svg`** — built-in fallback.

If `-f` and `-o` extension disagree, `-f` wins and the output filename is preserved as written (no auto-rename).

### Output extension auto-add

- `-o report -f pdf` → `report.pdf` (no extension → append canonical).
- `-o report.pdf -f pdf` → `report.pdf` (matching → leave alone).
- `-o foo.txt -f pdf` → `foo.txt` (mismatched → leave alone, write PDF bytes there).
- `-o -` (stdout) is never rewritten.

### Default output paths

All default-named outputs land in **cwd**:

- File input: `<cwd>/<input-base>.<format>`.
- Stdin input: `<cwd>/roadmap.<format>`.
- `--init` (no `-o`): `<cwd>/<name>.nowline` (default name `roadmap`).

Existing files are silently overwritten — no `--force` flag, matching POSIX redirection and peer tools (mmdc, d2, prettier, tsc).

### Stdout

- `-o -` is the only way to write to stdout (Unix dash convention).
- Binary formats (png, pdf, xlsx) on a TTY are refused with exit 2 (`nowline: binary output (png) to terminal refused; use -o or pipe to a file`). Pipes / redirects are fine.

### Mode dispatch

Mutual exclusivity rules (all exit 2 with a message):

- `--serve` + `--init`.
- `--dry-run` + `--serve` (serve doesn't write by default).
- `--dry-run` + `--init` (init *is* the write).
- `-v / --verbose` + `-q / --quiet`.

`nowline` (no args) prints help and exits 0 (matches git, kubectl, gh, cargo, docker).

### Exit codes

| Code | Meaning |
|------|---------|
| 0    | Success |
| 1    | Validation error |
| 2    | Usage error (missing input, bad flags, unsupported format, file not found, binary→TTY refusal) |
| 3    | Output error (cannot write to destination) |

## Configuration: `.nowlinerc`

On any operation that takes an `<input>` file, `nowline` walks up from the input file's directory looking for a `.nowlinerc` (JSON or YAML). The nearest one wins. CLI flags override config values. Environment variables are not consulted.

```yaml
# .nowlinerc (YAML)
theme: dark
defaultFormat: svg
width: 1200
```

```json
{
  "theme": "dark",
  "defaultFormat": "svg",
  "width": 1200
}
```

Unknown keys are ignored.

## Validation (`--dry-run`)

```bash
nowline roadmap.nowline --dry-run
nowline roadmap.nowline -n                       # short alias
nowline roadmap.nowline -n --diagnostic-format json
```

Each diagnostic is rendered in a biome/oxc-style frame via `@babel/code-frame`:

```
roadmap.nowline:7:34 error: Unknown reference 'auth-refactro' in after — did you mean 'auth-refactor'?
  5 |   item auth-refactor "Auth refactor" duration:l
  6 |   parallel after:auth-refactor
> 7 |     group audit-track "Audit Track" labels:security
    |                                     ^^^^^^^^^^^^^^^
  8 |       item audit-log "Audit log v2" duration:xl before:code-freeze
```

`--diagnostic-format json` emits the stable diagnostic schema:

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

Exit 0 if no errors; exit 1 if any errors. Warnings never change the exit code.

## JSON AST round-trip

`-f json` emits the JSON AST; `-f nowline` re-prints canonical `.nowline`:

```bash
nowline roadmap.nowline -f json -o roadmap.json   # text → JSON
nowline roadmap.json -f nowline -o roadmap.nowline # JSON → text (canonical)
```

The JSON form is a **versioned, published contract** (`$nowlineSchema: "1"`) intended for MCP (m7) and editor (m5) round-trips:

```ts
type NowlineDocument = {
  $nowlineSchema: "1";
  file: { uri: string; source: string };
  ast: NowlineFileNode;
};
```

Every node carries `$type`, `$position`, and the properties defined by the corresponding `@nowline/core` AST interface. Container back-references (`$container`, `$containerProperty`, `$containerIndex`) are omitted — parent-child relationship is captured by document structure.

### Canonical `.nowline` printer rules

- **Indent:** 2 spaces.
- **Positional order on declaration lines:** `id` → `title` → keyed properties.
- **Keyed-property order:** `date, length, on, duration, status, owner, after, before, remaining, labels, style, link, (any remaining keys, alphabetical)`.
- **List shape:** single-element lists render as bare (`labels:enterprise`); multi-element lists use bracket form (`labels:[enterprise, security]`).
- **`description` sub-directive:** rendered on its own line indented one level under its host.
- **Comments:** not preserved across round-trips. Documented limitation; a follow-up grammar ticket will add trivia support.

Round-trip property: for every file in `examples/`, `text → json → text` and `json → text → json` are idempotent modulo comment loss. Enforced by the test suite.

## `--serve`

Live-reload preview. Opens a minimal HTML shell at `http://<host>:<port>/` that fetches `/svg` and subscribes to `/events` (SSE). On file changes, the server re-parses, re-validates, re-lays-out, and re-renders; clients refresh automatically. Validation errors appear as an overlay on top of the most recent successful render.

```bash
nowline roadmap.nowline --serve
nowline roadmap.nowline --serve -p 4400 -t dark --open
nowline roadmap.nowline --serve -o latest.svg     # rewrites latest.svg on each rebuild
```

`--serve` is intended for local authoring only. It is not a production preview service. `-o -` (stdout) is rejected.

## `--init`

Create a starter `.nowline` file in the current directory. Three templates (`minimal`, `teams`, `product`) correspond to the three files in `examples/` and are embedded into the CLI at build time — binaries are self-contained.

- Positional argument is the **project name**, not a file path.
- `.nowline` is auto-appended if missing.
- Other extensions (`.txt`, `.json`) are rejected with exit 2.
- Existing files are silently overwritten.

```bash
nowline --init                    # ./roadmap.nowline (default name)
nowline --init my-project         # ./my-project.nowline (auto-append)
nowline --init my-plan.nowline    # ./my-plan.nowline (literal)
nowline --init --template product # use the product template
```

## Arg parser choice

`@nowline/cli` parses arguments with Node's native [`util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig). Reasons:

- Zero runtime dependency.
- Native short/long flag support, kebab-case option names, mixed-position positionals, and the `--` end-of-options sentinel.
- Verbless dispatch is straightforward — modes are just boolean flags resolved after parsing.

Supporting libraries:

- [`@babel/code-frame`](https://babeljs.io/docs/babel-code-frame) — biome/oxc-style source excerpts with caret/tilde underlines for `--dry-run` text output.
- [`js-yaml`](https://github.com/nodeca/js-yaml) — `.nowlinerc` YAML parsing (JSON also supported).

## Distribution

Binaries are produced with `bun compile` for six targets (macOS arm64/x64, Linux x64/arm64, Windows x64/arm64) and attached to every GitHub Release. Budget is **<60 MB** per binary; CI asserts on disk.

### Windows SmartScreen walkthrough

The shipped `.exe` binaries are **unsigned**. Windows may show a SmartScreen warning ("Windows protected your PC"). To run the downloaded binary:

1. Right-click the `.exe` → **Properties**.
2. Check **Unblock** at the bottom of the **General** tab → **OK**.
3. Run the binary from a terminal (`cmd` or PowerShell).

Corporate endpoints may block unsigned binaries entirely. In that case, `npm install -g @nowline/cli` (which runs on Node/Bun) is an alternative.
