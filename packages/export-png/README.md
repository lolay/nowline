# @nowline/export-png

Rasterizes a Nowline-rendered SVG to PNG using
[`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) (a Rust→WASM SVG
rasterizer). Bundled into the `nowline` CLI.

**License:** Apache 2.0
**Part of:** [`lolay/nowline`](../../) monorepo
**Spec:** [`specs/handoffs/m2c.md`](../../specs/handoffs/m2c.md) § 3

## Install

```bash
pnpm add @nowline/export-png @nowline/export-core @nowline/renderer
```

## Usage

```ts
import { layoutRoadmap } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { resolveFonts } from '@nowline/export-core';
import { exportPng } from '@nowline/export-png';

const svg = await renderSvg(layoutRoadmap(file, resolved, { theme }));
const fonts = (await resolveFonts({ headless: true })).pair();
const png = await exportPng({ ast, resolved, model, sourcePath, today }, svg, {
    scale: 2,
    fonts,
});

// `png` is a Uint8Array of PNG bytes.
```

## Options

| Option         | Default     | Notes |
|----------------|-------------|-------|
| `scale`        | `2`         | Pixel-density multiplier. Scales the root `<svg width/height>` before rasterization. Common values: `1`, `1.5`, `2`, `3`. |
| `background`   | model       | Override the background color (CSS color or `transparent`). |
| `fonts`        | `resolveFonts()` | Pre-resolved sans/mono pair. If omitted, the exporter calls `@nowline/export-core`'s resolver itself. |
| `resvgOptions` | (none)      | Escape hatch for resvg-js options. Use sparingly. |

The `scale` factor is applied by rewriting the root SVG element's
`width`/`height` attributes — `resvg-js` 2.6.x ignores `fitTo` when
`fontBuffers` is set, so this is the workaround the package uses to keep
custom-font rendering deterministic.

## Determinism

- WASM module: lazy-loaded on first call; cached process-globally. The
  `_resetResvgModule()` test seam clears the cache.
- `loadSystemFonts: false` — only fonts passed via `fontBuffers` are
  visible to resvg, so identical input produces identical bytes regardless
  of host machine.
- Font bytes come from `@nowline/export-core`'s 5-step resolver. With
  `--headless` (or the equivalent option here), the bundled DejaVu pair is
  used and the output is byte-stable across macOS / Linux / Windows.
- The PNG header bytes are `\x89PNG\r\n\x1a\n` followed by an `IHDR` chunk
  whose dimensions equal `scale × <svg width> × scale × <svg height>`.

## Snapshot tests

Snapshots live in `test/__snapshots__/`. Regenerate with `vitest -u`. Hash
tests in `test/export-png.test.ts` confirm byte-stability across
re-renders.

## License

Apache-2.0.
