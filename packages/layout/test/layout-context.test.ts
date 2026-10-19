// `createLayoutContext` is the one builder behind the root context and every
// isolated region's context (specs/layout-phases.md section 3.8): the chart
// fields pass through unchanged, a region passes no footnotes and no marker
// placements, and `waves` is a key only when the host has wave state.

import { describe, expect, it } from 'vitest';
import { defaultRowBand } from '../src/band-scale.js';
import { createLayoutContext } from '../src/layout-context.js';
import { themes } from '../src/themes/index.js';
import type { MarkerRowPlacement } from '../src/types.js';
import { parseAndResolve } from './helpers.js';

const SOURCE = `nowline v1

config

roadmap r "R" start:2026-01-05

size sm effort:2d

anchor k date:2026-01-05

swimlane a
  item x "X" size:sm

milestone m after:x
`;

async function build(init: Parameters<typeof createLayoutContext>[3], waves?: object) {
    const { resolved } = await parseAndResolve(SOURCE);
    const shared = {
        theme: themes.light,
        cal: { daysPerWeek: 5, hoursPerDay: 8 },
        schedule: {},
        timeline: {},
        scale: {},
        calendar: {},
        bandScale: defaultRowBand(),
        ...(waves ? { waves } : {}),
    };
    return {
        resolved,
        ctx: createLayoutContext(
            resolved,
            shared as unknown as Parameters<typeof createLayoutContext>[1],
            { chartTopY: 10, chartBottomY: 20, swimlaneBottomY: 30 },
            init,
        ),
    };
}

describe('createLayoutContext', () => {
    it('passes the chart fields through unchanged', async () => {
        const { ctx } = await build({});
        expect([ctx.chartTopY, ctx.chartBottomY, ctx.swimlaneBottomY]).toEqual([10, 20, 30]);
    });

    it('carries no canvas extent, so placement cannot read the canvas', async () => {
        const { ctx } = await build({});
        expect('chartRightX' in ctx).toBe(false);
    });

    it('takes the per-file half from the source and resolves its sizes', async () => {
        const { ctx, resolved } = await build({});
        expect(ctx.labels).toBe(resolved.content.labels);
        expect(ctx.symbols).toBe(resolved.config.symbols);
        expect(ctx.styleCtx.styles).toBe(resolved.config.styles);
        expect(ctx.styleCtx.theme).toBe(themes.light);
        expect([...ctx.sizes.keys()]).toEqual(['sm']);
        // A milestone's arrow from one of these starts on its marker row.
        expect([...ctx.markerIds]).toEqual(['k', 'm']);
    });

    it('starts a region-style context with no footnotes, marker placements or edges', async () => {
        const { ctx } = await build({});
        expect(ctx.footnoteIndex.size).toBe(0);
        expect(ctx.footnoteHosts.size).toBe(0);
        expect(ctx.markerRowPlacements.size).toBe(0);
        expect(ctx.entityLeftEdges.size + ctx.entityRightEdges.size).toBe(0);
        expect(ctx.nextParallelId + ctx.nextGroupId).toBe(0);
        expect('waves' in ctx).toBe(false);
    });

    it('keeps the marker placements and wave state it is handed', async () => {
        const placements = new Map<string, MarkerRowPlacement>([
            [
                'm',
                {
                    rowIndex: 0,
                    centerY: 1,
                    labelBox: { x: 0, y: 0, width: 1, height: 1 },
                    labelSide: 'right',
                },
            ],
        ]);
        const waves = {};
        const { ctx } = await build({ markerRowPlacements: placements }, waves);
        expect(ctx.markerRowPlacements).toBe(placements);
        expect(ctx.waves).toBe(waves);
    });
});
