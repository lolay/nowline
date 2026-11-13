# The `lolay-nowline-release` GitHub App

Automation that pushes to `main` on `lolay/nowline` does it as the `lolay-nowline-release` GitHub App (App ID `3789687`), one of the two bypass actors on the `main` ruleset. The ruleset itself, its bypass list and the repo's merge settings are Terraform in a private lolay org repo; this page covers the App and the workflows that use it.

- App settings: <https://github.com/settings/apps/lolay-nowline-release>
- Installations (on `lolay/nowline` and `lolay/nowline-action`): <https://github.com/settings/apps/lolay-nowline-release/installations>

## Who pushes as what

| Workflow | Pushes | Identity today |
|---|---|---|
| [`editor-release-monitor.yml`](../.github/workflows/editor-release-monitor.yml) | A daily `[skip ci]` history-update commit to `main` | The App, through `actions/create-github-app-token` |
| [`release.yml`](../.github/workflows/release.yml) | The version-bump commit to `main`, then the tag | `RELEASE_TAG_PAT`, a personal PAT (migration below is queued) |

`github-actions[bot]` (the `GITHUB_TOKEN` identity) is not a bypass actor on any ruleset, on purpose.

## Setup

The App id is not a secret, so workflows write it as a literal rather than reading a repository variable, which an empty value would break silently. The private key is the `RELEASE_APP_PRIVATE_KEY` repository secret. To rotate it, generate a key at the App settings page (Private keys, Generate a private key) and pipe the `.pem` into `gh` through stdin so the newlines survive:

```bash
gh secret set RELEASE_APP_PRIVATE_KEY -R lolay/nowline < lolay-nowline-release.<date>.private-key.pem
```

## Queued: move `release.yml` off the PAT

`release.yml` uses a PAT because tags pushed with `GITHUB_TOKEN` don't trigger downstream `push` or `workflow_run` events (GitHub's anti-recursion safeguard). An App installation token push does trigger them, so moving to the App drops the yearly PAT renewal and a personal identity from automation.

The change is one step at the top of the `cut-release` job:

```yaml
- name: Mint release-bot installation token
  id: app-token
  uses: actions/create-github-app-token@v3
  with:
      app-id: "3789687"
      private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
      permission-contents: write
```

Then replace `token: ${{ secrets.RELEASE_TAG_PAT }}` on every `actions/checkout` and `git push` step with `token: ${{ steps.app-token.outputs.token }}` (or `GH_TOKEN: ${{ steps.app-token.outputs.token }}` for steps that call `gh`). Keep `RELEASE_TAG_PAT` for one full release cycle as a fallback, and delete it after one verified release.

To verify: the bump commit lands on `main`, the tag push starts the publish phase, and the pusher in the events is `lolay-nowline-release[bot]`. The committer doesn't change, since `cut-release` sets `GIT_COMMITTER_NAME: nowline-release-bot` workflow-wide.

## Choosing a token

The rule behind the App, for any workflow choosing between `GITHUB_TOKEN`, an App installation token and a PAT.

| Token | Identity in events | Triggers downstream `push` / `workflow_run`? | Renewal | Notes |
|---|---|---|---|---|
| `GITHUB_TOKEN` | `github-actions[bot]` | No (anti-recursion safeguard) | Issued per job | Free and scoped, but useless for tag pushes that need to chain |
| App installation token | `<app-slug>[bot]` | Yes | Minted each run, 1h TTL | The default for automation that pushes |
| App user-to-server token | The authorizing user | Yes | Refresh chain every run | Avoid unless automation needs a user identity (Copilot assignment is the only known case here); the refresh chain is fragile |
| User PAT (fine-grained) | The issuing user | Yes | Manual, 1-year max | Fine for small jobs and anything that needs a user identity |
| User PAT (classic) | The issuing user | Yes | Manual, can't expire | Broader scope; only when fine-grained PATs are disabled for the org |

1. **Needs a user identity** (Copilot assignment, anything billed to a seat): a fine-grained PAT from a seated user.
2. **Needs an automation identity on GitHub** (tag pushes that must chain, commits as `<app>[bot]`, contents write without a personal PAT): an App installation token. This is what `release.yml`'s tag push and `editor-release-monitor.yml`'s daily commit want.
3. **Authenticates to another service** (npm, VS Marketplace, Open VSX, Homebrew tap, Firebase Hosting): that service's token. GitHub Apps don't authenticate to non-GitHub APIs.
4. **Only touches its own run** (reads its checkout, posts a check): `GITHUB_TOKEN`.

So the rest of `release.yml`'s tokens stay as they are:

| Secret | Authenticates to |
|---|---|
| `NPM_TOKEN` | npm registry |
| `VSCE_PAT` | Visual Studio Marketplace |
| `OVSX_PAT` | Open VSX Registry |
| `HOMEBREW_TAP_TOKEN` | `lolay/homebrew-tap` (could in theory be an App, but it's a separate repo and concern) |
| `MARKETPLACE_MIRROR_PAT` | `lolay/nowline-action`, the Marketplace mirror |
