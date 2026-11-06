# Handoff: r1.f20 + r1.f25 (CLI docs, architecture graph)

Branch: `claude/great-archimedes-plg7nn` (harness-assigned; the ask named `fix/cli-and-architecture-docs`, which is the topic only). Base: `main` at 92299a5.

Status: code and docs done, `make pre-commit` and `make pack-mcpb` green. Waiting on the owner to approve the PR description below before opening the PR.

Pending question, verbatim: "show me the description before opening the PR."

To resume: if approved, open the PR from this branch to `main` with the description below, after deleting this file in the branch's last commit (it must not land on `main`). Then subscribe to PR activity.

## Draft PR description

Title: `Validate --start, document --template, redraw the package graph`

---

## Summary

Fixes r1.f20 and r1.f25 from the r1 full review (tracking: lolay/nowline#259). `--start` is now validated like every other flag (exit 2 for every format), `--template` is documented everywhere, and `architecture.md`'s package graph is redrawn from the code at `main`.

**Tier: [check].** Blast radius: CLI flag parsing for `--start` and `-f nowline`; docs otherwise. Review time: about 10 minutes.

## Motivation

Both findings were recorded at a528705. Rechecked at 92299a5; dropped what was already fixed:

- A bad `--mcp --port` already exits 2 through `CliError` with a test (#264), and its changelog entry is pending in `mcp-single-start-path.txt`. Nothing to do.
- `--help` and `nowline.1` already listed `json` and `nowline` under `-f`; only `cli.md` didn't.
- The jsDelivr/CDN passages (#255) are untouched.

<details>
<summary>[check] <code>--start</code> validation (<code>cli/options.ts</code>, <code>commands/render.ts</code>)</summary>

`--start` joins `CLI_OPTION_SPECS` (flag only, no rc key) and must be a real `YYYY-MM-DD` day (`isRealIsoDate`, so `2026-02-30` fails too). It's checked with page size, orientation and margin, after validation, so diagnostics still come first and `--serve` (which ignores it) isn't affected. `assertPdfSettingsValid` is renamed `assertExportSettingsValid` to match.

Before: `--start notadate` exited 0 for svg (ignored) and 3 for msproj (the exporter threw). After: exit 2 everywhere with `nowline: invalid --start "notadate". Expected YYYY-MM-DD, a real calendar date.`

One widening to look at: `-f nowline` never ran the format-settings check, so `-f nowline --page-size huge` exited 0 though `cli.md` says it's an error for every format. It now runs the check (both the text and JSON-input paths).

</details>

<details>
<summary>[check] Flag-documentation gate (<code>cli/args.ts</code>, <code>test/cli/help.test.ts</code>)</summary>

Per AGENTS.md's bug retrospective: `parseArgv`'s option table is now the exported `ARGV_OPTIONS` (moved, not changed), and a test asserts every flag in it appears in `--help` and in `nowline.1`. It found a second gap on its first run: `--diagnostic-format` wasn't in the man page. The French page is covered through `translation-parity.test.ts`.

</details>

<details>
<summary>[check] Package graph (<code>specs/architecture.md</code>)</summary>

Redrawn from each package's `src/` imports (parsed with the TypeScript compiler, separating runtime, type-only and dynamic imports), starting from the r1 summary's graph and re-verified. Differences from that graph: `export-core`'s type edge to `core`, and `cli → renderer` (`--serve` calls `renderSvg` and `stageRoadmap`). Split into an engine diagram and a surfaces diagram so each fits a phone. Edges to `core`, `layout` and `export-core` from packages that already reach them are left out and said so.

Descriptions fixed: preview-shell (type-only deps), mcp (hard deps on config, share-link, preview), cli (no direct exporter imports), embed (browser + share-link), the Action (bundles layout for input checks, then runs the CLI). The enforcement sentence now says what pnpm checks (undeclared imports fail) and what it doesn't (unused declarations). The pnpm pin and binary sizes no longer carry numbers that go stale. The monorepo listing adds config, preview, share-link and integration-tests.

</details>

<details>
<summary>[skim] Docs and changelog</summary>

- `--help`: `--template`, plus `--page-size`, `--orientation`, `--margin` and `--start`, which it never listed.
- `nowline.1` and `fr/nowline.1` (restamped): `--template`, `--diagnostic-format`, the `--start` exit rule.
- `cli.md`: `npm install -g @nowline/cli` and `npx @nowline/cli` (the unscoped `nowline` package isn't ours), `-f` list, `--template`, `--start` exit rule, `.nowlinerc` found from the input's directory (cwd for stdin), binary size.
- `export-determinism.md`: the kernel extraction and the resvg-wasm switch read as done.
- `.changelog/cli-and-architecture-docs.txt`: two `fixed` entries. No `--port` entry; the pending one covers it.

</details>

Out of scope: pruning unused dependencies and a declared-versus-imported lint (r1.f33); the font-default text in `cli.md` and `nowline.1` (r1.f22).

## How I tested this

- `make pre-commit` and `make pack-mcpb` pass.
- New tests: `--start notadate` and `--start 2026-02-30` exit 2 for `-f svg`, `msproj` and `nowline`; a valid `--start` reaches `<StartDate>`; a unit test for the held-back check; the flag-documentation gate.

## Checklist

- [x] I ran `make pre-commit` locally.
- [x] I added or updated tests where the change affects observable behavior.
- [x] I updated documentation (READMEs, `specs/`, inline comments) where the change affects observable behavior.
- [x] I added a `.changelog/` fragment for any user-observable change, or the PR is labelled `no-changelog`.
- [x] If this changes or removes behaviour a pending `.changelog/` fragment or `[Unreleased]` entry describes, I edited or deleted that entry instead of adding a contradicting one.
- [x] I have disclosed any AI assistance below with an `Assisted-by:` line.
- [x] I have read CONTRIBUTING.md and agree to license my contribution under Apache 2.0.

## AI assistance

https://claude.ai/code/session_01BNKwNaHDpyCbkjh6vRUEkS

Assisted-by: Claude Code
