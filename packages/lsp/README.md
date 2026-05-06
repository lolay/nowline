# @nowline/lsp

Language Server Protocol implementation for the Nowline DSL. Built on top of
[`@nowline/core`](../core)'s Langium grammar, validator, and AST. The
[`@nowline/vscode-extension`](../vscode-extension) bundles this server; other
LSP-capable editors (Neovim, JetBrains, Helix, Emacs, …) can spawn the bundled
`nowline-lsp` binary directly.

## What it provides

- **Validation** — every diagnostic from `@nowline/core`'s validator surfaces in
  the editor in real time.
- **Definition** — jump from `after:audit-log`, `owner:sam`, `depends:[…]`,
  `on:…`, `before:…`, etc. to the entity that owns the id.
- **References** — every text-matching usage of an entity id across the open
  file.
- **Rename** — rename an entity id and fan the edit out to all references.
- **Hover** — entity title, status, owner, and link surfaced when the cursor
  hovers a name node or a reference.
- **Document symbols** — outline tree mirroring `roadmap → swimlane → item`
  (with `parallel` / `group` nesting).
- **Completion** — id completion inside `after:` / `before:` / `owner:` /
  `on:` / `depends:[]` plus value completion for `status:`. Keyword and
  property-key completion comes from Langium's default provider.
- **Folding** — block folding driven by Langium's default provider over the
  INDENT/DEDENT-based grammar.

The server is **single-file scoped** in m3 — cross-file references through
`include` are intentionally not resolved by the LSP. Diagnostics and navigation
operate on the document the user is editing.

## Running the server

The package ships a `nowline-lsp` binary. Editors connect over stdio:

```sh
npx nowline-lsp
```

Programmatic embedding (e.g. inside a VS Code extension):

```ts
import { startNowlineServer } from '@nowline/lsp/server';

startNowlineServer();
```

For headless / in-memory usage (tests, MCP, …) use `createNowlineLspServices`
with an `EmptyFileSystem`.
