# Nowline — Embed Specification

## Overview

The Nowline embed script is a browser JavaScript bundle that finds ` ```nowline ` fenced code blocks in a web page and replaces them with rendered SVG roadmaps. It works like Mermaid's embed script — add a `<script>` tag and roadmaps render client-side with no server.

**Package:** `@nowline/embed` in `lolay/nowline` monorepo.
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
<script src="https://cdn.jsdelivr.net/npm/@nowline/embed@latest/dist/nowline.min.js"></script>
```

That's it. Any ` ```nowline ` block in the page will render automatically on `DOMContentLoaded`.

### With Configuration

```html
<script src="https://cdn.jsdelivr.net/npm/@nowline/embed@latest/dist/nowline.min.js"></script>
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
<script src="https://cdn.jsdelivr.net/npm/@nowline/embed@latest/dist/nowline.min.js"></script>
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

Every `npm publish` of `@nowline/embed` is automatically available via the standard npm-backed CDNs:

| CDN | URL Pattern |
|-----|-------------|
| jsDelivr | `https://cdn.jsdelivr.net/npm/@nowline/embed@{version}/dist/nowline.min.js` |
| unpkg | `https://unpkg.com/@nowline/embed@{version}/dist/nowline.min.js` |

Both support `@latest` and version-pinned URLs. No extra deploy step beyond `npm publish`.

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
