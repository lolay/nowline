# Layout v2 prototype

Validates a four-part architecture for `@nowline/layout` before committing to a real refactor. Originally built in `.scratch/`; promoted to a tracked top-level folder so it can be reviewed in a PR. May be removed once a real `m5 — Layout v2` milestone is scoped from these findings.

The four parts:

1. **Scales** — D3-style `TimeScale` and `BandScale` (logical units → pixels, with `invert`).
2. **Measure/place tree** — Y axis: each entity reports its intrinsic size; parents stack.
3. **View presets** — multi-row time headers, declarative label thinning per row.
4. **WorkingCalendar** — non-continuous tick stream so weekends/holidays disappear without rewrites.

X stays time-driven; Y becomes content-driven.

## Layout

```
layout-v2/
├── bin/run.ts             CLI: parse minimal.nowline → prototype layout → SVG + diff.html
├── src/
│   ├── scales.ts          TimeScale, BandScale (wrapping d3-scale)
│   ├── view-preset.ts     ViewPreset, HeaderRow, default presets (day/week/month)
│   ├── working-calendar.ts WorkingCalendar with weekendsOff()/holidays()
│   ├── renderable.ts      Renderable interface + ItemNode/SwimlaneNode/RoadmapNode
│   ├── positioned.ts      Minimal Positioned* types
│   ├── parse.ts           Tiny ad-hoc parser (the architecture is parser-agnostic)
│   ├── render-stub.ts     Minimal SVG emitter (mirrors @nowline/renderer xml.ts)
│   └── build.ts           Composition root
├── test/
│   ├── build.test.ts
│   ├── renderable.test.ts
│   ├── scales.test.ts
│   ├── view-preset.test.ts
│   └── working-calendar.test.ts
├── out/                   Generated artifacts (svg, diff.html) — gitignored
└── findings.md            Validation results
```

## Running

```bash
cd layout-v2
pnpm install --ignore-workspace
pnpm run build
pnpm run run -- ../examples/minimal.nowline
pnpm test
```

`--ignore-workspace` keeps the prototype out of the monorepo's pnpm workspace; it has its own self-contained dependency tree.

## Status

All six validation criteria pass plus a fidelity pass — see [findings.md](findings.md). The recommendation in `findings.md` is to promote this to a real `m5 — Layout v2` milestone in `packages/layout/`.
