# @nowline/cli

The `nowline` command-line tool parses, validates, and converts `.nowline` roadmap files.

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
# or one-shot: npx @nowline/cli validate roadmap.nowline
```

## Commands

| Command | Purpose |
|---------|---------|
| `nowline version` | Print the version and exit |
| `nowline validate <input\|-> [--format text\|json]` | Parse and validate |
| `nowline convert <input> [-o path] [-f json\|nowline]` | Bidirectional text ↔ JSON |
| `nowline init [--name ...] [--template minimal\|teams\|product] [--force]` | Scaffold a starter file |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation error |
| 2 | File not found or unreadable |
| 3 | Output error (cannot write to destination) |

## Arg parser choice

`@nowline/cli` uses [`citty`](https://github.com/unjs/citty) for argument parsing. Reasons:

- Zero dependency, small footprint, based on Node's native `util.parseArgs`.
- `defineCommand` + `subCommands` give a clean one-file-per-command layout; adding `render` and `serve` in m2b is a pure addition.
- Built-in `--help` / `--version` handling and case-agnostic kebab↔camel arg access.

Supporting libraries:

- [`consola`](https://github.com/unjs/consola) — logging (respects `--quiet`).
- [`chalk`](https://github.com/chalk/chalk) — terminal colors.
- [`@clack/prompts`](https://github.com/natemoo-re/clack) — interactive flows for `init`.
- [`@babel/code-frame`](https://babeljs.io/docs/babel-code-frame) — biome/oxc-style source excerpts with caret/tilde underlines for `validate --format=text`.
- [`js-yaml`](https://github.com/nodeca/js-yaml) — `.nowlinerc` YAML parsing (JSON also supported).

## Configuration: `.nowlinerc`

On any command that takes an `input` file, `@nowline/cli` walks up from the input file's directory looking for a `.nowlinerc` (JSON or YAML). The nearest one wins. CLI flags override config values. Environment variables are not consulted.

```yaml
# .nowlinerc (YAML)
theme: dark
defaultFormat: svg  # reserved for m2b/m2c
width: 1200
```

```json
// .nowlinerc (JSON)
{
  "theme": "dark",
  "defaultFormat": "svg",
  "width": 1200
}
```

In m2a, only a small number of keys are consulted (`quiet`, `format` — see each command). Unknown keys are ignored.

## `validate`

Parse and validate a `.nowline` file without rendering.

### Text format (default)

Each diagnostic is rendered in a biome/oxc-style frame via `@babel/code-frame`:

```
roadmap.nowline:7:34 error: Unknown reference 'auth-refactro' in after — did you mean 'auth-refactor'?
  5 |   item auth-refactor "Auth refactor" duration:l
  6 |   parallel after:auth-refactor
> 7 |     group audit-track "Audit Track" labels:security
    |                                     ^^^^^^^^^^^^^^^
  8 |       item audit-log "Audit log v2" duration:xl before:code-freeze
```

### JSON format

Stable schema; suitable for CI integration:

```ts
type Diagnostic = {
  file: string;
  line: number;        // 1-based
  column: number;      // 1-based
  severity: 'error' | 'warning';
  code: string;        // stable diagnostic code, e.g. "unknown-reference"
  message: string;
  suggestion?: string; // human-readable fix hint, when available
};
```

Emitted as `{ "$nowlineDiagnostics": "1", "diagnostics": Diagnostic[] }` to leave room for future fields.

Exit 0 if no errors; exit 1 if any errors. Warnings never change the exit code.

## `convert`

Bidirectional `.nowline` ↔ JSON conversion. Input format is inferred from the file extension (`.nowline` → text, `.json` → JSON). Output format preference order:

1. `-o`'s extension (`.json` or `.nowline`)
2. `-f`'s value (`json` or `nowline`)
3. Opposite of input

### Published AST JSON schema (`$nowlineSchema: "1"`)

The JSON form is a **versioned, published contract**, intended for MCP (m7) and editor (m5) round-trips.

```ts
type NowlineDocument = {
  $nowlineSchema: "1";
  file: { uri: string; source: string };
  ast: NowlineFileNode; // mirrors @nowline/core's typed AST
};

type NowlineFileNode = {
  $type: 'NowlineFile';
  $position: Position;           // always present on every AST node
  directive?: NowlineDirectiveNode;
  includes: IncludeDeclarationNode[];
  hasConfig: boolean;
  configEntries: ConfigEntryNode[];
  roadmapDecl?: RoadmapDeclarationNode;
  roadmapEntries: RoadmapEntryNode[];
};

type Position = {
  start: { line: number; column: number; offset: number };
  end:   { line: number; column: number; offset: number };
};
```

Every node carries `$type`, `$position`, and the properties defined by the corresponding `@nowline/core` AST interface. Container back-references (`$container`, `$containerProperty`, `$containerIndex`) are **omitted** — the parent-child relationship is captured by document structure.

Schema versioning: the `$nowlineSchema` field is a single string (`"1"` for v1). Breaking changes bump it; additive changes do not.

### Canonical `.nowline` printer rules

When serializing an AST JSON back to `.nowline` text, the printer enforces a canonical form so round-trips are stable:

- **Indent:** 2 spaces.
- **Positional order on declaration lines:** `id` → `title` → keyed properties.
- **Keyed-property order:**

  ```
  date, length, on, duration, status, owner,
  after, before, remaining, labels, style, link,
  (any remaining keys, alphabetical)
  ```

- **List shape:** single-element lists render as bare (`labels:enterprise`); multi-element lists use bracket form with a comma+space separator (`labels:[enterprise, security]`).
- **`description` sub-directive:** always rendered on its own line indented one level under its host.
- **Line continuation:** the printer does not emit `\` continuations; long lines stay long. Authors may add them manually in source files — they survive the text→json trip but are normalized away on json→text.
- **Comments:** **not preserved** across round-trips. The m1 AST does not currently carry trivia. Documented limitation; a follow-up grammar ticket will add trivia support so that future `convert` runs round-trip comments as well.

Round-trip property: for every file in `examples/`, `text → json → text` and `json → text → json` are idempotent modulo comment loss. Enforced by the test suite.

## `init`

Create a starter `.nowline` file in the current directory. Three templates (`minimal`, `teams`, `product`) correspond to the three files in `examples/` and are embedded into the CLI at build time — binaries are self-contained.

- `--name` substitutes into the `roadmap` declaration's title.
- Default output filename: `<slugified-name>.nowline`.
- Refuses to overwrite an existing file unless `--force` is passed. **`--force` is an addition to [`specs/cli.md`](../../nowline-commercial/specs/cli.md); documented here because it keeps a foot-gun away from accidental use.**

Exits with code 3 on write failure.

## Distribution

Binaries are produced with `bun compile` for six targets (macOS arm64/x64, Linux x64/arm64, Windows x64/arm64) and attached to every GitHub Release. Budget is **<60 MB** per binary; CI asserts on disk.

### Windows SmartScreen walkthrough

The m2a `.exe` binaries are **unsigned**. Windows may show a SmartScreen warning ("Windows protected your PC"). To run the downloaded binary:

1. Right-click the `.exe` → **Properties**.
2. Check **Unblock** at the bottom of the **General** tab → **OK**.
3. Run the binary from a terminal (`cmd` or PowerShell).

Corporate endpoints may block unsigned binaries entirely. In that case, `npm install -g @nowline/cli` (which runs on Node/Bun) is an alternative. We may purchase a code-signing certificate in a later milestone; doing so does not change the distribution pipeline structure.
