# @nowline/export-core

Shared types, helpers, and font infrastructure used by every Nowline export
package. Intentionally small: zero heavy dependencies, browser-safe types,
and a single Node-only side (the platform font probe) that's lazy-loaded.

**License:** Apache 2.0
**Part of:** [`lolay/nowline`](../../) monorepo
**Spec:** [`specs/handoffs/m2c.md`](../../specs/handoffs/m2c.md) § 1, § 10

## Install

```bash
pnpm add @nowline/export-core
```

`@nowline/export-core` is a peer of every `@nowline/export-*` package —
install it once and the format packages will use the same types and font
resolution as the CLI.

## What lives here

### Shared types

- `ExportInputs` — the bundle every format exporter consumes: parsed AST,
  resolved-include result, positioned model, source path, and `today`. This
  is the single shape `cli/src/commands/render.ts` builds once and hands to
  each `export*()` function.
- `PdfPageSize`, `PdfPresetName`, `PdfOrientation`, `PdfLength`,
  `PdfLengthUnit` — used by both `@nowline/export-pdf` and the CLI argument
  parser.
- `FontSource`, `FontRole`, `ResolvedFont`, `ResolvedFontPair` — see
  *Font resolution* below.

### Unit conversion

```ts
import { parseLength, lengthToPoints } from '@nowline/export-core';

parseLength('0.5in');         // { value: 0.5, unit: 'in' }
lengthToPoints({ value: 0.5, unit: 'in' });  // 36
lengthToPoints({ value: 12,  unit: 'pt' });  // 12
```

Supported units: `pt`, `in`, `mm`, `cm`. Bare numbers parse as points.

### PDF page sizing

```ts
import { parsePageSize, resolvePage, fitContent } from '@nowline/export-core';

parsePageSize('letter');         // { kind: 'preset', name: 'letter' }
parsePageSize('8.5x11in');       // { kind: 'custom', wPt: 612, hPt: 792 }
parsePageSize('content');        // { kind: 'content' }

const page = resolvePage(pageSize, orientation, marginPt, contentBox);
const scale = fitContent(page, contentBox);
```

`resolvePage()` flips dimensions when `orientation: 'auto'` chooses
landscape over portrait based on the model's aspect ratio. `fitContent()`
returns the scale factor that fits the content inside `(page − 2 ×
margin)` without exceeding 1:1 (a small roadmap doesn't bloat to fill the
page).

### Font resolution

`resolveFonts()` is the single entry point for picking a sans/mono pair for
a render. The five-step precedence chain is documented in
`specs/handoffs/m2c.md` § 10:

1. **Explicit flag** — `fontSans: '/path/to/Foo.ttf'` (or alias `'sf'`,
   `'helvetica'`, `'dejavu'`).
2. **Environment** — `NOWLINE_FONT_SANS`, `NOWLINE_FONT_MONO`.
3. **Headless** — `headless: true` skips the platform probe and uses the
   bundled DejaVu pair. Also automatically selected when running inside a
   container with no fontconfig.
4. **Platform probe** — macOS: SF Pro → Helvetica → Geneva. Windows:
   Segoe UI → Arial → Tahoma. Linux: DejaVu Sans (Debian, Fedora, Arch
   paths) → Liberation Sans → bundled DejaVu fallback.
5. **Bundled** — DejaVu Sans + DejaVu Sans Mono ship with this package.
   Always succeeds; ensures the resolver is total.

```ts
import { resolveFonts } from '@nowline/export-core';

const result = await resolveFonts({
    fontSans: undefined,         // null/undefined = use precedence chain
    fontMono: undefined,
    headless: false,
});

result.sans;   // { source: 'probe', name: 'SF Pro', bytes: Uint8Array(...) }
result.mono;   // { source: 'probe', name: 'SF Mono', bytes: Uint8Array(...) }
result.sansFellBackToBundled;  // boolean — true if step 5 fired
result.monoFellBackToBundled;
```

Variable fonts (e.g., SF Pro on macOS Ventura+) are detected by inspecting
the OpenType `fvar` table and instanced at `wght: 400` to produce
deterministic, single-instance bytes — `fontkit` is *not* a runtime
dependency.

### Bundled font assets

DejaVu Sans (`assets/fonts/DejaVuSans.ttf`) and DejaVu Sans Mono
(`assets/fonts/DejaVuSansMono.ttf`) ship with this package. They're used as
the always-available fallback in step 5 of the resolver.

The DejaVu license (Bitstream Vera + public-domain additions) is
`assets/fonts/LICENSE-DejaVu.txt`. It is MIT-compatible; redistribution is
permitted with notice retained in the package files. SF Pro / SF Mono are
*not* shipped — they're picked up at render time on macOS only and embedded
into the output (PDF subset, PNG raster). See
`specs/handoffs/m2c.md` § 10 for the full font licensing notes.

## Determinism

Every helper in this package is deterministic given identical inputs:

- `parsePageSize`, `parseLength`, `resolvePage`, `fitContent`, `validateMargin`
  are pure functions of their arguments.
- `resolveFonts` returns byte-identical font bytes across calls (variable
  fonts are instanced before being returned).
- The bundled DejaVu cache is process-global; `clearBundledCache()` resets
  it for tests.

## License

Apache-2.0. Shipped with bundled DejaVu fonts (Bitstream Vera license,
`assets/fonts/LICENSE-DejaVu.txt`).
