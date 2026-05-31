# nowline (OSS) — branch policy runbook

This runbook describes how `main` branch protection is configured on the two OSS repos in the Lolay Nowline estate — `lolay/nowline` (Tier 1: OSS) and `lolay/nowline-action` (Tier 3: Follower) — and how to keep it that way.

The policy is implemented as code in [`../scripts/apply-branch-policies.sh`](../scripts/apply-branch-policies.sh) — re-runnable, idempotent, and the source of truth for what's actually deployed. The script is the spec; this runbook is the *why* and the operator-facing wrapper around it.

The four commercial repos are managed by a sibling script + runbook that live in their respective source-of-truth repos so the OSS/Commercial firewall stays clean — no commercial repo names appear in this script, and no OSS repo names appear in the commercial script.

> Conventions: shell snippets are zsh / bash compatible. Wherever a step touches GitHub state, you need `gh` authenticated as an org admin on `lolay`.

## 0. Prerequisites

- `gh` CLI authenticated against an account with admin scope on `lolay` (an org owner).
- Python 3 on PATH (the script uses it for one JSON parse).
- The `lolay-nowline-release` GitHub App (App ID `3789687`) installed on both `lolay/nowline` and `lolay/nowline-action`. Install management: <https://github.com/settings/apps/lolay-nowline-release/installations>. The script auto-detects per-repo installation status; missing installs degrade gracefully (you get OrgAdmin-only bypass on that repo).

## 1. Why this policy exists

Three independent forces shape the rules:

1. **Solo-maintainer friction.** Gary needs to push directly to `main` on every repo without forcing a PR through himself. This is the OrgAdmin bypass with `bypass_mode: always`.
2. **Automated release flows.** `lolay/nowline:.github/workflows/release.yml` does `git push origin HEAD` to commit a version bump back to `main` before tagging, and `editor-release-monitor.yml` pushes a daily `[skip ci]` history-update commit. Both run as bots; without an App bypass they'd fail the protection rules. (Today `release.yml` uses a personal PAT and `editor-release-monitor.yml` uses `github-actions[bot]` — both queued for migration to the App; see § 6.)
3. **Defence-in-depth approval.** `required_approving_review_count: 1` ensures no token can merge a PR without a human approval — CI passes *and* a human clicks Approve. The Copilot agent-merge workflow (`agent-merge.yml`) is **retired**; there is no `gh pr merge --auto` in any automation. The Copilot agent flow now emits `maintainer-pr-safe` / `maintainer-pr-review` confidence labels; a maintainer reviews and clicks Approve + Merge in the UI (the maintainer can approve because Copilot, not the maintainer, authored the PR). The OrgAdmin `always` bypass lets the solo maintainer still push directly to `main` and merge their own PRs unblocked. Bypass actors must use `bypass_mode: always` (which still respects `required_status_checks`), never `bypass_mode: pull_request` (which would short-circuit the CI gate); `github-actions[bot]` remains intentionally **not** a bypass actor on any ruleset.

The result is a "1 approval + CI are the gates, two trusted bypass actors" model for the Tier-1 OSS repo. Tier-3 Follower is publish-only with no PR CI; its approval count is kept at 0 pending confirmation (see § 2 note and § 5).

## 2. The policy

| Tier | Repo | Ruleset name | Required approvals | Required CI contexts | Bypass actors |
|---|---|---|---|---|---|
| OSS | `lolay/nowline` | `main: CI must pass` | 1 | 9 contexts (lint + matrix build/test + bundle size + bun smoke), `strict: true` | OrgAdmin (Gary) `always` + `lolay-nowline-release` App `always` |
| Follower | `lolay/nowline-action` | `main: protected (follower)` | 0 *(flag: see note below)* | none (publish-only) | OrgAdmin (Gary) `always` + `lolay-nowline-release` App `always` |

Every ruleset additionally enforces:

- `deletion` blocked
- `non_fast_forward` blocked
- `pull_request` rule with `required_approving_review_count: 1` (Tier-1 OSS) or `0` (Tier-3 Follower — see note below), `allowed_merge_methods: [squash, merge, rebase]`

Every repo additionally has these settings (also patched by the script):

- `allow_auto_merge: true`
- `allow_squash_merge: true`
- `delete_branch_on_merge: true`

> **Follower approval-count flag (for parent review).** `lolay/nowline-action` is publish-only with no PR CI.  Bumping it to `required_approving_review_count: 1` adds defence-in-depth but could impede a future automated publish flow.  The script currently leaves it at `0`.  A maintainer should confirm: raise to `1` (consistent posture), or keep at `0` (friction-free publish path) and explicitly accept the risk.  Edit the follower body in `scripts/apply-branch-policies.sh` and re-run once decided.

## 3. Run it

From a clone of `lolay/nowline` with `gh` authenticated:

```bash
./scripts/apply-branch-policies.sh
```

Per repo it will:

1. Probe whether the `lolay-nowline-release` App is installed (creates and immediately deletes a disabled probe ruleset; logs `release App: installed — adding to bypass` or `release App: not installed — OrgAdmin-only bypass`).
2. PUT (update) the named ruleset if one already exists, or POST (create) it if not.
3. PATCH the repo to enable auto-merge / squash-merge / delete-branch-on-merge.

The script is idempotent and converges to the desired state — safe to re-run any time. Total runtime is ~5s for the two OSS repos.

## 4. Verify

```bash
# Each repo has exactly one ruleset.
for repo in nowline nowline-action; do
  gh api "repos/lolay/$repo/rulesets" --jq 'length'
done
# expect: 1 1

# Bypass actors per repo.
for repo in nowline nowline-action; do
  rid=$(gh api "repos/lolay/$repo/rulesets" --jq '.[0].id')
  bypass=$(gh api "repos/lolay/$repo/rulesets/$rid" --jq '[.bypass_actors[] | (.actor_type + (if .actor_id == 1 then "" elif .actor_id then "(" + (.actor_id|tostring) + ")" else "" end))] | join(", ")')
  printf "  %-15s %s\n" "$repo:" "$bypass"
done
# expect: every repo shows "OrganizationAdmin, Integration(3789687)"

# Repo settings.
for repo in nowline nowline-action; do
  gh api repos/lolay/$repo --jq '{r: "'$repo'", auto_merge: .allow_auto_merge, squash: .allow_squash_merge, delete_branch: .delete_branch_on_merge}'
done
# expect: auto_merge=true, squash=true, delete_branch=true on both
```

A direct push to `main` from a clone of either repo — done as Gary — should print a remote-side note like:

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
```

That is the OrgAdmin bypass working as designed; the push still succeeds. If the push *fails* with that message instead, your `gh` auth context is wrong (you're not authenticating as Gary).

## 5. When to re-run

- **App install changes.** Anyone toggles the `lolay-nowline-release` App's installation on `lolay/nowline` or `lolay/nowline-action` (install or uninstall via <https://github.com/settings/apps/lolay-nowline-release/installations>). Re-run to add or drop the App from that repo's bypass list.
- **A required status-check name changes.** The OSS ruleset hardcodes 9 context names from `lolay/nowline:.github/workflows/ci.yml`. If a job is renamed, update the script and re-run before the next PR — required-but-missing checks block merges indefinitely.
- **`lolay/nowline:ci.yml` adds or removes a required job.** Add or remove the corresponding `{ "context": "..." }` entry in the script's OSS body and re-run.
- **The approval or bypass policy changes.** If the required-approvals count changes (e.g. raising the Follower to `1`), or if the bypass-actor list needs updating, this runbook + script are the single change point for the OSS half.

## 6. Known gaps — `lolay/nowline` PAT→App migration (queued)

Two workflows on `lolay/nowline` still push to `main` using identities other than the release App, so they don't yet benefit from the App bypass that's already in place on the ruleset.

- **`release.yml`** uses `RELEASE_TAG_PAT` (a personal PAT issued from Gary's account). The PAT exists because `GITHUB_TOKEN`-pushed tags don't trigger downstream `push` / `workflow_run` events (GitHub anti-recursion safeguard); a user PAT push *does*. An App installation token push also triggers downstream events, so migrating to the `lolay-nowline-release` App removes the annual PAT renewal task and replaces a personal-identity token with a clean automation identity.

  The shape of the change in `release.yml` is one `actions/create-github-app-token@v3` step at the top of the `cut-release` job:

  ```yaml
  - name: Mint release-bot installation token
    id: app-token
    uses: actions/create-github-app-token@v3
    with:
        app-id: ${{ vars.RELEASE_APP_ID }}
        private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
        permission-contents: write
  ```

  ...followed by replacing `token: ${{ secrets.RELEASE_TAG_PAT }}` on every `actions/checkout` step and `git push` step with `token: ${{ steps.app-token.outputs.token }}` (or `GH_TOKEN: ${{ steps.app-token.outputs.token }}` for `gh`-using steps). Keep `RELEASE_TAG_PAT` available as a fallback for one full release cycle; delete it from secrets after one verified release.

- **`editor-release-monitor.yml`** runs daily at 06:00 UTC and pushes a `[skip ci]` commit to `main` as `github-actions[bot]`. `github-actions[bot]` was a bypass actor on the original `nowline` ruleset; it was removed in an earlier policy tightening to keep the bypass list minimal (see § 1 historical background). Migration plan: same pattern — mint a `lolay-nowline-release` App installation token and push as the App. Same one-step change, same fallback discipline (this workflow doesn't have a fallback secret today; can simply re-add `github-actions[bot]` as a bypass-actor temporarily by editing the script + re-running if the App route fails on first cron).

### Required pre-work before either migration

Add to `lolay/nowline`:

| Kind | Name | Value |
|---|---|---|
| variable | `RELEASE_APP_ID` | `3789687` |
| secret | `RELEASE_APP_PRIVATE_KEY` | Generate fresh at <https://github.com/settings/apps/lolay-nowline-release> → Private keys → Generate a private key. Pipe the `.pem` via stdin into `gh secret set` to preserve newlines: `gh secret set RELEASE_APP_PRIVATE_KEY -R lolay/nowline < lolay-nowline-release.<date>.private-key.pem` |

The App is already installed on `lolay/nowline` and the bypass is already on the ruleset, so neither this script nor the runbook needs an update — only the workflow files change.

### Verification after either migration

The bump commit / cron commit lands on `main`, downstream workflows fire (for the release case, the tag push triggers the publish phase), and the pusher identity in events shows as `lolay-nowline-release[bot]` instead of `GaryRudolph` / `github-actions[bot]`. Workflow `cut-release` also commits the version bump with `GIT_COMMITTER_NAME: nowline-release-bot` set workflow-wide — the visible identity change is only on the *pusher*, not the committer.

## 7. How to extend

### Add a status check to the OSS repo

1. Confirm the workflow's job actually runs on every PR to `main`, including PRs that touch only docs / `.md` files. A path-filtered check that's "Expected" but skipped will block all merges.
2. Find the exact `name` field as it appears in `statusCheckRollup`:
   ```bash
   gh api "repos/lolay/nowline/pulls/<pr>/statusCheckRollup" --jq '.[].name' | sort -u
   ```
3. Edit [`../scripts/apply-branch-policies.sh`](../scripts/apply-branch-policies.sh) — add `{ "context": "<name>" }` into the OSS body's `required_status_checks` array.
4. Re-run the script.

### Change the bypass actor list

Edit `bypass_actors_json()` in [`../scripts/apply-branch-policies.sh`](../scripts/apply-branch-policies.sh). Both bodies call it. Re-run.

If the bypass list should also change on the commercial side, edit the sibling helper in the commercial repo's `scripts/apply-branch-policies.sh` to match. The two scripts intentionally duplicate the helper to preserve the OSS/Commercial firewall — keep both copies in lockstep when the bypass shape changes.

## Appendix — App-vs-PAT decision framework

This is the durable decision rule that drove tonight's work and the queued PAT→App migration in § 6. Useful whenever a future Lolay workflow has to choose between `GITHUB_TOKEN`, an App installation token, and a personal PAT.

### Token taxonomy and identity attribution

| Token | Identity in events | Triggers downstream `push` / `workflow_run`? | Renewal | Notes |
|---|---|---|---|---|
| `GITHUB_TOKEN` | `github-actions[bot]` | **No** (anti-recursion safeguard) | Auto-issued per job | Free, scoped, but useless for tag pushes that need to chain |
| App installation token | `<app-slug>[bot]` | **Yes** | Auto-minted each run, 1h TTL | The good pattern. Simple mint-and-use, no rotation, no fragility |
| App user-to-server token | The authorizing user | Yes | Refresh-chain every run | **Avoid** unless you specifically need a *user* identity attached to automation (Copilot assignment is the only known case in this org). Fragile — half-day debug if the refresh chain breaks |
| User PAT (fine-grained) | The issuing user | Yes | Manual, 1-year max | Works fine for small jobs and for anything needing a user identity. One secret, no rotation |
| User PAT (classic) | The issuing user | Yes | Manual, no expiration possible | Broader scope than fine-grained. Use only when fine-grained PATs are disabled at the org level |

### Decision rules

1. **Need a user identity** (Copilot assignment, anything billing-attributed to a specific seat): **fine-grained PAT issued by a seated user.** Don't reach for the App user-to-server pattern unless you have a specific reason to want automation-as-the-actor with a user backstop.
2. **Need automation identity attribution, GitHub-side only** (tag pushes that must trigger downstream events, commits authored as `<app>[bot]`, write access to repo contents without burning a personal PAT): **App installation token.** This is what `release.yml`'s tag push and `editor-release-monitor.yml`'s daily cron want.
3. **External-service tokens** (npm, VS Marketplace, Open VSX, Homebrew tap, Firebase Hosting, etc.): **PAT or service-specific token.** GitHub Apps don't authenticate to non-GitHub APIs. Don't try to consolidate these onto an App.
4. **Workflow-internal-only operations** (the workflow needs to read its own checkout, post a check, etc.): **`GITHUB_TOKEN`.** Free, scoped, and the anti-recursion safeguard isn't a problem if you're not pushing tags or commits.

### Out of scope for this App

`release.yml` has six other tokens, all PATs, all authenticating to non-GitHub services. **Do not** try to migrate any of them to an App — the services don't speak GitHub App auth:

| Secret | Authenticates to |
|---|---|
| `NPM_TOKEN` | npm registry |
| `VSCE_PAT` | Visual Studio Marketplace |
| `OVSX_PAT` | Open VSX Registry |
| `HOMEBREW_TAP_TOKEN` | `lolay/homebrew-tap` repo (could in theory be an App, but it's a separate repo and a different concern) |
| `MARKETPLACE_MIRROR_PAT` | `lolay/nowline-action` Marketplace mirror (used twice in the workflow) |

## 8. Related

- [`../scripts/apply-branch-policies.sh`](../scripts/apply-branch-policies.sh) — the script this runbook drives.
- App settings: <https://github.com/settings/apps/lolay-nowline-release> (App ID `3789687`).
- App installation management: <https://github.com/settings/apps/lolay-nowline-release/installations>.
- Sibling commercial runbook: lives in the commercial infrastructure repository (covers the commercial repos).
- The `release-bot@nowline.io` git author identity used by `release.yml` is documented in the commercial infrastructure repository's `ops/email-setup.md`.
