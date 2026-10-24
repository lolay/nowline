# Nowline plugin

Gives an AI agent the Nowline MCP server ([`@nowline/mcp`](../../packages/mcp/)): tools to create, validate, render, and export `.nowline` roadmaps, plus the DSL reference as MCP resources. The server runs locally over stdio and needs Node 22 or later on `PATH` (the plugin starts it with `npx -y @nowline/mcp@latest`).

## Install

This repository is its own plugin marketplace, named `nowline`.

**Claude Code:**

```text
/plugin install nowline --marketplace lolay/nowline
```

Or from a shell: `claude plugin marketplace add lolay/nowline`, then `claude plugin install nowline@nowline`.

**GitHub Copilot CLI:**

```bash
copilot plugin marketplace add lolay/nowline
copilot plugin install nowline@nowline
```

**Codex:** `codex plugin marketplace add lolay/nowline`, then `codex plugin add nowline@nowline`. Codex starts plugin servers in the plugin's install folder rather than your project, so file tools won't see your roadmaps; until that changes, register the server with `nowline --mcp-install codex` instead.

**Everything else** (Claude Desktop, Cursor, VS Code, Gemini CLI, Windsurf, Zed, Goose, and more): see [`specs/mcp.md` § Harness coverage](../../specs/mcp.md#harness-coverage-oss-tier-only), or run `nowline --mcp-install` with the CLI installed.

## Layout

The plugin carries the same server in two manifest formats so one folder loads everywhere:

- `.claude-plugin/plugin.json` and `.mcp.json`: the Claude Code plugin format.
- `plugin.json` and `mcp.json`: the [Agent Plugins](https://agent-plugins.org) open standard, read by Codex, Cursor, and Copilot CLI.

Keep the two in step; `packages/integration-tests/test/mcp-metadata.test.ts` fails if they drift. The release cut sets `version` in both (`scripts/sync-mcp-metadata.mjs`). Design notes: [`specs/mcp.md` § Plugin bundle](../../specs/mcp.md#plugin-bundle).
