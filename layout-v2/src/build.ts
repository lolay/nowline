// Composition root: ParsedRoadmap → PositionedRoadmap.
//
// Wires together the four pieces:
//   ViewPreset    → time-axis configuration (resolution, headers, density)
//   TimeScale     → date → x (continuous or non-continuous via WorkingCalendar)
//   BandScale     → laneId → y (with bandwidth + step)
//   Renderable    → measure/place tree (Item, Swimlane, Roadmap)
//
// The shape `LayoutOptions` exposes the v2 architecture's knobs all at once —
// theme ↔ palette, calendar ↔ working time, preset ↔ x density, paddingInner
// ↔ vertical spacing — so swapping any one of them is a single config change.

import type {
    PositionedRoadmap,
    PositionedHeader,
    PositionedTimelineScale,
    PositionedNowline,
    PositionedHeaderRowTick,
} from './positioned.js';
import { TimeScale, BandScale } from './scales.js';
import {
    presetByName,
    buildHeaderRows,
    type ViewPreset,
} from './view-preset.js';
import {
    continuousCalendar,
    weekendsOff,
    withHolidays,
    type WorkingCalendar,
} from './working-calendar.js';
import {
    RoadmapNode,
    SwimlaneNode,
    estimateTextWidth,
    type ItemInput,
    type SwimlaneInput,
} from './renderable.js';
import { durationDays, type ParsedRoadmap } from './parse.js';

const ONE_DAY_MS = 86_400_000;

/**
 * Inner padding (px) between the header card border and the title/author text.
 * Matches the swimlane tab's text inset so the auto-collapsed card hugs its
 * longest line tightly on the right instead of leaving production's hardcoded
 * 220-wide breathing room.
 */
const HEADER_TEXT_INSET_PX = 12;
/** Font size of the header title (matches render-stub.ts `<text>` for the title). */
const HEADER_TITLE_FONT_SIZE_PX = 16;
/** Font size of the header author line. */
const HEADER_AUTHOR_FONT_SIZE_PX = 11;

export interface LayoutOptions {
    /** Override the preset selection from the DSL `scale:` value. */
    preset?: ViewPreset;
    /** Working calendar; default `continuousCalendar()`. */
    calendar?: WorkingCalendar;
    /** Today's date for the now-line; default `new Date()`. */
    today?: Date;
    /** Theme name; affects palette via the renderer stub. */
    theme?: 'light' | 'dark';
    /** Outer canvas left/right padding (matches roadmap > padding). */
    canvasPadding?: number;
    /** Outer canvas top padding; production reference uses 20. */
    canvasPaddingY?: number;
    /** Vertical inner padding for swimlane bands (drives `defaults > spacing`). */
    swimlanePaddingInner?: number;
    /** Default text-size resolved against `defaults > item text-size`. */
    itemTextSizePx?: number;
    /** Default item-bar padding from `defaults > item padding`. */
    itemPaddingPx?: number;
    /**
     * Header card width. When omitted, the card collapses to fit the title
     * and author text plus padding so the timeline can shift left.
     */
    headerWidthPx?: number;
    /** Header card height. */
    headerHeightPx?: number;
    /**
     * Horizontal gap between the right edge of the header card and the left
     * edge of the timeline panel. Defaults to `swimlaneGapPx` so horizontal
     * spacing matches the vertical spacing between the header card and the
     * first swimlane band.
     */
    headerGapPx?: number;
    /**
     * Height of one timeline header row. Production uses 36 (room for the
     * `Jan 05` label plus baseline padding).
     */
    timelineRowHeightPx?: number;
    /**
     * Distance between the bottom of the header card and the top of the first
     * swimlane band. Production reference uses 2.
     */
    swimlaneGapPx?: number;
    /**
     * Distance between band top and the first item row's top edge. Covers the
     * frame-tab area + visual breathing room. Production reference: 44.
     */
    swimlaneTopPadPx?: number;
    /**
     * Distance between the last item row's bottom edge and the band bottom.
     * Production reference: 40.
     */
    swimlaneBottomPadPx?: number;
}

export interface LayoutResult {
    model: PositionedRoadmap;
    /** Side-channel: hand back the scales for invert() demos and tests. */
    timeScale: TimeScale;
    bandScale: BandScale;
    preset: ViewPreset;
}

const DEFAULTS: Required<
    Omit<LayoutOptions, 'preset' | 'calendar' | 'today' | 'headerWidthPx' | 'headerGapPx'>
> = {
    theme: 'light',
    canvasPadding: 24,
    canvasPaddingY: 20,
    swimlanePaddingInner: 0,
    itemTextSizePx: 14,
    itemPaddingPx: 10,
    headerHeightPx: 58,
    timelineRowHeightPx: 36,
    swimlaneGapPx: 2,
    swimlaneTopPadPx: 44,
    swimlaneBottomPadPx: 40,
};

/**
 * Collapse the header card width to whichever of the title or author line
 * is widest, plus symmetric inner padding. Floors at a small minimum so a
 * single-character title still produces a sensible card.
 */
function computeHeaderWidth(title: string, author: string | undefined): number {
    const titleWidth = estimateTextWidth(title, HEADER_TITLE_FONT_SIZE_PX);
    const authorWidth = author ? estimateTextWidth(author, HEADER_AUTHOR_FONT_SIZE_PX) : 0;
    const widest = Math.max(titleWidth, authorWidth);
    return Math.max(96, Math.ceil(widest + 2 * HEADER_TEXT_INSET_PX));
}

export function buildLayout(parsed: ParsedRoadmap, options: LayoutOptions = {}): LayoutResult {
    const opts = { ...DEFAULTS, ...options };
    const preset = options.preset ?? presetByName(parsed.scale);
    const calendar = options.calendar ?? continuousCalendar();
    const today = options.today ?? new Date();

    // ---- Date window: span enough days to fit every item end -----------------
    let totalDays = 1;
    const items: { laneId: string; input: ItemInput }[] = [];
    for (const lane of parsed.swimlanes) {
        let cursor = 0; // days since roadmap start
        for (const item of lane.items) {
            const days = durationDays(item.duration);
            const start = addDays(parsed.start, cursor);
            const end = addDays(parsed.start, cursor + days);
            cursor += days;
            items.push({
                laneId: lane.id,
                input: {
                    id: item.id,
                    title: item.title,
                    start,
                    end,
                    status: item.status,
                    remaining: item.remaining,
                    textSizePx: opts.itemTextSizePx,
                    paddingPx: opts.itemPaddingPx,
                    duration: item.duration,
                    remainingPercent: item.remainingPercent,
                },
            });
        }
        totalDays = Math.max(totalDays, cursor);
    }
    const endDate = addDays(parsed.start, totalDays);

    // ---- Layout window in pixels --------------------------------------------
    // Vertical anchoring matches the production reference:
    //   header card: y = canvasPaddingY .. + headerHeightPx
    //   timeline header: bottom-aligned with the header card bottom
    //   swimlane band: starts swimlaneGapPx below the header card bottom
    const headerLeft = opts.canvasPadding;
    const headerWidthPx = options.headerWidthPx ?? computeHeaderWidth(parsed.title, parsed.author);
    const headerGapPx = options.headerGapPx ?? opts.swimlaneGapPx;
    const chartLeft = headerLeft + headerWidthPx + headerGapPx;
    const headerCardBottom = opts.canvasPaddingY + opts.headerHeightPx;
    const headerRowsHeight = preset.headers.length * opts.timelineRowHeightPx;
    const timelineTop = headerCardBottom - headerRowsHeight;
    const swimlanesTop = headerCardBottom + opts.swimlaneGapPx;

    // ---- Build TimeScale -----------------------------------------------------
    // Width budget = working days × pixelsPerTick. We back the range out from
    // there so both continuous and non-continuous modes use a consistent
    // pixels-per-working-day density.
    const ticksAcross = ticksPerDay(preset) * totalDays;
    const chartWidth = Math.round(ticksAcross * preset.pixelsPerTick);
    const time = new TimeScale({
        domain: [parsed.start, endDate],
        range: [chartLeft, chartLeft + chartWidth],
        calendar,
    });

    // ---- Band background bounds (full canvas width minus padding) ----------
    // The band rectangle visually spans the full chart, with the header card
    // and timeline panel layered in front. Items are still placed via the
    // time scale; only the band background uses these wider bounds.
    const canvasWidthPx = chartLeft + chartWidth + opts.canvasPadding;
    const bandX = opts.canvasPadding;
    const bandWidth = canvasWidthPx - opts.canvasPadding * 2;

    // ---- Build BandScale -----------------------------------------------------
    // Pre-measure each swimlane to get its desired height; sum into bands.
    const swimlaneNodes = parsed.swimlanes.map((lane) => {
        const laneItems = items.filter((i) => i.laneId === lane.id).map((i) => i.input);
        const input: SwimlaneInput = {
            id: lane.id,
            title: lane.title,
            topPadPx: opts.swimlaneTopPadPx,
            bottomPadPx: opts.swimlaneBottomPadPx,
            items: laneItems,
        };
        return new SwimlaneNode(input);
    });

    const measureCtx = { time, bandTop: 0, bandHeight: 64, bandX, bandWidth };
    const desiredBandHeights = swimlaneNodes.map((n) => n.measure(measureCtx).height);
    const totalBandsHeight = desiredBandHeights.reduce((a, b) => a + b, 0);
    const bandsRange: [number, number] = [swimlanesTop, swimlanesTop + totalBandsHeight];
    const bands = new BandScale({
        domain: swimlaneNodes.map((n) => n.id),
        range: bandsRange,
        paddingInner: opts.swimlanePaddingInner,
    });

    // ---- Place ---------------------------------------------------------------
    const roadmap = new RoadmapNode(swimlaneNodes);
    const placed = roadmap.place(swimlanesTop, { time, bandX, bandWidth }, bands);

    const swimlanesBottom = swimlanesTop + placed.totalHeight;
    const chartBottom = swimlanesBottom + opts.canvasPaddingY;

    // ---- Build timeline header rows in pixel space --------------------------
    const headerRows = buildHeaderRows(preset, parsed.start, endDate);
    const positionedRows = headerRows.rows.map((row, idx) => {
        const ticks: PositionedHeaderRowTick[] = row.ticks.map((t) => {
            const leftX = time.forward(t.start);
            const rightX = time.forward(t.end);
            return {
                label: t.label,
                centerX: (leftX + rightX) / 2,
                leftX,
                rightX,
            };
        });
        return {
            y: timelineTop + idx * opts.timelineRowHeightPx,
            height: opts.timelineRowHeightPx,
            ticks,
        };
    });

    const timeline: PositionedTimelineScale = {
        box: {
            x: chartLeft,
            y: timelineTop,
            width: chartWidth,
            // Bounding box reaches the swimlane bottom so grid lines and the
            // now-line have a consistent vertical span to drop through.
            height: swimlanesBottom - timelineTop,
        },
        rows: positionedRows,
        gridX: headerRows.resolutionTicks.map((d) => time.forward(d)),
    };

    // ---- Header card --------------------------------------------------------
    const header: PositionedHeader = {
        box: {
            x: headerLeft,
            y: opts.canvasPaddingY,
            width: headerWidthPx,
            height: opts.headerHeightPx,
        },
        title: parsed.title,
        author: parsed.author,
    };

    // ---- Now-line -----------------------------------------------------------
    const inDomain = today >= parsed.start && today <= endDate;
    const nowline: PositionedNowline | null = inDomain
        ? {
              x: time.forward(today),
              topY: timelineTop,
              bottomY: swimlanesBottom,
              label: 'now',
          }
        : null;

    const model: PositionedRoadmap = {
        width: canvasWidthPx,
        height: chartBottom,
        backgroundColor: opts.theme === 'dark' ? '#0f172a' : '#f8fafc',
        header,
        timeline,
        swimlanes: placed.swimlanes,
        nowline,
    };

    return { model, timeScale: time, bandScale: bands, preset };
}

function addDays(base: Date, days: number): Date {
    return new Date(base.getTime() + days * ONE_DAY_MS);
}

function ticksPerDay(preset: ViewPreset): number {
    switch (preset.resolution.unit) {
        case 'day':
            return 1 / preset.resolution.increment;
        case 'week':
            return 1 / (preset.resolution.increment * 7);
        case 'month':
            return 1 / (preset.resolution.increment * 30);
        case 'quarter':
            return 1 / (preset.resolution.increment * 91);
        case 'year':
            return 1 / (preset.resolution.increment * 365);
    }
}
