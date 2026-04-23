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

function renderHeader(h: PositionedHeader, idPrefix: string, attributionText: string): string {
    const bg = h.style.bg === 'none' ? 'transparent' : h.style.bg;
    const box = tag('rect', {
        x: num(h.box.x),
        y: num(h.box.y),
        width: num(h.box.width),
        height: num(h.box.height),
        fill: bg,
        stroke: h.style.fg,
        'stroke-width': 0.5,
        opacity: 0.6,
    });
    const titleY = h.box.y + (h.position === 'above' ? h.box.height / 2 + 6 : 24);
    const titleText = h.title
        ? textTag(
            {
                x: num(h.box.x + 12),
                y: num(titleY),
                ...fontAttrs(h.style, TEXT_SIZE_PX.lg),
            },
            h.title,
        )
        : '';
    const authorText = h.author
        ? textTag(
            {
                x: num(h.box.x + 12),
                y: num(titleY + 20),
                ...fontAttrs(h.style, TEXT_SIZE_PX.sm),
                'fill-opacity': 0.7,
            },
            h.author,
        )
        : '';
    // Attribution mark — link-safe wordmark. Clicking "nowline.io" opens in a
    // new tab via target=_blank attribute on <a>.
    const att = tag(
        'a',
        { href: 'https://nowline.io', target: '_blank', rel: 'noopener' },
        textTag(
            {
                x: num(h.attributionBox.x),
                y: num(h.attributionBox.y + 12),
                'font-family': FONT_STACK.sans,
                'font-size': 10,
                fill: h.style.text,
                'text-anchor': 'start',
            },
            attributionText,
        ),
    );
    return tag('g', { 'data-layer': 'header', 'data-id': `${idPrefix}-header` }, box + titleText + authorText + att);
}

function renderTimeline(t: PositionedTimelineScale, theme: 'light' | 'dark'): string {
    const gridColor = theme === 'dark' ? '#2a2a2a' : '#eeeeee';
    const tickColor = theme === 'dark' ? '#616161' : '#bdbdbd';
    const labelColor = theme === 'dark' ? '#9e9e9e' : '#616161';
    const parts: string[] = [];
    // Baseline
    parts.push(
        tag('line', {
            x1: num(t.box.x),
            y1: num(t.box.y + 24),
            x2: num(t.box.x + t.box.width),
            y2: num(t.box.y + 24),
            stroke: tickColor,
            'stroke-width': 0.5,
        }),
    );
    for (const tick of t.ticks) {
        parts.push(
            tag('line', {
                x1: num(tick.x),
                y1: num(t.box.y + (tick.major ? 14 : 20)),
                x2: num(tick.x),
                y2: num(t.box.y + 28),
                stroke: tickColor,
                'stroke-width': tick.major ? 1 : 0.5,
            }),
        );
        if (tick.major && tick.label) {
            parts.push(
                textTag(
                    {
                        x: num(tick.x + 2),
                        y: num(t.box.y + 12),
                        'font-family': FONT_STACK.sans,
                        'font-size': 10,
                        fill: labelColor,
                    },
                    tick.label,
                ),
            );
            parts.push(
                tag('line', {
                    x1: num(tick.x),
                    y1: num(t.box.y + 28),
                    x2: num(tick.x),
                    y2: num(t.box.y + t.box.height),
                    stroke: gridColor,
                    'stroke-width': 0.5,
                }),
            );
        }
    }
    return tag('g', { 'data-layer': 'timeline' }, parts.join(''));
}

function renderNowline(n: PositionedNowline | null, theme: 'light' | 'dark'): string {
    if (!n) return '';
    const color = theme === 'dark' ? '#ef5350' : '#d32f2f';
    const line = tag('line', {
        x1: num(n.x),
        y1: num(n.topY),
        x2: num(n.x),
        y2: num(n.bottomY),
        stroke: color,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 2',
    });
    const bgWidth = n.label.length * 6 + 10;
    const labelBg = tag('rect', {
        x: num(n.x - bgWidth / 2),
        y: num(n.topY - 14),
        width: num(bgWidth),
        height: 14,
        rx: 2,
        ry: 2,
        fill: color,
    });
    const label = textTag(
        {
            x: num(n.x),
            y: num(n.topY - 4),
            'font-family': FONT_STACK.sans,
            'font-size': 10,
            'font-weight': 600,
            fill: '#ffffff',
            'text-anchor': 'middle',
        },
        n.label,
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
    if (i.progressFraction > 0) {
        const pw = Math.max(0, Math.min(i.box.width, i.box.width * i.progressFraction));
        const rx = Math.min(CORNER_RADIUS_PX[i.style.cornerRadius] ?? 4, i.box.height / 2);
        parts.push(
            tag('rect', {
                x: num(i.box.x),
                y: num(i.box.y),
                width: num(pw),
                height: num(i.box.height),
                rx: num(rx),
                ry: num(rx),
                fill: i.style.fg,
                opacity: 0.25,
            }),
        );
    }
    // Status dot at left edge
    const statusColors: Record<string, string> = theme === 'dark'
        ? { done: '#66bb6a', 'in-progress': '#42a5f5', 'at-risk': '#ffa726', blocked: '#ef5350', planned: '#9e9e9e', neutral: '#9e9e9e' }
        : { done: '#43a047', 'in-progress': '#1e88e5', 'at-risk': '#fb8c00', blocked: '#e53935', planned: '#9e9e9e', neutral: '#9e9e9e' };
    parts.push(
        tag('circle', {
            cx: num(i.box.x + 6),
            cy: num(i.box.y + i.box.height / 2),
            r: 3,
            fill: statusColors[i.status] ?? statusColors.neutral,
        }),
    );
    if (i.title) {
        parts.push(
            textTag(
                {
                    x: num(i.box.x + 14),
                    y: num(i.box.y + i.box.height / 2 + 4),
                    ...fontAttrs(i.style, TEXT_SIZE_PX.sm),
                },
                i.title,
            ),
        );
    }
    // Footnote superscript indicators
    if (i.footnoteIndicators.length > 0) {
        let fx = i.box.x + i.box.width - 4;
        for (let k = i.footnoteIndicators.length - 1; k >= 0; k--) {
            const n2 = i.footnoteIndicators[k];
            parts.push(
                textTag(
                    {
                        x: num(fx),
                        y: num(i.box.y - 2),
                        'font-family': FONT_STACK.sans,
                        'font-size': 9,
                        fill: theme === 'dark' ? '#ef5350' : '#d32f2f',
                        'text-anchor': 'end',
                    },
                    String(n2),
                ),
            );
            fx -= 10;
        }
    }
    // Link icon
    if (!options.noLinks && i.linkIcon && i.linkIcon !== 'none') {
        const d = LINK_ICON_PATHS[i.linkIcon] ?? LINK_ICON_PATHS.generic;
        const lx = i.box.x + i.box.width - 18;
        const ly = i.box.y + (i.box.height - 14) / 2;
        const path = tag('path', {
            d,
            fill: i.style.text,
            transform: `translate(${num(lx)} ${num(ly)}) scale(0.85)`,
            opacity: 0.7,
        });
        const link = i.linkHref
            ? tag('a', { href: i.linkHref, target: '_blank', rel: 'noopener' }, path)
            : path;
        parts.push(link);
    }
    // Overflow tail
    if (i.hasOverflow && i.overflowBox) {
        parts.push(
            tag('rect', {
                x: num(i.overflowBox.x),
                y: num(i.overflowBox.y),
                width: num(i.overflowBox.width),
                height: num(i.overflowBox.height),
                fill: theme === 'dark' ? '#ef5350' : '#d32f2f',
                opacity: 0.25,
            }),
        );
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
    const bracketColor = g.style.fg;
    const parts: string[] = [];
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
    for (const c of g.children) {
        parts.push(renderTrackChild(c, options, idPrefix, theme));
    }
    return tag('g', { 'data-layer': 'group', 'data-id': g.id ?? null }, parts.join(''));
}

function renderParallel(p: PositionedParallel, options: RenderOptions, idPrefix: string, theme: 'light' | 'dark'): string {
    const parts: string[] = [];
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
        ? (s.bandIndex % 2 === 0 ? '#1e1e1e' : '#242424')
        : (s.bandIndex % 2 === 0 ? '#ffffff' : '#f5f5f5');
    const parts: string[] = [];
    parts.push(
        tag('rect', {
            x: num(s.box.x),
            y: num(s.box.y),
            width: num(s.box.width),
            height: num(s.box.height),
            fill: tint,
        }),
    );
    // Swimlane title
    if (s.title) {
        parts.push(
            textTag(
                {
                    x: num(s.box.x + 8),
                    y: num(s.box.y + 16),
                    ...fontAttrs(s.style, TEXT_SIZE_PX.sm),
                    'font-weight': 600,
                },
                s.title,
            ),
        );
    }
    for (const c of s.children) {
        parts.push(renderTrackChild(c, options, idPrefix, theme));
    }
    return tag('g', { 'data-layer': 'swimlane', 'data-id': s.id ?? null }, parts.join(''));
}

function renderAnchor(a: PositionedAnchor, idPrefix: string): string {
    const size = a.radius;
    const cx = a.center.x;
    const cy = a.center.y;
    const diamond = tag('path', {
        d: `M${num(cx)} ${num(cy - size)} L${num(cx + size)} ${num(cy)} L${num(cx)} ${num(cy + size)} L${num(cx - size)} ${num(cy)} Z`,
        fill: a.style.bg === 'none' ? a.style.fg : a.style.bg,
        stroke: a.style.fg,
        'stroke-width': 1,
    });
    const label = a.title
        ? textTag(
            {
                x: num(cx),
                y: num(cy - size - 4),
                ...fontAttrs(a.style, TEXT_SIZE_PX.xs),
                'text-anchor': 'middle',
            },
            a.title,
        )
        : '';
    return tag('g', { 'data-layer': 'anchor', 'data-id': a.id ?? null }, diamond + label);
}

function renderMilestone(m: PositionedMilestone, theme: 'light' | 'dark'): string {
    const cx = m.center.x;
    const cy = m.center.y;
    const r = m.radius;
    const flag = tag('path', {
        d: `M${num(cx)} ${num(cy - r)} L${num(cx + r)} ${num(cy)} L${num(cx)} ${num(cy + r)} L${num(cx - r)} ${num(cy)} Z`,
        fill: m.style.bg === 'none' ? m.style.fg : m.style.bg,
        stroke: m.style.fg,
        'stroke-width': 1,
        'stroke-dasharray': m.fixed ? null : '3 2',
    });
    const label = m.title
        ? textTag(
            {
                x: num(cx),
                y: num(cy - r - 4),
                ...fontAttrs(m.style, TEXT_SIZE_PX.xs),
                'font-weight': 600,
                'text-anchor': 'middle',
            },
            m.title,
        )
        : '';
    let slack = '';
    if (m.slackX !== undefined) {
        const color = m.isOverrun
            ? (theme === 'dark' ? '#ef5350' : '#d32f2f')
            : (theme === 'dark' ? '#9e9e9e' : '#9e9e9e');
        slack = tag('line', {
            x1: num(cx),
            y1: num(cy),
            x2: num(m.slackX),
            y2: num(cy),
            stroke: color,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 2',
        });
    }
    return tag('g', { 'data-layer': 'milestone', 'data-id': m.id ?? null }, slack + flag + label);
}

function renderEdge(e: PositionedDependencyEdge, theme: 'light' | 'dark'): string {
    const color = e.kind === 'overflow'
        ? (theme === 'dark' ? '#ef5350' : '#d32f2f')
        : (theme === 'dark' ? '#9e9e9e' : '#757575');
    const points = e.waypoints;
    if (points.length < 2) return '';
    const d = points.map((p, i) => (i === 0 ? `M${num(p.x)} ${num(p.y)}` : `L${num(p.x)} ${num(p.y)}`)).join(' ');
    return tag('path', {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': 1,
        'stroke-dasharray': e.kind === 'overflow' ? '4 2' : null,
    });
}

function renderFootnotes(f: PositionedFootnoteArea, theme: 'light' | 'dark'): string {
    if (f.entries.length === 0) return '';
    const labelColor = theme === 'dark' ? '#bdbdbd' : '#424242';
    const numberColor = theme === 'dark' ? '#ef5350' : '#d32f2f';
    const parts: string[] = [];
    f.entries.forEach((e, i) => {
        const y = f.box.y + 12 + i * 18;
        parts.push(
            textTag(
                { x: num(f.box.x + 8), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 10, 'font-weight': 600, fill: numberColor },
                `${e.number}.`,
            ),
        );
        const text = e.description ? `${e.title} — ${e.description}` : e.title;
        parts.push(
            textTag(
                { x: num(f.box.x + 28), y: num(y), 'font-family': FONT_STACK.sans, 'font-size': 10, fill: labelColor },
                text,
            ),
        );
    });
    return tag('g', { 'data-layer': 'footnotes' }, parts.join(''));
}

function renderIncludeRegion(r: PositionedIncludeRegion, theme: 'light' | 'dark'): string {
    const border = theme === 'dark' ? '#78909c' : '#90a4ae';
    const label = theme === 'dark' ? '#cfd8dc' : '#37474f';
    const rect = tag('rect', {
        x: num(r.box.x + 8),
        y: num(r.box.y),
        width: num(r.box.width - 16),
        height: num(r.box.height),
        rx: 6,
        ry: 6,
        fill: 'transparent',
        stroke: border,
        'stroke-width': 1,
        'stroke-dasharray': '5 3',
    });
    const text = textTag(
        {
            x: num(r.box.x + 20),
            y: num(r.box.y + 20),
            'font-family': FONT_STACK.sans,
            'font-size': 12,
            'font-weight': 600,
            fill: label,
        },
        r.label,
    );
    const badge = textTag(
        {
            x: num(r.box.x + 20),
            y: num(r.box.y + 36),
            'font-family': FONT_STACK.mono,
            'font-size': 10,
            fill: label,
            'fill-opacity': 0.7,
        },
        `include: ${r.sourcePath}`,
    );
    return tag('g', { 'data-layer': 'include' }, rect + text + badge);
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

    // <defs>
    const defs = `<defs>${allShadowDefs(idPrefix)}</defs>`;
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

    // Include regions
    for (const r of model.includes) parts.push(renderIncludeRegion(r, theme));

    // Anchors + milestones
    for (const a of model.anchors) parts.push(renderAnchor(a, idPrefix));
    for (const m of model.milestones) parts.push(renderMilestone(m, theme));

    // Dependency edges on top of items but below nowline
    for (const e of model.edges) parts.push(renderEdge(e, theme));

    // Now-line
    parts.push(renderNowline(model.nowline, theme));

    // Footnotes + header last (always on top)
    parts.push(renderFootnotes(model.footnotes, theme));
    const attribution = 'Made with Nowline';
    parts.push(renderHeader(model.header, idPrefix, attribution));

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
