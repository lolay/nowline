# Historical: Self-Hosted Embed CDN (embed.nowline.io / embed.nowline.dev)

**Status:** Decommissioned. The self-hosted branded CDN was retired in favour of
npm/jsDelivr as part of the decision to keep `lolay/nowline` a standalone OSS
repo with no dependency on `nowline-infra`.

**Last commit with the full implementation intact:**

```
38095ca7dd91f563829e3da5e4ff0b02882df89c
```

To inspect or restore any part of this setup, check out that commit or browse it
on GitHub:

```
https://github.com/lolay/nowline/tree/38095ca7dd91f563829e3da5e4ff0b02882df89c
```

Key paths at that commit:

| Path | What it was |
|------|-------------|
| `.github/workflows/embed-cdn.yml` | CI pipeline: dev IIFE build + deploy to `embed.nowline.dev` on every push to `main`; per-PR ephemeral preview channels (7-day TTL) |
| `.github/workflows/release.yml` `embed-prod` job | Prod deploy to `embed.nowline.io` on every `v*` tag, atomically alongside `npm publish` |
| `.github/actions/prepare-firebase-deploy/` | Composite action: WIF auth + artifact download + sparse-checkout of firebase config |
| `packages/embed/firebase/prod/firebase.json` | Firebase Hosting config for `nowline-embed-prod` (see cache-header table below) |
| `packages/embed/firebase/dev/firebase.json` | Firebase Hosting config for `nowline-embed-dev` |
| `packages/embed/scripts/bundle.mjs` | esbuild bundler; contained the dev/prod env split, `dist-cdn-prod/` and `dist-cdn-dev/` layout logic, demo/index generation, and `PUBLIC_FIREBASE_*` guards |
| `packages/embed/scripts/gen-index.mjs` | Generates the root `index.html` version catalogue and per-version demo pages |
| `packages/embed/scripts/build-cdn-history.mjs` | Reconstructs historical version paths from published npm tarballs |
| `packages/embed/scripts/lib/templates.mjs` | `renderDemo` / `renderRootIndex` template helpers |
| `packages/embed/src/auth/firebase-auth.client.ts` | Client-side Firebase Auth gate for the dev bundle (full-viewport overlay; Google sign-in; allowlist check) |
| `packages/embed/src/auth/allowlist.ts` | `ALLOWED_DOMAINS` + `ALLOWED_EMAILS` allowlist for the dev gate |
| `packages/embed/src/auth/env.ts` | Build-time `IS_DEV` constant from `__NOWLINE_EMBED_ENV__`; drives dead-code elimination of the auth gate in the prod IIFE |
| `packages/embed/src/index.ts` | Entry point; contained the `startDevAuthGate()` dynamic import |
| `nowline-infra/stacks/embed/{prod,dev}/` | Terraform stacks provisioning `nowline-embed-{prod,dev}` GCP projects, Firebase Hosting sites, WIF pools, deploy SAs, custom-domain bindings |

---

## Architecture

### Two-domain layout

| Domain | GCP project | Triggered by | Stability |
|--------|-------------|--------------|-----------|
| `embed.nowline.io` | `nowline-embed-prod` | `v*` tag push (`release.yml`) | released versions only |
| `embed.nowline.dev` | `nowline-embed-dev` | push to `main` (`embed-cdn.yml`) | HEAD, may break; auth-gated |
| `nowline-embed-dev--pr-{N}-*.web.app` | `nowline-embed-dev` | PR open/sync | ephemeral, 7-day TTL |

Both sites were provisioned by `nowline-infra` via Workload Identity Federation
(no static service-account keys). The OSS repo held the deploy workflows; the
infra repo held the GCP resources.

### URL surface (prod — `embed.nowline.io`)

| URL | Cache-Control | Notes |
|-----|---------------|-------|
| `/{X.Y.Z}/nowline.min.js` | `max-age=31536000, immutable` | Permanent; all past releases reconstructed from npm each deploy |
| `/{X.Y}/nowline.min.js` | `max-age=300, s-maxage=600` | Rewritten on each release within the minor |
| `/latest/nowline.min.js` | `max-age=300, s-maxage=600` | Rewritten on every release |
| `/{X.Y.Z}/index.html` | `max-age=300, s-maxage=600`, `X-Robots-Tag: noindex` | Live demo page per version |
| `/index.html` | `max-age=300, s-maxage=600` | Browsable version catalogue |
| `/versions.json` | `max-age=300, s-maxage=600` | Machine-readable version list |

### URL surface (dev — `embed.nowline.dev`)

| URL | Cache-Control | Notes |
|-----|---------------|-------|
| `/latest/nowline.min.js` | `max-age=60, s-maxage=120, must-revalidate`, `X-Robots-Tag: noindex` | HEAD build; not indexed |
| `/**/index.html` | same as above | Demo + index pages |

### Dev auth gate

The dev IIFE contained an embeds a client-side Firebase Auth overlay
(`packages/embed/src/auth/firebase-auth.client.ts`). On page load it:
1. Checked `__NOWLINE_EMBED_ENV__ === 'dev'` (dead-code-eliminated to `false`
   in the prod IIFE by esbuild's `define`).
2. Rendered a full-viewport overlay (`z-index: 2147483647`) over any host page.
3. Required a Google sign-in matching `ALLOWED_DOMAINS` (`nowline.io`) or
   `ALLOWED_EMAILS` (`allowlist.ts`).
4. Once allowlisted, removed itself — the embed's auto-scan then reached the
   rendered `.nowline` blocks underneath.

The gate was injected via a dynamic `import()` in `src/index.ts`, conditioned on
`IS_DEV` from `env.ts`. The prod build never loaded `firebase/app` or
`firebase/auth`.

Four `PUBLIC_FIREBASE_*` vars were required in CI (hard-fail if missing):
`PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`,
`PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_APP_ID`. They were set as GitHub
environment-scoped variables on the `embed-dev` environment.

### Bundle provenance

Both prod and dev IIFEs included a banner:
```js
/*! @nowline/embed 0.4.2 sha=<short-sha> built=<iso-utc> */
```
The dev build additionally emitted `console.warn("nowline embed @<sha> — unstable, do not pin")` once per page load.

### Responsibility split

- **`nowline`** — bundle build scripts, `firebase.json` cache-header configs,
  CI workflows (`embed-cdn.yml`, `release.yml` `embed-prod` job), the dev auth
  gate source, the `prepare-firebase-deploy` composite action.
- **`nowline-infra`** — GCP projects, Firebase Hosting sites, IAM, WIF pools,
  custom-domain bindings, Squarespace DNS records (`ops/dns.md`, manual).

---

## Why it was retired

The branded CDN was the **only** dependency `lolay/nowline` had on
`nowline-infra`. Removing it severs that tie completely, keeping `nowline` a
self-contained OSS repo with no cloud infrastructure dependency.

The tradeoffs accepted:
- **Branding.** `embed.nowline.io` and `embed.nowline.dev` URLs are gone; the
  documented channel is now `cdn.jsdelivr.net/npm/@nowline/embed@{X.Y.Z}`.
- **No-SLA CDN.** jsDelivr is a free community CDN with no SLA. Prod embed
  bundles (loaded by third-party customer sites) now depend on it.
- **Per-version telemetry.** The self-hosted CDN provided request-level analytics
  for sunset planning. jsDelivr's public stats page is the replacement.

The dev "view/test HEAD" capability (`embed.nowline.dev`) moved to
`nowline-site` as a first-class embed example page under `src/pages/embed/`
(env-aware: loads `@next` on `nowline.dev`, `@latest` on `nowline.io`), behind
the existing dev Firebase Auth gate that site already has.

See `specs/embed.md` for the current distribution model and the decision record.

---

## How to restore

If you ever want to bring the self-hosted CDN back:

1. **Restore the OSS plumbing** from commit `38095ca7dd91f563829e3da5e4ff0b02882df89c`:
   - `packages/embed/firebase/{dev,prod}/`
   - `packages/embed/src/auth/`
   - `packages/embed/scripts/{gen-index,build-cdn-history,bundle}.mjs` (full version with `layOutCdnArtifacts`)
   - `.github/workflows/embed-cdn.yml`
   - `release.yml` `embed-prod` job
   - `.github/actions/prepare-firebase-deploy/`

2. **Re-apply the `nowline-infra` Terraform stacks** from the infra repo's git
   history at the equivalent commit (check `nowline-infra` git log for the last
   state before `stacks/embed/` was removed). This re-creates the GCP projects,
   WIF pools, Firebase Hosting sites, and deploy SAs. Then apply the Squarespace
   DNS records per `ops/dns.md`.

3. **Wire GitHub environments.** Re-create the `embed-dev` and `embed-prod`
   environments in the `lolay/nowline` repo settings and populate the
   `WIF_PROVIDER`, `DEPLOY_SA_EMAIL`, `PROJECT_ID`, and `PUBLIC_FIREBASE_*`
   variables per the infra deploy runbook.

4. **Re-enable the `embed-pack` cell** in `build.yml` (the cell that verifies
   `dist-cdn-prod/` artifacts; removed alongside the CDN).

5. Update `specs/embed.md` to restore the Distribution table and "Why a custom
   CDN" section.
