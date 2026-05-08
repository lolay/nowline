# Homebrew tap

**Status:** active. Companion to [`specs/cli-distribution.md`](./cli-distribution.md) (the binary itself) and [`specs/releasing.md`](./releasing.md) (the release pipeline that updates the formula).

## Decision

Ship `nowline` to macOS and Linux Homebrew users via a single shared `lolay/tap`, hosted at the GitHub repo `lolay/homebrew-tap`. Users install with:

```bash
brew install lolay/tap/nowline
```

The repo holds **one tap for all of `lolay`'s Homebrew-distributed CLIs**, not a per-product tap. A new `lolay/foo` CLI in the future would land as `Formula/foo.rb` in the same repo and ship via `brew install lolay/tap/foo`.

The formula is **auto-rewritten on every `v*` tag** by the `update-homebrew-tap` job in [`.github/workflows/release.yml`](../.github/workflows/release.yml). Maintainers do not hand-edit `Formula/nowline.rb` between releases.

## Naming convention

Homebrew enforces a hard rule: the GitHub repo backing a tap must be named `homebrew-<suffix>`, and users reference it as `<owner>/<suffix>` (the `homebrew-` prefix is implicit and stripped). So:

- Repo `lolay/homebrew-tap` → tap name `lolay/tap` → install `brew install lolay/tap/nowline`.
- A bare `lolay/homebrew` repo is **not** a valid tap shorthand; brew always looks up `homebrew-<suffix>`.

`homebrew-tap` is the most common naming convention for org-wide multi-tool taps:

- [`hashicorp/homebrew-tap`](https://github.com/hashicorp/homebrew-tap) — terraform, vault, consul, packer, nomad, boundary, waypoint, ~10 tools
- `aws/homebrew-tap` — sam-cli and friends
- `goreleaser/homebrew-tap`, `digitalocean/homebrew-tap`, `1password/homebrew-tap`, `helm/homebrew-tap`

A few orgs use `homebrew-brew` for wordplay (`heroku/brew`, `mongodb/brew`); single-product orgs sometimes go product-specific (`stripe/homebrew-stripe-cli`). The multi-tool `homebrew-tap` shape fits `lolay` because we expect to add more CLIs over time and want one consistent install path.

## Tap repo layout

```
lolay/homebrew-tap
├── Formula/
│   └── nowline.rb         (auto-rewritten on each release)
└── README.md              (tap landing page)
```

Single `main` branch. No `release/*` branches. No CI on the tap repo today (deferred — see "Future work" below).

The seed contents (initial `Formula/nowline.rb` + tap README) live in [`scripts/homebrew-tap/`](../scripts/homebrew-tap/) inside this repo. They are pushed to the tap repo once during bootstrap; after that, the tap repo lives independently and the release workflow keeps the formula current.

## Formula structure

The formula uses Homebrew's modern `on_macos` / `on_linux` blocks (post-2022 API) and `Hardware::CPU.arm?` to pick the right binary per platform. It downloads the **raw compiled binary** from a GitHub Release asset (not a tarball) and installs it as `bin/nowline`.

```ruby
class Nowline < Formula
  desc "Parse, validate, and convert .nowline roadmap files"
  homepage "https://github.com/lolay/nowline"
  version "X.Y.Z"
  license "Apache-2.0"

  livecheck do
    url :stable
    strategy :github_latest
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/lolay/nowline/releases/download/vX.Y.Z/nowline-macos-arm64"
      sha256 "..."
    else
      url "https://github.com/lolay/nowline/releases/download/vX.Y.Z/nowline-macos-x64"
      sha256 "..."
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/lolay/nowline/releases/download/vX.Y.Z/nowline-linux-arm64"
      sha256 "..."
    else
      url "https://github.com/lolay/nowline/releases/download/vX.Y.Z/nowline-linux-x64"
      sha256 "..."
    end
  end

  def install
    bin.install Dir["nowline-*"].first => "nowline"
  end

  test do
    system "#{bin}/nowline", "--version"
  end
end
```

Key details:

- **`Dir["nowline-*"].first => "nowline"`** — when Homebrew downloads a non-archive URL, it stages the file under its filename (e.g. `nowline-macos-arm64`). The glob picks whichever platform binary was downloaded and installs it under the canonical name `nowline`.
- **`livecheck` block** — tells `brew livecheck` and autobump tooling to query GitHub's "latest release" API for upstream version detection. Without it, brew falls back to scraping `homepage` heuristically. Costs four lines and silences `brew audit --strict`.
- **`test do`** — must invoke the CLI with the `--version` flag (not the `version` subcommand; nowline's CLI only accepts the flag form, see [`packages/cli/src/cli/args.ts`](../packages/cli/src/cli/args.ts)).
- **No `sha256` for an archive** — every per-platform `url` has its own `sha256` because they're separate downloads.

Windows binaries (`nowline-windows-x64.exe`, `nowline-windows-arm64.exe`) are produced by the release workflow and attached to the GitHub Release, but **Homebrew on Windows is not supported by Homebrew itself** — Windows users install via `npm install -g @nowline/cli`, the `.deb` (under WSL), or by downloading the `.exe` directly.

## Release pipeline integration

The `update-homebrew-tap` job in [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs after the GitHub Release is published. It:

1. Checks out `lolay/homebrew-tap` using `HOMEBREW_TAP_TOKEN` (a fine-grained PAT with `contents: write` on the tap repo, stored as a repo secret in this repo).
2. Downloads the four Homebrew-relevant binary artifacts from the same release: `nowline-macos-arm64`, `nowline-macos-x64`, `nowline-linux-x64`, `nowline-linux-arm64`.
3. Computes a SHA256 for each.
4. Rewrites `Formula/nowline.rb` from a heredoc with the new version + four SHAs.
5. Commits as `nowline-release-bot <release-bot@nowline.io>` and `git push`es directly to `main` on the tap.

No PR opened against the tap. Auto-generated formulas in custom taps are routinely pushed direct; the GoReleaser default behaves the same way. Homebrew's official `homebrew-core` tap requires PRs, but third-party taps don't.

## Bootstrap (one-time, before first release)

These tap-specific prerequisites for the first `v0.1.0` tag are **not** automated by `release.yml`. The end-to-end maintainer checklist (tap + Marketplace + Open VSX + all five repo secrets) lives in [`specs/release-bootstrap.md`](./release-bootstrap.md); this section just calls out the constraints that are intrinsic to the tap design.

1. **Tap repo seeded.** `lolay/homebrew-tap` must exist with at least one commit on `main`. The `update-homebrew-tap` job calls `actions/checkout@v4` against the tap, and checkout fails on a repo with no `HEAD`. Pushing the seed (`Formula/nowline.rb` placeholder + a tap README) creates the default branch and unblocks the workflow. Source files: [`scripts/homebrew-tap/`](../scripts/homebrew-tap/).
2. **`HOMEBREW_TAP_TOKEN` secret set.** Fine-grained PAT (or deploy key) with `contents: write` on `lolay/homebrew-tap`, stored in this repo's Actions secrets.
3. **Seed Formula passes `brew test`.** The placeholder seed must be syntactically valid and its `test do` block must call a real CLI invocation, so any pre-release `brew test lolay/tap/nowline` doesn't fail on the placeholder. The release workflow overwrites the formula on every tag, so this only matters for the window between bootstrap and first tag.
4. **`livecheck` block included from day one.** Adding it to both the seed and the workflow heredoc together avoids drift.

## Install path for users

```bash
brew install lolay/tap/nowline
```

No `brew tap lolay/tap` required as a separate step — specifying the full `tap/formula` spec auto-taps. Subsequent `brew upgrade nowline` keeps the formula in sync because `update-homebrew-tap` pushes a new version on every tag.

`brew install` strips the macOS quarantine xattr that GitHub Release downloads carry, so Gatekeeper does not prompt on first run. Users who download the binary **directly** from the GitHub Release page (bypassing Homebrew) will see Gatekeeper friction on macOS — already documented in [`packages/cli/README.md`](../packages/cli/README.md). The brew-installed binary is unsigned and unnotarized, but unaffected by Gatekeeper because Homebrew handles the trust transfer.

## Future work

Not blocking the first release; revisit when the underlying conditions change.

- **Tarball each binary instead of shipping raw.** Switch the four GitHub Release assets from `nowline-<os>-<arch>` to `nowline-<os>-<arch>.tar.gz`, update `compile.mjs` to wrap before upload, and update the formula's `url` + `install` block. Tarballs let us bundle the binary with `LICENSE`, shell completions, and man pages in one download; they also unlock `brew bottle` if we ever want to. Optional now; recommended before a public launch with significant install volume.
- **Code-sign + notarize macOS binaries.** Apple Developer ID required ($99/year). Eliminates Gatekeeper friction for direct GitHub Release downloads. Homebrew installs already work without it.
- **Tap CI.** Add a workflow on `lolay/homebrew-tap` that runs `brew audit --strict --online` and `brew test --formula` on PRs to catch formula regressions before they reach users. Low priority while we push direct.
- **Open a PR to the tap instead of direct push.** Mirrors GoReleaser's `pull_request_review` flow. Adds a manual gate; trade-off is release latency. Not needed for `v0.x`.
- **Per-product tap split.** If one of `lolay`'s tools attracts a dramatically different audience (internal-only, different release cadence, license-restricted), it can move to its own `lolay/homebrew-<product>` tap. No reason to split today.
