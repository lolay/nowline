// An isolated region's own anchors (specs/scheduler-unification.md §5 F5).
// Without waves, engine C's `scheduleRegion` resolves a region lane's
// `after:kickoff` against the region's own dated anchor, so the exports start
// it on the anchor's date. The chart used to see no region anchors and start
// the lane at the roadmap start. Engine A now seeds the region's dated
// anchors into the region's edge maps, without drawing them. With waves both
// engines walk a region with the wave edges only, so a region anchor stays
// unresolved in both.

import { isItemDeclaration } from '@nowline/core';
import { trackChildren } from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import {
    layoutRoadmap,
    type PositionedItem,
    type PositionedRoadmap,
    type PositionedTrackChild,
    scheduleRoadmap,
} from '../src/index.js';
import { ITEM_INSET_PX } from '../src/themes/shared.js';
import { parseAndResolveFiles } from './helpers.js';

const TODAY = new Date(Date.UTC(2026, 0, 5));

function collectItems(children: PositionedTrackChild[], out: PositionedItem[]): void {
    for (const child of children) {
        if (child.kind === 'item') out.push(child);
        else collectItems(child.children, out);
    }
}

/** The chart's logical `[start, end]` of every named item of region 0, in weeks. */
function regionChartWeeks(model: PositionedRoadmap): Record<string, [number, number]> {
    const items: PositionedItem[] = [];
    for (const lane of model.includes[0]?.nestedSwimlanes ?? []) {
        collectItems(lane.children, items);
    }
    const { originX, pixelsPerDay } = model.timeline;
    const weeks = (x: number): number => Math.round(((x - originX) / pixelsPerDay / 7) * 100) / 100;
    const out: Record<string, [number, number]> = {};
    for (const it of items) {
        if (!it.id) continue;
        out[it.id] = [
            weeks(it.box.x - ITEM_INSET_PX),
            weeks(it.box.x + it.box.width + ITEM_INSET_PX),
        ];
    }
    return out;
}

async function layoutBoth(files: Record<string, string>) {
    const { file, resolved } = await parseAndResolveFiles(files);
    const model = layoutRoadmap(file, resolved, { theme: 'light', today: TODAY });
    const schedule = scheduleRoadmap(file, resolved, { today: TODAY });
    const weeks = (d: Date): number =>
        Math.round(((d.getTime() - schedule.startDate.getTime()) / 86_400_000 / 7) * 100) / 100;
    const exports: Record<string, [number, number]> = {};
    for (const lane of resolved.content.isolatedRegions[0].content.swimlanes.values()) {
        for (const node of trackChildren(lane)) {
            if (!isItemDeclaration(node) || !node.name) continue;
            const s = schedule.byNode.get(node);
            if (s) exports[node.name] = [weeks(s.start), weeks(s.end)];
        }
    }
    return { model, chart: regionChartWeeks(model), exports };
}

const host = (extra = ''): string => `nowline v1

include "./team.nowline" roadmap:isolate

roadmap r "R" start:2026-01-05 calendar:full scale:1w
${extra}
swimlane main "Main"
  item m1 "Main work" duration:6w
`;

const team = (anchor: string, lane = 'after:kickoff'): string => `nowline v1

roadmap team "Team" start:2026-01-05 calendar:full scale:1w

${anchor}

swimlane t "Team"
  item a "A" duration:1w ${lane}
  item b "B" duration:1w
`;

describe('an isolated region resolves its own anchors (F5)', () => {
    it('a lane after: the region’s anchor starts on the anchor’s date, as the exports date it', async () => {
        const { chart, exports } = await layoutBoth({
            'main.nowline': host(),
            'team.nowline': team('anchor kickoff date:2026-01-19'),
        });
        expect(exports).toEqual({ a: [2, 3], b: [3, 4] });
        expect(chart).toEqual(exports);
    });

    it('the region’s anchor is resolved, not drawn', async () => {
        const { model } = await layoutBoth({
            'main.nowline': host(),
            'team.nowline': team('anchor kickoff date:2026-01-19'),
        });
        expect(model.anchors).toEqual([]);
    });

    it('a host anchor with the same id stays invisible to the region', async () => {
        const { chart, exports } = await layoutBoth({
            'main.nowline': host('\nanchor kickoff date:2026-01-26\n'),
            'team.nowline': team('anchor kickoff date:2026-01-19'),
        });
        expect(exports).toEqual({ a: [2, 3], b: [3, 4] });
        expect(chart).toEqual(exports);
    });

    it('a region without the anchor ignores the host’s, in both engines', async () => {
        const { chart, exports } = await layoutBoth({
            'main.nowline': host('\nanchor kickoff date:2026-01-26\n'),
            'team.nowline': team(''),
        });
        expect(exports).toEqual({ a: [0, 1], b: [1, 2] });
        expect(chart).toEqual(exports);
    });

    it('with waves, the region walk sees only the wave edges in both engines', async () => {
        const waves = `
wave w1 "W1"
wave w2 "W2"
`;
        const { chart, exports } = await layoutBoth({
            'main.nowline': host(waves),
            'team.nowline': team('anchor kickoff date:2026-01-19'),
        });
        expect(chart).toEqual(exports);
        expect(exports.a?.[0]).toBe(0);
    });
});
