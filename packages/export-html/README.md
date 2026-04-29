# @nowline/export-html

Self-contained HTML export — wraps the renderer's SVG in a single page with
inline CSS, an inline pan/zoom script, and a print stylesheet. Pure
strings. No external assets, no third-party JavaScript.

**License:** Apache 2.0
**Part of:** [`lolay/nowline`](../../) monorepo
**Spec:** [`specs/handoffs/m2c.md`](../../specs/handoffs/m2c.md) § 5
**Tiny / full:** *full only* — install
[`@nowline/cli-full`](../cli-full) or download a `nowline-full-<os>-<arch>`
binary from [GitHub Releases](https://github.com/lolay/nowline/releases).

## Install

```bash
pnpm add @nowline/export-html @nowline/export-core @nowline/renderer
```

## Usage

```ts
import { renderSvg } from '@nowline/renderer';
import { exportHtml } from '@nowline/export-html';

const svg = await renderSvg(model);
const html = await exportHtml(inputs, svg, {
    title: 'Q1 Roadmap',
});

// `html` is a single self-contained UTF-8 string; write it to disk or pipe
// it directly to stdout. Open it in any modern browser — no server required.
```

## Options

| Option        | Default                | Notes |
|---------------|------------------------|-------|
| `title`       | roadmap title          | `<title>` element. Defaults to `inputs.ast.roadmapDecl?.title`. |
| `embedAssets` | `true`                 | Reserved for a future "external assets" mode; ignored in m2c. The renderer already inlines logos/icons via the asset resolver. |
| `generator`   | `'nowline (m2c)'`      | `<meta name="generator">` value. Tests pin this so snapshots are stable across version bumps. |

## What's in the output

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="nowline (m2c)">
  <title>Q1 Roadmap</title>
  <style>/* reset + viewport + print rules */</style>
</head>
<body>
  <div id="nowline-viewport"><!-- inline SVG --></div>
  <script>/* hand-rolled pan/zoom — ~100 LOC */</script>
</body>
</html>
```

The pan/zoom script is hand-rolled (Resolution 7 in the m2c handoff) to
avoid pulling a third-party library. It supports:

- Mouse drag to pan; scroll-wheel zoom around the cursor.
- Touch drag and pinch zoom.
- Keyboard shortcuts: arrow keys to pan, `+`/`-` to zoom, `0` to reset.
- Print stylesheet that disables pan/zoom and fits the SVG on the page.

## Determinism

- No `new Date()`, no random IDs, no user-agent branching.
- The script bundle is a literal string constant in
  `src/pan-zoom-script.ts` — same bytes every export.
- Output snapshots in `test/__snapshots__/` regenerate via `vitest -u`.

## Tiny / full distribution

Same story as the other "full only" exporters. The tiny `nowline` binary
exits `2` with a "the 'html' format is not available in this build"
message. Install [`@nowline/cli-full`](../cli-full) or download
`nowline-full-<os>-<arch>` to enable HTML export.

## License

Apache-2.0.
