## Summary

Lays the PR template out as a review guide: `## Review guide` (tier, blast radius, review time, tagged reading order), `## Validation` (renamed from `## How I tested this`), `## Rollback`, and collapsed per-tier blocks, kept in a comment until someone needs them. The four tags are defined inline in the opening comment, so a contributor needs nothing outside the repo to fill it in.

## Motivation

Agent PRs here already bolt this layout onto the old template by hand (lolay/nowline#267). The template didn't have it, and neither did the Copilot prompts, so Copilot PRs and outside contributors never got it. `## Summary`, `## Motivation`, the screenshots section, `## Checklist` and `## AI assistance` stay. AI assistance stays last with `Assisted-by:` as its final paragraph and is otherwise untouched, so `AI_POLICY.md`, the agentic prelude and `copilot-pr-validate.yml` need no change.

## Review guide

Review tier: [check], because the agent prompts change what Copilot puts in every PR body it opens.
Blast radius: Copilot PR bodies and new PRs' starting text. No code, CI or checks change. A revert is safe.
Review time: ~5 min

1. [check] [`agent-deep.md`](https://github.com/lolay/nowline/compare/main...claude/pr-template-review-guide-rbnjvh#diff-01f6d4e008d1eeb6749f0802a4b08b438c0b25a2b4a6c8778778f89aed4b9ff1), [`agent-exec.md`](https://github.com/lolay/nowline/compare/main...claude/pr-template-review-guide-rbnjvh#diff-1376fbb50c7045d3cda1831390491419a80dfa8b2f9e3ae40835c7e0e2a2229d): the section list Copilot must fill
2. [skim] [`PULL_REQUEST_TEMPLATE.md`](https://github.com/lolay/nowline/compare/main...claude/pr-template-review-guide-rbnjvh#diff-18813c86948efc57e661623d7ba48ff94325c9b5421ec9177f724922dd553a35): tag definitions, new sections, Validation examples
3. [skim] [`CONTRIBUTING.md`](https://github.com/lolay/nowline/compare/main...claude/pr-template-review-guide-rbnjvh#diff-eca12c0a30e25b4b46522ebf89465a03ba72a03f540796c979137931d8f92055): "Open a PR" list matches the template

## Validation

- `make pre-commit`: pass
- `grep -rn "How I tested"`: no hits left in the tree
- `agent-review.md`, `copilot-pr-validate.yml`, `agentic-prelude.md`: read, none of them names a heading this PR renames
- Copilot end to end: not run, it needs a labelled issue. The prompts load through `{{#runtime-import}}`, so no `.lock.yml` recompile.

## Rollback

Revert the squash commit.

<details>
<summary>[check] What Copilot is told to write</summary>

| PR body section | Before | After |
| --- | --- | --- |
| Summary, Motivation | required | required |
| How I tested this | required | renamed Validation, with results or `not run` |
| Review guide, Rollback | absent | required |
| Plan from issue, AI assistance (last) | required | unchanged |

</details>

<details>
<summary>[skim] Template</summary>

The opening comment gains one line per tag, adapted to nowline: [study] covers DSL syntax, AST JSON, CLI flags and exporter output. It also gives the default-up rule, and lets a [skim]/[skip] PR keep only the tier and time lines. The Validation examples now use `make pre-commit` instead of `pnpm -r test`, which AGENTS.md forbids, and show a `not run` line. The screenshots comment points to AGENTS.md "Visual changes" and the review.nowline.dev build.

</details>

<details>
<summary>Decisions</summary>

- Kept `## Summary`/`## Motivation` instead of the baseline's unheaded intent paragraph: the repo's own sections win, and contributors expect them.
- Put the `<details>` skeleton inside an HTML comment: live placeholders that nobody deletes render as collapsed junk.
- Renamed the section and updated every reference to it, instead of keeping two overlapping sections.
- No hard check in `agent-review` for the new sections: it already judges risk, and a format gate adds a failure mode for little gain.

</details>

Labelled `no-changelog`: template and contributor docs only, nothing user-observable.

https://claude.ai/code/session_01BNKwNatQQp78ALi1dC4jm7

## AI assistance

Assisted-by: Claude Code
