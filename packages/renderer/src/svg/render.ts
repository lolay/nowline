import type {
    BoundingBox,
    PositionedFootnoteArea,
    PositionedGroup,
    PositionedIncludeRegion,
    PositionedParallel,
    PositionedRoadmap,
    PositionedSwimlane,
    PositionedTrackChild,
    Theme,
} from '@nowline/layout';
import {
    ACCENT_DASH_PATTERN,
    CONTAINER_BODY_FILL_OPACITY,
    CONTAINER_BRACKET_LINE_OFFSET_PX,
    CONTAINER_HEADER_TITLE_BASELINE_PX,
    CONTAINER_HEADER_TITLE_FONT_SIZE_PX,
    CONTAINER_MAX_FILLED_DEPTH,
    CONTAINER_NESTED_BODY_FILL_OPACITY,
    containerHeaderTitleX,
    estimateCapacitySuffixWidth,
    FONT_STACK,
    FOOTNOTE_HEADER_BASELINE_OFFSET_PX,
    FOOTNOTE_PANEL_PADDING_PX,
    FRAME_TAB_HEIGHT_PX,
    FRAME_TAB_LABEL_BASELINE_OFFSET_PX,
    frameTabGeometry,
    includeChromeGeometry,
} from '@nowline/layout';
import type { LoadedLogo } from '../logo.js';
import { renderEdge } from './edges.js';
import { embedLogo, renderAttributionMark, renderHeader } from './header.js';
import { IdGenerator } from './ids.js';
import { hasAfterPin, renderCapacitySuffix, renderInlineDatePins, renderItem } from './item.js';
import {
    renderAnchor,
    renderAnchorCutLine,
    renderMilestone,
    renderMilestoneCutLine,
} from './markers.js';
import { renderNowline } from './nowline.js';
import { estimateCaptionWidthPx, fontAttrs } from './primitives.js';
import { allShadowDefs } from './shadow.js';
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
import { attrs, escAttr, escText, num, tag, textTag } from './xml.js';

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

/**
 * A group or parallel, drawn above and around its content
 * (specs/true-width-layout.md §3.3): a body shaded with the container's `bg`
 * spanning exactly its dates, a header bracket over those dates (solid for
 * a group, dashed for a parallel by default; `bracket:` styles it), the
 * title at the container's start with any inline-date glyphs beside it,
 * then the children. A wave-only group draws only its children.
 *
 * `depth` is the container's nesting depth inside its lane, 1 for a
 * top-level container. A nested body takes a lighter tint, and bodies deeper
 * than `CONTAINER_MAX_FILLED_DEPTH` are outlined instead of filled, so tints
 * never compound three deep (§8 O4).
 */
function renderContainer(
    c: PositionedGroup | PositionedParallel,
    depth: number,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const parts: string[] = [];
    const isDrawn = !(c.kind === 'group' && c.waveOnly);
    if (isDrawn) {
        const bodyY = c.box.y + c.headerHeight;
        const bodyHeight = c.box.height - c.headerHeight;
        if (c.style.bg !== 'none') {
            const isFilled = depth <= CONTAINER_MAX_FILLED_DEPTH;
            parts.push(
                tag('rect', {
                    x: num(c.box.x),
                    y: num(bodyY),
                    width: num(c.box.width),
                    height: num(bodyHeight),
                    fill: isFilled ? c.style.bg : 'none',
                    'fill-opacity': isFilled
                        ? depth === 1
                            ? CONTAINER_BODY_FILL_OPACITY
                            : CONTAINER_NESTED_BODY_FILL_OPACITY
                        : null,
                    stroke: isFilled ? null : c.style.bg,
                    'stroke-opacity': isFilled ? null : 0.6,
                    'stroke-width': isFilled ? null : 1,
                }),
            );
        }
        // The title and the bracket share one ink, the header's: a group's
        // `fg`, a parallel's bracket stroke. The title sits on the lane band,
        // never on the body, so a `text:` colour chosen to read on `bg`
        // (white on a filled chiclet, before the header) would vanish.
        const ink = c.kind === 'group' ? c.style.fg : palette.parallel.bracketStroke;
        if (c.headerHeight > 0 && c.style.bracket !== 'none') {
            const lineY = c.box.y + CONTAINER_BRACKET_LINE_OFFSET_PX;
            const x0 = c.box.x;
            const x1 = c.box.x + c.box.width;
            parts.push(
                tag('path', {
                    d: `M${num(x0)} ${num(bodyY)} V${num(lineY)} H${num(x1)} V${num(bodyY)}`,
                    fill: 'none',
                    stroke: ink,
                    'stroke-width': 1.2,
                    'stroke-dasharray': c.style.bracket === 'dashed' ? '3 2' : null,
                }),
            );
        }
        if (c.title && c.headerHeight > 0) {
            parts.push(
                textTag(
                    {
                        // Past the `after:` glyph when there is one; layout
                        // clamps the `before:` glyph past this text.
                        x: num(containerHeaderTitleX(c.box.x, hasAfterPin(c.inlineDatePins))),
                        y: num(c.box.y + CONTAINER_HEADER_TITLE_BASELINE_PX),
                        ...fontAttrs(c.style, fonts, CONTAINER_HEADER_TITLE_FONT_SIZE_PX),
                        'font-weight': 600,
                        fill: ink,
                    },
                    c.title,
                ),
            );
        }
        // The glyphs sit in the header's title row, never on a child, so
        // painting them before the children is safe.
        parts.push(renderInlineDatePins(c.inlineDatePins, c.style.fg));
    }
    for (const child of c.children) {
        parts.push(renderTrackChild(child, options, idPrefix, palette, fonts, depth));
    }
    return tag('g', { 'data-layer': c.kind, 'data-id': c.id ?? null }, parts.join(''));
}

function renderTrackChild(
    c: PositionedTrackChild,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
    parentDepth = 0,
): string {
    if (c.kind === 'item') return renderItem(c, options, idPrefix, palette, fonts);
    return renderContainer(c, parentDepth + 1, options, idPrefix, palette, fonts);
}

// Renders only the swimlane's background tint rect. Emitted before the
// chart-body grid lines so those lines visibly span the full chart width.
// The frame tab (chiclet at top-left) and item content are emitted later,
// in renderSwimlaneContent, so they appear on top of the grid.
// Tri-state lane utilization underline. Painted along the bottom edge of
// the band when the lane has `capacity:` AND at least one item contributing
// load AND has not opted out of every color band via `utilization-*-at:none`.
// Geometry per specs/rendering.md § Lane utilization underline:
//   - height: 2px (matches the milestone-line stroke weight)
//   - y: flush with the bottom edge of the band, fully inside it
//   - x: aligned to the segment boundaries the layout already pre-coalesced
// One <rect> per coalesced segment; classification → palette token mapping
// is the only renderer-side decision.
const LANE_UTILIZATION_HEIGHT_PX = 2;

function utilizationColor(classification: 'green' | 'yellow' | 'red', palette: Theme): string {
    switch (classification) {
        case 'green':
            return palette.swimlane.utilizationOk;
        case 'yellow':
            return palette.swimlane.utilizationWarn;
        case 'red':
            return palette.swimlane.utilizationOver;
    }
}

function renderLaneUtilization(s: PositionedSwimlane, palette: Theme): string {
    if (!s.utilization || s.utilization.segments.length === 0) return '';
    const y = s.box.y + s.box.height - LANE_UTILIZATION_HEIGHT_PX;
    const rects = s.utilization.segments.map((seg) => {
        const width = seg.endX - seg.startX;
        if (width <= 0) return '';
        return tag('rect', {
            x: num(seg.startX),
            y: num(y),
            width: num(width),
            height: LANE_UTILIZATION_HEIGHT_PX,
            fill: utilizationColor(seg.classification, palette),
            'data-utilization': seg.classification,
            'data-load': num(seg.load),
        });
    });
    return tag(
        'g',
        {
            'data-layer': 'lane-utilization',
            'data-id': s.id ?? null,
        },
        rects.join(''),
    );
}

function renderSwimlaneBg(s: PositionedSwimlane, palette: Theme): string {
    const tint = s.bandIndex % 2 === 0 ? palette.swimlane.rowTintEven : palette.swimlane.rowTintOdd;
    const borderColor = palette.swimlane.border;
    return tag(
        'g',
        { 'data-layer': 'swimlane-bg', 'data-id': s.id ?? null },
        tag('rect', {
            x: num(s.box.x),
            y: num(s.box.y),
            width: num(s.box.width),
            height: num(s.box.height),
            fill: tint,
            stroke: borderColor,
            'stroke-width': 1,
        }),
    );
}

function renderSwimlane(
    s: PositionedSwimlane,
    options: RenderOptions,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    const tabFill = palette.swimlane.tabFill;
    const tabStroke = palette.swimlane.tabStroke;
    const tabText = palette.swimlane.tabText;
    const ownerText = palette.swimlane.ownerText;
    const footnoteColor = palette.swimlane.footnoteIndicator;
    const parts: string[] = [];
    // Frame-tab chiclet at the top-left of the band — auto-sized to fit
    // title + owner. Geometry comes from the shared `frameTabGeometry`
    // helper that the layout's row-packer also calls, so the chiclet's
    // visible footprint matches the collision box layout reserved for it.
    if (s.title) {
        // Lane capacity badge + footnote indicator sit inside the frame
        // tab after the owner (or after the title if no owner). Compute
        // both widths up-front so `frameTabGeometry` can size the chiclet
        // to fit them, then read the placement positions back out — no
        // second placement pass in the renderer.
        const LANE_BADGE_FONT_SIZE_PX = 10;
        const capacityBadgeBareWidthPx = s.capacity
            ? estimateCapacitySuffixWidth(s.capacity.text, s.capacity.icon, LANE_BADGE_FONT_SIZE_PX)
            : 0;
        // Footnote indicator is a comma-joined number list painted at
        // 10 pt 700-weight; estimate via the shared caption helper.
        const footnoteIndicatorText =
            s.footnoteIndicators.length > 0 ? s.footnoteIndicators.join(',') : '';
        const footnoteIndicatorWidthPx = footnoteIndicatorText
            ? estimateCaptionWidthPx(footnoteIndicatorText, LANE_BADGE_FONT_SIZE_PX)
            : 0;
        const tab = frameTabGeometry(
            s.box.x,
            s.title,
            s.owner,
            capacityBadgeBareWidthPx,
            footnoteIndicatorWidthPx,
        );
        const tabH = FRAME_TAB_HEIGHT_PX;
        const tabY = s.box.y + 10;
        const labelY = tabY + FRAME_TAB_LABEL_BASELINE_OFFSET_PX;
        parts.push(
            tag('rect', {
                x: num(tab.tabX),
                y: num(tabY),
                width: num(tab.tabW),
                height: num(tabH),
                rx: 4,
                ry: 4,
                fill: tabFill,
                stroke: tabStroke,
                'stroke-width': 1,
            }),
        );
        parts.push(
            textTag(
                {
                    x: num(tab.titleX),
                    y: num(labelY),
                    'font-family': fonts[s.style.font],
                    'font-size': 12,
                    'font-weight': 600,
                    fill: tabText,
                },
                s.title,
            ),
        );
        if (s.owner) {
            parts.push(
                textTag(
                    {
                        x: num(tab.ownerX),
                        y: num(labelY),
                        'font-family': fonts[s.style.font],
                        'font-size': 10,
                        fill: ownerText,
                    },
                    `owner: ${s.owner}`,
                ),
            );
        }
        if (s.capacity) {
            // Re-uses the same `renderCapacitySuffix` helper that paints
            // item-level suffixes (m6) so multiplier / built-in SVG /
            // inline literal / dereferenced-custom-glyph paths stay
            // consistent across both contexts.
            parts.push(
                renderCapacitySuffix(
                    s.capacity,
                    undefined,
                    tab.badgeX,
                    labelY,
                    LANE_BADGE_FONT_SIZE_PX,
                    fonts[s.style.font],
                    ownerText,
                ),
            );
        }
        if (footnoteIndicatorText) {
            parts.push(
                textTag(
                    {
                        x: num(tab.footnoteRightX),
                        y: num(tabY + 14),
                        'font-family': fonts.sans,
                        'font-size': LANE_BADGE_FONT_SIZE_PX,
                        'font-weight': 700,
                        fill: footnoteColor,
                        'text-anchor': 'end',
                    },
                    footnoteIndicatorText,
                ),
            );
        }
    }
    for (const c of s.children) {
        parts.push(renderTrackChild(c, options, idPrefix, palette, fonts));
    }
    // m13: tri-state utilization underline along the band's bottom edge.
    // Painted after items so it overlays any item that happens to extend
    // to the band's bottom; under cut-lines / now-line which run as
    // separate top-level passes.
    parts.push(renderLaneUtilization(s, palette));
    return tag('g', { 'data-layer': 'swimlane', 'data-id': s.id ?? null }, parts.join(''));
}

function renderFootnotes(
    f: PositionedFootnoteArea,
    idPrefix: string,
    palette: Theme,
    fonts: FontFamilies,
): string {
    if (f.entries.length === 0) return '';
    const panelFill = palette.footnotePanel.fill;
    const borderColor = palette.footnotePanel.border;
    const headerColor = palette.footnotePanel.header;
    const titleColor = palette.footnotePanel.title;
    const descColor = palette.footnotePanel.description;
    const numberColor = palette.footnotePanel.number;
    const parts: string[] = [];
    parts.push(
        tag('rect', {
            x: num(f.box.x),
            y: num(f.box.y),
            width: num(f.box.width),
            height: num(f.box.height),
            rx: 6,
            ry: 6,
            fill: panelFill,
            stroke: borderColor,
            'stroke-width': 1,
            filter: `url(#${idPrefix}-shadow-subtle)`,
        }),
    );
    parts.push(
        textTag(
            {
                x: num(f.box.x + FOOTNOTE_PANEL_PADDING_PX),
                y: num(f.box.y + FOOTNOTE_HEADER_BASELINE_OFFSET_PX),
                'font-family': fonts.sans,
                'font-size': 12,
                'font-weight': 700,
                fill: headerColor,
            },
            'Footnotes',
        ),
    );
    // Layout places every row: the entry's number on its first row, the
    // title and description lines (wrapped ones included) at their own
    // baselines, and a region's heading row above its first entry.
    const numberX = f.box.x + FOOTNOTE_PANEL_PADDING_PX;
    for (const e of f.entries) {
        if (e.region !== undefined && e.regionHeadingY !== undefined) {
            parts.push(
                textTag(
                    {
                        x: num(numberX),
                        y: num(e.regionHeadingY),
                        'font-family': fonts.sans,
                        'font-size': 10,
                        'font-weight': 700,
                        fill: headerColor,
                    },
                    e.region,
                ),
            );
        }
        parts.push(
            textTag(
                {
                    x: num(numberX),
                    y: num(e.y),
                    'font-family': fonts.sans,
                    'font-size': 10,
                    'font-weight': 700,
                    fill: numberColor,
                },
                String(e.number),
            ),
        );
        for (const line of e.titleLines) {
            parts.push(
                textTag(
                    {
                        x: num(line.x),
                        y: num(line.y),
                        'font-family': fonts.sans,
                        'font-size': 11,
                        'font-weight': 600,
                        fill: titleColor,
                    },
                    line.text,
                ),
            );
        }
        for (const line of e.descriptionLines ?? []) {
            parts.push(
                textTag(
                    {
                        x: num(line.x),
                        y: num(line.y),
                        'font-family': fonts.sans,
                        'font-size': 11,
                        fill: descColor,
                    },
                    line.text,
                ),
            );
        }
    }
    return tag('g', { 'data-layer': 'footnotes' }, parts.join(''));
}

function renderIncludeRegion(
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

// These helpers are kept in the exports table so tsc doesn't prune them.
void escAttr;
void escText;
