# Handoff — m4.9 OSS MCP marketplace distribution

**Date:** 2026-06-06  
**Milestone:** m4.9  
**Depends on:** m4.8 (`@nowline/mcp`)  
**Spec:** [`specs/milestones.md`](../milestones.md) § m4.9

## What shipped

### Build

- `pack-mcp-mcpb` cell in [`.github/workflows/build.yml`](../../.github/workflows/build.yml) — tenth build matrix cell; runs `make pack-mcpb`, uploads `nowline.mcpb`.
- `make pack-mcpb` — `pnpm deploy` staging + `@anthropic-ai/mcpb pack` → `dist-mcpb/nowline.mcpb`.
- `packages/mcp/manifest.json` — Claude Desktop `.mcpb` manifest (`name: nowline`).
- `scripts/sync-mcp-metadata.mjs` — syncs semver from `package.json` into `server.json` and `manifest.json`.

### Publish

- [`.github/workflows/publish-mcp.yml`](../../.github/workflows/publish-mcp.yml) — pure reusable `workflow_call`:
  1. Verify npm `@nowline/mcp@version` is live
  2. Attach `nowline.mcpb` to GitHub Release
  3. `make publish-mcp-registry` (DNS auth + registry publish — last)
  4. Create `maintainer-only` + `release-ops` tracking issue for manual channels
- Wired into [`release.yml`](../../.github/workflows/release.yml) as `publish-mcp` job with `needs: [build, publish]` (Option B).
- [`.github/workflows/publish-mcp-standalone.yml`](../../.github/workflows/publish-mcp-standalone.yml) — thin caller for maintainer re-runs (Option C).

### Registry metadata

- `packages/mcp/server.json` — `io.nowline/nowline` registry entry.
- `packages/mcp/package.json` — `mcpName: io.nowline/nowline`.
- `make publish-mcp-registry` — guarded by `CONFIRM_PUBLISH`; uses `MCP_PRIVATE_KEY` + `mcp-publisher login dns --domain nowline.io`.

### Docs

- [`ops/mcp-marketplace.md`](../../ops/mcp-marketplace.md) — one-time DNS/key setup, first publish, Claude Desktop + Gemini manual steps, re-run guide.
- Reconciled [`specs/releasing.md`](../releasing.md), [`specs/cli-distribution.md`](../cli-distribution.md), [`specs/mcp.md`](../mcp.md), [`specs/milestones.md`](../milestones.md).

## What is NOT in m4.9 (prerequisites / follow-up)

**One-time manual (operator, not code):**

- Generate Ed25519 keypair; add `MCP_PRIVATE_KEY` secret on `lolay/nowline`.
- DNS TXT record on `nowline.io`: `v=MCPv1; k=ed25519; p=<pubkey>`.

Until both exist, `publish-mcp` will fail at the registry step — npm publish and `.mcpb` build still work.

**Manual per release (auto-tracked via GitHub issue):**

- Claude Desktop Extensions directory submission.
- Gemini CLI extension channel submission.

**Deferred (separate repo, on request):**

- `nowline-site` marketplace surfacing (badges / install links on `nowline.io`).

## Verification

```bash
make pack-mcpb          # produces dist-mcpb/nowline.mcpb
make pre-commit       # full gate

# After MCP_PRIVATE_KEY + DNS are configured:
CONFIRM_PUBLISH=1 MCP_PRIVATE_KEY=... make publish-mcp-registry
```

Or dispatch **Publish MCP (standalone)** with the target semver.

## Known sharp edges

- Registry publish requires npm propagation lag — `publish-mcp.yml` polls up to 5 minutes.
- A flaky non-MCP publish cell blocks `publish-mcp` (by design); use the standalone caller to re-run once the release is green.
- `mcp-publisher` is installed via Homebrew in CI; local maintainers can `brew install mcp-publisher`.
- `nowline.mcpb` is ~500MB (full production dependency tree via `pnpm deploy`); monitor for bundle-size regressions if the MCP surface grows.
