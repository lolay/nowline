# nowline — Embed CDN deploy runbook

This runbook walks through the **one-time manual bootstrap** for the Lolay-hosted embed CDN at `embed.nowline.io` (production) and `embed.nowline.dev` (staging). After this is done, every release of `@nowline/embed` from this monorepo deploys the IIFE bundle to both, and every PR gets an ephemeral preview channel on the dev project.

For the embed bundle itself (URL contract, cache headers, version aliases, bundle provenance), see [`../specs/embed.md`](../specs/embed.md). The "Bootstrap status" section there is what this runbook is the operational counterpart to.

> Conventions: shell snippets are zsh / bash compatible. Wherever a step needs a real value (project ID, billing account ID, etc.) it appears in `<angle brackets>`. Replace before running.

## 0. Prerequisites

```bash
brew install firebase-cli google-cloud-sdk gh
gcloud --version
firebase --version
gh --version
```

Accounts:

- **GCP**: account with billing enabled. Two new projects will be created (`nowline-embed-prod`, `nowline-embed-dev`) under the Lolay billing account.
- **Squarespace**: DNS for `nowline.io` and `nowline.dev` (managed in *Squarespace Domains → Domains → click domain → DNS Settings*).
- **GitHub**: admin on `lolay/nowline` for setting repo secrets.

The auth gate on `embed.nowline.dev` reuses the same `@lolay.com` allowlist pattern as `nowline.dev`. If it should authenticate against the same Firebase Auth tenant as the marketing site (`nowline-site-dev`), capture that decision in [§ 4](#4-dev-auth-gate) before provisioning so the dev project's `Authorized domains` get pre-configured correctly.

## 1. Squarespace (DNS)

Done **before** the Firebase custom-domain step so verification can complete in one pass.

| Host | Type | Value | Notes |
|---|---|---|---|
| `embed.nowline.io` | A | (Firebase IPs from `nowline-embed-prod` Hosting → custom domain dialog) | One or two A records as Firebase shows. |
| `embed.nowline.dev` | A | (Firebase IPs from `nowline-embed-dev` Hosting → custom domain dialog) | Same — different IPs, different project. |

If Squarespace pre-populated AAAA records on either subdomain, delete them — Firebase populates the right IPv6 values automatically.

## 2. Google Cloud + Firebase — TWO projects, identical structure

Two new GCP projects, each with only its **default** Firebase Hosting site. No `firebase hosting:sites:create` needed — the embed deploys to one site per project.

> **Plan note**: Firebase Hosting custom domains require the **Blaze (pay-as-you-go)** plan. Both projects can stay on the **Spark** plan during initial setup (only the auto `*.web.app` URLs work); upgrade to Blaze before adding the `embed.nowline.io` / `embed.nowline.dev` custom domains. Embed traffic is well within free-tier limits — Blaze costs nothing on a project that stays under quota, but you must enable billing.

### Production project: `nowline-embed-prod`

```bash
gcloud projects create nowline-embed-prod --name="nowline-embed (production)"
gcloud beta billing projects link nowline-embed-prod --billing-account=<your-billing-account-id>
gcloud config set project nowline-embed-prod

gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com
```

Then via the Firebase Console:

1. [Firebase Console](https://console.firebase.google.com/) → "Add project" → pick the existing `nowline-embed-prod` GCP project.
2. Confirm. Firebase auto-creates the default Hosting site at `nowline-embed-prod.web.app`.
3. Upgrade the project to **Blaze** (Project Settings → Usage and billing → Modify plan). Required before custom domains.
4. Console → Build → Hosting → "Add custom domain" → enter `embed.nowline.io`.
5. Firebase prompts for A records on `embed`. Copy the IPs into Squarespace (§ 1), wait for verification (~5–10 min). Firebase provisions the SSL cert automatically (~30 min).

Service account for CI:

```bash
gcloud iam service-accounts create github-actions-deploy \
  --display-name="GitHub Actions deploy"

gcloud projects add-iam-policy-binding nowline-embed-prod \
  --member="serviceAccount:github-actions-deploy@nowline-embed-prod.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"

gcloud iam service-accounts keys create ~/Downloads/nowline-embed-prod.json \
  --iam-account="github-actions-deploy@nowline-embed-prod.iam.gserviceaccount.com"
```

Save `~/Downloads/nowline-embed-prod.json`. We'll paste its contents into the GitHub secret `FIREBASE_SERVICE_ACCOUNT_EMBED_PROD` in § 3.

### Staging project: `nowline-embed-dev`

```bash
gcloud projects create nowline-embed-dev --name="nowline-embed (staging / dev)"
gcloud beta billing projects link nowline-embed-dev --billing-account=<your-billing-account-id>
gcloud config set project nowline-embed-dev

gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com identitytoolkit.googleapis.com
```

Then via Firebase Console:

1. "Add project" → pick `nowline-embed-dev` GCP project.
2. Default Hosting site auto-created at `nowline-embed-dev.web.app`.
3. Upgrade to **Blaze** (custom domain + per-PR ephemeral preview channels both want it).
4. "Add custom domain" → `embed.nowline.dev`. Add A records to Squarespace; wait for verification + cert.

Service account for CI:

```bash
gcloud iam service-accounts create github-actions-deploy \
  --display-name="GitHub Actions deploy"

gcloud projects add-iam-policy-binding nowline-embed-dev \
  --member="serviceAccount:github-actions-deploy@nowline-embed-dev.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"

gcloud iam service-accounts keys create ~/Downloads/nowline-embed-dev.json \
  --iam-account="github-actions-deploy@nowline-embed-dev.iam.gserviceaccount.com"
```

Save `~/Downloads/nowline-embed-dev.json` for the GitHub secret in § 3.

Local CLI convenience:

```bash
firebase login
firebase use --add nowline-embed-prod --alias embed-prod
firebase use --add nowline-embed-dev  --alias embed-dev
```

## 3. GitHub secrets on `lolay/nowline`

Settings → Secrets and variables → Actions:

| Secret | Value | Used by |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_EMBED_PROD` | Contents of `~/Downloads/nowline-embed-prod.json` | embed deploy job in `release.yml` (tag-triggered) |
| `FIREBASE_SERVICE_ACCOUNT_EMBED_DEV` | Contents of `~/Downloads/nowline-embed-dev.json` | embed deploy job in `release.yml` (push to `main`) and the per-PR preview channel job |

If `lolay/nowline` already has a `SITE_REBUILD_TOKEN` secret used by `notify-site.yml` for `lolay/nowline-site` — leave it unchanged. The embed deploy is an independent job in the same `release.yml`.

## 4. Dev auth gate

`embed.nowline.dev` should not be served unauthenticated to the public — same reasoning as `nowline.dev`. Two ways to achieve this; pick one before exposing the dev URL:

| Option | What it looks like |
|---|---|
| **Inline allowlist in the dev bundle's loader** | The dev build of `@nowline/embed` includes a tiny `firebase/auth` shim that gates `nowline.initialize` on a `@lolay.com` Google sign-in. Same allowlist mechanism as `nowline-site` (`auth-allowlist.ts`-style). Ships only in the dev bundle, not in the prod bundle. |
| **Firebase Auth tenant share with `nowline-site-dev`** | Add `embed.nowline.dev` to `nowline-site-dev`'s Authorized domains and have the dev bundle import the marketing-tier auth client. Smaller dev bundle but couples the two dev projects. |

Recommended default: the **inline allowlist**. The dev bundle is already separate from prod, the bundle-size constraint matters less on dev, and isolating the auth surface keeps blast radius small. Document the chosen approach in [`../specs/embed.md`](../specs/embed.md) when implementing.

## 5. Deploy job in `release.yml`

The deploy step extends the existing `release.yml`. Two triggers:

- **Tag push (`v*`)** → build the embed bundle (already happens for npm publish), then deploy to `nowline-embed-prod` writing the bundle into versioned paths. Aliases (`/{X.Y}/`, `/latest/`) are rewritten in the same deploy.
- **Push to `main`** → deploy to `nowline-embed-dev` at the unversioned path; bundle banner includes the SHA + a `console.warn("nowline embed @<sha> — unstable, do not pin")`.

Per-PR ephemeral preview channels use [`FirebaseExtended/action-hosting-deploy@v0`](https://github.com/FirebaseExtended/action-hosting-deploy) targeting the dev project with a `channelId` derived from the PR number; the action posts the channel URL back as a PR comment automatically.

The full URL contract (paths, cache headers, version aliases) is documented in [`../specs/embed.md`](../specs/embed.md) § Distribution. Reproduce it in `firebase.json` per project so cache-control matches the spec:

| Path pattern | `Cache-Control` |
|---|---|
| `/{X.Y.Z}/nowline.min.js` (immutable patch) | `public, max-age=31536000, immutable` |
| `/{X.Y}/nowline.min.js`, `/latest/nowline.min.js` (rolling) | `public, max-age=300, s-maxage=600` |
| `/nowline.min.js` (dev project only) | `public, max-age=60, s-maxage=120, must-revalidate`, plus `X-Robots-Tag: noindex` |

## 6. Verification

Run after first prod and dev deploys.

```bash
# DNS resolves
dig +short embed.nowline.io
dig +short embed.nowline.dev
# Expect: Firebase Hosting IPs (different IPs per project).

# Bundle is reachable on each tier
curl -sI https://embed.nowline.io/latest/nowline.min.js | head -1
curl -sI https://embed.nowline.dev/nowline.min.js | head -1
# Expect: both HTTP/2 200.

# Cache-Control matches the spec
curl -sI https://embed.nowline.io/0.2.0/nowline.min.js | grep -i cache-control
# Expect: public, max-age=31536000, immutable

curl -sI https://embed.nowline.io/latest/nowline.min.js | grep -i cache-control
# Expect: public, max-age=300, s-maxage=600

# Dev gate (option-dependent — see § 4)
curl -sI https://embed.nowline.dev/nowline.min.js | grep -i x-robots-tag
# Expect: noindex (regardless of the auth-gate option chosen).

# Bundle banner contains version + sha + built-at
curl -s https://embed.nowline.io/latest/nowline.min.js | head -1
# Expect: /*! @nowline/embed X.Y.Z sha=<short-sha> built=<iso-utc> */

# Per-PR preview channel (during a real PR)
# Expect: a Firebase channel URL posted as a PR comment by action-hosting-deploy.
```

## 7. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Custom domain stuck in "Needs setup" for >1 hour | Project still on Spark plan, or AAAA records still present | Upgrade to Blaze (Project Settings → Usage and billing); `dig AAAA embed.nowline.io` and remove conflicting AAAA records. |
| Deploy fails with "Permission denied" | Service-account role missing | Re-grant `roles/firebasehosting.admin` to the deploy service account in the right project. |
| Released bundle but `/latest/` still serves the old version | The deploy job didn't rewrite the alias — only deployed `/X.Y.Z/` | Add the alias-rewrite step to `release.yml`'s embed deploy job; alias paths are part of the same Firebase deploy. |
| Per-PR preview channel works but production tag-deploy fails | Wrong service account secret used | `release.yml` embed-prod step must reference `FIREBASE_SERVICE_ACCOUNT_EMBED_PROD`, not the dev secret. |

## 8. Tear-down (in case of total reset)

1. `firebase hosting:disable --project embed-prod` and `--project embed-dev`.
2. `gcloud projects delete nowline-embed-prod` and `gcloud projects delete nowline-embed-dev` (30-day grace period).
3. Remove `embed.nowline.io` and `embed.nowline.dev` A records in Squarespace.
4. Revoke the two service-account keys; delete the GitHub secrets.
5. Restart from § 1 if you're recreating, or update [`../specs/embed.md`](../specs/embed.md) § Distribution to remove the branded-CDN tier and revert embedders to `npm i @nowline/embed`.
