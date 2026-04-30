import type {
    PositionedRoadmap,
    PositionedHeader,
    PositionedSwimlane,
    PositionedItem,
    PositionedGroup,
    PositionedParallel,
    PositionedTrackChild,
    PositionedAnchor,
    PositionedMilestone,
    PositionedDependencyEdge,
    PositionedTimelineScale,
    PositionedNowline,
    PositionedFootnoteArea,
    PositionedIncludeRegion,
    ResolvedStyle,
    Point,
} from '@nowline/layout';
import { IdGenerator } from './ids.js';
import { attrs, escAttr, escText, num, tag, textTag } from './xml.js';
import { allShadowDefs, shadowFilterUrl } from './shadow.js';
import { sanitizeSvg } from './sanitize.js';
import { LINK_ICON_PATHS } from './icons.js';

// Browser-safe types. The renderer never touches `fs`, `path`, or `Buffer`.
// Callers inject an AssetResolver when they want logos embedded.
export interface AssetBytes {
    bytes: Uint8Array;
    mime: string;
}

export type AssetResolver = (ref: string) => Promise<AssetBytes>;

export interface RenderOptions {
    assetResolver?: AssetResolver;
    noLinks?: boolean;
    strict?: boolean;
    warn?: (message: string) => void;
    // Override the deterministic id prefix (defaults to 'nl').
    idPrefix?: string;
}

const TEXT_SIZE_PX: Record<string, number> = {
    none: 0, xs: 10, sm: 12, md: 14, lg: 18, xl: 24,
};
const CORNER_RADIUS_PX: Record<string, number> = {
    none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 20, full: 9999,
};
const FONT_STACK: Record<string, string> = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};
const WEIGHT_NUM: Record<string, number> = {
    thin: 100, light: 300, normal: 400, bold: 700,
};

function fontAttrs(style: ResolvedStyle, overrideSize?: number): Record<string, string | number> {
    return {
        'font-family': FONT_STACK[style.font],
        'font-size': overrideSize ?? TEXT_SIZE_PX[style.textSize] ?? 14,
        'font-weight': WEIGHT_NUM[style.weight] ?? 400,
        'font-style': style.italic ? 'italic' : 'normal',
        fill: style.text,
    };
}

function strokeDash(style: ResolvedStyle): string | undefined {
    if (style.border === 'dashed') return '4 3';
    if (style.border === 'dotted') return '1 3';
    return undefined;
}

function rectFrame(x: number, y: number, w: number, h: number, style: ResolvedStyle, extra: Record<string, string | number | undefined | null | boolean> = {}): string {
    const rx = Math.min(CORNER_RADIUS_PX[style.cornerRadius] ?? 4, h / 2);
    return tag('rect', {
        x: num(x),
        y: num(y),
        width: num(w),
        height: num(h),
        rx: num(rx),
        ry: num(rx),
        fill: style.bg === 'none' ? 'transparent' : style.bg,
        stroke: style.fg,
        'stroke-width': 1,
        'stroke-dasharray': strokeDash(style) ?? null,
        ...extra,
    });
}

function renderHeader(h: PositionedHeader, idPrefix: string, theme: 'light' | 'dark'): string {
    // The layout has already sized the card to its (wrapped) text content
    // and stashed the bounds in `h.cardBox`, with `h.titleLines` /
    // `h.authorLines` ready to render line-by-line. See sizeBesideHeader
    // in @nowline/layout.
    const cardX = h.box.x + h.cardBox.x;
    const cardY = h.box.y + h.cardBox.y;
    const cardWidth = h.cardBox.width;
    const cardHeight = h.cardBox.height;
    const cardFill = h.style.bg === 'none' ? '#ffffff' : h.style.bg;
    const borderColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    const card = tag('rect', {
        x: num(cardX),
        y: num(cardY),
        width: num(cardWidth),
        height: num(cardHeight),
        rx: 6,
        ry: 6,
        fill: cardFill,
        stroke: borderColor,
        'stroke-width': 1,
        filter: `url(#${idPrefix}-shadow-subtle)`,
    });
    // Title lines stack with 20-px baseline-to-baseline spacing (matches
    // sizeBesideHeader's HEADER_TITLE_LINE_HEIGHT).
    const titleParts: string[] = [];
    h.titleLines.forEach((line, i) => {
        titleParts.push(textTag(
            {
                x: num(cardX + 16),
                y: num(cardY + 26 + i * 20),
                'font-family': FONT_STACK[h.style.font],
                'font-size': 16,
                'font-weight': 600,
                fill: h.style.text,
            },
            line,
        ));
    });
    const titleText = titleParts.join('');
    const lastTitleY = cardY + 26 + Math.max(0, h.titleLines.length - 1) * 20;
    const authorColor = theme === 'dark' ? '#94a3b8' : '#64748b';
    const authorParts: string[] = [];
    h.authorLines.forEach((line, j) => {
        authorParts.push(textTag(
            {
                x: num(cardX + 16),
                y: num(lastTitleY + 18 + j * 14),
                'font-family': FONT_STACK[h.style.font],
                'font-size': 11,
                fill: authorColor,
            },
            line,
        ));
    });
    const authorText = authorParts.join('');
    return tag('g', { 'data-layer': 'header', 'data-id': `${idPrefix}-header` }, card + titleText + authorText);
}

function renderTimeline(t: PositionedTimelineScale, theme: 'light' | 'dark'): string {
    const panelFill = theme === 'dark' ? '#0f172a' : '#ffffff';
    const borderColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    const labelColor = theme === 'dark' ? '#cbd5e1' : '#64748b';
    const parts: string[] = [];
    // Header layout from top: now-pill row → tick-label panel → marker row.
    // The pill row owns its space (no panel rect); the now-line crosses it
    // visually. Marker row is omitted entirely when empty.
    const tickPanelY = t.tickPanelY;
    const tickPanelHeight = t.tickPanelHeight;
    const hasMarkerRow = t.markerRow.height > 0;
    const markerRowY = tickPanelY + tickPanelHeight;
    const markerRowHeight = t.markerRow.height;

    parts.push(
        tag('rect', {
            x: num(t.box.x),
            y: num(tickPanelY),
            width: num(t.box.width),
            height: num(tickPanelHeight),
            rx: 4,
            ry: 4,
            fill: panelFill,
            stroke: borderColor,
            'stroke-width': 1,
        }),
    );
    if (hasMarkerRow) {
        parts.push(
            tag('rect', {
                x: num(t.box.x),
                y: num(markerRowY),
                width: num(t.box.width),
                height: num(markerRowHeight),
                rx: 4,
                ry: 4,
                fill: panelFill,
                stroke: borderColor,
                'stroke-width': 1,
            }),
        );
    }
    // Where the dotted grid lines start (just below the lowest header
    // panel — date row alone, or marker row when present).
    const gridTopY = hasMarkerRow ? markerRowY + markerRowHeight : tickPanelY + tickPanelHeight;
    for (const tick of t.ticks) {
        if (!tick.major) continue;
        // Label sits at the COLUMN CENTER (tick.labelX), not at the tick
        // boundary. The last tick has no following column → no label.
        if (tick.label && tick.labelX !== undefined) {
            parts.push(
                textTag(
                    {
                        x: num(tick.labelX),
                        y: num(tickPanelY + 15),
                        'font-family': FONT_STACK.sans,
                        'font-size': 10,
                        fill: labelColor,
                        'text-anchor': 'middle',
                    },
                    tick.label,
                ),
            );
        }
        // Dotted grid line drops from below the lowest header panel through
        // the swimlane area, at the column BOUNDARY (tick.x).
        parts.push(
            tag('line', {
                x1: num(tick.x),
                y1: num(gridTopY),
                x2: num(tick.x),
                y2: num(t.box.y + t.box.height),
                stroke: gridColor,
                'stroke-width': 1,
                'stroke-dasharray': '2 3',
            }),
        );
    }
    return tag('g', { 'data-layer': 'timeline' }, parts.join(''));
}

function renderNowline(n: PositionedNowline | null, theme: 'light' | 'dark'): string {
    if (!n) return '';
    const color = theme === 'dark' ? '#f87171' : '#e53e3e';
    const labelTextColor = theme === 'dark' ? '#0b1220' : '#ffffff';
    // Line drops from `topY` (just below the pill / top of date headers)
    // through the headers into the chart, ending at `bottomY`.
    const line = tag('line', {
        x1: num(n.x),
        y1: num(n.topY),
        x2: num(n.x),
        y2: num(n.bottomY),
        stroke: color,
        'stroke-width': 2.25,
    });
    // Pill label — sits above the date headers at `pillTopY`.
    const pillText = 'now';
    const bgWidth = 36;
    const bgHeight = 16;
    const labelBg = tag('rect', {
        x: num(n.x - bgWidth / 2),
        y: num(n.pillTopY),
        width: num(bgWidth),
        height: num(bgHeight),
        rx: 8,
        ry: 8,
        fill: color,
    });
    const label = textTag(
        {
            x: num(n.x),
            y: num(n.pillTopY + bgHeight - 4),
            'font-family': FONT_STACK.sans,
            'font-size': 10,
            'font-weight': 700,
            fill: labelTextColor,
            'text-anchor': 'middle',
        },
        pillText,
    );
    return tag('g', { 'data-layer': 'nowline' }, line + labelBg + label);
}

function renderItem(i: PositionedItem, options: RenderOptions, idPrefix: string, theme: 'light' | 'dark'): string {
    const parts: string[] = [];
    const shadow = shadowFilterUrl(idPrefix, i.style.shadow);
    parts.push(
        rectFrame(i.box.x, i.box.y, i.box.width, i.box.height, i.style, {
            filter: shadow ?? null,
        }),
    );
    // Status palette (also used for the upper-right dot).
    const statusColors: Record<string, string> = theme === 'dark'
        ? { done: '#34d399', 'in-progress': '#60a5fa', 'at-risk': '#fbbf24', blocked: '#f87171', planned: '#94a3b8', neutral: '#94a3b8' }
        : { done: '#10b981', 'in-progress': '#3b82f6', 'at-risk': '#f59e0b', blocked: '#ef4444', planned: '#94a3b8', neutral: '#94a3b8' };
    const dotColor = statusColors[i.status] ?? statusColors.neutral;
    // Bottom progress strip — 4px tall along the bottom edge.
    if (i.progressFraction > 0) {
        const pw = Math.max(0, Math.min(i.box.width, i.box.width * i.progressFraction));
        parts.push(
            tag('rect', {
                x: num(i.box.x),
                y: num(i.box.y + i.box.height - 4),
                width: num(pw),
                height: 4,
                fill: i.style.fg,
                opacity: 0.55,
            }),
        );
    }
    // Status dot — upper-right inset.
    parts.push(
        tag('circle', {
            cx: num(i.box.x + i.box.width - 12),
            cy: num(i.box.y + 12),
            r: 5,
            fill: dotColor,
        }),
    );
    // Title + meta are an atomic caption. When `textSpills` is set the
    // layout has already bumped the next item to a fresh row, so we draw
    // both lines BESIDE the bar (just past its right edge, stacked) at
    // the same vertical positions they would occupy inside. When they
    // fit, both go inside at the bar's left padding.
    const captionX = i.textSpills
        ? i.box.x + i.box.width + 6
        : i.box.x + 12;
    if (i.title) {
        parts.push(
            textTag(
                {
                    x: num(captionX),
                    y: num(i.box.y + 20),
                    'font-family': FONT_STACK[i.style.font],
                    'font-size': 13,
                    'font-weight': 600,
                    fill: i.style.text,
                },
                i.title,
            ),
        );
    }
    if (i.metaText) {
        parts.push(
            textTag(
                {
                    x: num(captionX),
                    y: num(i.box.y + 38),
                    'font-family': FONT_STACK[i.style.font],
                    'font-size': 11,
                    fill: i.style.fg,
                },
                i.metaText,
            ),
        );
    }
    // Footnote superscript indicators (just LEFT of the upper-right status dot).
    if (i.footnoteIndicators.length > 0) {
        let fx = i.box.x + i.box.width - 22;
        for (let k = i.footnoteIndicators.length - 1; k >= 0; k--) {
            const n2 = i.footnoteIndicators[k];
            parts.push(
                textTag(
                    {
                        x: num(fx),
                        y: num(i.box.y + 14),
                        'font-family': FONT_STACK.sans,
                        'font-size': 10,
                        'font-weight': 700,
                        fill: theme === 'dark' ? '#f87171' : '#dc2626',
                        'text-anchor': 'end',
                    },
                    String(n2),
                ),
            );
            fx -= 8;
        }
    }
    // Link icon — colored tile + white external-link glyph at bottom-right.
    if (!options.noLinks && i.linkIcon && i.linkIcon !== 'none') {
        const tileColor: Record<string, string> = {
            linear: '#5e6ad2',
            github: '#0f172a',
            jira: '#0052cc',
            generic: theme === 'dark' ? '#94a3b8' : '#0f172a',
        };
        const tile = tileColor[i.linkIcon] ?? tileColor.generic;
        const tileSize = 14;
        const tileX = i.box.x + i.box.width - tileSize - 6;
        const tileY = i.box.y + i.box.height - tileSize - 6;
        const tileRect = tag('rect', {
            x: num(tileX),
            y: num(tileY),
            width: tileSize,
            height: tileSize,
            rx: 2,
            ry: 2,
            fill: tile,
        });
        // External-link glyph: arrow ↗ inside a 14×14 tile.
        const gx = tileX;
        const gy = tileY;
        const glyph = tag('path', {
            d: `M${num(gx + 4)} ${num(gy + 10)} L${num(gx + 10)} ${num(gy + 4)} M${num(gx + 6)} ${num(gy + 4)} H${num(gx + 10)} V${num(gy + 8)}`,
            stroke: '#ffffff',
            fill: 'none',
            'stroke-width': 1.1,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
        });
        const inner = tileRect + glyph;
        const link = i.linkHref
            ? tag('a', { href: i.linkHref, target: '_blank', rel: 'noopener' }, inner)
            : inner;
        parts.push(link);
    }
    // Overflow tail — red fill + stroke + caption.
    if (i.hasOverflow && i.overflowBox) {
        const tailFill = theme === 'dark' ? '#7f1d1d' : '#fee2e2';
        const tailStroke = theme === 'dark' ? '#f87171' : '#ef4444';
        const captionColor = theme === 'dark' ? '#fecaca' : '#b91c1c';
        parts.push(
            tag('rect', {
                x: num(i.overflowBox.x),
                y: num(i.overflowBox.y),
                width: num(i.overflowBox.width),
                height: num(i.overflowBox.height),
                fill: tailFill,
                stroke: tailStroke,
                'stroke-width': 1,
            }),
        );
        if (i.overflowAnchorId && i.overflowBox.width > 60) {
            parts.push(
                textTag(
                    {
                        x: num(i.overflowBox.x + i.overflowBox.width / 2),
                        y: num(i.overflowBox.y + i.overflowBox.height / 2 + 3),
                        'font-family': FONT_STACK.sans,
                        'font-size': 9,
                        'font-weight': 700,
                        fill: captionColor,
                        'text-anchor': 'middle',
                    },
                    `past ${i.overflowAnchorId}`,
                ),
            );
        }
    }
    // Label chips
    for (const chip of i.labelChips) {
        const rx = Math.min(CORNER_RADIUS_PX[chip.style.cornerRadius] ?? 8, chip.box.height / 2);
        parts.push(
            tag('rect', {
                x: num(chip.box.x),
                y: num(chip.box.y),
                width: num(chip.box.width),
                height: num(chip.box.height),
                rx: num(rx),
                ry: num(rx),
                fill: chip.style.bg === 'none' ? 'transparent' : chip.style.bg,
                stroke: chip.style.fg,
                'stroke-width': 0.5,
            }),
        );
        parts.push(
            textTag(
                {
                    x: num(chip.box.x + chip.box.width / 2),
                    y: num(chip.box.y + chip.box.height / 2 + 3),
                    ...fontAttrs(chip.style, TEXT_SIZE_PX.xs),
                    'text-anchor': 'middle',
                },
                chip.text,
            ),
        );
    }
    return tag('g', { 'data-layer': 'item', 'data-id': i.id ?? null }, parts.join(''));
}

function renderGroup(g: PositionedGroup, options: RenderOptions, idPrefix: string, theme: 'light' | 'dark'): string {
    const parts: string[] = [];
    const hasFill = g.style.bg !== 'none' && g.style.bg !== '#ffffff';
    if (hasFill) {
        // Filled-box style with a chiclet label tab overhanging the top.
        const pad = 8;
        parts.push(
            tag('rect', {
                x: num(g.box.x - pad),
                y: num(g.box.y - 2),
                width: num(g.box.width + pad * 2),
                height: num(g.box.height + 4),
                rx: 6,
                ry: 6,
                fill: g.style.bg,
                stroke: g.style.fg,
                'stroke-width': 1,
                'fill-opacity': 0.18,
                filter: `url(#${idPrefix}-shadow-subtle)`,
            }),
        );
        if (g.title) {
            const tabW = Math.max(60, g.title.length * 7);
            const tabH = 16;
            const tabX = g.box.x - pad + 8;
            const tabY = g.box.y - 2 - 9;
            parts.push(
                tag('rect', {
                    x: num(tabX),
                    y: num(tabY),
                    width: num(tabW),
                    height: tabH,
                    rx: 3,
                    ry: 3,
                    fill: g.style.fg,
                }),
            );
            parts.push(
                textTag(
                    {
                        x: num(tabX + tabW / 2),
                        y: num(tabY + 11),
                        'font-family': FONT_STACK[g.style.font],
                        'font-size': 9,
                        'font-weight': 600,
                        fill: '#ffffff',
                        'text-anchor': 'middle',
                    },
                    g.title,
                ),
            );
        }
    } else {
        const bracketColor = g.style.fg;
        if (g.style.bracket !== 'none') {
            parts.push(
                tag('path', {
                    d: `M${num(g.box.x)} ${num(g.box.y)} L${num(g.box.x)} ${num(g.box.y + g.box.height)} L${num(g.box.x + 4)} ${num(g.box.y + g.box.height)}`,
                    fill: 'none',
                    stroke: bracketColor,
                    'stroke-width': 1,
                    'stroke-dasharray': g.style.bracket === 'dashed' ? '3 2' : null,
                }),
            );
        }
        if (g.title) {
            parts.push(
                textTag(
                    {
                        x: num(g.box.x + 6),
                        y: num(g.box.y - 2),
                        ...fontAttrs(g.style, TEXT_SIZE_PX.xs),
                        'fill-opacity': 0.7,
                    },
                    g.title,
                ),
            );
        }
    }
    for (const c of g.children) {
        parts.push(renderTrackChild(c, options, idPrefix, theme));
    }
    void theme;
    return tag('g', { 'data-layer': 'group', 'data-id': g.id ?? null }, parts.join(''));
}

function renderParallel(p: PositionedParallel, options: RenderOptions, idPrefix: string, theme: 'light' | 'dark'): string {
    const parts: string[] = [];
    // `bracket: solid|dashed` parallels render explicit [ ] brackets framing
    // the nested tracks with 12 px vertical padding above/below.
    if (p.style.bracket === 'solid' || p.style.bracket === 'dashed') {
        const padding = 12;
        const stub = 4;
        const top = p.box.y - padding;
        const bottom = p.box.y + p.box.height + padding;
        const lx = p.box.x;
        const rx = p.box.x + p.box.width;
        const stroke = theme === 'dark' ? '#cbd5e1' : '#334155';
        parts.push(
            tag('path', {
                d: `M${num(lx + stub)} ${num(top)} H${num(lx)} V${num(bottom)} H${num(lx + stub)}`,
                fill: 'none',
                stroke,
                'stroke-width': 1.25,
                'stroke-dasharray': p.style.bracket === 'dashed' ? '3 3' : null,
                'stroke-linejoin': 'round',
            }),
        );
        parts.push(
            tag('path', {
                d: `M${num(rx - stub)} ${num(top)} H${num(rx)} V${num(bottom)} H${num(rx - stub)}`,
                fill: 'none',
                stroke,
                'stroke-width': 1.25,
                'stroke-dasharray': p.style.bracket === 'dashed' ? '3 3' : null,
                'stroke-linejoin': 'round',
            }),
        );
    }
    if (p.title) {
        parts.push(
            textTag(
                {
                    x: num(p.box.x + 4),
                    y: num(p.box.y - 2),
                    ...fontAttrs(p.style, TEXT_SIZE_PX.xs),
                    'fill-opacity': 0.7,
                },
                p.title,
            ),
        );
    }
    for (const c of p.children) {
        parts.push(renderTrackChild(c, options, idPrefix, theme));
    }
    return tag('g', { 'data-layer': 'parallel', 'data-id': p.id ?? null }, parts.join(''));
}

function renderTrackChild(c: PositionedTrackChild, options: RenderOptions, idPrefix: string, theme: 'light' | 'dark'): string {
    if (c.kind === 'item') return renderItem(c, options, idPrefix, theme);
    if (c.kind === 'group') return renderGroup(c, options, idPrefix, theme);
    return renderParallel(c, options, idPrefix, theme);
}

function renderSwimlane(s: PositionedSwimlane, options: RenderOptions, idPrefix: string, theme: 'light' | 'dark'): string {
    const tint = theme === 'dark'
        ? (s.bandIndex % 2 === 0 ? '#0f172a' : '#1e293b')
        : (s.bandIndex % 2 === 0 ? '#ffffff' : '#f8fafc');
    const borderColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    const tabFill = theme === 'dark' ? '#1e293b' : '#f1f5f9';
    const tabStroke = theme === 'dark' ? '#475569' : '#cbd5e1';
    const tabText = theme === 'dark' ? '#e2e8f0' : '#334155';
    const ownerText = theme === 'dark' ? '#94a3b8' : '#64748b';
    const footnoteColor = theme === 'dark' ? '#f87171' : '#dc2626';
    const parts: string[] = [];
    parts.push(
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
    // Frame-tab chiclet at the top-left of the band — auto-sized to fit
    // title + owner.
    if (s.title) {
        const titleWidth = Math.max(40, s.title.length * 7);
        const ownerWidth = s.owner ? Math.max(60, ('owner: ' + s.owner).length * 5.6) : 0;
        const padding = 24;
        const tabW = titleWidth + ownerWidth + padding;
        const tabH = 22;
        const tabX = s.box.x + 10;
        const tabY = s.box.y + 10;
        parts.push(
            tag('rect', {
                x: num(tabX),
                y: num(tabY),
                width: num(tabW),
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
                    x: num(tabX + 12),
                    y: num(tabY + 15),
                    'font-family': FONT_STACK[s.style.font],
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
                        x: num(tabX + 12 + titleWidth),
                        y: num(tabY + 15),
                        'font-family': FONT_STACK[s.style.font],
                        'font-size': 10,
                        fill: ownerText,
                    },
                    `owner: ${s.owner}`,
                ),
            );
        }
        if (s.footnoteIndicators.length > 0) {
            parts.push(
                textTag(
                    {
                        x: num(tabX + tabW - 8),
                        y: num(tabY + 14),
                        'font-family': FONT_STACK.sans,
                        'font-size': 10,
                        'font-weight': 700,
                        fill: footnoteColor,
                        'text-anchor': 'end',
                    },
                    s.footnoteIndicators.join(','),
                ),
            );
        }
    }
    for (const c of s.children) {
        parts.push(renderTrackChild(c, options, idPrefix, theme));
    }
    return tag('g', { 'data-layer': 'swimlane', 'data-id': s.id ?? null }, parts.join(''));
}

function renderAnchor(a: PositionedAnchor, theme: 'light' | 'dark'): string {
    const size = a.radius;
    const cx = a.center.x;
    const cy = a.center.y;
    // Anchors render as OPEN diamonds (white fill, slate stroke).
    const fill = theme === 'dark' ? '#0f172a' : '#ffffff';
    const stroke = theme === 'dark' ? '#cbd5e1' : '#334155';
    const diamond = tag('path', {
        d: `M${num(cx)} ${num(cy - size)} L${num(cx + size)} ${num(cy)} L${num(cx)} ${num(cy + size)} L${num(cx - size)} ${num(cy)} Z`,
        fill,
        stroke,
        'stroke-width': 1.25,
    });
    const labelColor = theme === 'dark' ? '#cbd5e1' : '#334155';
    const label = a.title
        ? textTag(
            {
                x: num(cx + size + 6),
                y: num(cy + 4),
                'font-family': FONT_STACK.sans,
                'font-size': 10,
                fill: labelColor,
            },
            a.title,
        )
        : '';
    return tag('g', { 'data-layer': 'anchor', 'data-id': a.id ?? null }, diamond + label);
}

function renderAnchorCutLine(a: PositionedAnchor, theme: 'light' | 'dark'): string {
    const stroke = theme === 'dark' ? '#94a3b8' : '#64748b';
    return tag('line', {
        x1: num(a.center.x),
        y1: num(a.center.y + a.radius + 1),
        x2: num(a.center.x),
        y2: num(a.cutBottomY),
        stroke,
        'stroke-width': 1,
        'stroke-dasharray': '1 3',
    });
}

function renderMilestone(m: PositionedMilestone, theme: 'light' | 'dark'): string {
    const cx = m.center.x;
    const cy = m.center.y;
    const r = m.radius;
    // Filled diamonds (ink in light, near-white in dark).
    const fill = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    const flag = tag('path', {
        d: `M${num(cx)} ${num(cy - r)} L${num(cx + r)} ${num(cy)} L${num(cx)} ${num(cy + r)} L${num(cx - r)} ${num(cy)} Z`,
        fill,
        stroke: fill,
        'stroke-width': 1,
    });
    const labelColor = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    const label = m.title
        ? textTag(
            {
                x: num(cx + r + 6),
                y: num(cy + 4),
                'font-family': FONT_STACK.sans,
                'font-size': 10,
                'font-weight': 600,
                fill: labelColor,
            },
            m.title,
        )
        : '';
    return tag('g', { 'data-layer': 'milestone', 'data-id': m.id ?? null }, flag + label);
}

function renderMilestoneCutLine(m: PositionedMilestone, theme: 'light' | 'dark'): string {
    const stroke = m.isOverrun
        ? (theme === 'dark' ? '#ef4444' : '#b91c1c')
        : (theme === 'dark' ? '#a5b4fc' : '#1e1b4b');
    const parts: string[] = [];
    parts.push(
        tag('line', {
            x1: num(m.center.x),
            y1: num(m.center.y + m.radius + 1),
            x2: num(m.center.x),
            y2: num(m.cutBottomY),
            stroke,
            'stroke-width': 2,
            'stroke-dasharray': '6 4',
            'stroke-linecap': 'round',
        }),
    );
    if (m.slackX !== undefined) {
        const slackColor = theme === 'dark' ? '#cbd5e1' : '#0f172a';
        const y = m.slackY ?? m.center.y;
        parts.push(
            tag('path', {
                d: `M${num(m.slackX)} ${num(y)} H${num(m.center.x - 6)}`,
                fill: 'none',
                stroke: slackColor,
                'stroke-width': 1.1,
                'stroke-dasharray': '3 3',
                'stroke-linecap': 'round',
                'marker-end': 'url(#nl-arrow-dark)',
            }),
        );
    }
    return parts.join('');
}

function renderEdge(e: PositionedDependencyEdge, theme: 'light' | 'dark'): string {
    const color = e.kind === 'overflow'
        ? (theme === 'dark' ? '#ef5350' : '#d32f2f')
        : (theme === 'dark' ? '#cbd5e1' : '#475569');
    const points = e.waypoints;
    if (points.length < 2) return '';
    return tag('path', {
        d: roundedOrthogonalPath(points, 4),
        fill: 'none',
        stroke: color,
        'stroke-width': 1.1,
        'stroke-dasharray': e.kind === 'overflow' ? '4 2' : null,
        'stroke-linejoin': 'round',
        'marker-end': 'url(#nl-arrow)',
    });
}

// Build an SVG path for a sequence of orthogonal waypoints, inserting a
// quarter-arc at every interior bend. Falls back to straight segments when
// adjacent points aren't axis-aligned (defensive — the layout always emits
// orthogonal segments).
function roundedOrthogonalPath(points: Point[], radius: number): string {
    if (points.length < 2) return '';
    const parts: string[] = [`M${num(points[0].x)} ${num(points[0].y)}`];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        if (i === points.length - 1) {
            parts.push(`L${num(cur.x)} ${num(cur.y)}`);
            continue;
        }
        const next = points[i + 1];
        const dxIn = Math.sign(cur.x - prev.x);
        const dyIn = Math.sign(cur.y - prev.y);
        const dxOut = Math.sign(next.x - cur.x);
        const dyOut = Math.sign(next.y - cur.y);
        const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
        const r = Math.min(radius, inLen / 2, outLen / 2);
        if (r <= 0 || (dxIn !== 0 && dxOut !== 0) || (dyIn !== 0 && dyOut !== 0)) {
            parts.push(`L${num(cur.x)} ${num(cur.y)}`);
            continue;
        }
        const beforeBend = { x: cur.x - dxIn * r, y: cur.y - dyIn * r };
        const afterBend = { x: cur.x + dxOut * r, y: cur.y + dyOut * r };
        parts.push(`L${num(beforeBend.x)} ${num(beforeBend.y)}`);
        parts.push(`Q${num(cur.x)} ${num(cur.y)} ${num(afterBend.x)} ${num(afterBend.y)}`);
    }
    return parts.join(' ');
}

function renderFootnotes(f: PositionedFootnoteArea, idPrefix: string, theme: 'light' | 'dark'): string {
    if (f.entries.length === 0) return '';
    const panelFill = theme === 'dark' ? '#0f172a' : '#ffffff';
    const borderColor = theme === 'dark' ? '#334155' : '#e2e8f0';
    const headerColor = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    const titleColor = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    const descColor = theme === 'dark' ? '#94a3b8' : '#64748b';
    const numberColor = theme === 'dark' ? '#f87171' : '#dc2626';
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
                x: num(f.box.x + 16),
                y: num(f.box.y + 22),
                'font-family': FONT_STACK.sans,
                'font-size': 12,
                'font-weight': 700,
                fill: headerColor,
            },
            'Footnotes',
        ),
    );
    f.entries.forEach((e, i) => {
        const y = f.box.y + 44 + i * 18;
        parts.push(
            textTag(
                { x: num(f.box.x + 16), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 10, 'font-weight': 700, fill: numberColor },
                String(e.number),
            ),
        );
        parts.push(
            textTag(
                { x: num(f.box.x + 32), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 11, 'font-weight': 600, fill: titleColor },
                e.title,
            ),
        );
        if (e.description) {
            parts.push(
                textTag(
                    { x: num(f.box.x + 32 + Math.max(120, e.title.length * 6)), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 11, fill: descColor },
                    `— ${e.description}`,
                ),
            );
        }
    });
    return tag('g', { 'data-layer': 'footnotes' }, parts.join(''));
}

function renderIncludeRegion(
    r: PositionedIncludeRegion,
    options: RenderOptions,
    idPrefix: string,
    theme: 'light' | 'dark',
): string {
    // Slate / neutral palette tuned to match specs/samples/isolate-include.svg.
    const border = theme === 'dark' ? '#475569' : '#94a3b8';
    const fill = theme === 'dark' ? '#0b1220' : '#f8fafc';
    const tabFill = theme === 'dark' ? '#111827' : '#ffffff';
    const tabStroke = theme === 'dark' ? '#475569' : '#cbd5e1';
    const tabText = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    const badgeFill = theme === 'dark' ? '#1e293b' : '#e2e8f0';
    const badgeStroke = theme === 'dark' ? '#475569' : '#cbd5e1';
    const badgeText = theme === 'dark' ? '#94a3b8' : '#475569';

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
        'stroke-dasharray': '6 4',
    });

    const tabPaddingX = 10;
    const tabHeight = 22;
    const tabWidth = Math.max(60, r.label.length * 6.5 + tabPaddingX * 2);
    const tabX = rx + 16;
    const tabY = ry - tabHeight / 2;
    const tab = tag('rect', {
        x: num(tabX),
        y: num(tabY),
        width: num(tabWidth),
        height: tabHeight,
        rx: 4,
        ry: 4,
        fill: tabFill,
        stroke: tabStroke,
        'stroke-width': 1,
    });
    const tabLabel = textTag(
        {
            x: num(tabX + tabPaddingX),
            y: num(tabY + 15),
            'font-family': FONT_STACK.sans,
            'font-size': 11,
            'font-weight': 600,
            fill: tabText,
        },
        r.label,
    );

    // External-link badge to the right of the tab. Mirrors the link-icon tile
    // used in renderItem but inline in the region tab strip.
    const badgeSize = 18;
    const badgeX = tabX + tabWidth + 6;
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
    // Glyph: small external-link arrow.
    const glyph = tag('path', {
        d: `M${num(badgeX + 5)} ${num(badgeY + 11)} L${num(badgeX + 13)} ${num(badgeY + 5)} M${num(badgeX + 9)} ${num(badgeY + 5)} L${num(badgeX + 13)} ${num(badgeY + 5)} L${num(badgeX + 13)} ${num(badgeY + 9)}`,
        stroke: badgeText,
        'stroke-width': 1.4,
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
    });
    const sourceText = textTag(
        {
            x: num(badgeX + badgeSize + 6),
            y: num(ry + 4),
            'font-family': FONT_STACK.mono,
            'font-size': 9,
            fill: badgeText,
        },
        r.sourcePath,
    );

    // Nested swimlanes (laid out by buildIncludeRegions against the parent's timeline).
    const nested = r.nestedSwimlanes
        .map((s) => renderSwimlane(s, options, idPrefix, theme))
        .join('');

    return tag(
        'g',
        { 'data-layer': 'include' },
        region + nested + tab + tabLabel + badge + glyph + sourceText,
    );
}

// Anchor the now|ine wordmark to the bottom-right of the model's last
// swimlane (or the footnote panel when present). Wrapped in <a> so it stays
// clickable.
function renderAttributionMark(model: PositionedRoadmap): string {
    const theme = model.theme;
    const muted = theme === 'dark' ? '#cbd5e1' : '#94a3b8';
    const accent = theme === 'dark' ? '#f87171' : '#e53e3e';
    // Choose an anchor: footnote panel if it has entries, else the last swimlane.
    let anchorBox: { x: number; y: number; width: number; height: number } | null = null;
    if (model.footnotes.entries.length > 0) {
        anchorBox = model.footnotes.box;
    } else if (model.swimlanes.length > 0) {
        anchorBox = model.swimlanes[model.swimlanes.length - 1].box;
    } else {
        return '';
    }
    // Wordmark "now|ine" — the red bar IS the "l" of "nowline", so it
    // needs to hug both sides equally rather than glue to "ine" alone.
    //
    // Logical units (before the 0.22 scale):
    //   "now"  text:  font-size 40 bold, x=0,   3 chars × ~0.58 ≈ ends 72
    //   red bar:                          x=74, width=5         → ends 79
    //   "ine"  text:  font-size 40,       x=81,  3 chars × 0.58 ≈ ends 151
    // 2-unit gutters on either side of the bar match the kerning of an "l"
    // in the surrounding sans-serif and read as a single word. Bar bottom
    // is y=12+40=52.
    const scale = 0.22;
    const glyphLogicalWidth = 81 + 3 * 40 * 0.58;   // 151 units, "ine" right edge
    const glyphLogicalHeight = 12 + 40;             // 52 units, bar bottom
    const glyphWidth = glyphLogicalWidth * scale;
    const glyphHeight = glyphLogicalHeight * scale;
    const padding = 12;
    const tx = anchorBox.x + anchorBox.width - padding - glyphWidth;
    const ty = anchorBox.y + anchorBox.height - padding - glyphHeight;
    const inner =
        textTag(
            {
                x: '0',
                y: '40',
                'font-family': FONT_STACK.sans,
                'font-size': 40,
                'font-weight': 700,
                fill: muted,
            },
            'now',
        ) +
        tag('rect', {
            x: 74,
            y: 12,
            width: 5,
            height: 40,
            fill: accent,
        }) +
        textTag(
            {
                x: 81,
                y: 40,
                'font-family': FONT_STACK.sans,
                'font-size': 40,
                'font-weight': 400,
                fill: muted,
            },
            'ine',
        );
    const group = tag(
        'g',
        { transform: `translate(${num(tx)} ${num(ty)}) scale(${num(scale)})` },
        inner,
    );
    return tag(
        'a',
        { href: 'https://nowline.io', target: '_blank', rel: 'noopener', 'aria-label': 'Made with Nowline' },
        tag('g', { 'data-layer': 'attribution' }, group),
    );
}

async function embedLogo(
    logoRef: string,
    resolver: AssetResolver | undefined,
    idPrefix: string,
    options: RenderOptions,
    x: number,
    y: number,
    size: number,
): Promise<string> {
    if (!resolver) return '';
    let asset: AssetBytes;
    try {
        asset = await resolver(logoRef);
    } catch (err) {
        const msg = `logo: failed to load ${logoRef}: ${err instanceof Error ? err.message : String(err)}`;
        if (options.strict) throw err;
        options.warn?.(msg);
        return '';
    }
    const mime = (asset.mime ?? '').toLowerCase();
    if (mime === 'image/svg+xml') {
        const raw = new TextDecoder().decode(asset.bytes);
        const cleaned = sanitizeSvg(raw, { idPrefix: `${idPrefix}-logo`, onWarn: options.warn });
        return tag('g', { transform: `translate(${num(x)} ${num(y)})` }, cleaned);
    }
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp') {
        const b64 = bytesToBase64(asset.bytes);
        return tag('image', {
            href: `data:${mime};base64,${b64}`,
            x: num(x),
            y: num(y),
            width: num(size),
            height: num(size),
            preserveAspectRatio: 'xMidYMid meet',
        });
    }
    const msg = `logo: unsupported mime ${mime} for ${logoRef}`;
    if (options.strict) throw new Error(msg);
    options.warn?.(msg);
    return '';
}

// Base64 without depending on Node's Buffer (renderer stays browser-safe).
function bytesToBase64(bytes: Uint8Array): string {
    if (typeof btoa !== 'undefined') {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    // Node fallback without importing Buffer directly; use lazy dynamic require.
    const g = globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } };
    if (g.Buffer) return g.Buffer.from(bytes).toString('base64');
    throw new Error('renderer: no base64 encoder available');
}

export async function renderSvg(
    model: PositionedRoadmap,
    options: RenderOptions = {},
): Promise<string> {
    const ids = new IdGenerator(options.idPrefix ?? 'nl');
    const idPrefix = ids.next('root');

    const theme = model.theme;
    const parts: string[] = [];

    // <defs> — shadows + arrowhead markers (theme-aware fills baked in).
    const arrowFillNeutral = theme === 'dark' ? '#94a3b8' : '#475569';
    const arrowFillLight = theme === 'dark' ? '#64748b' : '#94a3b8';
    const arrowFillDark = theme === 'dark' ? '#e2e8f0' : '#0f172a';
    const arrowDef = (id: string, fill: string): string =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`;
    const defs =
        `<defs>${allShadowDefs(idPrefix)}` +
        arrowDef('nl-arrow', arrowFillNeutral) +
        arrowDef('nl-arrow-light', arrowFillLight) +
        arrowDef('nl-arrow-dark', arrowFillDark) +
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

    // Timeline (behind everything else in the chart)
    parts.push(renderTimeline(model.timeline, theme));

    // Swimlanes
    for (const s of model.swimlanes) parts.push(renderSwimlane(s, options, idPrefix, theme));

    // Include regions (drawn after own swimlanes so the dashed border + tab
    // overlay the chart, with their own nested swimlanes inside).
    for (const r of model.includes) parts.push(renderIncludeRegion(r, options, idPrefix, theme));

    // Dependency edges on top of items but below cut-lines / nowline
    for (const e of model.edges) parts.push(renderEdge(e, theme));

    // Anchor + milestone cut lines drawn AFTER items so they overlay the
    // swimlane fills.
    for (const a of model.anchors) parts.push(renderAnchorCutLine(a, theme));
    for (const m of model.milestones) parts.push(renderMilestoneCutLine(m, theme));

    // Marker-row diamonds + labels.
    for (const a of model.anchors) parts.push(renderAnchor(a, theme));
    for (const m of model.milestones) parts.push(renderMilestone(m, theme));

    // Now-line
    parts.push(renderNowline(model.nowline, theme));

    // Footnotes + header last (always on top)
    parts.push(renderFootnotes(model.footnotes, idPrefix, theme));
    parts.push(renderHeader(model.header, idPrefix, theme));
    parts.push(renderAttributionMark(model));

    // Logo (if header carries one)
    if (model.header.logo && options.assetResolver) {
        const logoSvg = await embedLogo(
            model.header.logo.assetRef ?? '',
            options.assetResolver,
            idPrefix,
            options,
            model.header.logo.box.x,
            model.header.logo.box.y,
            Math.max(model.header.logo.box.width, model.header.logo.box.height),
        );
        if (logoSvg) parts.push(logoSvg);
    }

    const svgAttrs = attrs({
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${num(model.width)} ${num(model.height)}`,
        width: num(model.width),
        height: num(model.height),
        'data-theme': theme,
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
