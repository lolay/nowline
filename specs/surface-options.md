# Nowline — Shared Surface Options and One Staging Function

**Status: Proposed (design only, no code yet).** Proposed milestone ID: **m4.13** (not yet entered in [`milestones.md`](./milestones.md)). This is refactor R4 from [`review-since-v086.md`](./review-since-v086.md): one options schema in `@nowline/config` that every render surface reads, and one staging function (parse, resolve includes, load assets, lay out) that every pipeline calls. Every `file:line` below was checked at the commit that adds this spec (source identical to 0062df3 plus the m2 fixes of the same review).

## 1. Problem

[`architecture.md`](./architecture.md) says every surface reaches artifacts through `@nowline/export`, and [`export-determinism.md`](./export-determinism.md) makes byte-identical output across surfaces a hard precedent. Both hold for the export kernel's own inputs. They do not hold for how a surface turns flags, settings and `.nowlinerc` into those inputs, or for the four pipelines that stage a roadmap outside the kernel.

### 1.1 Each surface resolves options its own way

The m2 fixes of this review already moved MCP's `theme` and `pageSize` onto the CLI's normalizers (`normalizeThemeName`, `parsePageSize`, `NON_WORKING_DISPLAYS`) and made a malformed `.nowlinerc` a usage error. What remains:

| Option | CLI render | CLI `--serve` | MCP | VS Code extension |
|---|---|---|---|---|
| theme | flag > rc > `light`; bad rc value is exit 2 (`cli/src/cli/theme.ts:30-41`) | same (`serve.ts:75`) | arg > `light` via its own `parseThemeArg` (`mcp/src/diagnostics.ts:276-285`) | toolbar / setting > rc > editor light or dark; bad rc value silently ignored (`preview/option-resolver.ts:71-88`) |
| width | flag > rc, integer ≥ 320 else exit 2 (`render.ts:677-688`) | **ignored**: never passed to layout (`serve.ts:172-178`) | `z.number()`, any number (`mcp/src/server.ts:636-641`) | setting > rc, any positive number (`option-resolver.ts:176-182`) |
| now (no flag) | local civil date, `--timezone` (`render.ts:555-578`) | local, a copy of that function (`serve.ts:275-296`) | **UTC** (`server.ts:197-207`, and `:383` for validate insights) | local, setting timezone (`option-resolver.ts:117-160`; `export/in-process.ts:136-139`) |
| page size | flag > rc `pdfPageSize` (`render.ts:626-641`) | n/a | its own `parsePageSizeArg` (`mcp/src/diagnostics.ts:293-305`) | `nowline.export.*` settings |
| non-working | flag only (`render.ts:131`) | flag (`serve.ts:76`) | `z.enum(NON_WORKING_DISPLAYS)` (`server.ts:582-589`) | toolbar / setting (`option-resolver.ts:195-201`) |
| `--no-links`, `--strict` | passed to the kernel (`render.ts:293-294`) | **ignored**: `renderSvg` gets neither (`serve.ts:179`) | not offered | settings |
| asset root | flag only | flag | file's directory | setting > rc `assetRoot` (`option-resolver.ts:209-214`), a key the CLI does not read ([`cli.md`](./cli.md) `.nowlinerc` table, `:389-402`) |

So a `.nowlinerc` with `width: 300` fails the CLI, is passed to layout by the VS Code preview, and is ignored by `--serve`; a roadmap with no `start:` rendered through MCP at 17:00 in San Francisco starts on tomorrow's date, because the default start is the now-line date (`layout.ts:1381`).

### 1.2 The `.nowlinerc` merge is per field

`renderHandler` resolves each rc-backed setting by hand (`packages/cli/src/commands/render.ts:127-151`), through `pickSetting` (`:602-612`), `stringFromConfig` / `boolFromConfig` (`:662-675`) and one parser per key (`:614-688`), and `--serve` repeats the subset it remembers (`serve.ts:74-84`). `@nowline/config` exports a generic `mergeConfig` (`packages/config/src/load-config.ts:91-98`) that nothing calls, and its `NowlineRc` type (`:10-25`) lists keys with loose types (`theme?: string`, an open index signature) and no validation. Each new rc key is a change in two or three places, and a forgotten one is how `--serve` lost `width`.

### 1.3 Four pipelines stage a roadmap

The staging steps (parse and validate, resolve includes with the include-error precedence of [`waves.md`](./waves.md) §6.1, load the logo, lay out) are written four times:

| Pipeline | Location | Gaps |
|---|---|---|
| export kernel `stageDocument` | `packages/export/src/index.ts:250-359` | renders an SVG even for XLSX, Mermaid and MS Project |
| browser `renderSource` | `packages/browser/src/pipeline.ts:234-346` | — |
| CLI `--serve` `rebuild` | `packages/cli/src/commands/serve.ts:103-197` | no width, links or strict; its own include-error report |
| MCP `collectMcpLayoutInsights` | `packages/mcp/src/diagnostics.ts:192-227` | **no logo**: insights come from a layout whose header differs from the rendered one |

#144 (logo rendering) shows the cost: its pre-layout step (`roadmapLogoRef`, then `loadLogo`, then `LayoutOptions.logo`) had to be copied into the kernel (`export/src/index.ts:308-310`), the browser pipeline (`pipeline.ts:306-308`) and `--serve` (`serve.ts:171`), and MCP's insights were missed.

### 1.4 The same work runs more than once

- **The logo is read twice per render, three times per raster export.** `loadLogo` reads the file to measure it (`packages/renderer/src/logo.ts:46-48`); `renderSvg` reads it again to embed it (`embedLogo`, `packages/renderer/src/svg/render.ts:2337-2346`); the kernel's PNG and PDF paths render a second, font-pinned SVG (`export/src/index.ts:327-341`, `:455`, `:470`), which reads it a third time.
- **An MCP `render` call parses twice and resolves and lays out twice.** `diagnosticsErrorBlock` parses and validates (`server.ts:694`), `exportDocument` parses again, resolves and lays out (`:721`), and `collectMcpLayoutInsights` reuses the first parse (`doc: blocked.doc`, `:747`) but resolves includes and lays out a second time (`:738-749`, `diagnostics.ts:201-221`). `export` parses twice too (`:934`, `:958`) and collects no insights.
- **A CLI render parses twice.** `produce` validates first so diagnostics come out in the operator's locale, and the kernel re-parses ("double work accepted", `render.ts:266-271`).

## 2. Goals and non-goals

**Goals**

1. One options schema in `@nowline/config` for theme, width, now, page size and non-working display: what each accepts, how it is parsed, and its rc key. One `.nowlinerc` merge that replaces the CLI's per-field code.
2. The CLI, `--serve`, MCP and the VS Code extension resolve those options through the schema; each keeps its own sources (flags, tool arguments, settings) and its own error wording.
3. One staging function used by the export kernel, the browser pipeline, `--serve` and MCP layout insights.
4. `--serve` honours `--width`, `--no-links` and `--strict`; the logo is read once per render; MCP insights see the same layout as the render.
5. Every step renders every `examples/` and `tests/*.nowline` sample byte-identically.

**Non-goals**

- New options, new rc keys (except as open question 5 decides), or new flags.
- Changing any error message's text. The schema returns structured errors; each surface formats them with today's templates.
- Changing the kernel's `RenderInputs` contract (`export/src/index.ts:92-165`) or the `HostEnv` seam. Staging sits behind it.
- Moving the VS Code extension's toolbar and settings precedence. It keeps "toolbar, then setting, then rc, then editor theme"; only the rc parsing moves.
- Schedule or layout changes (R1, R2).

## 3. Design

### 3.1 The options schema (`@nowline/config`)

A new `packages/config/src/surface-options.ts` describes each shared option once:

```ts
export type SurfaceOptionKey = 'theme' | 'width' | 'now' | 'pageSize' | 'nonWorking';

export interface SurfaceOptions {
    theme: ThemeName;
    /** Integer ≥ 320; undefined fits the content. */
    width?: number;
    /** The now-line date (UTC midnight); undefined suppresses it. */
    today?: Date;
    pageSize?: PdfPageSize;
    /** Undefined lets the file's `default roadmap non-working:` key apply. */
    nonWorking?: NonWorkingDisplay;
}

/** Where a raw value came from: what an error must name. */
export type OptionSource =
    | { kind: 'flag'; name: string }        // --width
    | { kind: 'rc'; key: string }           // .nowlinerc width
    | { kind: 'argument'; name: string }    // MCP width
    | { kind: 'setting'; name: string };    // nowline.preview.width

/** One source's raw values, highest precedence first in the list passed to `resolveSurfaceOptions`. */
export interface OptionLayer {
    source: (key: SurfaceOptionKey) => OptionSource;
    values: Partial<Record<SurfaceOptionKey, unknown>>;
}

export interface OptionError {
    key: SurfaceOptionKey;
    source: OptionSource;
    raw: unknown;
    /** What was wrong, without a lead: `must be an integer ≥ 320`. */
    detail: string;
    /** The accepted values, for an enum option. */
    expected?: readonly string[];
}

export interface NowPolicy {
    /** Zone for "today" when no layer sets `now`; see open question 2. */
    zone?: NormalizedZone;
    clock?: () => Date;
}

export function resolveSurfaceOptions(
    layers: readonly OptionLayer[],
    defaults: { theme: ThemeName },
    now: NowPolicy,
): { options: SurfaceOptions; errors: OptionError[] };
```

- **One parser per option.** `theme` uses `normalizeThemeName` and `THEME_NAMES`, `width` the CLI's integer ≥ 320 rule, `now` `resolveToday` (`-` suppresses), `pageSize` `parsePageSize`, `nonWorking` `NON_WORKING_DISPLAYS`. The first layer with a defined value wins; a bad value in a lower layer is not reported once a higher one wins ([`cli.md`](./cli.md): "A valid flag still wins over an invalid key").
- **rc keys.** The schema records each option's rc key (`theme`, `width`, `pdfPageSize`; `now` and `nonWorking` have none today), and `rcLayer(config: NowlineRc): OptionLayer` turns a loaded `.nowlinerc` into a layer. `NowlineRc` gains the value types of the keys the schema owns.
- **Errors stay each surface's.** The CLI formats an `OptionError` as `nowline: invalid --width "abc". Must be an integer ≥ 320.` or `nowline: invalid .nowlinerc theme "sepia". Expected light, dark, or grayscale.`; MCP as `Unknown theme "x". Expected one of: …` or `Invalid pageSize "x": …`; VS Code keeps ignoring a bad rc value (open question 4). Each surface's existing tests pin those strings.
- **CLI-only keys share the merge.** `defaultFormat`, `pdfOrientation`, `pdfMargin`, `fontSans`, `fontMono`, `headlessFonts`, `useSystemFonts` and `locale` go through the same layer mechanism with option specs registered by the CLI, so `render.ts:127-151` becomes one call. `mergeConfig` is deleted or reimplemented on top of the layers.
- **Dependencies.** `@nowline/config` gains `@nowline/layout` (themes, non-working displays, `resolveToday`) and `@nowline/export-core` (`parsePageSize`). Both are already dependencies of every consumer (CLI, MCP, VS Code), and neither depends on config, so there is no cycle. The loader keeps its `node:fs` default behind its injectable `readFile`.

### 3.2 How each surface uses it

| Surface | Layers, highest first | Default theme | Errors |
|---|---|---|---|
| CLI render | flags, `.nowlinerc` | `light` | exit 2 with today's text |
| CLI `--serve` | flags, `.nowlinerc` (the same call as render) | `light` | exit 2 at start-up |
| MCP `render`, `export`, `validate` | tool arguments | `light` | `InputRequiredError` with today's text |
| VS Code preview and export | toolbar, settings, `.nowlinerc` (unless `nowline.ignoreRcFile`) | editor light or dark | rc errors ignored as today; setting values are typed by VS Code |

The browser pipeline takes already-resolved values (`RenderOptions`) from its host and does not read the schema; the preview shell and the embed resolve their own chrome.

The diagram-theme literal unions in the extension (`export/in-process.ts:98`, `export/cli-runner.ts:33`, `:284`, `extension.ts:297`, `preview/preview-panel.ts:17`, `:269`, `:417`) and in the preview shell (`preview-shell/src/apply-result.ts:63`, `mount.ts:21`, `:1461`) become `ThemeName` (a type-only import in the shell, which keeps it engine-free).

### 3.3 The staging function

```ts
export interface StageInputs {
    source: string;
    /** Absolute path: base for includes and assets. */
    sourcePath: string;
    /** The caller's Langium services (each pipeline keeps its own instance). */
    services: { shared: LangiumSharedServices; Nowline: NowlineServices };
    readSource: (absPath: string) => Promise<string>;
    /** Omitted: no asset access (the embed), so a `logo:` lays out as if absent. */
    assetResolver?: AssetResolver;
    /** A document the caller already parsed and validated from `source`. */
    document?: LangiumDocument<NowlineFile>;
    layout: Pick<LayoutOptions, 'theme' | 'today' | 'width' | 'locale' | 'nonWorking'>;
}

export type StageResult =
    | {
          kind: 'invalid';
          document: LangiumDocument<NowlineFile>;
          /** Lexer, parser and validator diagnostics with errors among them. */
          diagnostics: RawDocumentDiagnostic[];
      }
    | {
          kind: 'include-error';
          document: LangiumDocument<NowlineFile>;
          /** The first uncoded include error, when one exists: it wins (waves.md §6.1). */
          legacy?: ResolveDiagnostic;
          /** Routed (wave-rule) diagnostics; empty when `legacy` is set. */
          routed: ResolveDiagnostic[];
      }
    | {
          kind: 'staged';
          document: LangiumDocument<NowlineFile>;
          ast: NowlineFile;
          resolved: ResolveResult;
          /** Routed warnings (no errors). */
          routed: ResolveDiagnostic[];
          /** The loaded logo: size for layout, bytes for the renderer. */
          logo?: LoadedLogo;
          /** Asset warnings (missing or unreadable logo); the caller applies `strict`. */
          warnings: string[];
          model: PositionedRoadmap;
      };

export function stageRoadmap(inputs: StageInputs): Promise<StageResult>;
```

- **What it owns.** Parse and validate (or reuse `document`), resolve includes, apply the include-error precedence once, load the logo once, lay out. With R1 ([`scheduler-unification.md`](./scheduler-unification.md)) it also builds the wave plan and the schedule once and returns them.
- **What it does not own.** Rendering, diagnostics formatting, `strict`, layout insights. Each caller maps the result to its own shape: the kernel throws (`Error`, `IncludeResolveError`), the browser returns `DiagnosticRow`s, `--serve` broadcasts text frames, MCP returns `McpDiagnostic`s.
- **Where it lives.** `packages/renderer/src/stage.ts`, exported from `@nowline/renderer`: the logo loader and the `AssetResolver` contract already live there, and the kernel, the browser pipeline and the CLI already depend on it. Renderer gains a direct `@nowline/core` dependency, which it already has transitively through layout, so no bundle grows (open question 3 lists the alternatives).

### 3.4 The logo is read once

`loadLogo` returns the bytes it read as well as the size:

```ts
export interface LoadedLogo {
    ref: string;
    dimensions: LogoDimensions;   // LayoutOptions.logo, as today
    asset: AssetBytes;            // what embedLogo needs
}
```

`renderSvg` gains `RenderOptions.logo?: LoadedLogo` and embeds those bytes instead of calling the resolver (`render.ts:3140-3147`); without it, it resolves as today, so direct callers keep working. The kernel's portable and font-pinned renders both pass it. Same bytes in, same SVG out.

### 3.5 Each pipeline on the stage

| Pipeline | After |
|---|---|
| Export kernel | `stageDocument` becomes `stageRoadmap` plus the kernel's error mapping. A new `exportStaged(stage, format, inputs, host)` exports an already-staged roadmap; `exportDocument` is `stageRoadmap` + `exportStaged`, unchanged for callers. The SVG is rendered only for formats that use it (svg, html, png, pdf). |
| Browser `renderSource` | `stageRoadmap` with the no-op include reader and the host's resolver, then layout insights and `renderSvg` as today. |
| CLI render | stages once with the CLI's services: diagnostics come from the stage's document (still in the operator's locale), then `exportStaged`. The second parse goes. |
| CLI `--serve` | resolves options like render (§3.2), stages, renders with `noLinks` and `strict`, honours `width`. |
| MCP | one stage per call: `diagnosticsErrorBlock`'s document is passed in, insights read the staged model (logo included), and `render` / `export` call `exportStaged`. |

## 4. Migration plan

Every step is one PR, independently mergeable, and passes these gates:

- **G1, sample renders.** Render every `examples/**.nowline` and `tests/*.nowline` sample directly with the CLI, on the base commit and on the step, in each built-in theme with `--now 2026-02-09`, and compare every render's SVG bytes and exit status: any difference fails the gate, wherever it falls in the list.
  ```sh
  git worktree add ../base origin/main && (cd ../base && make init build-fast)
  make build-fast
  (cd ../base && git ls-files 'examples/**.nowline' 'tests/*.nowline') >../samples.txt
  render_all() {  # $1 = checkout to render with, $2 = output directory
      rm -rf "$2" && mkdir -p "$2"
      while read -r f; do
          for t in light dark grayscale; do
              out="$2/${f%.nowline}.$t.svg"
              mkdir -p "${out%/*}"
              (cd "$1" && node packages/cli/dist/index.js "$f" --theme "$t" --now 2026-02-09 -o -) >"$out" 2>/dev/null
              echo "exit $?" >"$out.status"
          done
      done <../samples.txt
  }
  render_all ../base ../g1-base && render_all . ../g1-step
  diff -r ../g1-base ../g1-step
  ```
  (`diff -r` exits non-zero when any SVG or exit status differs, and lists every difference rather than the last. The sample list is the base's, so a sample the step deletes or breaks fails too. The gate does not use `make build`, which renders only the slugs listed in `scripts/render-samples.mjs` and `scripts/render-tests.mjs` and so skips `examples/continuation`, `examples/minimal.fr`, `tests/grammar-properties`, `tests/grammar-properties-include`, `tests/partner-multi` and `tests/waves-isolate-team`, and renders the seven include files under `examples/nested/` and `examples/waves-program/` only through their parents. At the commit that adds this spec all 180 renders exit 0, and two runs on that commit give identical trees, in about three minutes.)
- **G2, snapshots and suites.** `make pre-commit` passes without `UPDATE_LAYOUT_SNAPSHOTS`, including the CLI, MCP, browser and VS Code extension suites, whose message assertions pin every error string.
- **G3, kernel bytes** (steps that touch the kernel or the renderer). `make determinism` passes without `UPDATE_DETERMINISM_GOLDENS`, and for every sample `nowline <file> --now 2026-02-09` with `-f png`, `-f pdf`, `-f html`, `-f xlsx`, `-f msproj` and `-f mermaid` gives the same bytes on both commits.

Steps marked *behaviour* change what a surface does for some input outside the sample set; they pass G1 to G3, need the decision named, and add a changelog fragment.

### m1 - One options schema

#### s1 - Add the schema to `@nowline/config`

Add `surface-options.ts` (§3.1): the five option specs, `rcLayer`, `resolveSurfaceOptions`, `OptionError`, and the `NowlineRc` value types. Table-driven tests per option and per source, including "a valid higher layer hides a bad lower one". No caller changes. G2.

#### s2 - Use it in CLI render

Replace `render.ts:127-151` and its helpers with one resolution over the flag and rc layers; register the CLI-only rc keys as CLI option specs; format `OptionError`s with today's templates. Delete or reimplement `mergeConfig`. G1, G2.

#### s3 - Use it in MCP

`theme`, `pageSize`, `nonWorking` and `now` arguments go through the schema; `mcp/src/diagnostics.ts:276-305` goes. `width` keeps accepting any number until s5, and `now` keeps its UTC default until s6, so nothing changes yet. G1, G2.

#### s4 - Use it in the VS Code extension

`option-resolver.ts` parses rc values through `rcLayer`, keeping its precedence and its silent ignore; the literal theme unions become `ThemeName` (§3.2). G1, G2.

#### s5 - *Behaviour:* one width rule

Apply the integer ≥ 320 rule to MCP's `width` argument and to VS Code's setting and rc value, as open question 4 decides. Fragment `changed` (and `packages/vscode-extension/.changelog/` for the extension). G1, G2.

#### s6 - *Behaviour:* one `now` default

Apply the default open question 2 decides; with the recommendation, MCP's omitted `now` becomes the local civil date and MCP gains a `timezone` argument with `--timezone`'s accepted forms. Update the tool descriptions (`server.ts:600-608`) and `specs/mcp.md`. Fragment `changed`. G1, G2.

### m2 - One staging function

#### s1 - Add `stageRoadmap`

Add `packages/renderer/src/stage.ts` (§3.3) with tests for each result kind: validator errors, an uncoded include error that hides routed ones, routed errors alone, a missing logo (warning, laid out without it), and success. No caller changes. G2.

#### s2 - Read the logo once

`loadLogo` returns `LoadedLogo`; `renderSvg` accepts `RenderOptions.logo` (§3.4). Add a test that counts resolver calls: one per kernel export, raster included. G1, G2, G3.

#### s3 - Stage the export kernel

`stageDocument` becomes `stageRoadmap`; add `exportStaged`; render the portable SVG only for formats that use it. G1, G2, G3.

#### s4 - Stage the browser pipeline

`renderSource` calls `stageRoadmap`; its `DiagnosticRow` mapping, `onSkippedInclude` and timezone handling are unchanged. G1, G2.

#### s5 - Stage MCP once per call

`render`, `export` and `validate` stage once, reuse `diagnosticsErrorBlock`'s document, read insights from the staged model and export with `exportStaged`. *Behaviour* for files with a `logo:`: insights now see the drawn header (fragment `fixed`). G1, G2, G3.

#### s6 - Stage CLI render once

`produce` stages with the CLI's services, reports diagnostics from the staged document, and calls `exportStaged`; the second parse (`render.ts:266-271`) goes. Add a test that a render builds one Langium document. G1, G2, G3.

#### s7 - *Behaviour:* `--serve` on the shared path

`--serve` resolves options through m1's resolution (so `--width`, the rc `width`, `--no-links` and `--strict` apply) and stages with `stageRoadmap`; `resolveNowArg` (`serve.ts:275-296`) goes. Tests for each flag; update [`cli.md`](./cli.md) where it says what `--serve` reads. Fragment `fixed`. G1, G2.

## 5. Test strategy

- **Schema tables** (m1.s1): every option, every source kind, precedence, and the exact `OptionError` fields; the per-surface message tests stay where they are and prove the wording did not move.
- **Parity tests**: one table of option inputs run through the CLI's, MCP's and the extension's resolution, asserting the same `SurfaceOptions` (after s5 and s6, without exceptions).
- **Stage tests** (m2.s1): one per result kind, with in-memory `readSource` and `AssetResolver` fakes, no file system.
- **Counting tests**: one resolver read per logo (m2.s2), one Langium document per CLI render (m2.s6), one stage per MCP call (m2.s5).
- **`--serve` tests** (m2.s7): `--width`, `--no-links` and `--strict` each change the served SVG as they change `nowline <file>`'s; a served SVG equals the CLI's SVG for the same flags.
- **Gates** G1 to G3 on every step.

## 6. Risks

| Risk | Mitigation |
|---|---|
| An error message changes wording and breaks scripts or tests | the schema returns fields, not text; each surface keeps its template; G2's message assertions |
| `@nowline/config` becomes heavy for the extension | its new dependencies are already the extension's; the loader stays injectable |
| The stage's include-error precedence differs subtly from one pipeline's | each pipeline's existing include-error tests run unchanged on the stage (`waves.md` §6.1 cases) |
| `exportStaged` lets a caller pair a stage with different `RenderInputs` | `exportStaged` checks the stage's layout inputs against `inputs` (theme, today, width, locale, non-working) and throws on a mismatch |
| Rendering the SVG lazily changes an exporter that read it implicitly | only html, png and pdf take the SVG; G3 covers every format |
| The behaviour steps surprise users | each is its own PR with a fragment, after the matching open question is answered |

## 7. Open questions for Gary

1. **Milestone ID.** `m4.13`, after `m4.11` (R1, [`scheduler-unification.md`](./scheduler-unification.md)) and `m4.12` (R3, [`core-ast-utilities.md`](./core-ast-utilities.md))? *Recommendation:* yes. If R1 has landed, m2.s3 of this spec builds the schedule inside `stageRoadmap`; if not, R1's m2.s2 adds it there later.
2. **The `now` default.** Today the CLI, `--serve`, the VS Code extension and the browser pipeline default to the local civil date, and MCP to the UTC date. Because a roadmap without `start:` starts on that date, the two can disagree on the whole chart, not only the now-line, for part of every day. *Recommendation:* the local civil date everywhere, with an optional MCP `timezone` argument (the accepted forms of `--timezone`) for callers that want another zone. A stdio MCP server runs on the user's machine, so local is the user's date, the same one the CLI uses in the same shell; a remote `--port` server can be pinned with `timezone` or an explicit `now`. The alternative, UTC everywhere, would change the documented CLI default (`help.ts:49`) and surprise every evening user.
3. **Where `stageRoadmap` lives.** (a) `@nowline/renderer`, which already holds the logo loader and `AssetResolver` (recommended); (b) a new `@nowline/stage` package, clearer but one more published, lock-step package; (c) `@nowline/browser`, which would make the export kernel depend on the browser package.
4. **One width rule.** The CLI requires an integer ≥ 320 ([`cli.md`](./cli.md) `.nowlinerc` table), MCP accepts any number, and VS Code any positive number (and ignores a bad rc value). *Recommendation:* the CLI rule everywhere; MCP returns its input error and VS Code reports a bad setting or rc value in the preview's diagnostic table instead of drawing at that width.
5. **The rc `assetRoot` key.** The VS Code extension reads `.nowlinerc` `assetRoot` (`option-resolver.ts:211-212`); the CLI and `--serve` do not, and `cli.md` does not list it. *Recommendation:* add it to the schema as the default for `--asset-root` and document it, since extension users may already rely on it; the alternative is to stop reading it in the extension.
