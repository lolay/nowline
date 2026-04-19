<p align="center">
  <img src="./branding/logo.svg" alt="Nowline" width="360" />
</p>

<p align="center">
  <strong>A human-readable domain-specific language for roadmaps.</strong>
</p>

---

## What is Nowline?

Nowline is a text-first DSL for describing product and engineering roadmaps. You write plain `.nowline` files — indented, keyword-driven, diff-friendly — and tooling renders them as timelines, checks them, and composes them.

```nowline
nowline v1

roadmap platform-2026 "Platform 2026"

anchor kickoff 2026-01-06
anchor ga      2026-06-01

swimlane platform
  item auth-refactor "Auth refactor" duration:1m after:kickoff status:done
  parallel
    item audit-log "Audit log v2"  duration:2w
    item sso       "SSO plugins"   duration:1m
  item platform-qa "Platform QA" duration:1w

milestone beta "Beta" depends:[auth-refactor, audit-log]
```

## Why Nowline?

- **Text, not a Gantt chart.** Version-controlled, diffable, reviewable in a PR.
- **Indentation, not XML.** Roadmaps read like outlines, because that's how people think about them.
- **Strict enough to catch mistakes.** 32 validation rules, clear error messages with line numbers.
- **Composable.** `include` other files with explicit merge / ignore / isolate semantics.

## Packages

This repository is an OSS monorepo of the Nowline language tooling.

| Package | Purpose |
|---|---|
| [`@nowline/core`](./packages/core) | Parser, typed AST, and validator. Pure TypeScript; no DOM, no Node-specific APIs in the hot path. |
| [`@nowline/cli`](./packages/cli) | `nowline` command: validate, convert (text ↔ JSON), init. Ships as an npm package and as standalone binaries. |

Planned packages live in the roadmap (renderer, VS Code extension, language server).

## Install

### Command-line tool (`nowline`)

| Platform | Install |
|---|---|
| macOS / Linux / WSL (Homebrew) | `brew install lolay/tap/nowline` |
| Debian / Ubuntu | [download `nowline_<version>_amd64.deb`](https://github.com/lolay/nowline/releases/latest) + `sudo dpkg -i` |
| Windows (`.exe`) | [download from GitHub Releases](https://github.com/lolay/nowline/releases/latest) (unsigned; see [SmartScreen notes](./packages/cli/README.md#windows-smartscreen-walkthrough)) |
| Any platform (npm/npx) | `npm install -g @nowline/cli` |

### Library (`@nowline/core`)

```bash
pnpm add @nowline/core
# or npm install @nowline/core
# or yarn add @nowline/core
```

## Quick start

```ts
import { createNowlineServices, resolveIncludes } from '@nowline/core';
import { URI } from 'langium';
import { readFile } from 'node:fs/promises';

const { shared, Nowline } = createNowlineServices();
const text = await readFile('roadmap.nowline', 'utf-8');
const doc = shared.workspace.LangiumDocumentFactory.fromString(
  text,
  URI.file('/path/to/roadmap.nowline'),
);
await shared.workspace.DocumentBuilder.build([doc], { validation: true });

const ast = doc.parseResult.value;
const diagnostics = doc.diagnostics ?? [];

const resolved = await resolveIncludes(ast, '/path/to/roadmap.nowline', {
  services: Nowline,
});

console.log(resolved.content.swimlanes);
```

## Language at a glance

### File structure

```nowline
nowline v1                        // 1. version directive (optional)

include "shared/teams.nowline"    // 2. includes
include "brand.nowline" config:isolate

config                            // 3. config section (optional, flat)
scale weeks
unit sprints = 2w
style enterprise
  bg: blue
  fg: navy

roadmap r "My Roadmap"            // 4. roadmap section (optional, flat)

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
| `style`, `label`, `status`, `scale`, `unit`, `estimates`, `defaults` | Config entries. |

### Properties

```nowline
item auth "Auth refactor"
  duration: 2w              // duration literal: d, w, m, y
  status: in-progress       // builtin or custom from config
  owner: sam                // id reference
  after: kickoff            // depends-after id reference
  remaining: 30%            // percentage
  labels: [security, p0]    // list of ids
  link: https://…           // URL
```

### Roadmap start date

A `roadmap` may carry an optional `start:YYYY-MM-DD` property that anchors the timeline baseline:

```nowline
roadmap platform-2026 "Platform 2026" start:2026-01-06
```

- If the roadmap contains any `anchor` declaration, or any `milestone` with a `date:` property, `start:` is **required**.
- Every such date must be on or after `start:`.
- A roadmap with no dates at all (schedules built purely from `duration:` and `after:`) does not need `start:`.
- Across `include`s that don't use `roadmap:ignore`, the parent and any included roadmap must agree on `start:` — both absent, or both present with the same value. Mismatches are errors, not silent overrides.

### Includes

```nowline
include "teams.nowline"                          // merge everything (default)
include "snippet.nowline" config:ignore          // skip child config
include "partner.nowline" roadmap:isolate        // render child as a separate region
```

- `merge` — default: child content is merged; parent definitions win on collision.
- `ignore` — child content of that kind is discarded.
- `isolate` — child roadmap is preserved as a self-contained region (requires a `roadmap` in the child).

## Syntax highlighting

A TextMate grammar is provided at [`grammars/nowline.tmLanguage.json`](./grammars/nowline.tmLanguage.json) for any editor that supports TextMate grammars (VS Code, Sublime Text, IntelliJ via third-party plugins, etc.).

## Examples

Three progressively-richer examples are included:

- [`examples/minimal.nowline`](./examples/minimal.nowline) — smallest complete file.
- [`examples/teams.nowline`](./examples/teams.nowline) — persons, teams, anchors, milestones, footnotes.
- [`examples/product.nowline`](./examples/product.nowline) — full config, styles, labels, parallels, groups, descriptions.

## Development

```bash
pnpm install
pnpm --filter @nowline/core run langium:generate    # regenerate AST after grammar edits
pnpm --filter @nowline/core run test                # 98+ tests across parser, validator, includes
pnpm --filter @nowline/core run build               # tsc → dist/
```

## License

Apache 2.0 — see [LICENSE](./LICENSE).
