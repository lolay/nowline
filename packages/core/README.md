# @nowline/core

Parser, typed AST, and validator for the [Nowline](../../) DSL.

## Install

```bash
pnpm add @nowline/core
```

## Usage

### Parse and validate

```ts
import { createNowlineServices } from '@nowline/core';
import { URI } from 'langium';

const { shared } = createNowlineServices();
const doc = shared.workspace.LangiumDocumentFactory.fromString(
  text,
  URI.parse('memory:///roadmap.nowline'),
);
await shared.workspace.DocumentBuilder.build([doc], { validation: true });

const ast = doc.parseResult.value;          // typed AST root: NowlineFile
const parserErrors = doc.parseResult.parserErrors;
const diagnostics = doc.diagnostics ?? []; // validation errors/warnings
```

### Resolve includes

```ts
import { resolveIncludes } from '@nowline/core';

const resolved = await resolveIncludes(ast, '/abs/path/to/roadmap.nowline', {
  services: Nowline,
});

resolved.config.styles;        // Map<string, StyleDeclaration>
resolved.content.swimlanes;    // Map<string, SwimlaneDeclaration>
resolved.content.isolatedRegions;
resolved.diagnostics;          // Array<ResolveDiagnostic>
```

## What's included

- **Grammar**: `src/language/nowline.langium` (Langium, indentation-aware).
- **AST**: generated into `src/generated/ast.ts` — use `isItemDeclaration`, `isSwimlaneDeclaration`, etc. as type guards.
- **Validator**: 32 validation rules covering file structure, identifiers, property values, include semantics, parallel/group constraints, and more.
- **Include resolver**: multi-file resolution with merge/ignore/isolate modes, circular-include detection, diamond deduplication.

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
