// Unit tests for the channel-based dependency-arrow router. Run
// directly against `routeChannelEdges` so tests pin down router
// behaviour (slot assignment, obstacle detection, bracket nudge,
// under-bar fallback) without going through the layout engine.

import { describe, it, expect } from 'vitest';
import {
    BRACKET_NUDGE_PX,
    ChannelGrid,
    MIN_SOURCE_STUB_PX,
    MIN_TARGET_STUB_PX,
    routeChannelEdges,
    type EdgeRouteRequest,
} from '../src/edge-routing.js';
import { layoutRoadmap } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

const emptyGrid = (): ChannelGrid => new ChannelGrid({ itemBars: [], brackets: [] });

function req(
    fromId: string,
    toId: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
): EdgeRouteRequest {
    return { fromId, toId, from, to, isMarkerSource: false };
}

describe('routeChannelEdges', () => {
    it('drops the elbow at the gutter midpoint when no obstacle blocks it', () => {
        // Source ends at x=100, target starts at x=200 — clean 100 px
        // gutter, no obstacles. Expect elbow at x=150.
        const r = routeChannelEdges(
            [req('a', 'b', { x: 100, y: 50 }, { x: 200, y: 150 })],
            emptyGrid(),
        );
        expect(r).toHaveLength(1);
        expect(r[0].underBar).toBe(false);
        expect(r[0].waypoints).toHaveLength(4);
        expect(r[0].waypoints[1].x).toBeCloseTo(150, 1);
        expect(r[0].waypoints[2].x).toBeCloseTo(150, 1);
    });

    it('emits a 2-point straight segment for same-row edges past the skip threshold', () => {
        // Same Y, generous X distance — skip rule (< 20 px) does NOT
        // apply. Router emits a degenerate horizontal segment.
        const r = routeChannelEdges(
            [req('a', 'b', { x: 100, y: 50 }, { x: 200, y: 50 })],
            emptyGrid(),
        );
        expect(r[0].waypoints).toEqual([
            { x: 100, y: 50 },
            { x: 200, y: 50 },
        ]);
    });

    it('shifts the elbow X away from a bar that sits in the natural channel', () => {
        // Bar at x=140..160 spans the full Y range — the natural mid
        // (150) is blocked. Router walks left/right looking for clear
        // channel; should find x=139 or x=161.
        const grid = new ChannelGrid({
            itemBars: [{ x: 140, y: 0, width: 20, height: 200 }],
            brackets: [],
        });
        const r = routeChannelEdges([req('a', 'b', { x: 100, y: 50 }, { x: 200, y: 150 })], grid);
        expect(r[0].underBar).toBe(false);
        const elbow = r[0].waypoints[1].x;
        // Channel must clear the 140..160 bar.
        expect(elbow <= 140 || elbow >= 160).toBe(true);
    });

    it('falls back to under-bar routing when no clear channel exists', () => {
        // Bar fully covers the inter-column gap [100, 200] — there's
        // nowhere clean to drop the vertical leg. Router gives up and
        // sets underBar=true.
        const grid = new ChannelGrid({
            itemBars: [{ x: 95, y: 0, width: 110, height: 200 }],
            brackets: [],
        });
        const r = routeChannelEdges([req('a', 'b', { x: 100, y: 50 }, { x: 200, y: 150 })], grid);
        expect(r[0].underBar).toBe(true);
    });

    it('nudges the elbow X away from a visible bracket within clearance', () => {
        // Mid-gutter is at x=150; bracket at x=151 falls within
        // BRACKET_NUDGE_PX (4) of the mid. Router shifts away.
        const grid = new ChannelGrid({
            itemBars: [],
            brackets: [{ x: 151, yTop: 0, yBottom: 200 }],
        });
        const r = routeChannelEdges([req('a', 'b', { x: 100, y: 50 }, { x: 200, y: 150 })], grid);
        const elbow = r[0].waypoints[1].x;
        // Nudge moves AT LEAST BRACKET_NUDGE_PX from the bracket on
        // the side that keeps the elbow inside the gutter.
        expect(Math.abs(elbow - 151)).toBeGreaterThanOrEqual(BRACKET_NUDGE_PX);
    });

    it('assigns distinct slots when two edges share a channel and overlap vertically', () => {
        // Two parallel arrows from neighbour items both want the same
        // mid-gutter elbow. Slot assigner offsets the second so they
        // do not stack.
        const reqs = [
            req('a1', 'b1', { x: 100, y: 50 }, { x: 200, y: 150 }),
            req('a2', 'b2', { x: 100, y: 80 }, { x: 200, y: 170 }),
        ];
        const r = routeChannelEdges(reqs, emptyGrid());
        const elbow1 = r[0].waypoints[1].x;
        const elbow2 = r[1].waypoints[1].x;
        // Same-channel siblings — first sits at centerline, second
        // gets a slot offset.
        expect(Math.abs(elbow1 - elbow2)).toBeGreaterThan(0);
    });

    it('respects MIN_TARGET_STUB_PX when the natural midpoint would crowd the target', () => {
        // Wide gutter (200 px), but the natural midpoint (150) would
        // leave 50 px of stub on both sides — fine. To exercise the
        // constraint, place an item bar that blocks everything except
        // the rightmost slice of the gutter; the router must still
        // honor the target-stub constraint and stay at least
        // MIN_TARGET_STUB_PX away from to.x.
        const grid = new ChannelGrid({
            // Bar covers x=[101, 192] across the leg's full Y span,
            // leaving only x=[193, 199] clear inside the gutter.
            itemBars: [{ x: 101, y: 0, width: 91, height: 200 }],
            brackets: [],
        });
        const r = routeChannelEdges([req('a', 'b', { x: 100, y: 50 }, { x: 200, y: 150 })], grid);
        const elbow = r[0].waypoints[1].x;
        expect(200 - elbow).toBeGreaterThanOrEqual(MIN_TARGET_STUB_PX);
        expect(elbow - 100).toBeGreaterThanOrEqual(MIN_SOURCE_STUB_PX);
    });

    it('forces under-bar when bracket clearance and stub constraints conflict', () => {
        // 12 px gutter — only x=[106, 194] inside the satisfiable
        // range (single point at 100+6=106 = 200-6=194 doesn't apply;
        // we use a gutter of exactly 12). Place a bracket squarely in
        // the middle of the gutter. The nudge wants to move ±4 px
        // away — both candidates fall outside the satisfiable range,
        // so the router gives up and forces under-bar.
        const grid = new ChannelGrid({
            itemBars: [],
            // Bracket at the satisfiable-range midpoint (gutter mid = 106).
            brackets: [{ x: 106, yTop: 0, yBottom: 200 }],
        });
        const r = routeChannelEdges([req('a', 'b', { x: 100, y: 50 }, { x: 112, y: 150 })], grid);
        expect(r[0].underBar).toBe(true);
        // Channel still pinned inside the stub-satisfying range.
        const elbow = r[0].waypoints[1].x;
        expect(elbow).toBeGreaterThanOrEqual(106);
        expect(elbow).toBeLessThanOrEqual(106);
    });

    it('clears parallel bracket foot tips, not just the vertical bar', () => {
        // Simulate a left bracket at x=10 with feet ending at x=14.
        // The nudge from the vertical at x=10 moves to x=14 — but that
        // collides with the foot tip if we model it. Confirm the router
        // sees the foot and avoids landing on it.
        const grid = new ChannelGrid({
            itemBars: [],
            brackets: [
                { x: 10, yTop: 0, yBottom: 200 }, // vertical bar
                { x: 14, yTop: 0, yBottom: 2 }, // top foot tip
                { x: 14, yTop: 198, yBottom: 200 }, // bottom foot tip
            ],
        });
        // Edge whose Y span crosses the top foot row: pick a wide
        // gutter so the satisfiable range is loose, then verify that
        // the chosen channel is at least BRACKET_NUDGE_PX from BOTH
        // x=10 and x=14.
        const r = routeChannelEdges([req('a', 'b', { x: 0, y: 1 }, { x: 30, y: 100 })], grid);
        const elbow = r[0].waypoints[1].x;
        // Recheck radius is BRACKET_NUDGE_PX − 0.01, so distance == 4
        // is acceptable; assert distance ≥ 4 from each foot/vertical.
        expect(Math.abs(elbow - 10)).toBeGreaterThanOrEqual(BRACKET_NUDGE_PX);
        expect(Math.abs(elbow - 14)).toBeGreaterThanOrEqual(BRACKET_NUDGE_PX);
    });

    it('routes marker → item edges as a straight stub regardless of obstacles', () => {
        // isMarkerSource bypasses channel routing — the cut line is
        // the visible stem, the path is always a 2-point horizontal.
        const grid = new ChannelGrid({
            itemBars: [{ x: 95, y: 0, width: 110, height: 200 }],
            brackets: [],
        });
        const r = routeChannelEdges(
            [
                {
                    fromId: 'kickoff',
                    toId: 'phase1',
                    from: { x: 100, y: 100 },
                    to: { x: 200, y: 100 },
                    isMarkerSource: true,
                },
            ],
            grid,
        );
        expect(r[0].underBar).toBe(false);
        expect(r[0].waypoints).toEqual([
            { x: 100, y: 100 },
            { x: 200, y: 100 },
        ]);
    });
});

describe('buildDependencies channel-routing integration', () => {
    it('routes search → ui under the audit bar (under-bar fallback)', async () => {
        // The dependencies sample stacks `audit` between `search`
        // and `ui` — the natural mid-gutter channel between
        // search.right and ui.left passes through the audit bar.
        // Channel router must give up and emit an underBar edge so
        // the renderer paints it BEFORE bar fills.
        const src = `nowline v1

config

style concurrent
  bracket: solid

roadmap r1 "Deps" start:2026-01-05 scale:1w

swimlane backend "Backend"
  item api "API v2" duration:2w
  parallel concurrent-block style:concurrent
    item search "Search service" duration:3w
    item audit "Audit pipeline" duration:7w
  item deploy "Deploy" duration:1w

swimlane frontend "Frontend"
  item sdk "SDK update" duration:2w after:api
  item ui "New console UI" duration:3w after:[sdk, search]
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const edge = model.edges.find((e) => e.fromId === 'search' && e.toId === 'ui');
        expect(edge).toBeDefined();
        // The audit bar sits squarely in the gutter between search
        // and ui — no clean channel exists, so the router emits the
        // under-bar fallback.
        expect(edge!.kind).toBe('underBar');
    });

    it('forces under-bar for api → sdk where parallel bracket sits in the 12 px gutter', async () => {
        // The dependencies sample places `api` (backend) and `sdk`
        // (frontend) in adjacent columns 12 px apart, with the
        // parallel bracket vertical sitting exactly in the middle of
        // that gutter. With min-stub + foot-tip clearance, the router
        // can no longer satisfy both constraints in the gutter and
        // falls back to under-bar so the leg paints behind the
        // bracket strokes.
        const src = `nowline v1

config

style concurrent
  bracket: solid

roadmap r1 "Deps" start:2026-01-05 scale:1w

swimlane backend "Backend"
  item api "API v2" duration:2w
  parallel concurrent-block style:concurrent
    item search "Search service" duration:3w
    item audit "Audit pipeline" duration:7w
  item deploy "Deploy" duration:1w

swimlane frontend "Frontend"
  item sdk "SDK update" duration:2w after:api
  item ui "New console UI" duration:3w after:[sdk, search]
`;
        const { file, resolved } = await parseAndResolve(src);
        const model = layoutRoadmap(file, resolved, { theme: 'light' });
        const edge = model.edges.find((e) => e.fromId === 'api' && e.toId === 'sdk');
        expect(edge).toBeDefined();
        expect(edge!.kind).toBe('underBar');
        // Channel sits at target.x − MIN_TARGET_STUB_PX so the
        // arrowhead still has its visible 6 px lead-in.
        const wp = edge!.waypoints;
        expect(wp.length).toBe(4);
        const sdk = model.swimlanes[1].children[0] as {
            box: { x: number; y: number; width: number; height: number };
        };
        const elbow = wp[1].x;
        expect(sdk.box.x - elbow).toBeGreaterThanOrEqual(MIN_TARGET_STUB_PX);
    });
});
