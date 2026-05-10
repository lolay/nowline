# Release bootstrap

**Status:** active. One-time maintainer checklist for the prerequisites that have to be done **outside** this repo before [`.github/workflows/release.yml`](../.github/workflows/release.yml) can run end-to-end. After the first successful `v0.1.0` release this document becomes historical — the steady-state cut-a-release process lives in [`specs/releasing.md`](./releasing.md).

Work top-to-bottom: each section depends only on the ones above it.

## 1. Prerequisites already done in the repo

These are already shipped on `main` — no action needed, included so you know what to skip.

- [x] `nowline-release-bot <release-bot@nowline.io>` git identity in the `cut-release` job and the `github-release` cell of the `publish` matrix in [`.github/workflows/release.yml`](../.github/workflows/release.yml).
- [x] `"private": false` on [`packages/vscode-extension/package.json`](../packages/vscode-extension/package.json) so `vsce package` will accept it.
- [x] `"publisher": "nowline"` on the same file — this is the namespace you'll register on both Marketplaces in step 2.
- [x] [`backport main`](https://github.com/lolay/nowline/labels) GitHub label.
- [x] Seed Homebrew formula at [`scripts/homebrew-tap/Formula/nowline.rb`](../scripts/homebrew-tap/Formula/nowline.rb) with the correct `--version` test stanza and `livecheck` block.
- [x] `scripts/bump-version.mjs` for the dispatch flow's lock-step bump.
- [x] CLI prints dev-build version metadata (`0.1.0+sha.dirty`) — see the dev-build table in [`specs/releasing.md`](./releasing.md#dev-build-version-string).

## 2. Create publisher / namespace identities

Each registry needs a one-time account/namespace before you can scope a PAT to it. Do these first — the PATs in step 3 won't work otherwise.

### 2a. Homebrew tap repo (`lolay/homebrew-tap`)

The `github-release` cell of the `publish` matrix runs `actions/checkout` against the tap repo on every release. Checkout fails on a repo with no `HEAD`, so the tap needs an initial commit on `main` before the first release.

```bash
gh repo create lolay/homebrew-tap --public \
  --description "Homebrew tap for lolay tools"

git clone git@github.com:lolay/homebrew-tap.git /tmp/homebrew-tap
cp -r scripts/homebrew-tap/Formula /tmp/homebrew-tap/
cp scripts/homebrew-tap/README.md /tmp/homebrew-tap/README.md

cd /tmp/homebrew-tap
git add .
git commit -m "seed: nowline formula placeholder"
git push origin main
```

Verify:

```bash
gh api repos/lolay/homebrew-tap/contents/Formula/nowline.rb --jq .name
# → nowline.rb
```

The placeholder has `version "0.0.0"` and all-zero SHA256s; the release workflow overwrites it on every tag, so the placeholder only matters until the first release.

### 2b. VS Code Marketplace publisher (`nowline`)

Required for the `vsce publish` step.

1. Sign in to <https://aka.ms/vscode-create-publisher> with the Microsoft account that should own the publisher.
2. Create publisher with **ID** `nowline` (must equal `"publisher"` in [`packages/vscode-extension/package.json`](../packages/vscode-extension/package.json) — Marketplace IDs cannot be renamed later).
3. Optional: verify ownership of `nowline.io` for a domain check-mark on the Marketplace listing.

### 2c. Open VSX namespace (`nowline`) — this is the path that reaches Cursor

Open VSX is the registry Cursor (and VSCodium, Theia, Gitpod, …) read from. Without this step the extension is invisible inside Cursor.

1. Sign in to <https://open-vsx.org> with GitHub.
2. Generate an access token (User Settings → Access Tokens) — **save the value, you'll add it as `OVSX_PAT` in step 3**.
3. Reserve the namespace once:

   ```bash
   npx --yes ovsx create-namespace nowline -p "$OVSX_PAT"
   ```

   The namespace ID must match `"publisher"` in `packages/vscode-extension/package.json`.

## 3. Generate PATs and add as repo secrets

Add each value under **Settings → Secrets and variables → Actions → New repository secret** on `lolay/nowline`. Names must match exactly — the workflow looks them up by name.

| Secret | Where to generate | Scope |
|---|---|---|
| `RELEASE_TAG_PAT` | GitHub → Settings → Developer settings → Personal access tokens → Fine-grained | `contents: write` on `lolay/nowline`. Required because `GITHUB_TOKEN`-pushed tags do **not** trigger downstream workflow runs, which would prevent the build/publish jobs from firing after `cut-release`. |
| `HOMEBREW_TAP_TOKEN` | Same place as above | `contents: write` on `lolay/homebrew-tap`. |
| `VSCE_PAT` | <https://dev.azure.com/> → User Settings → Personal access tokens | **Marketplace → Manage** scope, scoped to publisher `nowline` (created in 2b). Cannot be a "all accessible organizations" token; pick the one tied to the Marketplace publisher's tenant. |
| `OVSX_PAT` | Token from 2c | Already generated above. |
| `NPM_TOKEN` | <https://www.npmjs.com/> → Access Tokens | **Automation** token (not Publish) so 2FA-on-publish doesn't block CI. Must have publish rights on the `@nowline` scope. Probably already exists from earlier setup — verify. |

Verify all five are present:

```bash
gh secret list --repo lolay/nowline
```

## 4. Cut `v0.1.0`

Every package in `packages/*/package.json` is currently at `0.1.0`. The dispatch flow's `cut-release` job *bumps* the version before tagging, so triggering it with `level: patch` would produce `v0.1.1`, not `v0.1.0`.

For the very first release, push the tag manually so `0.1.0` ships as itself:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag push triggers `release.yml` under `event_name == 'push'`; the `build` matrix runs to completion, then the `publish` matrix fans out (npm + vscode + github-release/tap) without further input.

From `v0.1.1` onward, use the dispatch UI exclusively: **Actions → Release → Run workflow** with `level: patch | minor | major`.

## 5. Post-release verification matrix

Run after the workflow finishes. Each row is a single channel — if any one fails, see the rollback section in [`specs/releasing.md`](./releasing.md#rollback).

| Channel | Verification | Expected |
|---|---|---|
| GitHub Release | `gh release view v0.1.0 --json assets --jq '.assets[].name'` | 8 binaries (4 macOS/Linux + 2 Windows + 2 .deb), the `nowline.1` (CLI) and `nowline.5` (DSL) man pages, plus any `nowline.<locale>.1` and `nowline.<locale>.5` translations. |
| npm | `npm view @nowline/cli version` | `0.1.0` |
| VS Code Marketplace | <https://marketplace.visualstudio.com/items?itemName=nowline.vscode> | Listing shows `0.1.0`. |
| Open VSX (Cursor) | <https://open-vsx.org/extension/nowline/vscode> | Listing shows `0.1.0`. |
| Homebrew | `brew update && brew install lolay/tap/nowline && nowline --version` | `0.1.0` (no `+sha` suffix — the suffix only appears on dev builds; see [dev-build version string](./releasing.md#dev-build-version-string)). |
| Cursor IDE | Open Extensions panel, search `Nowline` | Extension appears with version `0.1.0`. |

## 6. Post-release doc follow-ups

These are intentionally deferred until a release exists, because they reference live install commands and supported version lines:

- [ ] Update [`README.md`](../README.md) "Quick Start" to drop "Until release artifacts ship…" and add `brew install lolay/tap/nowline`, `npm i -g @nowline/cli`, and the Marketplace install link. Add a one-line `0.x = API may change between minors` note.
- [ ] Update [`SECURITY.md`](../SECURITY.md) "Supported versions" — replace "pre-release; only `main` is supported" with "the latest `0.x.y` line is supported; older `0.x` lines are not".

These are also tracked as the `docs-readme-status` and `docs-security-supported` todos from the original release-versioning-strategy plan.
