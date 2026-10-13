# Milestone handoff: m4.12 m1 to m2 (core AST utilities)

Run plan: `specs/handoffs/plan-core-utilities-heron.md`; session handoff: `specs/handoffs/handoff-core-utilities-heron.md`. Branch `claude/zealous-thompson-tur82q`. Spec: `specs/core-ast-utilities.md`. This file, like the plan and session handoff, is removed in the branch's last commit.

## m1 (one content walk): done

- `packages/core/src/language/ast-walk.ts` implements spec §3.1 and is exported only through `@nowline/core/internal` (`src/internal.ts`, `package.json` `exports["./internal"]`, documented as unstable in `packages/core/README.md`).
- The validator (rule 2, size/status and reference checks, rules 24 and 25, the person walk), `include-waves.ts`, `waves.ts`, `waves-order.ts`, layout's `collectItems` and the LSP's `ast-utils.ts` and `document-symbols.ts` all use it. Every copied walk is deleted, and so are the m1 equivalence tests.
- `packages/core/test/layering.test.ts` holds the layering rule (plan decision 5). It already treats `language/validator/` as part of the validator, for m3.
- Rules 24 and 25 keep a caller-side `isNestedTeam` filter (the old walks never entered teams). m3.s2 adds a test that pins it.
- G1 and G3 identical at every step; `make pre-commit` green.

## m2 (shared rules): what it does

s1 adds `util/props.ts` and replaces the property-helper and date-regex copies (spec §1.5), then the one behaviour commit makes dates strict in layout and the validator (plan decision 2, `fixed` fragment in `.changelog/core-ast-utilities.txt`). s2 moves the style chain into `style-chain.ts`; s3 adds `calendar-declarations.ts`; s4 adds `value-tables.ts`.

## Gotchas

- `main` carried R1 (#150) and R4 (#151) by the start of m2. R4 added only a CLI/MCP-style `now` option regex in `packages/config` (it allows `-`, stays). Line numbers in the spec have drifted; find copies by symbol.
- `make bundle-size` was 197.16 KB of 200 KB after m1.s3. New core modules can push it over.
- The gate script normalises the checkout root in G3 output (plan, Gates).
