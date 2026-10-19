// The include-region layer: the dashed border, frame tab, badge and source
// label drawn around the roadmap an `include` pulls in, with that roadmap's own
// swimlanes, edges, markers, non-working bands and wave layers nested inside.

import type {
    BoundingBox,
    PositionedIncludeRegion,
    PositionedRoadmap,
    Theme,
} from '@nowline/layout';
import {
    ACCENT_DASH_PATTERN,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    includeChromeGeometry,
} from '@nowline/layout';
import { renderEdge } from './edges.js';
import {
    renderAnchor,
    renderAnchorCutLine,
    renderMilestone,
    renderMilestoneCutLine,
} from './markers.js';
import type { FontFamilies, RenderOptions } from './render.js';
import { renderSwimlane } from './swimlanes.js';
import { renderNonWorkingBands } from './timeline.js';
import { renderWaveBoundaries, renderWaveCrossings, renderWaveTints } from './waves.js';
import { num, tag, textTag } from './xml.js';

export function renderIncludeRegion(
    r: PositionedIncludeRegion,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
    model?: PositionedRoadmap,
): string {
    const border = palette.includeRegion.border;
    const fill = palette.includeRegion.fill;
    const tabFill = palette.includeRegion.tabFill;
    const tabStroke = palette.includeRegion.tabStroke;
    const tabText = palette.includeRegion.tabText;
    const badgeFill = palette.includeRegion.badgeFill;
    const badgeStroke = palette.includeRegion.badgeStroke;
    const badgeText = palette.includeRegion.badgeText;

    const rx = r.box.x + 8;
    const ry = r.box.y;
    const rw = r.box.width - 16;
    const rh = r.box.height;

    const region = tag('rect', {
        x: num(rx),
        y: num(ry),
        width: num(rw),
        height: num(rh),
        rx: 8,
        ry: 8,
        fill,
        stroke: border,
        'stroke-width': 1,
        'stroke-dasharray': ACCENT_DASH_PATTERN,
    });

    // Chrome geometry — single source of truth shared with the layout
    // (`buildIncludeRegions` calls the same helper to size the dashed
    // bracket so the chrome always fits inside it). All placement Xs
    // come from the helper directly so the renderer stays declarative.
    const tabHeight = FRAME_TAB_HEIGHT_PX;
    const chrome = includeChromeGeometry(r.box.x, r.label, r.sourcePath);
    const tabY = ry - tabHeight / 2;
    const tab = tag('rect', {
        x: num(chrome.tabX),
        y: num(tabY),
        width: num(chrome.tabWidth),
        height: tabHeight,
        rx: 4,
        ry: 4,
        fill: tabFill,
        stroke: tabStroke,
        'stroke-width': 1,
    });
    const tabLabel = textTag(
        {
            x: num(chrome.tabLabelX),
            y: num(tabY + FRAME_TAB_LABEL_BASELINE_OFFSET_PX),
            'font-family': fonts.sans,
            'font-size': 11,
            'font-weight': 600,
            fill: tabText,
        },
        r.label,
    );

    // Content badge to the right of the tab. The glyph here is the
    // stacked-sheets icon, distinct from the item-level link-icon
    // outbound-arrow: an `include` is a content pull (one document
    // brings in another), conceptually different from a `link:` that
    // navigates somewhere.
    const badgeX = chrome.badgeX;
    const badgeSize = chrome.badgeSize;
    const badgeY = ry - badgeSize / 2;
    const badge = tag('rect', {
        x: num(badgeX),
        y: num(badgeY),
        width: badgeSize,
        height: badgeSize,
        rx: 4,
        ry: 4,
        fill: badgeFill,
        stroke: badgeStroke,
        'stroke-width': 1,
    });
    // Glyph: stacked sheets — back rectangle peeking behind front
    // rectangle. Sized for the 18×18 badge tile.
    const glyph = tag('path', {
        d:
            `M${num(badgeX + 7)} ${num(badgeY + 4)} H${num(badgeX + 14)} V${num(badgeY + 11)}` +
            ` M${num(badgeX + 4)} ${num(badgeY + 7)} H${num(badgeX + 11)} V${num(badgeY + 14)} H${num(badgeX + 4)} Z`,
        stroke: badgeText,
        'stroke-width': 1.4,
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    });
    // Halo behind the source-path text. The text's baseline at `ry + 4`
    // straddles the dashed region border (drawn at y = ry); without a
    // backing rect the dashed stroke cuts through the text body. Matches
    // how the tab and badge already mask the border where they cross it.
    // Fill is `includeRegion.fill` — same cream/tint as the region, near
    // the canvas surface above, so the halo disappears into both.
    const sourceFontSize = 9;
    const sourceTextY = ry + 4;
    const sourceHalo = tag('rect', {
        x: num(chrome.sourceHaloX),
        y: num(sourceTextY - sourceFontSize),
        width: num(chrome.sourceHaloWidth),
        height: sourceFontSize + 6,
        fill,
    });
    const sourceText = textTag(
        {
            x: num(chrome.sourceTextX),
            y: num(sourceTextY),
            'font-family': fonts.mono,
            'font-size': sourceFontSize,
            fill: badgeText,
        },
        r.sourcePath,
    );

    // The opaque region fill hides the global wave layers, so a roadmap
    // with waves re-emits its styled tints and boundaries over it, clipped
    // to the painted region rect by rect intersection (no clipPath, no new
    // defs), and the region's own crossings over its nested lanes
    // (specs/waves.md §9.8). The strip stays global.
    const clip: BoundingBox = { x: rx, y: ry, width: rw, height: rh };
    // The same opaque fill hides the global non-working bands, so they are
    // re-emitted over it the same way, under the wave layers.
    const bandsUnder = model
        ? renderNonWorkingBands(model.timeline, model.chartBox.y, palette, clip)
        : '';
    const waveUnder = model?.waves
        ? renderWaveTints(model.waves, clip) + renderWaveBoundaries(model.waveBoundaries, clip)
        : '';
    const waveOver = model?.waves ? renderWaveCrossings(r.waveCrossings) : '';

    // Nested swimlanes (laid out by buildIncludeRegions against the parent's timeline).
    const nested = r.nestedSwimlanes
        .map((s) => renderSwimlane(s, options, idPrefix, palette, fonts))
        .join('');
    // The region's own dependency edges, behind its bars as on the host.
    const edges = (r.edges ?? []).map((e) => renderEdge(e, palette)).join('');
    // The region's own anchors and milestones: cut lines over its lanes,
    // then the diamonds and labels of its marker row, as on the host.
    const anchors = r.anchors ?? [];
    const milestones = r.milestones ?? [];
    const markers =
        anchors.map((a) => renderAnchorCutLine(a, palette)).join('') +
        milestones.map((m) => renderMilestoneCutLine(m, idPrefix, palette)).join('') +
        anchors.map((a) => renderAnchor(a, palette, fonts)).join('') +
        milestones.map((m) => renderMilestone(m, palette, fonts)).join('');

    return tag(
        'g',
        { 'data-layer': 'include' },
        region +
            bandsUnder +
            waveUnder +
            edges +
            nested +
            waveOver +
            markers +
            tab +
            tabLabel +
            badge +
            glyph +
            sourceHalo +
            sourceText,
    );
}
