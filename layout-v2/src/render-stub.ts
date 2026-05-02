// Minimal SVG emitter for the prototype.
//
// Mirrors the byte-stable string-based approach in
// `packages/renderer/src/svg/xml.ts` so the prototype produces a recognizable
// minimal-sample output without pulling in the production renderer (which we
// avoid until v2 is committed).
//
// This stub is deliberately small: ~100 lines of SVG generation that prove
// the architecture's outputs feed straight into a real SVG.

import type { PositionedRoadmap, PositionedItem } from './positioned.js';

type Attrs = Record<string, string | number | boolean | null | undefined>;

interface Palette {
    panel: string;
    border: string;
    text: string;
    muted: string;
    grid: string;
    row: string;
    now: string;
}

/**
 * Per-status palette mirrored from production's tinted-bar styling.
 *  - `barFill` / `barStroke` paint the bar panel
 *  - `titleColor` / `metaColor` paint the two text lines
 *  - `accent` is the status dot and the progress strip fill
 *  - `progressOpacity` matches the muted-fill look in production
 *    (done = 0.5, in-progress = 0.6).
 */
interface StatusSwatch {
    barFill: string;
    barStroke: string;
    titleColor: string;
    metaColor: string;
    accent: string;
    progressOpacity: number;
}

const STATUS_PALETTE: Record<PositionedItem['status'], StatusSwatch> = {
    done: {
        barFill: '#ecfdf5',
        barStroke: '#10b981',
        titleColor: '#064e3b',
        metaColor: '#047857',
        accent: '#10b981',
        progressOpacity: 0.5,
    },
    'in-progress': {
        barFill: '#eff6ff',
        barStroke: '#3b82f6',
        titleColor: '#1e3a8a',
        metaColor: '#1d4ed8',
        accent: '#3b82f6',
        progressOpacity: 0.6,
    },
    'at-risk': {
        barFill: '#fefce8',
        barStroke: '#f59e0b',
        titleColor: '#78350f',
        metaColor: '#b45309',
        accent: '#f59e0b',
        progressOpacity: 0.6,
    },
    blocked: {
        barFill: '#fef2f2',
        barStroke: '#ef4444',
        titleColor: '#7f1d1d',
        metaColor: '#b91c1c',
        accent: '#ef4444',
        progressOpacity: 0.6,
    },
    planned: {
        barFill: '#f8fafc',
        barStroke: '#94a3b8',
        titleColor: '#1e293b',
        metaColor: '#64748b',
        accent: '#94a3b8',
        progressOpacity: 0.6,
    },
};

export function renderStub(model: PositionedRoadmap, theme: 'light' | 'dark' = 'light'): string {
    const palette: Palette = theme === 'dark'
        ? {
              panel: '#1e293b',
              border: '#334155',
              text: '#f1f5f9',
              muted: '#94a3b8',
              grid: '#334155',
              row: '#0f172a',
              now: '#ef4444',
          }
        : {
              panel: '#ffffff',
              border: '#e2e8f0',
              text: '#0f172a',
              muted: '#64748b',
              grid: '#cbd5e1',
              row: '#f8fafc',
              // Production red: #e53e3e (warmer than tailwind red-500).
              now: '#e53e3e',
          };

    const out: string[] = [];
    out.push(
        `<svg${attrs({
            xmlns: 'http://www.w3.org/2000/svg',
            viewBox: `0 0 ${model.width} ${model.height}`,
            width: model.width,
            height: model.height,
            // Production stack from specs/samples/minimal.svg.
            'font-family': "-apple-system, 'SF Pro Display', 'Segoe UI', Helvetica, Arial, sans-serif",
        })}>`,
    );

    out.push(`<rect${attrs({ width: model.width, height: model.height, fill: model.backgroundColor })}/>`);

    out.push(renderHeaderCard(model, palette));
    out.push(renderTimelinePanel(model, palette));
    for (const lane of model.swimlanes) {
        out.push(renderSwimlane(lane, palette));
    }
    if (model.nowline) {
        out.push(renderNowline(model.nowline, palette));
    }

    out.push('</svg>');
    return out.join('');
}

function renderHeaderCard(model: PositionedRoadmap, p: Palette): string {
    const { box, title, author } = model.header;
    const parts: string[] = [];
    parts.push(
        `<rect${attrs({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            rx: 6,
            fill: p.panel,
            stroke: p.border,
            'stroke-width': 1,
        })}/>`,
    );
    parts.push(textTag({ x: box.x + 16, y: box.y + 28, 'font-size': 16, 'font-weight': 600, fill: p.text }, title));
    if (author) {
        parts.push(textTag({ x: box.x + 16, y: box.y + 46, 'font-size': 11, fill: p.muted }, author));
    }
    return group(parts);
}

function renderTimelinePanel(model: PositionedRoadmap, p: Palette): string {
    const parts: string[] = [];
    const { box, rows, gridX } = model.timeline;
    const lastRow = rows[rows.length - 1];
    const headerBottom = lastRow ? lastRow.y + lastRow.height : box.y;
    const headerHeight = headerBottom - box.y;
    parts.push(
        `<rect${attrs({
            x: box.x,
            y: box.y,
            width: box.width,
            height: headerHeight,
            rx: 4,
            fill: p.panel,
            stroke: p.border,
            'stroke-width': 1,
        })}/>`,
    );
    for (const row of rows) {
        for (const tick of row.ticks) {
            if (tick.label) {
                parts.push(
                    textTag(
                        {
                            x: tick.centerX,
                            y: row.y + row.height - 14,
                            'font-size': 11,
                            'text-anchor': 'middle',
                            fill: p.muted,
                        },
                        tick.label,
                    ),
                );
            }
        }
    }
    // Grid lines drop from the header panel bottom through to the timeline
    // bounding box bottom (which build.ts pegs at the swimlane band bottom).
    for (const x of gridX) {
        parts.push(
            `<line${attrs({
                x1: x,
                y1: headerBottom,
                x2: x,
                y2: box.y + box.height,
                stroke: p.border,
                'stroke-width': 1,
                'stroke-dasharray': '2 3',
            })}/>`,
        );
    }
    return group(parts);
}

function renderSwimlane(lane: PositionedRoadmap['swimlanes'][number], p: Palette): string {
    const parts: string[] = [];
    parts.push(
        `<rect${attrs({
            x: lane.band.x,
            y: lane.band.y,
            width: lane.band.width,
            height: lane.band.height,
            fill: p.panel,
            stroke: p.border,
            'stroke-width': 1,
        })}/>`,
    );
    // Frame-tab badge (PlantUML-style chiclet at top-left of the band).
    // Palette matches production: fill #f1f5f9, stroke #cbd5e1, text #334155.
    // Width comes from the layout (sized to fit the title text + inset).
    parts.push(
        `<rect${attrs({
            x: lane.tab.x,
            y: lane.tab.y,
            width: lane.tab.width,
            height: lane.tab.height,
            rx: 4,
            fill: '#f1f5f9',
            stroke: '#cbd5e1',
            'stroke-width': 1,
        })}/>`,
    );
    parts.push(
        textTag(
            {
                x: lane.tab.x + 10,
                y: lane.tab.y + 15,
                'font-size': 12,
                'font-weight': 600,
                fill: '#334155',
            },
            lane.title,
        ),
    );
    for (const item of lane.children) {
        parts.push(renderItem(item, p));
    }
    return group(parts);
}

function renderItem(item: PositionedRoadmap['swimlanes'][number]['children'][number], _p: Palette): string {
    const parts: string[] = [];
    const swatch = STATUS_PALETTE[item.status];
    parts.push(
        `<rect${attrs({
            x: item.box.x,
            y: item.box.y,
            width: item.box.width,
            height: item.box.height,
            rx: 4,
            fill: swatch.barFill,
            stroke: swatch.barStroke,
            'stroke-width': 1,
        })}/>`,
    );
    parts.push(
        textTag(
            {
                x: item.textX,
                y: item.box.y + 20,
                'font-size': 13,
                'font-weight': 600,
                fill: swatch.titleColor,
            },
            item.title,
        ),
    );
    parts.push(
        textTag(
            {
                x: item.textX,
                y: item.box.y + 38,
                'font-size': 11,
                fill: swatch.metaColor,
            },
            item.metaText,
        ),
    );
    parts.push(
        `<circle${attrs({
            cx: item.box.x + item.box.width - 12,
            cy: item.box.y + 12,
            r: 5,
            fill: swatch.accent,
        })}/>`,
    );
    const fillRatio = 1 - item.remaining;
    if (fillRatio > 0) {
        parts.push(
            `<rect${attrs({
                x: item.box.x,
                y: item.box.y + item.box.height - 4,
                width: item.box.width * fillRatio,
                height: 4,
                fill: swatch.accent,
                opacity: swatch.progressOpacity,
            })}/>`,
        );
    }
    return group(parts);
}

function renderNowline(now: NonNullable<PositionedRoadmap['nowline']>, p: Palette): string {
    // Production anchors the pill in the gap above the timeline header (its
    // bottom edge sits 2px above the line top), then the line drops down
    // through the header + swimlanes.
    const pillBottom = now.topY - 2;
    const pillTop = pillBottom - 16;
    const parts: string[] = [];
    parts.push(
        `<line${attrs({
            x1: now.x,
            y1: now.topY,
            x2: now.x,
            y2: now.bottomY,
            stroke: p.now,
            'stroke-width': 2.25,
        })}/>`,
    );
    parts.push(
        `<rect${attrs({
            x: now.x - 18,
            y: pillTop,
            width: 36,
            height: 16,
            rx: 8,
            fill: p.now,
        })}/>`,
    );
    parts.push(
        textTag(
            {
                x: now.x,
                y: pillTop + 12,
                'font-size': 10,
                'font-weight': 700,
                'text-anchor': 'middle',
                fill: '#ffffff',
            },
            now.label,
        ),
    );
    return group(parts);
}

// ---- helpers ---------------------------------------------------------------

function group(parts: string[]): string {
    return `<g>${parts.join('')}</g>`;
}

function escAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function num(n: number): string {
    if (!Number.isFinite(n)) return '0';
    if (Number.isInteger(n)) return n.toString();
    return (Math.round(n * 100) / 100).toString();
}

function attrs(values: Attrs): string {
    const keys = Object.keys(values).sort();
    const parts: string[] = [];
    for (const key of keys) {
        const v = values[key];
        if (v === null || v === undefined || v === false) continue;
        if (v === true) {
            parts.push(key);
        } else {
            const formatted = typeof v === 'number' ? num(v) : String(v);
            parts.push(`${key}="${escAttr(formatted)}"`);
        }
    }
    return parts.length ? ' ' + parts.join(' ') : '';
}

function textTag(values: Attrs, content: string): string {
    return `<text${attrs(values)}>${escText(content)}</text>`;
}
