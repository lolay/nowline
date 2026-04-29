# @nowline/renderer

SVG renderer for the [Nowline](../../) roadmap DSL.

`@nowline/renderer` takes a positioned model from [`@nowline/layout`](../layout)
and emits a deterministic SVG string. It is palette-dumb (every color comes
from the positioned model), browser-safe (no `fs`, `path`, `process`, or
`Buffer`), and has no runtime dependencies beyond `@nowline/layout`.

> **Other output formats live in dedicated packages.** PNG, PDF, HTML,
> Mermaid, XLSX, and MS Project XML are produced by
> [`@nowline/export-png`](../export-png), [`@nowline/export-pdf`](../export-pdf),
> [`@nowline/export-html`](../export-html),
> [`@nowline/export-mermaid`](../export-mermaid),
> [`@nowline/export-xlsx`](../export-xlsx), and
> [`@nowline/export-msproj`](../export-msproj) respectively. Each one takes
> the renderer's SVG (or the AST) as input and adds *only* the runtime
> dependency it needs — keeping the renderer browser-safe and the per-format
> install footprint small. See
> [`specs/handoffs/m2c.md`](../../specs/handoffs/m2c.md) § 1 for the
> rationale.

## Install

```bash
pnpm add @nowline/renderer @nowline/layout @nowline/core
```

## Usage

```ts
import { layoutRoadmap } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';

const model = layoutRoadmap(file, resolved, { theme: 'light' });
const svg = await renderSvg(model, {
  // optional; used when a roadmap declares a logo path
  assetResolver: async (ref) => {
    const bytes = await fetchLogoBytes(ref);   // your IO
    return { bytes, mime: 'image/svg+xml' };
  },
  noLinks: false,  // strip link icons when true
  strict: false,   // promote asset warnings to errors
  warn: (message) => console.warn(message),
});

svg; // string: <svg ...>...</svg>
```

The returned string is UTF-8 text ready to write to a file, send over HTTP,
or inline into HTML.

## Determinism

Given identical `(model, options)` inputs, `renderSvg()` returns a byte-identical
string every call. Guarantees:

- IDs come from a counter-based generator (no `Math.random`, no timestamps).
- Map iteration is stable; arrays are sorted in source-code order upstream.
- No `Date.now()` or environment-dependent formatting.

This makes SVG snapshot tests meaningful: a diff is always a real change, never
noise.

## Logo embedding

- **SVG logos**: read → `sanitizeSvg()` → id-namespaced → embedded as `<g>`.
- **Raster logos** (`.png`/`.jpg`/`.jpeg`/`.webp`): base64-encoded and embedded
  as `<image href="data:image/<type>;base64,...">`. No re-encoding.
- **Missing/unsupported/corrupt** → `warn()`, placeholder rendered. `strict:
  true` promotes to an exception.

All IO goes through the injected `AssetResolver`. The renderer never touches
the filesystem.

## Sanitizer

`sanitizeSvg(input: string): string` is an in-house allow-list walker designed
to neutralize hostile SVG payloads embedded as roadmap logos. It:

- Rejects `<script>`, `<foreignObject>`, and unknown element types.
- Strips inline event handlers (`on*` attributes).
- Rejects external `href` / `xlink:href`; allows fragment-only references.
- Rejects `data:` URLs inside nested references.
- Rewrites internal ids under a `nl-logo-*` prefix to prevent collisions.

The sanitizer is unit-tested against a corpus of malicious and benign SVGs.
Zero runtime dependencies.

## Attribution

Rendered SVGs include an inline Nowline attribution mark linking to
`https://nowline.io`. Per project policy, stripping the mark requires a
commercial license.
