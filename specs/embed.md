# Nowline — Embed Specification

## Overview

The Nowline embed script is a browser JavaScript bundle that finds ` ```nowline ` fenced code blocks in a web page and replaces them with rendered SVG roadmaps. It works like Mermaid's embed script — add a `<script>` tag and roadmaps render client-side with no server.

**Package:** `@nowline/embed`, in this monorepo at `packages/embed/`, published to npm in lock-step with the rest of the workspace.
**License:** Apache 2.0.
**Milestone:** m4. (The GitHub Action is its own milestone — m3.5 — built in this monorepo at `packages/nowline-action/` and mirrored to the `lolay/nowline-action` repo for GitHub Marketplace listing. See `specs/milestones.md` for the m3.5 / m4 split.)

## How It Works

1. Page loads the embed script via `<script>` tag.
2. Script scans the DOM for `<pre><code class="language-nowline">` blocks (the standard HTML output of ` ```nowline ` in markdown renderers).
3. For each block, it extracts the text content and runs it through `parseSource` / `renderSource` from [`@nowline/browser`](./architecture.md#surfaces) (the shared parse → resolveIncludes → layout → render → diagnostics pipeline introduced in m4.7); the embed passes the no-op include reader so `include` directives degrade to a single deduped `console.warn` per page load.
4. The original `<pre>` block is replaced with the rendered SVG.

`nowline.render(source)` and `nowline.parse(source)` are thin
Mermaid-shaped wrappers around the same `@nowline/browser` calls —
the embed package owns the auto-scan loop, the Mermaid surface, the
warn-once latch, and the esbuild bundle, but the actual transform
lives in `@nowline/browser` so VS Code (via a `node:fs`-backed
`readFile` shim) and downstream browser surfaces (Free SPA) get the
same behaviour without re-implementing the pipeline. See
[`specs/handoffs/handoff-m4.7-browser-pipeline.md`](./handoffs/handoff-m4.7-browser-pipeline.md)
for the consolidation details.

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

## Share on Nowline

Every rendered roadmap can carry a small **"Share on Nowline"** link beneath it. The link encodes the diagram's source into a URL so that opening it lands the viewer in a Nowline editor with that exact roadmap loaded — the same pattern Kroki, PlantUML, and Mermaid use for shareable diagrams.

The feature has two independent halves:

1. **An encoding grammar** — fixed, OSS-owned, and immutable. Every receiver (the Free SPA today, Pro tomorrow, any third party) implements *exactly* this grammar, so a link is portable across origins.
2. **A destination** — configurable through the `share` option, defaulting to Nowline's own Free app.

```html
<script src="https://embed.nowline.io/0.4/nowline.min.js"></script>
<script>
  nowline.initialize({
    share: true,                  // default; see the share matrix below
    sourceUrl: undefined          // optional; enables #url= links (see below)
  });
</script>
```

### Encoding grammar

This grammar is the canonical, OSS-owned contract. It is defined here and only here; downstream receivers implement it verbatim. It MUST NOT change without a coordinated, versioned migration across every receiver (see [Wire-format compatibility](#wire-format-compatibility-with-downstream-receivers)).

The source rides in the URL **fragment** (the `#…` part), which browsers never send to a server, so the payload stays client-side end to end.

- **`#text=<payload>`** — the inline-encoded source, where `payload = base64url( zlib( utf8(source) ) )`:
  - `utf8(source)` — the roadmap source text encoded as UTF-8 bytes.
  - `zlib(…)` — an RFC 1950 zlib stream (2-byte header + DEFLATE body + Adler-32 trailer). Produced by fflate's `zlibSync`, consumed by fflate's `unzlibSync`. These are the **zlib-framed** variants (not raw DEFLATE), chosen so the output is **byte-compatible with the browser-native `CompressionStream('deflate')`** — a future native or third-party implementation interoperates without changing the grammar.
  - `base64url(…)` — standard base64 with `+`→`-`, `/`→`_`, and trailing `=` padding stripped.
- **`#url=<https-url>`** — a percent-encoded `https:` URL of the source file. The receiver fetches the file and renders it. Only the `https:` scheme is accepted.
- **Receiver precedence:** a receiver reads `location.hash` and resolves in this order — **`#text=` first, then `#url=`, then none → showcase.** "Showcase" is the no-hash default landing experience, which preserves the shipped m5a behavior. A link the embed generates carries *exactly one* of `#text=` / `#url=`; the precedence rule governs the general case (e.g. hand-crafted or future links that carry both).

The block below is **illustrative** — the prose grammar above is normative, and O2 owns the production-grade implementation (e.g. chunked base64 for large payloads):

```js
// Encode (embed side; imports only fflate `zlibSync`)
function encodeText(source) {
  const zlib = zlibSync(new TextEncoder().encode(source)); // RFC 1950 stream
  let bin = '';
  for (const byte of zlib) bin += String.fromCharCode(byte);
  return '#text=' + btoa(bin)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decode (receiver side; imports only fflate `unzlibSync`)
function decodeText(fragmentValue) {
  let b64 = fragmentValue.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(unzlibSync(bytes));
}
```

### Share destination — the `share` option

`share` is an `initialize()` option that selects where the link points. The default-base constant is named **`DEFAULT_SHARE_BASE`**.

| `share` value | Rendered link | Notes |
|---------------|---------------|-------|
| `true` *(default)* | `DEFAULT_SHARE_BASE` + fragment | Prod bundle: `"https://free.nowline.io/open"`. Dev bundle (`embed.nowline.dev`): `"https://free.nowline.dev/open"`. Selected at build time via `__NOWLINE_EMBED_ENV__`. |
| `"https://editor.foo.com"` / `"https://foo.com/open"` *(string)* | base + fragment | A **base URL that may include a path** (a "root URI"). The link is built with the `URL` API and the `#text=`/`#url=` fragment is set on it, so `https://foo.com/open` → `https://foo.com/open#text=…`. Lets a self-hoster whose editor lives under a subpath receive shares. |
| `false` / `"none"` | *(none)* | No "Share on Nowline" link is rendered. |
| `{ textUrl, remoteUrl }` *(template)* | substituted template | Escape hatch for hosts needing a non-hash URL shape. `{text}` is substituted with the base64url payload; `{url}` with the percent-encoded source URL. e.g. `{ textUrl: 'https://x.com/o?d={text}', remoteUrl: 'https://x.com/o?u={url}' }`. |

#### Why the default base is `/open`

The default base is `/open`, **not** bare root. The Free SPA already serves every path from one bundle (the `firebase.json` catch-all rewrite `** → /index.html`) and reads `location.hash` regardless of path, so `/open#text=` costs zero new infrastructure and bare `/#text=` keeps resolving too. We emit `/open` as the canonical default because the path — unlike the server-invisible hash — is the *immutable* part of a share URL once it's frozen into a CLI-baked export, a pasted toolbar link, or a bookmark. Embed-generated links self-heal (recomputed on each load by the minor-pinned bundle), but those frozen surfaces want the future-proof shape from day one. `/open` reserves bare root for a future landing/redirect and keeps `/edit` + `/d/{id}` free for m5c's persisted-diagram routes. Semantically, `/open` = open an *ephemeral* shared payload (no persistence until m5c), which `/edit` (implies durability) and `/view` (implies read-only) both misdescribe.

#### `/open` is a cross-app Nowline convention

`/open` is a cross-app Nowline convention, not Free-only. Both `free.nowline.io/open` and (in m6) `pro.nowline.io/open` implement the *same* path + grammar, so a share link is origin-portable: the only thing that differs between tiers is the host. Because the payload rides in the fragment (client-side, never sent to a server), the Free→Pro handoff for a signed-in Pro user is a pure origin swap that carries the hash verbatim — `location.replace('https://pro.nowline.io/open' + location.hash)` — with no decode/re-encode and no diagram ID.

### Source-URL links — the `sourceUrl` option

By default a link carries `#text=` (the inline-encoded source) — it always works and needs no network. When a canonical source URL is known, the embed can instead emit a `#url=` link pointing at that file, which keeps the URL short and lets the receiver fetch the freshest source.

- **`sourceUrl`** — a global `initialize()` option. When set, generated links use `#url=<sourceUrl>` instead of `#text=`. Suited to the common case of one roadmap per page (a docs page embedding its own `.nowline` file).
- **`data-nowline-source-url`** — a per-block attribute on the source element. It overrides the global `sourceUrl` for that one block, so a page with many roadmaps can point each share link at its own source file.

Per-block resolution order: `data-nowline-source-url` → global `sourceUrl` → fall back to `#text=` (inline encoding). Only `https:` URLs are emitted as `#url=`.

### The rendered "Share on Nowline" link

When `share` is not `false`/`'none'`, the embed appends a small anchor immediately after each replaced `<svg>`, as its next sibling:

```html
<a class="nowline-share"
   href="https://free.nowline.io/open#text=eJx…"
   target="_blank"
   rel="noopener noreferrer">Share on Nowline</a>
```

- **Placement** — inserted as the next sibling of the rendered SVG, so it renders as a small link directly below the diagram. (Recall from [How It Works](#how-it-works) that the embed replaces each `<pre>` block with the SVG; the share link is added alongside it.)
- **`class="nowline-share"`** is the single styling hook. The embed ships minimal styling so hosts can theme the link with their own CSS.
- **`href`** is the URL built from the `share` destination + the encoding-grammar fragment.
- Opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`) so the host page is not navigated away.
- When `share` is `false`/`'none'`, no anchor is inserted.

### Wire-format compatibility with downstream receivers

The encoding grammar is shared, by construction, with every downstream receiver:

- The **embed** (this package) only *encodes*. It imports a single fflate function — `zlibSync` — plus a few lines of base64url normalization, keeping it well within the [≤ 175 KB gzipped bundle budget](#bundle-size-target).
- **nowline-app** (the Free SPA at `free.nowline.io/open`, and in m6 the Pro app at `pro.nowline.io/open`) only *decodes*. It imports `unzlibSync` from the **same `fflate` library** and applies the inverse base64url normalization.

Because both sides use the same library and the same zlib (RFC 1950) framing, encode and decode are byte-identical by construction — there is no second format to keep in sync. The grammar is also byte-compatible with the native `CompressionStream('deflate')` / `DecompressionStream`, so either side can migrate to the platform API later without a wire-format change. This compatibility is what makes the cross-app origin swap described in [§`/open` is a cross-app Nowline convention](#open-is-a-cross-app-nowline-convention) safe: the fragment is identical on both origins.

## Distribution

The embed bundle is served from two domains, both Firebase-Hosted under separate Firebase projects so dev traffic and abuse can never spill into prod. **Responsibility split across two repos:**

- **Infrastructure** — the two `nowline-embed-{prod,dev}` GCP projects, billing links, Firebase Hosting custom-domain bindings for `embed.nowline.{io,dev}`, deploy service accounts, Workload Identity Federation pools, and project-level IAM are all Terraform-managed in the infrastructure repository (stack: `stacks/embed/`, milestone m7). Squarespace DNS records for the two `embed.*` subdomains are documented in that repo's `ops/dns.md` (no TF provider).
- **Application** — the bundle build (`packages/embed/`), the per-project `firebase.json` cache-header config, and the `release.yml` deploy cells that consume the infra repo's WIF outputs all live in this monorepo. The deploy job authenticates via WIF (no static service-account JSON keys; the infra's org policy `iam.disableServiceAccountKeyCreation` is enforced at the org level).

See [Bootstrap status](#bootstrap-status) for what's wired today. The end-to-end deploy runbook lives in the infrastructure repository — it covers the GitHub environment + variable wiring, the `firebase.json` cache-header contract, the dev auth gate, and the verification curls.

| URL | Triggered by | Stability | `Cache-Control` | Audience |
|-----|--------------|-----------|-----------------|----------|
| `https://embed.nowline.io/{X.Y.Z}/nowline.min.js` | release tag | immutable; all released `X.Y.Z` reconstructed from npm each deploy | `public, max-age=31536000, immutable` | embedders pinning to a known-good build |
| `https://embed.nowline.io/{X.Y}/nowline.min.js` | release tag (rewritten on each release in the minor) | mutable within minor | `public, max-age=300, s-maxage=600` | embedders who want patch fixes auto-rolled in |
| `https://embed.nowline.io/latest/nowline.min.js` | release tag (rewritten on each release) | mutable, latest stable | `public, max-age=300, s-maxage=600` | docs site, demos, prototypes |
| `https://embed.nowline.dev/latest/nowline.min.js` | every push to `main` | mutable, no SLA, may break | `public, max-age=60, s-maxage=120, must-revalidate`, `X-Robots-Tag: noindex` | internal preview, early adopters opting into "next" |
| `https://nowline-embed-dev--pr-{N}-{sha}.web.app/latest/nowline.min.js` | PR open or sync | ephemeral, 7-day TTL | Firebase default | per-PR review, posted as a PR comment by the deploy action |
| `https://embed.nowline.io/` | release deploy | version index, regenerated each deploy | `public, max-age=300, s-maxage=600` | browsable version catalogue; discovery surface for the CDN |
| `https://embed.nowline.io/{X.Y.Z}/` | release deploy | demo page, regenerated each deploy | `public, max-age=300, s-maxage=600`, `X-Robots-Tag: noindex` | live smoke test for each released version; not indexed |

### Why minor-pinning, not major-pinning, on `embed.nowline.io`

Per semver, the *minor* is the breaking-change boundary while the package is pre-1.0 (`0.2 → 0.3` is allowed to break; `0.2.0 → 0.2.1` must not). So the auto-upgrading "stable channel" for an embedder during 0.x is `/0.2/`, not `/0/` — bare `/0/` would also read as ambiguous, while `/0.2/` is unambiguously a version number.

When the package reaches 1.0, a `https://embed.nowline.io/v{N}/nowline.min.js` major-pinned tier will be added (`v` prefix because bare `/1/` is ambiguous in the same way `/0/` was). All released `X.Y.Z` paths stay available indefinitely — they are reconstructed from the published npm tarball on each deploy, so the CDN bytes are byte-identical to what `npm pack @nowline/embed@X.Y.Z` produces.

### Bundle provenance

Every built bundle includes a banner injected at the top:

```js
/*! @nowline/embed 0.2.0 sha=<short-sha> built=<iso-utc> */
```

curl the URL or open it in DevTools to see exactly which build is being served. The `embed.nowline.dev` build additionally calls `console.warn("nowline embed @<sha> — unstable, do not pin")` once per page load.

### Why a custom CDN instead of jsDelivr / unpkg

The embed is shipped as `@nowline/embed` on npm, so the npm-backed CDNs (jsDelivr, unpkg) automatically serve it too. Direct embedding via `https://cdn.jsdelivr.net/npm/@nowline/embed@{version}/dist/nowline.min.js` (or the equivalent unpkg URL) works and is byte-identical to the branded CDN — the branded CDN's reconstruction logic mirrors exactly what the npm registry serves. However, jsDelivr and unpkg remain an unsupported escape hatch, not a documented channel. The custom CDN exists for branded URLs in `view-source` (small but real marketing surface), per-version telemetry for sunset planning, custom cache and security headers, and the `embed.nowline.dev` + per-PR ephemeral preview tiers that npm-backed CDNs can't provide. We can revisit and document jsDelivr as a fallback if real-world feedback surfaces a need.

### Bootstrap status

The bundle ships in m4 as `@nowline/embed` on npm (already wired through `release.yml`). Two pieces remain to bring the branded CDN online:

1. **Infrastructure repository m7 — Embed tier.** Provisions `nowline-embed-{prod,dev}`, custom domains on `embed.nowline.{io,dev}`, deploy SAs, WIF pools, and IAM via Terraform (`stacks/embed/` instantiates `modules/tier-pair/` for `github_repo = "lolay/nowline"`). Squarespace DNS records on the two `embed.*` subdomains are applied by hand per the infrastructure repository's `ops/dns.md`. See the infrastructure repository's `specs/milestones.md` § m7 for the full deliverables and acceptance criteria.
2. **OSS-repo deploy wiring.** Once m7 is applied, this repo wires `release.yml`'s `embed-prod` / `embed-dev` cells against the infra's WIF outputs (no static keys, no `FIREBASE_SERVICE_ACCOUNT_*` GitHub secrets), ships a `firebase.json` per project encoding the cache-header contract from the [Distribution table](#distribution) above, and resolves the [dev auth gate](#bootstrap-status) decision before exposing `embed.nowline.dev`. The end-to-end checklist lives in the infrastructure repository's deploy runbook.

Until both pieces land, embedders that need the bundle today can `npm i @nowline/embed` and serve it themselves; the URLs above are the shape the documented channel will take, not something live yet. The m4 handoff under [Carried forward](./handoffs/handoff-m4-embed.md) and `specs/features.md` feature 32 are the cross-references.

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

### Render-only contract

The action **renders** Nowline files. It does not commit, push, or open pull requests. Persisting the rendered output is the user's job, composed downstream of the action via a purpose-built helper:

- [`stefanzweifel/git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action) — the canonical "stage, commit, push" composer (signed commits, branch protection, fork-PR detection all built-in).
- [`peter-evans/create-pull-request`](https://github.com/peter-evans/create-pull-request) — when the rendered output should land via PR review rather than direct push.
- A bare `git diff --exit-code` step — for "fail CI when committed renders drift from source" workflows where no commit ever happens.

This shape was chosen deliberately. Rendering and persisting are independent concerns, and the persistence side has a deep, well-maintained ecosystem of specialized actions (signed commits, GPG signing, PR mode, fork detection, retry-on-conflict, `[skip ci]` semantics, etc.). Bundling commit logic into this action would duplicate a thin slice of that surface and force users to live with our defaults; chaining lets every team compose the exact commit semantics they want with the action they already trust.

### Two Modes

#### File Mode

Render a single `.nowline` file to SVG/PNG. The chained commit action picks up the result.

```yaml
- uses: lolay/nowline-action@v1
  with:
    mode: file
    input: docs/roadmap.nowline
    output: docs/roadmap.svg
    format: svg

- uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: 'render nowline diagrams [skip ci]'
    file_pattern: 'docs/roadmap.svg'
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

- uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: 'render nowline diagrams [skip ci]'
    file_pattern: '**/*.md .nowline/'
```

The action:

1. Finds all ` ```nowline ` blocks in the matched markdown files.
2. Renders each block to an SVG/PNG file in a configurable output directory using a content-derived 12-char SHA-256 slug (`<output-dir>/nowline-<slug>.<format>`); identical block content always produces the same filename.
3. Inserts an HTML-comment-fenced image reference below each block, or refreshes an existing one in place. Idempotent across runs — same input means same output, no duplicated markdown.

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `mode` | `file` or `markdown` | `file` |
| `input` | Path to `.nowline` file (file mode) | required in file mode |
| `output` | Output path (file mode) | required in file mode |
| `files` | Glob pattern for markdown files (markdown mode) | `**/*.md` |
| `output-dir` | Directory for markdown-mode rendered images, relative to repo root | `.nowline/` |
| `format` | `svg` or `png` | `svg` |
| `theme` | `light` or `dark` | `light` |
| `cli-version` | Version of `@nowline/cli` to install on the runner | (action version) |

### Action Outputs

| Output | Description |
|--------|-------------|
| `rendered` | Number of diagrams rendered |
| `failed` | Number of diagrams that failed to render |
| `changed-files` | Newline-separated list of files written or modified by the action. Pair with `git-auto-commit-action` or `create-pull-request` to commit them. |

### How It Works Under the Hood

The action installs the `nowline` CLI (from npm) on the runner — skipped when the requested version is already on PATH — then runs `nowline <input> -o <output> -f <format> -t <theme>` for each render. No Docker image required; it runs directly on the GitHub Actions runner.

## Host-Side Add-In Integrations

`@nowline/embed` is the foundation for a planned set of **host-side add-ins**: native integrations that embed a rendered Nowline diagram inside a third-party host tool — in a Jira issue panel, a Confluence page, a Notion block, a Google Docs document, a Word document, a PowerPoint slide, or a Linear issue.

**Direction note:** this is the reverse of the Pro OAuth link-enrichment feature in `nowline-app`, which fetches metadata *from* those tools to render links *inside* a Nowline diagram. Host-side add-ins go the other direction — they put a Nowline diagram *into* the host. Do not conflate the two; they involve different APIs, different OAuth scopes, and live in different parts of the product.

### Planned hosts

| Host | Add-in surface |
|------|---------------|
| Jira | Issue panel or project page macro (Atlassian Forge or Connect framework) |
| Confluence | Page macro — a first-class Forge macro, superseding the current HTML-macro workaround listed under [§ Platform Integration](#platform-integration) |
| Notion | Block integration (Notion integration platform) |
| Google Docs | Workspace Add-on (Apps Script or add-on API) |
| Microsoft Word | Office Add-in (task pane or content add-in) |
| Microsoft PowerPoint | Office Add-in — embeds a diagram as a slide element; this is not `.pptx` export, which is a separate CLI exporter feature |
| Linear | Issue attachment or document embed |

GitHub is already covered by the [GitHub Action](#github-action-packagesnowline-action) (available now, m3.5). No additional host-side add-in is planned for GitHub.

### How they extend `@nowline/embed`

Each add-in consumes `@nowline/embed` (or `@nowline/browser`, the shared parse → layout → render pipeline) for client-side rendering. The add-in layer is responsible only for:

1. The host's native embedding API — inserting the rendered SVG into the document, issue, or slide.
2. A source-editing surface appropriate to the host — inline code block, file reference, or editor field.

Packaging and marketplace distribution (Atlassian Marketplace, Google Workspace Marketplace, Microsoft AppSource, and equivalents) are commercial concerns and are not in scope for this OSS spec. All seven integrations listed above are planned; none have been built or submitted to a marketplace.
