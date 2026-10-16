// Unit tests for the date-port dependency router
// (specs/true-width-layout.md §3.4). Run directly against
// `routeDependencies` so they pin down its rules (ports, gap choice, lanes,
// bundling, the no-arrow case, arrowheads) without the layout engine.

import { describe, expect, it } from 'vitest';
import {
    ARROW_HEAD_MIN_PX,
    ARROW_HEAD_WIDTH_PX,
    type ArrowEnd,
    arrowHead,
    CHANNEL_LANE_PX,
    type DependencyRouteRequest,
    type RouteObstacles,
    routeDependencies,
    sourcePortX,
    targetPortX,
} from '../src/edge-routing.js';

/** 8 px a working day, as at the default weekly scale. */
const PPD = 8;

/** An item bar over `[startX, endX]` on the row whose top is `y` (56 px band). */
function bar(startX: number, endX: number, y: number): ArrowEnd {
    return {
        startX,
        endX,
        paintedX: startX + 1,
        paintedWidth: endX - startX - 2,
        top: y,
        bottom: y + 56,
        rowY: y + 28,
        exitY: y + 28,
    };
}

function req(
    fromId: string,
    toId: string,
    source: ArrowEnd,
    target: ArrowEnd,
): DependencyRouteRequest {
    return { fromId, toId, source, target };
}

/** The obstacles a set of bars makes: each bar is a block with two edges. */
function obstaclesOf(...ends: ArrowEnd[]): RouteObstacles {
    return {
        blocks: ends.map((e) => ({
            x: e.paintedX,
            y: e.top,
            width: e.paintedWidth,
            height: e.bottom - e.top,
        })),
        edges: ends.flatMap((e) => [
            { x: e.paintedX, top: e.top, bottom: e.bottom },
            { x: e.paintedX + e.paintedWidth, top: e.top, bottom: e.bottom },
        ]),
    };
}

describe('ports', () => {
    it('sit in the middle of the last and first day, or the middle of a bar shorter than a day', () => {
        expect(sourcePortX(bar(0, 40, 0), PPD)).toBe(36);
        expect(targetPortX(bar(40, 80, 0), PPD)).toBe(44);
        expect(sourcePortX(bar(0, 4, 0), PPD)).toBe(2);
        expect(targetPortX(bar(0, 4, 0), PPD)).toBe(2);
    });
});

describe('routeDependencies', () => {
    it('drops from the source into the gap below its row, then into the target', () => {
        const a = bar(0, 40, 0);
        const b = bar(40, 80, 64);
        const [r] = routeDependencies([req('a', 'b', a, b)], obstaclesOf(a, b), PPD);
        expect(r?.waypoints).toEqual([
            { x: 36, y: 56 },
            { x: 36, y: 60 },
            { x: 44, y: 60 },
            { x: 44, y: 64 },
        ]);
        expect(r?.slack).toBe(false);
    });

    it('marks the arrow slack when the target waits', () => {
        const a = bar(0, 40, 0);
        const b = bar(80, 120, 64);
        const [r] = routeDependencies([req('a', 'b', a, b)], obstaclesOf(a, b), PPD);
        expect(r?.slack).toBe(true);
    });

    it('leaves the top edge and lands on the bottom edge when the target is above', () => {
        const a = bar(0, 40, 64);
        const b = bar(40, 80, 0);
        const [r] = routeDependencies([req('a', 'b', a, b)], obstaclesOf(a, b), PPD);
        expect(r?.waypoints[0]).toEqual({ x: 36, y: 64 });
        expect(r?.waypoints.at(-1)).toEqual({ x: 44, y: 56 });
    });

    it('draws nothing for a same-row target that starts where its source ends', () => {
        const a = bar(0, 40, 0);
        const b = bar(40, 80, 0);
        expect(routeDependencies([req('a', 'b', a, b)], obstaclesOf(a, b), PPD)).toEqual([null]);
    });

    it('runs one dotted leg on the midline to a same-row target that waits', () => {
        const a = bar(0, 40, 0);
        const b = bar(80, 120, 0);
        const [r] = routeDependencies([req('a', 'b', a, b)], obstaclesOf(a, b), PPD);
        expect(r?.waypoints).toEqual([
            { x: 40, y: 28 },
            { x: 81, y: 28 },
        ]);
        expect(r?.slack).toBe(true);
    });

    it('skips a gap a bar in the way blocks, for one clear of it', () => {
        const a = bar(0, 40, 0);
        // `c` sits 1 px under `a`, closing the gap below `a`'s row over the
        // leg's x's.
        const c = bar(0, 120, 57);
        const b = bar(80, 120, 200);
        const obstacles = obstaclesOf(a, c, b);
        const [r] = routeDependencies([req('a', 'b', a, b)], obstacles, PPD);
        const y = r?.waypoints[1].y ?? 0;
        expect(y).toBeGreaterThan(113);
        expect(y).toBeLessThan(200);
    });

    it('prefers a gap whose vertical legs keep clear of every bar edge', () => {
        const a = bar(0, 40, 0);
        const b = bar(80, 120, 200);
        // A bar between them whose left edge sits on the target's port
        // column: a leg dropping past it would run along that edge.
        const c = { ...bar(83.5, 160, 100), paintedX: 84 };
        const [r] = routeDependencies([req('a', 'b', a, b)], obstaclesOf(a, b, c), PPD);
        // The horizontal leg runs below `c`, so the target leg never passes it.
        expect(r?.waypoints[1].y).toBeGreaterThan(156);
    });

    it('gives arrows sharing a gap their own lanes', () => {
        const a = bar(0, 40, 0);
        const b = bar(40, 80, 0);
        const x = bar(80, 120, 64);
        const y = bar(120, 160, 64);
        const routed = routeDependencies(
            [req('a', 'y', a, y), req('b', 'x', b, x)],
            obstaclesOf(a, b, x, y),
            PPD,
        );
        const lanes = routed.map((r) => r?.waypoints[1].y ?? 0);
        expect(Math.abs(lanes[0] - lanes[1])).toBe(CHANNEL_LANE_PX);
    });

    it('bundles arrows landing on one day into one lane (O1)', () => {
        const a = bar(0, 40, 0);
        const b = bar(40, 80, 0);
        const c = bar(80, 120, 64);
        const routed = routeDependencies(
            [req('a', 'c', a, c), req('b', 'c', b, c)],
            obstaclesOf(a, b, c),
            PPD,
        );
        expect(routed[0]?.waypoints[1].y).toBe(routed[1]?.waypoints[1].y);
    });
});

describe('arrowHead (O6)', () => {
    it('is full width on a wide target, the target wide on a narrow one, a dot below the floor', () => {
        expect(arrowHead(100)).toEqual({ headWidth: ARROW_HEAD_WIDTH_PX, head: 'arrow' });
        expect(arrowHead(5)).toEqual({ headWidth: 5, head: 'arrow' });
        expect(arrowHead(1)).toEqual({ headWidth: ARROW_HEAD_MIN_PX, head: 'dot' });
    });
});
