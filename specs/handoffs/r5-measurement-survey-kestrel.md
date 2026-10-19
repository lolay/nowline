# R5 m3.s1: the renderer's measurement, surveyed

Survey for [`plan-render-split-kestrel.md`](./plan-render-split-kestrel.md) m3. Read at `283bf38` (after the m2 split): every module under `packages/renderer/src/svg/`. Each entry lists where the renderer measures text or derives geometry instead of reading the positioned model, layout's counterpart, whether the two agree for every input the renderer can see, and the verdict. Tracked on the branch and removed with the plan.

Line numbers are at `283bf38`. Each entry's "Status" says which m3 commit moved it, or why it stays. Every move rendered the parity matrix (`r5-parity.sh check`, 252 renders) byte-identical to the baseline.

## Entries

### E1. `estimateCaptionWidthPx` is a copy of `estimateTextWidth`

- **Renderer:** `primitives.ts:102` `estimateCaptionWidthPx(text, fontSizePx)` returns `text.length * fontSizePx * 0.58`. Callers: `item.ts:80,84` (`renderCapacitySuffix`), `waves.ts:369` (`waveTextWidth`), `swimlanes.ts:235` (lane footnote-indicator width).
- **Layout:** `text-measure.ts:14` `estimateTextWidth(text, fontSize)`, the same expression in the same operand order. Not exported from `@nowline/layout` at `283bf38`.
- **Agree:** yes, for every input (identical expression, so identical doubles).
- **Verdict:** move in s2: export `estimateTextWidth`, delete the copy.
- **Status:** moved in m3.s2 (`02c9aba`): `estimateTextWidth` exported from `@nowline/layout`, `estimateCaptionWidthPx` deleted.

### E2. Wave strip label width (`waveTextWidth`, bold)

- **Renderer:** `waves.ts:368-371` `waveTextWidth(text, true)` is `estimateCaptionWidthPx(text, 10) * MARKER_BOLD_WIDTH_FACTOR`, read at `waves.ts:464` for the strip label's halo width (`:472`) and its clamp left of the superscripts (`:469`).
- **Layout:** `nodes/wave-node.ts:257` (`fitStripLabel`) computes `estimateTextWidth(text, WAVE_STRIP_LABEL_FONT_SIZE_PX) * MARKER_BOLD_WIDTH_FACTOR` for the candidate that won, but does not keep it.
- **Agree:** yes, for every label (same expression; the renderer measures the label `fitStripLabel` returned).
- **Verdict:** move in s2: carry the winning label's bold width on `PositionedWaveStrip`.
- **Status:** moved in m3.s2 (`02c9aba`): `estimateTextWidth` exported from `@nowline/layout`; `PositionedWaveStrip.labelWidth`. Once m3.s5 (`781c7a0`) carried the label's drawn x and halo (E4), nothing read `labelWidth`; the m3.s4 fix-up (`045731f`) removed it.

### E3. Wave gap-label and placeholder halo widths (`waveTextWidth`, regular)

- **Renderer:** `waves.ts:392-393` `mutedText` sizes a halo `waveTextWidth(text, false) + 2 * WAVE_LABEL_HALO_PAD_PX` for the gap floor label (`:426`) and the all-empty placeholder (`:418`).
- **Layout:** the gap label's width is computed at `nodes/wave-node.ts:171` (`estimateTextWidth(span.floorRef, 10)`) for its fit test. The placeholder is built at `nodes/wave-node.ts:229` and copied onto `timeline.waveStrip.placeholder` by `phases/finalize.ts:911-912`; nothing measures it.
- **Agree:** gap label yes (same expression). Placeholder: no layout value exists.
- **Verdict:** gap label width: move in s2 (carry on `gapLabel`). Placeholder width: leave (see F1).
- **Status:** gap label moved in m3.s2 (`02c9aba`) (`gapLabel.width`); placeholder left (F1): the renderer measures it with layout's `estimateTextWidth`. Once m3.s5 (`781c7a0`) carried `gapLabel.halo` (E4), nothing read `gapLabel.width`; the m3.s4 fix-up (`045731f`) removed it.

### E4. Wave label halo boxes and superscript offsets

- **Renderer:** `waves.ts:386-388` (baseline, halo y and height), `:447-449` and `:184-201` (`waveCellBox`: the strip cell clipped to the timeline panel, inset by half its stroke), `:450-462` (superscript halo from `footnoteIndicators.length * ITEM_FOOTNOTE_INDICATOR_STEP_PX`), `:464-480` (label x clamped left of the superscripts, label halo box), `:498` (first superscript x), `:426` and `:418` (gap label and placeholder halo boxes).
- **Layout:** `nodes/wave-node.ts:120-137` computes the visible cell span (`cellLeft..cellRight`, unclipped by the half-pixel inset) and the superscript width for the fit; the boxes themselves are not kept. Timeline box and strip y are final when `buildWaves` runs (`phases/finalize.ts:897-916`, step f9, after `extendTimeline` and `fitWidths`).
- **Agree:** the inputs layout sees (`ctx.timeline.box`, `strip`, the label width from E2) are the objects the renderer reads, so the same expressions over them give the same doubles.
- **Verdict:** move in s5: carry the painted cell box, the label's drawn x and halo, the superscript halo and first superscript x, and the gap label's halo on the positioned wave. The placeholder halo stays with F1.
- **Status:** moved in m3.s5 (`781c7a0`): `PositionedWaveStrip.cell` (from `stripCellBox`, the renderer's `waveCellBox` arithmetic), `labelDraw` (`x`, `halo`), `superscripts` (`rightX`, `halo`) and `gapLabel.halo`; `WAVE_LABEL_HALO_PAD_PX`, `WAVE_LABEL_HALO_INSET_Y_PX` and `WAVE_CELL_INSET_PX` moved to layout's `themes/shared.ts` (exported; the renderer still needs the inset for the cell corners and the halo constants for F1). The matrix has no wave superscripts, so a scratch roadmap (Example 1 with footnotes on two waves) was also rendered on both sides: identical. The placeholder halo stays in the renderer (F1).

### E5. Status-key table and `pickStatusDotPalette`

- **Renderer:** `item.ts:327-345` `renderItemStatusDot` picks `onLight` / `onDark` with `pickStatusDotPalette(i.style.bg, palette)` (`primitives.ts:92-94`, luminance `>= 0.24`) and maps `i.status` through a six-key table (`item.ts:337-345`) with `neutral` as the fallback. `specs/layout-phases.md` §2 non-goals deferred this table to R5.
- **Layout:** none. The theme tokens are `Theme.statusDot` (`themes/shape.ts:228`, `themes/light.ts:252`); `item.style.bg` is final once `measureItem` applies the status tint (`nodes/item-measure.ts:386`), before `sequenceItem` builds the item (`nodes/sequence-item.ts:354`). `PositionedRoadmap.palette` is the same theme object as `ctx.styleCtx.theme` (`phases/finalize.ts:1195`, `layout-context.ts:253`).
- **Agree:** n/a (no counterpart); the move keeps the renderer's code verbatim.
- **Verdict:** move in s3: layout resolves the dot colour and carries it on `PositionedItem`.
- **Status:** moved in m3.s3 (`571f124`): `status-dot.ts` in layout (`statusDotColor`, `pickStatusDotPalette`, verbatim); `PositionedItem.statusDotColor`, set in `sequenceItem`.

### E6. Two `relativeLuminance` copies

- **Renderer:** `primitives.ts:61-76`. Empty string, `none` and `transparent` return 1; `#` is optional; 3-digit hex expands; any length other than 6 after that returns 1; a 6-character non-hex string parses to `NaN` (so `NaN >= 0.24` is false and picks `onDark`).
- **Layout:** `themes/contrast.ts:22` (exported as `relativeLuminance`) goes through `hexToRgb`, which throws on anything that is not 3- or 6-digit hex.
- **Agree:** for `#rgb` / `#rrggbb` yes (same channel maths, same coefficients, same order). For `none`, `transparent` (the painted fill of a `bg:none` bar, `waves.ts:68-70`) and any non-hex string the renderer's returns a value and layout's throws. `style.bg` can be `none` for every item with `bg:none`.
- **Verdict:** move in s3, keeping the renderer's semantics in the moved code under a distinct name (layout's `relativeLuminance` keeps its throwing contract for the contrast tests and wave labels). Not reconciled.
- **Status:** moved in m3.s3 (`571f124`), not reconciled: the renderer's copy is layout's `fillLuminance` (exported in m3.s3 for the `waves.ts` hatch kind), with its semantics kept and a unit test for the non-hex cases. m3.s6 made it layout-internal again once E7 moved.

### E7. Wave hatch kind from bar luminance

- **Renderer:** `waves.ts:72-74` `waveHatchKind(fill)` (luminance `>= 0.24`), called per background bar in `usedWaveHatchKinds` (`:135`) and `hatchOverlay` (`:169`), and for the legend swatch (`:150`, `:588`).
- **Layout:** none.
- **Agree:** n/a.
- **Verdict:** candidate for s6 (not covered by s2-s5): layout resolves each background item's hatch kind and the legend swatch's.
- **Status:** moved in m3.s6 (`d299f05`): layout's `wave-hatch.ts` (`waveHatchKind`, with the 0.24 threshold and `barFill`, verbatim), `PositionedItem.waveHatch` on background items, `WaveLegendEntry.hatch` on the background swatch, and the `WaveHatchKind` type. `hatchOverlay` takes the kind; the renderer no longer computes any luminance, so `fillLuminance` is no longer exported.

### E8. Capacity suffix x positions (`renderCapacitySuffix`)

- **Renderer:** `item.ts:79-84,107-110`: `numberX = x0 + precedingWidth + separator` from `estimateCaptionWidthPx(precedingText)` and a `0.58 em` separator, and the built-in icon's `iconX = numberX + estimateCaptionWidthPx(numberStr) + 0.1 em`. Both call sites (`item.ts:185`, `swimlanes.ts:293`) pass `precedingText = undefined`, so `numberX` is `x0` and only `iconX` depends on a width.
- **Layout:** `capacity.ts:156` `estimateCapacitySuffixWidth` estimates the whole suffix for the item caption fit (`nodes/item-measure.ts:304-319`) and the lane badge (`nodes/swimlane-node.ts:51-66`); the icon offset inside it is not kept.
- **Agree:** the terms are the same expressions over the same values. Carried as one pre-summed offset from the run's start, the renderer would add it once (`x0 + dx`) where it used to add the terms in turn (`(x0 + width) + gap`); the sum can differ in the last bit of a double, which `num()` (2 decimals) shows at an exact rounding tie. It does: see the fixture under E9.
- **Verdict:** move in s4: carry the built-in icon's offset on `PositionedCapacity`; drop the dead `precedingText` path.
- **Status:** moved in m3.s4 (`fe92575`, fixed in `045731f`): `capacityIconDxTerms` and `META_SUFFIX_DX_EM` in layout's `capacity.ts` (exported); `PositionedCapacity.iconDxTerms` on items and lanes; `renderCapacitySuffix` takes the run start and adds the terms to it in order, its unused `precedingText` parameter removed. As first committed, `fe92575` carried one pre-summed `iconDx`, which the parity matrix did not catch but moved icons 0.01 px at rounding ties (fixture under E9); `045731f` carries the terms instead (`[width, gap]` here), so the renderer's sum is the base's by construction. (m3.s6 `d299f05` rewrote the guard as an optional chain to clear a biome `useOptionalChain` warning s4 added.)

### E9. Meta-line icon x (`renderItemMetaLine`, tight width)

- **Renderer:** `item.ts:223-227`: `numberStartX = x + 0.5 em * metaText.length + 0.6 em`, `iconX = numberStartX + 0.5 em * numberStr.length + 0.1 em` (`META_ICON_EM_PER_CHAR`, `META_SUFFIX_DX_EM`). The `<tspan dx>` separators (`:187`, `:209`) are em constants, not widths.
- **Layout:** none; layout reserves `0.58 em` per char for the fit (`nodes/item-measure.ts:315-318`).
- **Agree:** same caveat as E8: one pre-summed offset rounds differently from `(((x + meta) + separator) + number) + gap` at ties.
- **Verdict:** move in s4, with E8 (the same `PositionedCapacity` field: for an item with meta text it holds this offset).
- **Status:** moved in m3.s4 (`fe92575`, fixed in `045731f`) with E8: `META_ICON_EM_PER_CHAR` lives in `capacity.ts`; `PositionedCapacity.iconDxTerms` holds `[tight(metaText), separator, tight(number), gap]` and `renderItemMetaLine` adds them to the caption x in that order, the base's summation order. The `<tspan dx>` separators stay em constants in the renderer. Fixture for the rounding tie (bars ending at fractional x; the base and `045731f` draw the three person icons at `x="1210.84"`, `"1251.09"`, `"1302.34"` in light, dark and grayscale, where `fe92575`'s pre-summed offset drew `1210.85`, `1251.1`, `1302.35`); it is also the renderer regression test "places a meta-line icon by adding each width to the caption x in turn" (`packages/renderer/test/render.test.ts`):

  ```nowline
  nowline v1

  config

  style fte
    capacity-icon: person

  roadmap r "Far probe" start:2026-01-05 scale:1w calendar:business

  swimlane l1 "L1"
    item a1 "A" duration:130.015625d
    item b1 "B" duration:3w capacity:2 style:fte

  swimlane l2 "L2"
    item a2 "A" duration:135.046875d
    item b2 "B" duration:4w capacity:3 style:fte

  swimlane l3 "L3"
    item a3 "A" duration:140.078125d
    item b3 "B" duration:10d capacity:12 style:fte
  ```

### E10. Lane frame-tab badge widths (`renderSwimlane`)

- **Renderer:** `swimlanes.ts:226-243`: capacity badge width `estimateCapacitySuffixWidth(text, icon, 10)` and footnote-indicator width `estimateCaptionWidthPx(indicators.join(','), 10)`, passed to `frameTabGeometry(s.box.x, s.title, s.owner, ...)`.
- **Layout:** `nodes/swimlane-node.ts:61` (`badgeWidthPx`, same call) and `:196-199` (`footnoteIndicatorWidthPx`, same expression), both at `LANE_CAPACITY_BADGE_FONT_SIZE_PX = 10`; used for the tab collision, not kept.
- **Agree:** yes, for every lane (same expressions over the same inputs).
- **Verdict:** move in s5: carry both widths on `PositionedSwimlane`. The tab geometry itself stays a renderer call to layout's `frameTabGeometry` (see F2).
- **Status:** moved in m3.s5 (`781c7a0`): `PositionedSwimlane.capacityBadgeWidth` and `footnoteIndicatorWidth`, the values layout already sized the tab collision with; `renderSwimlane` passes them to `frameTabGeometry`.

### E11. Item caption x (`itemCaptionX`)

- **Renderer:** `item.ts:377-405`: spilled, `box.right + ITEM_CAPTION_SPILL_GAP_PX (+ tile + gap)`; in the bar, `box.x + itemCaptionInsetX(...)`, which reads `RenderOptions.noLinks`.
- **Layout:** `item-bar-geometry.ts:279-311` `layoutSpillCluster` returns `captionX` for the spilled case, adding the tile and the gap as two steps where the renderer adds their sum once.
- **Agree:** spilled case equal up to float association; in-bar case depends on a render option layout never sees.
- **Verdict:** leave: the in-bar branch reads `noLinks`, a renderer option, so the function cannot leave the renderer; the inset itself is already layout's helper (`itemCaptionInsetX`). No text is measured here.
- **Status:** left (reason above).

### E12. Include-region chrome

- **Renderer:** `include-region.ts:70` calls layout's `includeChromeGeometry(r.box.x, r.label, r.sourcePath)`; `:47-50` insets the dashed rect 8 px each side.
- **Layout:** `nodes/include-node.ts:162` calls the same helper on the same inputs to size the region.
- **Agree:** yes (one helper, same inputs).
- **Verdict:** leave: the measurement already lives in layout's helper; the renderer only calls it. Carrying the chrome would mean a write in finalize (out of scope).
- **Status:** left (reason above).

### E13. Drawing-only derivations (no measurement)

Read and judged drawing, not layout: the capacity icon's vertical lift `baselineY - 0.85 em` (`item.ts:110`, `:228`); the overflow-tail caption's `width > 60` threshold and centre (`item.ts:624-629`); link-icon glyph path offsets (`item.ts:586-589`); chip text centre (`item.ts:666-667`); wave cell corner radii and rounded-end paths (`waves.ts:213-243`); edge arrow-head geometry from the last leg (`edges.ts:20-35`) and the rounded orthogonal path (`edges.ts:126-154`); the now-pill's half-stroke edge (`nowline.ts:63-68`); left marker labels end-anchored at `labelBox` right (`markers.ts:30`, `:85`, `timeline.ts:210-214`); grid-line spans (`timeline.ts:44-55`); the logo's `svgIntrinsicSize` fallback (`header.ts:216`), which needs the asset bytes only the renderer has.

- **Verdict:** leave: none of them measures text, and each reads only model fields and drawing constants.
- **Status:** left (reason above).

## Left as follow-ups

- **F1. Wave placeholder halo width.** The all-empty placeholder's halo (`waves.ts:418`) is sized from its text in the renderer. Layout builds the placeholder in `buildWaves` but `phases/finalize.ts:911-912` copies only the string onto `timeline.waveStrip`, and finalize is out of scope for R5. Fixture: none under `tests/` or `examples/` draws the placeholder; a roadmap whose every wave has no members does (`wave w1` with no `wave:w1` item). Carry the width (or the halo box) on `timeline.waveStrip` when finalize is next touched.
- **F2. Frame-tab owner text differs between layout and renderer.** Layout sizes the tab collision with the raw `owner:` value at `box.x = 0` (`nodes/swimlane-node.ts:105-114`); the renderer draws the tab with the resolved display owner (`s.owner`) at `s.box.x` (`swimlanes.ts:237-243`). For an owner whose id and title differ, the drawn tab is wider or narrower than the box layout reserved. Unifying them changes bytes (behaviour), so R5 keeps both calls. Fixture (checked at `045731f`): layout reserves the tab for `owner: sam` (right edge x 116, plus the 8 px gutter), so `a`, wanting x 174.52, is top-aligned with the tab at y 66; the renderer draws the tab for `owner: Samantha Rodriguez-Wellington`, spanning x 10..246 at y 66..88, so the bar overlaps the tab's owner text. With the person's title set to `sam`, the drawn tab ends at x 116 and the bar clears it.

  ```nowline
  nowline v1

  roadmap r "Owner tab" start:2026-01-05 scale:1w

  person sam "Samantha Rodriguez-Wellington"

  swimlane l "Lane" owner:sam
    item a "A" after:2026-01-12 duration:2w
  ```

