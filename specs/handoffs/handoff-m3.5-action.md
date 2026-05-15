# m3.5 handoff — GitHub Action

Forward-looking onboarding for m3.5. Pairs the product surface in
[`specs/embed.md`](../embed.md) § GitHub Action with the structural
decisions made during m4's wrap-up (monorepo source + Marketplace
mirror, Mermaid-pattern coupling — see the m4 handoff "Decisions that
diverged" for the full rationale).

## Why this milestone exists

The browser embed (m4) cannot run inside hosts that strip `<script>`
tags — GitHub READMEs, GitHub issues, GitHub PRs, and most CI-rendered
markdown surfaces. The GitHub Action is the answer for those: it
shells out to `@nowline/cli` on a runner and commits the rendered
SVG / PNG into the repo, so the markdown reference becomes a static
image asset that any markdown surface renders verbatim.

m3.5 is sequenced before m4 (the browser embed) for two reasons:

1. **No dependency on the embed bundle.** The action consumes
   `@nowline/cli` from npm, which has been shipping since m2a. Waiting
   for m4 buys nothing; shipping first lets users render Nowline in
   GitHub READMEs immediately.
2. **GitHub-bound rendering parity.** m4's embed and m3.5's action
   together close the "render Nowline anywhere on GitHub" gap —
   embed for `<script>`-allowing surfaces, action for the rest. m3.5
   first means the gap closes from the GitHub side first, which is
   the larger audience.

## Where we are

**Shipped so far:**

- `packages/nowline-action/` package scaffold landed:
  - `package.json` (private; runtime deps `@actions/core`,
    `@actions/exec`, `fast-glob`, `unified` + remark family;
    workspace dev dep on `@nowline/cli`).
  - `tsconfig.json` (extends root, server-side `lib: ["ES2022"]`).
  - `action.yml` with the full input matrix from
    [`specs/embed.md`](../embed.md) § GitHub Action plus `output-dir`
    + `cli-version`, three outputs (`rendered`, `failed`,
    `changed-files`), `using: node24`, `branding: { icon: map,
    color: blue }`.
  - `src/index.ts` entry point dispatching to `runFileMode` /
    `runMarkdownMode`; `src/inputs.ts` typed input parsing; stub
    `file-mode.ts` and `markdown-mode.ts` ready for T2/T3.
  - `README.md` with quickstart, input/output tables, and a
    "source lives in monorepo" callout explaining the Marketplace
    mirror posture.
- Workspace `pnpm install` resolves the new package; `pnpm --filter
  @nowline/action run typecheck` passes.

**Building blocks already in place (carried over from m4 / m2):**

- [`@nowline/cli`](../../packages/cli) — verbless CLI (m2b.5) plus all
  export formats (m2c PNG, PDF, HTML, Markdown, XLSX, MS Project XML).
  Shipping on npm + Homebrew + .deb + GitHub Releases since m2l.
- [`@nowline/cli`'s `--init` and `--serve` flags](../../packages/cli/src) —
  patterns the action will reuse for the markdown-scan loop.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
  — has a Homebrew tap mirror cell that pushes a generated formula
  into `lolay/homebrew-tap` on every tag. Same pattern the action's
  Marketplace mirror cell will use, just pointed at a different repo.
- [`packages/embed/scripts/bundle.mjs`](../../packages/embed/scripts/bundle.mjs)
  — esbuild reference the action's bundler will mirror.

**Not yet present:**

- File mode and markdown mode are scaffolding stubs that throw
  "not yet implemented" — T2 and T3 fill them in.
- No esbuild bundle script under `packages/nowline-action/scripts/`.
- No `packages/nowline-action/test/` directory.
- No `lolay/nowline-action` Marketplace mirror repo on GitHub. Will
  be created empty during bootstrap (Apache-2.0 license, README
  pointing at the monorepo for source; everything else populated by
  `release.yml`).
- No `mirror-action` cell in `release.yml`.

## What this milestone needs to deliver

Per [`specs/embed.md`](../embed.md) § GitHub Action:

1. **`packages/nowline-action/` source** — TypeScript entry that
   implements two modes:
   - **File mode** — read `input` and `output` action inputs, run
     `nowline <input> -o <output> -f <format>`, optionally commit.
   - **Markdown mode** — glob `files`, parse each markdown for
     ` ```nowline ` fenced blocks, render each block to a configurable
     output directory, insert / refresh an `![Roadmap](path)` link
     adjacent to the block, optionally commit.
2. **`action.yml`** at the package root, declaring the input matrix
   from the spec table (`mode`, `input`, `output`, `files`, `format`,
   `theme`, `commit`, `commit-message`).
3. **Bundle step** that compiles `src/index.ts` into a single
   `dist/index.js` (no `node_modules` shipped to consumers — actions
   ship their `dist/` because runners don't `npm install`). `ncc` or
   esbuild; pick whichever needs less plumbing.
4. **`lolay/nowline-action` mirror repo bootstrap** — empty repo on
   GitHub under the `lolay` org. README says "this is a mirror;
   source lives at `lolay/nowline/packages/nowline-action`". Add
   `MARKETPLACE_MIRROR_PAT` repo secret on `lolay/nowline` (fine-grained
   PAT with `contents: write` on `lolay/nowline-action`).
5. **`release.yml` mirror cell** — on each release tag, push
   `packages/nowline-action/{action.yml,dist/,README.md,LICENSE}` to
   the mirror repo. Tag the mirror with both the immutable point
   version (`v1.2.3`) and the moving major-tag pointer (`v1`,
   force-pushed) per [GitHub's standard pattern](https://docs.github.com/en/actions/sharing-automations/creating-actions/about-custom-actions#using-tags-for-release-management).
6. **Marketplace listing** — the mirror repo's `action.yml` with a
   `branding:` block (icon + color) is what GitHub Marketplace
   surfaces. Submit for listing once the first release lands.
7. **Tests** in `packages/nowline-action/test/`:
   - Unit tests for the markdown scan/insert logic (parse, find blocks,
     compute insertion sites, idempotent refresh).
   - Integration tests that boot the action's compiled entry against
     a fixture repo (file mode + markdown mode) and assert the
     emitted git diff matches a golden snapshot.

## Key decisions to make early

- **Bundler for the action.** Two reasonable choices:
  - **`@vercel/ncc`** — the de-facto standard for GitHub Actions.
    Bundles `node_modules` deps into a single file, handles dynamic
    `require` heuristics. Used by `actions/checkout`, `actions/cache`,
    most of the `actions/*` family.
  - **esbuild** — already in this monorepo for the embed and
    vscode-extension. Same toolchain.

  My read: esbuild for consistency with the rest of the monorepo. The
  action is a single-entry-point bundle (just like the embed); ncc's
  advantage over esbuild has narrowed since the early days of GitHub
  Actions.
- **CLI install at runtime: tarball or npm.** The action needs the
  CLI on the runner. Two options:
  1. **`npm install -g @nowline/cli@<matching-version>`** as the first
     step inside the action. Simple, deterministic version match;
     ~5–10s overhead per run.
  2. **Bundle the CLI into the action's `dist/`**. Faster startup, but
     the action's tarball balloons (CLI is ~70 MB compiled).

  Recommend option 1. Match-version means the action and CLI stay
  lock-step automatically. The 5–10s overhead is dwarfed by Action
  startup time anyway.
- **Commit semantics.** Three pieces of behaviour to nail down:
  - Should the action skip the commit step if the rendered output is
    byte-identical to what's already committed? (Yes — avoid noise.)
  - Should the action use `actions/checkout`'s default token, or a
    PAT? (Default token is fine for same-repo commits; PAT only if
    the user wants the commits to bypass branch protection.)
  - Should the action force-push? (No — append a normal commit. Force-
    push behaviour is a footgun.)
- **Markdown-mode insertion idempotency.** When the action runs twice,
  the second run shouldn't double-insert image refs. Use an HTML
  comment marker around the auto-inserted line, e.g.
  `<!-- nowline:auto-rendered-start -->` / `<!-- nowline:auto-rendered-end -->`,
  and replace the entire fenced region on subsequent runs. Mermaid's
  similar action ecosystem uses this pattern.
- **Tag versioning matches `release.yml`.** The monorepo's tag
  (`v0.4.0`) is what triggers the mirror push. Inside the mirror
  repo, push both `v0.4.0` (immutable) and `v0` (moving major-tag
  pointer, force-pushed). Decide whether to push intermediate `v0.4`
  too (mutable minor, for users who want patch fixes auto-rolled in)
  — Mermaid's actions don't, but it's a small additional push.

## Suggested plan

Sequenced so each step unblocks the next.

### Prerequisites (do once)

0a. **Create the `lolay/nowline-action` mirror repo** — empty, public,
    Apache-2.0 license. README points at the monorepo for source.
0b. **Add `MARKETPLACE_MIRROR_PAT` repo secret** on `lolay/nowline` —
    fine-grained PAT with `contents: write` on `lolay/nowline-action`.

### In this monorepo

1. **Scaffold `packages/nowline-action/`** — `package.json`, `tsconfig.json`,
   `action.yml`, `src/index.ts` skeleton with mode dispatch, no real
   logic yet. Workspace dep on `@nowline/cli` (so dev-loop tests run
   against monorepo CLI).
2. **Implement file mode** — read inputs, exec the CLI, optionally
   commit. Add unit tests for the input-parsing layer and integration
   tests for end-to-end exec + commit.
3. **Implement markdown mode** — markdown scanner, fenced-block
   finder, insertion-site computer with idempotency markers, render
   loop, commit. Heavier test coverage here because the markdown
   surface is what most users will actually use.
4. **Add the bundler step** — `scripts/bundle.mjs` (mirror the embed's
   pattern) producing `dist/index.js`. Fail the build if any
   `workspace:*` symlink shows up in the bundle (safety check —
   action consumers download the dist; workspace symlinks don't
   resolve on a runner).
5. **Add the `mirror-action` cell to `release.yml`** — clone the
   mirror repo, copy `action.yml` + `dist/` + `README.md` + `LICENSE`,
   commit, tag both immutable point version and moving major tag,
   push.

### Marketplace submission

6. **First release smoke** — cut a `v0.x.0` from this monorepo, watch
   the mirror cell run, manually verify the mirror repo has the new
   tag and the `dist/` looks right.
7. **Submit Marketplace listing** — visit the mirror repo's release
   page, check "Publish this release to the GitHub Marketplace",
   pick the icon and color from `branding:`, fill the description.

## Gotchas

- **Marketplace requires `action.yml` at repo root.** The mirror repo
  satisfies this; the source's `packages/nowline-action/action.yml`
  is what gets copied. Make sure the mirror cell preserves the file
  at root, not under `packages/nowline-action/`.
- **Action consumers download `dist/` from a tag.** The bundle has to
  be self-contained. If you `import` something from a workspace
  package that doesn't get bundled, the runner will throw `Cannot find
  module` because there's no `node_modules` directory on the runner.
  CI must run the bundled action against a synthetic runner-like env
  to catch this.
- **`@actions/core` and `@actions/exec` are external on the runner.**
  Actually they're not — they're regular npm packages. They need to be
  bundled into `dist/` too. Don't mark them external in esbuild's
  config.
- **`npm install -g @nowline/cli@<version>` needs npm cache.** First
  invocation per runner pulls the tarball; subsequent runs in the same
  workflow reuse it. Document this so users don't get surprised by
  cold-start latency.
- **Markdown mode must handle nested fences.** ` ```nowline ` blocks
  inside a four-backtick fence shouldn't be rendered (they're code
  examples *of* Nowline, not Nowline diagrams to render). Use a
  proper markdown parser (`remark` / `markdown-it`) rather than a
  regex; multi-fence-level support has been a source of subtle bugs
  in similar actions.
- **Same-repo commits trigger CI.** When the action commits the
  rendered output, the resulting `push` event will trigger CI again.
  Document that users should add `paths-ignore` to their other
  workflows or use `[skip ci]` in the auto-commit message. Defaulting
  the commit message to something like `render nowline diagrams [skip ci]`
  is a reasonable default.
- **`v0` major tag during 0.x.** During 0.x, the breaking-change
  boundary is the *minor* (semver pre-1.0). So the moving major-tag
  pointer for users on 0.x should be `v0`, but it's effectively
  ambiguous — `v0.4` vs `v0.5` could break compat. Either document
  this clearly or skip the moving-major tag during pre-1.0 and only
  publish immutable point versions until 1.0.

## Files to reference

- [`specs/embed.md`](../embed.md) § GitHub Action — product surface
  (action inputs, two modes, expected behaviour).
- [`specs/architecture.md`](../architecture.md) § Organization and
  Repositories — the monorepo + Marketplace mirror posture and the
  Mermaid-pattern rationale.
- [`specs/handoffs/handoff-m4-embed.md`](./handoff-m4-embed.md) §
  "Decisions that diverged" — the structural decisions made during m4
  that now apply to m3.5.
- [`packages/embed/scripts/bundle.mjs`](../../packages/embed/scripts/bundle.mjs)
  — esbuild pattern that the action's bundler can mirror (single
  entry, output to `dist/`, sourcemap, no externals).
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
  — existing Homebrew tap mirror cell is the closest pattern for the
  action's Marketplace mirror cell. Same `git push` to a sibling repo
  on every tag.
- [`actions/checkout`](https://github.com/actions/checkout) and
  [`actions/cache`](https://github.com/actions/cache) — reference
  implementations for action structure (`action.yml`, bundled
  `dist/`, branding block).

## Out of scope for m3.5

- **PR comment integration** (e.g. preview-rendered roadmap as a PR
  comment). Possible follow-up but adds GitHub-API surface; defer.
- **Drift detection** (fail CI if the committed image is out of date
  vs. its source `.nowline`). A natural follow-up but separable from
  the render-and-commit core.
- **Multi-repo / cross-repo modes.** The action runs in one repo at
  a time. Cross-repo automation is the user's responsibility.
- **Custom theme palettes beyond `light` / `dark`.** Whatever the CLI
  supports, the action exposes; nothing more.
