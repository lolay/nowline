# r1 full review: findings

- Kind: full
- Range: ..a5287055ac8da4a7312d2e780f3aff5ff648547d
- Repo: lolay/nowline
- Follows: none (first logged review; the earlier, unlogged [review since v0.8.6](../review-since-v086.md) was read as context)
- Reviewers: architecture, contracts, security, tests, dependencies and duplication, hotspots A (`mcp/src/server.ts`, `preview-shell/src/mount.ts`, `core/src/language/include-resolver.ts`, `cli/src/commands/render.ts`, `vscode-extension/src/extension.ts`), hotspots B (`layout/src/phases/finalize.ts`, `layout/src/types.ts`, `layout/src/view-preset.ts`, `export-msproj/src/index.ts`, `export-mermaid/src/index.ts`); Opus, xhigh, fresh context, severity floor medium
- Verifier: two fresh verifier instances (split by area, one pass), Opus, xhigh; 41 reviewer findings merged to 33 candidates (8 duplicates across reviewers); dropped 0 of 33; re-rated 5 down (r1.f5, r1.f17, r1.f18 to medium; r1.f32, r1.f33 to low)
- Hotspots skipped as data: `packages/cli/man/nowline.5`, `packages/cli/man/fr/nowline.5`, `packages/cli/man/nowline.1`, `packages/cli/man/fr/nowline.1`, `packages/integration-tests/determinism/hashes.json`
- Accepted, not raised again: none

Locations are at a5287055 (`a528705` below). Mermaid findings r1.f9 and r1.f11 were verified against upstream Mermaid's `gantt.jison` and `ganttDb.js`, not a live Mermaid render; everything else was verified by reading the code at that commit and, where marked, by running the built packages.

## security

### r1.f1 - MCP file tools reach any file in the root, and symlinks and includes reach outside it

- Severity: high
- Dimension: security
- Kind: fix
- Location: `packages/mcp/src/server.ts:178` at a528705
- Evidence: `resolveAndGuard` (`server.ts:178`, `workspace-roots.ts:93-99`) is `path.resolve` plus a `startsWith` root check: no `realpath`, no extension check. `read`, `create`, `update`, `delete` (`server.ts:484-486, 517-523, 557-560, 587-589`) and render/export `output` (`:801`) all rely on it alone. `read` is annotated `readOnlyHint` (`:480`), which harnesses tend to auto-approve. Includes go through the kernel `HostEnv.readSource`, a bare `fs.readFile` (`:188-193`), and `stageMcpRoadmap` passes no `includePolicy` (`diagnostics.ts:202`), so core resolves includes unrooted. `specs/mcp.md:61,64` define these tools on "a local `.nowline` file", and `:100` calls the root sandbox "the real guard".
- Verified: ran the built `@nowline/mcp --root root/`. `read {path:".env"}` returned the file's token; `read {path:"link.nowline"}`, a symlink to `../outside/creds.txt`, returned the outside file; `render` with `include "/abs/outside/other.nowline"` and with `include "../outside/other.nowline"` drew the outside file's lane into the SVG. Includes can only read `.nowline` files (core enforces the extension); arbitrary contents leak through `read` and symlinks.
- Recommendation: require `.nowline` for `read`, `create`, `update`, `delete`, and a known export extension for `output`; `realpath` the target (and the parent for writes) before the root check; pass `includePolicy: { kind: 'rooted', root }` as the CLI's `--include-root` does. Tests for each.
- Status: fixed
- Resolution: lolay/nowline#253 (e1b2ef6)

### r1.f2 - MCP Streamable HTTP (`--port`) accepts any Host and Origin, so a web page can drive it by DNS rebinding

- Severity: high
- Dimension: security
- Kind: fix
- Location: `packages/mcp/src/http.ts:18` at a528705
- Evidence: the handler builds `NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })` and nothing else; the SDK (`@modelcontextprotocol/server` 2.3.1) defaults `enableDnsRebindingProtection` to false, and no `localhostHostValidation()` / `localhostOriginValidation()` guard is applied. Stateless mode needs no `initialize`. Used by `mcp/src/index.ts:111-113` and `nowline --mcp --port` (`cli/src/commands/mcp.ts:33-38`). `specs/mcp.md:174` promises localhost only; binding `127.0.0.1` doesn't stop a rebinding page.
- Verified: started `nowline --mcp --port 47812 --root r2` and sent one POST with `Host` and `Origin` set to `attacker.example`, calling `tools/call delete`: 200, and the file was deleted. A second reviewer read `.env` the same way.
- Recommendation: validate Host and Origin against localhost before `handleRequest`; a test that a foreign Host gets 403. Fix with r1.f1, since together they make any visited page a file reader and deleter.
- Status: fixed
- Resolution: lolay/nowline#252 (26caeaa)

### r1.f3 - HTML export writes the roadmap title into `aria-label` with text-only escaping

- Severity: high
- Dimension: security
- Kind: fix
- Location: `packages/export-html/src/index.ts:55` at a528705
- Evidence: `title` is `escapeText(...)` (`:38`, escapes `& < >` only) and is then interpolated into `aria-label="${title}"` (`:55`). `escapeAttr` exists in the same file (`:87`) and is used for `generator` but not here. DSL strings unescape `\"`. The same exporter serves the CLI, MCP `export` and the VS Code extension.
- Verified: `roadmap r "Demo\" onmouseover=\"alert(1)\" x=\""` exported with `-f html` produced `<main ... aria-label="Demo" onmouseover="alert(1)" x="">`; a reviewer's variant with `autofocus onfocus=` runs without a click.
- Recommendation: `escapeAttr` for the attribute, `escapeText` for `<title>`; a regression test with a quote in the title.
- Status: fixed
- Resolution: lolay/nowline#254 (7de617c)

### r1.f4 - `agent-verdict-apply` lets any commenter move the agent state machine with the maintainer PAT

- Severity: high
- Dimension: security
- Kind: fix
- Location: `.github/workflows/agent-verdict-apply.yml:146` at a528705
- Evidence: the workflow runs on every `issue_comment.created`, is "author-agnostic by design" (`:16`), and applies labels with `GH_AW_AGENT_TOKEN`, a write PAT (`.github/AGENT_TRIAGE.md:186`). Its transitions allow `""` to `agent-plan` (`:146`) and `agent-plan` to `agent-deep` (`:147`) on issues, and `""` to `maintainer-pr-safe` on PRs (`:141`). The resulting `labeled` event's actor is the PAT owner, so gh-aw's role gate (`agent-deep.lock.yml:1782`, admin/maintainer/write) passes. `.github/agent-prompts/agent-deep.md:24` accepts any comment starting `## Plan`, whoever wrote it. No workflow checks `author_association`.
- Verified: read the trigger, token, transition table and role gate; grep finds no author check in any workflow. A merge still needs a maintainer, so the impact is a bypass of the intake trust gate (`AGENT_TRIAGE.md:57`), attacker-directed Copilot sessions and PRs, quota use, and a false `maintainer-pr-safe` signal.
- Recommendation: act only when `comment.author_association` is OWNER, MEMBER or COLLABORATOR (or the commenter has write permission), plus the gh-aw and Copilot bot logins; in `agent-deep` and `agent-exec`, accept a `## Plan` comment only from the bot or a maintainer.
- Status: fixed
- Resolution: lolay/nowline#251 (36857e4)

### r1.f5 - `link:` accepts any URL scheme, and `javascript:` reaches `<a href>`

- Severity: medium
- Dimension: security
- Kind: fix
- Location: `packages/layout/src/nodes/item-measure.ts:186` at a528705
- Evidence: `dsl.md:319,1149` say `link` takes a URL, and the URL terminal is `https?://` (`nowline.langium:222`), but `PropertyAtom` also accepts `STRING` (`:208`), no validator checks `link`, `parseLinkIcon` passes any string through as `href` (`item-measure.ts:186-194`), and the renderer emits `<a href=…>` (`renderer/src/svg/item.ts:568-569`). That SVG is live DOM in the embed (`embed/src/auto-scan.ts:151`), the preview shell (`preview-shell/src/mount.ts:591`) and the HTML export. The logo sanitizer already rejects `javascript:` (`rendering.md:132`); item links don't.
- Verified: `link:"javascript:alert(document.domain)"` renders with no diagnostic to `<a href="javascript:…" rel="noopener" target="_blank">`. In headless Chromium, clicking it opened an `about:blank` popup and ran nothing (`target=_blank` plus `noopener`); Firefox and Safari untested. Re-rated from high: no script execution shown.
- Recommendation: a validator error for a `link` that isn't `http(s):` (optionally `mailto:`), and the renderer drops any other scheme as defence in depth.
- Status: fixed
- Resolution: lolay/nowline#257 (26eeb5a); `mailto:` is allowed too, quoted

### r1.f6 - Release jobs run mutable-tag actions and unpinned publish tools next to registry secrets

- Severity: medium
- Dimension: security
- Kind: fix
- Location: `.github/workflows/release.yml:278` at a528705
- Evidence: `softprops/action-gh-release@v3` (`:278`) runs in the job whose `lolay/homebrew-tap` checkout persists `HOMEBREW_TAP_TOKEN` into `.git/config` (`:207-216`, no `persist-credentials: false`). `oven-sh/setup-bun@v2` (`build.yml:132`) supplies the runtime baked into shipped binaries. `korthout/backport-action@v4` (`backport.yml:39`) runs with `contents: write`. `publish-vscode` runs `npx --yes @vscode/vsce` and `npx --yes ovsx` (`Makefile:349-350`) with `VSCE_PAT`/`OVSX_PAT` in a cell that never installs the lockfile (`release.yml:141-151, 189-195`); `ovsx` is declared nowhere. `Makefile:301` packs the shipped `.mcpb` with `@anthropic-ai/mcpb@latest`; `publish-mcp.yml:152-167` runs an unpinned `brew install mcp-publisher` beside `MCP_PRIVATE_KEY`.
- Verified: all locations read. SHA pins exist only in the generated gh-aw `.lock.yml` files; hand-written workflows tag-pin first-party actions too (`actions/checkout@v7` and others), which is lower risk.
- Recommendation: SHA-pin third-party actions (Renovate keeps digests current); `persist-credentials: false` on the tap checkout with the token passed only to the push; install the lockfile and run locked `vsce` plus a pinned `ovsx` devDependency; pin `mcpb` and `mcp-publisher`.
- Status: open

## hotspots

### r1.f7 - Every transient parse stays in Langium's shared index, so long-lived hosts leak a whole AST per render

- Severity: high
- Dimension: hotspots
- Kind: fix
- Location: `packages/mcp/src/diagnostics.ts:58` at a528705
- Evidence: each call builds a document on a fresh URI (`memory:///mcp-N` in `mcp/src/diagnostics.ts:58-66`, `stage-N` in `renderer/src/stage.ts:117-126`, `nowline-browser-N` in `browser/src/pipeline.ts:203-208`) with `DocumentBuilder.build([doc])` and never removes it; `IndexManager` keeps `symbolIndex[uri]` and `DocumentBuilder` keeps `buildState[uri]`, and the exported descriptions hold the AST, CST and text. No `IndexManager.remove` or `DocumentBuilder.update([], [uri])` exists in `src`. The browser path backs the VS Code preview on every debounced keystroke, the embed and the MCP App; the stdio MCP server leaks on every validate, render, export, create, update and share.
- Verified: with the built dists and `--expose-gc`, 220 MCP builds left `symbolIndex` and `buildState` at 220 entries; retained heap was 41 KB per call for `minimal.nowline` and 666 KB per call for `long.nowline`; `@nowline/browser` `renderSource` on `long.nowline` retained 657 KB per call.
- Recommendation: one core helper that builds a transient document and removes it from the index and build state afterwards, used by all three builders; a test that the index size stays constant across N renders.
- Status: open

### r1.f8 - The export scheduler ignores `after:<dated milestone>`, so XLSX and Mermaid wave-end dates disagree with the chart

- Severity: high
- Dimension: hotspots
- Kind: fix
- Location: `packages/layout/src/schedule.ts:236` at a528705
- Evidence: `scheduleRoadmap` pre-seeds only anchors before walking the lanes (`:191-201`); `milestoneEnd` is filled by the milestone loop after the lanes (`:431-442`), so `resolveAfterDay` returns day 0 for a dated milestone (`:236-239`). The chart's placement seeds dated milestones and anchors alike first (`phases/place.ts:122-129`). No sample has the shape, so `engine-divergences.json` stays empty; the date window misses the bar and `finalize.ts:170` extends the axis with a cause its own comment calls a bug.
- Verified: `roadmap r start:2026-01-05` with `item y duration:1w after:gate` and `milestone gate date:2026-03-02`: the chart draws `y` at Mar 2; the schedule gives 2026-01-12 and the XLSX Items sheet writes that. With waves, Mermaid emits `Build (wave end) :milestone, build, 2026-01-12` while the chart's wave ends Mar 9. Without waves, Mermaid's own `after gate` is right; XLSX is wrong in both.
- Recommendation: seed `milestoneEnd` with every dated milestone before the lane walks, in the main scope and `scheduleRegion`; an A=C regression for item, group and parallel `after:<dated milestone>`, with and without waves.
- Status: open

### r1.f9 - Mermaid export reuses one task id for repeated titles, so `after` chains resolve to the wrong task

- Severity: high
- Dimension: hotspots
- Kind: fix
- Location: `packages/export-mermaid/src/index.ts:448` at a528705
- Evidence: `taskIdOf` returns `item.name ?? slugify(displayLabel(item))` (`:448-450`, `slugify` `:587-594`; anchors `:187`, milestones `:405`) with no de-duplication, where core de-duplicates title slugs (`design`, `design-2`; `dsl.md:1136`). Mermaid's `ganttDb` keeps the last task per id. Every title with no ASCII letters slugs to `item`. Title-only items appear 13 times in `examples/` and `tests/`.
- Verified: `swimlane web` with `item "Design" 1w`, `item "Build" 1w` and `swimlane ios` with `item "Design" 4w` exports `Design :design` twice and `Build :build, after design` (from the lane cursor) twice; per upstream `ganttDb`, web's Build lands after iOS's 4-week Design (Feb 2), where the chart has Jan 12.
- Recommendation: a unique Mermaid id per entity per export (core's resolved key, or `-2`, `-3` suffixes reserved against explicit ids) used by tasks, end ids, anchors and milestones; a repeated-title test.
- Status: open

### r1.f10 - MCP `render` with `review:true` returns the review prompt without the raster for PNG at 1024 px or less

- Severity: medium
- Dimension: hotspots
- Kind: fix
- Location: `packages/mcp/src/server.ts:1566` at a528705
- Evidence: for `format:'png'` and `width <= REVIEW_MAX_WIDTH`, `inspectionBytes = artifactBytes`, and the image is pushed only when the format isn't PNG or the lengths differ (`:1545-1572`), assuming the artifact PNG is already in the content; the `output` branch and the MCP Apps branch (`:799-837`) leave it out.
- Verified: `render {format:"png", review:true, output:"out.png", width:800}` returned text blocks including "Review this raster…" and no image; without `output`, or as SVG, the image is attached. Needs an explicit width; the default 1280 takes a separate render.
- Recommendation: skip the image only when the artifact PNG itself is in the returned content; regression tests for the `output` and apps cases.
- Status: open

### r1.f11 - Mermaid task names aren't protected from the gantt lexer's keyword, date and comment rules

- Severity: medium
- Dimension: hotspots
- Kind: fix
- Location: `packages/export-mermaid/src/index.ts:600` at a528705
- Evidence: `escapeTaskName` (`:600-603`, used at `:188, 253, 394, 418`) strips only newlines, `:` and `,`. Mermaid's `gantt.jison` is case-insensitive and first-match, and its `section`, `title`, `includes`/`excludes`, `call`, `click`, leading-date and comment rules all precede task text.
- Verified: the CLI emits `Section 508 audit :a11y, …`, `Title IX training …`, `5% canary …` and `Call center migration …` unchanged; per the grammar, the first becomes a section (the task vanishes and `after a11y` falls back), the second replaces the title, the third is a comment, and `call` breaks the parse. No test runs a Mermaid parser.
- Recommendation: entity-escape the first character (or prefix a zero-width space) when a name matches a keyword, a date or `^.%`; write `%`, `:`, `,` as entities instead of dropping them; a test against the real gantt parser.
- Status: open

### r1.f12 - `nowline x.nowline -f nowline` overwrites its input in place and drops the comments

- Severity: medium
- Dimension: hotspots
- Kind: decision
- Location: `packages/cli/src/cli/output-path.ts:23` at a528705
- Evidence: the default output is `<cwd>/<input-base>.<ext>` (`output-path.ts:23-31`, `commands/render.ts:87-94, 150-155`), which is the input itself when run from its directory; the printer drops comments (AGENTS.md "modulo comment loss"). `cli.md:367` allows silent overwrite in general but doesn't consider output equal to input.
- Verified: a file with a leading and a trailing `//` comment, run as `nowline rm.nowline -f nowline` from its directory, exits 0 and is rewritten without either comment.
- Recommendation: options: (1) exit 2 when the default output resolves to the input's real path, for every format; (2) send `-f nowline` to stdout by default; (3) keep comments in the printer. Recommend (1).
- Status: open

### r1.f13 - The `scale` block's `label:` and `name:` are specified and used in examples, but layout ignores them

- Severity: medium
- Dimension: hotspots
- Kind: decision
- Location: `packages/layout/src/view-preset.ts:113` at a528705
- Evidence: `dsl.md:811-818` specifies `label: "Sprint {n}"` (`{n}` is the column index) and `name:`. `resolveScale` reads only `label-every` (`:113-125`) and `formatTickLabel` ignores its index (`:655`); history shows `{n}` was never implemented. `examples/long.nowline:5-8`, `examples/product.nowline`, `examples/nested.nowline` and `tests/grammar-properties.nowline` declare `label: "W{n}"`. The validator accepts the keys silently.
- Verified: rendering `examples/long.nowline` draws date labels (Jan 05, Feb 02) with no warning.
- Recommendation: options: implement `label`/`name` in all three tick paths, or remove them from `dsl.md` and the examples and warn that the key has no effect. Recommend remove and warn unless a consumer needs sprint labels.
- Status: open

### r1.f14 - Mermaid and MS Project exports honour `after:` references the chart ignores

- Severity: medium
- Dimension: hotspots
- Kind: decision
- Location: `packages/export-mermaid/src/index.ts:407` at a528705
- Evidence: layout and the export scheduler ignore an `after:` on a floating milestone or to a milestone declared later (`schedule.ts:310-318` resolves in declaration order, lanes before milestones); `dsl.md:1371` (WV12) records this but warns only in roadmaps with waves. Mermaid (`:389, 407-412`) and MS Project (`export-msproj/src/index.ts:254, 416, 455-463`) link those references anyway.
- Verified: `item z 1w after:m2`, `milestone m1 after:m2`, `milestone m2 after:x` (x 2w): chart and XLSX put z and m1 on Jan 5; Mermaid's `after m2` and MS Project's predecessor on M2 put them on Jan 19. No diagnostic without waves.
- Recommendation: options: (a) the export scheduler exposes which `after:` terms it resolved, exporters write only those and count the rest as lossy, and WV12 warns outside waves too; (b) schedule milestones in dependency order, interleaved with lanes. Recommend (a) now, (b) only if authors need it.
- Status: open

## contracts

### r1.f15 - `nowline --mcp --root` isn't the same server as `npx @nowline/mcp --root`

- Severity: high
- Dimension: contracts
- Kind: fix
- Location: `packages/cli/src/commands/mcp.ts:34` at a528705
- Evidence: the CLI calls `createMcpServer({ allowedRoot: root })` (`:34, :49`) with its own copy of the transport, port and signal glue (`:20-54` beside `mcp/src/index.ts:42-125`). The npx entry passes `rootConfigured` and `version` (`index.ts:100-104`). `rootConfigured` defaults to false (`server.ts:257`) and decides the delivery default (`:1036-1041`), so binary exports come back inline instead of being saved to the root, against the tool's own description (`:880-882`) and `mcp.md:72, 78, 122` (Claude Desktop drops inline binaries). `serverInfo.version` falls back to the literal `'0.6.0'` (`:261`). `--mcp-install` registers this variant by default (`mcp-install.ts:65`, `server-command.ts:60`).
- Verified: same root, `export {format:"pdf"}`: `nowline --mcp --root` reported version 0.6.0 and returned inline bytes with no file; `@nowline/mcp --root` reported 0.12.0 and wrote `r.pdf`.
- Recommendation: one `startMcpServer({ root, port, version })` exported by `@nowline/mcp` and called by both entries; version read from package.json; a parity test that `--mcp --root` PDF export writes a file.
- Status: open

### r1.f16 - VS Code Save, Copy PNG fallback and Export… don't render what the preview shows

- Severity: high
- Dimension: contracts
- Kind: fix
- Location: `packages/vscode-extension/src/preview/preview-panel.ts:272` at a528705
- Evidence: the preview resolves options once (`option-resolver.ts:127-170`: theme toolbar/setting, then `.nowlinerc`, then editor; locale setting, then rc, then VS Code; now with the timezone setting). The export paths use hand-written copies instead: `resolvedTheme()` (`preview-panel.ts:272-281`), `resolveThemeForExport` (`extension.ts:301-313`) and `resolveThemeQuick` (`:423-428`) never read the rc; `resolvedLocale()` (`:303-309`) skips it; `resolvedToday()` (`:290-291`) drops `settings.timezone`. `handleCopyPngFallback` (`extension.ts:528-538`) passes no `assetRoot`, which 5da7d2a added to Save and Export only. `exportInProcess` reads the file from disk (`in-process.ts:138`) while the preview renders the live buffer (`preview-panel.ts:368-372`). `extension.ts:466-467` and `surface-options.md:135` promise the preview's options.
- Verified: all four parts read in code. With rc `theme: dark`, setting `auto` and a light editor, the preview is dark and saved files are light; a `+14:00` timezone moves the preview's today but not the saved file's; unsaved edits save stale content and an untitled document fails. No test covers export theme or locale.
- Recommendation: keep the text and `ResolvedRenderOptions` from the last `refreshNow()` and use them for Save, the copy fallback and Export… with a preview open, passing the text to the kernel; without a preview, call `resolvePreviewOptions` with the rc layer; delete the if-chains; extend `surface-parity.test.ts`.
- Status: open

### r1.f17 - PNG default scale is documented as 1 but renders at 2, and VS Code's two export paths disagree

- Severity: medium
- Dimension: contracts
- Kind: fix
- Location: `packages/export/src/index.ts:522` at a528705
- Evidence: the kernel uses `inputs.pngScale ?? 2` (also `export-png/src/index.ts:117`); the CLI passes `parseScale(args.scale)`, undefined without the flag (`cli/src/commands/render.ts:312`). `specs/cli.md:101`, `man/nowline.1:327-328` and `help.ts:76` say 1. VS Code's `nowline.export.png.scale` defaults to 1: the in-process path passes it (`in-process.ts:156`), the external-CLI path omits `--scale` when it's 1 (`cli-runner.ts:359-360`) and gets 2.
- Verified: default CLI PNG is 496 px wide for a 248 px SVG. Re-rated from high: a larger PNG than documented, nothing lost.
- Recommendation: one default (1 is documented) set in the kernel or `render.ts`, or change the docs and the setting to 2; `buildCliArgs` always passes `--scale`; a CLI test on the IHDR width with no flag.
- Status: open

### r1.f18 - VS Code Copy SVG copies the font-pinned preview SVG, not the canonical export

- Severity: medium
- Dimension: contracts
- Kind: fix
- Location: `packages/preview-shell/src/mount.ts:1054` at a528705
- Evidence: `copy-svg` writes `state.svgString` (the preview render) through `navigator.clipboard` (`:1054-1056`) without involving the host (`webview/entry.ts:106-113`). The preview pins `fontFamilies` to plain `DejaVu Sans` (`render-pipeline.ts:80-84, 121-124`); the kernel emits the portable `FONT_STACK`. `ide.md:220` and `export-determinism.md:244` say Copy SVG equals `nowline -f svg` and goes through `env.clipboard`; Save SVG already re-renders through the kernel for this reason (`extension.ts:494-499`).
- Verified: code read end to end. The pasted SVG falls back to the user agent's default font and no longer fits the laid-out widths. Re-rated from high.
- Recommendation: an `onCopySvg` host hook in preview-shell like `onCopyPng`; the extension exports through the kernel and writes with `vscode.env.clipboard.writeText`; a regression test.
- Status: open

### r1.f19 - The GitHub Action's markdown mode renders from the temp directory and always forces the theme

- Severity: medium
- Dimension: contracts
- Kind: fix
- Location: `packages/nowline-action/src/markdown-mode.ts:143` at a528705
- Evidence: each block is written to `os.tmpdir()` and rendered there (`:143-153`); the CLI looks for `.nowlinerc` from the input's directory (`cli/src/commands/render.ts:545-549`), so the repo's rc never applies (file mode does), and relative `include` and `logo:` paths resolve under `/tmp`, failing with NL.E0203, though `embed.md:234` sends multi-file users to the Action. `buildRenderArgs` always passes `-t` (`cli.ts:66-72`), default `light` (`action.yml:35`, `inputs.ts:53`), overriding an rc theme, while `non-working` and `now` are passed only when set. `embed.md:332-335` lacks the `now` and `args` inputs.
- Verified: code paths read on both sides.
- Recommendation: render each block with the markdown file's directory as the base (temp file there, or stdin with that `cwd`); pass `-t` only when `theme` is given; add `now` and `args` to `embed.md`.
- Status: open

### r1.f20 - CLI spec, man page and `--help` have drifted from the implemented CLI

- Severity: medium
- Dimension: contracts
- Kind: fix
- Location: `specs/cli.md:22` at a528705
- Evidence: `cli.md:22` (`npm install -g nowline`) and `:503` (`npx nowline`) name an unscoped package this repo never publishes (`Makefile:337-344`; `README.md:175` uses `@nowline/cli`). `--template` exists (`cli/args.ts:183`, `commands/init.ts:28, 62`) but isn't in `cli.md`, `nowline.1` or `--help`. `cli.md:460` says `.nowlinerc` is found from the current directory; the code walks up from the input's directory (`nowline.1:545` is right). A bad `--mcp --port` throws a plain `Error` (`commands/mcp.ts:28`). The `-f` list (`cli.md:48`) omits `json` and `nowline`.
- Verified: each part reproduced: `--mcp --port abc` prints a stack trace and exits 1 (the exit table says 2); `--start notadate` exits 0 for svg and 3 for msproj.
- Recommendation: fix the package name; document `--template` in all three places; fix the rc text; throw `CliError` with `InputError` for `--port`; validate `--start` in `resolveCliOptions` like the other flags; complete the `-f` list.
- Status: open

### r1.f21 - VS Code Export ignores the export-only `.nowlinerc` keys `ide.md` says it reads

- Severity: medium
- Dimension: contracts
- Kind: decision
- Location: `packages/vscode-extension/src/extension.ts:393` at a528705
- Evidence: `ide.md:140-147, 193` and the `nowline.ignoreRcFile` description say Export reads rc `pdfPageSize`, `pdfOrientation`, `pdfMargin`, `fontSans`, `fontMono`, `headlessFonts` and pre-selects `defaultFormat`. `readExportSettings` reads only `nowline.export.*` (`:393-407`); `exportInProcess` (`in-process.ts:144-170`) and `buildCliArgs` never read the rc, and `buildCliArgs` always passes `--page-size <setting>` (`cli-runner.ts:345`), shadowing the rc even on the CLI path; `pickExportTarget` (`cli-runner.ts:264-276`) has no default; orientation and margin are parsed by local helpers that drop bad values silently (`in-process.ts:185-200`) where the CLI exits 2. The export option specs live in the CLI (`cli/src/cli/options.ts:67-77`), which the extension can't import.
- Verified: grep of the extension finds no rc read of those keys. One reviewer's claim that rc theme and locale apply when a preview is open is false (see r1.f16).
- Recommendation: options: implement (move the export-only specs into `@nowline/config` beside `SURFACE_OPTION_SPECS` and resolve settings, read through `inspect` so untouched defaults count as unset, over the rc layer), or narrow `ide.md` and the `ignoreRcFile` text to what's read. Recommend implementing.
- Status: open

### r1.f22 - The font-resolution contract is stale and partly undocumented

- Severity: medium
- Dimension: contracts
- Kind: decision
- Location: `specs/cli.md:137` at a528705
- Evidence: the resolver is bundled-first and probes system fonts only with `useSystemFonts` (`export-core/src/fonts/resolve.ts:100-137, 180-186`), but `cli.md:137`, `nowline.1:426` and the `nowline.export.fonts.sans` description say "platform probe → bundled DejaVu fallback". `--use-system-fonts` is in `--help` but missing from the options lists of `cli.md` and `nowline.1` (only their rc tables). `NOWLINE_FONT_SANS`, `NOWLINE_FONT_MONO`, `NOWLINE_HEADLESS` and the CI-without-TTY headless rule are documented only in `export-core/README.md:74` and the m2c handoff; `cli.md:488` calls locale "the one environment input". The env step runs before `headless`, so it overrides MCP's `resolveFonts({ headless: true })` (`mcp/src/server.ts:977`), against `export-determinism.md`'s bundled fonts on every surface. rc `fontSans` merges into the flag layer (`cli/src/cli/options.ts:145, 168`), so rc beats env, where `specs/handoffs/m2c.md:273` says flag, env, rc.
- Verified: each statement checked against the resolver and the docs. Env over MCP headless may be an intended operator override, which is part of the decision.
- Recommendation: decide the precedence (and whether `headless` beats env for MCP's canonical exports), then document env vars, the CI rule and `--use-system-fonts` in `cli.md` and both `nowline.1` pages, and fix the default text. Recommend keeping the env step, making `headless: true` win, and documenting it.
- Status: open

## architecture

### r1.f23 - The export kernel isn't browser-safe for five of its eight formats, and the browser gate tests only the other three

- Severity: medium
- Dimension: architecture
- Kind: decision
- Location: `packages/export-core/src/fonts/bundled.ts:47` at a528705
- Evidence: export-core's main entry re-exports the Node font resolver (`index.ts:10-34`); `bundled.ts` imports `node:path`/`node:url` (`:17-18`) and calls `path.join` at module load (`:41, 47-48`); `resolve.ts:28` imports `node:fs`. export-html, -mermaid, -msproj, -xlsx and -pdf import runtime values from that entry; `export-xlsx/src/index.ts:104` calls `Buffer.isBuffer` unguarded; `export-msproj/src/index.ts:205` falls back to `process.stderr.write`; `export-pdf/src/index.ts:36` imports `node:stream`. export-png imports lazily for the browser (`:156-163`). The browser determinism leg covers json, svg and png (`integration-tests/determinism/spec.ts:61`), justified for pdf and xlsx only. `architecture.md:107` and `export-determinism.md` (Surfaces) promise a runtime-agnostic kernel used by web apps in the browser.
- Verified: bundling export-html, -mermaid, -msproj and -xlsx with esbuild `--platform=browser` fails on `node:path`, `node:url` and `node:fs`.
- Recommendation: options: (a) make html, mermaid, msproj and xlsx browser-safe (Node resolver behind a `./fonts/node` subpath, guard `Buffer` and `process`, add them to `BROWSER_FORMATS`) and decide pdf separately; (b) document browser support as json, svg and png only. Recommend (a).
- Status: open

### r1.f24 - `architecture.md` still prescribes the retired embed CDN and a nowline-to-infra deploy dependency

- Severity: medium
- Dimension: architecture
- Kind: fix
- Location: `specs/architecture.md:12` at a528705
- Evidence: `:12` (the `nowline-embed-{prod,dev}` projects, `release.yml` consuming infra WIF outputs via environment variables), `:22` (Dependency Rule), `:140` (Firebase Hosting CDN row) and `:172` (Firebase serves `embed.nowline.io`/`.dev`). `embed.md:192` records the move to jsDelivr; `AGENTS.md` says there's no remaining tie to nowline-infra and no GitHub variables; no workflow references Firebase or WIF.
- Verified: all four passages read; grep of `.github/` finds no Firebase or WIF use. Someone following this spec would re-add the coupling AGENTS.md prohibits.
- Recommendation: rewrite the four passages to match `embed.md` § Distribution and drop the infra/WIF text; remove the dead `publish-cdn` Makefile target while there.
- Status: open

### r1.f25 - `architecture.md`'s package graph and descriptions have drifted from the code

- Severity: medium
- Dimension: architecture
- Kind: fix
- Location: `specs/architecture.md:65` at a528705
- Evidence: the graph (`:65-93`) omits `@nowline/config`, `@nowline/share-link` and `@nowline/preview`, and draws the renderer under layout only (`:101` says it uses core). preview-shell is "standalone, no engine deps" (`:86`) but declares `@nowline/browser` and `@nowline/layout` as dependencies (type-only imports). mcp "optionally" depends on browser and preview-shell (`:88`); they're hard deps, beside preview, config, share-link, export-core and layout. The CLI "wraps every exporter" (`:92, :116`) but imports none directly and depends on mcp and config. embed "consumes core + layout + renderer" (`:119`) but imports browser and share-link. The Action "couples loosely" through the CLI (`:120`) but bundles `@nowline/layout` (`nowline-action/src/inputs.ts:2`). Stale: `pnpm@9` (`:133`, the repo pins 12.11.2), ~55 MB and ~70 MB binary in the same spec; `export-determinism.md:89, 113` still describe finished work as future.
- Verified: every claim checked against package.json and imports. `:95` "enforced by package.json declarations" is half true: pnpm's strict linking rejects undeclared imports (none found), but the declarations don't match the drawn graph.
- Recommendation: replace the graph with the one drawn from the code (the summary's Architecture section), fix the descriptions and version text, and add a declared-versus-imported check to `make lint` (see r1.f33).
- Status: open

## duplication

### r1.f26 - The asset-root guard is copied five times, lexical only, and untested

- Severity: medium
- Dimension: duplication
- Kind: fix
- Location: `packages/cli/src/commands/render.ts:362` at a528705
- Evidence: "escapes asset-root" appears in `cli/src/commands/render.ts:362` and `:610` (`--serve`), `mcp/src/server.ts:195`, `vscode-extension/src/export/in-process.ts:59` and `vscode-extension/src/preview/render-pipeline.ts:142` (whose comment says it was copied from the CLI); `guessMime` three times (`render.ts:620`, `render-pipeline.ts:155`, `export/src/index.ts:211`) beside the kernel's `hostAssetResolver` (`export/src/index.ts:220`). Each copy checks `startsWith(root + sep)` on `path.resolve`, without `realpath`; includes use a rooted policy that does resolve real paths (`include-resolver.ts:262-272`). No test asserts a refusal (`render-asset-root.test.ts` only checks which root is picked).
- Verified: `logo:"../out/secret.png"` is refused, but `logo:"logo.png"` symlinked to the same outside file was embedded as a data URI with exit 0. Only files the logo loader accepts can leak, so the weight is the duplication and the missing tests.
- Recommendation: one Node `readAssetUnder(root)` that resolves real paths, in a Node-only subpath, used by every surface through `hostAssetResolver`; tests refusing `../x`, an absolute path, a sibling with the root as prefix and a symlink out, and accepting `sub/x`.
- Status: open

## tests

### r1.f27 - The round-trip test checks that printing is stable, not faithful, and covers 7 of 25 examples

- Severity: medium
- Dimension: tests
- Kind: fix
- Location: `packages/cli/test/convert/roundtrip.test.ts:10` at a528705
- Evidence: `EXAMPLES` (`:10-18`) lists 7 files; `examples/` holds 25. Both tests start from `canonical = print(parse(original))` (`:45, :59`) and compare to that, never to the original's AST, so a printer that drops a property is idempotent and passes. `AGENTS.md` says every `examples/` file must round-trip.
- Verified: a printer patched to drop every `capacity:` passes both tests on `capacity.nowline`. An AST fidelity check run in scratch passes today on all 25 examples and 39 `tests/` fixtures (differences: property order, `labels:[x]` printed as `labels:x`).
- Recommendation: glob `examples/**/*.nowline` and `tests/*.nowline`; add a check that the original's AST equals the printed text's AST, positions stripped and those two normalizations applied.
- Status: open

### r1.f28 - `scripts/changelog.py` has had no tests since #133

- Severity: medium
- Dimension: tests
- Kind: fix
- Location: `scripts/changelog.py:194` at a528705
- Evidence: 0f5982e deleted `release-changelog.test.ts` (23 assertions) and added `changelog.py` (now 382 lines: the required `Changelog` check, the release cut that folds and deletes fragments, the GitHub Release text) without tests. `scripts/test/release-cut.test.mjs:105-117` checks exit codes, a clean tree, the subject and that fragments are gone, never that their text lands under the new heading.
- Verified: if `render()` yields nothing, `release()` writes an empty `## [vX.Y.Z]` heading with a note, deletes the fragments and exits 0. `check` and `release_notes` have no tests.
- Recommendation: assert both changelogs gain the version heading with the fragment entry and that `make release-notes` prints it; unit tests for `check` (bad fragment, in-place edit versus new entry, `--require`).
- Status: open

### r1.f29 - The VS Code export and GitHub Action bundles are never run on the paths users hit

- Severity: medium
- Dimension: tests
- Kind: fix
- Location: `packages/vscode-extension/scripts/smoke-extension.mjs:160` at a528705
- Evidence: the extension smoke loads `dist/extension.cjs`, calls `activate` and checks command ids (`:160, 167`); PDF/PNG export needs `resvg.wasm`, pdfkit's `.afm` data and fonts copied by `bundle.mjs`, and a missing copy already shipped once (d42a13d) with no regression check. `_resetWasmInit` (`in-process.ts:45-48`) is an unused test seam; `buildCliArgs` is untested. The Action's pack cell only runs `test -s dist/index.cjs` (`build.yml:302`); its tests import `src/` with the CLI mocked, while the bundle is CJS built from ESM-only deps that Renovate auto-merges. `mcp/scripts/verify-mcpb-staging.mjs` already shows the pattern.
- Verified: no test references either bundle beyond loading it.
- Recommendation: extend the extension smoke to export PDF and PNG through the bundled command and check magic bytes; an Action smoke running `node dist/index.cjs` with `INPUT_*` set and a `nowline` shim on `PATH`.
- Status: open

### r1.f30 - Two regression gates pass silently when their baseline or subject is missing

- Severity: medium
- Dimension: tests
- Kind: fix
- Location: `packages/integration-tests/test/snapshot.test.ts:25` at a528705
- Evidence: a missing snapshot baseline is written and the test returns (`:25-27`), in CI too, so a sample added without its `.svg` or a deleted baseline is never compared. The determinism binary leg is `describe.skipIf(!binary)` (`determinism.node.test.ts:154`), and `cliBinaryPath()` keeps its own platform-suffix map (`cli-surface.ts:31-50`) apart from `compile.mjs:31-58`; if they drift, the leg skips and the gate stays green, though `cli-surface.ts:7-8` says it's never skipped in CI.
- Verified: no CI guard on either path; `make determinism` sets nothing that requires the binary.
- Recommendation: fail on a missing baseline when `CI` is set; fail instead of skipping the binary leg when `CI` (or a `REQUIRE_CLI_BINARY=1` set by the make target) is present.
- Status: open

## dependencies

### r1.f31 - A vulnerable zod ships in the MCP bundles, and nothing refreshes transitive versions

- Severity: medium
- Dimension: dependencies
- Kind: fix
- Location: `pnpm-lock.yaml:3894` at a528705
- Evidence: `@modelcontextprotocol/{client,core,server}@2.3.1` accept `zod ^4.2.0` but are locked to 4.6.5 (`:3894, 3898, 3981`), which has GHSA-mrhx-c7xc-m3w5 (high, memory exhaustion, fixed in 4.6.6); the SDK validates every inbound JSON-RPC message with it, including on `--port`. `bundle-server.mjs:6` inlines it into the `.mcpb` and `bun compile` into `nowline --mcp`. `undici` 6.29.0 (`:3595`) with GHSA-2m5v-pch6-74hx is bundled into the Action. `.github/renovate-shared.json` has no `lockFileMaintenance`, and no make target audits.
- Verified: the advisories confirmed through npm's bulk advisory API. The Action makes no HTTP calls, so undici isn't reachable; zod is.
- Recommendation: `pnpm update zod undici -r` (or `pnpm dedupe`) now; weekly `lockFileMaintenance`; a `make audit` (`pnpm audit --prod --audit-level high`) in `make ci`.
- Status: open

### r1.f32 - The CI gate cell floats Node while release uses the `.nvmrc` pin, and the version text disagrees

- Severity: low
- Dimension: dependencies
- Kind: fix
- Location: `.github/workflows/ci.yml:172` at a528705
- Evidence: build-test passes `'26'` and `'22'` (`:172-174, 182-184`), overriding the composite action's exact `.nvmrc` pin (`setup-node-pnpm/action.yml:22-29, 49-53`) that every other job, including release, uses. Published `engines.node: ">=22"` sits over `@babel/code-frame@8.0.6`, which declares `^22.18.0 || >=24.11.0`. pnpm is `pnpm@9` in `architecture.md:133`, `12.10.1` in `CONTRIBUTING.md:40, 69` and `12.11.2` in `package.json:4`.
- Verified: floating Node 26 in CI is documented policy (`CONTRIBUTING.md:39`); only the composite action's comment contradicts it. On Node 22.0 to 22.17 the effect is cosmetic. Re-rated to low.
- Recommendation: decide whether the gate should run the pin; raise the floor to `>=22.18` now or at the Node 22 EOL bump; replace version literals in the docs with pointers or assert them in `scripts/test/toolchain-floors.test.mjs`.
- Status: open

### r1.f33 - Published packages declare runtime dependencies they never import

- Severity: low
- Dimension: dependencies
- Kind: fix
- Location: `packages/cli/package.json:46` at a528705
- Evidence: `@nowline/cli` lists `@clack/prompts`, `citty`, `consola` and `js-yaml` (`:46, 62-64`), unused since 4d826e8 and 41c75be. Also unused: `d3-time` (layout), `vscode-languageserver-textdocument` (lsp), `@nowline/core` (lsp-worker), core, renderer and langium (embed), `remark-stringify` and `unist-util-visit` (Action). `@nowline/mcp` runs `tsc` without declaring `typescript`.
- Verified: grep of each package's `src`, `scripts` and `bin`. The redundant `@nowline/export-*` declarations in the CLI and extension are harmless; the Action is private. The cost is four packages on every global install. Re-rated to low.
- Recommendation: remove them; add knip or depcheck to `make lint`, which also keeps `architecture.md`'s graph honest (r1.f25).
- Status: open
