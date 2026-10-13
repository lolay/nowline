```
--- KICKOFF: begin orchestration at [deep] ---

  Status: BLOCKED at gate 1 | 3/5 groups done | last review: wave-3 CONCERNS | current: nowline m2 s1-s3 [deep] | updated 2026-10-13

  mode: unattended | proposed unattended (harness=claude-code runner=cloud; assigned branch, CLAUDE_CODE_REMOTE=true) | guard 3x min $50 | fixups 2 | confirmed 2026-10-13 session 462f378b-01ae-572c-b81b-c39199f8207a by Kickoff prompt: Run in unattended mode.

  review: every-wave (log-only)

  Next model
    Cursor:      claude-opus-5-5[effort=high]
    Claude Code: /model opus                (/effort high)

  Prompt to paste into the next chat:
    In lolay/nowline, read specs/handoffs/plan-core-utilities-heron.md. The plan is already tagged.
    On branch claude/zealous-thompson-tur82q (task branch): subagents commit each finished step.
    Run in unattended mode.
    Run the personal-plan-orchestrate skill from the top: walk to
    each tier boundary, dispatch subagents per the skill's
    procedure, and pause only where the recorded mode stops. Do not
    execute plan work inline. Update plan progress after each wave
    returns per the skill's procedure. The mode line above is the
    kickoff answer. If the Status line shows BLOCKED, re-post that
    question and wait; otherwise record the mode, print the kickoff
    summary and begin dispatching.

---
```

**Cost (API-equiv, Claude Code models)**

| wave | expected tokens | expected $ |
|---|---|---|
| 1 [exec] m1 s1 | ~4.0M | ~$1.6 |
| 2 [deep] m1 s2-s3 | ~4.4M | ~$2.3 |
| 3 [exec] m1 s4 | ~2.0M | ~$0.89 |
| 4 [deep] m2 s1-s3 | ~13M | ~$6.8 |
| 5 [exec] m2 s4, m3 s1-s3 | ~7.3M | ~$3.0 |
| orchestrator | ~12M | ~$9.9 |
| **Total** | ~43M | ~$24 |

Expected values are estimates, good to about 2-3x per wave. Sizes: m1.s1, m2.s1, m2.s3, m3.s2 large (3x); m2.s4 small (0.3x); the rest medium. Wave 5 runs as two units (m2, then m3), each with its own review. Orchestrator: kickoff, one resume after Gary's /compact, six units of bookkeeping, one wait (the kickoff answer).

# Plan: m4.12 Core AST, style and calendar utilities (R3)

## Context

The v0.8.6 review (`specs/review-since-v086.md`, R3) found the content walk, the style precedence chain, the calendar-declaration classifier and the property/date helpers copied across core, layout, LSP and the exporters, plus a core layering inversion (`include-resolver` → `include-waves` → the 2,558-line validator). `specs/core-ast-utilities.md` is the accepted design. This plan implements its migration milestones m1-m3 on branch `claude/zealous-thompson-tur82q` (lolay/nowline, one working directory: `/workspace/nowline`), as one PR at the end rather than one PR per step. Every step is a commit (or several, each subject starting with its step ID) and passes the gates below; the only declared *behaviour* commit is in m2.s1.

Source of truth: `specs/core-ast-utilities.md` (read all of it before any step; §3 design, §4 migration, §7 decisions). Conventions: `AGENTS.md`, `CONTRIBUTING.md`, `.changelog/README.md`, `.claude/skills/steward/SKILL.md`.

## Decisions that override the spec text

1. **`@nowline/core/internal`.** `ast-walk.ts`, `style-chain.ts`, `calendar-declarations.ts`, `util/props.ts` and `value-tables.ts` are exported only through `src/internal.ts` → `"./internal": { "types": "./dist/internal.d.ts", "import": "./dist/internal.js" }` in `packages/core/package.json`. Not re-exported from `src/index.ts`. `packages/core/README.md` documents the subpath as unstable and for other `@nowline/*` packages only (add after "What's included", ~line 66). No bundler or tsconfig change is needed (all consumers resolve through `exports`).
2. **Strict dates everywhere (Gary, 2026-10-13, this session).** The spec's claim that strict `parseIsoDate` only affects unvalidated input is wrong: the validator is strict only inside calendar declarations (`nowline-validator.ts:839`, `isValidDateLiteral(val, isCalendarDeclaration(...))`); `resolveLocalStart` (`:400`) and `waves.ts:333` `isValidIsoDate` accept `2026-02-30`, which V8 rolls to 2026-03-02. So the m2.s1 behaviour commit makes **both** layout and the validator strict: NL.E0405 fires for an impossible day on every date key, and layout reads it as no date. One `fixed` fragment. Record this as §7 decision 5 in the spec and correct §3.5's sentence in the same commit.
3. **`effectiveWave` / `leadWave` removed outright** in m3.s3, no deprecation: `removed` fragment; the agreement test (`packages/core/test/validation/waves.test.ts:614-630`, plus direct calls at `:524` and `:584-612`) becomes direct expectations on `assignWaves`; drop the two names from the "Core helpers" row of `specs/waves.md` (§10, `:1139`).
4. **Changelog.** Spec §4 says no fragments; superseded. One file, `.changelog/core-ast-utilities.txt`: m2.s1 adds the `fixed` block, m3.s3 appends the `removed` block. No other step adds a fragment. Run `make changelog-check BASE=origin/main REQUIRE=1` in both.
5. **Layering test allow-list.** `ast-walk.ts`, `style-chain.ts`, `calendar-declarations.ts`, `value-tables.ts` and `util/props.ts` are leaf modules: they may import only `../generated/ast.js` (and `langium` types) and each other. The test scans every `packages/core/src/**/*.ts` (not only `src/language/`), excluding `src/generated/`, and fails if anything other than `nowline-module.ts` and `src/index.ts` imports `nowline-validator` (from m3 on: or anything under `language/validator/`, which may import each other and be imported by `nowline-validator.ts`). `src/internal.ts` must not import the validator.
6. **R1 (m4.11) runs in parallel** and edits `packages/layout`. Whichever lands second uses the other's helpers (spec §7.1). Any copy of `propValue`, `propKey`/`stripColon`, a date regex or a date parser that arrives from `main` before m2.s1 is replaced in m2.s1 too; any walk copy that arrives before m1.s3 is covered there.

## Gates (every step; spec §4)

- **G1** renders every `examples/**.nowline` and `tests/*.nowline` sample (base's list, 60 files) in `light`, `dark`, `grayscale` with `--now 2026-02-09`, base vs step, SVG bytes and exit status.
- **G2** `make pre-commit` green without `UPDATE_LAYOUT_SNAPSHOTS` (snapshots under `packages/integration-tests/test/__snapshots__/` never change).
- **G3** `--dry-run --diagnostic-format json`, default locale and `--locale fr`, same bytes and exit status.

The base of a step is the commit before that step's first commit. Every step commit body ends (before the trailers) with one line: `Gates: G1 identical (180 renders), G3 identical (120), make pre-commit green.` A step with several commits (m2.s1, m3.s2) runs G1/G3 per commit. The behaviour commit must still be G1/G3-identical on the samples (that is the proof no sample relies on roll-over); its G2 changes only by the new tests.

Workers write this script to `.scratch/gates.sh` if it is missing (`.scratch/` is gitignored and biome honours `.gitignore`) and run `bash .scratch/gates.sh <base-sha>` after committing the step. Outputs are cached by the tree of `packages examples tests pnpm-lock.yaml`, so the next step's base is usually already rendered, and plan/handoff commits don't invalidate it.

```bash
#!/usr/bin/env bash
# G1 + G3 of specs/core-ast-utilities.md §4: bash .scratch/gates.sh BASE_REV [STEP_REV=HEAD]
set -u
root=$(git rev-parse --show-toplevel); cd "$root" || exit 2
base=$(git rev-parse "$1"); step=$(git rev-parse "${2:-HEAD}")
key() { git rev-parse "$1:packages" "$1:examples" "$1:tests" "$1:pnpm-lock.yaml" | sha1sum | cut -c1-12; }
samples="$root/.scratch/gates/samples-$(key "$base").txt"
mkdir -p "$root/.scratch/gates"
git ls-tree -r --name-only "$base" -- examples tests | grep -E '^(examples|tests)/.*\.nowline$' >"$samples"
render() { # $1 checkout, $2 output dir
    while read -r f; do
        for t in light dark grayscale; do
            out="$2/g1/${f%.nowline}.$t.svg"; mkdir -p "${out%/*}"
            (cd "$1" && node packages/cli/dist/index.js "$f" --theme "$t" --now 2026-02-09 -o -) >"$out" 2>/dev/null
            echo "exit $?" >"$out.status"
        done
        for l in default fr; do
            out="$2/g3/${f%.nowline}.$l.json"; mkdir -p "${out%/*}"
            if [ "$l" = default ]; then loc=(); else loc=(--locale "$l"); fi
            (cd "$1" && node packages/cli/dist/index.js "$f" --dry-run --diagnostic-format json "${loc[@]}") >"$out" 2>&1
            echo "exit $?" >"$out.status"
            sed -i "s#$1#<checkout>#g" "$out" # base renders in a worktree, the step in the root
        done
    done <"$samples"
}
outputs() { # $1 rev -> prints its output dir, rendering it once
    local k o dir; k=$(key "$1"); o="$root/.scratch/gates/$k"
    if [ ! -f "$o/.done" ]; then
        if [ "$1" = "$(git rev-parse HEAD)" ] && [ -z "$(git status --porcelain -- packages examples tests pnpm-lock.yaml)" ]; then
            dir="$root"; make build-fast >&2 || exit 2
        else
            dir="$root/.scratch/gate-wt/$k"
            [ -d "$dir" ] || git worktree add --detach "$dir" "$1" >&2 || exit 2
            (cd "$dir" && make init build-fast) >&2 || exit 2
        fi
        rm -rf "$o"; mkdir -p "$o"; render "$dir" "$o"; touch "$o/.done"
    fi
    echo "$o"
}
b=$(outputs "$base"); s=$(outputs "$step")
echo "renders: $(find "$b/g1" -name '*.svg' | wc -l) G1, $(find "$b/g3" -name '*.json' | wc -l) G3"
diff -r "$b" "$s" && echo "G1+G3 identical"
```

(Fixed after wave 1: G3 messages that quote an absolute path differed only by checkout root, so `render` now rewrites the checkout root to `<checkout>`; caches rendered before the fix were rewritten the same way. `make build-fast` skips the sample render; the gate renders directly, so it covers the slugs `make build` skips, as the spec requires.)

## Merging main

**Before wave 1 (Gary, 2026-10-13):** the first thing the resumed session does, before wave 1's `plan_state.py` run and snapshot, is fetch `origin/main` and merge it into this branch. At kickoff, main was two commits ahead: `ff8eb8b` (#149, env doctor) and `4498948` (#150, m4.11 scheduler unification, R1). R1 has therefore landed first, so this milestone is the one that uses R1's code (spec §7.1): every worker re-locates the spec's `file:line` references by symbol, since R1 moved layout code (`schedule.ts`, `layout.ts`, `roadmap-node.ts`), and m1.s3 and m2.s1 cover any walk, `propValue`, `propKey`/`stripColon`, date-regex or date-parser copy that R1 added or moved (decision 6). The merge commit is the parent's; wave 1's `from` is that merge.

Before each later unit, the parent fetches `origin/main` again. If main moved and `git merge --no-edit origin/main` is clean, the parent commits the merge (trailers as below) and pushes before the snapshot, so the merge sits outside every worker's range and the next step's gate base includes it. On a conflict the parent aborts the merge and stops to ask (resolution is plan work: it becomes a re-plan step). Listed under Deviations in the handoff.

## Git for workers

Branch `claude/zealous-thompson-tur82q`. Commit subjects: `m1.s2 <imperative subject>`, ≤72 chars, no period, no emoji. Trailers, last paragraph:

```
Claude-Session: https://claude.ai/code/session_01SXbZ6WY7nW4VBivDovQBDF
Assisted-by: Claude Code
```

No `Co-authored-by`. Workers never push. TypeScript: 4 spaces, `.js` suffix on relative imports. Never edit `packages/core/src/generated/`. lolay/nowline is public: write nothing about private sibling repos.

### m1 - One content walk

--- WAVE 1 [exec] ---
#### s1 - [exec] Add `ast-walk.ts` (done)

Add `packages/core/src/language/ast-walk.ts` exactly per spec §3.1 (`TrackNode`, `DeclarationNode`, `WalkOptions`, `trackChildren`, `trackNodes`, `declarations`, `visitProperties`, `forEachDeclaredId`, `referenceableIds`, `firstDeclarations`), depending only on `../generated/ast.js`. Add `packages/core/src/internal.ts` re-exporting it and the `./internal` `exports` entry (decision 1), and the README note. Tests in `packages/core/test/`: direct unit tests (source order, `description` skipping, nested teams, groups in parallels in groups, `WalkOptions`), and equivalence tests that run each new function and the copy it will replace over every sample (read `examples/**` and `tests/*.nowline` from the repo root, like `packages/layout/test/waves-byte-stability.test.ts:65`) and the inline core fixtures (`test/validation/wave-fixtures.ts` `EXAMPLE_n`, plus fixtures from the validation tests that exercise ids, teams and includes), comparing ids, order and owners. Copies under test: `registerEntity`/`registerTeam`/`registerSwimlaneContent`, `visitPropertiesDeep`, `collectReferenceableIds` (`nowline-validator.ts:2454-2558`; export the private ones from the module only, marked `@internal`, removed in s2), `collectDeclarations` and `collectWaveHosts` (`waves.ts`), layout's `collectItems` (`layout.ts:1880-1911`, test in `packages/layout/test/`), LSP `collectNamedEntities`/`visitProperties` (`packages/lsp/src/references/ast-utils.ts`, test in `packages/lsp/test/`). A difference found is reported and kept as a caller-side filter (spec §6). No caller changes. G2 (G1/G3 trivially identical; run them anyway to seed the cache).

--- WAVE 2 [deep] ---
#### s2 - [deep] Move the validator and the resolver onto it (done)

Per spec m1.s2: switch `registerEntity`, `visitPropertiesDeep`, `collectReferenceableIds`, the rule 24 (`:1795-1801`), rule 25 (`:1858-1864`) and person (`:1926-1935`) walks to `ast-walk.ts`; `include-waves.ts:30` imports `forEachDeclaredId`; delete the validator's walk helpers and the `registerEntity` export, and the equivalence tests for the deleted copies. Add `packages/core/test/layering.test.ts` (decision 5). Diagnostic order must not change (rule 2 duplicates, cycles). G1, G2, G3.

#### s3 - [deep] Move the wave rules and layout onto it (done)

Per spec m1.s3: `collectDeclarations` → `firstDeclarations`, `collectWaveHosts` → `declarations(...)` with a filter, the descent in `assignWaves` and `leadWave` and in `waves-order.ts:212-256` → `trackChildren` (keeping their own recursion for inherited state), layout's `collectItems` → `trackNodes` (import from `@nowline/core/internal`). Delete the replaced copies and their equivalence tests. Include any walk copy merged from main (decision 6). G1, G2, G3.

--- WAVE 3 [exec] ---
#### s4 - [exec] Move the LSP onto it (done)

Per spec m1.s4: `collectNamedEntities`, `visitProperties`, `visitAllProperties` and `buildEntityIndex` in `packages/lsp/src/references/ast-utils.ts`, and the descent in `packages/lsp/src/providers/document-symbols.ts:109-145`, use `ast-walk.ts`. Delete the replaced copies and remaining m1 equivalence tests. G1, G2 (LSP suites).

### m2 - Shared rules

--- WAVE 4 [deep] ---
#### s1 - [deep] Property helpers and the date pattern

Two kinds of commit. **(a) Refactor commits, byte-identical:** add `packages/core/src/util/props.ts` per spec §3.5 (`propKey`, `findProp`, `propValue`, `propValues`, `ISO_DATE_RE`, `parseIsoDate`, `isRealIsoDate`), export it via `internal.ts`, with unit tests (including `2026-02-30`, `2025-12-40`, `0000`-style edges). Replace every copy in §1.5 package by package (one commit per package is fine), plus any merged from main (decision 6). Keep each caller's semantics: `printer.ts` keeps its strip via `propKey`; `export-core`'s `getProp`/`getProps`/`hasProp` keep exact semantics (build on `findProp` only if that preserves the no-strip `===` compare, otherwise leave them and say so); `preview-shell/src/mount.ts:1537` stays (§3.5); `mcp/src/server.ts:602` (allows `-`) and the grammar terminal stay; `nowline-module.ts:39` is the parse-time strip itself and stays. Layout's `dsl-utils.ts` `propValue`/`propValues` re-export or wrap core's; layout's `parseDate` stays lenient in these commits. **(b) The behaviour commit** (`m2.s1 Read impossible dates as no date in layout and validator`, decision 2): layout's `parseDate` (all callers: `layout.ts`, `schedule.ts`, `wave-layout.ts`, `roadmap-node.ts`, `milestone-node.ts`, `anchor-node.ts`, `wave-barrier.ts`, `calendar-resolver.ts`) and `calendar-resolver.ts`'s `realDate` move to strict `parseIsoDate`; the validator's `isValidDateLiteral` becomes strict for every date key, `resolveLocalStart` and `waves.ts` `isValidIsoDate` use `isRealIsoDate`. Regression tests: a milestone `date:2026-02-30` and a roadmap `start:2026-02-30` give NL.E0405 (en and fr); layout's date parse of `2026-02-30` is null. Add `.changelog/core-ast-utilities.txt` with a `fixed` block; update `specs/dsl.md` (and `specs/rendering.md` if it describes date reading) where NL.E0405 / date validity is described, and `specs/core-ast-utilities.md` §3.5 and §7 (decision 5). G1 and G3 identical on the samples for both kinds; G2.

#### s2 - [deep] The style chain

Per spec §3.3 and m2.s2: add `packages/core/src/language/style-chain.ts` (`StyleSources`, `StyleLayer`, `styleLayers`), exported via `internal.ts`, with tests pinning the layer order for each level, label order (first label wins) and unresolved styles and labels. Switch layout's `resolveStyle` (`style-resolution.ts:178-242`) and the validator's `checkHiddenTimelineStrip` (NL.W0704, `nowline-validator.ts:1455-1517`; silent at the first undefined `decl`/`label`). Precedence must not change (`specs/rendering.md` § Style Precedence). G1, G2, G3.

#### s3 - [deep] The calendar classifier

Per spec §3.4 and m2.s3: add `packages/core/src/language/calendar-declarations.ts` (`WEEKDAYS`, `Weekday`, `WEEKDAY_INDEX`, `CalendarShape`, `CalendarDeclarationFacts`, `classifyCalendarDeclaration`, `replacesPresetWeekend`), using `util/props.ts` for dates. First commit: the module plus a test that classifies every `non-working`/`working` declaration in the samples and the calendar test fixtures (`packages/layout/test/calendar-resolver.test.ts`, `packages/core/test/validation/non-working-declarations.test.ts` and siblings) and compares with each of the three copies. Then switch the validator (`:2106-2173`, delete `:2325-2439` helpers), `packages/layout/src/calendar-resolver.ts` (`declarationRule`, `calendarRules`; delete its `WEEKDAY_INDEX`, `realDate`, `stripColon`), and `packages/lsp/src/providers/hover.ts:136-149`; delete the equivalence test. G1, G2, G3.

--- WAVE 5 [exec] ---
#### s4 - [exec] Value tables

Per spec m2.s4: add `packages/core/src/language/value-tables.ts` (`BUILTIN_STATUSES`, `BUILTIN_CAPACITY_ICONS`, `BUILTIN_ICON_NAMES`, `NON_WORKING_DISPLAYS`; `WEEKDAYS` stays in `calendar-declarations.ts` and is re-exported), exported via `internal.ts`. The validator (`:93`, `:130`, `:146`, `:159`), layout (`non-working-display.ts:13` re-exports core's `NON_WORKING_DISPLAYS`, so `@nowline/layout`'s public export and its MCP/browser importers are unchanged) and the LSP (`ast-utils.ts:88-128`) import them. Check the tables are identical first (the LSP's `calendar` icon was added in this review's m2.s4); a real difference is reported, not silently unioned. G1, G2, G3.

### m3 - The validator split

#### s1 - [exec] Move tables and support code

Per spec §3.6 and m3.s1: move `packages/core/src/language/validator/tables.ts` and `validator/support.ts` out of `nowline-validator.ts`. Pure move, no logic change. Extend the layering test for `validator/` (decision 5). G1, G2, G3.

#### s2 - [exec] Move the checks by feature

Per spec §3.6 and m3.s2: move check bodies into `validator/structure.ts`, `properties.ts`, `entities.ts`, `style.ts`, `calendar.ts`, `references.ts`, `symbols.ts`, one module per commit (each `m3.s2 Move <feature> checks into validator/<module>.ts`); each exports plain `(node, accept) => void` functions; `NowlineValidator` keeps one forwarding method per check, every method name, and `registerValidationChecks` and its order unchanged. `checkWaves` stays a thin call into `language/waves.ts`. Pure move. G1, G2, G3 per commit (G3 is the order proof).

#### s3 - [exec] Remove the unused wave exports

Per spec m3.s3 and decision 3: delete `effectiveWave` and `leadWave` (`waves.ts:210-267`, `core/src/index.ts:55`, `:59`); rewrite the `waves.test.ts` tests that call them as direct expectations on `assignWaves` (same 16 nodes, same expected waves and leads); drop them from `specs/waves.md:1139`; append a `removed` block to `.changelog/core-ast-utilities.txt`. Update `specs/core-ast-utilities.md`'s Status line to implemented (m4.12) and note the deviations (one PR; decisions 2 and 4). G1, G2.

## Process

1. On approval: run `personal-plan-orchestrate`. Plan to `specs/handoffs/plan-core-utilities-heron.md`, handoff `specs/handoffs/handoff-core-utilities-heron.md`. Tag tiers (expected: m1.s1 [exec], m1.s2-s3 [deep], m1.s4 [exec], m2.s1-s3 [deep], m2.s4 and m3.s1-s3 [exec]), mark waves, write Kickoff block, Cost table, Token log header; commit (no step ID, trailers above), push, ask the kickoff question.
2. After Gary answers and the plan and handoff are pushed: **stop** for `/compact`. No wave dispatches until the Kickoff prompt is pasted.
3. Each milestone boundary: milestone handoff per the skill (gate 4).
4. At completion: last commit removes the plan and handoff (no promotion; the spec and changelog carry what's durable), then ask before opening a PR. PR body per steward: overlap check with open PRs, `Assisted-by: Claude Code` last.

## Verification (done means)

- Every step of spec m1-m3 committed, reviewed (Review log PASS), each commit body carrying its gate line.
- `packages/core/test/layering.test.ts` passes: nothing but `nowline-module.ts` and `src/index.ts` imports the validator; leaf modules import only AST types and each other.
- `make ci` green on the final head; `make changelog-check BASE=origin/main REQUIRE=1` green.
- G1/G3 identical at every step, including the behaviour commit on the samples.
- `grep` finds no remaining `stripColon`, layout-local `parseDate` regex, `collectReferenceableIds`, `visitPropertiesDeep`, `registerEntity`, `effectiveWave`, `leadWave` outside history.

## Review log

review wave-1 (nowline m1 s1) 3fdba6c..6448ee4: PASS - ast-walk.ts matches spec §3.1, imports only generated AST and langium types; @nowline/core/internal subpath and README note; equivalence tests over 60 samples and fixtures in core, layout and LSP found no difference (only dead PersonDeclaration-in-team branches, unreachable per grammar); layout collectItems moved by R1 to layout.ts:1571 and tested there; gate diff showed only the checkout-root path in tests/grammar-properties G3 (gate-script artifact, script fixed by the parent) - 2026-10-13
review wave-2 (nowline m1 s2-s3) b889c77..2286068: PASS - validator rule 2, size/status, reference checks and rule 24/25/person walks on ast-walk.ts; include-waves imports forEachDeclaredId, no validator edge; layering.test.ts per decision 5 with a mutation check; waves.ts/waves-order.ts on firstDeclarations/declarations/trackChildren, layout collectItems on trackNodes; rules 24 and 25 keep a caller-side isNestedTeam filter (old closures never entered teams, spec §6); G1+G3 identical per step; observation: no test pins isNestedTeam (carried to m3.s2); passed unattended: gate 2 - 2026-10-13
review wave-3 (nowline m1 s4) 3cdb1ed..3b46f6d: CONCERNS - worker disclosed: Ran `npx vitest run test/references/tmp-debug.test.ts` directly in packages/lsp twice, to diagnose a fixture syntax error. It ran. It bypassed AGENTS.md's rule to use the Makefile instead of calling the tool directly. It was local to the working directory, and I deleted the temporary test file afterwards. Review PASS: LSP collectNamedEntities/visitProperties/visitAllProperties/buildEntityIndex and document-symbols descent on ast-walk via @nowline/core/internal, caller-side filters kept, last m1 equivalence test deleted, new ast-utils tests pin order and filtering, G1+G3 identical (180/120); no trace of the debug file anywhere, branch on origin unchanged, nothing pushed - 2026-10-13

## Token log

**Counting header (Claude Code)**

- Line, one per model a chat ran, appended below: `tokens <row> <group-id> (<model>): input ~X / cache read ~R / cache write ~W / output ~Y | ~$C API-equiv`. `<row>` is `wave-N`, `review-wave-N`, or `wave-N-fix` and `review-wave-N-fix` for a fix-up wave; `<group-id>` is the wave's group id with hyphens (`nowline-m1-s2-s3`); `<model>` is `message.model` without a date suffix. Round counts to two significant figures with `k` or `M`.
- Usage: `~/.claude/projects/<slug>/$CLAUDE_CODE_SESSION_ID.jsonl` (`<slug>` is the working directory with every character but a letter or digit turned into `-`, matched by prefix when long; without the id, the newest `.jsonl` there), plus its subagents' `<session-id>/subagents/**/agent-*.jsonl` in the same directory. Sum `message.usage` over assistant lines once per `message.id`, from the line with `stop_reason`: input `input_tokens`, cache read `cache_read_input_tokens`, cache write `cache_creation.ephemeral_5m_input_tokens` (with `ephemeral_1h_input_tokens` too, `cache write ~40k 5m + ~8k 1h`), output `output_tokens`. A call with no `stop_reason` line keeps its input-side counts, takes output as about 1,000, and its line ends `(output est.) session <id>`.
- Rates by `<model>`, $ per Mtok input / cached / output: `claude-opus-5-5` 4.00 / 0.20 / 20.00; `claude-sonnet-5-5` 2.00 / 0.20 / 10.00.
- `$C` = (input x in + cache read x cached + 5m write x in x 1.25 + 1h write x in x 2.00 + output x out) / 1M.
- In another harness, or on a model not listed here, count and price per plan-execution.md "Token accounting" and "Model price table" instead.

tokens orchestrator-kickoff plan-core-utilities-heron (claude-opus-5-5): input ~98 / cache read ~8.9M / cache write ~0 5m + ~430k 1h / output ~52k | ~$6.25 API-equiv
tokens orchestrator-kickoff-explore core-package-build-and-exports (claude-opus-5-5): input ~18 / cache read ~440k / cache write ~41k / output ~10k | ~$0.50 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens orchestrator-kickoff-explore layout-lsp-helper-copies (claude-opus-5-5): input ~16 / cache read ~360k / cache write ~35k / output ~8k | ~$0.41 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens wave-1 nowline-m1-s1 (claude-sonnet-5-5): input ~74 / cache read ~4.6M / cache write ~330k / output ~38k | ~$2.11 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens review-wave-1 nowline-m1-s1 (claude-opus-5-5): input ~32 / cache read ~590k / cache write ~50k / output ~16k | ~$0.69 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens orchestrator-wave-1 nowline-m1-s1 (claude-opus-5-5): input ~14 / cache read ~1.1M / cache write ~0 5m + ~24k 1h / output ~10k | ~$0.61 API-equiv
tokens wave-2 nowline-m1-s2-s3 (claude-opus-5-5): input ~150 / cache read ~11M / cache write ~200k / output ~75k | ~$4.62 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens review-wave-2 nowline-m1-s2-s3 (claude-opus-5-5): input ~58 / cache read ~1.6M / cache write ~76k / output ~28k | ~$1.26 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens orchestrator-wave-2 nowline-m1-s2-s3 (claude-opus-5-5): input ~7 / cache read ~710k / cache write ~0 5m + ~18k 1h / output ~7.2k | ~$0.43 API-equiv
tokens wave-3 nowline-m1-s4 (claude-sonnet-5-5): input ~38 / cache read ~1.7M / cache write ~110k / output ~19k | ~$0.79 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens review-wave-3 nowline-m1-s4 (claude-opus-5-5): input ~24 / cache read ~320k / cache write ~37k / output ~12k | ~$0.49 API-equiv (output est.) session 462f378b-01ae-572c-b81b-c39199f8207a
tokens orchestrator-wave-3 nowline-m1-s4 (claude-opus-5-5): input ~6 / cache read ~380k / cache write ~0 5m + ~12k 1h / output ~1.4k | ~$0.20 API-equiv
