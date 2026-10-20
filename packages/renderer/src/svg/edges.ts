// The dependency-edge layer: the arrows that join one item to another, their
// solid and dotted slack legs, and the rounded orthogonal paths they follow.

import type { Point, PositionedDependencyEdge, Theme } from '@nowline/layout';
import { ARROW_HEAD_LENGTH_PX, ARROW_HEAD_WIDTH_PX, EDGE_CORNER_RADIUS } from '@nowline/layout';
import { num, tag } from './xml.js';

/** Dash pattern of a dependency's slack leg: the dotted look of milestone slack lines. */
const SLACK_DASH = '3 3';

// A dependency arrow (specs/true-width-layout.md §3.4). It paints behind
// the bars (see `renderRoadmap`), so a leg that crosses a bar passes behind
// it. Vertical legs are solid; the horizontal leg is dotted when the target
// waits. The head is drawn, not a marker, so it can shrink to a narrow
// target and become a dot (§8 O6).
export function renderEdge(e: PositionedDependencyEdge, palette: Theme): string {
    const points = e.waypoints;
    if (points.length < 2) return '';
    const color = palette.dependency.edgeStroke;
    const tip = points[points.length - 1];
    const prev = points[points.length - 2];
    const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
    if (len === 0) return '';
    const ux = (tip.x - prev.x) / len;
    const uy = (tip.y - prev.y) / len;
    const half = e.headWidth / 2;
    // The leg stops where the head starts, so a dotted leg never shows
    // through it.
    const headLength =
        e.head === 'dot' ? half : (e.headWidth * ARROW_HEAD_LENGTH_PX) / ARROW_HEAD_WIDTH_PX;
    // A last leg no longer than the head is all head.
    const leg =
        len > headLength
            ? [...points.slice(0, -1), { x: tip.x - ux * headLength, y: tip.y - uy * headLength }]
            : points.slice(0, -1);
    const parts = [legPaths(leg, e.slack, color)];
    const headFill = palette.arrowhead.neutral;
    if (e.head === 'dot') {
        parts.push(
            tag('circle', {
                cx: num(tip.x - ux * half),
                cy: num(tip.y - uy * half),
                r: num(half),
                fill: headFill,
            }),
        );
    } else {
        const bx = tip.x - ux * headLength;
        const by = tip.y - uy * headLength;
        parts.push(
            tag('path', {
                d:
                    `M${num(bx - uy * half)} ${num(by + ux * half)} ` +
                    `L${num(tip.x)} ${num(tip.y)} ` +
                    `L${num(bx + uy * half)} ${num(by - ux * half)} z`,
                fill: headFill,
            }),
        );
    }
    return tag('g', { 'data-layer': 'dependency' }, parts.join(''));
}

// An arrow's legs: one rounded path, or for a slack arrow its solid
// vertical legs and its dotted horizontal ones. Empty when the head is all
// there is (a leg no longer than the head).
function legPaths(leg: Point[], slack: boolean, color: string): string {
    if (leg.length < 2) return '';
    const stroke = { fill: 'none', stroke: color, 'stroke-width': 1.1, 'stroke-linejoin': 'round' };
    if (!slack)
        return tag('path', { d: roundedOrthogonalPath(leg, EDGE_CORNER_RADIUS), ...stroke });
    const { solid, dotted } = splitSlackPath(leg, EDGE_CORNER_RADIUS);
    return (
        (solid ? tag('path', { d: solid, ...stroke }) : '') +
        (dotted
            ? tag('path', {
                  d: dotted,
                  ...stroke,
                  'stroke-dasharray': SLACK_DASH,
                  'stroke-linecap': 'round',
              })
            : '')
    );
}

// A slack arrow's path in two parts: its vertical legs with the rounded
// corners (solid) and its horizontal legs (dotted), so the dash pattern
// marks the wait alone.
function splitSlackPath(points: Point[], radius: number): { solid: string; dotted: string } {
    const n = points.length;
    const before: Point[] = [];
    const after: Point[] = [];
    const solid: string[] = [];
    for (let i = 1; i < n - 1; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        const next = points[i + 1];
        const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
        const r = Math.min(radius, inLen / 2, outLen / 2);
        const dIn = { x: Math.sign(cur.x - prev.x), y: Math.sign(cur.y - prev.y) };
        const dOut = { x: Math.sign(next.x - cur.x), y: Math.sign(next.y - cur.y) };
        before[i] = { x: cur.x - dIn.x * r, y: cur.y - dIn.y * r };
        after[i] = { x: cur.x + dOut.x * r, y: cur.y + dOut.y * r };
        if (r > 0) {
            solid.push(
                `M${num(before[i].x)} ${num(before[i].y)} ` +
                    `Q${num(cur.x)} ${num(cur.y)} ${num(after[i].x)} ${num(after[i].y)}`,
            );
        }
    }
    const dotted: string[] = [];
    for (let i = 0; i < n - 1; i++) {
        const a = i === 0 ? points[0] : after[i];
        const b = i === n - 2 ? points[n - 1] : before[i + 1];
        const piece = `M${num(a.x)} ${num(a.y)} L${num(b.x)} ${num(b.y)}`;
        if (Math.abs(points[i + 1].y - points[i].y) < 1e-9) dotted.push(piece);
        else solid.push(piece);
    }
    return { solid: solid.join(' '), dotted: dotted.join(' ') };
}

// Build an SVG path for a sequence of orthogonal waypoints, inserting a
// quarter-arc at every interior bend. Falls back to straight segments when
// adjacent points aren't axis-aligned (defensive — the layout always emits
// orthogonal segments).
function roundedOrthogonalPath(points: Point[], radius: number): string {
    if (points.length < 2) return '';
    const parts: string[] = [`M${num(points[0].x)} ${num(points[0].y)}`];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const cur = points[i];
        if (i === points.length - 1) {
            parts.push(`L${num(cur.x)} ${num(cur.y)}`);
            continue;
        }
        const next = points[i + 1];
        const dxIn = Math.sign(cur.x - prev.x);
        const dyIn = Math.sign(cur.y - prev.y);
        const dxOut = Math.sign(next.x - cur.x);
        const dyOut = Math.sign(next.y - cur.y);
        const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
        const r = Math.min(radius, inLen / 2, outLen / 2);
        if (r <= 0 || (dxIn !== 0 && dxOut !== 0) || (dyIn !== 0 && dyOut !== 0)) {
            parts.push(`L${num(cur.x)} ${num(cur.y)}`);
            continue;
        }
        const beforeBend = { x: cur.x - dxIn * r, y: cur.y - dyIn * r };
        const afterBend = { x: cur.x + dxOut * r, y: cur.y + dyOut * r };
        parts.push(`L${num(beforeBend.x)} ${num(beforeBend.y)}`);
        parts.push(`Q${num(cur.x)} ${num(cur.y)} ${num(afterBend.x)} ${num(afterBend.y)}`);
    }
    return parts.join(' ');
}
