# nowline (OSS) — MCP marketplace runbook

Operator runbook for `@nowline/mcp` marketplace distribution: the public MCP registry (`io.nowline/nowline`), the Claude Desktop `.mcpb` bundle, and the manual Gemini CLI extension channel. Automated steps live in [`.github/workflows/publish-mcp.yml`](../.github/workflows/publish-mcp.yml); this doc covers one-time setup and the channels CI cannot drive.

> Conventions: shell snippets are zsh / bash compatible. Registry publish commands are sourced from the Makefile (`make publish-mcp-registry`) — do not invoke `mcp-publisher` directly except during initial credential verification.

## What CI automates on every release

| Step | Workflow | Notes |
|------|----------|-------|
| npm `@nowline/mcp` | `release.yml` → `publish` (npm cell) | Same loop as all `@nowline/*` packages |
| Build `nowline.mcpb` | `release.yml` → `build` (`pack-mcp-mcpb` cell) | `make pack-mcpb` |
| Attach `.mcpb` to GitHub Release | `publish-mcp.yml` | After npm is live |
| MCP registry `io.nowline/nowline` | `publish-mcp.yml` (last step) | DNS domain auth via `MCP_PRIVATE_KEY` |
| Cursor Marketplace + VS Code MCP gallery | — | Registry-sourced; no separate action once registry entry is live |
| Tracking issue for manual channels | `publish-mcp.yml` | Labels `maintainer-only` + `release-ops` |

Manual-only channels (no public submission API):

- Claude Desktop Extensions directory (`.mcpb` upload)
- Gemini CLI extension channel

Each release opens a tracking issue linking here so these steps do not silently fall behind.

## One-time: MCP registry credentials

The registry is in **preview** ([MCP Registry](https://modelcontextprotocol.io/registry)). There is no web portal account — domain control is the identity. Nowline uses **DNS TXT-record domain auth** on `nowline.io` so the branded id stays `io.nowline/nowline` (OIDC `io.github.lolay/*` is rejected for this estate).

### 1. Generate an Ed25519 keypair

```bash
openssl genpkey -algorithm Ed25519 -out mcp-registry-key.pem
chmod 600 mcp-registry-key.pem
```

Extract the **public** key for DNS (base64, 32 raw bytes):

```bash
openssl pkey -in mcp-registry-key.pem -pubout -outform DER | tail -c 32 | base64
```

Extract the **private** key as 64-character hex for CI:

```bash
openssl pkey -in mcp-registry-key.pem -noout -text \
  | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n'
```

Store `mcp-registry-key.pem` in your password manager. The hex private key goes into GitHub Actions only.

### 2. Publish the DNS TXT record

Add a TXT record on the `nowline.io` zone (exact host depends on your DNS provider — typically `@` or `nowline.io`):

```text
v=MCPv1; k=ed25519; p=<PUBLIC_KEY_BASE64>
```

This is **not** a repo file — it respects the OSS boundary (no `nowline-site` PR). DNS auth grants `io.nowline/*` subdomains. The live record is Terraform-managed in [`lolay/nowline-infra`](https://github.com/lolay/nowline-infra): `stacks/platform/variables.tf` (`nowline_io_mcp_registry_ed25519_pubkey`) → apex TXT via `stacks/site/prod/dns.tf`. See [`nowline-infra/ops/dns.md`](https://github.com/lolay/nowline-infra/blob/main/ops/dns.md).

Allow DNS propagation (minutes to hours) before verifying.

### 3. Add the GitHub Actions secret

On `lolay/nowline` → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `MCP_PRIVATE_KEY` | 64-character hex private key from step 1 |

Also ensure the **`release-ops`** label exists on the repo (used by `publish-mcp.yml` tracking issues alongside `maintainer-only`). Create once if missing:

```bash
gh label create release-ops -R lolay/nowline \
  --description "Release-time maintainer checklist (MCP marketplace, etc.)" \
  --color "C5DEF5"
```

### 4. Verify login locally (optional)

```bash
brew install mcp-publisher   # or see registry CLI docs
export MCP_PRIVATE_KEY='<hex-private-key>'
cd packages/mcp
mcp-publisher login dns --domain nowline.io --private-key "$MCP_PRIVATE_KEY"
mcp-publisher validate
```

Ensure `package.json` includes `"mcpName": "io.nowline/nowline"` and `server.json` `name` matches.

## First registry publish

Once DNS + `MCP_PRIVATE_KEY` exist, the **first** publish is not special — it uses the same automation as every release:

1. **Preferred:** cut a release via the `Release` workflow (tag push runs `publish-mcp` automatically after `build` + `publish` are green).
2. **Re-run / credential test:** dispatch [Publish MCP (standalone)](../.github/workflows/publish-mcp-standalone.yml) with the semver version (no `v` prefix).

Standalone re-runs are safe: npm attach and registry publish are idempotent for the same version.

## Claude Desktop Extensions (manual)

No public submission API — maintainers submit each release by hand until Anthropic offers automation.

1. Open the GitHub Release for the tag (e.g. `v0.6.0`).
2. Download **`nowline.mcpb`** (attached by `publish-mcp.yml`, or built locally with `make pack-mcpb`).
3. Submit to the [Claude Desktop Extensions directory](https://claude.com/docs/connectors/building/mcpb) per their current process.
4. First publish may require review (hours to days); updates to the same publisher id are usually faster.

Manifest id: `name: nowline` (bare — see [`specs/releasing.md`](../specs/releasing.md) § MCP publishing artifacts).

## Gemini CLI extension channel (manual)

Gemini CLI extensions are submitted per Google's publishing process (bundle + `GEMINI.md`). There is no API wired into `nowline` CI.

1. Build or download the release artifact set for `@nowline/mcp` (npm package + extension metadata as required by the current Gemini CLI docs).
2. Follow the Gemini CLI extension publishing guide for the `nowline` extension id.
3. Mark the release tracking issue checklist item complete.

Revisit this section when Google documents a stable, automatable submission path.

## Re-running MCP publish only

When a non-MCP publish cell failed but the release is otherwise green:

1. Go to **Actions → Publish MCP (standalone) → Run workflow**.
2. Enter the semver version (e.g. `0.6.0`).
3. Confirm the run: npm live check → `.mcpb` attach → registry publish → tracking issue.

The reusable workflow downloads `nowline.mcpb` from the build artifact when present, otherwise from the GitHub Release asset, otherwise rebuilds via `make pack-mcpb`.

## Related docs

- Release pipeline: [`specs/releasing.md`](../specs/releasing.md) § MCP publishing artifacts
- Harness matrix: [`specs/mcp.md`](../specs/mcp.md) § Harness coverage
- Per-channel ids: [`specs/cli-distribution.md`](../specs/cli-distribution.md) § MCP server distribution
- Milestone: [`specs/milestones.md`](../specs/milestones.md) § m4.9
