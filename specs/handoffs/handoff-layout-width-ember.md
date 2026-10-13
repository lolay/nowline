# Handoff: LayoutOptions.width no-op

Branch: `claude/stoic-darwin-r467wd` (harness-assigned).

## Done

- Research and options: [`plan-layout-width-ember.md`](./plan-layout-width-ember.md).
- Pick: (a) best-effort maximum, default unset, pixels-per-day floor of 1 (`MIN_PIXELS_PER_DAY`), never raised above natural.
- Implementation: `packages/layout/src/canvas-width.ts` (`cappedPixelsPerDay`), wired in `nodes/roadmap-node.ts`; the dead `min`/`max` pair is gone.
- Tests (each fails without the fix): `packages/layout/test/canvas-width.test.ts`, CLI `--width` case in `packages/cli/test/integration/cli.render.test.ts`, MCP review-raster cap in `packages/mcp/test/mcp.smoke.test.ts`.
- Docs: help.ts, man en + fr (fr stamp refreshed), `specs/cli.md`, `specs/rendering.md` § Canvas width, `specs/ide.md`, CLI and VS Code READMEs, both VS Code width setting descriptions, MCP schema text, JSDoc on every surface, CHANGELOG `### Fixed`.
- Verified: `make pre-commit` green; all 46 `examples/` + `tests/` SVGs byte-identical before and after; no snapshot changed; `make determinism` (Node + CLI legs) 314/314 with unchanged goldens.

## Pending

- PR not opened (waits on the user).
- Browser determinism leg not run locally; default path is the same code as the Node leg.
- Remove these two handoff files (or promote) as the last commit before merge.
- Related card: CLI reading `width` from `.nowlinerc` can now proceed.
