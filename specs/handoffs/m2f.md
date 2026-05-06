# m2f Handoff — Sample platform-2026-dark

## Scope

Tighten the dark theme palette so the renderer's `--theme dark` output matches [`specs/samples/platform-2026-dark.svg`](../samples/platform-2026-dark.svg). Reuses the m2e source ([`examples/platform-2026.nowline`](../../examples/platform-2026.nowline)) — no new geometry, no new DSL.

**Milestone:** m2f
**Type:** Open source (Apache 2.0, Lolay, Inc.)
**Repo:** `lolay/nowline`

## What to Build

### 1. Dark-theme palette overhaul — `packages/layout/src/themes/dark.ts`

Replace the existing slate/grey 900 mix with the slate-on-near-black pairings used in the sample:

- `surface.page` `#0b1220` (was `#121212`)
- `surface.chart` / `surface.headerBox` `#111827` (was `#1e1e1e`)
- `swimlane.bandEven` `#111827`, `bandOdd` `#0f172a`, `separator` `#1f2937`
- `swimlane.frameTabText` `#e2e8f0`, `frameTabMuted` `#94a3b8`
- `timeline.gridLine` `#1f2937`, `tickMark` `#334155`, `labelText` `#94a3b8`
- `nowline.stroke` `#f87171`, `labelBg` `#f87171`, `labelText` `#0b1220`
- `milestone.dashedInk` `#a5b4fc` (was `#757575`); `overrun` `#ef4444`
- `dependency.edgeStroke` `#94a3b8` (was `#9e9e9e`)
- `footnote.indicatorText` `#f87171`
- `attribution.mark` `#475569`, `link` `#60a5fa`
- `status.done` `#34d399`, `inProgress` `#60a5fa`, `atRisk` `#facc15`, `blocked` `#ef4444`, `planned/neutral` `#94a3b8`
- `entities.item.bg` `#0f172a` (was `#1976d2`); `text` `#e2e8f0`; `fg` `#94a3b8` so the status-tinted bg overrides apply consistently

### 2. Renderer adjustments

The renderer already branches on `theme` for most palette decisions (header card, timeline panel, swimlane band, frame tab, anchor diamond, milestone diamond, cut lines, footnote panel, attribution mark). The remaining gaps:

- **Now-line pill text:** dark theme should use `#0b1220` for the "now" label text, not `#ffffff`. Update `renderNowline` to pick a label color matching the pill background's contrast.
- **Status-tinted item backgrounds in dark:** `layout.ts` currently only tints when bg is `#ffffff` and theme is light. Mirror the rule for dark — tint `#0b1220`/`#0f172a` (theme-default item bg) with the dark-friendly status fills (`#052e16`, `#172554`, `#422006`, `#7f1d1d`, `#1e293b`).
- **Footnote panel border:** thin slate-700 stroke (already `#334155` via the existing branch).

### 3. Tests

- The existing `dark theme marker` integration test in `cli.render.test.ts` keeps working unchanged.
- No new snapshot tests; visual diff via `examples/platform-2026-dark.svg` ↔ `specs/samples/platform-2026-dark.svg` (the m2f rendering pass is already wired in `scripts/render-samples.mjs`).

## What NOT to Build

- No new DSL or layout geometry.
- No new sample artifacts — the source is shared with m2e.
- No light-theme touch-ups (m2d already shipped).

## Definition of Done

- [ ] Dark sample renders with slate-on-near-black palette (no Material 900 grays).
- [ ] Status tints match the dark sample (`done` reads as deep green, `in-progress` as deep blue, etc.).
- [ ] Now-line label text reads dark on the red pill.
- [ ] Existing tests pass.
- [ ] m2f strikethrough applied to `specs/milestones.md`.

## Resolutions

1. **Milestone cut line color shifts to indigo-200 in dark** — pure white would compete with the now-line; the indigo tint reads as "structural separator" and stays distinct from the red.

2. **Item bg lookup:** layout's status-tint rule now keys off `(theme.name === 'dark' && bg in {#0f172a,#0b1220})` in addition to the existing light-theme `#ffffff` check. This keeps the rule inside the layout (renderer stays palette-dumb) per m2d Resolution 3.

3. **Status-tinted bg colors are baked in `layout.ts`, not the theme file.** They're a fixed policy ("done = deep green, in-progress = deep blue, …") — keeping them in code avoids a cross-cutting theme schema change that m2g/m2h won't need.
