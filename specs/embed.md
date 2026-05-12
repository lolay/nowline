# Nowline — Embed Specification

## Overview

The Nowline embed script is a browser JavaScript bundle that finds ` ```nowline ` fenced code blocks in a web page and replaces them with rendered SVG roadmaps. It works like Mermaid's embed script — add a `<script>` tag and roadmaps render client-side with no server.

**Package:** `@nowline/embed`, developed in the `lolay/nowline-embed` sibling repo (mirrors `lolay/nowline-action` posture — see [Architecture](./architecture.md#organization-and-repositories)).
**License:** Apache 2.0.
**Milestone:** m4.

## How It Works

1. Page loads the embed script via `<script>` tag.
2. Script scans the DOM for `<pre><code class="language-nowline">` blocks (the standard HTML output of ` ```nowline ` in markdown renderers).
3. For each block, it extracts the text content, parses it with `@nowline/core`, lays it out with `@nowline/layout`, and renders it with `@nowline/renderer`.
4. The original `<pre>` block is replaced with the rendered SVG.

## Usage

### Basic

```html
<script src="https://embed.nowline.io/0.2.0/nowline.min.js"></script>
```

That's it. Any ` ```nowline ` block in the page will render automatically on `DOMContentLoaded`.

### With Configuration

```html
<script src="https://embed.nowline.io/0.2.0/nowline.min.js"></script>
<script>
  nowline.initialize({
    theme: 'dark',
    startOnLoad: true,
    selector: 'pre code.language-nowline'  // custom selector
  });
</script>
```

### Manual Rendering

```html
<script src="https://embed.nowline.io/0.2.0/nowline.min.js"></script>
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

## Distribution

The embed bundle is served from two domains, both Firebase-Hosted under separate Firebase projects so dev traffic and abuse can never spill into prod:

| URL | Triggered by | Stability | `Cache-Control` | Audience |
|-----|--------------|-----------|-----------------|----------|
| `https://embed.nowline.io/{X.Y.Z}/nowline.min.js` | git tag push on `lolay/nowline-embed` | immutable per patch | `public, max-age=31536000, immutable` | embedders pinning to a known-good build |
| `https://embed.nowline.io/{X.Y}/nowline.min.js` | git tag push (rewritten on each release in the minor) | mutable within minor | `public, max-age=300, s-maxage=600` | embedders who want patch fixes auto-rolled in |
| `https://embed.nowline.io/latest/nowline.min.js` | git tag push (rewritten on each release) | mutable, latest stable | `public, max-age=300, s-maxage=600` | docs site, demos, prototypes |
| `https://embed.nowline.dev/nowline.min.js` | every push to `main` on `lolay/nowline-embed` | mutable, no SLA, may break | `public, max-age=60, s-maxage=120, must-revalidate`, `X-Robots-Tag: noindex` | internal preview, early adopters opting into "next" |
| `https://nowline-embed-dev--pr-{N}-{sha}.web.app/nowline.min.js` | PR open or sync against `lolay/nowline-embed` `main` | ephemeral, 7-day TTL | Firebase default | per-PR review, posted as a PR comment by the deploy action |

### Why minor-pinning, not major-pinning, on `embed.nowline.io`

Per semver, the *minor* is the breaking-change boundary while the package is pre-1.0 (`0.2 → 0.3` is allowed to break; `0.2.0 → 0.2.1` must not). So the auto-upgrading "stable channel" for an embedder during 0.x is `/0.2/`, not `/0/` — bare `/0/` would also read as ambiguous, while `/0.2/` is unambiguously a version number.

When the package reaches 1.0, a `https://embed.nowline.io/v{N}/nowline.min.js` major-pinned tier will be added (`v` prefix because bare `/1/` is ambiguous in the same way `/0/` was). Existing `0.2.0`, `0.2`, `latest`, `dev` URLs keep working unchanged.

### Bundle provenance

Every built bundle includes a banner injected at the top:

```js
/*! @nowline/embed 0.2.0 sha=<short-sha> built=<iso-utc> */
```

curl the URL or open it in DevTools to see exactly which build is being served. The `embed.nowline.dev` build additionally calls `console.warn("nowline embed @<sha> — unstable, do not pin")` once per page load.

### Why a custom CDN instead of jsDelivr / unpkg

The embed is shipped as `@nowline/embed` on npm, so the npm-backed CDNs (jsDelivr, unpkg) automatically serve it too — but they're an unsupported escape hatch, not a documented channel. The custom CDN exists for branded URLs in `view-source` (small but real marketing surface), per-version telemetry for sunset planning, custom cache and security headers, and the `embed.nowline.dev` + per-PR ephemeral preview tiers that npm-backed CDNs can't provide. We can revisit and document jsDelivr as a fallback if real-world feedback surfaces a need.

## Bundle Size Target

**< 150KB gzipped.** This includes the parser (Langium runtime), layout engine, and SVG renderer. No external dependencies in the browser bundle.

For comparison:
- Mermaid embed: ~200KB gzipped
- D2 WASM: ~2MB

## Platform Integration

### Markdown Renderers

The embed works anywhere that markdown renders ` ```nowline ` as `<pre><code class="language-nowline">`:

- GitHub Pages (Jekyll, Hugo, Docusaurus, etc.)
- Notion (via embedded HTML blocks)
- Confluence (via HTML macro)
- Any static site generator

### Limitations

The embed script **does not work** in contexts where you cannot inject a `<script>` tag:

- GitHub.com (READMEs, issues, PRs) — use the GitHub Action instead
- Slack, Discord, Teams messages
- Email

## GitHub Action (`lolay/nowline-action`)

The GitHub Action is the solution for contexts where the embed script cannot run (GitHub READMEs, CI pipelines).

**Repo:** `lolay/nowline-action` (OSS, Apache 2.0).
**Milestone:** m4 (ships with the embed).

### Two Modes

#### File Mode

Render `.nowline` files into SVG/PNG and commit the output.

```yaml
- uses: lolay/nowline-action@v1
  with:
    mode: file
    input: docs/roadmap.nowline
    output: docs/roadmap.svg
    format: svg
```

The README then references the generated image:

```markdown
![Roadmap](docs/roadmap.svg)
```

#### Markdown Mode

Scan markdown files for ` ```nowline ` fenced code blocks, render each one, and insert the generated image adjacent to the block.

```yaml
- uses: lolay/nowline-action@v1
  with:
    mode: markdown
    files: '**/*.md'
    format: svg
    commit: true
    commit-message: 'render nowline diagrams'
```

The action:

1. Finds all ` ```nowline ` blocks in the matched markdown files.
2. Renders each block to an SVG/PNG file in a configurable output directory.
3. Inserts an image reference below each block (or replaces a previously generated one).
4. Optionally commits the changes.

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `mode` | `file` or `markdown` | `file` |
| `input` | Path to `.nowline` file (file mode) | required in file mode |
| `output` | Output path (file mode) | required in file mode |
| `files` | Glob pattern for markdown files (markdown mode) | `**/*.md` |
| `format` | `svg` or `png` | `svg` |
| `theme` | `light` or `dark` | `light` |
| `commit` | Auto-commit rendered output | `false` |
| `commit-message` | Commit message | `render nowline diagrams` |

### How It Works Under the Hood

The action installs the `nowline` CLI (from npm), then runs `nowline <input>` (verbless) for each input. No Docker image required — it runs directly on the GitHub Actions runner.
