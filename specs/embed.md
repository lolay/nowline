# Nowline — Embed Specification

## Overview

The Nowline embed script is a browser JavaScript bundle that finds ` ```nowline ` fenced code blocks in a web page and replaces them with rendered SVG roadmaps. It works like Mermaid's embed script — add a `<script>` tag and roadmaps render client-side with no server.

**Package:** `@nowline/embed`, in this monorepo at `packages/embed/`, published to npm in lock-step with the rest of the workspace.
**License:** Apache 2.0.
**Milestone:** m4. (The GitHub Action is its own milestone — m3.5 — built in this monorepo at `packages/nowline-action/` and mirrored to the `lolay/nowline-action` repo for GitHub Marketplace listing. See `specs/milestones.md` for the m3.5 / m4 split.)

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
    theme: 'dark',           // 'light' | 'dark' | 'auto' (reads prefers-color-scheme once)
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

### API Surface

| Call                            | Returns                  | Use for |
|---------------------------------|--------------------------|---------|
| `nowline.initialize(options?)`  | `void`                   | Configure theme / selector / locale once on page load. |
| `nowline.render(source, opts?)` | `Promise<string>` (SVG)  | Render a single source string to SVG (custom containers, dynamic loads). |
| `nowline.parse(source)`         | `Promise<{ ast, errors }>` | Parse without layout / render — for editor experiences. |
| `nowline.init()` / `.run()`     | `Promise<{ rendered, failed }>` | Manually re-scan after the page mutates. |

## Distribution

The embed bundle is served from two domains, both Firebase-Hosted under separate Firebase projects so dev traffic and abuse can never spill into prod. The build artefact is produced inside this monorepo (`packages/embed/`) and the release pipeline is responsible for uploading it to Firebase — see [Bootstrap status](#bootstrap-status) for what's wired today.

| URL | Triggered by | Stability | `Cache-Control` | Audience |
|-----|--------------|-----------|-----------------|----------|
| `https://embed.nowline.io/{X.Y.Z}/nowline.min.js` | release tag | immutable per patch | `public, max-age=31536000, immutable` | embedders pinning to a known-good build |
| `https://embed.nowline.io/{X.Y}/nowline.min.js` | release tag (rewritten on each release in the minor) | mutable within minor | `public, max-age=300, s-maxage=600` | embedders who want patch fixes auto-rolled in |
| `https://embed.nowline.io/latest/nowline.min.js` | release tag (rewritten on each release) | mutable, latest stable | `public, max-age=300, s-maxage=600` | docs site, demos, prototypes |
| `https://embed.nowline.dev/nowline.min.js` | every push to `main` | mutable, no SLA, may break | `public, max-age=60, s-maxage=120, must-revalidate`, `X-Robots-Tag: noindex` | internal preview, early adopters opting into "next" |
| `https://nowline-embed-dev--pr-{N}-{sha}.web.app/nowline.min.js` | PR open or sync | ephemeral, 7-day TTL | Firebase default | per-PR review, posted as a PR comment by the deploy action |

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

### Bootstrap status

The bundle ships in m4 as `@nowline/embed` on npm (already wired through `release.yml`). The Firebase Hosting projects, deploy job, and the `embed.nowline.{io,dev}` DNS records remain to be set up — see the m4 handoff under [Carried forward](./handoffs/handoff-m4-embed.md) and `specs/features.md` feature 32. The one-time provisioning runbook for the two Firebase projects, service accounts, GitHub secrets, DNS, and the dev auth gate decision is at [`../ops/embed-deploy.md`](../ops/embed-deploy.md). Until that lands, embedders that need the bundle today can `npm i @nowline/embed` and serve it themselves; the URLs above are the shape the documented channel will take, not something live yet.

## Bundle Size Target

**≤ 175 KB gzipped.** First measurement landed at ~163 KB; the 175 KB ceiling buys ~12 KB headroom for incremental growth and still beats Mermaid by a comfortable margin. Crossing 200 KB triggers a serious review (pre-bundled grammars, hand-rolled parser, etc.) — the m4 plan documents the escalation. The `bundle-size` CI job (`packages/embed/scripts/check-size.mjs`) gates every PR.

For comparison:
- Mermaid embed: ~200KB gzipped
- D2 WASM: ~2MB

## Single-File Mode (`include` directive)

The browser embed runs in single-file mode: it cannot fetch other `.nowline` files. When an `include "./other.nowline"` directive is encountered, the embed:

1. Emits a one-shot `console.warn` describing the limitation.
2. Skips the include and renders whatever survived without it.

A future opt-in HTTP-fetch resolver could resolve relative includes via `fetch()`, but it is intentionally out of scope for m4 (CORS, relative-URL semantics, and waterfall performance each warrant their own decision). Use the CLI or the GitHub Action for multi-file rendering today.

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

## GitHub Action (`packages/nowline-action/`)

The GitHub Action is the solution for contexts where the embed script cannot run (GitHub READMEs, CI pipelines).

**Source:** `packages/nowline-action/` in this monorepo.
**Marketplace mirror:** `lolay/nowline-action` (write-only; populated by `release.yml` on each tag with the compiled `action.yml` + `dist/`. Exists because GitHub Marketplace requires `action.yml` at repo root).
**License:** Apache 2.0.
**Milestone:** m3.5 — sequenced before m4 so the GitHub-bound rendering path lands first. The action shells out to `@nowline/cli`. At dev time that's a workspace symlink so cross-cutting PRs stay atomic; at runtime the action `npm install -g`s the CLI version that matches its tag, so the published artifact consumes the CLI exactly the way an external user would.

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
