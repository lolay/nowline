// Entry point of the SVG renderer: the option types, `renderSvg` and the
// `__internal` test hook. `renderSvg` draws the layer modules bottom to top:
//   shadow.ts defs, waves.ts hatch patterns, then the background;
//   timeline.ts header strip; waves.ts strip; swimlanes.ts lane backgrounds;
//   timeline.ts non-working bands; waves.ts tints; timeline.ts grid lines;
//   waves.ts boundaries and labels; edges.ts dependency arrows;
//   swimlanes.ts lanes (their bars come from item.ts); include-region.ts;
//   waves.ts crossings; markers.ts cut lines; timeline.ts non-working labels;
//   markers.ts anchors and milestones; nowline.ts now-line;
//   footnotes.ts panel; waves.ts legend; header.ts card, attribution mark
//   and logo.
// Shared helpers live in primitives.ts.

import type { PositionedRoadmap } from '@nowline/layout';
import { FONT_STACK } from '@nowline/layout';
import type { LoadedLogo } from '../logo.js';
import { renderEdge } from './edges.js';
import { renderFootnotes } from './footnotes.js';
import { embedLogo, renderAttributionMark, renderHeader } from './header.js';
import { IdGenerator } from './ids.js';
import { renderIncludeRegion } from './include-region.js';
import { renderItem } from './item.js';
import {
    renderAnchor,
    renderAnchorCutLine,
    renderMilestone,
    renderMilestoneCutLine,
} from './markers.js';
import { renderNowline } from './nowline.js';
import { allShadowDefs } from './shadow.js';
import { renderSwimlane, renderSwimlaneBg } from './swimlanes.js';
import {
    renderGridLines,
    renderNonWorkingBands,
    renderNonWorkingLabels,
    renderTimeline,
} from './timeline.js';
import {
    hasOverrunArrow,
    renderWaveBoundaries,
    renderWaveCrossings,
    renderWaveLabels,
    renderWaveLegend,
    renderWaveStrip,
    renderWaveTints,
    usedWaveHatchKinds,
    waveHatchPatternDef,
} from './waves.js';
import { attrs, num, tag } from './xml.js';

// Browser-safe types. The renderer never touches `fs`, `path`, or `Buffer`.
// Callers inject an AssetResolver when they want logos embedded.
export interface AssetBytes {
    bytes: Uint8Array;
    mime: string;
}

export type AssetResolver = (ref: string) => Promise<AssetBytes>;

/**
 * Per-role `font-family` strings the renderer stamps onto `<text>` elements.
 * Defaults to the shared, portable `FONT_STACK` (generic CSS stacks). Raster
 * and preview callers override this with a *pinned* family (e.g. the bundled
 * `DejaVu Sans` / `DejaVu Sans Mono`) so the rendered SVG names exactly the
 * font that resvg / the webview `@font-face` actually provide — the WYSIWYG
 * contract. The `.svg` file export keeps the default portable stack.
 */
export type FontFamilies = Record<'sans' | 'serif' | 'mono', string>;

export interface RenderOptions {
    assetResolver?: AssetResolver;
    /**
     * The logo `loadLogo` already read. Its bytes are embedded as they are,
     * so the asset is not resolved a second time. Omitted: `renderSvg`
     * resolves the logo through `assetResolver`.
     */
    logo?: LoadedLogo;
    noLinks?: boolean;
    strict?: boolean;
    warn?: (message: string) => void;
    // Override the deterministic id prefix (defaults to 'nl').
    idPrefix?: string;
    /**
     * Override per-role `font-family` strings. Defaults to the portable
     * `FONT_STACK`. Set to a pinned family for raster/preview WYSIWYG.
     */
    fontFamilies?: FontFamilies;
}

export async function renderSvg(
    model: PositionedRoadmap,
    options: RenderOptions = {},
): Promise<string> {
    const ids = new IdGenerator(options.idPrefix ?? 'nl');
    const idPrefix = ids.next('root');

    const palette = model.palette;
    // Per-role family strings stamped onto every <text>. Defaults to the
    // portable FONT_STACK; raster/preview callers pass a pinned bundled
    // family so the SVG names exactly the font the consumer provides.
    const fonts: FontFamilies = options.fontFamilies ?? FONT_STACK;
    const parts: string[] = [];

    // <defs> — shadows + the milestone arrow markers (palette-driven fill
    // baked in). Dependency arrows draw their own heads (`renderEdge`), so
    // the milestone slack line's dark marker and the overrun arrow's red one
    // are the only ones. Their ids carry the per-render prefix: several SVGs
    // inlined in one HTML page share an id namespace and `url(#id)` resolves
    // to the first match, so a global id would paint one diagram's
    // arrowheads (and theme) onto another.
    const arrowDef = (id: string, fill: string): string =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`;
    const defs =
        `<defs>${allShadowDefs(idPrefix)}` +
        arrowDef(`${idPrefix}-arrow-dark`, palette.arrowhead.dark) +
        // The overrun arrow's red head, only when a milestone draws one.
        (hasOverrunArrow(model)
            ? arrowDef(`${idPrefix}-arrow-overrun`, palette.milestoneDiamond.cutLineOverrun)
            : '') +
        // Wave hatch patterns, only those a bar or the legend uses.
        usedWaveHatchKinds(model)
            .map((k) => waveHatchPatternDef(idPrefix, k, palette))
            .join('') +
        `</defs>`;
    parts.push(defs);

    // Background
    parts.push(
        tag('rect', {
            x: 0,
            y: 0,
            width: num(model.width),
            height: num(model.height),
            fill: model.backgroundColor,
        }),
    );

    // Timeline header strip (panels + date labels). Chart-body grid
    // lines used to live here too, but they were occluded by the
    // swimlane background rects emitted later — so the major dotted
    // and minor grid lines never actually rendered in the chart body.
    // They now ship as their own layer below.
    parts.push(renderTimeline(model.timeline, palette, fonts));
    // Wave strip panel and cells, under the grid like the tick panel.
    parts.push(renderWaveStrip(model, palette));

    // Swimlane backgrounds — emitted as their own pass so the grid
    // lines can be drawn on top of them, then the swimlane content
    // (frame tab + items) sits on top of the grid.
    for (const s of model.swimlanes) parts.push(renderSwimlaneBg(s, palette));

    // Non-working bands under `show`, over the lane rows and under the
    // wave tints and the grid; nothing under `hide`.
    parts.push(renderNonWorkingBands(model.timeline, model.chartBox.y, palette));

    // Styled wave column tints, over the lane rows and under the grid.
    if (model.waves) parts.push(renderWaveTints(model.waves));

    // Chart-body grid lines (major dotted at every labeled tick, plus
    // optional faint minor lines when minor-grid is set). Drawn after
    // swimlane backgrounds so they actually span the chart body, but
    // before items and overlays so item bars sit cleanly on top.
    parts.push(renderGridLines(model.timeline, model.chartBox.y, palette));

    // Wave boundaries over the grid and the marker-row panel but under
    // the bars, then the strip labels, diamonds and gap labels on top of
    // them (specs/waves.md §9.9).
    parts.push(renderWaveBoundaries(model.waveBoundaries));
    parts.push(renderWaveLabels(model, palette, fonts));

    // Dependency arrows go BEFORE swimlane / item content: their legs
    // pass behind the bars they cross (specs/true-width-layout.md §3.4).
    // Each lands in a gap between rows, so its head stays in view.
    for (const e of model.edges) parts.push(renderEdge(e, palette));

    // Swimlane content (frame tabs + items) on top of the grid lines.
    for (const s of model.swimlanes)
        parts.push(renderSwimlane(s, options, idPrefix, palette, fonts));

    // Include regions (drawn after own swimlanes so the dashed border + tab
    // overlay the chart, with their own nested swimlanes inside).
    for (const r of model.includes)
        parts.push(renderIncludeRegion(r, options, idPrefix, palette, fonts, model));

    // Wave crossings over the main lanes' background bars.
    parts.push(renderWaveCrossings(model.waveCrossings));

    // Anchor + milestone cut lines drawn AFTER items so they overlay the
    // swimlane fills.
    for (const a of model.anchors) parts.push(renderAnchorCutLine(a, palette));
    for (const m of model.milestones) parts.push(renderMilestoneCutLine(m, idPrefix, palette));

    // Titled non-working runs: their marker-row labels, and under `hide`
    // the named cut lines, over the bars like the milestone cut lines.
    parts.push(renderNonWorkingLabels(model.timeline, palette, fonts));

    // Marker-row diamonds + labels.
    for (const a of model.anchors) parts.push(renderAnchor(a, palette, fonts));
    for (const m of model.milestones) parts.push(renderMilestone(m, palette, fonts));

    // Now-line
    parts.push(renderNowline(model.nowline, palette, fonts));

    // Footnotes + header last (always on top)
    parts.push(renderFootnotes(model.footnotes, idPrefix, palette, fonts));
    parts.push(renderWaveLegend(model.waveLegend, idPrefix, palette, fonts));
    parts.push(renderHeader(model.header, idPrefix, palette, fonts));
    parts.push(renderAttributionMark(model, fonts));

    // Logo (if header carries one)
    if (model.header.logo && (options.logo || options.assetResolver)) {
        const logoSvg = await embedLogo(
            model.header.logo,
            options.assetResolver,
            idPrefix,
            options,
        );
        if (logoSvg) parts.push(logoSvg);
    }

    const svgAttrs = attrs({
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${num(model.width)} ${num(model.height)}`,
        width: num(model.width),
        height: num(model.height),
        'data-theme': model.theme,
        'data-generator': 'nowline',
    });
    return `<svg${svgAttrs}>${parts.join('')}</svg>`;
}

// Exported for tests.
export const __internal = {
    renderItem,
    renderSwimlane,
    renderTimeline,
    renderHeader,
    renderEdge,
};
