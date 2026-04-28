# m2b.5 Handoff — CLI Redesign (All-Flags, No Verbs)

## Scope

Replace the verb-based CLI shipped in m2a/m2b (`nowline render`, `nowline serve`, `nowline validate`, `nowline convert`, `nowline init`, `nowline version`) with a fully verbless, all-flags shape. The default invocation `nowline <input>` renders; every other operation becomes a flag (`--serve`, `--init`, `--dry-run`, `--version`, `--help`). No backward compatibility — old verbs are removed entirely. m2b.5 lands **before** m2c implementation begins so the six new export formats inherit the new shape from day one.

**Milestone:** m2b.5
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline` (continue the OSS monorepo from m1 / m2a / m2b)

m2 timeline:

- **m2a (shipped)** — CLI scaffold + `validate` + `convert` + `init` + `version` + distribution pipeline
- **m2b (shipped)** — `@nowline/layout` + `@nowline/renderer` + `nowline render` (SVG) + `nowline serve`
- **m2b.5 (this handoff)** — verbless CLI shape; hard cut on every old verb
- **m2c** — all other output formats (PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML)

## Why m2b.5

Surveying peer drawing/diagramming CLIs (mmdc, dot, d2, pandoc, prettier, tsc, mermaid-cli) shows the dominant convention is **verbless for the primary operation** with the alternates expressed as flags rather than subcommands. m2c is about to add six more output formats — locking in the verb-heavy form first means more docs, more tests, more examples to undo later. m2b.5 fixes the shape now so m2c lands consistent.

Verbs are removed entirely. Operations that aren't render become **mode flags** on the same `nowline <input>` invocation:

- Render → default, no flag.
- Serve → `--serve`.
- Init → `--init`.
- Validate → `--dry-run` (Unix idiom; works with any format).
- Convert → **dropped**. Already covered by `-f json` / `-o foo.json` (the format-resolution chain handles both directions of `.nowline` ↔ `.json`).
- Version → `--version` / `-V`.
- Help → `--help` / `-h`.

Hard cut on every old verb (no aliases). One shape, one CLI surface.

## What to Build

### 1. New CLI Surface

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
                         but skip the write step. Replaces old `nowline validate`.
                         Exit 0 on success, 1 on validation error.

Render options
  -t, --theme <name>     light | dark
  --start <date>         "Today" anchor for now-line / date math (alias of --today)
  --no-links             Omit link icons
  -s, --scale <n>        Raster scale factor (PNG only; default 1)

Logging (mutually exclusive)
  -v, --verbose          Print extra diagnostics to stderr (config path,
                         pipeline timings, font resolution, fallback decisions)
  -q, --quiet            Suppress non-error stderr

Standard
  -h, --help             Print help and exit 0
  -V, --version          Print version and exit 0
```

`nowline` with **zero arguments** prints help and exits 0 (matches git, kubectl, gh, cargo, docker). Distinct from `nowline -f pdf` (has args, no input) which exits 2 with a "missing input file" error.

`-V` (uppercase) is `--version`; lowercase `-v` is `--verbose`. Matches curl / ssh / wget / gpg convention. `-v, --verbose` and `-q, --quiet` are mutually exclusive — passing both exits 2.

Examples:

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
nowline --init my-project                        # scaffold ./my-project.nowline (appends .nowline)
nowline --init my-project.nowline                # scaffold ./my-project.nowline (literal)
nowline roadmap.nowline -f pdf -o report         # writes report.pdf (auto-extension)
nowline                                          # no args → prints help, exits 0
nowline --version                                # print version
nowline --help                                   # print help
```

### 2. Behavior Contracts

#### 2.1 Format resolution

Precedence chain (first hit wins). Matches mmdc / pandoc / Graphviz convention:

1. **`-f` / `--format` flag** — explicit always wins.
2. **`-o <path>` extension** — inferred from a recognized output extension.
3. **`.nowlinerc` `defaultFormat`** — project-level default.
4. **`svg`** — built-in fallback.

Recognized extension → format map (also used as the canonical-extension table for auto-add):

| Extension | Format |
|-----------|--------|
| `.svg` | `svg` |
| `.png` | `png` |
| `.pdf` | `pdf` |
| `.html`, `.htm` | `html` |
| `.md`, `.markdown` | `mermaid` |
| `.xlsx` | `xlsx` |
| `.xml` | **not inferred** — ambiguous (MS Project XML vs generic XML); `-f msproj` is required when writing `.xml`. Matches m2c handoff § 4. |
| any other / unknown | falls through to step 3 |

Conflict handling: if `-f` and `-o` extension disagree (e.g. `nowline foo.nowline -f pdf -o foo.png`), `-f` wins and the output file keeps whatever name the user wrote — no auto-rename, no warning. Stays consistent with "explicit beats inferred" everywhere else.

`-o -` (stdout) skips step 2 entirely and goes straight to step 3 → 4. With stdout, a format flag is the only way to deviate from `defaultFormat`.

#### 2.2 Output extension auto-add

After format resolution, the output path may be rewritten:

- `-o <path>` where `<path>` ends in **no extension** (no `.` after the last `/`) → append the canonical extension for the resolved format. Example: `-o report -f pdf` → `report.pdf`. Canonical map: `svg→.svg`, `png→.png`, `pdf→.pdf`, `html→.html`, `mermaid→.md`, `xlsx→.xlsx`, `msproj→.xml`.
- `-o <path>` where `<path>` ends in the canonical extension for the resolved format → use as-is.
- `-o <path>` where `<path>` ends in **any other** extension → use as-is, **no auto-rename**. The user wrote literal bytes; trust them. Example: `-o foo.txt -f pdf` writes PDF bytes to `foo.txt`.
- Default-named output (no `-o`) is unaffected — already named `<input-base>.<format>` by construction.
- `-o -` (stdout) skips auto-add entirely.

Rationale: extension-less `-o report` is the common typo / DWIM case (`report.pdf` is what 99% of users meant). Explicit-but-mismatched `-o foo.txt -f pdf` is rare and intentional; silently renaming would surprise scripts.

#### 2.3 Default output filename

All default-named outputs land in **cwd**, never next to the input. Matches gcc, pdflatex, asciidoctor, and POSIX shell expectation that bare commands don't reach into other directories.

- **Render**: `<cwd>/<input-base>.<format>`. `nowline /tmp/foo.nowline -f pdf` (run from `~`) writes `~/foo.pdf`, not `/tmp/foo.pdf`.
- **Init**: `<cwd>/<name>.nowline`. `nowline --init` → `./roadmap.nowline`; `nowline --init my-project` → `./my-project.nowline`. `-o` always overrides.
- **Stdin input**: `<cwd>/roadmap.<format>` — `cat foo.nowline | nowline -` writes `./roadmap.svg`.
- **Convert (now `-f` + `-o`)**: same cwd rule. `nowline /tmp/foo.nowline -f json` writes `./foo.json`.
- **Existing files**: silently overwritten. Matches POSIX redirection (`> file`), mmdc, d2, prettier, tsc. No `--force` flag.

#### 2.4 Mode-flag dispatch

Mode flags are **mutually exclusive**. Specifying more than one of `--serve` / `--init` is a usage error (exit 2):

- `nowline --serve --init` → exit 2 with `nowline: --serve and --init are mutually exclusive`.
- `--dry-run` is a *modifier*, not a mode — composes with the default render mode only. `--dry-run --serve` and `--dry-run --init` are usage errors (no meaningful semantics: serve doesn't write by default, init is the write).

Argument requirements per mode:

- **Default render**: `<input>` required; missing input → exit 2.
- **`--serve`**: `<input>` required.
- **`--init`**: positional is the project *name*, **not** an input path. Extension handling:
  - No extension (`my-project`) → append `.nowline` → writes `./my-project.nowline`.
  - Already `.nowline` (`my-project.nowline`) → use as-is → writes `./my-project.nowline`.
  - Other extension (`my-project.txt`) → exit 2 with `nowline: --init only scaffolds .nowline files; got "my-project.txt"`.
  - Missing positional → default name `roadmap` → writes `./roadmap.nowline`.
  - `-o` always overrides the default-name resolution.
- **`--dry-run`**: `<input>` required (it's a render-pipeline modifier).
- **`--version` / `--help`**: no input; print and exit 0. If combined with any other flag/mode, the standard flag wins and exits 0 (matches GNU coreutils).

#### 2.5 Stdout

- `-o -` is the only way to write to stdout (Unix dash convention; matches mmdc, d2, pandoc, ffmpeg). No `--stdout` named alias.
- **Textual formats** (svg, html, mermaid, json, .nowline, msproj): always work on stdout.
- **Binary formats** (png, pdf, xlsx) on stdout: work if stdout is a pipe; refused with exit 2 if stdout is a TTY (`nowline: binary output (png) to terminal refused; use -o or pipe to a file`). Curl convention.

#### 2.6 Input

- Detected by extension: `.nowline` → DSL, `.json` → AST.
- `--input-format` overrides for unusual filenames.
- Stdin (`-`) defaults to `.nowline`; override with `--input-format json`.
- Path/verb disambiguation: paths starting with `./`, `../`, or `/` are unambiguous; users with files named like `validate.nowline` use `./validate.nowline` or the POSIX `--` separator. (No verbs to collide with anyway.)

#### 2.7 Mode dispatch logic (concrete)

```
argv.length == 0                             → print help, exit 0  (git-style)

parse all flags first; collect mode flags into a set:
  modes = {} ∪ ({serve} if --serve) ∪ ({init} if --init)
  modifiers = {} ∪ ({dry-run} if --dry-run / -n)

--help / -h                                  → print help, exit 0
--version / -V                               → print version, exit 0
verbose and quiet both set                   → exit 2 (mutually exclusive)
|modes| > 1                                  → exit 2 (mutually exclusive)
modes == {init} and dry-run in modifiers     → exit 2
modes == {serve} and dry-run in modifiers    → exit 2

modes == {init}    → init handler (optional positional = project name; no input file)
modes == {serve}   → serve handler (positional = input; required)
modes == {}        → render handler (positional = input; required)
                     dry-run modifier suppresses the write step
```

No verb table. No `--` parsing for verb disambiguation (no verbs to disambiguate from). `--` still works as the standard "end of options" marker for filenames that start with `-`.

### 3. What Disappears (Hard Cut)

| Removed | Replacement |
|---------|-------------|
| `nowline render <input>` | `nowline <input>` |
| `nowline serve <input>` | `nowline <input> --serve` |
| `nowline validate <input>` | `nowline <input> --dry-run` |
| `nowline convert <input>` | `nowline <input> -f json` (or `-f nowline` for the reverse) |
| `nowline init` | `nowline --init [<name>]` |
| `nowline version` / `nowline help` | `--version` / `--help` |
| Default-stdout-on-render | `-o -` |
| `--stdout` named flag | Never adopted. Use `-o -`. |
| `--force` | Removed. Existing files are silently overwritten by both render (`-o <file>`) and `--init`. Reverses the m2a init-refuse-overwrite policy and the m2b `-o`-refuse-overwrite policy. Matches POSIX redirection and every peer tool (mmdc, d2, prettier, tsc, pandoc). |

Every m2a / m2b shipped CLI example in READMEs and CI smokes is updated.

### 4. Files Affected

**Specs:**

- [specs/cli.md](../cli.md) — full rewrite to the new shape (~200 lines).
- [specs/handoffs/m2b.5.md](./m2b.5.md) — this handoff.
- [specs/milestones.md](../milestones.md) — insert m2b.5 row between m2b and m2c.
- [specs/handoffs/m2c.md](./m2c.md) — replace every `nowline render` reference with the verbless form; update default-stdout assumptions; update CI-smoke command lines in § 11 (Tiny / Full CLI Distribution) and § 9 (CLI Wiring).

**Code (`packages/cli/src/`):**

- Arg-parser dispatch (mode flags, mutual exclusivity), verbless render as default, default-named output (cwd everywhere), `-o -` stdout / TTY-binary refuse logic, `.json` input acceptance, format-resolution chain, output-extension auto-add, `--serve` mode (incl. opt-in `-o` file write), `--init` mode (positional-as-name), `--dry-run` modifier, `--verbose` flag.
- Delete the `convert.ts` handler entirely (functionality preserved by `-f json`).

**Code (`packages/cli/test/`):**

- Port `render.integration.test.ts` → `cli.render.test.ts` (verbless default).
- Port `serve.integration.test.ts` → `cli.serve.test.ts` (`--serve`).
- Add `cli.dry-run.test.ts` (`--dry-run` replaces validate).
- Add `cli.init.test.ts` (`--init`).
- Delete `convert.integration.test.ts` (covered by `-f json` round-trip case in `cli.render.test.ts`).

**Docs / CI:**

- [packages/cli/README.md](../../packages/cli/README.md) — full rewrite.
- [README.md](../../README.md) — quickstart and examples.
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) and [.github/workflows/release.yml](../../.github/workflows/release.yml) — smoke-test commands (both tiny and full binary smokes once m2c lands).

## What NOT to Build

- No new exporters (those land in m2c).
- No new layout or renderer features.
- No backward-compat aliases for old verbs (hard cut, by design).
- No `--force` flag (removed; default is silent overwrite).
- No `--watch` flag (assumed with `--serve`).
- No `--stdout` named alias (use `-o -`).
- No GitHub Action, embed script, or LSP server (m3 / m4).

m2b.5 is **a CLI shape change**. Layout, renderer, parser, and core packages are unchanged. The output is a smaller, more peer-consistent surface that m2c slots six new formats into without touching the dispatch logic.

## Key Specs to Read

| Spec | What to focus on |
|------|------------------|
| [specs/cli.md](../cli.md) | Old verb-based surface (about to be rewritten) |
| [specs/handoffs/m2a.md](./m2a.md) § Resolutions | Citty + `.nowlinerc` arg-parser stack — kept; flag layout changes |
| [specs/handoffs/m2b.md](./m2b.md) § 4–5 | Existing `render` and `serve` flag tables — most flags carry over verbatim |
| [specs/handoffs/m2c.md](./m2c.md) § 9, § 11 | New format flags and tiny / full CLI distribution — must reach m2c on the verbless shape |
| [specs/principles.md](../principles.md) | "Boring tooling" — favoring peer-consistent CLI shapes |

## Definition of Done

- [ ] `specs/handoffs/m2b.5.md` exists (this file) and is linked from `specs/milestones.md`
- [ ] `specs/cli.md` rewritten to the verbless-default, all-flags shape
- [ ] `specs/handoffs/m2c.md` updated: every `nowline render` quote uses the verbless form; CLI wiring examples and tiny/full smoke commands updated
- [ ] `nowline <input>` renders to a file by default, named `<cwd>/<input-base>.<format>`
- [ ] `nowline <input> -o -` writes to stdout; binary output to a TTY is refused with exit 2
- [ ] `nowline <input> -f <format>` resolves format via the precedence chain (flag → `-o` ext → `.nowlinerc` → `svg`); `.xml` requires `-f msproj`
- [ ] `nowline <input> -o <path>` auto-appends the canonical extension when `<path>` has none
- [ ] `nowline <input> --dry-run` runs the pipeline but skips the write step; exit 0 on success, 1 on validation error
- [ ] `nowline <input> --serve` starts the live-preview server; `nowline <input> --serve -o <path>` also writes the rendered output on each rebuild
- [ ] `nowline --init [<name>]` scaffolds `./<name>.nowline` (or `./roadmap.nowline` with no positional); rejects non-`.nowline` extensions
- [ ] `nowline --version` / `-V` prints the version; `nowline --help` / `-h` prints help; bare `nowline` prints help and exits 0
- [ ] `nowline <input> -v` prints diagnostics to stderr; `-q` suppresses non-error stderr; the two are mutually exclusive
- [ ] All old verbs (`render`, `serve`, `validate`, `convert`, `init`, `version`) are gone — no aliases, no transition warnings
- [ ] `packages/cli/test/` ported to the new shape; `convert.integration.test.ts` deleted, replaced by a `-f json` round-trip case in `cli.render.test.ts`
- [ ] `packages/cli/README.md` and root `README.md` reflect the new shape end-to-end
- [ ] `.github/workflows/ci.yml` and `release.yml` smoke-test commands use the verbless shape
- [ ] All Vitest suites pass on Linux, macOS, Windows runners
- [ ] `bun compile` binaries are still under 60 MB on all six targets

## Open Questions for the Implementer

1. **`--format` modifier-style verb** (gofmt-style canonical pretty-print on `.nowline` input) — not in scope; defer. If we want it, it's `nowline foo.nowline -f nowline -o foo.nowline` (round-trip-as-format), which already works.
2. **Stdin + `--input-format json` precedence** — when both disagree (e.g. `cat foo.nowline | nowline - --input-format json`), the flag wins. Already covered by "explicit beats inferred", but worth a dedicated test.
3. **`.xml` inference for MS Project** — keeps `-f msproj` required because `.xml` is ambiguous. If we ship MS Project as the only XML output, we could relax this. Reopening is additive; deferred to m2c implementation.
4. **`--init` short alias** — none. `-i` is reserved for a hypothetical future `--input` flag (universal convention: mmdc, ffmpeg, gcc, pandoc). Init is once-per-project; long-only is acceptable. Reopen if the reservation feels overcautious.
5. **Stdin dispatch for `--serve` and `--init`** — `--serve` could in theory accept stdin, but a watcher needs a path; m2b.5 keeps the m2b restriction (file required). `--init` never reads input. Defer.

These can be resolved during implementation. Answers should be captured in the `@nowline/cli` package README and appended to this handoff in a `## Resolutions` section (following the m2a / m2b / m2c pattern).
