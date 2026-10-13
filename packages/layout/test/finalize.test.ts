// The finalize pass (specs/layout-phases.md §3.5, §6): the step table is
// checked against the slot rules, and the canvas, the final scale and the
// marker band throw when read before the step that settles them.

import { buildWavePlan } from '@nowline/core';
import { describe, expect, it } from 'vitest';
import { finalizeBuilders, layoutHelpers, layoutRoadmap } from '../src/layout.js';
import { resolveDateWindow, resolveScope } from '../src/phases/date-window.js';
import {
    CanvasExtent,
    checkFinalizeOrder,
    FINALIZE_STEPS,
    FinalizeContext,
    type FinalizeStep,
    finalizeRoadmap,
} from '../src/phases/finalize.js';
import { measureRoadmap } from '../src/phases/measure.js';
import { placeChart } from '../src/phases/place.js';
import { scheduleRoadmap } from '../src/schedule.js';
import { parseAndResolve } from './helpers.js';

const TODAY = new Date(Date.UTC(2026, 1, 9));

const SOURCE = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

anchor kickoff "Kickoff" date:2026-01-05
milestone ship "Ship" after:a2

swimlane a "A"
  item a1 "A1" duration:2w
  item a2 "A2" duration:1w after:a1
`;

/** A finalize context over the first three phases of `SOURCE`, before any step ran. */
async function freshContext(): Promise<{
    fx: FinalizeContext;
    expected: ReturnType<typeof layoutRoadmap>;
}> {
    const { file, resolved } = await parseAndResolve(SOURCE);
    const options = { today: TODAY };
    const schedule = scheduleRoadmap(file, resolved, {
        today: TODAY,
        plan: buildWavePlan(resolved) ?? null,
    });
    const scope = resolveScope(file, resolved, options);
    const window = resolveDateWindow(file, resolved, options, scope, schedule);
    const measured = measureRoadmap(file, resolved, options, scope, window);
    const chart = placeChart(resolved, scope, window, measured, layoutHelpers);
    const fx = new FinalizeContext(
        file,
        resolved,
        options,
        scope,
        window,
        measured,
        chart,
        finalizeBuilders,
    );
    return { fx, expected: layoutRoadmap(file, resolved, options) };
}

function stepNamed(name: string): FinalizeStep {
    const step = FINALIZE_STEPS.find((s) => s.name === name);
    if (!step) throw new Error(`no step ${name}`);
    return step;
}

/** A copy of the table with `name` moved to `index`. */
function moved(name: string, index: number): FinalizeStep[] {
    const steps = FINALIZE_STEPS.filter((s) => s.name !== name);
    steps.splice(index, 0, stepNamed(name));
    return steps;
}

describe('the finalize step table', () => {
    it('runs f1 to f16 in the order of specs/layout-phases.md §3.5', () => {
        expect(FINALIZE_STEPS.map((s) => s.name)).toEqual([
            'growCanvasForSpill',
            'extendTimeline',
            'growCanvasForMarkerLabels',
            'fitWidths',
            'packMarkers',
            'placeMarkers',
            'growHeaderRows',
            'bottomTickPanel',
            'waves',
            'anchors',
            'dependencyEdges',
            'nowline',
            'waveLegend',
            'footnotePanel',
            'header',
            'attribution',
        ]);
    });

    it('keeps every slot rule', () => {
        expect(checkFinalizeOrder(FINALIZE_STEPS)).toEqual([]);
    });

    it('fails when fitWidths moves before extendTimeline', () => {
        expect(checkFinalizeOrder(moved('fitWidths', 1))).toContain(
            'fitWidths reads canvas before growCanvasForMarkerLabels makes it final',
        );
    });

    it('fails when the timeline extension moves after the marker labels', () => {
        expect(checkFinalizeOrder(moved('extendTimeline', 2))).toEqual(
            expect.arrayContaining([
                'extendTimeline writes canvas after growCanvasForMarkerLabels made it final',
                'growCanvasForMarkerLabels reads calendarRuns before extendTimeline writes it',
            ]),
        );
    });

    it('fails when a reader of the chart bottom moves before an advancer', () => {
        expect(checkFinalizeOrder(moved('footnotePanel', 11))).toContain(
            'footnotePanel reads chartBottom before waveLegend advances it',
        );
    });

    it('fails when a step writes an input or a second step writes a product', () => {
        const rogue: FinalizeStep = {
            name: 'rogue',
            reads: [],
            writes: ['window', 'edges'],
            run: () => false,
        };
        expect(checkFinalizeOrder([...FINALIZE_STEPS, rogue])).toEqual(
            expect.arrayContaining([
                'rogue writes the input window',
                'edges has 2 writers, not one',
            ]),
        );
    });
});

describe('the finalize guards', () => {
    it('refuses to grow a frozen canvas', () => {
        const canvas = new CanvasExtent(100);
        expect(canvas.grow(120)).toBe(true);
        expect(canvas.grow(110)).toBe(false);
        canvas.freeze();
        expect(canvas.final).toBe(120);
        expect(() => canvas.grow(130)).toThrow('the canvas grew after it was frozen');
    });

    it('refuses to read the canvas before f3', async () => {
        const { fx } = await freshContext();
        expect(() => fx.canvas.final).toThrow('the canvas was read before it was final');
        stepNamed('growCanvasForSpill').run(fx);
        stepNamed('extendTimeline').run(fx);
        expect(() => fx.canvas.final).toThrow('the canvas was read before it was final');
        stepNamed('growCanvasForMarkerLabels').run(fx);
        expect(fx.canvas.final).toBe(fx.canvas.provisional);
    });

    it('refuses to read the final scale before f2', async () => {
        const { fx } = await freshContext();
        expect(() => fx.finalScale()).toThrow('the final scale was read before');
        stepNamed('growCanvasForSpill').run(fx);
        stepNamed('extendTimeline').run(fx);
        expect(fx.finalScale()).toBe(fx.scale);
        expect(() => fx.extendScale(fx.scale)).toThrow('the scale was extended after it was final');
    });

    it('refuses to read the marker band before f5', async () => {
        const { fx } = await freshContext();
        for (const name of ['growCanvasForSpill', 'extendTimeline', 'growCanvasForMarkerLabels']) {
            stepNamed(name).run(fx);
        }
        expect(() => fx.markerBand()).toThrow('the marker band was read before the final pack');
        stepNamed('fitWidths').run(fx);
        stepNamed('packMarkers').run(fx);
        expect(fx.markerBand().placements.has('ship')).toBe(true);
        expect(fx.ctx.markerRowPlacements).toBe(fx.markerBand().placements);
    });

    it('throws when a reordered pass reads a slot early', async () => {
        const { fx } = await freshContext();
        expect(() => finalizeRoadmap(fx, moved('fitWidths', 1))).toThrow(
            'the canvas was read before it was final',
        );
    });

    it('lays out the same model through the phases as layoutRoadmap', async () => {
        const { fx, expected } = await freshContext();
        expect(finalizeRoadmap(fx)).toEqual(expected);
    });
});
