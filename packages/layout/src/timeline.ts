// Timeline scale: compute pixel-per-day, origin, and ticks (major/minor +
// label thinning).

import type { NowlineFile, ScaleBlock } from '@nowline/core';
import type { CalendarConfig } from './calendar.js';
import { addDays, daysBetween } from './calendar.js';
import type { ResolvedStyle, PositionedTick, PositionedTimelineScale } from './types.js';
import { DEFAULT_PIXELS_PER_DAY, LABEL_THINNING } from './themes/shared.js';

export type ScaleUnit = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export interface ScaleConfig {
    unit: ScaleUnit;
    labelEvery: number;
    pixelsPerUnit: number;
}

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

export function resolveScale(
    file: NowlineFile,
    scaleBlock: ScaleBlock | undefined,
): ScaleConfig {
    const scaleProp = file.roadmapDecl?.properties.find(
        (p) => stripColon(p.key) === 'scale',
    );
    const unit: ScaleUnit = (scaleProp?.value as ScaleUnit) ?? 'weeks';
    const defaultLabelEvery = LABEL_THINNING[unit] ?? 4;

    if (scaleBlock) {
        const unitProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'unit');
        const resolvedUnit: ScaleUnit = (unitProp?.value as ScaleUnit) ?? unit;
        const labelProp = scaleBlock.properties.find(
            (p) => stripColon(p.key) === 'label-every',
        );
        const pxProp = scaleBlock.properties.find(
            (p) => stripColon(p.key) === 'pixels-per-unit',
        );
        const labelEvery = labelProp
            ? Math.max(1, parseInt(labelProp.value, 10) || defaultLabelEvery)
            : defaultLabelEvery;
        const pixelsPerUnit = pxProp
            ? Math.max(1, parseInt(pxProp.value, 10) || unitPx(resolvedUnit))
            : unitPx(resolvedUnit);
        return { unit: resolvedUnit, labelEvery, pixelsPerUnit };
    }

    return { unit, labelEvery: defaultLabelEvery, pixelsPerUnit: unitPx(unit) };
}

function unitPx(unit: ScaleUnit): number {
    // Baseline pixel widths per one unit, tuned so ~6 month roadmaps fit
    // comfortably in a 1200 px wide chart area.
    switch (unit) {
        case 'days':
            return DEFAULT_PIXELS_PER_DAY;
        case 'weeks':
            return 40;
        case 'months':
            return 80;
        case 'quarters':
            return 160;
        case 'years':
            return 320;
    }
}

export function daysPerUnit(unit: ScaleUnit, cal: CalendarConfig): number {
    switch (unit) {
        case 'days':
            return 1;
        case 'weeks':
            return cal.daysPerWeek;
        case 'months':
            return cal.daysPerMonth;
        case 'quarters':
            return cal.daysPerQuarter;
        case 'years':
            return cal.daysPerYear;
    }
}

export function pixelsPerDay(scale: ScaleConfig, cal: CalendarConfig): number {
    return scale.pixelsPerUnit / daysPerUnit(scale.unit, cal);
}

// Render tick marks spanning [startDate, endDate], producing major (labeled)
// and minor (unlabeled) ticks. `originX` is the x of startDate.
export function buildTimelineScale(
    startDate: Date,
    endDate: Date,
    originX: number,
    scale: ScaleConfig,
    cal: CalendarConfig,
    chartHeight: number,
    labelStyle: ResolvedStyle,
): PositionedTimelineScale {
    const ppd = pixelsPerDay(scale, cal);
    const totalDays = Math.max(1, daysBetween(startDate, endDate));
    const dayPerTick = daysPerUnit(scale.unit, cal);
    const tickCount = Math.floor(totalDays / dayPerTick) + 1;
    const ticks: PositionedTick[] = [];
    for (let i = 0; i < tickCount; i++) {
        const days = i * dayPerTick;
        const x = originX + days * ppd;
        const isMajor = i % scale.labelEvery === 0;
        ticks.push({
            x,
            major: isMajor,
            label: isMajor ? formatTickLabel(scale.unit, addDays(startDate, days), i) : undefined,
        });
    }
    return {
        box: {
            x: originX,
            y: 0,
            width: totalDays * ppd,
            height: chartHeight,
        },
        ticks,
        pixelsPerDay: ppd,
        originX,
        startDate,
        endDate,
        labelStyle,
    };
}

function formatTickLabel(unit: ScaleUnit, date: Date, index: number): string {
    switch (unit) {
        case 'days':
            return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
        case 'weeks':
            return `W${index + 1}`;
        case 'months':
            return date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        case 'quarters': {
            const q = Math.floor(date.getUTCMonth() / 3) + 1;
            return `Q${q} ${date.getUTCFullYear()}`;
        }
        case 'years':
            return `${date.getUTCFullYear()}`;
    }
}

// x-coordinate for a given date (null when outside the roadmap range).
export function xForDate(
    date: Date,
    timeline: PositionedTimelineScale,
): number | null {
    if (date < timeline.startDate || date > timeline.endDate) return null;
    const days = daysBetween(timeline.startDate, date);
    return timeline.originX + days * timeline.pixelsPerDay;
}
