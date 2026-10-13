# Milestone handoff: m4.12 m2 to m3 (core AST utilities)

Run plan: `specs/handoffs/plan-core-utilities-heron.md`; session handoff: `specs/handoffs/handoff-core-utilities-heron.md`. Branch `claude/zealous-thompson-tur82q`. Spec: `specs/core-ast-utilities.md`. Removed with the plan in the branch's last commit.

## m2 (shared rules): done

- `packages/core/src/util/props.ts` replaced every §1.5 property and date-regex copy; dates are strict in layout and the validator (`2754e83`, the one behaviour commit, with the `fixed` block in `.changelog/core-ast-utilities.txt`).
- `style-chain.ts` drives layout's `resolveStyle` and NL.W0704 (which skips the `inline` layer, caller-side).
- `calendar-declarations.ts` drives the validator's NW1-NW4, layout's `calendarRules` and LSP hover; `every:[constructor]` is now NL.E0904 (recorded in the fragment and §3.4).
- `value-tables.ts` holds the built-in tables for the validator, layout and the LSP.
- All new modules ship through `@nowline/core/internal` and are leaf modules in `layering.test.ts`.

## m3 (validator split): what it does

s1 moves tables and support code into `language/validator/`; s2 moves the checks by feature, one module per commit, keeping `NowlineValidator`'s method names and `registerValidationChecks` order (G3 is the order proof) and first adds a regression test for the `isNestedTeam` filter of rules 24 and 25; s3 removes `effectiveWave`/`leadWave`, appends the `removed` block, fixes `specs/dsl.md` rule 1 to include items among NL.E0405 targets, and marks the spec implemented.

## Gotchas

- Much of what spec §3.6 assumed sits in the validator has moved to the m2 modules; `tables.ts` now holds what is left. Locate by symbol.
- `make bundle-size` is 197.68 KB of 200 KB.
