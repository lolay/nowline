// Gate-level regression check for container inline-date glyph overlap.
// Container glyphs (`after:DATE` / `before:DATE` on a group or parallel)
// sit in the header's title row, beside the title
// (specs/true-width-layout.md §3.3). Children paint after the container's
// own chrome, so a glyph that lands on a bar is hidden under it, and one
// that lands on the title cuts through it.
//
// The glyphs must clear the container's own title text, each other (a
// title wider than the container pushes the `before:` glyph right), and
// every item bar on the chart.
//
// Everything is read off the SVG the renderer actually paints, not the
// layout model: a regression gate that borrows the geometry under test
// would pass whenever that geometry is wrong in the same way. The one
// exception is a title's width, which only a browser can measure; it is
// bounded by the layout's pessimistic 0.58 em/char text estimate.
//
//   title   = first <text> among a container's own chrome
//   glyph   = <svg x y width height> inside each
//             <g data-layer="inline-date-pin"> of the same container
//   bar     = first <rect> of every <g data-layer="item"> on the chart
//   clear   = vertically disjoint, or at least CLEARANCE_PX of air between
//             the two horizontally
//
// A container's own chrome is everything painted before its first child
// entity (`renderContainer` paints the body, bracket, title and glyphs
// first), so a nested container's chrome is
// never attributed to its parent. Every `examples/*.nowline` and
// `tests/*.nowline` is laid out and rendered, so a new fixture is covered
// for free.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createNowlineServices, type NowlineFile, resolveIncludes } from '@nowline/core';
import { layoutRoadmap } from '@nowline/layout';
import { renderSvg } from '@nowline/renderer';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { FIXED_TODAY } from './snapshot.helpers.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SOURCE_DIRS = ['examples', 'tests'] as const;

/** Required air (px) between a glyph and the chrome it must clear. */
const CLEARANCE_PX = 4;

/** Slack (px) for the SVG's 0.01 px coordinate rounding: a glyph whose
 *  bottom edge meets a bar's top edge exactly still clears it. */
const ROUNDING_PX = 0.011;

/** Upper bound on a title's rendered width per character, in em. The
 *  layout's pessimistic text estimate; restated, not imported. */
const TITLE_EM_PER_CHAR = 0.58;

interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface PaintedContainer {
    kind: 'group' | 'parallel';
    id: string;
    /** Header title text, with its width bounded by the estimate. */
    title: (Rect & { text: string }) | undefined;
    glyphs: { side: string; rect: Rect }[];
}

interface PaintedBar {
    id: string;
    rect: Rect;
}

const services = createNowlineServices();

async function renderFile(absSource: string, tag: string): Promise<string> {
    const { shared, Nowline } = services;
    const text = await fs.readFile(absSource, 'utf-8');
    const uri = URI.parse(`memory:///container-glyph-clearance-${tag}.nowline`);
    const doc = shared.workspace.LangiumDocumentFactory.fromString<NowlineFile>(text, uri);
    await shared.workspace.DocumentBuilder.build([doc], { validation: true });
    const file = doc.parseResult.value;
    const resolved = await resolveIncludes(file, absSource, { services: Nowline });
    return renderSvg(layoutRoadmap(file, resolved, { theme: 'light', today: FIXED_TODAY }));
}

function attr(el: string, name: string): number {
    return Number(el.match(new RegExp(`(?:^|\\s)${name}="([^"]+)"`))?.[1]);
}

/** Box of a `<text>` from its `x`, baseline `y`, and `font-size`, spanning
 *  one em above the baseline and a quarter em below it. */
function titleRect(textTag: string, text: string): Rect & { text: string } {
    const x = attr(textTag, 'x');
    const baseline = attr(textTag, 'y');
    const size = attr(textTag, 'font-size');
    return {
        text,
        left: x,
        top: baseline - size,
        right: x + text.length * size * TITLE_EM_PER_CHAR,
        bottom: baseline + size / 4,
    };
}

/** Every `<g data-layer="group|parallel">` of a painted SVG, reduced to its own chrome. */
function paintedContainers(svg: string): PaintedContainer[] {
    const out: PaintedContainer[] = [];
    for (const open of svg.matchAll(/<g (?:data-id="([^"]*)" )?data-layer="(group|parallel)">/g)) {
        const kind = open[2] as 'group' | 'parallel';
        const start = (open.index ?? 0) + open[0].length;
        const rest = svg.slice(start);
        // The container's own chrome ends at its first child entity, or at
        // its own `</g>` when it has none painted.
        const firstChild = rest.search(
            /<g (?:data-id="[^"]*" )?data-layer="(?:item|group|parallel)"/,
        );
        let end = rest.length;
        let depth = 1;
        for (const m of rest.matchAll(/<g\b|<\/g>/g)) {
            depth += m[0] === '</g>' ? -1 : 1;
            if (depth === 0) {
                end = m.index ?? end;
                break;
            }
        }
        const own = rest.slice(0, firstChild >= 0 ? Math.min(firstChild, end) : end);
        const titleText = own.match(/(<text [^>]*>)([^<]*)<\/text>/);
        const glyphs = [
            ...own.matchAll(
                /<g [^>]*data-layer="inline-date-pin" data-side="(after|before)"[^>]*>(?:<title>[^<]*<\/title>)?(<svg [^>]*>)/g,
            ),
        ].map((m) => {
            const x = attr(m[2], 'x');
            const y = attr(m[2], 'y');
            return {
                side: m[1],
                rect: {
                    left: x,
                    top: y,
                    right: x + attr(m[2], 'width'),
                    bottom: y + attr(m[2], 'height'),
                },
            };
        });
        out.push({
            kind,
            id: open[1] ?? '(anonymous)',
            title: titleText ? titleRect(titleText[1], titleText[2]) : undefined,
            glyphs,
        });
    }
    return out;
}

/** The bar (first `<rect>`) of every `<g data-layer="item">` of a painted SVG. */
function paintedBars(svg: string): PaintedBar[] {
    return [
        ...svg.matchAll(
            /<g (?:data-id="([^"]*)" )?data-layer="item">(?:(?!<\/g>)[\s\S])*?(<rect [^>]*>)/g,
        ),
    ].map((m) => {
        const x = attr(m[2], 'x');
        const y = attr(m[2], 'y');
        return {
            id: m[1] ?? '(anonymous)',
            rect: {
                left: x,
                top: y,
                right: x + attr(m[2], 'width'),
                bottom: y + attr(m[2], 'height'),
            },
        };
    });
}

function clears(a: Rect, b: Rect): boolean {
    if (a.bottom <= b.top + ROUNDING_PX || b.bottom <= a.top + ROUNDING_PX) return true;
    return (
        a.left + ROUNDING_PX >= b.right + CLEARANCE_PX ||
        b.left + ROUNDING_PX >= a.right + CLEARANCE_PX
    );
}

async function sources(): Promise<{ dir: string; name: string }[]> {
    const out: { dir: string; name: string }[] = [];
    for (const dir of SOURCE_DIRS) {
        for (const name of (await fs.readdir(path.join(REPO_ROOT, dir))).sort()) {
            if (name.endsWith('.nowline')) out.push({ dir, name });
        }
    }
    return out;
}

describe('container inline-date glyph clearance', () => {
    it('reads containers, their chrome, and item bars off a painted SVG', () => {
        // Guards the parser itself: if the renderer's markup drifts so
        // that nothing matches, the fixture sweeps below would pass
        // vacuously instead of checking anything.
        const svg =
            '<g data-id="g" data-layer="group"><rect x="10" y="38" width="200" height="62"/>' +
            '<path d="M10 38 V33 H210 V38" fill="none" stroke="#475569"/>' +
            '<text font-size="10" x="26" y="30">Title</text>' +
            '<g data-date="2026-02-09" data-layer="inline-date-pin" data-side="after">' +
            '<title>2026-02-09</title><svg x="10" y="20.5" width="12" height="12"></svg></g>' +
            '<g data-id="a" data-layer="item"><rect x="16" y="40" width="50" height="56"/>' +
            '<path d="M0 0H1V1A1 1 0 0 1 0 1H0Z" fill="red"/></g></g>' +
            '<g data-id="p" data-layer="parallel">' +
            '<text font-size="10" x="104" y="198">Par</text>' +
            '<g data-date="2026-04-13" data-layer="inline-date-pin" data-side="before">' +
            '<title>2026-04-13</title><svg x="170" y="188" width="12" height="12"></svg></g>' +
            '<g data-layer="item"><circle cx="1" cy="1" r="1"/><rect x="106" y="200" width="80" height="56"/></g></g>';
        expect(paintedContainers(svg)).toEqual([
            {
                kind: 'group',
                id: 'g',
                title: {
                    text: 'Title',
                    left: 26,
                    top: 20,
                    right: 26 + 5 * 10 * 0.58,
                    bottom: 32.5,
                },
                glyphs: [
                    { side: 'after', rect: { left: 10, top: 20.5, right: 22, bottom: 32.5 } },
                ],
            },
            {
                kind: 'parallel',
                id: 'p',
                title: {
                    text: 'Par',
                    left: 104,
                    top: 188,
                    right: 104 + 3 * 10 * 0.58,
                    bottom: 200.5,
                },
                glyphs: [
                    { side: 'before', rect: { left: 170, top: 188, right: 182, bottom: 200 } },
                ],
            },
        ]);
        expect(paintedBars(svg)).toEqual([
            { id: 'a', rect: { left: 16, top: 40, right: 66, bottom: 96 } },
            { id: '(anonymous)', rect: { left: 106, top: 200, right: 186, bottom: 256 } },
        ]);
    });

    it('every container glyph clears its own chrome and the other glyph', async () => {
        const failures: string[] = [];
        let titleGlyphsChecked = 0;
        for (const { dir, name } of await sources()) {
            const svg = await renderFile(path.join(REPO_ROOT, dir, name), `${dir}-${name}`);
            for (const c of paintedContainers(svg)) {
                const where = `${dir}/${name} ${c.kind} ${c.id}`;
                for (const glyph of c.glyphs) {
                    if (c.title) {
                        titleGlyphsChecked++;
                        if (!clears(glyph.rect, c.title)) {
                            failures.push(
                                `${where}: ${glyph.side} glyph x=${glyph.rect.left}..${glyph.rect.right} ` +
                                    `overlaps title "${c.title.text}" x=${c.title.left}..${c.title.right}`,
                            );
                        }
                    }
                }
                const [a, b] = c.glyphs;
                if (a && b && !clears(a.rect, b.rect)) {
                    failures.push(
                        `${where}: ${a.side} glyph x=${a.rect.left}..${a.rect.right} overlaps ` +
                            `${b.side} glyph x=${b.rect.left}..${b.rect.right}`,
                    );
                }
            }
        }
        // `tests/inline-date-corners.nowline` carries pinned titled groups
        // and parallels; if none are found the sweep is not testing
        // anything.
        expect(titleGlyphsChecked).toBeGreaterThan(0);
        expect(failures).toEqual([]);
    }, 60_000);

    it('every container glyph clears every item bar', async () => {
        // Children paint after their container's chrome, so a glyph a bar
        // overlaps is hidden under it. Checked against every bar on the
        // chart, not just the container's children: a glyph pushed past
        // its box by a long title must not land under a neighbor either.
        const failures: string[] = [];
        let glyphsChecked = 0;
        for (const { dir, name } of await sources()) {
            const svg = await renderFile(path.join(REPO_ROOT, dir, name), `${dir}-${name}`);
            const bars = paintedBars(svg);
            for (const c of paintedContainers(svg)) {
                for (const glyph of c.glyphs) {
                    glyphsChecked++;
                    for (const bar of bars) {
                        if (clears(glyph.rect, bar.rect)) continue;
                        failures.push(
                            `${dir}/${name} ${c.kind} ${c.id}: ${glyph.side} glyph ` +
                                `(${glyph.rect.left}, ${glyph.rect.top})..(${glyph.rect.right}, ${glyph.rect.bottom}) ` +
                                `overlaps item ${bar.id} bar ` +
                                `(${bar.rect.left}, ${bar.rect.top})..(${bar.rect.right}, ${bar.rect.bottom})`,
                        );
                    }
                }
            }
        }
        expect(glyphsChecked).toBeGreaterThan(0);
        expect(failures).toEqual([]);
    }, 60_000);
});
