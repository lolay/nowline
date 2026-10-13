# @nowline/core

Parser, typed AST, and validator for the [Nowline](../../) DSL. Pure TypeScript, built on [Langium](https://langium.org/), no DOM or Node-specific APIs in the hot path. This package is the foundation everything else in the toolchain (`@nowline/layout`, `@nowline/renderer`, `@nowline/cli`, `@nowline/lsp`) is built against.

## Install

```bash
pnpm add @nowline/core
```

## Usage

### Parse and validate from a file

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

const ast = doc.parseResult.value;          // typed AST root: NowlineFile
const parserErrors = doc.parseResult.parserErrors;
const diagnostics = doc.diagnostics ?? [];  // validation errors/warnings

const resolved = await resolveIncludes(ast, '/absolute/path/to/roadmap.nowline', {
  services: Nowline,
});

resolved.config.styles;        // Map<string, StyleDeclaration>
resolved.content.swimlanes;    // Map<string, SwimlaneDeclaration>
resolved.content.waves;        // Map<string, WaveDeclaration> | undefined (set when a file declares waves)
resolved.content.isolatedRegions;
resolved.diagnostics;          // Array<ResolveDiagnostic>
```

### Parse from in-memory text

For embedding in editors or one-shot validation against a string:

```ts
import { createNowlineServices } from '@nowline/core';
import { URI } from 'langium';

const { shared } = createNowlineServices();
const doc = shared.workspace.LangiumDocumentFactory.fromString(
  text,
  URI.parse('memory:///roadmap.nowline'),
);
await shared.workspace.DocumentBuilder.build([doc], { validation: true });

const ast = doc.parseResult.value;
```

## What's included

- **Grammar**: `src/language/nowline.langium` (Langium, indentation-aware).
- **AST**: generated into `src/generated/ast.ts` — use `isItemDeclaration`, `isSwimlaneDeclaration`, etc. as type guards.
- **Validator**: 32 validation rules covering file structure, identifiers, property values, include semantics, parallel/group constraints, and more.
- **Include resolver**: multi-file resolution with merge/ignore/isolate modes, circular-include detection, diamond deduplication.

## `@nowline/core/internal`

The `./internal` subpath holds helpers that the other `@nowline/*` packages share, such as the one walk over a roadmap's declarations (`ast-walk`). It is **unstable** and meant for other `@nowline/*` packages only: every package versions in lock-step, so a change here ships with its callers. Don't depend on it from outside this repo. Anything you need from it that is missing from the supported API is worth an issue.

```ts
import { declarations, trackNodes } from '@nowline/core/internal';
```

## Regenerate AST

After editing the grammar, regenerate:

```bash
pnpm run langium:generate
```

## Test

```bash
pnpm test           # one-shot
pnpm test:watch     # watch mode
```

## License

Apache 2.0.
