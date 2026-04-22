# m2a Handoff — CLI Core

## Scope

Scaffold the `@nowline/cli` package and ship the subset of commands that do not need a layout engine or renderer: `validate`, `convert`, `init`, and `version`. Also ship the full distribution pipeline so every later milestone (m2b, m2c, m3, m4) inherits it for free. No rendering, no layout — those ship in m2b and m2c.

**Milestone:** m2a
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline` (continue the OSS monorepo created in m1)

m2 is split into three sub-milestones:

- **m2a (this handoff)** — CLI scaffold + `validate` + `convert` + `init` + `version` + distribution
- **m2b** — `@nowline/layout` + `@nowline/renderer` + `nowline render` (SVG only) + `nowline serve`
- **m2c** — all other output formats (PNG, PDF, HTML, Markdown+Mermaid, XLSX, MS Project XML)

## What to Build

### 1. Monorepo Additions

Add `packages/cli` alongside the existing `packages/core` from m1:

```
nowline/
  packages/
    core/                    # @nowline/core (from m1)
    cli/                     # @nowline/cli — command-line entry point
  grammars/
    nowline.tmLanguage.json  # (from m1)
  examples/                  # (from m1)
```

`packages/layout` and `packages/renderer` are added in m2b. `packages/embed` ships in m3. See `specs/architecture.md` § OSS Monorepo Structure. The m2a dependency graph is one edge:

```
@nowline/cli → @nowline/core
```

No upward or sideways imports. No layout or renderer imports in m2a — `render` and `serve` are not wired yet.

### 2. CLI Scaffold (`@nowline/cli`)

Produce a cohesive command framework that m2b/m2c can extend without refactoring:

- **Argument parser** — pick one small, maintained dependency (e.g., `commander`, `cac`, or `citty`) and commit to it for the milestone. Document the choice in the package README.
- **Command registry** — each command lives in its own file (`commands/validate.ts`, `commands/convert.ts`, …) and registers itself with the root program. Adding `render` and `serve` in m2b must be a pure addition, not a restructure.
- **Shared I/O helpers** — file read with clear "not found / unreadable" error (exit code 2), stdout/stderr writer, `--quiet` suppression of non-error output, binary-output guard (refuse to dump non-text formats to a terminal; reserved for m2c but stub the helper now).
- **Config discovery** — search for `.nowlinerc` (JSON or YAML) starting at the input file's directory and walking up toward the filesystem root; first match wins. CLI flags override config file values. No environment variables in m2 (per `specs/cli.md` § Configuration).
- **Exit codes** — implement exactly:

  | Code | Meaning |
  |------|---------|
  | 0 | Success |
  | 1 | Validation error (parse failure, invalid references) |
  | 2 | File not found or unreadable |
  | 3 | Output error (cannot write to destination) |

- **`--help` and `--version`** — standard behavior from the chosen arg parser. `--version` prints the same string as `nowline version`.

### 3. `nowline version`

Print the version and exit 0. Source the version from `packages/cli/package.json` at build time (bun/ts compile-time import or a generated file). Match the exact surface in `specs/cli.md` § `nowline version`.

### 4. `nowline validate`

Parse and validate a `.nowline` file without rendering. Matches `specs/cli.md` § `nowline validate`:

```
nowline validate <input>

Options:
  --format <fmt>         Error format: text, json (default: text)
```

- Uses `@nowline/core` to parse and run all m1 validation rules.
- **Text format** — one diagnostic per line, exactly the shape from `specs/cli.md`:

  ```
  roadmap.nowline:7:34 error: Unknown reference 'auth-refactro' in after — did you mean 'auth-refactor'?
  roadmap.nowline:12:1 error: Circular dependency: audit-log → sso → audit-log
  ```
- **JSON format** — a stable schema suitable for CI (`{file, line, column, severity, code, message, suggestion?}[]`). Document the schema in the package README.
- Exit 0 when no errors, exit 1 when any error. Warnings do not change the exit code but are included in output.
- Works with a file path or stdin (`nowline validate -` reads stdin) so `find ... -exec nowline validate {} \;` and pipe workflows both work per `specs/cli.md` § Piping and Composability.

### 5. `nowline convert`

Bidirectional `.nowline` text ↔ JSON (AST). Matches `specs/cli.md` § `nowline convert`:

```
nowline convert <input> [options]

Options:
  -o, --output <path>    Output file path (default: stdout)
  -f, --format <fmt>     Output format: json, nowline (default: inferred from output extension, or opposite of input)
```

- **Detection** — infer input format from the file extension (`.nowline` → text, `.json` → JSON). Infer output format from `-o` extension first; fall back to `-f`; fall back to "opposite of input".
- **Text → JSON** — emit the typed AST from `@nowline/core` as JSON. Preserve source position metadata (file, line, column ranges) for every node so downstream tools (future MCP, editor) can round-trip with provenance.
- **JSON → text** — take a valid AST JSON document and produce canonical `.nowline` text. Canonicalization rules (document them in the package README):
  - Indentation: 2 spaces (match the DSL convention in `specs/dsl.md`).
  - Key ordering inside a declaration line: positional `id` then `title` then keyed properties in a stable, documented order.
  - Comments are not preserved across round-trips (AST does not currently carry trivia); document this as a known loss.
- **Idempotency** — `text → json → text` and `json → text → json` must be stable modulo comment loss. The test suite enforces this on every m1 example file.
- **Validation on input** — if the `.nowline` input fails m1 validation, exit 1 with diagnostics (same format as `validate`). If the JSON input fails AST schema validation, exit 1.
- **Piping** — default to stdout so `nowline convert roadmap.nowline | jq '.items[]'` works per `specs/cli.md` examples.

### 6. `nowline init`

Create a starter `.nowline` file in the current directory. Matches `specs/cli.md` § `nowline init`:

```
nowline init [options]

Options:
  --name <name>          Roadmap name (default: "My Roadmap")
  --template <t>         Template: minimal, teams, product (default: minimal)
```

- Three templates correspond to the three m1 example files (`examples/minimal.nowline`, `examples/teams.nowline`, `examples/product.nowline`). Copy/adapt them into `packages/cli/templates/` at build time so binaries are self-contained.
- `--name` substitutes the roadmap title in the generated file.
- Default output filename: `<slugified-name>.nowline` in the current directory. Refuse to overwrite an existing file without `--force` (add `--force` even though it's not in `specs/cli.md`; document the addition).
- Exit 3 on write failure.

### 7. Distribution Pipeline

Ship the full pipeline in m2a so m2b, m2c, m3, and m4 inherit it unchanged. Per `specs/cli.md` § Distribution Pipeline and `specs/architecture.md` § Build and Release:

- **`bun compile` binaries** — produce standalone binaries for six targets: macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64, Windows arm64. Budget: **< 60 MB** per binary. Attach to each GitHub Release tag as assets.
- **npm** — publish `@nowline/core` (from m1, if not yet published) and `@nowline/cli` under a single shared version. `npx nowline validate roadmap.nowline` must work without a global install.
- **Homebrew** — custom tap `lolay/tap` with a formula that downloads the macOS or Linux binary; works in WSL.
- **apt** — `.deb` packages published to a PPA or as GitHub Release assets.
- **Windows** — direct `.exe` download from GitHub Releases; no package manager required.
- **CI** — GitHub Actions workflows:
  - On push/PR: install, build, lint, test.
  - On tag: build all six binaries, publish npm packages, create GitHub Release with binary assets, update the Homebrew tap formula, upload `.deb` assets.

The m2a binary only wires up `validate`, `convert`, `init`, `version`. `render` and `serve` are added in m2b without changing the distribution plumbing.

### 8. Tests

Use Vitest across both packages. Coverage for m2a:

- **`validate` tests** — drive every m1 validation rule through the CLI; assert text output format (exact line shape with file/line/column), JSON schema output, exit codes 0/1. Confirm that stdin input (`nowline validate -`) works.
- **`convert` tests** — round-trip every m1 example file (`text → json → text` and `json → text → json`) and assert idempotency modulo comment loss; assert format inference from extensions; assert that invalid input exits 1 with diagnostics.
- **`init` tests** — each template generates a file that passes `nowline validate`; `--name` is substituted correctly; refusing to overwrite works; `--force` works.
- **Config discovery tests** — place `.nowlinerc` at various levels above the input file; confirm the nearest one wins and that CLI flags override it; confirm JSON and YAML both parse.
- **Exit-code tests** — 0 for success, 1 for validation errors, 2 for missing file, 3 for unwritable output directory.
- **CLI integration tests** — spawn the built binary (and the `bun run` entry during dev) rather than importing the command functions directly; assert stdout, stderr, and exit code. This matters because `bun compile` can surface bundling bugs that unit tests miss.
- **Distribution smoke test** — after each `bun compile`, run `<binary> version` and `<binary> validate examples/minimal.nowline` in CI; assert exit 0, output non-empty, binary under 60 MB on disk. Run on the matching OS/arch where feasible.

## What NOT to Build

- No layout engine (m2b)
- No renderer (m2b)
- No `nowline render` command (m2b SVG, m2c other formats)
- No `nowline serve` command (m2b)
- No SVG, PNG, PDF, HTML, Mermaid, XLSX, or MS Project output (m2b/m2c)
- No LSP server (m4)
- No IDE extensions (m4)
- No embed script (m3)
- No GitHub Action (m3)
- No web apps (m5+)

m2a is **CLI scaffold + validate + convert + init + version + distribution**. The output is a shippable `nowline` binary that parses and validates `.nowline` files, and a release pipeline that later milestones drop new commands into.

## Key Specs to Read

| Spec | What to focus on |
|------|------------------|
| `specs/principles.md` | "Text is the source of truth", "No lock-in" — motivates `convert` and `validate` as first-class citizens |
| `specs/architecture.md` | Package dependency graph, technology choices (pnpm, bun compile, Vitest), build and release, distribution targets |
| `specs/cli.md` | Command surfaces for `validate`, `convert`, `init`, `version`; flag names; exit codes; `.nowlinerc`; piping and composability; binary size budget |
| `specs/dsl.md` | The AST shape that `convert` serializes — confirm the JSON schema emitted by m2a matches the AST exported by `@nowline/core` |
| `specs/features.md` § m2a | Feature inventory for m2a — items 17 (convert), 20 (validate), 21 (init), 29 (bun compile), 30 (package managers) |
| `specs/milestones.md` | m2a/m2b/m2c split and dependency chain |

## Definition of Done

- [ ] `packages/cli` exists and publishes to npm under the shared monorepo version
- [ ] Dependency graph enforced: `@nowline/cli` imports only `@nowline/core` and its arg parser; no layout or renderer imports
- [ ] `nowline version` prints the version and exits 0
- [ ] `nowline validate` parses every m1 validation rule through the CLI; supports text and JSON formats; exits 0/1 correctly; accepts stdin
- [ ] `nowline convert` round-trips text ↔ JSON idempotently on all three m1 example files (modulo comment loss, documented)
- [ ] `nowline init` produces valid `.nowline` files for all three templates; `--name` substitutes; overwrite is refused without `--force`
- [ ] Exit codes 0/1/2/3 match `specs/cli.md` § Exit Codes
- [ ] `.nowlinerc` discovery walks up from the input file; CLI flags override config values; JSON and YAML both parse
- [ ] `bun compile` produces binaries for macOS arm64/x64, Linux x64/arm64, Windows x64/arm64 under 60 MB each
- [ ] GitHub Actions workflow builds, tests, and (on tag) publishes binaries, npm packages, `.deb` assets, and updates the Homebrew tap formula
- [ ] `npx nowline validate roadmap.nowline` works without a global install
- [ ] Vitest suites for validate, convert, init, config discovery, exit codes, and CLI integration pass on Linux, macOS, and Windows runners

## Open Questions for m2a

1. **Arg parser choice.** `commander` (most mainstream), `cac` (smaller, less ceremony), or `citty` (modern, Nuxt team). All work with `bun compile`. Pick based on bundle-size impact and how nicely each plays with subcommand file layout. Document in the package README.
2. **AST JSON schema stability.** `convert` emits the m1 AST as JSON. Decide whether this schema is a published contract (implies versioning + compatibility story) or an internal representation that can change across Nowline versions. Recommendation: version it from day one (e.g., `"$nowlineSchema": "1"` at the document root) so MCP (m7) and editor (m5) can round-trip reliably.
3. **Canonical `.nowline` printer.** Going JSON → text requires a canonical form. Options: (a) pretty-print with opinionated key ordering; (b) faithful reproduction from source-position metadata when available, falling back to pretty-print. (b) is nicer for round-trips but adds complexity. Recommendation: (a) for m2a, revisit if round-trip fidelity bites.
4. **Comment preservation.** m1 does not carry trivia in the AST. Adding comment preservation to `convert` is a cross-cutting change that belongs with the grammar. For m2a, document comment loss as a known limitation and file a ticket against m1/grammar for a future pass.
5. **Homebrew tap bootstrap.** The custom tap `lolay/tap` needs to exist as a separate public repo before the release workflow can push formula updates. Confirm ownership, create the tap repo, and seed it with the `nowline.rb` formula in parallel with the m2a implementation.
6. **apt distribution mechanism.** Decide early: a PPA (more Debian-idiomatic but slower moving) vs. `.deb` files uploaded directly to GitHub Releases with install instructions (`curl | sudo dpkg -i`). Recommendation: GitHub Releases `.deb` for m2a; revisit a true PPA if adoption justifies the maintenance overhead.
7. **Windows signing.** Unsigned `.exe` downloads trigger SmartScreen warnings and are blocked by many corporate endpoints. Decide whether to purchase a code-signing cert now or ship unsigned in m2a with a documented SmartScreen walkthrough. Signing can be retrofitted without changing the pipeline structure.

These can be resolved during implementation. Answers should be captured in the `@nowline/cli` package README and referenced from the relevant spec files.

## Resolutions

Decisions taken during the m2a scaffold. Each resolution is also captured in `packages/cli/README.md` so later milestones inherit the decisions in-context.

1. **Arg parser choice — `citty`.** Chosen for its native `util.parseArgs` base, zero-dependency footprint, and `defineCommand` + `subCommands` ergonomics. Supporting UX stack: [`consola`](https://github.com/unjs/consola) for logging (and `--quiet`), [`chalk`](https://github.com/chalk/chalk) for colors, [`@clack/prompts`](https://github.com/natemoo-re/clack) for interactive flows in `init`, and [`@babel/code-frame`](https://babeljs.io/docs/babel-code-frame) for biome/oxc-style diagnostic excerpts. `.nowlinerc` parsed with [`js-yaml`](https://github.com/nodeca/js-yaml) (JSON and YAML).
2. **AST JSON schema stability — versioned contract.** The convert JSON form carries a top-level `"$nowlineSchema": "1"` field. Schema is a published contract intended for MCP (m7) and editor (m5) round-trips. Breaking changes bump the schema integer; additive changes don't. The document shape is `{ $nowlineSchema, file: { uri, source }, ast }`; every AST node carries `$type` and `$position` (line/column/offset, 1-based lines/columns), with Langium container back-references (`$container`, `$containerProperty`, `$containerIndex`) stripped.
3. **Canonical `.nowline` printer — opinionated pretty-print.** 2-space indent; positional order on declaration lines is `id → "title" → keyed properties`; keyed properties render in a stable order (`date, length, on, duration, status, owner, after, before, remaining, labels, style, link, author, start, scale, calendar`, then remaining keys alphabetically); single-element lists render bare (`labels:enterprise`), multi-element lists in brackets with `", "` (`labels:[enterprise, security]`); `description` always renders on its own indented sub-directive line. Round-trip idempotency is enforced by the convert round-trip test suite on all three m1 example files.
4. **Comment preservation — documented limitation.** The m1 AST does not carry trivia, so comments are dropped on `text → json → text`. Called out in `packages/cli/README.md` and surfaced in the convert CLI help. A follow-up grammar ticket should add trivia support; when it lands, `convert` round-trips will pick it up automatically without a schema bump.
5. **Homebrew tap bootstrap — seeded in-repo, bootstrapped separately.** `scripts/homebrew-tap/` contains the formula template and bootstrap instructions for creating the external `lolay/homebrew-tap` repo (served as the `lolay/tap` tap). `release.yml` expects a `HOMEBREW_TAP_TOKEN` secret with write access to that tap; on every `v*` tag, the workflow recomputes binary SHA256s and force-rewrites `Formula/nowline.rb` with the new version.
6. **apt distribution mechanism — `.deb` files via GitHub Releases.** `scripts/build-deb.sh` constructs a minimal `DEBIAN/control` + `usr/bin/nowline` layout from a compiled binary. `release.yml` runs it for `amd64` and `arm64` and attaches the resulting `.deb` assets to the GitHub Release. A true PPA can be revisited later without changing the surface for end users.
7. **Windows signing — unsigned in m2a.** Binaries ship unsigned; SmartScreen walkthrough is documented in `packages/cli/README.md`. Signing can be retrofitted by adding a signing step to the Windows matrix leg in `release.yml` without changing any other part of the distribution pipeline. Corporate-blocked installs can fall back to `npm install -g @nowline/cli`.

### Additions beyond the original spec

- **`nowline init --force`.** Not in `specs/cli.md` but required for scripted regeneration. Without `--force`, `init` refuses to overwrite; exits with code 3 (output error). Documented in `packages/cli/README.md`.
- **`$nowlineDiagnostics: "1"` envelope.** `validate --format=json` emits `{ "$nowlineDiagnostics": "1", "diagnostics": [...] }` rather than a bare array, so future fields (summary counts, config echo, etc.) can be added without a schema bump.

