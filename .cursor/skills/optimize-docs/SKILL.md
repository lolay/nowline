---
name: optimize-docs
description: Audits and tightens project documentation for both human readers and AI coding agents. Use when the user asks to optimize, clean up, tighten, audit, or restructure docs; when AGENTS.md or README has grown bloated or duplicative; when commands in docs drift from the Makefile; or when adding new documentation and unsure whether content belongs in human docs vs agent docs.
disable-model-invocation: true
---

# Optimize Docs

Adapted from prior art: [imsanchez/agents-md-skill](https://github.com/imsanchez/agents-md-skill) (read → fetch best practices → decide updates workflow), [markoblogo/AGENTS.md_generator](https://github.com/markoblogo/AGENTS.md_generator) (marker-based in-place edits), [anthropics/skills](https://github.com/anthropics/skills) (structure patterns). Authoritative sources: [agents.md](https://agents.md/) spec, [Diataxis](https://diataxis.fr/) framework, [llms.txt](https://llmstxt.org/) convention.

## Human vs agent docs

| Audience | Files | Purpose |
| --- | --- | --- |
| Humans | `README.md`, `CONTRIBUTING.md`, `specs/`, `ops/`, `CHANGELOG.md` | Quick start, rationale, contribution workflow, product/engineering decisions |
| Agents | `AGENTS.md` (+ nested `AGENTS.md` in subdirs if needed) | Exact commands, conventions, never-touch boundaries, non-obvious patterns |

**Must:** never duplicate content across the two audiences. Link instead of copy. The [`Makefile`](../../Makefile) is the single source of truth for build/test/lint/deploy command strings — docs must match `make help`, not raw tool invocations.

## Workflow

1. **Inventory** — list every doc file in scope (see "Docs in this repo" below). Note line count and obvious duplication.
2. **Classify** — tag each section as human-only, agent-only, or shared (shared → pick one home, link from the other).
3. **Trim** — remove content inferable from code, manifests (`package.json`, `go.mod`, `versions.tf`), or linter config. Remove stale commands, time-sensitive notes, and README content pasted into AGENTS.md.
4. **Verify commands** — every command in docs must be copy-pasteable and match a `make <target>`. Prefer `make pre-commit` for the local gate (alias of `make ci`).
5. **Structure** — keep AGENTS.md lean (target under 150–200 lines). Use tables, lists, explicit Must/Recommend labels, and good-vs-bad examples. Human docs follow Diataxis: tutorials, how-to, reference, explanation — each doc has one job.
6. **Cross-link** — replace duplication with relative links. AGENTS.md points to CONTRIBUTING.md for full workflow; CONTRIBUTING.md points to AGENTS.md for agent-specific rules.
7. **Verify** — run the checklist below before finishing.

Prefer surgical, marker-aware edits over full rewrites. Do not clobber hand-written sections.

## Agent doc rules

- Include only what agents cannot infer: non-obvious build steps, architectural constraints, files to never touch, counter-intuitive patterns.
- Distinguish **Must** (hard rule) from **Recommend** (guidance).
- Split into nested `AGENTS.md` when a monorepo subdirectory has distinct conventions (nearest file wins).
- Fetch [agents.md](https://agents.md/) if online — stay aligned with the spec. If offline, proceed with the rules above.

## Anti-patterns

- Bloated AGENTS.md (over 200 lines without nested files)
- Duplicating README or spec content in AGENTS.md
- Stale commands (`pnpm build` when Makefile wraps it as `make build`)
- Vague guidance ("write good code", "follow best practices")
- Time-sensitive notes ("as of March 2026…") — use versioned specs instead
- Blind auto-generation — human-curated docs outperform LLM-generated dumps

## Verification checklist

- [ ] Every command in AGENTS.md maps to a `make <target>` (check `make help`)
- [ ] AGENTS.md under ~200 lines, or split into nested files with justification
- [ ] No duplicated paragraphs between AGENTS.md and README/CONTRIBUTING/specs
- [ ] Human docs link to specs for depth; agent docs link to CONTRIBUTING for workflow
- [ ] `make pre-commit` referenced as the local gate where pre-push guidance appears
- [ ] Observable-behavior changes have matching spec updates called out
## Docs in this repo

```
README.md, CONTRIBUTING.md, AGENTS.md, Makefile.md, AI_POLICY.md, CHANGELOG.md
specs/          Design specs — source of truth for language, architecture, releases
ops/            Operational runbooks
packages/       Nested AGENTS.md candidate if a package has distinct agent rules
```

- **Makefile** is canonical for all build/test/lint/package/publish commands.
- **Specs** ship in-repo; update alongside code when observable behavior changes.
- **Cross-repo skill sync:** the shared body of this skill is byte-identical across nowline repos; only this section differs. Copy the shared block when updating siblings.
