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
shells out to `@nowline/cli` on a runner and writes / refreshes the
rendered SVG / PNG. Pairing it with a downstream commit action (see
"Key decisions" → "Commit semantics") lands the result in the repo so
the markdown reference becomes a static image asset that any markdown
surface renders verbatim.

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

- `packages/nowline-action/` package source complete:
  - `package.json` (private; runtime deps `@actions/core`,
    `@actions/exec`, `fast-glob`, `unified` + remark family;
    workspace dev dep on `@nowline/cli`).
  - `tsconfig.json` (extends root, server-side `lib: ["ES2022"]`).
  - `action.yml` with the input matrix `mode`, `input`, `output`,
    `files`, `output-dir`, `format`, `theme`, `cli-version`; three
    outputs (`rendered`, `failed`, `changed-files`); `using: node24`;
    `branding: { icon: map, color: blue }`. **No `commit` or
    `commit-message`** — render-only contract, see "Key decisions"
    below.
  - `src/index.ts` mode-dispatch entry; `src/inputs.ts` typed input
    parsing; `src/version.ts` reads action version from
    `package.json` for lock-step CLI install.
  - `src/cli.ts` — `ensureCli()` skips reinstall when the requested
    CLI version is already on PATH; `renderOnce()` shells out via
    `@actions/exec`.
  - `src/file-mode.ts` — orchestrates a single render; emits the
    output path via `changed-files`.
  - `src/markdown-mode.ts` + pure helpers (`markdown-scan.ts`,
    `markdown-edit.ts`) — fast-glob → remark-parse → SHA-256 slug →
    CLI render → idempotent HTML-comment-fenced marker insert/refresh.
    Scanner and editor are pure functions (no I/O), unit-testable
    independently of `@actions/exec`.
  - `scripts/bundle.mjs` — esbuild bundle to `dist/index.cjs`
    (CJS, node24, sourcemap, legal comments). Builds the safety
    check that no non-builtin imports escape into the bundle (would
    throw `Cannot find module` on a runner with no `node_modules/`).
  - `README.md` — quickstart, full input/output table, three
    composition examples (auto-commit, PR mode, drift detection),
    "source lives in monorepo" callout.
  - `test/` — 29-case vitest suite: pure scanner / editor unit tests
    (`markdown-scan.test.ts`, `markdown-edit.test.ts`), input-parser
    edge cases (`inputs.test.ts`), and a markdown-mode orchestration
    test (`markdown-mode.test.ts`) that runs against a temp directory
    with `./cli.js` mocked via `vi.mock`. Covers slug stability,
    marker-pair detection, idempotent re-runs, multi-block ordering,
    URL-escaping of image paths, and the empty-glob / no-blocks
    branches.
- `lolay/nowline-action` mirror repo created and the local clone at
  `../nowline-action/` populated with placeholder `README.md` +
  Apache-2.0 `LICENSE`. The repo will be self-populating from the
  `release.yml` mirror cell once it lands (T6).
- Validations green: `pnpm --filter @nowline/action run typecheck`,
  `pnpm --filter @nowline/action run test` (29/29), `biome check`,
  and `pnpm --filter @nowline/action run build` (1.2 MB bundled CJS).

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
  — esbuild reference the action's bundler mirrored.

**Not yet present:**

- No `mirror-action` cell in `release.yml` (T6).
- No `MARKETPLACE_MIRROR_PAT` repo secret on `lolay/nowline` yet —
  needed before T6 can run successfully (fine-grained PAT with
  `contents: write` on `lolay/nowline-action`).
- No first release; the mirror clone in `../nowline-action/` will
  remain empty (just placeholder README + LICENSE) until the first
  tag fires the mirror cell.

## What this milestone needs to deliver

Per [`specs/embed.md`](../embed.md) § GitHub Action:

1. **`packages/nowline-action/` source** — TypeScript entry that
   implements two modes:
   - **File mode** — read `input` and `output` action inputs, run
     `nowline <input> -o <output> -f <format>`, emit the output
     path on the `changed-files` output for downstream commit
     actions.
   - **Markdown mode** — glob `files`, parse each markdown for
     ` ```nowline ` fenced blocks, render each block to a configurable
     output directory, insert / refresh an HTML-comment-fenced
     image reference adjacent to the block, emit the list of
     written paths on `changed-files`.
2. **`action.yml`** at the package root, declaring the input matrix
   from the spec table (`mode`, `input`, `output`, `files`,
   `output-dir`, `format`, `theme`, `cli-version`).
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

   **Landed shape (deviation from above).** Pure-function unit tests
   for `markdown-scan` and `markdown-edit` shipped as planned. Input
   parsing got its own focused test file. The "boot the compiled
   entry against a fixture repo" integration test was replaced with
   an orchestration test that calls `runMarkdownMode` directly
   against a temp directory with `./cli.js` stubbed via `vi.mock`,
   which exercises the same wiring (glob → scan → render → edit →
   write back → output `changed-files`) and is hermetic and fast
   (~25ms total). The bundled-action smoke test — running
   `node dist/index.cjs` with `INPUT_*` env vars on a fixture — is
   the more honest version of the original goal and is deferred to
   land *after* T6 so it can run against the published mirror
   artifact rather than a one-off local bundle.

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
- **Commit semantics — resolved: render-only.** The action does not
  commit. It writes / refreshes output files and emits the list of
  changed paths via the `changed-files` output. Persistence is
  composed downstream by the user via
  [`stefanzweifel/git-auto-commit-action`](https://github.com/stefanzweifel/git-auto-commit-action),
  [`peter-evans/create-pull-request`](https://github.com/peter-evans/create-pull-request),
  or a bare `git diff --exit-code` step for drift detection. This
  shape was chosen deliberately during T4 — see
  [`specs/embed.md`](../embed.md) § "Render-only contract" for the
  rationale. It tightens the action's contract ("render Nowline
  files, period") and lets every team compose the exact commit
  semantics they want with the action they already trust, instead
  of feature-matching against a thin slice of `git-auto-commit-action`.
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
2. **Implement file mode** — read inputs, exec the CLI, emit
   `changed-files`. Add unit tests for the input-parsing layer and
   integration tests for end-to-end exec.
3. **Implement markdown mode** — markdown scanner, fenced-block
   finder, insertion-site computer with idempotency markers, render
   loop. Emit `changed-files` covering written images + edited
   markdown. Heavier test coverage here because the markdown
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
- **Same-repo auto-commit loops are the user's problem now.** The
  action no longer commits, so the classic "render-action commits,
  push triggers CI, CI runs render-action again" loop can only happen
  if the user's chained commit action does the loop. README points
  users at `[skip ci]` in their commit-message input as the standard
  defence; `stefanzweifel/git-auto-commit-action` already supports
  this directly.
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
- **Auto-commit / push / PR creation.** Render-only contract;
  composed downstream by the user. See "Key decisions" → "Commit
  semantics".
- **Multi-repo / cross-repo modes.** The action runs in one repo at
  a time. Cross-repo automation is the user's responsibility.
- **Custom theme palettes beyond `light` / `dark`.** Whatever the CLI
  supports, the action exposes; nothing more.

Drift detection ("fail CI when the committed image is out of date
vs. its source `.nowline`") used to be listed here. It's now a
documented usage pattern via `git diff --exit-code` after the action
runs — no special action behaviour needed. See the README's
"Drift detection" example.
