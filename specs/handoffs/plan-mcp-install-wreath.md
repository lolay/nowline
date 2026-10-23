# Plan: `nowline --mcp-install` (register the MCP server with agent harnesses)

## Context

`nowline --mcp` already serves the full MCP surface (`packages/cli/src/commands/mcp.ts`, same `createMcpServer` as `npx @nowline/mcp`). What's missing is the install step: today users hand-edit `.mcp.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml`, etc. per the tables in `specs/mcp.md` § Harness coverage and `specs/cli-distribution.md`. Goal: one CLI command that writes the right entry into each harness's config, idempotently, with a dry-run preview.

## Surface

The CLI is verbless with mutually exclusive mode flags (`specs/cli.md` § Mode Flags), so this is a new mode flag, not a verb:

```
nowline --mcp-install [<client>]   # client: any id in the table below, or all
                                   # omitted => every client detected on this machine
        --scope user|project       # default user; project writes into cwd (.mcp.json, .cursor/mcp.json, .vscode/mcp.json)
        --root <dir>               # baked into the server args (existing --root flag)
        --server self|npx          # what to register, default self (see below)
        -n, --dry-run              # print what would change, write nothing
nowline --mcp-uninstall [<client>] # removes the `nowline` entry, same flags
```

Positional is the client name (same pattern as `--init [<name>]`). Server entry name is always `nowline`, so tools surface as `mcp__nowline__*` (matches `make mcp-claude-e2e`). `--dry-run` is allowed with these modes (currently rejected for `mcp`; relax in `args.ts`).

### What gets registered (`--server self|npx`, default `self`)

Decision: `brew install nowline && nowline --mcp-install` must work with no Node on the machine, so `self` is the default.

- `self` (default): absolute path of the installed `nowline` + `--mcp [--root <dir>]`. Absolute because GUI harnesses (Claude Desktop, Cursor, VS Code launched from the Dock) don't inherit the shell PATH. Resolve the **stable** path, not the realpath: for Homebrew that's `$(brew --prefix)/bin/nowline` (symlink that survives `brew upgrade`), never `Cellar/nowline/<ver>/bin/nowline`. Compiled binary: walk PATH for a `nowline` whose realpath equals `realpath(process.execPath)`, else fall back to `process.execPath` with a warning if it contains `/Cellar/`. npm global install (`process.execPath` is node): write `command: <abs node>`, `args: [<abs dist/index.js>, "--mcp"]`, warn that removing that Node version breaks it.
- `npx`: `npx -y @nowline/mcp [--root <dir>]`. Opt-in for people who want the server to track npm independently of the CLI. Needs Node >= 22 visible to the GUI app (the classic nvm + Claude Desktop failure).
- No CLI-generated `.mcpb`: a bundle is a snapshot copy of the server that goes stale on every `brew upgrade`. Claude Desktop gets a `claude_desktop_config.json` entry pointing at `self` instead; the published `.mcpb` stays the path for users who want the output-folder picker.

`specs/mcp.md` / `specs/cli.md` wording changes accordingly: `npx @nowline/mcp` stays canonical for hand-written configs and the MCP registry; `nowline --mcp-install` is the canonical path for CLI users and defaults to the installed binary.

## Per-client mechanism

Prefer the harness's own CLI when on PATH (they own their config format and file location); fall back to editing the file directly only for JSON/JSONC configs; print a paste-ready snippet for TOML/YAML (no new parser deps, binary size budget).

Clients with an `mcp add` command (claude-code, vscode, codex, gemini, copilot, amp): call it when the binary is on PATH; `--dry-run` prints the exact argv instead of running it; a missing binary falls back to the file row, else prints the command. Handling the known downsides of shelling out:
- Idempotency: `add` errors or duplicates when `nowline` already exists. Run `<tool> mcp get nowline` (or `remove`) first; same config = report "already installed", different = `remove` then `add`.
- Interactivity: spawn with stdin closed and a timeout, so a version that prompts fails fast with its stderr shown instead of hanging.
- Flag drift between harness versions: on non-zero exit, show the harness's stderr plus the printed command, and exit `OutputError`. No retry with guessed flags.
- Tests: the spawner is injected; unit tests assert argv vectors against a fake, no real harness needed.

The client set is a data table, so adding a harness is one descriptor plus a shape test. Two adapter kinds: `cli` (argv vector) and `json` (path per scope, key path, entry shaper). `print` is the fallback for both.

| Client id | Preferred | Fallback file (user / project) | Entry key and shape |
|---|---|---|---|
| claude-code | `claude mcp add -s user\|project nowline -- <cmd>` | project: `.mcp.json`; user: print the `claude mcp add` line (don't hand-edit `~/.claude.json`) | `mcpServers.nowline {command,args}` |
| claude-desktop | n/a | `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`, Linux `~/.config/Claude/`); user only | `mcpServers.nowline` |
| cursor | n/a | `~/.cursor/mcp.json` / `.cursor/mcp.json` | `mcpServers.nowline` |
| vscode | `code --add-mcp '<json>'` (user) | `.vscode/mcp.json` (project) | `servers.nowline {type:"stdio",command,args}` |
| codex | `codex mcp add nowline -- <cmd>` | print TOML for `~/.codex/config.toml` | `[mcp_servers.nowline]` |
| gemini | `gemini mcp add -s user\|project nowline <cmd>` | `~/.gemini/settings.json` / `.gemini/settings.json` | `mcpServers.nowline` |
| muse (Meta Muse Code) | n/a (only `muse mcp login/logout` exist) | `~/.config/muse/settings.json`; user only (no project settings file) | `mcp_servers.nowline {transport:"stdio",command,args,mode:"optional"}`. If creating the file, write `"schema_version": 1` (Muse fails every command without it). `mode: optional` so a missing/broken nowline warns instead of aborting every Muse run (default is `required`). |
| opencode | n/a (no `opencode mcp add`) | `~/.config/opencode/opencode.json[c]` / `opencode.json` in cwd (edit `.jsonc` if that's what exists) | `mcp.nowline {type:"local",command:[cmd,...args],enabled:true}`. If the file already uses the v2 `mcp.servers` layout, write there instead. |
| copilot (GitHub Copilot CLI) | `copilot mcp add` | `~/.copilot/mcp-config.json` (honor `XDG_CONFIG_HOME`) / `.mcp.json` | `mcpServers.nowline` |
| windsurf | n/a | `~/.codeium/windsurf/mcp_config.json`; user only | `mcpServers.nowline` |
| zed | n/a | `~/.config/zed/settings.json` (macOS/Linux), `%APPDATA%\Zed\settings.json` / `.zed/settings.json` | `context_servers.nowline {command,args}` (JSONC, comments must survive) |
| amp | `amp mcp add` | `~/.config/amp/settings.json` / `.amp/settings.json` | `"amp.mcpServers".nowline` (literal dotted key) |
| goose | n/a (`goose configure` is interactive) | print YAML for `~/.config/goose/config.yaml` | `extensions.nowline {type:stdio,cmd,args,enabled:true}` |

`--scope project` on a user-only client is an `InputError` naming the client. Deferred: Cline / Roo / Kilo (config lives in VS Code extension `globalStorage`, path varies by editor fork and isn't a stable contract), Kiro and Continue (paths not verified against vendor docs). Each needs only a table row later. Paths marked from third-party sources (windsurf, amp, goose) get re-verified against vendor docs during implementation; any that can't be confirmed downgrade to `print`.

JSON edits use `jsonc-parser` (already in the lockfile via the LSP stack; add as a direct dep of `@nowline/cli`) `modify`/`applyEdits` so comments and formatting in VS Code/Cursor JSONC files survive. Write atomically (temp + rename), create parent dirs, never touch other entries. Existing `nowline` entry with same config = no-op ("already installed"); different config = overwrite and report old vs new.

Detection for "omitted client": harness CLI on PATH, or its config dir exists.

## Files

- `packages/cli/src/cli/args.ts`: add `mcp-install`, `mcp-uninstall`, `scope`, `server` options; new `ModeKind`s; mutual-exclusion and validation (bad client/scope/server => `CliError(InputError)`).
- `packages/cli/src/commands/mcp-install.ts` (new): handler; resolves server command, iterates clients, prints a per-client result line; throws `CliError(OutputError)` on write failure.
- `packages/cli/src/mcp-install/clients.ts` (new): table of client descriptors `{ id, detect(), cliArgs(entry, scope), configPath(scope), key, shape(entry) }`. Facts only, testable without spawning.
- `packages/cli/src/mcp-install/json-config.ts` (new): jsonc read/merge/remove/atomic write.
- `packages/cli/src/index.ts`: dispatch new modes.
- `packages/cli/src/cli/help.ts`, `packages/cli/man/` (translated man pages, see `steward` skill), `packages/cli/README.md`.
- `specs/cli.md` (new `### --mcp-install` section + CLI surface block), `specs/mcp.md` and `specs/cli-distribution.md` harness tables (add `nowline --mcp-install <client>` as the install form).
- `.changelog/<branch-slug>.txt` with `release-note:added`.

Reuse: `CliError`/`ExitCode` (`packages/cli/src/io/exit-codes.ts`), `createLog` (`packages/cli/src/io/log.ts`), existing `--root` parsing.

## Release fit (v0.9.0 cut from `main`, minor)

Must merge before the Release dispatch, notes final at merge.

- `make changelog-preview` read: no pending CLI entry covers `--mcp` or MCP install. Adjacent: the `-q, --quiet` entry (`.changelog/cli-quiet-flag.txt`). The installer follows it rather than contradicting it: per-client result lines are requested output (stdout, kept under `-q`); the Cellar-path / npm-Node-version notices are `warning:` lines on stderr and `-q` drops them. No edit to that entry needed.
- Not breaking: only new flags, and `--dry-run` is newly *allowed* with the install modes (still rejected with `--mcp`). No previously passing invocation fails. No "**Breaking:**" prefix.
- Fragment: `.changelog/claude-nice-sagan-c3m6w0.txt`, one `release-note:added` block: "**`@nowline/cli` — `nowline --mcp-install [<client>]` registers the MCP server with agent harnesses**: …" covering the client list, `--scope`, `--server self|npx` (default `self`, the installed binary's stable path, so a `brew install` with no Node works and `brew upgrade` carries the server), `--dry-run`, `--mcp-uninstall`, and which clients get a printed snippet instead of a write.
- Docs: `specs/cli.md` (CLI surface block + new `### --mcp-install` section + `--mcp` CLI-design note), `specs/mcp.md` and `specs/cli-distribution.md` harness tables, `packages/cli/man/nowline.1` and `packages/cli/man/fr/nowline.1` (translate the new text, then paste the `translated-from: nowline.1 sha256:` stamp `translation-parity.test.ts` prints), `packages/cli/README.md`, `help.ts`.
- Not visual: no SVG under `examples/` or `tests/` changes, no snapshot impact.
- Doesn't touch `packages/mcp/`, so `make pack-mcpb` isn't required by the release rule; AGENTS.md still says run it after `make pre-commit`, so run it anyway.
- Gate: `make pre-commit`, `make changelog-check BASE=origin/main REQUIRE=1`, `make pack-mcpb`.

Timing risk: 13 clients plus EN/FR docs is a real chunk of work to land in front of a cut. If the cut can't wait, ship the row-table with the verified clients (claude-code, claude-desktop, cursor, vscode, codex, gemini, muse, opencode, copilot) and add windsurf/zed/amp/goose as `print`-only rows; promote them to file writes in 0.9.1 once their paths are verified.

Branch: `claude/nice-sagan-c3m6w0` (harness-assigned). Runner: copy this plan to `specs/handoffs/plan-mcp-install-wreath.md` with the first commit, and remove it as the last commit before merge.

## Tests (`packages/cli/test/`)

- `cli/args.test.ts`: new flags, exclusivity, `--dry-run` allowed, bad values rejected.
- `mcp-install/json-config.test.ts`: insert into missing/empty/commented file, idempotent re-run, overwrite differing entry, uninstall leaves siblings and comments intact.
- `mcp-install/clients.test.ts`: one shape test per client (VS Code `servers`+`type`, Muse `schema_version` on create and `mode: optional`, OpenCode command-array and v2 layout, Zed `context_servers`, Amp dotted key), CLI arg vectors, platform config paths (inject `platform`/`homedir`/`env`), user-only clients reject `--scope project`.
- Integration: spawn `dist/index.js --mcp-install cursor --scope project` in a temp cwd with `HOME` pointed at a temp dir and a PATH lacking harness CLIs; assert file contents and `--dry-run` writes nothing.

## Verification

- `make pre-commit` green, `make changelog-check BASE=origin/main REQUIRE=1` green, then `make pack-mcpb` (per AGENTS.md). Re-run all three after any later edit, right before committing.
- Manual: in a temp dir, `node packages/cli/dist/index.js --mcp-install claude-code --scope project -n`, then without `-n`; `claude mcp list` shows `nowline`; `make mcp-inspector-smoke` still passes.
- Not a visual change; no snapshot impact.
