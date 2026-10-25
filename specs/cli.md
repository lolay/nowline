# Nowline — CLI Specification

## Overview

The `nowline` command-line tool parses `.nowline` files and produces visual output. It is the primary interface for m2 and the foundation that all other tools build on.

The CLI is **verbless** by design: `nowline <input>` renders by default. Operations that aren't render are flags on the same invocation (`--serve`, `--init`, `--dry-run`). One shape, one CLI surface — matching the convention used by mmdc, dot, d2, pandoc, prettier, tsc.

**Package:** `@nowline/cli` in `lolay/nowline` monorepo.
**License:** Apache 2.0.
**Milestones:** the CLI ships in three parts: m2a (scaffold + `validate` / `convert` / `init` / `version` verbs + distribution pipeline), m2b (`render` + `serve` verbs, SVG output), m2b.5 (verbless redesign — current shape), m2c (every other output format on the same verbless invocation). m4.8 adds `--mcp` (MCP server mode; see below). Each depends on m1 DSL.

## Installation

### Package Managers

| Platform | Command |
|----------|---------|
| macOS | `brew trust lolay/tap && brew install lolay/tap/nowline` |
| Linux / WSL | `brew trust lolay/tap && brew install lolay/tap/nowline` or download `.deb` from [GitHub Releases](https://github.com/lolay/nowline/releases/latest) |
| Windows | Direct download from GitHub Releases (`.exe`) |
| npm (any platform) | `npm install -g nowline` |

Each of the Unix paths (Homebrew, `.deb`, npm) ships the [`packages/cli/man/nowline.1`](../packages/cli/man/nowline.1) and [`packages/cli/man/nowline.5`](../packages/cli/man/nowline.5) man pages, so `man nowline` (CLI flags + LANGUAGE cheatsheet) and `man 5 nowline` (full DSL reference) both work immediately after install. See [`specs/cli-distribution.md`](./cli-distribution.md) for the per-channel install layout.

### Standalone Binaries

`bun compile` produces self-contained binaries (~55MB) with no runtime dependency. Published as GitHub Release assets for:

- macOS arm64 (Apple Silicon)
- macOS x64 (Intel)
- Linux x64
- Linux arm64
- Windows x64
- Windows arm64 (Parallels, Snapdragon laptops)

A single `nowline` binary ships per platform with every export format bundled — see [`specs/cli-distribution.md`](./cli-distribution.md). (The original m2c plan was a tiny/full split; that decision was reversed after measuring that the bun runtime dominates compiled-binary size.)

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
  --mcp [--port <n>]     Start an MCP server in stdio mode (default) or local Streamable HTTP
                         (`--port`). Exposes the CLI's capabilities as a typed MCP
                         tool surface. `npx @nowline/mcp` is the canonical
                         harness-install path; `nowline --mcp` is the power-user
                         equivalent. See [`specs/mcp.md`](./mcp.md).
  --mcp-install [<client>]
                         Register the MCP server with an agent harness
                         (`--scope`, `--server`, `--root`, `-n`). Omit the
                         client to install into every harness found.
  --mcp-uninstall [<client>]
                         Remove it from the same configs.

Render options
  -t, --theme <name>     light | dark | grayscale (greyscale alias)
  --now <date>           "Now" anchor for the now-line. Accepted forms:
                           YYYY-MM-DD                   — floating date (zone-independent)
                           YYYY-MM-DDTHH:MM:SSZ         — UTC instant; embedded Z wins
                           YYYY-MM-DDTHH:MM:SS±HH:MM    — fixed-offset instant; offset wins
                           YYYY-MM-DDTHH:MM:SS          — floating datetime; date part used
                         The date part must be a real calendar day:
                         `2026-02-30` exits 2 (input error) rather than
                         rolling over to March 2.
                         Default: today's local civil date (or --timezone if set).
                         Pass `--now -` to suppress the now-line entirely
                         (Unix-`-` sentinel; same convention as `-o -`).
  --timezone <zone>      Timezone for the clock-based "today" default. Only
                         consulted when --now is omitted; ignored when --now
                         carries an explicit date or embedded ISO offset.
                         Accepted forms:
                           local                        — host zone (default)
                           UTC                          — UTC
                           Z, +00:00                    — zero-offset (= UTC)
                           ±HH, ±HH:MM, ±HHMM          — fixed offset (DST-naive)
                           America/Los_Angeles          — IANA timezone name
                         Ambiguous abbreviations (PST, IST, …) are rejected on
                         most platforms; use IANA names for portable scripts.
  --no-links             Omit link icons from output
  -s, --scale <n>        Raster scale factor (PNG only; default 1)
  --strict               Promote asset / sanitizer warnings to errors
  -w, --width <px>       Maximum canvas width in pixels (default: fit the
                         content). Best-effort: the timeline shrinks to fit,
                         down to 1 px per day; spilled captions can still
                         overflow. See rendering.md § Canvas width.
  --non-working <mode>   How a business calendar's non-working days appear:
                         `hide` (collapse them; the default) or `show` (draw
                         them as shaded bands). Overrides the file's
                         `default roadmap non-working:` key; omit it to let
                         the key apply. An invalid value exits 2 with
                         `nowline: invalid --non-working "x". Expected hide
                         or show.` Mermaid, MS Project, and XLSX output is the
                         same in both views. `--serve` takes it too.
  --asset-root <dir>     Directory from which logo / image assets may be loaded
                         (default: the `.nowlinerc` `assetRoot` key, then the
                         input file's directory). A relative flag resolves
                         against the working directory. `--serve` takes it too.

Format-specific options
  --page-size <size>     PDF page size: preset (letter | legal | tabloid |
                         ledger | a1..a5 | b3..b5), `content` for auto-fit,
                         or `WxHunit` for custom (e.g. 8.5x11in, 210x297mm).
                         Default: letter. Like --orientation and --margin, an
                         invalid value is a usage error (exit 2) for every
                         output format, not only PDF.
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
  --start <date>         MS Project: project start date (YYYY-MM-DD).
                         Default: the roadmap's start:, else --now
                         (today).

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

`-q` drops every stderr line that is not an error: `warning:` lines (font substitution, renderer asset warnings under `--serve`), the MS Project lossy-feature summary, the `--mcp --port` listening banner, and warning-severity diagnostics from the text report of a failing run. It never changes the exit code. Errors still print, and so does machine output: the `--diagnostic-format json` document (including `--dry-run --format=json`) prints whole, warnings included, because a script asked for it. `--serve` still prints its URL to stdout. `-q` and `-v` are command-line only; `.nowlinerc` has no logging key (a `quiet` key is ignored like any unknown key), so a project file cannot silence warnings for everyone who runs it.

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
| `-t, --theme <name>` | `light` | Same names and validation as for render. The page around the chart is dark only for `dark`; `grayscale` uses the light page. |
| `-o, --output <path>` | none | Opt-in: also write the rendered output to this path on every rebuild. `-o -` is rejected for `--serve`. |
| `--non-working <mode>` | file key, else `hide` | `hide` \| `show`; same meaning and validation as for render. |
| `-w, --width <px>` | `.nowlinerc` `width`, else fit the content | Same rule as for render: an integer ≥ 320. |
| `--no-links` | off | Drop the link icons from the served SVG, as for render. |
| `--strict` | off | A render warning, such as a missing logo, is shown as an error instead of a chart, as for render. |
| `--now`, `--timezone`, `--locale`, `--asset-root` | as for render | Same meaning and validation as for render. `--asset-root` defaults to the `.nowlinerc` `assetRoot`. |

`--serve` resolves these options exactly as render does (flag, then `.nowlinerc`, then the built-in default) and stages the roadmap through the same function, so the served SVG is the SVG `nowline <input>` writes for the same flags. A bad value is the same usage error (exit 2) at start-up. Page size, orientation, margin, fonts and `--format` do not apply: `--serve` shows SVG only.

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
nowline roadmap.nowline --dry-run --diagnostic-format json
```

Exit 0 on success, 1 on validation error. Warnings never change the exit code. Diagnostics go to stderr; see [Diagnostics](#diagnostics) for `--diagnostic-format`.

### `--mcp [--port <n>]` (m4.8)

Start a local MCP server that exposes the CLI's capabilities as a typed MCP tool surface.

```bash
nowline --mcp                         # stdio server (default; harness spawns and talks stdin/stdout)
nowline --mcp --port 6789             # local Streamable HTTP server (for harnesses that prefer HTTP transport)
```

Default transport is **stdio** — the harness spawns `nowline --mcp` (or `npx @nowline/mcp`) and communicates over stdin/stdout. This is the MCP CLI form. The `--port` flag switches to local Streamable HTTP (the deprecated standalone SSE transport is not offered), for harnesses that prefer an HTTP transport instead of stdio.

The server exposes the eight shared-contract tools (`validate`, `render`, `read`, `create`, `update`, `delete`, `list`, `export`) — names intentionally identical to the Nowline Pro MCP server contract, so agents graduate from local to cloud with zero relearning — plus OSS conveniences (`convert`, `capabilities`, and the granular `list-themes` / `list-icons` / `list-locales` / `list-formats` / `list-templates` discovery family), three resources (`nowline://reference`, `nowline://examples`, `nowline://conversions`), and three prompts (`create-roadmap`, `fix-diagnostics`, `convert-to-nowline`). Full surface: [`specs/mcp.md`](./mcp.md).

**CLI-design note for review:** `--mcp` is a mode flag on `nowline` (like `--serve` and `--init`) rather than a verb on the separate `@nowline/mcp` package. The separate package (`npx @nowline/mcp`) is the canonical install path for harness configs because it decouples the MCP server's install lifecycle from the CLI binary — a harness using `npx @nowline/mcp` always gets the published npm version, whereas `nowline --mcp` uses whatever binary the user has installed. Either form is valid; `npx @nowline/mcp` is preferred in MCP config examples. See [`specs/mcp.md`](./mcp.md).

`--mcp` rejects `--serve`, `--init`, and `--dry-run`.

### `--mcp-install [<client>]` / `--mcp-uninstall [<client>]`

Register the MCP server with an agent harness, so `brew install nowline && nowline --mcp-install` is the whole setup.

```bash
nowline --mcp-install                          # every harness found on this machine
nowline --mcp-install cursor                   # one harness
nowline --mcp-install claude-code --scope project   # .mcp.json in cwd, for the team
nowline --mcp-install -n                       # print what would change; write nothing
nowline --mcp-uninstall                        # remove the entry from the same configs
```

The positional is a client id: `claude-code`, `claude-desktop`, `cursor`, `vscode`, `codex`, `gemini`, `antigravity`, `muse` (Meta Muse Code), `opencode`, `copilot` (GitHub Copilot CLI), `windsurf`, `zed`, `amp`, `goose`, or `all`. Omitted (or `all`), the CLI installs into every harness it detects: its CLI is on PATH or its config directory exists (for Gemini CLI, its `settings.json`, since Antigravity also lives under `~/.gemini`). An unknown id exits 2. The entry is always named `nowline`, so tools surface as `mcp__nowline__*`.

| Option | Values | Default | Meaning |
|---|---|---|---|
| `--scope` | `user`, `project` | `user` | `user` writes the harness's per-user config (every project); `project` writes the config file in the current directory, for committing. Naming a user-only client (`claude-desktop`, `codex`, `muse`, `windsurf`, `goose`) with `--scope project` exits 2; auto-detection skips them with a note. |
| `--server` | `self`, `npx` | `self` | What gets registered. `self` is the installed `nowline` with `--mcp`, so a Homebrew or `.deb` install needs no Node. `npx` is `npx -y @nowline/mcp` (on Windows, `cmd /c npx …`), which tracks npm independently of the CLI but needs Node visible to the harness. |
| `--root <dir>` | path | none | Resolved against cwd and written into the registered command as `--root <abs>`. Without it the server uses the harness's working directory. |
| `-n`, `--dry-run` | | | Print the change (the entry, the file, or the harness command) without writing or running anything. |

**`self` resolution.** The path is absolute, because GUI harnesses (Claude Desktop, Cursor, VS Code launched from the Dock) don't inherit the shell PATH. For the compiled binary it is the PATH entry whose realpath is the running binary, so Homebrew's `bin/nowline` symlink is registered rather than `Cellar/nowline/<version>/`, and `brew upgrade` carries the server along. If only a Cellar path is known, it is registered with a `warning:`. Running under Node (an npm install or a checkout), the `nowline` shim is a `#!/usr/bin/env node` script a GUI harness may not be able to run, so the absolute Node and the CLI script are registered, with a `warning:` that removing that Node version breaks the entry.

**Per harness.** JSON and JSONC configs are edited in place: comments, key order, indentation, and line endings survive, siblings are untouched, writes are atomic and go through symlinks, and a file that doesn't parse is reported and left alone. Claude Code's user scope and Codex go through the harness's own `claude mcp add` / `codex mcp add`, since `~/.claude.json` is live state and Codex's config is TOML; the CLI first runs the matching `mcp remove` so a re-run replaces a stale entry, with stdin closed and a 30 s timeout. When that binary isn't on PATH, or the config is YAML (Goose) or has no documented path (Amp on Windows), the CLI prints a paste-ready snippet instead.

| Client | User scope | Project scope | Entry |
|---|---|---|---|
| `claude-code` | `claude mcp add --scope user` | `.mcp.json` | `mcpServers.nowline` `{type: "stdio", command, args}` |
| `claude-desktop` | `claude_desktop_config.json` in the OS app-config dir | none | `mcpServers.nowline` |
| `cursor` | `~/.cursor/mcp.json` | `.cursor/mcp.json` | `mcpServers.nowline` |
| `vscode` | `Code/User/mcp.json` in the OS app-config dir | `.vscode/mcp.json` | `servers.nowline` `{type: "stdio", command, args}` |
| `codex` | `codex mcp add`, else a TOML snippet for `$CODEX_HOME/config.toml` | none | `[mcp_servers.nowline]` |
| `gemini` | `~/.gemini/settings.json` | `.gemini/settings.json` | `mcpServers.nowline` |
| `antigravity` | `~/.gemini/config/mcp_config.json` (shared by the Antigravity app, IDE and CLI) | `.agents/mcp_config.json` | `mcpServers.nowline` |
| `muse` | `~/.config/muse/settings.json` | none | `mcp_servers.nowline` `{transport: "stdio", command, args, mode: "optional"}`; a new file gets `schema_version: 1` |
| `opencode` | `$XDG_CONFIG_HOME/opencode/opencode.json[c]` | `opencode.json[c]` | `mcp.nowline` `{type: "local", command: [...], enabled: true}`, or `mcp.servers.nowline` in a v2-layout file |
| `copilot` | `~/.copilot/mcp-config.json` | `.mcp.json` | `mcpServers.nowline` `{type: "local", command, args, tools: ["*"]}` (project: the Claude Code shape) |
| `windsurf` | `~/.codeium/windsurf/mcp_config.json` | none | `mcpServers.nowline` |
| `zed` | `zed/settings.json` in `$XDG_CONFIG_HOME` (Windows: `%APPDATA%\Zed`) | `.zed/settings.json` | `context_servers.nowline` `{command, args, env}` |
| `amp` | `~/.config/amp/settings.json` (Windows: printed `amp mcp add`) | `.amp/settings.json`, then `amp mcp approve nowline` | `"amp.mcpServers".nowline` |
| `goose` | printed YAML for `config.yaml` | none | `extensions.nowline` |

**Output and exit codes.** One line per client on stdout (`created`, `added … to`, `updated … in`, `already installed in`, `removed … from`, `not installed in`, `registered`, or the printed snippet); these are the requested output and print under `-q`. The `self` warnings are `warning:` lines on stderr that `-q` drops. A client that fails (unparseable config, harness CLI exiting non-zero) is reported on stderr and the rest still run; the run then exits 3. No harness found and none named exits 2.

`--mcp-install` and `--mcp-uninstall` are mutually exclusive with each other and with the other mode flags, and accept `--dry-run`. The `.mcpb` bundle remains the Claude Desktop path for users who want its output-folder picker; the CLI doesn't generate one, since a bundle is a snapshot that goes stale on every `brew upgrade`.

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
- Stdin (`-`) defaults to `.nowline`. It is read from file descriptor 0, so pipes, shell redirects (`nowline - < roadmap.nowline`) and here-docs all work. On an interactive terminal where the synchronous read reports EAGAIN, it falls back to reading the stream until Ctrl-D. Empty stdin is an input error (exit 2, `nowline: no input on stdin`).
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

`--diagnostic-format text|json` selects how diagnostics are written to stderr; any other value is a usage error (exit 2). When the flag is not given, `--dry-run` combined with `--format=json` defaults to `json` (so `nowline - --dry-run --format=json` is the machine-readable invocation), and every other run defaults to `text`. An explicit `--diagnostic-format text` overrides that default.

In `text` mode diagnostics print only when the run fails (at least one error); a warnings-only source prints nothing. In `json` mode the CLI writes exactly one document per run to stderr whenever at least one diagnostic exists, warnings included, and nothing for a clean source. The document is pretty-printed, schema version `1`: `{ "$nowlineDiagnostics": "1", "diagnostics": Diagnostic[] }`. The format never changes the exit code, so a warnings-only source exits 0 with the document on stderr. Diagnostic shape:

```ts
type Diagnostic = {
  file: string;
  line: number;        // 1-based
  column: number;      // 1-based
  severity: 'error' | 'warning';
  code: string;
  message: string;
  suggestion?: string;
  span?: { start: { line: number; column: number }; end: { line: number; column: number } };
};
```

`code` is the stable validator code (`NL.E0600`, `NL.W0700`, ...) when the diagnostic has one, `parse-error` or `lex-error` for syntax errors, and a legacy string such as `validation` for validator messages that predate stable codes. `suggestion` is present when the message offers a "did you mean" target, and holds the bare token to put in place of the offending one (`status` for a misspelled property key, `build` for a misspelled `wave:` value), the same in every locale. A coded diagnostic takes it from the arguments its message is built from (`resolveDiagnosticSuggestion` in `@nowline/core`); only an uncoded one falls back to parsing the message.

**Include diagnostics.** The wave rules that need the included files (include rule 12 `NL.E0202`, the wave checks on included files, and the cross-file `NL.E0300`; `specs/waves.md` §6.1) are reported by include resolution, not by the validator, and so are an included file's lexer and parser errors (include rule 13 in `specs/dsl.md`). The CLI reports them exactly like validator diagnostics: `file` is the file the diagnostic points into (an included file is named relative to the input's directory as given, e.g. `examples/teams/web.nowline`), `line` is 1-based and the span covers that line, the message is localized like any validator message, and they share the run's one text report or JSON document with the validator's diagnostics. They are checked only when the input itself has no validation errors. An error among them exits 1. An included file's syntax error is reported exactly as checking that file on its own reports it (same position, message, and `lex-error` / `parse-error` code). Every other include failure (an unreadable or circular include, a duplicate include, a `start:` mismatch, an isolate without a roadmap) carries no code and keeps its single message on stderr, `nowline: <format> export failed: @nowline/export: include error in <path>: <message>`, with exit 3. When both kinds fail, the uncoded include error wins. `--format nowline` does not resolve includes and reports neither.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error (parse failure, invalid references, a coded wave-rule include diagnostic such as `NL.E0202`). Warnings alone never produce it, in either diagnostic format. |
| 2 | Usage error (missing input, invalid flags, mutually-exclusive flags, format unavailable in this build, binary output to TTY, file not found, unreadable input, empty stdin, invalid `--diagnostic-format`) |
| 3 | Output error (cannot write to destination, exporter pipeline failure, an uncoded include error such as an unreadable or circular include) |

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
  "width": 1200
}
```

Each recognized key is the default for one flag, resolved flag > `.nowlinerc` > built-in default:

| Key | Flag | Notes |
|---|---|---|
| `theme` | `-t, --theme` | Same names and `greyscale` alias as the flag. Also read by `--serve`. |
| `defaultFormat` | `-f, --format` | Step 3 of the format-resolution chain: used when neither `-f` nor a recognized `-o` extension is present. |
| `width` | `-w, --width` | Integer ≥ 320. Best-effort maximum canvas width, passed to `LayoutOptions.width` (see [`rendering.md` § Canvas width](./rendering.md#canvas-width)). Also read by `--serve`. |
| `pdfPageSize` | `--page-size` | Validated for every output format, like `pdfOrientation` and `pdfMargin`. |
| `pdfOrientation` | `--orientation` | |
| `pdfMargin` | `--margin` | A bare number (YAML/JSON number or string) is points. |
| `fontSans` / `fontMono` | `--font-sans` / `--font-mono` | |
| `headlessFonts` | `--headless` | Boolean; either source turns it on. |
| `useSystemFonts` | `--use-system-fonts` | Boolean; either source turns it on. |
| `assetRoot` | `--asset-root` | A directory path. A relative value resolves against the directory of the `.nowlinerc` that holds it (a relative flag resolves against the working directory), so a checked-in `assetRoot: assets` means the same directory wherever `nowline` is run from. Must be a string: any other type is a usage error. Also read by `--serve` and the VS Code preview. |
| `locale` | `--locale` | Ranks below the locale environment variables (see below). Also read by `--serve`. |

An invalid rc value is a usage error (exit 2) that names the key, for example `nowline: invalid .nowlinerc theme "sepia". Expected light, dark, or grayscale.`, rather than a flag the user never passed. A valid flag still wins over an invalid key. Unknown keys are ignored. A `.nowlinerc` that cannot be parsed (malformed YAML or JSON, or a top level that is not a mapping) is the same usage error, `nowline: invalid .nowlinerc: <reason>`, with the file path in the reason; no `.nowlinerc` at all is not an error.

The one environment input is locale (see below): Nowline honors `LC_ALL` / `LC_MESSAGES` / `LANG` because every Unix tool author's `man` page reader, terminal, and OS already does. Other environment variables are not supported in m2 — keep it simple.

## Localization

Nowline localizes axis tick labels, the now-pill text, the quarter prefix, validator messages, and the man page. DSL keywords stay English/ASCII.

Two independent locale chains, one per surface:

- **Content chain** (the rendered SVG / PDF / etc.): file's `nowline v1 locale:` directive → `--locale` → `LC_ALL` / `LC_MESSAGES` / `LANG` → `.nowlinerc` `locale` → `en-US`. The file always wins for the artifact so a French roadmap stays French regardless of the operator's shell — same idea as HTML's `lang` and AsciiDoc's `:lang:`.
- **Operator chain** (terminal output: validator diagnostics, `--help`, errors, verbose logs): `--locale` → `LC_ALL` / `LC_MESSAGES` / `LANG` → `.nowlinerc` `locale` → `en-US`. The file's directive never enters this chain — operator-facing text follows the operator's environment.

Bundles follow the CLDR locale tree (`root → fr → {fr-CA, fr-FR}`); the loader strips trailing subtags and retries, so any future `fr-BE` resolves through `fr` for free. See [`specs/localization.md`](./localization.md) for the resolution matrix, bundle layout, fallback chain, error-code policy, and translation strategy.

## Distribution Pipeline

1. **npm publish:** `@nowline/cli` published to npm. Users can `npx nowline roadmap.nowline` without global install.
2. **GitHub Releases:** `bun compile` binaries attached to each GitHub Release tag. Windows `.exe` binaries (x64, arm64) are the primary Windows distribution — direct download, no package manager needed.
3. **Homebrew:** Custom tap (`lolay/tap`) with a formula that downloads the macOS or Linux binary. Also works in WSL.
4. **apt:** `.deb` packages published to a PPA or GitHub Releases.

A single `nowline` binary per platform bundles every export format — see [`specs/cli-distribution.md`](./cli-distribution.md) for the rationale (post-measurement reversal of the original m2c § 11 tiny/full split).

## Binary Size Budget

Ceilings are **per target**, asserted in CI by [`packages/cli/scripts/compile.mjs`](../packages/cli/scripts/compile.mjs). The bun standalone runtime varies by ~50 MB across platforms — darwin-arm64 ships ~60 MB, linux-x64 with glibc compat shims is ~95 MB, and windows-x64 is ~110 MB — so a single global ceiling would either let macOS regressions slide or fail every Linux/Windows build. Each target gets ~5–8 MB headroom over its current measurement.

| Target          | Measured | Ceiling |
| --------------- | -------- | ------- |
| `darwin-arm64`  | ~70 MB   | 80 MB   |
| `darwin-x64`    | ~75 MB   | 85 MB   |
| `linux-x64`     | ~107 MB  | 115 MB  |
| `linux-arm64`   | ~107 MB  | 115 MB  |
| `windows-x64`   | ~122 MB  | 130 MB  |
| `windows-arm64` | ~119 MB  | 125 MB  |

Comparable runtimes: Deno (~40 MB), Bun standalone (~50 MB) — acceptable for a developer tool installed once. See [`specs/cli-distribution.md`](./cli-distribution.md) for the measurement breakdown that ruled out a tiered split. The npm package is much smaller since it relies on the user's own Node.js / Bun runtime.
