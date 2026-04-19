<p align="center">
  <img src="./branding/logo.svg" alt="Nowline" width="360" />
</p>

<p align="center">
  <strong>A human-readable domain-specific language for roadmaps.</strong>
</p>

---

## What is Nowline?

Nowline is a text-first DSL for describing product and engineering roadmaps. You write plain `.nowline` files — indented, keyword-driven, diff-friendly — and tooling renders them as timelines, validates them, and composes them.

```nowline
nowline v1

roadmap platform-2026 "Platform 2026" start:2026-01-06

anchor kickoff date:2026-01-06
anchor ga      date:2026-06-01

swimlane platform
  item auth-refactor "Auth refactor" duration:1m after:kickoff status:done
  parallel
    item audit-log "Audit log v2"  duration:2w
    item sso       "SSO plugins"   duration:1m
  item platform-qa "Platform QA" duration:1w

milestone beta "Beta" after:[auth-refactor, audit-log]
```

## Why Nowline?

- **Text, not a Gantt chart.** Version-controlled, diffable, reviewable in a PR.
- **Indentation, not XML.** Roadmaps read like outlines, because that's how people think about them.
- **Strict enough to catch mistakes.** 30+ validation rules, clear error messages with line and column numbers.
- **Composable.** `include` other files with explicit `merge` / `ignore` / `isolate` semantics.

## Status

Nowline is pre-release. Nothing is published to package registries, Homebrew, or GitHub Releases yet — the toolchain runs from source. Stable releases will land with the milestones tracked in [`nowline-commercial/specs/milestones.md`](../nowline-commercial/specs/milestones.md) (private). The parser, validator, and CLI (validate / convert / init) are usable today.

## Packages

This repository is an OSS monorepo of the Nowline language tooling.

| Package | Purpose |
|---|---|
| [`@nowline/core`](./packages/core) | Parser, typed AST, and validator. Pure TypeScript; no DOM, no Node-specific APIs in the hot path. |
| [`@nowline/cli`](./packages/cli) | `nowline` command: `validate`, `convert` (text ↔ JSON), `init`. |

Planned: a layout engine and SVG renderer (`render` / `serve` commands), a browser embed script, and an LSP / VS Code extension.

## Try it from source

Until release artifacts ship, the fastest way to try `nowline` is to run it from a checkout:

```bash
git clone https://github.com/lolay/nowline.git
cd nowline
pnpm install
pnpm -r build
```

That produces `packages/cli/dist/index.js` with a `#!/usr/bin/env node` shebang. Invoke it directly:

```bash
node packages/cli/dist/index.js validate examples/minimal.nowline
node packages/cli/dist/index.js convert  examples/minimal.nowline
node packages/cli/dist/index.js init --template=minimal
```

Or expose it on your `PATH` with a local `npm link`:

```bash
cd packages/cli
npm link          # adds `nowline` to your PATH
nowline validate examples/minimal.nowline
nowline version
```

## Use the CLI

### Validate

Parse a file and report errors and warnings. Exits `0` on success, `1` if any errors are emitted.

```bash
nowline validate roadmap.nowline
nowline validate - < roadmap.nowline               # read stdin
nowline validate roadmap.nowline --format=json     # machine-readable output
```

### Convert

Round-trip between canonical `.nowline` text and the AST as JSON. Either direction is inferred from file extensions, or chosen with `-f`.

```bash
nowline convert roadmap.nowline                    # text → JSON to stdout
nowline convert roadmap.nowline -o roadmap.json    # text → JSON to file
nowline convert roadmap.json   -o roadmap.nowline  # JSON → text to file
nowline convert roadmap.nowline | jq '.ast.roadmapDecl.name'
```

The emitted JSON carries a top-level `"$nowlineSchema": "1"` so downstream tools can detect schema changes. Comments are not preserved across round-trips — see [`packages/cli/README.md`](./packages/cli/README.md) for the canonical printer rules.

### Init

Scaffold a new `.nowline` file from one of the bundled templates.

```bash
nowline init --template=minimal --name="Platform 2026"
nowline init --template=teams   --name="Teams"   --force
```

`minimal`, `teams`, and `product` correspond to the files under [`examples/`](./examples).

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Validation error (parse failure, invalid reference) |
| 2 | Input error (file not found / unreadable / unsupported format) |
| 3 | Output error (cannot write to destination) |

## Use the library

`@nowline/core` is a pure-TypeScript parser + typed AST + validator built on [Langium](https://langium.org/). Everything the CLI does on top of parsing is itself built against this library.

```ts
import { createNowlineServices, resolveIncludes } from '@nowline/core';
import { URI } from 'langium';
import { readFile } from 'node:fs/promises';

const { shared, Nowline } = createNowlineServices();
const text = await readFile('roadmap.nowline', 'utf-8');
const doc = shared.workspace.LangiumDocumentFactory.fromString(
  text,
  URI.file('/absolute/path/to/roadmap.nowline'),
);
await shared.workspace.DocumentBuilder.build([doc], { validation: true });

const ast = doc.parseResult.value;
const diagnostics = doc.diagnostics ?? [];

const resolved = await resolveIncludes(ast, '/absolute/path/to/roadmap.nowline', {
  services: Nowline,
});

console.log(resolved.content);
```

## Language at a glance

### File structure

```nowline
nowline v1                        // 1. version directive (optional, must be first)

include "shared/teams.nowline"    // 2. includes
include "brand.nowline" config:isolate

config                            // 3. config section (optional)
scale
  name: weeks
style enterprise
  bg: blue
  fg: navy

roadmap r "My Roadmap"            // 4. roadmap section

swimlane platform
  item x "Work item" duration:1w status:done
```

### Entities

| Keyword | Purpose |
|---|---|
| `roadmap` | The top-level roadmap declaration. At most one per file. |
| `swimlane` | A horizontal lane of work. |
| `item` | A unit of work inside a swimlane. |
| `parallel` | A block whose children run concurrently. |
| `group` | A logical grouping of items, rendered together. |
| `anchor` | A named date on the timeline. |
| `milestone` | A point-in-time marker that depends on work. |
| `footnote` | A callout anchored to one or more entities. |
| `person`, `team` | Ownership references. |
| `style`, `label`, `status`, `duration`, `scale`, `calendar`, `default` | Config and declaration entries. |

### Properties

```nowline
item auth "Auth refactor"
  duration: 2w              // duration literal: d, w, m, q, y
  status: in-progress       // builtin or custom from config
  owner: sam                // id reference (person or team)
  after: kickoff            // dependency (single)
  after: [kickoff, approvals] // dependency (list)
  remaining: 30%             // percentage
  labels: [security, p0]     // list of label ids
  link: https://…            // URL (bare, no quotes)
```

### Roadmap start date

A `roadmap` may carry an optional `start:YYYY-MM-DD` that anchors the timeline baseline:

```nowline
roadmap platform-2026 "Platform 2026" start:2026-01-06
```

- If the roadmap contains any `anchor`, or any `milestone` with a `date:` property, `start:` is **required**.
- Every such date must be on or after `start:`.
- A pure-relative roadmap (built from `duration:` and `after:` only) does not need `start:`.
- Across `include`s that don't use `roadmap:ignore`, the parent and any included roadmap must agree on `start:` — both absent, or both present with the same value. Mismatches are errors, not silent overrides.

### Includes

```nowline
include "teams.nowline"                     // merge everything (default)
include "snippet.nowline"  config:ignore    // skip child config
include "partner.nowline"  roadmap:isolate  // render child as a separate region
```

- `merge` — default: child content is merged; parent definitions win on collision.
- `ignore` — child content of that kind is discarded.
- `isolate` — child roadmap is preserved as a self-contained region (requires a `roadmap` in the child).

## Syntax highlighting

A TextMate grammar is at [`grammars/nowline.tmLanguage.json`](./grammars/nowline.tmLanguage.json). Works in any editor that supports TextMate grammars (VS Code, Sublime Text, Zed, IntelliJ via third-party plugins, etc.). A first-class LSP and VS Code extension are planned.

## Examples

Three progressively-richer examples are included:

- [`examples/minimal.nowline`](./examples/minimal.nowline) — smallest complete file.
- [`examples/teams.nowline`](./examples/teams.nowline) — persons, teams, anchors, milestones, footnotes.
- [`examples/product.nowline`](./examples/product.nowline) — full config, styles, labels, parallels, groups, descriptions.

## Contributing

Bug reports, feature requests, and pull requests are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, build/test commands, and the expected workflow.

## License

Apache 2.0 — see [`LICENSE`](./LICENSE).
