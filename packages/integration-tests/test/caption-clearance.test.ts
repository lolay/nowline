// Gate-level regression check for item-title / decoration overlap
// (lolay/nowline#59 follow-up). An in-bar item caption must stay clear of
// the decorations that share the bar's top band with the title's first
// line:
//
//   - RIGHT side: the status dot, the footnote digits and the `before:`
//     inline-date glyph (checked against the end of title line 1).
//   - LEFT side: the link tile and the `after:` inline-date glyph (checked
//     against where the caption starts, which every title line and the meta
//     line share).
//
// Layout has no font metrics, so the right-side check uses the same
// pessimistic per-character estimate layout itself uses (0.58 em per
// character). The arithmetic is deliberately restated here rather than
// imported from `@nowline/layout`: a regression gate that borrows the code
// under test would pass whenever that code is wrong in the same way. The
// caption's x is not in the layout model, so it is read off the SVG the
// renderer actually paints (the first title `<text>`, else the meta one).
//
//   captionX   = x of the painted caption (title line 1, else meta)
//   line1Right = captionX + len(line1) * 13 * 0.58
//   cluster    = leftmost of: dot left (R - 17), leftmost footnote digit left
//                (R - 22 - (n-1)*8 - digitWidth), `before:` glyph left
//   collision  = line1Right > clusterLeft - 4
//
//   linkTileRight = box.x + 6 + 14           (link tile drawn in the bar)
//   afterRight    = glyph x + 12             (`after:` glyph inside the bar)
//   collision     = captionX < max(linkTileRight, afterRight) + 4
//
// Only IN-BAR captions are checked; a spilled caption paints to the right
// of the bar, away from every decoration. Every `examples/*.nowline` and
// `tests/*.nowline` is laid out and rendered, so a new fixture is covered
// for free.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import {
    layoutRoadmap,
    type PositionedItem,
    type PositionedRoadmap,
    type PositionedSwimlane,
    type PositionedTrackChild,
} from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { FIXED_TODAY } from './snapshot.helpers.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SOURCE_DIRS = ['examples', 'tests'] as const;

/** Required air (px) between a caption and the decoration it must clear. */
const CLEARANCE_PX = 4;

/** The link tile spans `box.x + 6 .. box.x + 6 + 14` (inset 6, side 14). */
const LINK_TILE_RIGHT_OFFSET_PX = 6 + 14;

const services = createNowlineServices();

async function layoutFile(absSource: string, tag: string): Promise<PositionedRoadmap> {
    const { shared, Nowline } = services;
    const text = await fs.readFile(absSource, 'utf-8');
    const uri = URI.parse(`memory:///caption-clearance-${tag}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, absSource, { services: Nowline });
    return layoutRoadmap(file, resolved, { theme: 'light', today: FIXED_TODAY });
}

/**
 * `<g data-layer="item">` groups of a painted SVG, each closed at its OWN
 * `</g>` (an item nests the glyph's `<g>` inside it). The caption x is the
 * first title `<text>` (font-size 13), else the first meta one (11); the
 * key is the bar rect, which identifies the layout item it was painted from.
 */
function paintedCaptionXByBar(svg: string): Map<string, number | undefined> {
    const out = new Map<string, number | undefined>();
    for (const open of svg.matchAll(/<g (?:data-id="[^"]*" )?data-layer="item">/g)) {
        const start = open.index ?? 0;
        let end = -1;
        let depth = 0;
        for (const m of svg.slice(start).matchAll(/<g\b|<\/g>/g)) {
            depth += m[0] === '</g>' ? -1 : 1;
            if (depth === 0) {
                end = start + (m.index ?? 0) + m[0].length;
                break;
            }
        }
        const group = svg.slice(start, end);
        const rect = group.match(/<rect [^>]*>/)?.[0] ?? '';
        const attr = (el: string, name: string) =>
            Number(el.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1]);
        const key = barKey(attr(rect, 'x'), attr(rect, 'y'), attr(rect, 'width'));
        const texts = [...group.matchAll(/<text ([^>]*)>/g)].map((m) => m[1]);
        const caption =
            texts.find((t) => attr(t, 'font-size') === 13) ??
            texts.find((t) => attr(t, 'font-size') === 11);
        if (out.has(key)) throw new Error(`two painted items share the bar ${key}`);
        out.set(key, caption ? attr(caption, 'x') : undefined);
    }
    return out;
}

/** Rounded to hundredths, the precision the SVG writer keeps, so model and SVG keys agree. */
function barKey(x: number, y: number, width: number): string {
    return [x, y, width].map((n) => Math.round(n * 100)).join(',');
}

function* itemsOf(children: PositionedTrackChild[]): Generator<PositionedItem> {
    for (const child of children) {
        if (child.kind === 'item') yield child;
        else yield* itemsOf(child.children);
    }
}

function* lanesItems(lanes: PositionedSwimlane[]): Generator<PositionedItem> {
    for (const lane of lanes) {
        yield* itemsOf(lane.children);
        yield* lanesItems(lane.nested);
    }
}

function* allItems(model: PositionedRoadmap): Generator<PositionedItem> {
    yield* lanesItems(model.swimlanes);
    for (const region of model.includes) yield* lanesItems(region.nestedSwimlanes);
}

interface Overlap {
    title: string;
    line1: string;
    /** px by which line 1 (plus the clearance) passes the cluster's left edge. */
    over: number;
}

/** The first in-bar title line against the top-right cluster, or null when clear. */
function firstLineOverlap(item: PositionedItem, captionX: number): Overlap | null {
    if (item.textSpills) return null;
    const right = item.box.x + item.box.width;
    const line1 = item.titleLines?.[0] ?? item.title.split('\n')[0];
    const line1Right = captionX + line1.length * 13 * 0.58;

    let clusterLeft = Number.POSITIVE_INFINITY;
    if (!item.dotSpills) clusterLeft = Math.min(clusterLeft, right - 17);
    const footnotes = item.footnoteIndicators.length;
    if (footnotes > 0 && !item.footnoteSpills) {
        const digitW = String(item.footnoteIndicators[0]).length * 10 * 0.58;
        clusterLeft = Math.min(clusterLeft, right - 22 - (footnotes - 1) * 8 - digitW);
    }
    for (const pin of item.inlineDatePins ?? []) {
        if (pin.side === 'before' && !pin.spilled) {
            clusterLeft = Math.min(clusterLeft, pin.glyphTopLeft.x);
        }
    }
    const over = line1Right - (clusterLeft - CLEARANCE_PX);
    return over > 0 ? { title: item.title, line1, over } : null;
}

interface LeftOverlap {
    title: string;
    /** The decoration the caption starts under. */
    decoration: string;
    /** px by which the caption's start falls short of the decoration plus the clearance. */
    short: number;
}

/** The painted caption start against the top-left decorations, or null when clear. */
function leftOverlap(item: PositionedItem, captionX: number): LeftOverlap | null {
    if (item.textSpills) return null;
    const edges: { decoration: string; right: number }[] = [];
    if (item.linkIcon !== 'none' && !item.iconSpills) {
        edges.push({
            decoration: 'link tile',
            right: item.box.x + LINK_TILE_RIGHT_OFFSET_PX,
        });
    }
    for (const pin of item.inlineDatePins ?? []) {
        if (pin.side === 'after' && !pin.spilled) {
            edges.push({
                decoration: 'after: glyph',
                right: pin.glyphTopLeft.x + pin.glyphSize,
            });
        }
    }
    let worst: LeftOverlap | null = null;
    for (const edge of edges) {
        const short = edge.right + CLEARANCE_PX - captionX;
        if (short > 0 && (!worst || short > worst.short)) {
            worst = { title: item.title, decoration: edge.decoration, short };
        }
    }
    return worst;
}

interface FileScan {
    name: string;
    inBarItems: number;
    /** In-bar items that draw a link tile / an in-bar `after:` glyph (left-side coverage). */
    withLinkTile: number;
    withAfterGlyph: number;
    overlaps: Overlap[];
    leftOverlaps: LeftOverlap[];
}

const scans: FileScan[] = [];
for (const dir of SOURCE_DIRS) {
    const names = (await fs.readdir(path.join(REPO_ROOT, dir)))
        .filter((f) => f.endsWith('.nowline'))
        .sort();
    for (const name of names) {
        const model = await layoutFile(path.join(REPO_ROOT, dir, name), `${dir}-${name}`);
        const captionXs = paintedCaptionXByBar(await renderSvg(model));
        const scan: FileScan = {
            name: `${dir}/${name}`,
            inBarItems: 0,
            withLinkTile: 0,
            withAfterGlyph: 0,
            overlaps: [],
            leftOverlaps: [],
        };
        for (const item of allItems(model)) {
            if (item.textSpills) continue;
            scan.inBarItems += 1;
            if (item.linkIcon !== 'none' && !item.iconSpills) scan.withLinkTile += 1;
            if (item.inlineDatePins?.some((p) => p.side === 'after' && !p.spilled)) {
                scan.withAfterGlyph += 1;
            }
            const key = barKey(item.box.x, item.box.y, item.box.width);
            if (!captionXs.has(key)) {
                throw new Error(`${scan.name}: no painted item for ${JSON.stringify(item.title)}`);
            }
            const captionX = captionXs.get(key);
            // An in-bar item with no painted title or meta text has no caption to check.
            if (captionX === undefined) continue;
            const hit = firstLineOverlap(item, captionX);
            if (hit) scan.overlaps.push(hit);
            const left = leftOverlap(item, captionX);
            if (left) scan.leftOverlaps.push(left);
        }
        scans.push(scan);
    }
}

describe('item caption clearance of the bar decorations', () => {
    it('scans a meaningful number of in-bar items', () => {
        // Guards against the walk silently visiting nothing.
        const total = scans.reduce((n, s) => n + s.inBarItems, 0);
        expect(scans.length).toBeGreaterThan(20);
        expect(total).toBeGreaterThan(80);
    });

    it('covers the left side: in-bar link tiles and in-bar `after:` glyphs are really scanned', () => {
        // Without these the left-side check would pass vacuously.
        const tiles = scans.reduce((n, s) => n + s.withLinkTile, 0);
        const glyphs = scans.reduce((n, s) => n + s.withAfterGlyph, 0);
        expect(tiles).toBeGreaterThanOrEqual(3);
        expect(glyphs).toBeGreaterThanOrEqual(3);
    });

    for (const scan of scans) {
        it(`${scan.name}: no in-bar first title line runs under the dot, footnotes or before: glyph`, () => {
            const report = scan.overlaps.map(
                (o) => `${JSON.stringify(o.line1)} runs ${o.over.toFixed(1)}px into the cluster`,
            );
            expect(report).toEqual([]);
        });

        it(`${scan.name}: no in-bar caption starts under the link tile or the after: glyph`, () => {
            const report = scan.leftOverlaps.map(
                (o) =>
                    `${JSON.stringify(o.title)} starts ${o.short.toFixed(1)}px short of the ${o.decoration}`,
            );
            expect(report).toEqual([]);
        });
    }
});
