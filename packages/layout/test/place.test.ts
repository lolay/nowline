// The place phase (specs/layout-phases.md §3.4): `placeChart` runs on the
// date window and the measure alone, never reads the canvas, and gives a
// background item its wave tooltip where it places it (N5), before
// finalize builds the waves.

import { buildWavePlan } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { sequenceOne } from '../src/nodes/sequence-one.js';
import { resolveDateWindow, resolveScope } from '../src/phases/date-window.js';
import { measureRoadmap } from '../src/phases/measure.js';
import { type PlacedChart, placeChart } from '../src/phases/place.js';
import { scheduleRoadmap } from '../src/schedule.js';
import type { PositionedItem, PositionedSwimlane } from '../src/types.js';
import { parseAndResolve } from './helpers.js';
import { EXAMPLE_3 } from './wave-examples.js';

async function place(source: string, locale?: string): Promise<PlacedChart> {
    const { file, resolved } = await parseAndResolve(source);
    const options = { locale };
    const schedule = scheduleRoadmap(file, resolved, { plan: buildWavePlan(resolved) ?? null });
    const scope = resolveScope(file, resolved, options);
    const window = resolveDateWindow(file, resolved, options, scope, schedule);
    const measured = measureRoadmap(file, resolved, options, scope, window);
    return placeChart(resolved, scope, window, measured, { sequenceOne });
}

function items(lanes: PositionedSwimlane[]): Map<string, PositionedItem> {
    const out = new Map<string, PositionedItem>();
    for (const lane of lanes) {
        for (const child of lane.children) {
            if (child.kind === 'item' && child.id) out.set(child.id, child);
        }
    }
    return out;
}

describe('placeChart', () => {
    it('gives a background item its tooltip where it places it', async () => {
        const chart = await place(EXAMPLE_3);
        const placed = items(chart.swimlanes);
        expect(placed.get('oncall')?.waveTooltip).toBe('Background (no wave)');
        expect(placed.get('docs')?.waveTooltip).toBe('Background (no wave)');
        expect(placed.get('schema')?.waveRole).toBe('member');
        expect('waveTooltip' in (placed.get('schema') ?? {})).toBe(false);
        const fr = items((await place(EXAMPLE_3, 'fr')).swimlanes);
        expect(fr.get('oncall')?.waveTooltip).toBe('Travail de fond (hors vague)');
    });

    it('leaves the lane widths to finalize and records the chart bottom', async () => {
        const chart = await place(EXAMPLE_3);
        expect(chart.swimlanes.map((lane) => lane.box.width)).toEqual([0, 0, 0]);
        expect(chart.bottomY).toBe(chart.ctx.swimlaneBottomY);
        expect(chart.bottomY).toBe(chart.ctx.chartBottomY);
        expect(chart.waveSolve?.capped).toBe(false);
    });
});
