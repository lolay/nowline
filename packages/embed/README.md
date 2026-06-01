# @nowline/embed

Browser bundle that finds ` ```nowline ` fenced code blocks in a page
and renders them as SVG roadmaps. Mirrors the
[Mermaid](https://mermaid.js.org) embed surface — drop a `<script>`
tag and Nowline blocks light up.

## Quick start

```html
<!-- pin an exact version in production -->
<script src="https://cdn.jsdelivr.net/npm/@nowline/embed@0.4.2/dist/nowline.min.js"></script>
```

That's it. Every `<pre><code class="language-nowline">…</code></pre>`
block on the page renders on `DOMContentLoaded`.

## Configuration

```html
<script src="https://cdn.jsdelivr.net/npm/@nowline/embed@0.4.2/dist/nowline.min.js"></script>
<script>
  nowline.initialize({
    theme: 'dark',         // 'light' | 'dark' | 'auto' (reads prefers-color-scheme once)
    startOnLoad: true,     // auto-run on DOMContentLoaded
    selector: 'pre code.language-nowline',
    locale: 'fr-CA',
    width: 1024,
  });
</script>
```

Theme precedence (highest to lowest):

1. The `initialize({ theme })` flag.
2. The file's own `nowline v1 theme:` directive.
3. `prefers-color-scheme` — captured **once** on init, not reactive.

## Manual rendering

For dynamically loaded blocks or custom containers:

```html
<script src="https://cdn.jsdelivr.net/npm/@nowline/embed@0.4.2/dist/nowline.min.js"></script>
<script>
  const svg = await nowline.render(`
    roadmap "My Roadmap"
    swimlane team
      item a "Task A" duration:1w
      item b "Task B" duration:2w after:a
  `);
  document.getElementById('target').innerHTML = svg;
</script>
```

The bundle also exposes `nowline.parse(source)` for editor-style
applications that want diagnostics without running layout / render, and
`nowline.run()` (alias of `init`) to manually re-scan after the page
mutates.

## CDN URLs

jsDelivr is the documented CDN channel. The bytes are served directly
from the npm tarball — byte-identical to `npm pack @nowline/embed@X.Y.Z`.

| URL pattern | Stability | Audience |
|-------------|-----------|----------|
| `https://cdn.jsdelivr.net/npm/@nowline/embed@X.Y.Z/dist/nowline.min.js` | immutable per patch | production embedders pinning a known-good build |
| `https://cdn.jsdelivr.net/npm/@nowline/embed@X.Y/dist/nowline.min.js`   | mutable within minor | embedders who want patch fixes auto-rolled in (pre-1.0 the minor is the breaking-change boundary) |
| `https://cdn.jsdelivr.net/npm/@nowline/embed/dist/nowline.min.js`       | mutable, latest stable | docs, demos, prototypes |
| `https://cdn.jsdelivr.net/npm/@nowline/embed@next/dist/nowline.min.js`  | HEAD-tracking canary (`0.0.0-dev.*`) | "next" preview, opt-in only |

unpkg also works (`https://unpkg.com/@nowline/embed@X.Y.Z/dist/nowline.min.js`).

Pin the version in production so a release does not silently re-render
your roadmap. See [`specs/embed.md`](../../specs/embed.md) for the
full distribution spec.

## Limitations

- **`include`-directives are skipped.** The embed runs in single-file
  mode; a one-shot `console.warn` fires when a multi-file roadmap is
  loaded. Use the CLI or the GitHub Action for multi-file rendering.
- **No asset resolver.** `<script>` tags can't read the host
  filesystem; logos are not embedded by the browser bundle. The CLI
  is the path for embedded raster assets.
- **Hosts that strip `<script>` tags** (GitHub READMEs, email,
  Slack, Discord, Confluence rich text) cannot run the embed. The
  GitHub Action exists for those.

## ESM consumers

Frameworks that bundle their own JS can install the package and import
named exports:

```ts
import { render, initialize } from '@nowline/embed';
```

The package is `"type": "module"` and `"sideEffects": false`, so a
modern bundler (esbuild, Rollup, Webpack 5+, Vite) tree-shakes the
auto-scan bootstrap when it's unused.

## License

Apache-2.0. See [LICENSE](../../LICENSE).
