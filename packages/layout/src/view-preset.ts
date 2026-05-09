// ViewPreset — declarative configuration for the timeline header
// (tick stride, label thinning, label format). Replaces the
// imperative `for` loop and `formatTickLabel` switch in the legacy
// `timeline.ts`.
//
// `resolveScale` parses the DSL `scale:` property (and any nested
// `scale` block) into a `ViewPreset`. `buildHeaderTicks` produces
// the `PositionedTick[]` byte-stable with the legacy generator: same
// x positions, same labelX positions, same major/minor flags, same
// label text.

import type { NowlineFile, ScaleBlock } from '@nowline/core';
import { addDays } from './calendar.js';
import { DEFAULT_LOCALE, localeStrings } from './i18n.js';
import { DEFAULT_PIXELS_PER_DAY, LABEL_THINNING } from './themes/shared.js';
import type { TimeScale } from './time-scale.js';
import type { PositionedTick } from './types.js';
import type { WorkingCalendar } from './working-calendar.js';

export type ScaleUnit = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export interface ViewPreset {
    /** Tick stride unit (each tick is one `unit` apart). */
    unit: ScaleUnit;
    /** Show a label every N ticks (1 = every tick gets a label). */
    labelEvery: number;
    /** Pixels per `1 unit` worth of working days. */
    pixelsPerUnit: number;
}

// `ScaleConfig` is kept as an alias for source-compat with the few
// callers that still spell the old name; new code should use
// `ViewPreset`.
export type ScaleConfig = ViewPreset;

function stripColon(key: string): string {
    return key.endsWith(':') ? key.slice(0, -1) : key;
}

export function resolveScale(file: NowlineFile, scaleBlock: ScaleBlock | undefined): ViewPreset {
    const scaleProp = file.roadmapDecl?.properties.find((p) => stripColon(p.key) === 'scale');
    // `scale:` accepts a unit name (`days`/`weeks`/`months`/`quarters`/`years`)
    // OR a duration literal (`1w`, `2w`, `1m`, `1q`, `1y`). The literal form
    // is the documented default in the DSL spec; it picks the unit and uses
    // the literal's count to size the pixels-per-unit budget.
    const rawScale = scaleProp?.value;
    let unit: ScaleUnit = 'weeks';
    let pixelsPerUnitOverride: number | undefined;
    let labelEveryOverride: number | undefined;
    if (rawScale) {
        if (
            rawScale === 'days' ||
            rawScale === 'weeks' ||
            rawScale === 'months' ||
            rawScale === 'quarters' ||
            rawScale === 'years'
        ) {
            unit = rawScale;
        } else {
            const dur = /^(\d+)([dwmqy])$/.exec(rawScale);
            if (dur) {
                const n = Math.max(1, parseInt(dur[1], 10));
                switch (dur[2]) {
                    case 'd':
                        unit = 'days';
                        break;
                    case 'w':
                        unit = 'weeks';
                        break;
                    case 'm':
                        unit = 'months';
                        break;
                    case 'q':
                        unit = 'quarters';
                        break;
                    case 'y':
                        unit = 'years';
                        break;
                }
                pixelsPerUnitOverride = unitPx(unit) * n;
                // A literal scale like `1w` says "I want exactly one label per
                // unit." Override the default thinning so every tick is named.
                labelEveryOverride = 1;
            }
        }
    }
    const defaultLabelEvery = labelEveryOverride ?? LABEL_THINNING[unit] ?? 4;

    if (scaleBlock) {
        const unitProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'unit');
        const resolvedUnit: ScaleUnit = (unitProp?.value as ScaleUnit) ?? unit;
        const labelProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'label-every');
        const pxProp = scaleBlock.properties.find((p) => stripColon(p.key) === 'pixels-per-unit');
        const labelEvery = labelProp
            ? Math.max(1, parseInt(labelProp.value, 10) || defaultLabelEvery)
            : defaultLabelEvery;
        const pixelsPerUnit = pxProp
            ? Math.max(1, parseInt(pxProp.value, 10) || unitPx(resolvedUnit))
            : (pixelsPerUnitOverride ?? unitPx(resolvedUnit));
        return { unit: resolvedUnit, labelEvery, pixelsPerUnit };
    }

    return {
        unit,
        labelEvery: defaultLabelEvery,
        pixelsPerUnit: pixelsPerUnitOverride ?? unitPx(unit),
    };
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

/**
 * Build header ticks for the chart. The ith tick sits at
 * `originX + i * stridePx`. The last tick is rendered (so the chart
 * has a closing edge) but its label is suppressed because there's no
 * following column.
 */
export function buildHeaderTicks(
    scale: TimeScale,
    preset: ViewPreset,
    calendar: WorkingCalendar,
    locale: string = DEFAULT_LOCALE,
): PositionedTick[] {
    const dayPerTick = calendar.daysPerUnit(preset.unit);
    const stridePx = dayPerTick * scale.pixelsPerDay;
    const totalDays = Math.max(1, Math.round(scale.widthPx / scale.pixelsPerDay));
    const tickCount = Math.floor(totalDays / dayPerTick) + 1;
    const ticks: PositionedTick[] = [];
    for (let i = 0; i < tickCount; i++) {
        const days = i * dayPerTick;
        const x = scale.originX + days * scale.pixelsPerDay;
        const isMajor = i % preset.labelEvery === 0;
        const isLast = i === tickCount - 1;
        ticks.push({
            x,
            labelX: isLast ? undefined : x + stridePx / 2,
            major: isMajor,
            label:
                isMajor && !isLast
                    ? formatTickLabel(preset.unit, addDays(scale.domain[0], days), i, locale)
                    : undefined,
        });
    }
    return ticks;
}

function formatTickLabel(unit: ScaleUnit, date: Date, _index: number, locale: string): string {
    switch (unit) {
        case 'days':
            return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
        case 'weeks': {
            const month = date.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
            const day = date.getUTCDate().toString().padStart(2, '0');
            return `${month} ${day}`;
        }
        case 'months':
            return date.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
        case 'quarters': {
            const q = Math.floor(date.getUTCMonth() / 3) + 1;
            return `${localeStrings(locale).quarterPrefix}${q} ${date.getUTCFullYear()}`;
        }
        case 'years':
            return `${date.getUTCFullYear()}`;
    }
}
