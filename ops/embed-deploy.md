# nowline — Embed CDN deploy runbook

This runbook is the **OSS-repo-side checklist** that wires `release.yml` to push the `@nowline/embed` IIFE bundle to the Lolay-hosted CDN at `embed.nowline.io` (production, tag-triggered) and `embed.nowline.dev` (staging, `main`-triggered + per-PR ephemeral preview channels).

> **Infrastructure split.** Every GCP project, billing link, IAM grant, Workload Identity Federation pool, custom-domain binding, and DNS record involved in serving the bundle is **Terraform-managed in [`lolay/nowline-infra`](https://github.com/lolay/nowline-infra)**, not here. The two `nowline-embed-{prod,dev}` projects, the `embed.nowline.{io,dev}` custom domains, and the WIF wiring all land via that repo's m7 milestone. After m7 ships, the only thing left on this repo's plate is wiring the deploy workflow against the WIF outputs and shipping a `firebase.json` per project that encodes the spec's cache headers.

For the embed bundle itself (URL contract, cache headers, version aliases, bundle provenance), see [`../specs/embed.md`](../specs/embed.md) § Distribution and § Bundle provenance.

> Conventions: shell snippets are zsh / bash compatible. `<angle brackets>` are values to substitute.

## 0. Prerequisites

Infra side — must be done before any of the steps below:

- [`lolay/nowline-infra`](https://github.com/lolay/nowline-infra) m7 (Embed tier) is **applied**. Confirm with:

  ```bash
  cd ~/Projects/nowline/nowline-infra/stacks/embed
  terraform output -raw prod_project_id   # → nowline-embed-prod
  terraform output -raw dev_project_id    # → nowline-embed-dev
  terraform output -raw prod_wif_provider # → projects/<n>/locations/global/workloadIdentityPools/github/providers/lolay-nowline
  terraform output -raw dev_wif_provider
  terraform output -raw prod_deploy_sa_email
  terraform output -raw dev_deploy_sa_email
  ```

  See `lolay/nowline-infra/specs/milestones.md` § m7 and `lolay/nowline-infra/ops/runbook.md` § "Wire a tier into GitHub Actions" for the infra-side recipe.

OSS-repo side — local tooling for verification:

```bash
brew install firebase-cli google-cloud-sdk gh
firebase --version
gcloud --version
gh --version
```

Accounts:

- **GitHub**: admin on `lolay/nowline` to create deployment environments and set environment-scoped variables.
- **Firebase CLI**: signed in (`firebase login`) for local preview / smoke. Production deploys flow through CI; you should never need to `firebase deploy` to prod from a laptop.

## 1. Wire `lolay/nowline` GitHub environments

Mirror the pattern documented in `lolay/nowline-infra/ops/runbook.md` § "Wire a tier into GitHub Actions". Substituting the embed tier:

```bash
REPO=lolay/nowline

# dev environment — no protection; main pushes auto-deploy to embed-dev.
gh api -X PUT "repos/$REPO/environments/embed-dev" --silent

# prod environment — tag-only, required reviewer (set in the GitHub UI).
gh api -X PUT "repos/$REPO/environments/embed-prod" --silent --input - <<'JSON'
{
  "wait_timer": 0,
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
JSON

gh api -X POST "repos/$REPO/environments/embed-prod/deployment-branch-policies" --silent --input - <<'JSON'
{ "name": "v*.*.*", "type": "tag" }
JSON

echo "Visit: https://github.com/$REPO/settings/environments/embed-prod and add a required reviewer."
```

The two environment names (`embed-prod`, `embed-dev`) are scoped to the embed tier so they coexist cleanly with the existing `dev` / `prod` environments the site tier owns. The release workflow's `embed-prod` cell will gate on this environment's manual-approval rule.

## 2. Set environment-scoped variables from infra outputs

Pull values from `terraform output` in the infra repo — never hardcode them.

```bash
cd ~/Projects/nowline/nowline-infra/stacks/embed
REPO=lolay/nowline

gh variable set WIF_PROVIDER \
  --env embed-dev --repo "$REPO" \
  --body "$(terraform output -raw dev_wif_provider)"

gh variable set DEPLOY_SA_EMAIL \
  --env embed-dev --repo "$REPO" \
  --body "$(terraform output -raw dev_deploy_sa_email)"

gh variable set FIREBASE_PROJECT_ID \
  --env embed-dev --repo "$REPO" \
  --body "$(terraform output -raw dev_project_id)"

gh variable set WIF_PROVIDER \
  --env embed-prod --repo "$REPO" \
  --body "$(terraform output -raw prod_wif_provider)"

gh variable set DEPLOY_SA_EMAIL \
  --env embed-prod --repo "$REPO" \
  --body "$(terraform output -raw prod_deploy_sa_email)"

gh variable set FIREBASE_PROJECT_ID \
  --env embed-prod --repo "$REPO" \
  --body "$(terraform output -raw prod_project_id)"
```

Sanity-check:

```bash
gh variable list --env embed-dev  --repo "$REPO"   # Expect 3 entries
gh variable list --env embed-prod --repo "$REPO"   # Expect 3 entries
gh secret list                    --repo "$REPO"   # Must NOT contain FIREBASE_SERVICE_ACCOUNT_*
```

If a `FIREBASE_SERVICE_ACCOUNT_*` secret exists from a pre-WIF era, delete it — the infra's org policy `iam.disableServiceAccountKeyCreation` blocks new keys from being minted, but legacy secrets should be cleaned up:

```bash
gh secret delete FIREBASE_SERVICE_ACCOUNT_EMBED_PROD --repo "$REPO"
gh secret delete FIREBASE_SERVICE_ACCOUNT_EMBED_DEV  --repo "$REPO"
```

## 3. `firebase.json` per Firebase project

The infra creates the Hosting *sites* but doesn't ship a `firebase.json` — the cache-header contract from [`../specs/embed.md`](../specs/embed.md) § Distribution is application-side config and belongs in this repo. Two files, one per project, both consumed by the deploy job:

`packages/embed/firebase/prod/firebase.json`:

```json
{
  "hosting": {
    "site": "nowline-embed-prod",
    "public": "../../dist/cdn-prod",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "/*/nowline.min.js",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "/+([0-9.])/nowline.min.js",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=300, s-maxage=600" }
        ]
      },
      {
        "source": "/latest/nowline.min.js",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=300, s-maxage=600" }
        ]
      }
    ]
  }
}
```

`packages/embed/firebase/dev/firebase.json`:

```json
{
  "hosting": {
    "site": "nowline-embed-dev",
    "public": "../../dist/cdn-dev",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "/nowline.min.js",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=60, s-maxage=120, must-revalidate" },
          { "key": "X-Robots-Tag", "value": "noindex" }
        ]
      }
    ]
  }
}
```

Glob precedence: Firebase's `headers` array picks the *first* matching pattern, so `/*/nowline.min.js` (most specific patch tier with three segments) sits before the looser numeric-only patterns. Cross-check with `firebase hosting:channel:deploy --json` after the first dev run to confirm the planned matches.

## 4. Dev auth gate

`embed.nowline.dev` should not be served unauthenticated to the public — same reasoning as `nowline.dev`. Two ways to achieve this; pick one before the dev URL goes live:

| Option | What it looks like |
|---|---|
| **Inline allowlist in the dev bundle's loader** | The dev build of `@nowline/embed` includes a tiny `firebase/auth` shim that gates `nowline.initialize` on a `@lolay.com` Google sign-in. Same allowlist mechanism as `nowline-site` (`auth-allowlist.ts`-style). Ships only in the dev bundle, not in the prod bundle. |
| **Firebase Auth tenant share with `nowline-site-dev`** | Add `embed.nowline.dev` to `nowline-site-dev`'s Authorized domains and have the dev bundle import the marketing-tier auth client. Smaller dev bundle but couples the two dev projects. Requires the site tier's Auth setup (see `lolay/nowline-infra/ops/auth.md`) to be wired first. |

Recommended default: the **inline allowlist**. The dev bundle is already separate from prod, the bundle-size constraint matters less on dev, and isolating the auth surface keeps blast radius small. Document the chosen approach in [`../specs/embed.md`](../specs/embed.md) when implementing.

## 5. Deploy job in `release.yml`

Two new cells in [`.github/workflows/release.yml`](../.github/workflows/release.yml), both authenticating via WIF (mirroring the pattern in `lolay/nowline-site/.github/workflows/_deploy.yml` — see `lolay/nowline-infra/specs/milestones.md` § m6 for the canonical reference).

### `embed-prod` cell — runs on tag push

```yaml
embed-prod:
  needs: build-embed
  runs-on: ubuntu-latest
  environment: embed-prod          # gated on the manual-approval rule from § 1
  permissions:
    id-token: write
    contents: read
  if: startsWith(github.ref, 'refs/tags/v')
  steps:
    - uses: actions/checkout@v4
    - uses: actions/download-artifact@v4
      with: { name: embed-cdn-prod, path: packages/embed/dist/cdn-prod }
    - uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: ${{ vars.WIF_PROVIDER }}
        service_account: ${{ vars.DEPLOY_SA_EMAIL }}
    - uses: w9jds/firebase-action@v14   # WIF-aware; or hand-roll firebase deploy
      with:
        args: deploy --only hosting --project ${{ vars.FIREBASE_PROJECT_ID }} --non-interactive
      env:
        PROJECT_PATH: packages/embed/firebase/prod
```

### `embed-dev` cell — runs on push to `main`

```yaml
embed-dev:
  needs: build-embed
  runs-on: ubuntu-latest
  environment: embed-dev
  permissions:
    id-token: write
    contents: read
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/download-artifact@v4
      with: { name: embed-cdn-dev, path: packages/embed/dist/cdn-dev }
    - uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: ${{ vars.WIF_PROVIDER }}
        service_account: ${{ vars.DEPLOY_SA_EMAIL }}
    - uses: w9jds/firebase-action@v14
      with:
        args: deploy --only hosting --project ${{ vars.FIREBASE_PROJECT_ID }} --non-interactive
      env:
        PROJECT_PATH: packages/embed/firebase/dev
```

### Per-PR ephemeral preview channel

Deploys the dev bundle to a Firebase channel with a 7-day TTL and posts the URL as a PR comment. Same WIF auth chain; channel-id derived from the PR number:

```yaml
embed-preview:
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  environment: embed-dev
  permissions:
    id-token: write
    contents: read
    pull-requests: write
  steps:
    - uses: actions/checkout@v4
    - uses: actions/download-artifact@v4
      with: { name: embed-cdn-dev, path: packages/embed/dist/cdn-dev }
    - uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: ${{ vars.WIF_PROVIDER }}
        service_account: ${{ vars.DEPLOY_SA_EMAIL }}
    - uses: FirebaseExtended/action-hosting-deploy@v0
      with:
        repoToken: ${{ secrets.GITHUB_TOKEN }}
        projectId: ${{ vars.FIREBASE_PROJECT_ID }}
        channelId: pr-${{ github.event.pull_request.number }}
        entryPoint: packages/embed/firebase/dev
        expires: 7d
```

Note: `FirebaseExtended/action-hosting-deploy@v0` historically expected a `firebaseServiceAccount` input. v0.7+ accepts the ambient `google-github-actions/auth@v2` credential transparently. If a future major drops the WIF-native path, fall back to either `w9jds/firebase-action` (already used for the prod/dev cells above) or a hand-rolled `firebase hosting:channel:deploy` step.

### Build-once, deploy-twice

A single `build-embed` job produces two artifacts (`embed-cdn-prod` and `embed-cdn-dev`) so the dev and prod cells stay deterministic. The prod artifact's directory layout looks like:

```
packages/embed/dist/cdn-prod/
├── 0.2.3/nowline.min.js     ← immutable; CI writes per release
├── 0.2/nowline.min.js       ← rewritten each release in the minor
└── latest/nowline.min.js    ← rewritten on every release
```

The dev artifact is a single `nowline.min.js` at the root, with the version+sha+built-at banner. See [`../specs/embed.md`](../specs/embed.md) § Bundle provenance.

## 6. Verification

Run after the first prod and dev deploys.

```bash
# DNS still points where infra put it
dig +short embed.nowline.io
dig +short embed.nowline.dev
# Expect: Firebase Hosting IPs (different IPs per project).

# Bundle reachable on each tier
curl -sI https://embed.nowline.io/latest/nowline.min.js | head -1
curl -sI https://embed.nowline.dev/nowline.min.js       | head -1
# Expect: both HTTP/2 200.

# Cache-Control matches the spec
curl -sI https://embed.nowline.io/0.2.0/nowline.min.js  | grep -i cache-control
# Expect: public, max-age=31536000, immutable

curl -sI https://embed.nowline.io/latest/nowline.min.js | grep -i cache-control
# Expect: public, max-age=300, s-maxage=600

curl -sI https://embed.nowline.dev/nowline.min.js       | grep -i x-robots-tag
# Expect: noindex

# Bundle banner contains version + sha + built-at
curl -s  https://embed.nowline.io/latest/nowline.min.js | head -1
# Expect: /*! @nowline/embed X.Y.Z sha=<short-sha> built=<iso-utc> */

# Per-PR preview channel (during a real PR)
# Expect: a Firebase channel URL posted as a PR comment by action-hosting-deploy
# at https://nowline-embed-dev--pr-{N}-{hash}.web.app/nowline.min.js.
```

## 7. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy fails at `google-github-actions/auth@v2` with `Token exchange failed` | OIDC subject claim doesn't match the WIF provider's `attribute_condition` (`assertion.repository == 'lolay/nowline'`) | Re-run `terraform apply` in `lolay/nowline-infra/stacks/embed` if the repo was renamed; otherwise confirm the workflow declares `permissions: id-token: write`. |
| Deploy fails with "Permission denied" calling Hosting API | The `roles/firebasehosting.admin` grant on the deploy SA is missing | Confirm in infra: `gcloud projects get-iam-policy nowline-embed-prod --filter='bindings.members:github-actions-deploy'`. The `tier-pair` module should have created the binding; re-apply if drifted. |
| Released bundle but `/latest/` still serves the old version | The deploy job uploaded `/X.Y.Z/` but didn't rewrite `latest/` | `embed-prod` cell must lay down all three paths (`/X.Y.Z/`, `/X.Y/`, `/latest/`) in the same Firebase deploy; not three separate jobs. |
| Per-PR preview channel works but production tag deploy fails | Wrong environment scope — `embed-prod` cell pulled vars from `embed-dev` | Confirm `environment: embed-prod` on the cell, and that the three GitHub vars (`WIF_PROVIDER`, `DEPLOY_SA_EMAIL`, `FIREBASE_PROJECT_ID`) are set on the `embed-prod` environment, not just the dev one. |
| Custom domain stopped working | DNS or domain binding drift on the infra side | Run `cd ~/Projects/nowline/nowline-infra/stacks/embed && terraform plan` — non-zero diff means cloud state drifted. Re-apply, then re-deploy from this repo. |

## 8. What is NOT in this runbook

These belong to [`lolay/nowline-infra`](https://github.com/lolay/nowline-infra) and have their own runbooks there:

| Concern | Where |
|---|---|
| Creating `nowline-embed-{prod,dev}` GCP projects | `lolay/nowline-infra/stacks/embed/` (m7) |
| Linking projects to billing accounts | Same — handled by `modules/tier-pair/` |
| Enabling Firebase Hosting + identity APIs | Same — `additional_apis` in the tier-pair instantiation |
| Creating the `github-actions-deploy` service account + IAM grants | Same — `modules/tier-pair/` |
| Workload Identity Federation pool, provider, and impersonation binding for `lolay/nowline` | Same — `modules/tier-pair/` |
| `embed.nowline.io` / `embed.nowline.dev` custom-domain bindings | Same — `google_firebase_hosting_custom_domain` resources in `stacks/embed/main.tf` |
| Squarespace DNS records | `lolay/nowline-infra/ops/dns.md` (no TF provider; documented manual procedure) |
| Project teardown | `lolay/nowline-infra/ops/runbook.md` § "Recover from a destroyed-by-accident resource" — `gcloud projects delete` and the 30-day undelete window |
| Service-account key creation (legacy) | **Don't.** The org policy `iam.disableServiceAccountKeyCreation` is enforced at the org level. WIF is the only auth path. |
