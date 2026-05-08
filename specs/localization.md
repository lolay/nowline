# Nowline — Localization

## Overview

Nowline localizes three surfaces:

1. **Render surface** — axis tick labels, the now-pill text, the quarter prefix, footnote sort order. Affects every output format.
2. **Pipeline messages** — validator strings, CLI help, error codes, runtime warnings.
3. **Man page** — the `nowline.1` mdoc shipped through every install channel that [`specs/cli-distribution.md`](./cli-distribution.md) wires up.

DSL keywords (`roadmap`, `swimlane`, `item`, …), built-in vocabularies (`planned`, `in-progress`, `done`, `at-risk`, `blocked`; color names; calendar modes; icon names), and identifier characters (`[a-zA-Z_][a-zA-Z0-9_-]*`) all stay English/ASCII. This is a deliberate non-goal: every diagram-tool peer (Mermaid, D2, PlantUML's modern diagram families, Graphviz) keeps keywords English-only, and the ones that tried regional keywords (PlantUML's pre-2010 diagrams) regretted it. Author-supplied titles (`item research "Investigación"`) accept any UTF-8 and are how localized roadmap text reaches readers today.

## Locale precedence

Nowline keeps **two independent locale chains**: one for the rendered artifact (the SVG/PDF/etc. that gets committed and shared), one for whatever the operator sees on the terminal (validator diagnostics, `--help`, parse errors, verbose logs). Splitting them lets a French operator read errors in French while still rendering an English roadmap authored by an American teammate, and vice-versa — a single chain forces one of the two parties to lose.

### Content chain — baked into the artifact

Highest wins, top to bottom:

1. **File directive** — `nowline v1 locale:fr-CA`
2. CLI `--locale <bcp47>`
3. `LC_ALL` / `LC_MESSAGES` / `LANG` env vars (POSIX order)
4. `.nowlinerc` `locale` key
5. Built-in default `en-US`

The file directive wins because the file *is* the artifact. The same input rendered on any machine has to produce the same output: a French roadmap stays French regardless of who runs `nowline` against it. This matches HTML's `<html lang="...">`, AsciiDoc's `:lang:`, and Mermaid's `%%{init: {'config': {'locale': '...'}}}%%` — all of them pin the rendered language to the source.

The operator's chain only acts as a fallback when the file declines to declare its own locale; it never overrides a file that has one.

### Operator chain — terminal output

Highest wins:

1. CLI `--locale <bcp47>`
2. `LC_ALL` / `LC_MESSAGES` / `LANG` env vars (POSIX order)
3. `.nowlinerc` `locale` key
4. Built-in default `en-US`

The file's locale never enters this chain. Validator diagnostics, `--help`, and verbose logs are *operator-facing*; whichever language the operator's environment expresses wins. A French author publishing a roadmap with `locale:fr-CA` does not impose French error messages on a German collaborator running `nowline` against that file from a `LANG=de_DE` shell.

### Verbose mode prints the source

`--verbose` emits one line after parsing so the operator can see at a glance which locale is winning the content chain and where it came from:

```
nowline: locale=fr-CA (from file directive)
nowline: locale=fr-CA (from --locale)
nowline: locale=fr-FR (from LANG env var)
nowline: locale=en-US (default)
```

`Intl.DateTimeFormat` already follows the env-var chain when called with `undefined` as the locale, so honoring it costs nothing.

### Resolution matrix

`(unset)` means "no signal from this input." Both chains start fresh from `en-US` when nothing is set.

| System locale (env)         | CLI `--locale` | File `locale:` directive | → CLI message output     | → Rendered drawing         |
|-----------------------------|----------------|--------------------------|--------------------------|----------------------------|
| (unset)                     | (unset)        | (unset)                  | `en-US` (default)        | `en-US` (default)          |
| (unset)                     | (unset)        | `fr-CA`                  | `en-US` (default)        | `fr-CA` (file wins)        |
| `LANG=fr_FR`                | (unset)        | (unset)                  | `fr-FR` (env)            | `fr-FR` (CLI/env fallback) |
| `LANG=fr_FR`                | (unset)        | `en-US`                  | `fr-FR` (env)            | `en-US` (file wins)        |
| `LANG=fr_FR`                | `de-DE`        | (unset)                  | `de-DE` (flag > env)     | `de-DE` (CLI/env fallback) |
| `LANG=fr_FR`                | `de-DE`        | `en-US`                  | `de-DE` (flag > env)     | `en-US` (file wins)        |
| (unset)                     | `fr-CA`        | (unset)                  | `fr-CA` (flag)           | `fr-CA` (CLI fallback)     |
| (unset)                     | `fr-CA`        | `en-US`                  | `fr-CA` (flag)           | `en-US` (file wins)        |
| `LC_ALL=fr_CA`              | (unset)        | `de-DE`                  | `fr-CA` (LC_ALL > LANG)  | `de-DE` (file wins)        |

### Implementation note: deferred message formatting

The validator runs at parse time, before the CLI's operator-locale resolution has reached `@nowline/core`. To honor the rule that diagnostics print in the *operator's* locale (not the file's), the validator now formats the canonical en-US text for every code-keyed message at parse time and stashes the `{ code, args }` pair in the diagnostic's `data` field. The CLI re-formats the human message from `data` using the operator locale before printing. Non-CLI consumers (LSP, raw `parseSource` callers) keep seeing the en-US text the validator stashed; the `data` payload is forward-compatible with future LSP locale plumbing.

The 57 literal-English validator strings that don't yet have stable codes stay English regardless of operator locale — they get codes, and bundles, opportunistically.

## DSL: `locale:` on the `nowline` directive

The `nowline` directive accepts an optional `locale:` property:

```nowline
nowline v1 locale:fr-CA

roadmap r "Plan 2026"
swimlane s "Plateforme"
  item recherche "Recherche" duration:3w
```

Grammar (see [`packages/core/src/language/nowline.langium`](../packages/core/src/language/nowline.langium)):

```nowline
NowlineDirective:
    'nowline' version=ID
    (properties+=BlockProperty)*;
```

The validator allow-lists known directive keys; unknown keys are an error so typos surface immediately. The only key today is `locale:`; the property is the forward-extension point for any future file-level pragma.

A bare `nowline v1` (no properties) parses byte-identically to before — the directive change is strictly additive.

### Value format

The `locale:` value is a **BCP-47 language tag**, validated against a permissive `^[a-zA-Z]{2,3}(-[a-zA-Z]{2}|-\d{3})?$` regex that accepts the subset Nowline cares about: a 2- or 3-letter primary subtag with an optional region (2 letters or 3 digits). Examples that parse cleanly: `en-US`, `fr`, `fr-CA`, `fr-FR`, `zh-CN`, `es-419`. The runtime resolver does the actual fallback work; the regex just gates input shape.

### Includes

A child file's `locale:` is **informational only**. The root file's locale wins for rendering. Mismatches emit a warning (not an error) — a Quebec-French swimlane included into a German parent is a perfectly valid composition.

This is different from `start:`, where parent/child mismatches are errors (semantic conflict). Locale is a presentational concern.

## Locale resolution: CLDR-style tree

Bundles mirror the CLDR locale hierarchy (`root → fr → {fr-CA, fr-FR, fr-BE, fr-CH}`):

```
packages/cli/src/i18n/
  messages.en.ts        # full bundle (built-in default)
  messages.fr.ts        # full bundle (neutral French)
  messages.fr-CA.ts     # overlay; empty or near-empty at launch
  messages.fr-FR.ts     # overlay; empty or near-empty at launch
```

The loader implements a generic "strip the trailing subtag, retry" loop. Resolution chains:

- `fr-FR → fr → en-US`
- `fr-CA → fr → en-US`
- `fr-BE → fr → en-US` (works automatically for any future variant)
- bare `fr → fr → en-US`
- `en-US → en → en-US` (the root)

A key missing from a regional overlay falls through to the parent; a key missing from the parent falls through to `en-US`. Empty overlays are a feature, not a bug — they establish the contract that "this is where regional divergence goes when it appears."

### Translation strategy for fr

The full ~330-line man page and the validator-message bundle live in `messages.fr.ts` / `man/fr/nowline.1`. They're region-neutral French:

- Quarter prefix: `T` (for *trimestre*).
- Quotation marks: « » (universally understood, fr-FR-strict, fr-CA-also-acceptable).
- Month abbreviations come from `Intl.DateTimeFormat('fr', { month: 'short' })` — `janv.`, `févr.`, `mars`, `avr.`, `mai`, `juin`, `juil.`, `août`, `sept.`, `oct.`, `nov.`, `déc.`.
- "Now" pill: `Aujourd'hui`.

Translations start from machine output and require a human review pass before merging. The reviewer should be Quebec-French-fluent (l'OQLF Grand dictionnaire terminologique is the canonical reference for Quebec software terminology), but the bundle is **region-neutral**: Quebec-only terms are pushed down into `messages.fr-CA.ts`, France-only terms into `messages.fr-FR.ts`. The PR template prompts the reviewer to flag any Quebec-flavored term that has a more neutral equivalent.

### Date format

The `fr` base does not auto-format dates today. The renderer emits month abbreviations and `Q`/`T` prefixes only — no full dates. The `YYYY-MM-DD` vs `DD/MM/YYYY` choice (where `fr-CA` and `fr-FR` differ) is therefore a non-decision until something else changes. When it does, the natural home is whichever overlay the user's tag resolves into.

## Pipeline messages: error codes

Every author-visible validator message has a stable error code (`NL.E0001`, `NL.E0002`, …). The code is the bundle key; the value is the localized message template. Codes never change once shipped; messages may be reworded within a locale.

Three guarantees:

1. **Code stability**: a code shipped in v1 keeps its meaning forever. Renumbering is a major-version concern.
2. **Coverage**: CI enforces that every key in `messages.en.ts` exists in `messages.fr.ts`. Keys missing from regional overlays are expected and silent (loader fallback handles them).
3. **JSON surface**: the `--diagnostic-format json` output already exposed by the CLI emits the code as a top-level field, so machine consumers can switch on the code without parsing localized text.

## Render surface: locale flow

Layout receives the resolved locale on the positioned model. The renderer:

- Calls `Intl.DateTimeFormat(locale, { month: 'short' })` for week/month tick labels.
- Reads the `nowPill.label` from the locale bundle (default `'Now'` for `en`, `'Aujourd'hui'` for `fr`).
- Reads the quarter prefix from the locale bundle (default `'Q'` for `en`, `'T'` for `fr`).
- Pre-computes pill geometry from the chosen string so longer locale strings don't clip. See [`specs/handoffs/`](./handoffs/) for the m-loc-c layout work.

`localeCompare` calls in canonical-output paths (the printer's property sort) are pinned to `'en'` so canonical text round-trips byte-stably regardless of the user's locale. Author-visible sort orders (footnote ordering on the chart) use the resolved locale.

## Distribution: man page bundles

Hand-authored mdoc per locale, mirroring the runtime bundle layout:

```
packages/cli/man/
  nowline.1            # canonical (en)
  fr/nowline.1         # full neutral-French translation
  fr-CA/nowline.1      # absent unless Quebec-specific divergence appears
  fr-FR/nowline.1      # absent unless France-specific divergence appears
```

Channel-by-channel install:

- **Homebrew tap** — the `Formula/nowline.rb` install block loops over locale subdirs and calls `(share/"man"/locale/"man1").install "nowline.1"` for each.
- **`.deb`** — [`scripts/build-deb.sh`](../scripts/build-deb.sh) installs translated pages at `/usr/share/man/<locale>/man1/nowline.1.gz` with the same `gzip -n -9` for byte-deterministic output.
- **npm** — [`packages/cli/package.json`](../packages/cli/package.json)'s `"man"` field becomes an array listing every locale's `.1`.
- **GitHub Releases** — the `release` workflow stages translated pages alongside the existing assets.

`man -L fr nowline` then resolves to the translated page on any system that respects the standard `man` locale-search path.

## Non-goals

- **DSL keyword translation.** Every peer that tried it regretted it.
- **Unicode identifiers.** Defer until a real author asks. Author-visible localization runs through titles today.
- **RTL / CJK / script-shaping coverage.** Architecture stays open to them; shipping is a future tier. Concretely: keep locale plumbing string-keyed (not enum-keyed), don't bake Latin-only assumptions into the pill geometry, keep `dir="ltr"` an explicit attribute rather than an implicit default in any future SVG output.
- **Auto-generating the man page from a Markdown source.** Hand-authored mdoc is the m2l decision; localized pages follow the same pattern.

## Risks

- **Pill geometry**: `'Aujourd'hui'` (11 chars) vs `'Today'` (5). Layout work in [`packages/layout/src/layout.ts`](../packages/layout/src/layout.ts) likely needed; tracked in m-loc-c.
- **Quarter prefix**: `T1` vs `Q1` is the first structural-prefix substitution; the message-table shape supports it without forcing every caller to know the locale.
- **Snapshot churn**: existing English snapshots stay green (default unchanged); new `fr` snapshots need wide layout tolerances during the first review pass.
- **Reviewer bias**: a Quebec-French-fluent reviewer naturally reaches for OQLF terms. The PR template prompts them to push divergences down into `messages.fr-CA.ts` rather than baking them into the base.
